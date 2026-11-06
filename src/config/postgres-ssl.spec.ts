import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolvePostgresConnectionOptions } from './postgres-ssl.js';

describe('resolvePostgresConnectionOptions', () => {
  it('removes SSL query parameters and keeps strict TLS verification', () => {
    const result = resolvePostgresConnectionOptions(
      'postgresql://user:password@db.example.test:5432/crm?sslmode=require&ssl=true&application_name=crm-api',
    );

    const sanitizedUrl = new URL(result.url);

    expect(sanitizedUrl.searchParams.get('application_name')).toBe('crm-api');
    expect(sanitizedUrl.searchParams.has('sslmode')).toBe(false);
    expect(sanitizedUrl.searchParams.has('ssl')).toBe(false);
    expect(result.ssl).toEqual({ rejectUnauthorized: true });
  });

  it('does not enable TLS for a custom host when sslmode is disable', () => {
    const result = resolvePostgresConnectionOptions(
      'postgresql://user:password@db.example.test:5432/crm?sslmode=disable',
    );

    expect(result.ssl).toBe(false);
    expect(new URL(result.url).searchParams.has('sslmode')).toBe(false);
  });

  it('keeps TLS enabled for managed database hosts even when the URL says disable', () => {
    const result = resolvePostgresConnectionOptions(
      'postgresql://user:password@ep.example.neon.tech:5432/neondb?sslmode=disable',
    );

    expect(result.ssl).toEqual({ rejectUnauthorized: true });
  });

  it('moves CA and client certificate files into the explicit SSL object', () => {
    const directory = mkdtempSync(join(tmpdir(), 'crm-postgres-ssl-'));

    try {
      const caPath = join(directory, 'root.crt');
      const certPath = join(directory, 'client.crt');
      const keyPath = join(directory, 'client.key');
      writeFileSync(caPath, 'root-ca');
      writeFileSync(certPath, 'client-cert');
      writeFileSync(keyPath, 'client-key');

      const query = new URLSearchParams({
        sslmode: 'verify-full',
        sslrootcert: caPath,
        sslcert: certPath,
        sslkey: keyPath,
        application_name: 'crm-api',
      });
      const result = resolvePostgresConnectionOptions(
        'postgresql://user:password@db.example.test:5432/crm?' +
          query.toString(),
      );

      expect(result.ssl).toEqual({
        rejectUnauthorized: true,
        ca: 'root-ca',
        cert: 'client-cert',
        key: 'client-key',
      });
      expect(new URL(result.url).searchParams.get('application_name')).toBe(
        'crm-api',
      );
      for (const parameter of [
        'sslmode',
        'sslrootcert',
        'sslcert',
        'sslkey',
      ]) {
        expect(new URL(result.url).searchParams.has(parameter)).toBe(false);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects incomplete client certificate configuration', () => {
    expect(() =>
      resolvePostgresConnectionOptions(
        'postgresql://user:password@db.example.test:5432/crm?sslcert=/tmp/client.crt',
      ),
    ).toThrow('both sslcert and sslkey');
  });

  it('rejects invalid SSL modes instead of silently accepting them', () => {
    expect(() =>
      resolvePostgresConnectionOptions(
        'postgresql://user:password@db.example.test:5432/crm?sslmode=unknown',
      ),
    ).toThrow('unsupported sslmode');
  });
});
