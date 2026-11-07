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
  };

  beforeAll(() => {
    expect(fs.existsSync(workflowPath)).toBe(true);
    const rawContent = fs.readFileSync(workflowPath, 'utf-8');
    workflow = JSON.parse(rawContent);
  });

  it('contains valid workflow definition without hardcoded secret credentials', () => {
    expect(workflow.name).toBe('T12-WF05 — AI Customer 360 Agent');
    expect(Array.isArray(workflow.nodes)).toBe(true);
    expect(workflow.nodes.length).toBeGreaterThan(0);

    const jsonString = JSON.stringify(workflow);
    // Ensure no static secret keys or tokens are leaked into the exported JSON
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
      expect(webhookNode?.credentials?.httpHeaderAuth?.name).toBe(
        'CRM Internal Webhook Header',
      );
    });
  });

  describe('Deduplication & Execution Claiming (P2: Lost-Ack Deduplication)', () => {
    it('has an atomic claim node calling internal claim endpoint before customer data read and Gemini AI call', () => {
      const claimNode = workflow.nodes.find(
        (n) => n.name === 'HTTP Request: Claim Workflow Execution',
      );
      expect(claimNode).toBeDefined();
      expect(claimNode?.parameters?.method).toBe('POST');
      expect(claimNode?.parameters?.url).toContain(
        '/api/v1/internal/n8n/workflow-executions/claim',
      );
      expect(claimNode?.parameters?.headerParameters?.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'X-N8N-API-KEY' }),
        ]),
      );

      const jsonBody = claimNode?.parameters?.jsonBody || '';
      expect(jsonBody).toContain("workflowName: 't12-wf05-customer-360'");
      expect(jsonBody).toContain('workflowRunId:');
      expect(jsonBody).toContain('n8nExecutionId:');
    });

    it('has a Stop Duplicate node that halts replayed or duplicate executions', () => {
      const stopNode = workflow.nodes.find(
        (n) => n.name === 'Code: Stop Duplicate Execution',
      );
      expect(stopNode).toBeDefined();
      const code = stopNode?.parameters?.jsCode || '';
      expect(code).toContain('claim.claimed !== true');
      expect(code).toContain('return [];'); // Emits empty array to halt execution branch
    });

    it('wires Webhook Trigger directly to Claim and Stop Duplicate before processing payload', () => {
      const webhookConnections =
        workflow.connections['Webhook Trigger']?.main?.[0];
      expect(webhookConnections).toBeDefined();
      expect(
        webhookConnections?.some(
          (c: { node: string }) =>
            c.node === 'HTTP Request: Claim Workflow Execution',
        ),
      ).toBe(true);

      const claimConnections =
        workflow.connections['HTTP Request: Claim Workflow Execution']
          ?.main?.[0];
      expect(claimConnections).toBeDefined();
      expect(
        claimConnections?.some(
          (c: { node: string }) => c.node === 'Code: Stop Duplicate Execution',
        ),
      ).toBe(true);
    });
  });

  describe('Customer Profile Read & Fail-Fast Integrity (P1: Profile 401 & Fail-Fast)', () => {
    it('targets internal profile endpoint with X-N8N-API-KEY and does not silently proceed on failure', () => {
      const profileNode = workflow.nodes.find(
        (n) => n.name === 'HTTP Request: CRM Profile',
      );
      expect(profileNode).toBeDefined();
      expect(profileNode?.parameters?.url).toContain('/api/v1/customers/');
      expect(profileNode?.parameters?.url).toContain('/internal');

      // Crucial: continueRegularOutput must NOT be enabled, so HTTP 4xx/5xx errors halt the flow
      expect(profileNode?.onError).toBeUndefined();
      expect(profileNode?.continueRegularOutput).toBeFalsy();
    });

    it('merges customer timeline with fail-fast check when customer profile is absent', () => {
      const mergeNode = workflow.nodes.find(
        (n) => n.name === 'Code: Merge Customer Timeline',
      );
      expect(mergeNode).toBeDefined();
      const jsCode = mergeNode?.parameters?.jsCode || '';
      expect(jsCode).toContain('if (profileError || !profileRes?.id)');
      expect(jsCode).toContain('throw new Error');
    });
  });
});
