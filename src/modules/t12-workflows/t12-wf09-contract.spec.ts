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
      // Ensure no raw secret is stored
      expect(JSON.stringify(webhookNode)).not.toContain('secret-token');
      expect(JSON.stringify(webhookNode)).not.toContain('crm-automation-n8n');
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

      // 1. Missing header
      expect(() => guard.canActivate(createMockContext({}))).toThrow(
        UnauthorizedException,
      );

      // 2. Invalid header
      expect(() =>
        guard.canActivate(
          createMockContext({ 'x-n8n-api-key': 'invalid-secret-key-attacker' }),
        ),
      ).toThrow(UnauthorizedException);

      // 3. Empty header
      expect(() =>
        guard.canActivate(createMockContext({ 'x-n8n-api-key': '' })),
      ).toThrow(UnauthorizedException);

      // 4. Valid header
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

      // Verify that N8nWorkflowDispatchService allowlist maps N8N_WF09_WEBHOOK_URL to this path
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

  describe('Issue 3: Deduplication of Completion Notifications', () => {
    it('removes duplicate un-idempotent HTTP Request: Notify Owner from n8n nodes and connections', () => {
      const notifyNode = workflowJson.nodes.find(
        (n: any) => n.name === 'HTTP Request: Notify Owner',
      );
      expect(notifyNode).toBeUndefined();

      // Ensure HTTP Request: Save Pending Action Items routes directly to Code: Build Final Summary
      const actionItemsConnections =
        workflowJson.connections['HTTP Request: Save Pending Action Items'];
      expect(actionItemsConnections).toBeDefined();
      expect(actionItemsConnections.main[0][0].node).toBe(
        'Code: Build Final Summary',
      );

      // Ensure no dangling Notify Owner in connections
      expect(
        workflowJson.connections['HTTP Request: Notify Owner'],
      ).toBeUndefined();
    });
  });
});
