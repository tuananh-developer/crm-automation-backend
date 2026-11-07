import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workflows = [
  'integrations/n8n/workflows/uc02-ai-lead-qualification.json',
  'integrations/n8n/workflows/uc10-ai-crm-data-cleaning.json',
  'integrations/n8n/workflows/t12-wf10-next-best-action.json',
  'integrations/n8n/workflows/t12-wf11-sales-meeting.json',
  'integrations/n8n/workflows/t12-wf12-quote-proposal.json',
];

describe('Tuấn Anh T12 workflow exports', () => {
  it.each(workflows)('%s has exactly 12 reachable functional nodes and one trigger', (path) => {
    const workflow = JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8'));
    const functionalNodes = workflow.nodes.filter(
      (node: { type: string }) => node.type !== 'n8n-nodes-base.stickyNote',
    );
    const triggers = functionalNodes.filter((node: { type: string }) =>
      /(?:webhook|Trigger)$/i.test(node.type.split('.').at(-1) ?? ''),
    );
    expect(functionalNodes).toHaveLength(12);
    expect(triggers).toHaveLength(1);

    const names = new Set(functionalNodes.map((node: { name: string }) => node.name));
    const visited = new Set<string>();
    const pending: string[] = [triggers[0].name];
    while (pending.length > 0) {
      const current = pending.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const output of workflow.connections[current]?.main ?? []) {
        for (const edge of output ?? []) if (names.has(edge.node)) pending.push(edge.node);
      }
    }
    expect(visited.size).toBe(12);
    for (const [source, output] of Object.entries(workflow.connections)) {
      expect(names.has(source)).toBe(true);
      for (const branch of (output as { main?: Array<Array<{node:string}>> }).main ?? []) {
        for (const edge of branch ?? []) expect(names.has(edge.node)).toBe(true);
      }
    }
  });

  it('uses a separate shared Error Trigger workflow with a sanitized failure callback', () => {
    const handler = JSON.parse(readFileSync(
      resolve(process.cwd(), 'integrations/n8n/workflows/t12-error-handler.json'),
      'utf8',
    ));
    expect(handler.nodes.some((node: { type: string }) =>
      node.type === 'n8n-nodes-base.errorTrigger',
    )).toBe(true);
    const callback = handler.nodes.find((node: { name: string }) =>
      node.name === 'HTTP Request: Record Workflow Failure',
    );
    expect(callback.parameters.url).toContain('/workflow-executions/failure');
    expect(callback.parameters.jsonBody).toContain('errorCategory');
    expect(callback.parameters.jsonBody).not.toContain('error.message');
    expect(handler.settings.errorWorkflow).toBeUndefined();
  });

  it('does not reference direct contact identifiers in the four AI prompt builders', () => {
    const checks = [
      ['integrations/n8n/workflows/uc02-ai-lead-qualification.json', 'Code: Normalize Qualification Input'],
      ['integrations/n8n/workflows/t12-wf10-next-best-action.json', 'Code: Generate Candidate Actions'],
      ['integrations/n8n/workflows/t12-wf11-sales-meeting.json', 'Code: Build Meeting Prompt'],
      ['integrations/n8n/workflows/t12-wf12-quote-proposal.json', 'Code: Normalize Requirements'],
    ];
    for (const [path, name] of checks) {
      const workflow = JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8'));
      const node = workflow.nodes.find((item: { name: string }) => item.name === name);
      expect(node).toBeDefined();
      expect(node.parameters.jsCode).not.toMatch(
        /(?:lead|sourceProfile|sourceCustomer|meeting\.(?:lead|customer|attendees))\.(?:email|phone|firstName|lastName|name)\b/i,
      );
    }
  });
});
