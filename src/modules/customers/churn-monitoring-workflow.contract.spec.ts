import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Repository } from 'typeorm';
import { CustomersService } from './customers.service.js';
import {
  InternalChurnController,
  InternalCustomerTasksController,
} from './internal-churn.controller.js';
import type { Customer } from './entities/customer.entity.js';
import type { CustomerSegment } from './entities/customer-segment.entity.js';
import type { Segment } from './entities/segment.entity.js';
import { CustomerChurnAssessment } from './entities/customer-churn-assessment.entity.js';
import { CustomerTask } from './entities/customer-task.entity.js';
import { Lead } from '../leads/entities/lead.entity.js';
import { Interaction } from '../leads/entities/interaction.entity.js';
import { LeadFollowUpEnrollment } from '../follow-up/entities/lead-follow-up-enrollment.entity.js';
import { FollowUpExecution } from '../follow-up/entities/follow-up-execution.entity.js';
import { ExecutionStatus } from '../follow-up/enums/follow-up.enum.js';

type WorkflowNode = {
  name: string;
  type: string;
  parameters?: {
    url?: string;
    method?: string;
    jsCode?: string;
    jsonBody?: string;
    options?: { timeout?: number };
    conditions?: {
      conditions?: Array<{ leftValue?: string; rightValue?: unknown }>;
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
};

/* eslint-disable @typescript-eslint/no-implied-eval */
function runCodeNode(
  node: WorkflowNode,
  inputJson: Record<string, unknown>,
  nodeLookup: Record<string, Record<string, unknown>> = {},
  executionId = 'exec-wf06-1',
): Array<{ json: Record<string, unknown> }> {
  const jsCode = node.parameters?.jsCode;
  if (!jsCode) {
    throw new Error(`Node ${node.name} has no jsCode`);
  }
  const fn = new Function('$input', '$', '$execution', jsCode) as (
    input: { first: () => { json: Record<string, unknown> } },
    lookup: (name: string) => {
      first: () => { json: Record<string, unknown> };
    },
    execution: { id: string },
  ) => Array<{ json: Record<string, unknown> }>;

  return fn(
    { first: () => ({ json: inputJson }) },
    (name: string) => ({
      first: () => ({ json: nodeLookup[name] ?? {} }),
    }),
    { id: executionId },
  );
}

describe('T12-WF06 Churn Monitoring Workflow Contract & Controller Integration', () => {
  const workflowPath = resolve(
    process.cwd(),
    'integrations/n8n/workflows/wf06-churn-monitoring.json',
  );

  let workflow: WorkflowExport;
  let service: CustomersService;
  let churnController: InternalChurnController;
  let tasksController: InternalCustomerTasksController;
  let customersRepository: jest.Mocked<Partial<Repository<Customer>>>;
  let persistedAssessments: Map<string, CustomerChurnAssessment>;
  let persistedTasks: Map<string, CustomerTask>;

  const customerId = '11111111-1111-4111-8111-111111111111';
  const mockCustomer: Customer = {
    id: customerId,
    name: 'Acme Strategic Corp',
    email: 'ops@acme.example.com',
    phone: '0901234567',
    companyName: 'Acme Corp',
    companyWebsite: null,
    jobTitle: 'VP Operations',
    companySize: 200,
    industry: 'SaaS',
    status: 'CONVERTED',
    createdBy: '22222222-2222-4222-8222-222222222222',
    updatedBy: null,
    notes: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
  };

  beforeAll(() => {
    workflow = JSON.parse(readFileSync(workflowPath, 'utf8')) as WorkflowExport;
  });

  beforeEach(() => {
    persistedAssessments = new Map();
    persistedTasks = new Map();

    customersRepository = {
      findOne: jest.fn().mockResolvedValue(mockCustomer),
    };
    const churnAssessmentsRepository = {
      create: jest.fn((data: Partial<CustomerChurnAssessment>) =>
        Object.assign(new CustomerChurnAssessment(), {
          id: `assessment-${persistedAssessments.size + 1}`,
          assessedAt: new Date('2026-11-10T00:00:00.000Z'),
          createdAt: new Date('2026-11-10T00:00:00.000Z'),
          ...data,
        }),
      ),
      save: jest.fn((entity: CustomerChurnAssessment) => {
        persistedAssessments.set(entity.id, entity);
        return Promise.resolve(entity);
      }),
      findOne: jest.fn(
        ({
          where,
        }: {
          where: { id?: string; customerId?: string; asOfDate?: string };
        }) => {
          for (const item of persistedAssessments.values()) {
            if (where.id && item.id !== where.id) continue;
            if (where.customerId && item.customerId !== where.customerId)
              continue;
            if (where.asOfDate && item.asOfDate !== where.asOfDate) continue;
            return Promise.resolve(item);
          }
          return Promise.resolve(null);
        },
      ),
    } as unknown as Repository<CustomerChurnAssessment>;
    const customerTasksRepository = {
      create: jest.fn((data: Partial<CustomerTask>) =>
        Object.assign(new CustomerTask(), {
          id: `task-${persistedTasks.size + 1}`,
          createdAt: new Date('2026-11-10T00:00:00.000Z'),
          updatedAt: new Date('2026-11-10T00:00:00.000Z'),
          ...data,
        }),
      ),
      save: jest.fn((entity: CustomerTask) => {
        persistedTasks.set(entity.idempotencyKey, entity);
        return Promise.resolve(entity);
      }),
      findOne: jest.fn(({ where }: { where: { idempotencyKey?: string } }) =>
        Promise.resolve(
          (where.idempotencyKey && persistedTasks.get(where.idempotencyKey)) ||
            null,
        ),
      ),
    } as unknown as Repository<CustomerTask>;

    service = new CustomersService(
      customersRepository as Repository<Customer>,
      {} as Repository<CustomerSegment>,
      {} as Repository<Segment>,
      churnAssessmentsRepository,
      customerTasksRepository,
    );
    churnController = new InternalChurnController(service);
    tasksController = new InternalCustomerTasksController(service);
  });

  function getNode(name: string): WorkflowNode {
    const found = workflow.nodes.find((node) => node.name === name);
    if (!found) {
      throw new Error(`Missing node: ${name}`);
    }
    return found;
  }

  it('has exactly 12 reachable functional nodes and one schedule trigger', () => {
    const functionalNodes = workflow.nodes.filter(
      (node) => node.type !== 'n8n-nodes-base.stickyNote',
    );
    expect(functionalNodes).toHaveLength(12);

    const triggers = functionalNodes.filter((node) =>
      /^(?:webhook|.*Trigger)$/i.test(node.type.split('.').at(-1) ?? ''),
    );
    expect(triggers).toHaveLength(1);
    expect(triggers[0]?.type).toBe('n8n-nodes-base.scheduleTrigger');

    const trigger = triggers[0];
    if (!trigger) throw new Error('No trigger found');

    const names = new Set(functionalNodes.map((node) => node.name));
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

  it('executes WF06 nodes through InternalChurnController without a caller-supplied score and creates an idempotent retention task for HIGH risk', async () => {
    const prepareNode = getNode('4. Prepare Customer Context');
    const normalizeNode = getNode('6. Normalize Feature Snapshot');
    const validateAssessmentNode = getNode('8. Validate Assessment Result');
    const validateAiNode = getNode('10. Validate AI Explanation');

    const [prepared] = runCodeNode(prepareNode, {
      id: customerId,
      name: mockCustomer.name,
    });
    expect(prepared?.json.customerId).toBe(customerId);

    (customersRepository.findOne as jest.Mock).mockResolvedValue({
      ...mockCustomer,
      convertedLeads: [
        Object.assign(new Lead(), {
          id: 'lead-high-1',
          interactions: [
            Object.assign(new Interaction(), {
              id: 'int-stale-1',
              occurredAt: new Date('2026-07-01T00:00:00.000Z'),
            }),
          ],
          enrollments: [
            Object.assign(new LeadFollowUpEnrollment(), {
              id: 'enr-1',
              executions: [
                Object.assign(new FollowUpExecution(), {
                  id: 'exec-f1',
                  status: ExecutionStatus.FAILED,
                }),
                Object.assign(new FollowUpExecution(), {
                  id: 'exec-f2',
                  status: ExecutionStatus.RETRYING,
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const highRiskContext = await churnController.getChurnContext(customerId);

    const [normalized] = runCodeNode(normalizeNode, highRiskContext, {
      '4. Prepare Customer Context': prepared?.json ?? {},
    });

    // Node 7 POSTs to InternalChurnController without score
    const assessment = await churnController.createChurnAssessment(customerId, {
      asOfDate: '2026-11-10',
      evidence: normalized?.json.evidence as Array<Record<string, unknown>>,
      coverage: normalized?.json.coverage as Record<string, unknown>,
      metadata: {
        correlationId: normalized?.json.correlationId,
        source: 'WF06',
      },
    });

    expect(assessment.score).not.toBeNull();
    expect(assessment.score).toBeGreaterThanOrEqual(70);
    expect(assessment.riskLevel).toBe('HIGH');

    // Node 8 validates the backend assessment response
    const [validatedAssessment] = runCodeNode(
      validateAssessmentNode,
      assessment as unknown as Record<string, unknown>,
      {
        '6. Normalize Feature Snapshot': normalized?.json ?? {},
      },
    );
    expect(validatedAssessment?.json).toEqual(
      expect.objectContaining({
        customerId,
        assessmentId: assessment.id,
        riskLevel: 'HIGH',
        score: assessment.score,
      }),
    );

    // Node 10 validates the AI explanation without letting AI override official score/riskLevel
    const [validatedAi] = runCodeNode(
      validateAiNode,
      {
        summary:
          'Customer has stale engagement and repeated follow-up failures.',
        evidence: [JSON.stringify(highRiskContext.evidence[0])],
        confidence: 0.9,
      },
      {
        '8. Validate Assessment Result': validatedAssessment?.json ?? {},
      },
    );
    expect(validatedAi?.json.riskLevel).toBe('HIGH');
    expect(validatedAi?.json.score).toBe(assessment.score);

    // Node 11 Gate Retention condition passes
    const passesRetentionGate =
      validatedAssessment?.json.riskLevel === 'HIGH' &&
      validatedAi?.json.score !== null &&
      Array.isArray(validatedAi?.json.evidence) &&
      validatedAi.json.evidence.length > 0;
    expect(passesRetentionGate).toBe(true);

    // Node 12 creates/reuses the retention CustomerTask via InternalCustomerTasksController
    const taskPayload = {
      customerId,
      assessmentId: String(validatedAi?.json.assessmentId),
      taskType: 'RETENTION' as const,
      priority: 'HIGH' as const,
      idempotencyKey: `wf06:${customerId}:${String(validatedAi?.json.assessmentId)}:RETENTION`,
      notes: String(validatedAi?.json.explanation),
      metadata: {
        correlationId: validatedAi?.json.correlationId,
        riskLevel: validatedAi?.json.riskLevel,
        score: validatedAi?.json.score,
      },
    };
    const createdTask = await tasksController.create(taskPayload);
    const replayedTask = await tasksController.create(taskPayload);

    expect(createdTask).toBeDefined();
    expect(createdTask?.taskType).toBe('RETENTION');
    expect(createdTask?.priority).toBe('HIGH');
    expect(replayedTask?.id).toBe(createdTask?.id);
  });

  it('classifies LOW, MEDIUM, and INSUFFICIENT_DATA through InternalChurnController from canonical DB records without allowing caller overrides', async () => {
    (customersRepository.findOne as jest.Mock).mockResolvedValueOnce({
      ...mockCustomer,
      convertedLeads: [
        Object.assign(new Lead(), {
          id: 'lead-low',
          interactions: [
            Object.assign(new Interaction(), {
              id: 'i1',
              occurredAt: new Date('2026-11-09T00:00:00.000Z'),
            }),
            Object.assign(new Interaction(), {
              id: 'i2',
              occurredAt: new Date('2026-11-08T00:00:00.000Z'),
            }),
            Object.assign(new Interaction(), {
              id: 'i3',
              occurredAt: new Date('2026-11-07T00:00:00.000Z'),
            }),
            Object.assign(new Interaction(), {
              id: 'i4',
              occurredAt: new Date('2026-11-06T00:00:00.000Z'),
            }),
          ],
          enrollments: [],
        }),
      ],
    });
    const low = await churnController.createChurnAssessment(customerId, {
      asOfDate: '2026-11-10',
      score: 99, // caller override ignored
    });
    expect(low.riskLevel).toBe('LOW');
    expect(low.score).toBeLessThanOrEqual(39);

    (customersRepository.findOne as jest.Mock).mockResolvedValueOnce({
      ...mockCustomer,
      convertedLeads: [
        Object.assign(new Lead(), {
          id: 'lead-med',
          interactions: [],
          enrollments: [
            Object.assign(new LeadFollowUpEnrollment(), {
              id: 'enr-med',
              executions: [
                Object.assign(new FollowUpExecution(), {
                  id: 'ex-1',
                  status: ExecutionStatus.FAILED,
                }),
                Object.assign(new FollowUpExecution(), {
                  id: 'ex-2',
                  status: ExecutionStatus.RETRYING,
                }),
              ],
            }),
          ],
        }),
      ],
    });
    const medium = await churnController.createChurnAssessment(customerId, {
      asOfDate: '2026-11-11',
    });
    expect(medium.riskLevel).toBe('MEDIUM');
    expect(medium.score).toBeGreaterThanOrEqual(40);
    expect(medium.score).toBeLessThanOrEqual(69);

    (customersRepository.findOne as jest.Mock).mockResolvedValueOnce({
      ...mockCustomer,
      convertedLeads: [],
    });
    const insufficient = await churnController.createChurnAssessment(
      customerId,
      {
        asOfDate: '2026-11-12',
        evidence: [],
      },
    );
    expect(insufficient.riskLevel).toBe('INSUFFICIENT_DATA');
    expect(insufficient.score).toBeNull();
  });
});
