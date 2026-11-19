import { AddWorkflowExecutionClaimLease1793477100000 } from './1793477100000-AddWorkflowExecutionClaimLease.js';

describe('AddWorkflowExecutionClaimLease1793477100000', () => {
  it('gives already-running legacy executions a deployment grace period', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    };

    await new AddWorkflowExecutionClaimLease1793477100000().up(
      queryRunner as never,
    );

    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'NOW() + INTERVAL \'1 hour\'',
      ),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(
        '"n8n_execution_id" IS NOT NULL',
      ),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(
        '"claim_expires_at" IS NULL',
      ),
    );
  });

  it('does not remove the claim column until rollback', async () => {
    const queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    };

    await new AddWorkflowExecutionClaimLease1793477100000().down(
      queryRunner as never,
    );

    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'DROP COLUMN IF EXISTS "claim_expires_at"',
      ),
    );
  });
});
