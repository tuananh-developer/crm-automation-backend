import { CreateFeedbackAndCustomerTasksTables1728600000000 } from './1728600000000-CreateFeedbackAndCustomerTasksTables.js';
import type { QueryRunner } from 'typeorm';

describe('CreateFeedbackAndCustomerTasksTables1728600000000 Migration Safety', () => {
  let migration: CreateFeedbackAndCustomerTasksTables1728600000000;
  let executedQueries: string[];

  beforeEach(() => {
    migration = new CreateFeedbackAndCustomerTasksTables1728600000000();
    executedQueries = [];
  });

  const createMockQueryRunner = () => {
    return {
      query: jest.fn((sql: string) => {
        executedQueries.push(sql.trim());
        return Promise.resolve([]);
      }),
    } as unknown as QueryRunner;
  };

  describe('down() - Rollback safety with shared customer_tasks and notifications.severity', () => {
    it('Order A: PR #49 (Churn) ran first, then WF14 ran; rollback cleans up feedback but preserves shared customer_tasks and churn columns', async () => {
      const runner = createMockQueryRunner();
      await migration.down(runner);

      // Verifies customer_feedback is dropped
      expect(
        executedQueries.some((q) =>
          q.includes('DROP TABLE IF EXISTS "customer_feedback"'),
        ),
      ).toBe(true);

      // Verifies feedback FK, index, and feedback task rows are cleaned up
      expect(
        executedQueries.some((q) =>
          q.includes('FK_customer_tasks_customer_feedback_id'),
        ),
      ).toBe(true);
      expect(
        executedQueries.some((q) =>
          q.includes(
            'DELETE FROM "customer_tasks" WHERE "customer_feedback_id" IS NOT NULL',
          ),
        ),
      ).toBe(true);
      expect(
        executedQueries.some((q) =>
          q.includes(
            'ALTER TABLE "customer_tasks" DROP COLUMN "customer_feedback_id"',
          ),
        ),
      ).toBe(true);

      // Verifies unconditional DROP TABLE customer_tasks is NEVER run
      expect(
        executedQueries.some(
          (q) => q === 'DROP TABLE IF EXISTS "customer_tasks";',
        ),
      ).toBe(false);

      // Verifies notifications.severity is NEVER dropped
      expect(
        executedQueries.some(
          (q) =>
            q.includes('notifications') &&
            q.includes('severity') &&
            q.includes('DROP'),
        ),
      ).toBe(false);
    });

    it('Never drops shared customer_tasks table on rollback even when pre-existing table is empty and has no churn metadata', async () => {
      const runner = createMockQueryRunner();
      await migration.down(runner);

      const dropsCustomerTasks = executedQueries.some(
        (q) =>
          q.includes('DROP TABLE') &&
          q.toLowerCase().includes('customer_tasks'),
      );
      expect(dropsCustomerTasks).toBe(false);
    });

    it('Never drops notifications.severity on rollback to avoid breaking notifications and lead intelligence', async () => {
      const runner = createMockQueryRunner();
      await migration.down(runner);

      const dropsSeverity = executedQueries.some(
        (q) =>
          q.includes('notifications') &&
          q.includes('severity') &&
          q.includes('DROP'),
      );
      expect(dropsSeverity).toBe(false);
    });
  });

  describe('up() - Safe idempotency', () => {
    it('creates customer_feedback and reconciles customer_tasks idempotently', async () => {
      const runner = createMockQueryRunner();
      await migration.up(runner);

      expect(
        executedQueries.some((q) =>
          q.includes('CREATE TABLE IF NOT EXISTS "customer_feedback"'),
        ),
      ).toBe(true);
      expect(
        executedQueries.some((q) =>
          q.includes('CREATE TABLE IF NOT EXISTS "customer_tasks"'),
        ),
      ).toBe(true);
      expect(
        executedQueries.some(
          (q) =>
            q.includes('ALTER TABLE "notifications"') &&
            q.includes('ADD COLUMN IF NOT EXISTS "severity"'),
        ),
      ).toBe(true);
    });
  });
});
