/* eslint-disable @typescript-eslint/unbound-method */
import { CustomerContractsController } from './customer-contracts.controller.js';
import type { RenewalService } from './renewal.service.js';
import type { Contract } from './entities/contract.entity.js';
import type { RenewalDraft } from './entities/renewal-draft.entity.js';
import type { CustomerTask } from '../customers/entities/customer-task.entity.js';
import { UserRole } from '../users/enums/user.enum.js';
import type { AuthenticatedUser } from '../../common/types/auth.interface.js';

describe('CustomerContractsController', () => {
  let controller: CustomerContractsController;
  let service: jest.Mocked<RenewalService>;
  const salesActor = {
    id: 'sales-user-1',
    email: 'sales@example.com',
    name: 'Sales User',
    role: UserRole.SALES,
  } as AuthenticatedUser;

  beforeEach(() => {
    service = {
      listContracts: jest.fn(),
      createContract: jest.fn(),
      findRenewalContracts: jest.fn(),
      getContract: jest.fn(),
      updateContract: jest.fn(),
      listDraftsForContract: jest.fn(),
      listApprovalTasksForContract: jest.fn(),
      saveDraft: jest.fn(),
      getDraft: jest.fn(),
      approveDraft: jest.fn(),
    } as unknown as jest.Mocked<RenewalService>;

    controller = new CustomerContractsController(service);
  });

  it('delegates contract creation with actor scope', async () => {
    service.createContract.mockResolvedValue({ id: 'c-1' } as Contract);
    const dto = {
      customerId: 'cust-1',
      contractNumber: 'CTR-001',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    };
    const res = await controller.createContract(dto, salesActor);
    expect(service.createContract).toHaveBeenCalledWith(dto, salesActor);
    expect(res).toMatchObject({ id: 'c-1' });
  });

  it('delegates getting due contracts with actor scope', async () => {
    service.findRenewalContracts.mockResolvedValue([{ id: 'c-1' } as Contract]);
    const res = await controller.getDueContracts(salesActor, '60');
    expect(service.findRenewalContracts).toHaveBeenCalledWith(60, salesActor);
    expect(res).toHaveLength(1);
  });

  it('delegates contract update with actor scope', async () => {
    service.updateContract.mockResolvedValue({
      id: 'c-1',
      status: 'CANCELLED',
    } as Contract);
    const res = await controller.updateContract(
      'c-1',
      { status: 'CANCELLED' },
      salesActor,
    );
    expect(service.updateContract).toHaveBeenCalledWith(
      'c-1',
      { status: 'CANCELLED' },
      salesActor,
    );
    expect(res).toMatchObject({ status: 'CANCELLED' });
  });

  it('delegates listing renewal attempts with actor scope', async () => {
    service.listDraftsForContract.mockResolvedValue([
      { id: 'd-1' } as RenewalDraft,
    ]);
    const res = await controller.listRenewalAttempts('c-1', salesActor);
    expect(service.listDraftsForContract).toHaveBeenCalledWith(
      'c-1',
      salesActor,
    );
    expect(res).toHaveLength(1);
  });

  it('delegates listing approval tasks with actor scope', async () => {
    service.listApprovalTasksForContract.mockResolvedValue([
      { id: 'task-1' } as CustomerTask,
    ]);
    const res = await controller.listApprovalTasks('c-1', salesActor);
    expect(service.listApprovalTasksForContract).toHaveBeenCalledWith(
      'c-1',
      salesActor,
    );
    expect(res).toHaveLength(1);
  });

  it('delegates getting attempt by id with actor scope', async () => {
    service.getDraft.mockResolvedValue({ id: 'd-1' } as RenewalDraft);
    const res = await controller.getRenewalAttempt('d-1', salesActor);
    expect(service.getDraft).toHaveBeenCalledWith('d-1', salesActor);
    expect(res).toMatchObject({ id: 'd-1' });
  });

  it('delegates approving a renewal draft with actor audit', async () => {
    service.approveDraft.mockResolvedValue({
      id: 'd-1',
      status: 'APPROVED',
      canAutoSend: true,
      eligibilityReason: 'OK',
    } as RenewalDraft & { canAutoSend: boolean; eligibilityReason: string });
    const dto = {
      consentGranted: true,
      templateApproved: true,
      policyApproved: true,
      comment: 'Reviewed and approved',
    };
    const res = await controller.approveRenewalAttempt('d-1', dto, salesActor);
    expect(service.approveDraft).toHaveBeenCalledWith('d-1', dto, salesActor);
    expect(res).toMatchObject({ id: 'd-1', status: 'APPROVED' });
  });
});
