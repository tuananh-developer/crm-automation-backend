import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as vm from 'node:vm';

interface WorkflowNode {
  name: string;
  type: string;
  parameters?: {
    jsCode?: string;
    url?: string;
    jsonBody?: string;
    authentication?: string;
    nodeCredentialType?: string;
    messages?: {
      values?: Array<{ role?: string; content?: string }>;
    };
  };
  id: string;
}

interface WorkflowExport {
  name: string;
  nodes: WorkflowNode[];
  connections: Record<string, { main?: Array<Array<{ node: string }>> }>;
}

describe('WF15 Account Management Workflow Contract', () => {
  let wf: WorkflowExport;

  beforeAll(() => {
    const raw = readFileSync(
      resolve(
        process.cwd(),
        'integrations/n8n/workflows/wf15-account-management.json',
      ),
      'utf8',
    );
    wf = JSON.parse(raw) as WorkflowExport;
  });

  it('contains exactly 12 reachable functional nodes and one weekly schedule trigger', () => {
    expect(wf.name).toBe('WF15 - Account Management');
    const functionalNodes = wf.nodes.filter(
      (n) => n.type !== 'n8n-nodes-base.stickyNote',
    );
    expect(functionalNodes).toHaveLength(12);

    const triggers = functionalNodes.filter((n) =>
      /^(?:webhook|.*Trigger)$/i.test(n.type.split('.').at(-1) ?? ''),
    );
    expect(triggers).toHaveLength(1);
    const trigger = triggers[0];
    if (!trigger) throw new Error('Missing schedule trigger');
    expect(trigger.name).toBe('1. Weekly Schedule');

    const names = new Set(functionalNodes.map((n) => n.name));
    const visited = new Set<string>();
    const queue = [trigger.name];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      for (const branch of wf.connections[current]?.main ?? []) {
        for (const edge of branch ?? []) {
          if (names.has(edge.node)) queue.push(edge.node);
        }
      }
    }
    expect(visited.size).toBe(12);
  });

  it('has valid connections where every target node exists and SplitInBatches Done output is not looped back', () => {
    const nodeNames = new Set(wf.nodes.map((n) => n.name));
    for (const [sourceNode, conn] of Object.entries(wf.connections)) {
      expect(nodeNames.has(sourceNode)).toBe(true);
      if (conn.main) {
        for (const branch of conn.main) {
          for (const target of branch) {
            expect(nodeNames.has(target.node)).toBe(true);
          }
        }
      }
    }

    const splitConnections = wf.connections['4. Split Out Accounts']?.main;
    expect(splitConnections?.[0]?.[0]?.node).toBe(
      '5. Fetch Account Health Context',
    );
    // Output 1 (Done) must not loop back to Split Out Accounts
    expect(splitConnections?.[1] ?? []).toHaveLength(0);

    // Per-item processing branches must return to 4. Split Out Accounts
    const riskIfConnections =
      wf.connections['10. Check Risk or Opportunity']?.main;
    expect(riskIfConnections?.[0]?.[0]?.node).toBe('11. Create Retention Task');
    expect(riskIfConnections?.[1]?.[0]?.node).toBe('4. Split Out Accounts');

    const notifyConnections = wf.connections['12. Notify Account Owner']?.main;
    expect(notifyConnections?.[0]?.[0]?.node).toBe('4. Split Out Accounts');
  });

  it('configures Node 2 to fetch strategic accounts using N8N-authenticated internal endpoint', () => {
    const node2 = wf.nodes.find(
      (n) => n.name === '2. Fetch Strategic Accounts',
    );
    expect(node2).toBeDefined();
    expect(node2?.parameters?.url).toContain(
      '/api/v1/internal/n8n/account-health/customers?isStrategic=true',
    );
    expect(node2?.parameters?.nodeCredentialType).toBe('httpHeaderAuth');
  });

  it('configures Node 3 to extract and filter strategic customers from paginated { data, meta } and flat structures', () => {
    const node3 = wf.nodes.find(
      (n) => n.name === '3. Validate Strategic Accounts',
    );
    expect(node3).toBeDefined();
    const code = node3?.parameters?.jsCode || '';

    const runNode3 = (inputPayload: unknown) => {
      const context = {
        $input: {
          all: () => [{ json: inputPayload }],
          first: () => ({ json: inputPayload }),
        },
      };
      vm.createContext(context);
      return vm.runInContext(`(() => { ${code} })()`, context) as Array<{
        json: { id: string; isStrategic: boolean | string };
      }>;
    };

    const paginatedInput = {
      data: [
        { id: 'c1', isStrategic: true },
        { id: 'c2', isStrategic: false },
        { id: 'c3', isStrategic: 'true' },
      ],
      meta: { total: 3 },
    };
    const filteredPaginated = runNode3(paginatedInput);
    expect(filteredPaginated).toHaveLength(2);
    expect(filteredPaginated[0]?.json.id).toBe('c1');
    expect(filteredPaginated[1]?.json.id).toBe('c3');

    const flatInput = [
      { id: 'c4', isStrategic: true },
      { id: 'c5', isStrategic: false },
    ];
    const filteredFlat = runNode3(flatInput);
    expect(filteredFlat).toHaveLength(1);
    expect(filteredFlat[0]?.json.id).toBe('c4');
  });

  describe('Node 6: Normalize Account Data', () => {
    let node6Code: string;

    beforeAll(() => {
      const node6 = wf.nodes.find(
        (n) => n.name === '6. Normalize Account Data',
      );
      expect(node6).toBeDefined();
      node6Code = node6?.parameters?.jsCode || '';
    });

    it('does NOT contain hardcoded metrics (80, 70, 90, 85) or count ACTIVE enrollments as 50%', () => {
      expect(node6Code).not.toContain('engagement: 80');
      expect(node6Code).not.toContain('feedback: 70');
      expect(node6Code).not.toContain('openIssues: 90');
      expect(node6Code).not.toContain('followUpCompletion: 85');
      expect(node6Code).not.toContain('active * 0.5');
    });

    const executeNode6 = (mocks: {
      customer?: Record<string, unknown>;
      interactions?: unknown;
      followUps?: unknown;
      feedback?: unknown;
      issues?: unknown;
    }) => {
      const customerObj = mocks.customer ?? {
        id: 'cust-uuid',
        name: 'Strategic Account',
        createdBy: 'owner-uuid-1',
      };
      const nodeMap: Record<string, { first: () => { json: unknown } }> = {
        '4. Split Out Accounts': {
          first: () => ({ json: customerObj }),
        },
      };

      const context = {
        $: (nodeName: string) => nodeMap[nodeName],
        $json: {
          customer: customerObj,
          interactions: mocks.interactions,
          followUps: mocks.followUps,
          feedback: mocks.feedback,
          issues: mocks.issues,
        },
      };
      vm.createContext(context);
      const result = vm.runInContext(
        `(() => { ${node6Code} })()`,
        context,
      ) as Array<{
        json: {
          customerId: string;
          ownerId: string | null;
          engagement: number | null;
          feedback: number | null;
          openIssues: number | null;
          followUpCompletion: number | null;
          evidence: string[];
          missingData: string[];
          hasSufficientData: boolean;
        };
      }>;
      const first = result[0];
      if (!first) throw new Error('Expected normalized item');
      return first.json;
    };

    it('calculates metrics dynamically from actual evidence and normalizes 1-5 ratings to 0-100', () => {
      const output = executeNode6({
        customer: {
          id: 'cust-1',
          name: 'Strategic Account',
          createdBy: 'owner-1',
        },
        interactions: [
          { id: 'i1', type: 'MEETING' },
          { id: 'i2', type: 'CALL' },
          { id: 'i3', type: 'EMAIL' },
        ],
        feedback: [{ rating: 4 }, { rating: 5 }], // (80 + 100) / 2 = 90
        issues: [{ id: 'iss1', status: 'RESOLVED', resolvedAt: '2026-10-01' }],
        followUps: [
          {
            id: 'e1',
            status: 'ACTIVE',
            executions: [
              { id: 'ex1', status: 'COMPLETED' },
              { id: 'ex2', status: 'PENDING' },
            ],
          },
        ],
      });

      expect(output.customerId).toBe('cust-1');
      expect(output.ownerId).toBe('owner-1');
      expect(output.engagement).toBe(75);
      expect(output.feedback).toBe(90);
      expect(output.openIssues).toBe(100);
      expect(output.followUpCompletion).toBe(50); // 1 completed out of 2 eligible executions
      expect(Array.isArray(output.evidence)).toBe(true);
      expect(output.evidence.length).toBe(4);
      expect(output.hasSufficientData).toBe(true);
      expect(output.missingData).toHaveLength(0);
    });

    it('inversely scores open issues so more open issues decreases health metric', () => {
      const outputZeroIssues = executeNode6({
        customer: { id: 'cust-1' },
        interactions: [{ id: 'i1' }],
        feedback: [{ score: 80 }],
        issues: [{ id: 'iss1', status: 'RESOLVED', resolvedAt: '2026-10-01' }],
        followUps: [{ id: 'e1', status: 'COMPLETED' }],
      });

      const outputMultipleIssues = executeNode6({
        customer: { id: 'cust-2' },
        interactions: [{ id: 'i1' }],
        feedback: [{ score: 80 }],
        issues: [
          { id: 'iss1', status: 'OPEN' },
          { id: 'iss2', status: 'IN_PROGRESS' },
          { id: 'iss3', status: 'PENDING' },
        ],
        followUps: [{ id: 'e1', status: 'COMPLETED' }],
      });

      expect(outputZeroIssues.openIssues).toBe(100);
      expect(outputMultipleIssues.openIssues).toBe(25); // 100 - 3 * 25
    });

    it('excludes WF15-created RETENTION tasks and operational workflow tasks from openIssues so weekly runs do not feedback-degrade health', () => {
      const baselineWithoutRetentionTask = executeNode6({
        customer: { id: 'cust-1' },
        interactions: [{ id: 'i1' }],
        feedback: [{ score: 85 }],
        issues: [
          {
            id: 'iss-real-1',
            taskType: 'FEEDBACK_ESCALATION',
            status: 'OPEN',
          },
        ],
        followUps: [{ id: 'e1', status: 'COMPLETED' }],
      });

      const withWf15RetentionTasks = executeNode6({
        customer: { id: 'cust-1' },
        interactions: [{ id: 'i1' }],
        feedback: [{ score: 85 }],
        issues: [
          {
            id: 'iss-real-1',
            taskType: 'FEEDBACK_ESCALATION',
            status: 'OPEN',
          },
          {
            id: 'wf15-ret-1',
            taskType: 'RETENTION',
            status: 'OPEN',
            sourceEntityType: 'AccountHealthSnapshot',
            idempotencyKey: 'cust-1:account-health:snap-1',
          },
          {
            id: 'wf13-ren-1',
            taskType: 'RENEWAL_APPROVAL',
            status: 'OPEN',
          },
        ],
        followUps: [{ id: 'e1', status: 'COMPLETED' }],
      });

      expect(baselineWithoutRetentionTask.openIssues).toBe(75);
      expect(withWf15RetentionTasks.openIssues).toBe(75);
    });

    it('propagates null for missing data and marks hasSufficientData as false', () => {
      const output = executeNode6({
        customer: { id: 'cust-missing' },
        interactions: null,
        feedback: [],
        issues: null,
        followUps: null,
      });

      expect(output.engagement).toBeNull();
      expect(output.feedback).toBeNull();
      expect(output.openIssues).toBeNull();
      expect(output.followUpCompletion).toBeNull();
      expect(output.hasSufficientData).toBe(false);
      expect(output.missingData).toEqual([
        'engagement',
        'feedback',
        'openIssues',
        'followUpCompletion',
      ]);
    });
  });

  describe('Node 9: Parse AI Output & Validate Actions', () => {
    it('validates typed actions with evidence references and derives hasRiskOrOpportunity', () => {
      const node9 = wf.nodes.find(
        (n) => n.name === '9. Parse AI Output & Validate Actions',
      );
      expect(node9).toBeDefined();
      const code = node9?.parameters?.jsCode || '';

      const runNode9 = (
        normJson: Record<string, unknown>,
        healthJson: Record<string, unknown>,
        aiJson: unknown,
      ) => {
        const nodeMap: Record<string, { first: () => { json: unknown } }> = {
          '6. Normalize Account Data': { first: () => ({ json: normJson }) },
          '7. Call Backend Account Health API': {
            first: () => ({ json: healthJson }),
          },
        };
        const context = {
          $: (name: string) => nodeMap[name],
          $json: aiJson,
        };
        vm.createContext(context);
        const res = vm.runInContext(`(() => { ${code} })()`, context) as Array<{
          json: {
            hasRiskOrOpportunity: boolean;
            recommendedActions: Array<{ type: string }>;
            taskTitle?: string;
            ownerId?: string;
          };
        }>;
        const first = res[0];
        if (!first) throw new Error('Expected parsed item');
        return first.json;
      };

      const atRiskOutput = runNode9(
        {
          customerId: 'cust-1',
          customerName: 'Acme Strategic',
          ownerId: 'owner-1',
        },
        {
          id: 'snap-1',
          snapshotId: 'snap-1',
          score: 45,
          status: 'AT_RISK',
          evidence: ['Open issues metric: 25/100'],
        },
        {
          message: {
            content: JSON.stringify({
              summary: 'Account has 3 unresolved issues.',
              hasRiskOrOpportunity: true,
              recommendedActions: [
                {
                  type: 'CREATE_RETENTION_TASK',
                  evidence: [{ customerId: 'cust-1', snapshotId: 'snap-1' }],
                },
                {
                  type: 'INVALID_ACTION',
                  evidence: [{ customerId: 'cust-1', snapshotId: 'snap-1' }],
                },
              ],
            }),
          },
        },
      );

      expect(atRiskOutput.hasRiskOrOpportunity).toBe(true);
      expect(atRiskOutput.recommendedActions).toHaveLength(1);
      expect(atRiskOutput.recommendedActions[0]?.type).toBe(
        'CREATE_RETENTION_TASK',
      );
      expect(atRiskOutput.taskTitle).toContain('Acme Strategic');
      expect(atRiskOutput.ownerId).toBe('owner-1');

      const insufficientOutput = runNode9(
        { customerId: 'cust-2', customerName: 'No Data Corp' },
        { score: 0, status: 'INSUFFICIENT_DATA' },
        {},
      );
      expect(insufficientOutput.hasRiskOrOpportunity).toBe(false);
    });
  });

  it('uses valid prompt expression in Node 8 and canonical backend contracts in Nodes 7, 11, and 12', () => {
    const node7 = wf.nodes.find(
      (n) => n.name === '7. Call Backend Account Health API',
    );
    expect(node7?.parameters?.url).toContain(
      '/api/v1/internal/n8n/account-health/calculate',
    );
    expect(node7?.parameters?.jsonBody).toContain('evidence: $json.evidence');

    const node8 = wf.nodes.find((n) => n.name === '8. Call AI Explanation');
    const promptContent =
      node8?.parameters?.messages?.values?.[0]?.content ?? '';
    expect(promptContent).not.toContain('${{');
    expect(promptContent).toContain('recommendedActions');

    const node11 = wf.nodes.find((n) => n.name === '11. Create Retention Task');
    expect(node11?.parameters?.url).toContain('/api/v1/customer-tasks');
    expect(node11?.parameters?.jsonBody).toContain('title: $json.taskTitle');

    const node12 = wf.nodes.find((n) => n.name === '12. Notify Account Owner');
    expect(node12?.parameters?.url).toContain(
      '/api/v1/notifications/internal/create',
    );
    expect(node12?.parameters?.jsonBody).toContain('userId:');
  });
});
