'use strict';

void (async () => {
  let dataSource;

  try {
    const migrationModule = await import('../dist/data-source.js');
    dataSource = migrationModule.AppDataSource;

    await dataSource.initialize();
    const migrations = await dataSource.runMigrations();

    console.info(
      `Database migration step completed. Applied ${migrations.length} migration(s).`,
    );
  } catch (error) {
    console.error('Database migration failed:', error);
    process.exitCode = 1;
  } finally {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  }
})();
