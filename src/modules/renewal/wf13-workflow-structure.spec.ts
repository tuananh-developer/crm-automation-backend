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
      expect(node.parameters?.url).toContain('/api/v1/internal/n8n/renewal');
    }
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
