import { QueryRunner } from 'typeorm';
import { AddNotificationSeverityColumn1728450000000 } from './1728450000000-AddNotificationSeverityColumn.js';

describe('AddNotificationSeverityColumn1728450000000', () => {
  const createSimulatedNotificationsDb = (initialState: {
    columnExists: boolean;
    maxLength: number | null;
    nullable: boolean;
    defaultValue: string | null;
    rows: Array<{ id: string; severity: string | null }>;
  }) => {
    const state = {
      ...initialState,
      rows: initialState.rows.map((row) => ({ ...row })),
      queries: [] as string[],
    };

    const queryRunner = {
      query: jest.fn((sql: string) => {
        const normalized = sql.replace(/\s+/g, ' ').trim();
        state.queries.push(normalized);

        if (
          normalized.includes(
            'ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "severity"',
          )
        ) {
          if (!state.columnExists) {
            state.columnExists = true;
            state.maxLength = 30;
            state.nullable = false;
            state.defaultValue = 'INFO';
            for (const row of state.rows) {
              row.severity = row.severity ?? 'INFO';
            }
          }
          return Promise.resolve(undefined);
        }

        if (
          normalized.includes(
            'ALTER COLUMN "severity" TYPE character varying(30)',
          ) &&
          normalized.includes('ALTER COLUMN "severity" SET DEFAULT \'INFO\'')
        ) {
          state.maxLength = 30;
          state.defaultValue = 'INFO';
          return Promise.resolve(undefined);
        }

        if (
          normalized.includes(
            'UPDATE "notifications" SET "severity" = \'INFO\' WHERE "severity" IS NULL',
          )
        ) {
          for (const row of state.rows) {
            if (row.severity === null) {
              row.severity = 'INFO';
            }
          }
          return Promise.resolve(undefined);
        }

        if (normalized.includes('ALTER COLUMN "severity" SET NOT NULL')) {
          if (state.rows.some((row) => row.severity === null)) {
            throw new Error(
              'column "severity" of relation "notifications" contains null values',
            );
          }
          state.nullable = false;
          return Promise.resolve(undefined);
        }

        if (normalized.includes('DROP COLUMN IF EXISTS "severity"')) {
          state.columnExists = false;
          return Promise.resolve(undefined);
        }

        return Promise.resolve(undefined);
      }),
    } as unknown as QueryRunner;

    return { state, queryRunner };
  };

  it('creates notifications.severity as NOT NULL DEFAULT INFO on a fresh database', async () => {
    const { state, queryRunner } = createSimulatedNotificationsDb({
      columnExists: false,
      maxLength: null,
      nullable: true,
      defaultValue: null,
      rows: [{ id: 'notif-1', severity: null }],
    });

    await new AddNotificationSeverityColumn1728450000000().up(queryRunner);

    expect(state.columnExists).toBe(true);
    expect(state.maxLength).toBe(30);
    expect(state.nullable).toBe(false);
    expect(state.defaultValue).toBe('INFO');
    expect(state.rows).toEqual([{ id: 'notif-1', severity: 'INFO' }]);
  });

  it('upgrades an existing nullable notifications.severity column when PR #52 migration was applied first', async () => {
    const { state, queryRunner } = createSimulatedNotificationsDb({
      columnExists: true,
      maxLength: 20,
      nullable: true,
      defaultValue: null,
      rows: [
        { id: 'notif-null', severity: null },
        { id: 'notif-warn', severity: 'WARNING' },
      ],
    });

    await new AddNotificationSeverityColumn1728450000000().up(queryRunner);

    expect(state.columnExists).toBe(true);
    expect(state.maxLength).toBe(30);
    expect(state.nullable).toBe(false);
    expect(state.defaultValue).toBe('INFO');
    expect(state.rows).toEqual([
      { id: 'notif-null', severity: 'INFO' },
      { id: 'notif-warn', severity: 'WARNING' },
    ]);

    const addIdx = state.queries.findIndex((q) =>
      q.includes('ADD COLUMN IF NOT EXISTS "severity"'),
    );
    const alterTypeDefaultIdx = state.queries.findIndex((q) =>
      q.includes('ALTER COLUMN "severity" SET DEFAULT \'INFO\''),
    );
    const backfillIdx = state.queries.findIndex((q) =>
      q.includes(
        'UPDATE "notifications" SET "severity" = \'INFO\' WHERE "severity" IS NULL',
      ),
    );
    const setNotNullIdx = state.queries.findIndex((q) =>
      q.includes('ALTER COLUMN "severity" SET NOT NULL'),
    );

    expect(addIdx).toBeGreaterThanOrEqual(0);
    expect(alterTypeDefaultIdx).toBeGreaterThan(addIdx);
    expect(backfillIdx).toBeGreaterThan(alterTypeDefaultIdx);
    expect(setNotNullIdx).toBeGreaterThan(backfillIdx);
  });

  it('drops notifications.severity on rollback', async () => {
    const { state, queryRunner } = createSimulatedNotificationsDb({
      columnExists: true,
      maxLength: 30,
      nullable: false,
      defaultValue: 'INFO',
      rows: [],
    });

    await new AddNotificationSeverityColumn1728450000000().down(queryRunner);

    expect(state.columnExists).toBe(false);
  });
});
