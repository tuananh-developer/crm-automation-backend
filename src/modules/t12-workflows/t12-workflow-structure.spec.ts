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
  };
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
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

const workflows = [
  'integrations/n8n/workflows/uc02-ai-lead-qualification.json',
  'integrations/n8n/workflows/uc10-ai-crm-data-cleaning.json',
  'integrations/n8n/workflows/t12-wf10-next-best-action.json',
  'integrations/n8n/workflows/t12-wf11-sales-meeting.json',
  'integrations/n8n/workflows/t12-wf12-quote-proposal.json',
];

function readWorkflow(path: string): WorkflowExport {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), path), 'utf8'),
  ) as WorkflowExport;
}

describe('Tuấn Anh T12 workflow exports', () => {
  it.each(workflows)(
    '%s has exactly 12 reachable functional nodes and one trigger',
    (path) => {
      const workflow = readWorkflow(path);
      const functionalNodes = workflow.nodes.filter(
        (node) => node.type !== 'n8n-nodes-base.stickyNote',
      );
      const triggers = functionalNodes.filter((node) =>
        /(?:webhook|Trigger)$/i.test(node.type.split('.').at(-1) ?? ''),
      );
      expect(functionalNodes).toHaveLength(12);
      expect(triggers).toHaveLength(1);

      const names = new Set(functionalNodes.map((node) => node.name));
      const trigger = triggers[0];
      if (!trigger) throw new Error(`No trigger found in ${path}`);
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

      for (const [source, output] of Object.entries(workflow.connections)) {
        expect(names.has(source)).toBe(true);
        for (const branch of output.main ?? []) {
          for (const edge of branch ?? []) {
            expect(names.has(edge.node)).toBe(true);
          }
        }
      }

      for (const node of functionalNodes) {
        if (node.type !== 'n8n-nodes-base.httpRequest') continue;
        expect(node.parameters?.options?.timeout).toBeGreaterThan(0);
        expect(node.retryOnFail).toBe(true);
        expect(node.maxTries).toBeGreaterThanOrEqual(3);
        expect(node.waitBetweenTries).toBeGreaterThan(0);
      }
    },
  );

  it('uses a separate shared Error Trigger workflow with a sanitized failure callback', () => {
    const handler = readWorkflow(
      'integrations/n8n/workflows/t12-error-handler.json',
    );
    expect(
      handler.nodes.some(
        (node) => node.type === 'n8n-nodes-base.errorTrigger',
      ),
    ).toBe(true);
    const callback = handler.nodes.find(
      (node) => node.name === 'HTTP Request: Record Workflow Failure',
    );
    expect(callback?.parameters?.url).toContain('/workflow-executions/failure');
    expect(callback?.parameters?.jsonBody).toContain('errorCategory');
    expect(callback?.parameters?.jsonBody).not.toContain('error.message');
    expect(handler.settings?.errorWorkflow).toBeUndefined();
  });

  it('keeps execution identity in the WF10 and WF11 lease-renewing context URLs', () => {
    const wf10 = readWorkflow(
      'integrations/n8n/workflows/t12-wf10-next-best-action.json',
    );
    const wf11 = readWorkflow(
      'integrations/n8n/workflows/t12-wf11-sales-meeting.json',
    );
    const wf10Url = wf10.nodes.find(
      (node) => node.name === 'HTTP Request: Get Follow-up and Segment Context',
    )?.parameters?.url;
    const wf11Url = wf11.nodes.find(
      (node) => node.name === 'HTTP Request: Get CRM Attendee Context',
    )?.parameters?.url;
    expect(wf10Url).toContain('&n8nExecutionId=');
    expect(wf11Url).toContain('?n8nExecutionId=');
    expect(wf10Url).toMatch(/^=\{=?.*\}\}$/);
    expect(wf11Url).toMatch(/^=\{=?.*\}\}$/);
  });

  it('keeps direct contact identifiers and free-form communication content out of AI prompts', () => {
    const checks = [
      [
        'integrations/n8n/workflows/uc02-ai-lead-qualification.json',
        'Code: Normalize Qualification Input',
      ],
      [
        'integrations/n8n/workflows/t12-wf10-next-best-action.json',
        'Code: Generate Candidate Actions',
      ],
      [
        'integrations/n8n/workflows/t12-wf11-sales-meeting.json',
        'Code: Build Meeting Prompt',
      ],
      [
        'integrations/n8n/workflows/t12-wf12-quote-proposal.json',
        'Code: Normalize Requirements',
      ],
      [
        'integrations/n8n/workflows/uc10-ai-crm-data-cleaning.json',
        'Code: Build Duplicate and AI Context',
      ],
    ] as const;

    for (const [path, name] of checks) {
      const workflow = readWorkflow(path);
      const node = workflow.nodes.find((item) => item.name === name);
      expect(node?.parameters?.jsCode).toBeDefined();
      const code = node?.parameters?.jsCode ?? '';
      expect(code).not.toMatch(
        /(?:lead|sourceProfile|sourceCustomer|meeting\.(?:lead|customer|attendees))\.(?:email|phone|firstName|lastName|name)\b/i,
      );
      if (path.endsWith('uc10-ai-crm-data-cleaning.json')) {
        expect(code).not.toMatch(/l\.(?:firstName|lastName|email|phone)\b/);
      }
    }
  });
});
