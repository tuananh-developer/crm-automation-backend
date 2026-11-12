/* eslint-disable @typescript-eslint/unbound-method */
import { CustomerContractsController } from './customer-contracts.controller.js';
import type { RenewalService } from './renewal.service.js';
import type { Contract } from './entities/contract.entity.js';
import type { RenewalDraft } from './entities/renewal-draft.entity.js';

describe('CustomerContractsController', () => {
  let controller: CustomerContractsController;
  let service: jest.Mocked<RenewalService>;

  beforeEach(() => {
    service = {
      listContracts: jest.fn(),
      createContract: jest.fn(),
      findRenewalContracts: jest.fn(),
      getContract: jest.fn(),
      updateContract: jest.fn(),
      listDraftsForContract: jest.fn(),
      saveDraft: jest.fn(),
      getDraft: jest.fn(),
    } as unknown as jest.Mocked<RenewalService>;

    controller = new CustomerContractsController(service);
  });

  it('delegates contract creation', async () => {
    service.createContract.mockResolvedValue({ id: 'c-1' } as Contract);
    const dto = {
      customerId: 'cust-1',
      contractNumber: 'CTR-001',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    };
    const res = await controller.createContract(dto);
    expect(service.createContract).toHaveBeenCalledWith(dto);
    expect(res).toMatchObject({ id: 'c-1' });
  });

  it('delegates getting due contracts', async () => {
    service.findRenewalContracts.mockResolvedValue([{ id: 'c-1' } as Contract]);
    const res = await controller.getDueContracts('60');
    expect(service.findRenewalContracts).toHaveBeenCalledWith(60);
    expect(res).toHaveLength(1);
  });

  it('delegates contract update', async () => {
    service.updateContract.mockResolvedValue({
      id: 'c-1',
      status: 'CANCELLED',
    } as Contract);
    const res = await controller.updateContract('c-1', { status: 'CANCELLED' });
    expect(service.updateContract).toHaveBeenCalledWith('c-1', {
      status: 'CANCELLED',
    });
    expect(res).toMatchObject({ status: 'CANCELLED' });
  });

  it('delegates listing renewal attempts', async () => {
    service.listDraftsForContract.mockResolvedValue([
      { id: 'd-1' } as RenewalDraft,
    ]);
    const res = await controller.listRenewalAttempts('c-1');
    expect(service.listDraftsForContract).toHaveBeenCalledWith('c-1');
    expect(res).toHaveLength(1);
  });

  it('delegates getting attempt by id', async () => {
    service.getDraft.mockResolvedValue({ id: 'd-1' } as RenewalDraft);
    const res = await controller.getRenewalAttempt('d-1');
    expect(service.getDraft).toHaveBeenCalledWith('d-1');
    expect(res).toMatchObject({ id: 'd-1' });
  });
});
