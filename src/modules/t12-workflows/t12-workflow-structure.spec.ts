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
});
