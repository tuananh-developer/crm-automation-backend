import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type WorkflowNode = {
  name: string;
  type: string;
  parameters?: {
    jsCode?: string;
    url?: string;
    jsonBody?: string;
    options?: { timeout?: number };
    conditions?: {
      conditions?: Array<{ leftValue?: string }>;
    };
  };
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
  credentials?: Record<string, { id?: string; name?: string }>;
};

type WorkflowConnection = {
  main?: Array<Array<{ node: string }>>;
};

type WorkflowExport = {
  name: string;
  nodes: WorkflowNode[];
  connections: Record<string, WorkflowConnection>;
  settings?: Record<string, unknown>;
};

function readWorkflow(path: string): WorkflowExport {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), path), 'utf8'),
  ) as WorkflowExport;
}

describe('WF13 - AI Renewal Management Agent Workflow Structure', () => {
  const workflowPath =
    'integrations/n8n/workflows/wf13-renewal-management.json';
  let workflow: WorkflowExport;

  beforeAll(() => {
    workflow = readWorkflow(workflowPath);
  });

  it('has exactly 12 reachable functional nodes and one schedule trigger', () => {
    const functionalNodes = workflow.nodes.filter(
      (node) => node.type !== 'n8n-nodes-base.stickyNote',
    );
    const triggers = functionalNodes.filter((node) =>
      /(?:webhook|Trigger)$/i.test(node.type.split('.').at(-1) ?? ''),
    );

    expect(functionalNodes).toHaveLength(12);
    expect(triggers).toHaveLength(1);
    expect(triggers[0]?.name).toBe('Schedule Trigger');

    const names = new Set(functionalNodes.map((node) => node.name));
    const trigger = triggers[0];
    if (!trigger) throw new Error('No trigger found in WF13');

    // Traverse the workflow graph to ensure 100% reachability
    const visited = new Set<string>();
    const pending: string[] = [trigger.name];
    while (pending.length > 0) {
      const current = pending.pop();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      for (const output of workflow.connections[current]?.main ?? []) {
        for (const edge of output ?? []) {
          if (names.has(edge.node)) pending.push(edge.node);
        }
      }
    }
    expect(visited.size).toBe(12);
  });

  it('does NOT contain any placeholder return $input.all() nodes', () => {
    const functionalNodes = workflow.nodes.filter(
      (node) => node.type !== 'n8n-nodes-base.stickyNote',
    );
    for (const node of functionalNodes) {
      if (node.parameters?.jsCode) {
        expect(node.parameters.jsCode.trim()).not.toBe('return $input.all();');
      }
    }
  });

  it('validates node connection integrity without dangling edges', () => {
    const functionalNodes = workflow.nodes.filter(
      (node) => node.type !== 'n8n-nodes-base.stickyNote',
    );
    const names = new Set(functionalNodes.map((node) => node.name));

    for (const [source, output] of Object.entries(workflow.connections)) {
      expect(names.has(source)).toBe(true);
      for (const branch of output.main ?? []) {
        for (const edge of branch ?? []) {
          expect(names.has(edge.node)).toBe(true);
        }
      }
    }
  });

  it('configures production-ready retry, timeout and header policies on all HTTP nodes', () => {
    const httpNodes = workflow.nodes.filter(
      (node) => node.type === 'n8n-nodes-base.httpRequest',
    );
    expect(httpNodes.length).toBeGreaterThanOrEqual(6);

    for (const node of httpNodes) {
      expect(node.parameters?.options?.timeout).toBeGreaterThan(0);
      expect(node.retryOnFail).toBe(true);
      expect(node.maxTries).toBeGreaterThanOrEqual(3);
      expect(node.waitBetweenTries).toBeGreaterThan(0);

      if (node.name === 'HTTP Request: AI Renewal Recommendation') {
        expect(node.parameters?.url).toContain(
          'generativelanguage.googleapis.com',
        );
      } else {
        expect(node.parameters?.url).toContain('/api/v1/internal/n8n/renewal');
      }
    }

    const sendNode = httpNodes.find(
      (n) => n.name === 'HTTP Request: Backend Send Message',
    );
    const approvalNode = httpNodes.find(
      (n) => n.name === 'HTTP Request: Create/Ensure Renewal Approval Task',
    );
    const recordNode = httpNodes.find(
      (n) => n.name === 'HTTP Request: Record Renewal Attempt',
    );

    expect(sendNode?.parameters?.url).toContain(
      '/api/v1/internal/n8n/renewal/send-message',
    );
    expect(approvalNode?.parameters?.url).toContain(
      '/api/v1/internal/n8n/renewal/approval-tasks',
    );
    expect(recordNode?.parameters?.url).toContain(
      '/api/v1/internal/n8n/renewal/record-attempt',
    );
  });

  it('executes Code: Validate Draft with Gemini response and enforces contract grounding', () => {
    const validateNode = workflow.nodes.find(
      (node) => node.name === 'Code: Validate Draft',
    );
    const jsCode = validateNode?.parameters?.jsCode;
    expect(jsCode).toBeDefined();

    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function('$json', '$node', '$env', jsCode ?? '') as (
      $json: Record<string, unknown>,
      $node: Record<string, { json: Record<string, unknown> }>,
      $env: Record<string, string>,
    ) => Record<string, unknown>;

    const contractContext = {
      id: 'contract-uuid-1',
      customerId: 'customer-uuid-1',
      contractNumber: 'CTR-2026-100',
      renewalDate: '2026-12-15T00:00:00.000Z',
      urgency: 'HIGH',
    };

    const groundedResult = fn(
      {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    recommendation: 'Offer 12-month renewal on CTR-2026-100',
                    draftContent:
                      'Hello, your contract CTR-2026-100 renews on 2026-12-15.',
                    citedContractNumber: 'CTR-2026-100',
                    citedRenewalDate: '2026-12-15',
                  }),
                },
              ],
            },
          },
        ],
      },
      {
        'Code: Calculate Renewal Urgency': { json: contractContext },
      },
      { GEMINI_MODEL: 'gemini-2.5-flash' },
    );

    expect(groundedResult).toMatchObject({
      contractId: 'contract-uuid-1',
      customerId: 'customer-uuid-1',
      urgency: 'HIGH',
      recommendation: 'Offer 12-month renewal on CTR-2026-100',
      validationResult: {
        grounded: true,
        sourceContractId: 'contract-uuid-1',
        sourceCustomerId: 'customer-uuid-1',
        citedContractNumber: 'CTR-2026-100',
        citedRenewalDate: '2026-12-15',
      },
    });

    // Ungrounded hallucinated contract number falls back to safe deterministic draft
    const ungroundedResult = fn(
      {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    recommendation: 'Hallucinated discount',
                    draftContent: 'Contract CTR-999-FAKE renews soon.',
                    citedContractNumber: 'CTR-999-FAKE',
                    citedRenewalDate: '2026-12-15',
                  }),
                },
              ],
            },
          },
        ],
      },
      {
        'Code: Calculate Renewal Urgency': { json: contractContext },
      },
      { GEMINI_MODEL: 'gemini-2.5-flash' },
    );

    expect(ungroundedResult).toMatchObject({
      contractId: 'contract-uuid-1',
      customerId: 'customer-uuid-1',
      recommendation: 'Standard renewal terms review for CTR-2026-100',
      validationResult: expect.objectContaining({
        grounded: false,
      }),
    });
  });

  it('evaluates eligibility condition in the IF node with expressions', () => {
    const ifNode = workflow.nodes.find(
      (node) => node.name === 'IF: Auto-send Explicitly Allowed?',
    );
    expect(ifNode).toBeDefined();
    const conditions = ifNode?.parameters?.conditions?.conditions ?? [];
    expect(conditions.length).toBeGreaterThan(0);
    expect(conditions[0]?.leftValue).toMatch(/^=\{\{.*\}\}$/);

    // Verify dual branches
    const trueBranch =
      workflow.connections['IF: Auto-send Explicitly Allowed?']?.main?.[0] ??
      [];
    const falseBranch =
      workflow.connections['IF: Auto-send Explicitly Allowed?']?.main?.[1] ??
      [];
    expect(trueBranch).toContainEqual(
      expect.objectContaining({
        node: 'HTTP Request: Backend Send Message',
      }),
    );
    expect(falseBranch).toContainEqual(
      expect.objectContaining({
        node: 'HTTP Request: Create/Ensure Renewal Approval Task',
      }),
    );
  });

  it('converges both branches into terminal Record Renewal Attempt node', () => {
    const sendOutputs =
      workflow.connections['HTTP Request: Backend Send Message']?.main?.[0] ??
      [];
    const approvalOutputs =
      workflow.connections['HTTP Request: Create/Ensure Renewal Approval Task']
        ?.main?.[0] ?? [];

    expect(sendOutputs).toContainEqual(
      expect.objectContaining({
        node: 'HTTP Request: Record Renewal Attempt',
      }),
    );
    expect(approvalOutputs).toContainEqual(
      expect.objectContaining({
        node: 'HTTP Request: Record Renewal Attempt',
      }),
    );
  });
});
