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

function readFixture<T>(path: string): T {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), path), 'utf8'),
  ) as T;
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
        if (node.type === 'n8n-nodes-base.httpRequest') {
          expect(node.parameters?.options?.timeout).toBeGreaterThan(0);
          expect(node.retryOnFail).toBe(true);
          expect(node.maxTries).toBeGreaterThanOrEqual(3);
          expect(node.waitBetweenTries).toBeGreaterThan(0);
        }
        if (node.type === 'n8n-nodes-base.if') {
          const conditions = node.parameters?.conditions?.conditions ?? [];
          expect(conditions.length).toBeGreaterThan(0);
          for (const condition of conditions) {
            expect(condition.leftValue?.startsWith('={{')).toBe(true);
            expect(condition.leftValue?.endsWith('}}')).toBe(true);
          }
        }
      }
    },
  );

  it('provides synthetic trigger/request fixtures for all five owned workflows', () => {
    const wf01 = readFixture<{
      eventType: string;
      version: number;
      data: { leadId: string; workflowRunId: string };
    }>('integrations/n8n/fixtures/wf01-qualification.event.json');
    expect(wf01.eventType).toBe('lead.qualification.requested');
    expect(wf01.version).toBe(1);
    expect(wf01.data.leadId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(wf01.data.workflowRunId).toMatch(/^[0-9a-f-]{36}$/i);

    const wf08 = readFixture<{
      eventType: string;
      version: number;
      data: { workflowRunId: string; scope: string };
    }>('integrations/n8n/fixtures/wf08-data-cleaning.event.json');
    expect(wf08.eventType).toBe('data.cleaning.requested');
    expect(wf08.version).toBe(1);
    expect(wf08.data.scope).toBe('FILTER');
    expect(wf08.data.workflowRunId).toMatch(/^[0-9a-f-]{36}$/i);

    const wf10 = readFixture<{
      entityType: string;
      entityId: string;
      workflowRunId: string;
    }>('integrations/n8n/fixtures/wf10-next-best-action.request.json');
    expect(wf10.entityType).toBe('Lead');
    expect(wf10.entityId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(wf10.workflowRunId).toMatch(/^[0-9a-f-]{36}$/i);

    const wf11 = readFixture<{
      meetingId: string;
      workflowRunId: string;
      attendeeIds: string[];
      transcript: string;
      idempotencyKey: string;
    }>('integrations/n8n/fixtures/wf11-sales-meeting.dispatch.json');
    expect(wf11.meetingId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(wf11.workflowRunId).toBe(wf11.idempotencyKey);
    expect(wf11.attendeeIds.length).toBeGreaterThan(0);
    expect(wf11.transcript).toContain('jane@example.test');

    const wf12 = readFixture<{
      workflowRunId: string;
      customerId: string;
      requestedItems: Array<{ catalogItemId: string; quantity: number }>;
      currency: string;
    }>('integrations/n8n/fixtures/wf12-quote-proposal.dispatch.json');
    expect(wf12.workflowRunId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(wf12.customerId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(wf12.requestedItems).toEqual([
      expect.objectContaining({
        catalogItemId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        quantity: expect.any(Number),
      }),
    ]);
    expect(wf12.currency).toBe('VND');
  });

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
    const normalizer = handler.nodes.find(
      (node) => node.name === 'Code: Normalize Failure Event',
    )?.parameters?.jsCode ?? '';
    expect(normalizer).toContain('findWorkflowRunId(execution.data) || findWorkflowRunId(event.data)');
    expect(normalizer).toContain("['WF01','lead-qualification']");
    expect(normalizer).toContain("['WF08','UC10_DATA_CLEANING']");
    expect(handler.settings?.errorWorkflow).toBeUndefined();
  });

  it('passes the backend-redacted transcript returned by WF11 to Gemini', () => {
    const wf11 = readWorkflow(
      'integrations/n8n/workflows/t12-wf11-sales-meeting.json',
    );
    const builder = wf11.nodes.find(
      (node) => node.name === 'Code: Build Meeting Prompt',
    )?.parameters?.jsCode ?? '';
    expect(builder).toContain('transcript.redactedTranscript');
    expect(builder).toContain('Backend-redacted transcript is missing');
  });

  it('unwraps the nested backend entity for WF12 proposal context', () => {
    const wf12 = readWorkflow(
      'integrations/n8n/workflows/t12-wf12-quote-proposal.json',
    );
    const builder = wf12.nodes.find(
      (node) => node.name === 'Code: Normalize Requirements',
    )?.parameters?.jsCode ?? '';
    expect(builder).toContain('c.data?.entity||c.entity||c.data||c');
    expect(builder).toContain('sourceCustomer.companyName');
    expect(builder).toContain('sourceCustomer.companyWebsite');
  });

  it('preserves WF11 identifiers across the attendee-context HTTP node for downstream saves', () => {
    const wf11 = readWorkflow(
      'integrations/n8n/workflows/t12-wf11-sales-meeting.json',
    );
    const builder = wf11.nodes.find(
      (node) => node.name === 'Code: Build Meeting Prompt',
    )?.parameters?.jsCode ?? '';
    for (const field of ['meetingId', 'workflowRunId', 'transcriptId', 'attendeeIds']) {
      expect(builder).toContain(field);
    }
    const parse = wf11.nodes.find(
      (node) => node.name === 'Code: Parse and Validate Meeting Output',
    )?.parameters?.jsCode ?? '';
    expect(parse).toContain('new Set(p.attendeeIds)');
    for (const name of [
      'HTTP Request: Save Meeting Summary',
      'HTTP Request: Save Meeting Action Items',
      'HTTP Request: Notify Owner and Attendees',
    ]) {
      const node = wf11.nodes.find((item) => item.name === name);
      expect(node?.parameters?.jsonBody).toContain('workflowRunId');
      expect(node?.parameters?.jsonBody).toContain('n8nExecutionId');
    }
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

  it('keeps WF10 AI context free of free-form CRM explanations and labels', () => {
    const workflow = readWorkflow(
      'integrations/n8n/workflows/t12-wf10-next-best-action.json',
    );
    const builder = workflow.nodes.find(
      (node) => node.name === 'Code: Generate Candidate Actions',
    )?.parameters?.jsCode ?? '';
    for (const field of [
      'qualification.reason',
      'qualification.intent',
      'score.reason',
      'sequenceName',
      'segmentName',
      'subject',
      'content',
    ]) {
      expect(builder).not.toContain(field);
    }
    expect(builder).toContain('qualificationStatus');
    expect(builder).toContain('scoreLabel');
    expect(builder).toContain('sequenceId');
    expect(builder).toContain('segmentId');
  });

  it('routes WF10 approval using the backend policy and forwards the execution identity', () => {
    const workflow = readWorkflow(
      'integrations/n8n/workflows/t12-wf10-next-best-action.json',
    );
    const condition = workflow.nodes.find(
      (node) => node.name === 'IF: Human Approval Required',
    )?.parameters?.conditions?.conditions?.[0]?.leftValue;
    expect(condition).toContain('requiresHumanApproval');

    const callback = workflow.nodes.find(
      (node) => node.name === 'Code: Validate Action',
    )?.parameters?.jsCode ?? '';
    expect(callback).toContain('n8nExecutionId:String($exec.id)');

    const review = workflow.nodes.find(
      (node) => node.name === 'HTTP Request: Create Review and Notification',
    );
    expect(review?.parameters?.jsonBody).toContain('n8nExecutionId: String($exec.id)');

    const trueBranch =
      workflow.connections['IF: Human Approval Required']?.main?.[0] ?? [];
    expect(trueBranch).toContainEqual(
      expect.objectContaining({
        node: 'HTTP Request: Create Review and Notification',
      }),
    );
  });

  it('keeps the WF12 catalog lease heartbeat URL inside one n8n expression', () => {
    const wf12 = readWorkflow(
      'integrations/n8n/workflows/t12-wf12-quote-proposal.json',
    );
    const catalogUrl = wf12.nodes.find(
      (node) => node.name === 'HTTP Request: Get Product and Pricing Catalog',
    )?.parameters?.url;
    expect(catalogUrl).toContain('&n8nExecutionId=');
    expect(catalogUrl).toMatch(/^=\{=?.*\}\}$/);
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
