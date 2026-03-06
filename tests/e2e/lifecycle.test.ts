/**
 * End-to-end lifecycle test.
 *
 * This test downloads real Neo4j and JRE binaries, starts an instance,
 * verifies it's healthy, and stops it. It requires network access and
 * takes several minutes to run.
 *
 * Run with: npm run test:e2e
 */
import { describe, it, expect, afterAll } from 'vitest';
import { Neo4jLocal } from '../../src/neo4j-local.js';
import { readCredentials } from '../../src/fs-utils.js';

describe('Neo4j Local E2E Lifecycle', { timeout: 300_000 }, () => {
  let instance: Neo4jLocal | null = null;

  afterAll(async () => {
    if (instance) {
      try {
        await instance.stop();
      } catch {
        // best effort cleanup
      }
    }
  });

  it('downloads, installs, starts, health-checks, and stops a Neo4j instance', async () => {
    instance = new Neo4jLocal({
      instanceName: `e2e-test-${Date.now()}`,
      ephemeral: true,
      verbose: true,
      ports: {
        bolt: 17687,
        http: 17474,
      },
    });

    // --- Install ---
    const stateChanges: string[] = [];
    instance.on('stateChange', (state: string) => stateChanges.push(state));

    await instance.install();
    expect(instance.getState()).toBe('installed');
    expect(stateChanges).toContain('installing');
    expect(stateChanges).toContain('installed');

    // --- Start ---
    const creds = await instance.start();
    expect(instance.getState()).toBe('running');
    expect(creds.uri).toBe('bolt://localhost:17687');
    expect(creds.httpUrl).toBe('http://localhost:17474');
    expect(creds.username).toBe('neo4j');
    expect(creds.password.length).toBeGreaterThan(0);

    // --- Health Check ---
    const status = await instance.getStatus();
    expect(status.state).toBe('running');
    expect(status.pid).toBeDefined();
    expect(typeof status.pid).toBe('number');
    expect(status.uptime).toBeDefined();
    expect(status.uptime!).toBeGreaterThan(0);

    // Verify HTTP endpoint is responsive
    const response = await fetch(`http://127.0.0.1:17474/`);
    expect(response.ok).toBe(true);

    // --- Stop ---
    await instance.stop();
    expect(instance.getState()).toBe('stopped');

    // Verify HTTP endpoint is no longer responsive
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 3_000);
      await fetch(`http://127.0.0.1:17474/`, { signal: controller.signal });
      // If we get here, the server is still responding (unexpected)
      expect.fail('Expected fetch to fail after stop');
    } catch {
      // Expected — server is down
    }

    // Instance dir should be cleaned up (ephemeral mode)
    const instanceDir = instance.getInstanceDir();
    const exists = await import('node:fs/promises')
      .then(fs => fs.access(instanceDir).then(() => true).catch(() => false));
    expect(exists).toBe(false);

    instance = null; // prevent afterAll cleanup since already stopped
  });

  it('reset() wipes data and re-initializes', async () => {
    instance = new Neo4jLocal({
      instanceName: `e2e-reset-${Date.now()}`,
      ephemeral: false,
      verbose: true,
      ports: {
        bolt: 17688,
        http: 17475,
      },
    });

    // Start and then stop
    await instance.start();
    expect(instance.getState()).toBe('running');
    await instance.stop();
    expect(instance.getState()).toBe('stopped');

    // Reset should wipe data
    await instance.reset();
    expect(instance.getState()).toBe('installed');

    // Should be able to start again after reset
    await instance.start();
    expect(instance.getState()).toBe('running');

    const response = await fetch(`http://127.0.0.1:17475/`);
    expect(response.ok).toBe(true);

    await instance.stop();

    // Clean up manually since not ephemeral
    const fsModule = await import('node:fs/promises');
    await fsModule.rm(instance.getInstanceDir(), { recursive: true, force: true });
    instance = null;
  });

  it('custom password is returned by start() and works for authentication', async () => {
    const customPassword = 'e2e-custom-pass-42';
    instance = new Neo4jLocal({
      instanceName: `e2e-password-${Date.now()}`,
      ephemeral: true,
      verbose: true,
      ports: {
        bolt: 17689,
        http: 17476,
      },
      credentials: { password: customPassword },
    });

    const creds = await instance.start();

    // Verify the custom password is returned
    expect(creds.password).toBe(customPassword);
    expect(creds.username).toBe('neo4j');

    // Verify stored credentials match
    const stored = await readCredentials(instance.getInstanceDir());
    expect(stored).not.toBeNull();
    expect(stored!.password).toBe(customPassword);
    expect(stored!.username).toBe('neo4j');

    // Verify the password works for HTTP API authentication
    const authHeader = 'Basic ' + Buffer.from(`neo4j:${customPassword}`).toString('base64');
    const response = await fetch(`http://127.0.0.1:17476/db/neo4j/tx/commit`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        statements: [{ statement: 'RETURN 1 AS n' }],
      }),
    });
    expect(response.ok).toBe(true);
    const body = await response.json();
    expect(body.errors).toHaveLength(0);
    expect(body.results[0].data[0].row[0]).toBe(1);

    await instance.stop();
    instance = null;
  });

  it('auto-generated password is stored and works for authentication', async () => {
    instance = new Neo4jLocal({
      instanceName: `e2e-autogen-pass-${Date.now()}`,
      ephemeral: true,
      verbose: true,
      ports: {
        bolt: 17690,
        http: 17477,
      },
    });

    const creds = await instance.start();

    // Password should be auto-generated (16 chars, alphanumeric)
    expect(creds.password.length).toBe(16);
    expect(creds.password).toMatch(/^[A-Za-z0-9]+$/);

    // Verify stored credentials match the returned password
    const stored = await readCredentials(instance.getInstanceDir());
    expect(stored).not.toBeNull();
    expect(stored!.password).toBe(creds.password);

    // Verify the auto-generated password works for authentication
    const authHeader = 'Basic ' + Buffer.from(`neo4j:${creds.password}`).toString('base64');
    const response = await fetch(`http://127.0.0.1:17477/db/neo4j/tx/commit`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        statements: [{ statement: 'RETURN 1 AS n' }],
      }),
    });
    expect(response.ok).toBe(true);
    const body = await response.json();
    expect(body.errors).toHaveLength(0);

    // Verify wrong password is rejected
    const badAuth = 'Basic ' + Buffer.from('neo4j:wrong-password').toString('base64');
    const badResponse = await fetch(`http://127.0.0.1:17477/db/neo4j/tx/commit`, {
      method: 'POST',
      headers: {
        'Authorization': badAuth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        statements: [{ statement: 'RETURN 1 AS n' }],
      }),
    });
    expect(badResponse.status).toBe(401);

    await instance.stop();
    instance = null;
  });
});
