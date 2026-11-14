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
    wf = JSON.parse(raw);
  });

  it('contains valid workflow metadata and nodes', () => {
    expect(wf.name).toBe('WF15 - Account Management');
    expect(Array.isArray(wf.nodes)).toBe(true);
    expect(wf.nodes.length).toBe(22);
  });

  it('has valid connections where every target node exists', () => {
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
  });

  it('configures Node 2 to fetch strategic accounts using canonical endpoint', () => {
    const node2 = wf.nodes.find(
      (n) => n.name === '2. Fetch Strategic Accounts',
    );
    expect(node2).toBeDefined();
    expect(node2?.parameters?.url).toContain(
      '/api/v1/customers?isStrategic=true',
    );
    expect(node2?.parameters?.nodeCredentialType).toBe('httpHeaderAuth');
  });

  it('configures Node 3 to filter strategic customers from both wrapped and flat structures', () => {
    const node3 = wf.nodes.find(
      (n) => n.name === '3. Validate Strategic Accounts',
    );
    expect(node3).toBeDefined();
    const code = node3?.parameters?.jsCode || '';

    // Run Node 3 jsCode in VM
    const runNode3 = (inputPayload: unknown) => {
      const context = {
        $input: {
          first: () => ({ json: inputPayload }),
        },
      };
      vm.createContext(context);
      return vm.runInContext(`(() => { ${code} })()`, context);
    };

    // Test with Paginated response: { data: [...] }
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
    expect(filteredPaginated[0].json.id).toBe('c1');
    expect(filteredPaginated[1].json.id).toBe('c3');

    // Test with flat array: [{ isStrategic: true }, ...]
    const flatInput = [
      { id: 'c4', isStrategic: true },
      { id: 'c5', isStrategic: false },
    ];
    const filteredFlat = runNode3(flatInput);
    expect(filteredFlat).toHaveLength(1);
    expect(filteredFlat[0].json.id).toBe('c4');
  });

  describe('Node 10: Normalize Account Data', () => {
    let node10Code: string;

    beforeAll(() => {
      const node10 = wf.nodes.find(
        (n) => n.name === '10. Normalize Account Data',
      );
      expect(node10).toBeDefined();
      node10Code = node10?.parameters?.jsCode || '';
    });

    it('does NOT contain hardcoded metrics (80, 70, 90, 85)', () => {
      expect(node10Code).not.toContain('engagement: 80');
      expect(node10Code).not.toContain('feedback: 70');
      expect(node10Code).not.toContain('openIssues: 90');
      expect(node10Code).not.toContain('followUpCompletion: 85');
    });

    const executeNode10 = (mocks: {
      profile?: unknown;
      interactions?: unknown;
      followUp?: unknown;
      feedback?: unknown;
      issues?: unknown;
    }) => {
      const nodeMap: Record<string, { first: () => { json: unknown } }> = {
        '5. Fetch Customer Profile': {
          first: () => ({ json: mocks.profile ?? { id: 'cust-uuid' } }),
        },
        '6. Fetch Customer Interactions': {
          first: () => ({ json: mocks.interactions }),
        },
        '7. Fetch Follow-up History': {
          first: () => ({ json: mocks.followUp }),
        },
        '8. Fetch Feedback History': {
          first: () => ({ json: mocks.feedback }),
        },
        '9. Fetch Open Issues and Renewals': {
          first: () => ({ json: mocks.issues }),
        },
      };

      const context = {
        $: (nodeName: string) => nodeMap[nodeName],
        $json: mocks.profile ?? { id: 'cust-uuid' },
      };
      vm.createContext(context);
      const result = vm.runInContext(`(() => { ${node10Code} })()`, context);
      return result[0].json;
    };

    it('calculates metrics dynamically from actual evidence', () => {
      const output = executeNode10({
        profile: { id: 'cust-1', name: 'Strategic Account' },
        interactions: [
          { id: 'i1', type: 'MEETING' },
          { id: 'i2', type: 'CALL' },
          { id: 'i3', type: 'EMAIL' },
        ],
        feedback: [{ score: 90 }, { score: 80 }],
        issues: {
          issues: [
            { id: 'iss1', status: 'RESOLVED', resolvedAt: '2026-10-01' },
          ],
        },
        followUp: [
          { id: 'e1', status: 'COMPLETED' },
          { id: 'e2', status: 'COMPLETED' },
        ],
      });

      expect(output.customerId).toBe('cust-1');
      expect(output.engagement).toBeGreaterThan(0);
      expect(output.feedback).toBe(85); // (90 + 80) / 2
      expect(output.openIssues).toBe(100); // 0 open issues
      expect(output.followUpCompletion).toBe(100);
      expect(output.evidence.length).toBeGreaterThanOrEqual(4);
    });

    it('inversely scores open issues so more open issues decreases health metric', () => {
      const outputZeroIssues = executeNode10({
        profile: { id: 'cust-1' },
        interactions: [{ id: 'i1' }],
        feedback: [{ score: 80 }],
        issues: {
          issues: [
            { id: 'iss1', status: 'RESOLVED', resolvedAt: '2026-10-01' },
          ],
        },
        followUp: [{ id: 'e1', status: 'COMPLETED' }],
      });

      const outputMultipleIssues = executeNode10({
        profile: { id: 'cust-2' },
        interactions: [{ id: 'i1' }],
        feedback: [{ score: 80 }],
        issues: {
          issues: [
            { id: 'iss1', status: 'OPEN' },
            { id: 'iss2', status: 'IN_PROGRESS' },
            { id: 'iss3', status: 'PENDING' },
          ],
        },
        followUp: [{ id: 'e1', status: 'COMPLETED' }],
      });

      expect(outputZeroIssues.openIssues).toBe(100);
      expect(outputMultipleIssues.openIssues).toBe(25); // 100 - 3 * 25
      expect(Number(outputZeroIssues.openIssues)).toBeGreaterThan(
        Number(outputMultipleIssues.openIssues),
      );
    });

    it('propagates null for missing data without fabricating default scores', () => {
      const output = executeNode10({
        profile: { id: 'cust-missing' },
        interactions: null, // missing
        feedback: [], // empty
        issues: null, // missing
        followUp: null, // missing
      });

      expect(output.engagement).toBeNull();
      expect(output.feedback).toBeNull();
      expect(output.openIssues).toBeNull();
      expect(output.followUpCompletion).toBeNull();
    });

    it('produces different metrics for different customers based on their evidence', () => {
      const customerA = executeNode10({
        profile: { id: 'cust-A' },
        interactions: [{ id: 'i1' }],
        feedback: [{ score: 95 }],
        issues: { issues: [] },
        followUp: [{ id: 'e1', status: 'COMPLETED' }],
      });

      const customerB = executeNode10({
        profile: { id: 'cust-B' },
        interactions: [{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }, { id: 'i4' }],
        feedback: [{ score: 60 }],
        issues: { issues: [{ id: 'iss1', status: 'OPEN' }] },
        followUp: [{ id: 'e1', status: 'FAILED' }],
      });

      expect(customerA.feedback).not.toEqual(customerB.feedback);
      expect(customerA.engagement).not.toEqual(customerB.engagement);
      expect(customerA.openIssues).not.toEqual(customerB.openIssues);
      expect(customerA.followUpCompletion).not.toEqual(
        customerB.followUpCompletion,
      );
    });
  });

  describe('Node 11: Validate Data Coverage', () => {
    let node11Code: string;

    beforeAll(() => {
      const node11 = wf.nodes.find(
        (n) => n.name === '11. Validate Data Coverage',
      );
      expect(node11).toBeDefined();
      node11Code = node11?.parameters?.jsCode || '';
    });

    const executeNode11 = (input: unknown) => {
      const context = { $json: input };
      vm.createContext(context);
      return vm.runInContext(`(() => { ${node11Code} })()`, context)[0].json;
    };

    it('marks hasSufficientData as true when all metrics are present', () => {
      const output = executeNode11({
        customerId: 'c1',
        engagement: 80,
        feedback: 75,
        openIssues: 100,
        followUpCompletion: 90,
      });

      expect(output.hasSufficientData).toBe(true);
      expect(output.missingData).toHaveLength(0);
    });

    it('identifies missing metrics and marks hasSufficientData as false', () => {
      const output = executeNode11({
        customerId: 'c2',
        engagement: 80,
        feedback: null,
        openIssues: null,
        followUpCompletion: 90,
      });

      expect(output.hasSufficientData).toBe(false);
      expect(output.missingData).toEqual(['feedback', 'openIssues']);
    });
  });

  it('calls Backend Account Health calculate API in Node 12', () => {
    const node12 = wf.nodes.find(
      (n) => n.name === '12. Call Backend Account Health API',
    );
    expect(node12).toBeDefined();
    expect(node12?.parameters?.url).toContain(
      '/api/v1/account-health/calculate',
    );
    expect(node12?.parameters?.nodeCredentialType).toBe('httpHeaderAuth');
  });

  it('routes INSUFFICIENT_DATA to error handler in Node 13', () => {
    const conn13 = wf.connections['13. Check Account Health Result'];
    expect(conn13).toBeDefined();
    expect(conn13.main).toBeDefined();
    // Branch 0 goes to AI Explanation (valid), Branch 1 goes to Handle Errors
    expect(conn13.main?.[0]?.[0]?.node).toBe('14. Call AI Explanation');
    expect(conn13.main?.[1]?.[0]?.node).toBe('21. Handle Errors');
  });

  it('validates AI output and actions with Backend in Nodes 15 and 16', () => {
    const node15 = wf.nodes.find((n) => n.name === '15. Validate AI JSON');
    expect(node15?.parameters?.url).toContain(
      '/api/v1/account-health/validate-ai-output',
    );

    const node16 = wf.nodes.find(
      (n) => n.name === '16. Validate Actions and Evidence',
    );
    expect(node16?.parameters?.url).toContain(
      '/api/v1/account-health/validate-actions',
    );
  });

  it('notifies account owner using internal notification API in Node 20', () => {
    const node20 = wf.nodes.find((n) => n.name === '20. Notify Account Owner');
    expect(node20?.parameters?.url).toContain(
      '/api/v1/notifications/internal/create',
    );
  });
});
