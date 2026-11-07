import { ReviewController } from './review.controller.js';
import type { ReviewService } from './review.service.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';
import { UserRole, UserStatus } from '../users/enums/user.enum.js';
import type {
  AssignReviewTaskDto,
  CreateReviewTaskDto,
  ResolveReviewTaskDto,
} from './dto/index.js';

describe('ReviewController', () => {
  const actor: AuthenticatedUser = {
    id: 'sales-123',
    name: 'Sales Rep',
    email: 'sales@example.test',
    role: UserRole.SALES,
    status: UserStatus.ACTIVE,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  let controller: ReviewController;
  let service: jest.Mocked<Partial<ReviewService>>;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      assign: jest.fn(),
      start: jest.fn(),
      resolve: jest.fn(),
    };
    controller = new ReviewController(service as ReviewService);
  });

  it('passes the JWT actor to read and mutation service methods', async () => {
    const createDto = { leadId: 'lead-123' } as CreateReviewTaskDto;
    const assignDto: AssignReviewTaskDto = { reviewerId: actor.id };
    const resolveDto = { decision: 'APPROVE' } as ResolveReviewTaskDto;

    await controller.create(createDto, actor);
    await controller.findAll(actor);
    await controller.findOne('task-123', actor);
    await controller.assign('task-123', assignDto, actor);
    await controller.start('task-123', actor);
    await controller.resolve('task-123', resolveDto, actor);

    expect(service.create).toHaveBeenCalledWith(createDto, actor);
    expect(service.findAll).toHaveBeenCalledWith(actor);
    expect(service.findOne).toHaveBeenCalledWith('task-123', actor);
    expect(service.assign).toHaveBeenCalledWith('task-123', assignDto, actor);
    expect(service.start).toHaveBeenCalledWith('task-123', actor);
    expect(service.resolve).toHaveBeenCalledWith('task-123', resolveDto, actor);
  });

  it('prevents a Sales actor from assigning a task to another reviewer', async () => {
    await expect(
      controller.assign('task-123', { reviewerId: 'other-sales' }, actor),
    ).rejects.toMatchObject({ status: 403 });
    expect(service.assign).not.toHaveBeenCalled();
  });
});
