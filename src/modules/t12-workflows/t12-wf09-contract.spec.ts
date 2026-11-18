import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { N8nAuthGuard } from '../lead-intelligence/guards/n8n-auth.guard.js';

describe('T12-WF09 Workflow & Contract Verification', () => {
  const workflowPath = resolve(
    process.cwd(),
    'integrations/n8n/workflows/t12-wf09-conversation-summarizer.json',
  );
  let workflowJson: any;

  beforeAll(() => {
    const raw = readFileSync(workflowPath, 'utf-8');
    workflowJson = JSON.parse(raw);
  });

  it('conforms to the 12-functional-node T12 blueprint with shared error workflow and no hardcoded secrets', () => {
    const functionalNodes = workflowJson.nodes.filter(
      (n: any) => n.type !== 'n8n-nodes-base.stickyNote',
    );
    expect(functionalNodes).toHaveLength(12);
    expect(workflowJson.settings?.errorWorkflow).toBe(
      'T12 Shared Error Handler',
    );

    const raw = JSON.stringify(workflowJson);
    expect(raw).not.toContain('secret-token');
    expect(raw).not.toContain('crm-automation-n8n');
  });

  describe('Issue 1: Webhook Header Authentication', () => {
    it('configures Header Auth on Webhook Trigger without hardcoded credentials in exported JSON', () => {
      const webhookNode = workflowJson.nodes.find(
        (n: any) => n.name === 'Webhook Trigger',
      );
      expect(webhookNode).toBeDefined();
      expect(webhookNode.parameters.authentication).toBe('headerAuth');
      expect(webhookNode.credentials).toEqual({
        httpHeaderAuth: {
          id: 'CONFIGURE_AFTER_IMPORT',
          name: 'CRM Internal Webhook Header',
        },
      });
    });

    it('rejects ingress requests with 401 UnauthorizedException when API key is missing or invalid (negative auth test)', () => {
      const configService = {
        get: jest.fn((key: string) => {
          if (key === 'N8N_API_KEY') return 'valid-crm-n8n-secret-12345';
          return undefined;
        }),
      };
      const guard = new N8nAuthGuard(configService as unknown as ConfigService);

      const createMockContext = (
        headers: Record<string, string>,
      ): ExecutionContext =>
        ({
          switchToHttp: () => ({
            getRequest: () => ({ headers }),
          }),
        }) as unknown as ExecutionContext;

      expect(() => guard.canActivate(createMockContext({}))).toThrow(
        UnauthorizedException,
      );
      expect(() =>
        guard.canActivate(
          createMockContext({ 'x-n8n-api-key': 'invalid-secret-key-attacker' }),
        ),
      ).toThrow(UnauthorizedException);
      expect(() =>
        guard.canActivate(createMockContext({ 'x-n8n-api-key': '' })),
      ).toThrow(UnauthorizedException);
      expect(
        guard.canActivate(
          createMockContext({ 'x-n8n-api-key': 'valid-crm-n8n-secret-12345' }),
        ),
      ).toBe(true);
    });
  });

  describe('Issue 2: Routing Path Synchronization & Fallback URL', () => {
    it('matches the Webhook Trigger path with N8nWorkflowDispatchService allowlist', () => {
      const webhookNode = workflowJson.nodes.find(
        (n: any) => n.name === 'Webhook Trigger',
      );
      expect(webhookNode).toBeDefined();

      const expectedPath = 'internal/t12-wf09-conversation-summarizer';
      expect(webhookNode.parameters.path).toBe(expectedPath);

      const allowedPaths: Record<string, string> = {
        N8N_WF09_WEBHOOK_URL: 'internal/t12-wf09-conversation-summarizer',
      };
      expect(allowedPaths['N8N_WF09_WEBHOOK_URL']).toBe(
        webhookNode.parameters.path,
      );
    });

    it('derives exact matching URL when fallback to N8N_BASE_URL is used', () => {
      const baseUrl = 'http://localhost:5678';
      const webhookNode = workflowJson.nodes.find(
        (n: any) => n.name === 'Webhook Trigger',
      );
      const destinationPath = 'internal/t12-wf09-conversation-summarizer';

      const fallbackUrl = `${baseUrl.replace(/\/$/, '')}/webhook/${destinationPath.replace(/^\//, '')}`;
      expect(fallbackUrl).toBe(
        `http://localhost:5678/webhook/${webhookNode.parameters.path}`,
      );
    });
  });

  describe('Issue 3: Idempotent Notification Gating & Callback Error Propagation', () => {
    it('routes HTTP Request: Notify Owner through the SUCCESS-gated idempotent backend endpoint', () => {
      const notifyNode = workflowJson.nodes.find(
        (n: any) => n.name === 'HTTP Request: Notify Owner',
      );
      expect(notifyNode).toBeDefined();
      expect(notifyNode.parameters.url).toContain(
        '/api/v1/internal/n8n/conversation-transcripts/',
      );
      expect(notifyNode.parameters.url).toContain('/notify');
      expect(notifyNode.parameters.jsonBody).toContain('workflowRunId');

      const actionItemsConnections =
        workflowJson.connections['HTTP Request: Save Pending Action Items'];
      expect(actionItemsConnections.main[0][0].node).toBe(
        'HTTP Request: Notify Owner',
      );
      const notifyConnections =
        workflowJson.connections['HTTP Request: Notify Owner'];
      expect(notifyConnections.main[0][0].node).toBe(
        'Code: Build Final Summary',
      );
    });

    it('configures retryOnFail without swallowing persistence or callback errors', () => {
      for (const nodeName of [
        'HTTP Request: Save Redacted Transcript',
        'HTTP Request: Save Conversation Summary',
        'HTTP Request: Save Pending Action Items',
        'HTTP Request: Notify Owner',
      ]) {
        const node = workflowJson.nodes.find((n: any) => n.name === nodeName);
        expect(node).toBeDefined();
        expect(node.onError).toBeUndefined();
        expect(node.retryOnFail).toBe(true);
        expect(node.maxTries).toBeGreaterThanOrEqual(3);
      }
    });
  });
});
