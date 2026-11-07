import type { QueryRunner } from 'typeorm';
import { InitialSchema1727866977000 } from './1727866977000-InitialSchema.js';
import { AddEnrollmentActiveUniqueIndex1728400000000 } from './1728400000000-AddEnrollmentActiveUniqueIndex.js';
import { AddNotificationSeverityColumn1728450000000 } from './1728450000000-AddNotificationSeverityColumn.js';
import { AddOutboxEventsTable1729000000000 } from './1729000000000-AddOutboxEventsTable.js';
import { AddT12WorkflowDomains1793476800000 } from './1793476800000-AddT12WorkflowDomains.js';
import { AddOutboxProcessingLease1793476900000 } from './1793476900000-AddOutboxProcessingLease.js';
import { AddOutboxHttpDispatch1793477000000 } from './1793477000000-AddOutboxHttpDispatch.js';

interface ColumnDefinition {
  type: string;
  isNullable: boolean;
  default?: string;
}

interface TableDefinition {
  name: string;
  columns: Map<string, ColumnDefinition>;
  indices: Set<string>;
}

class MockDatabaseState {
  public tables = new Map<string, TableDefinition>();
  public executedQueries: string[] = [];

  public createQueryRunner(): QueryRunner {
    return {
      query: jest.fn().mockImplementation((query: string) => {
        this.executedQueries.push(query);
        this.processQuery(query);
        return Promise.resolve([]);
      }),
    } as unknown as QueryRunner;
  }

  private processQuery(sql: string): void {
    const trimmed = sql.trim();

    // CREATE TABLE ...
    const createTableMatch = trimmed.match(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-zA-Z0-9_]+)"?\s*\(([\s\S]+)\)/i,
    );
    if (createTableMatch) {
      const tableName = createTableMatch[1];
      const body = createTableMatch[2];
      const table: TableDefinition = {
        name: tableName,
        columns: new Map(),
        indices: new Set(),
      };

      const lines = body.split('\n');
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (
          !line ||
          line.startsWith('CONSTRAINT') ||
          line.startsWith('--') ||
          line.startsWith('PRIMARY KEY')
        ) {
          continue;
        }

        const colMatch = line.match(
          /^"?([a-zA-Z0-9_]+)"?\s+([A-Z0-9()_]+)(.*)$/i,
        );
        if (colMatch) {
          const colName = colMatch[1];
          const colType = colMatch[2];
          const colRest = colMatch[3] || '';
          const isNullable = !colRest.toUpperCase().includes('NOT NULL');
          const defaultMatch = colRest.match(/DEFAULT\s+([^,]+)/i);

          table.columns.set(colName, {
            type: colType,
            isNullable,
            default: defaultMatch ? defaultMatch[1].trim() : undefined,
          });
        }
      }

      this.tables.set(tableName, table);
      return;
    }

    // ALTER TABLE "notifications" ADD COLUMN ...
    const addColMatch = trimmed.match(
      /ALTER\s+TABLE\s+"?([a-zA-Z0-9_]+)"?\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-zA-Z0-9_]+)"?\s+([^;]+?)(?:$|;)/i,
    );
    if (addColMatch) {
      const tableName = addColMatch[1];
      const colName = addColMatch[2];
      const colDefRaw = addColMatch[3].trim();

      const table = this.tables.get(tableName);
      if (table) {
        const isNullable = !colDefRaw.toUpperCase().includes('NOT NULL');
        const defaultMatch = colDefRaw.match(/DEFAULT\s+('?[a-zA-Z0-9_]+'?)/i);
        const typeMatch = colDefRaw.match(
          /^([a-zA-Z0-9_()\s]+?)(?:\s+NOT|\s+NULL|\s+DEFAULT|$)/i,
        );

        table.columns.set(colName, {
          type: typeMatch ? typeMatch[1].trim() : colDefRaw,
          isNullable,
          default: defaultMatch ? defaultMatch[1].trim() : undefined,
        });
      }
      return;
    }

    // ALTER TABLE "notifications" DROP COLUMN ...
    const dropColMatch = trimmed.match(
      /ALTER\s+TABLE\s+"?([a-zA-Z0-9_]+)"?\s+DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?"?([a-zA-Z0-9_]+)"?/i,
    );
    if (dropColMatch) {
      const tableName = dropColMatch[1];
      const colName = dropColMatch[2];
      const table = this.tables.get(tableName);
      if (table) {
        table.columns.delete(colName);
      }
      return;
    }

    // DROP TABLE ...
    const dropTableMatch = trimmed.match(
      /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?"?([a-zA-Z0-9_]+)"?/i,
    );
    if (dropTableMatch) {
      const tableName = dropTableMatch[1];
      this.tables.delete(tableName);
    }
  }
}

/* eslint-disable @typescript-eslint/unbound-method */
describe('Canonical Migration Chain & Notification Severity Compatibility', () => {
  let dbState: MockDatabaseState;
  let queryRunner: QueryRunner;

  beforeEach(() => {
    dbState = new MockDatabaseState();
    queryRunner = dbState.createQueryRunner();
  });

  describe('AddNotificationSeverityColumn1728450000000 Unit Specification', () => {
    const migration = new AddNotificationSeverityColumn1728450000000();

    it('has canonical identity matching timestamp and class naming', () => {
      expect(migration.name).toBe('AddNotificationSeverityColumn1728450000000');
    });

    it('up() executes non-null severity addition with default INFO', async () => {
      await migration.up(queryRunner);

      expect(queryRunner.query).toHaveBeenCalledWith(
        expect.stringContaining('ALTER TABLE "notifications"'),
      );
      expect(queryRunner.query).toHaveBeenCalledWith(
        expect.stringContaining(
          'ADD COLUMN IF NOT EXISTS "severity" character varying(30) NOT NULL DEFAULT \'INFO\'',
        ),
      );
    });

    it('down() performs clean, safe rollback dropping severity column', async () => {
      await migration.down(queryRunner);

      expect(queryRunner.query).toHaveBeenCalledWith(
        expect.stringContaining('ALTER TABLE "notifications"'),
      );
      expect(queryRunner.query).toHaveBeenCalledWith(
        expect.stringContaining('DROP COLUMN IF EXISTS "severity"'),
      );
    });
  });

  describe('Sequential Migration Execution from Empty Database', () => {
    const migrations = [
      new InitialSchema1727866977000(),
      new AddEnrollmentActiveUniqueIndex1728400000000(),
      new AddNotificationSeverityColumn1728450000000(),
      new AddOutboxEventsTable1729000000000(),
      new AddT12WorkflowDomains1793476800000(),
      new AddOutboxProcessingLease1793476900000(),
      new AddOutboxHttpDispatch1793477000000(),
    ];

    it('runs entire migration chain forward from empty database without errors', async () => {
      expect(dbState.tables.size).toBe(0);

      // Execute all migrations up in order
      for (const m of migrations) {
        await m.up(queryRunner);
      }

      // 1. Verify notifications table exists
      const notificationsTable = dbState.tables.get('notifications');
      expect(notificationsTable).toBeDefined();

      // 2. Verify severity column exists and satisfies non-null contract
      const severityCol = notificationsTable?.columns.get('severity');
      expect(severityCol).toBeDefined();
      expect(severityCol?.type).toBe('character varying(30)');
      expect(severityCol?.isNullable).toBe(false);
      expect(severityCol?.default).toBe("'INFO'");

      // 3. Verify other key tables created by initial schema
      expect(dbState.tables.has('users')).toBe(true);
      expect(dbState.tables.has('leads')).toBe(true);
      expect(dbState.tables.has('customers')).toBe(true);
      expect(dbState.tables.has('workflow_runs')).toBe(true);
      expect(dbState.tables.has('review_tasks')).toBe(true);
      expect(dbState.tables.has('lead_scores')).toBe(true);

      // 4. Verify downstream tables created by subsequent migrations
      expect(dbState.tables.has('outbox_events')).toBe(true);
    });

    it('supports full sequential rollback (down) in reverse order cleanly', async () => {
      // Setup: run up first
      for (const m of migrations) {
        await m.up(queryRunner);
      }
      expect(dbState.tables.get('notifications')?.columns.has('severity')).toBe(
        true,
      );

      // Rollback AddNotificationSeverityColumn1728450000000
      const severityMigration = migrations[2];
      await severityMigration.down(queryRunner);

      // Severity column is cleanly dropped
      expect(dbState.tables.get('notifications')?.columns.has('severity')).toBe(
        false,
      );

      // Rollback all remaining migrations in reverse order
      const remainingDown = [...migrations].reverse();
      for (const m of remainingDown) {
        await m.down(queryRunner);
      }

      // Verifies no throw or broken references
      expect(dbState.executedQueries.length).toBeGreaterThan(0);
    });

    it('maintains DDL and entity schema contract compatibility between PR #53 and PR #54', async () => {
      // Step 1: Initial schema creates base notifications table without severity
      const initialSchema = new InitialSchema1727866977000();
      await initialSchema.up(queryRunner);

      const notifTableInitial = dbState.tables.get('notifications');
      expect(notifTableInitial).toBeDefined();
      expect(notifTableInitial?.columns.has('severity')).toBe(false);

      // Step 2: AddNotificationSeverityColumn adds severity non-null default INFO
      const severityMigration =
        new AddNotificationSeverityColumn1728450000000();
      await severityMigration.up(queryRunner);

      const notifTableEnriched = dbState.tables.get('notifications');
      const severity = notifTableEnriched?.columns.get('severity');
      expect(severity).toEqual({
        type: 'character varying(30)',
        isNullable: false,
        default: "'INFO'",
      });

      // Step 3: Repeated idempotent execution (IF NOT EXISTS) does not fail
      await severityMigration.up(queryRunner);
      expect(notifTableEnriched?.columns.get('severity')).toBeDefined();
    });
  });
});
