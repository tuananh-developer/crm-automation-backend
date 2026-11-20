import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type WorkflowNode = {
  name: string;
  type: string;
  parameters?: {
    httpMethod?: string;
    path?: string;
    authentication?: string;
    responseMode?: string;
    method?: string;
    url?: string;
    sendBody?: boolean;
    sendHeaders?: boolean;
    headerParameters?: {
      parameters?: Array<{ name?: string; value?: string }>;
    };
    jsCode?: string;
    options?: { timeout?: number; responseCode?: string | number };
    conditions?: {
      conditions?: Array<{ leftValue?: string }>;
    };
  };
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
  onError?: string;
  credentials?: Record<string, { id?: string; name?: string }>;
};

type WorkflowConnection = {
  main?: Array<Array<{ node: string }>>;
};

type WorkflowExport = {
  name: string;
  nodes: WorkflowNode[];
  connections: Record<string, WorkflowConnection>;
};

type FollowUpDispatchFixture = {
  executionId: string;
  enrollmentId: string;
  stepId: string;
};

/* eslint-disable @typescript-eslint/no-implied-eval */
function runCodeNode(
  node: WorkflowNode,
  inputJson: Record<string, unknown>,
  nodeLookup: Record<string, Record<string, unknown>> = {},
  env: Record<string, string> = {},
): Array<{ json: Record<string, unknown> }> {
  const jsCode = node.parameters?.jsCode;
  if (!jsCode) {
    throw new Error(`Node ${node.name} has no jsCode`);
  }
  const fn = new Function('$input', '$', '$env', jsCode) as (
    input: { first: () => { json: Record<string, unknown> } },
    lookup: (name: string) => {
      first: () => { json: Record<string, unknown> };
    },
    environment: Record<string, string>,
  ) => Array<{ json: Record<string, unknown> }>;

  return fn(
    { first: () => ({ json: inputJson }) },
    (name: string) => ({
      first: () => ({ json: nodeLookup[name] ?? {} }),
    }),
    env,
  );
}

describe('T12-WF04 Follow-up Execution Workflow Contract (UC06)', () => {
  const workflowPath = resolve(
    process.cwd(),
    'integrations/n8n/workflows/uc06-follow-up-execution.json',
  );
  const fixturePath = resolve(
    process.cwd(),
    'integrations/n8n/fixtures/wf04-follow-up.dispatch.json',
  );

  let workflow: WorkflowExport;
  let fixture: FollowUpDispatchFixture;

  beforeAll(() => {
    workflow = JSON.parse(readFileSync(workflowPath, 'utf8')) as WorkflowExport;
    fixture = JSON.parse(
      readFileSync(fixturePath, 'utf8'),
    ) as FollowUpDispatchFixture;
  });

  function getNode(name: string): WorkflowNode {
    const found = workflow.nodes.find((node) => node.name === name);
    if (!found) {
      throw new Error(`Missing node: ${name}`);
    }
    return found;
  }

  it('has exactly 12 reachable functional nodes, one webhook trigger, and no direct SMTP node or leaked secrets', () => {
    expect(workflow.name).toBe('T12-WF04 — AI CRM Follow-up Agent');

    const functionalNodes = workflow.nodes.filter(
      (node) => node.type !== 'n8n-nodes-base.stickyNote',
    );
    expect(functionalNodes).toHaveLength(12);

    const triggers = functionalNodes.filter((node) =>
      /^(?:webhook|.*Trigger)$/i.test(node.type.split('.').at(-1) ?? ''),
    );
    expect(triggers).toHaveLength(1);
    expect(
      functionalNodes.some((node) => node.type === 'n8n-nodes-base.emailSend'),
    ).toBe(false);

    const names = new Set(functionalNodes.map((node) => node.name));
    const trigger = triggers[0];
    if (!trigger) throw new Error('No trigger found');

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
      if (node.type === 'n8n-nodes-base.webhook') {
        expect(node.parameters?.path).toBe('follow-up-execute');
        expect(node.parameters?.httpMethod).toBe('POST');
        expect(node.parameters?.authentication).toBe('headerAuth');
        expect(node.parameters?.responseMode).toBe('responseNode');
        expect(node.credentials?.httpHeaderAuth?.id).toBe(
          'CONFIGURE_AFTER_IMPORT',
        );
      }
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

    const serialized = JSON.stringify(workflow);
    expect(serialized).not.toMatch(/n8n_sec_[a-zA-Z0-9_-]{10,}/);
    expect(serialized).not.toMatch(/Bearer\s+[a-zA-Z0-9_.-]{20,}/);
  });

  it('calls the canonical internal communication send endpoint with an empty body and Idempotency-Key matching executionId', () => {
    const sendNode = getNode('HTTP Request: Backend Send Message');
    expect(sendNode.parameters?.method).toBe('POST');
    expect(sendNode.parameters?.sendBody).toBe(false);
    expect(sendNode.parameters?.url).toContain(
      '/api/v1/internal/communication/follow-ups/',
    );
    expect(sendNode.parameters?.url).toContain('/send');

    const headers = sendNode.parameters?.headerParameters?.parameters ?? [];
    expect(headers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'X-N8N-API-KEY',
          value: '={{ $env.N8N_API_KEY || $env.N8N_WEBHOOK_SECRET }}',
        }),
        expect.objectContaining({
          name: 'Idempotency-Key',
          value: '={{ $json.idempotencyKey }}',
        }),
      ]),
    );
  });

  it('validates dispatch requests, enforces X-N8N-API-KEY, and strips any caller-supplied message content before backend send', () => {
    const validateNode = getNode('Code: Validate Execution Request');
    const handoffNode = getNode('Code: Prepare Idempotent Send Handoff');

    const [valid] = runCodeNode(
      validateNode,
      {
        headers: { 'x-n8n-api-key': 'expected-secret' },
        body: {
          ...fixture,
          recipient: 'attacker@example.com',
          subject: 'Injected Subject',
          message: 'Injected Body',
        },
      },
      {},
      { N8N_API_KEY: 'expected-secret' },
    );

    expect(valid?.json).toEqual(
      expect.objectContaining({
        isValidRequest: true,
        statusCode: 200,
        validationError: null,
        executionId: fixture.executionId,
        enrollmentId: fixture.enrollmentId,
        stepId: fixture.stepId,
      }),
    );

    const [handoff] = runCodeNode(handoffNode, valid?.json ?? {});
    expect(handoff?.json).toEqual(
      expect.objectContaining({
        executionId: fixture.executionId,
        enrollmentId: fixture.enrollmentId,
        stepId: fixture.stepId,
        idempotencyKey: fixture.executionId,
      }),
    );
    expect(handoff?.json).not.toHaveProperty('recipient');
    expect(handoff?.json).not.toHaveProperty('subject');
    expect(handoff?.json).not.toHaveProperty('message');

    const [unauthorized] = runCodeNode(
      validateNode,
      {
        headers: { 'x-n8n-api-key': 'wrong-secret' },
        body: fixture,
      },
      {},
      { N8N_API_KEY: 'expected-secret' },
    );
    expect(unauthorized?.json).toEqual(
      expect.objectContaining({
        isValidRequest: false,
        statusCode: 401,
      }),
    );

    const [missingField] = runCodeNode(
      validateNode,
      {
        headers: { 'x-n8n-api-key': 'expected-secret' },
        body: {
          executionId: '',
          enrollmentId: fixture.enrollmentId,
          stepId: fixture.stepId,
        },
      },
      {},
      { N8N_API_KEY: 'expected-secret' },
    );
    expect(missingField?.json).toEqual(
      expect.objectContaining({
        isValidRequest: false,
        statusCode: 400,
      }),
    );
  });

  it('normalizes SENT, RETRYABLE_FAILURE, PERMANENT_FAILURE, and ambiguous UNKNOWN outcomes without allowing blind retries on UNKNOWN', () => {
    const normalizeNode = getNode('Code: Normalize Delivery Result');
    const formatFailureNode = getNode(
      'Code: Format Failure or Unknown Outcome',
    );
    const classifyErrorNode = getNode('Code: Classify Transport Error');

    const handoffContext = {
      executionId: fixture.executionId,
      enrollmentId: fixture.enrollmentId,
      stepId: fixture.stepId,
      idempotencyKey: fixture.executionId,
      correlationId: fixture.executionId,
    };
    const lookup = {
      'Code: Prepare Idempotent Send Handoff': handoffContext,
    };

    const [sent] = runCodeNode(
      normalizeNode,
      {
        success: true,
        deliveryStatus: 'SENT',
        providerMessageId: 'smtp-msg-1',
        error: null,
        retryable: false,
        idempotencyStatus: 'new',
      },
      lookup,
    );
    expect(sent?.json).toEqual(
      expect.objectContaining({
        success: true,
        deliveryStatus: 'SENT',
        providerMessageId: 'smtp-msg-1',
        retryable: false,
        executionId: fixture.executionId,
      }),
    );

    const [ambiguous] = runCodeNode(
      normalizeNode,
      {
        success: false,
        deliveryStatus: 'UNKNOWN',
        providerMessageId: null,
        error: 'DELIVERY_OUTCOME_UNKNOWN',
        retryable: true,
        idempotencyStatus: 'replayed',
      },
      lookup,
    );
    const [formattedAmbiguous] = runCodeNode(
      formatFailureNode,
      ambiguous?.json ?? {},
    );
    expect(formattedAmbiguous?.json).toEqual(
      expect.objectContaining({
        success: false,
        deliveryStatus: 'UNKNOWN',
        error: 'DELIVERY_OUTCOME_UNKNOWN',
        retryable: false,
        idempotencyStatus: 'replayed',
      }),
    );

    const [retryableFailure] = runCodeNode(
      normalizeNode,
      {
        success: false,
        deliveryStatus: 'RETRYABLE_FAILURE',
        providerMessageId: null,
        error: 'SMTP_CONNECT_FAILED',
        retryable: true,
        idempotencyStatus: 'new',
      },
      lookup,
    );
    const [formattedRetryable] = runCodeNode(
      formatFailureNode,
      retryableFailure?.json ?? {},
    );
    expect(formattedRetryable?.json).toEqual(
      expect.objectContaining({
        success: false,
        deliveryStatus: 'RETRYABLE_FAILURE',
        retryable: true,
      }),
    );

    const [transport404] = runCodeNode(
      classifyErrorNode,
      { statusCode: 404, message: 'Follow-up execution not found' },
      lookup,
    );
    expect(transport404?.json).toEqual(
      expect.objectContaining({
        success: false,
        deliveryStatus: 'PERMANENT_FAILURE',
        retryable: false,
        statusCode: 404,
      }),
    );

    const [transport423] = runCodeNode(
      classifyErrorNode,
      { statusCode: 423, message: 'Enrollment paused' },
      lookup,
    );
    expect(transport423?.json).toEqual(
      expect.objectContaining({
        success: false,
        deliveryStatus: 'RETRYABLE_FAILURE',
        retryable: true,
        statusCode: 423,
      }),
    );
  });
});
