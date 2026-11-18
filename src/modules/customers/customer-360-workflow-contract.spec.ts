import * as fs from 'fs';
import * as path from 'path';

describe('T12-WF05 Customer 360 Workflow Contract', () => {
  const workflowPath = path.resolve(
    process.cwd(),
    'integrations/n8n/workflows/t12-wf05-customer-360.json',
  );

  let workflow: {
    name: string;
    nodes: Array<Record<string, any>>;
    connections: Record<string, any>;
    settings?: Record<string, any>;
  };

  beforeAll(() => {
    expect(fs.existsSync(workflowPath)).toBe(true);
    const rawContent = fs.readFileSync(workflowPath, 'utf-8');
    workflow = JSON.parse(rawContent);
  });

  it('conforms to the 12-functional-node T12 blueprint with one trigger and no leaked secrets', () => {
    expect(workflow.name).toBe('T12-WF05 — AI Customer 360 Agent');
    const functionalNodes = workflow.nodes.filter(
      (n) => n.type !== 'n8n-nodes-base.stickyNote',
    );
    expect(functionalNodes).toHaveLength(12);

    const triggers = functionalNodes.filter((node) =>
      /(?:webhook|Trigger)$/i.test(String(node.type).split('.').at(-1) ?? ''),
    );
    expect(triggers).toHaveLength(1);

    const jsonString = JSON.stringify(workflow);
    expect(jsonString).not.toMatch(/n8n_sec_[a-zA-Z0-9_-]{10,}/);
    expect(jsonString).not.toMatch(/Bearer\s+[a-zA-Z0-9_.-]{20,}/);
    expect(jsonString).not.toContain('test-n8n-secret');
  });

  describe('Webhook Ingress Security (P1: Webhook Auth)', () => {
    it('enforces headerAuth on the Webhook trigger node with CRM Internal Webhook Header credential', () => {
      const webhookNode = workflow.nodes.find(
        (n) => n.type === 'n8n-nodes-base.webhook',
      );
      expect(webhookNode).toBeDefined();
      expect(webhookNode?.parameters?.path).toBe('t12-wf05-customer-360');
      expect(webhookNode?.parameters?.httpMethod).toBe('POST');
      expect(webhookNode?.parameters?.authentication).toBe('headerAuth');
      expect(webhookNode?.credentials?.httpHeaderAuth?.id).toBe(
        'CONFIGURE_AFTER_IMPORT',
      );
      expect(webhookNode?.credentials?.httpHeaderAuth?.name).toBe(
        'CRM Internal Webhook Header',
      );
    });
  });

  describe('Atomic Execution Claiming & Deduplication (P2: Lost-Ack Deduplication)', () => {
    it('claims the WorkflowRun atomically in CRM Profile node before downstream reads or Gemini AI calls', () => {
      const profileNode = workflow.nodes.find(
        (n) => n.name === 'HTTP Request: CRM Profile',
      );
      expect(profileNode).toBeDefined();
      expect(profileNode?.parameters?.method).toBe('POST');
      expect(profileNode?.parameters?.url).toContain('/360/claim-and-profile');
      expect(profileNode?.parameters?.headerParameters?.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'X-N8N-API-KEY' }),
        ]),
      );
      expect(profileNode?.parameters?.jsonBody).toContain('workflowRunId:');
      expect(profileNode?.parameters?.jsonBody).toContain('n8nExecutionId:');

      // Must fail fast (no continueRegularOutput) so 401/404/409 aborts before downstream work
      expect(profileNode?.onError).toBeUndefined();
      expect(profileNode?.retryOnFail).toBe(true);
      expect(profileNode?.maxTries).toBeGreaterThanOrEqual(3);
    });

    it('wires Webhook Trigger -> Validate Customer Request -> CRM Profile claim-and-profile', () => {
      const webhookConnections =
        workflow.connections['Webhook Trigger']?.main?.[0];
      expect(webhookConnections).toContainEqual(
        expect.objectContaining({ node: 'Code: Validate Customer Request' }),
      );

      const validateConnections =
        workflow.connections['Code: Validate Customer Request']?.main?.[0];
      expect(validateConnections).toContainEqual(
        expect.objectContaining({ node: 'HTTP Request: CRM Profile' }),
      );
    });
  });

  describe('Customer Sources, Fail-Fast Integrity & Feedback Auth', () => {
    it('requests customer feedback history with X-N8N-API-KEY from the canonical route', () => {
      const feedbackNode = workflow.nodes.find(
        (n) => n.name === 'HTTP Request: Get Issue/Feedback History',
      );
      expect(feedbackNode).toBeDefined();
      expect(feedbackNode?.parameters?.method).toBe('GET');
      expect(feedbackNode?.parameters?.url).toContain('/feedback');
      expect(feedbackNode?.parameters?.headerParameters?.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'X-N8N-API-KEY' }),
        ]),
      );
    });

    it('merges customer timeline with fail-fast check on missing profile or lost claim lease', () => {
      const mergeNode = workflow.nodes.find(
        (n) => n.name === 'Code: Merge Customer Timeline',
      );
      expect(mergeNode).toBeDefined();
      const jsCode = mergeNode?.parameters?.jsCode || '';
      expect(jsCode).toContain('if (profileError || !profileRes?.id)');
      expect(jsCode).toContain('getErrorStatus(segmentsRes) === 409');
      expect(jsCode).toContain('throw new Error');
      expect(jsCode).toContain('feedbackList');
    });
  });

  describe('Lease Renewal, Fencing & Terminal Callback Error Handling', () => {
    it('renews execution lease in Get Segment Memberships before Gemini AI synthesis', () => {
      const segmentsNode = workflow.nodes.find(
        (n) => n.name === 'HTTP Request: Get Segment Memberships',
      );
      expect(segmentsNode).toBeDefined();
      expect(segmentsNode?.parameters?.url).toContain('workflowRunId=');
      expect(segmentsNode?.parameters?.url).toContain('&n8nExecutionId=');
    });

    it('passes n8nExecutionId in Save Snapshot callback and does not swallow callback errors', () => {
      const saveSnapshotNode = workflow.nodes.find(
        (n) => n.name === 'HTTP Request: Save Snapshot',
      );
      expect(saveSnapshotNode).toBeDefined();
      expect(saveSnapshotNode?.parameters?.jsonBody).toContain(
        'n8nExecutionId:',
      );
      // Terminal callback must NOT use continueRegularOutput so 401/409/500/timeouts enter Error Handler
      expect(saveSnapshotNode?.onError).toBeUndefined();
      expect(saveSnapshotNode?.continueRegularOutput).toBeFalsy();
      expect(saveSnapshotNode?.retryOnFail).toBe(true);
      expect(saveSnapshotNode?.maxTries).toBeGreaterThanOrEqual(3);
      expect(saveSnapshotNode?.parameters?.options?.timeout).toBeGreaterThan(0);
    });

    it('configures T12 Shared Error Handler for workflow failure recovery', () => {
      expect(workflow.settings?.errorWorkflow).toBe('T12 Shared Error Handler');
    });
  });
});
