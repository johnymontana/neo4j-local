import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ConfigManager } from '../../src/config-manager.js';
import { Logger } from '../../src/logger.js';
import { readCredentials } from '../../src/fs-utils.js';

describe('ConfigManager', () => {
  let manager: ConfigManager;

  beforeEach(() => {
    const logger = new Logger('test', false);
    manager = new ConfigManager(logger);
  });

  describe('generateNeo4jConf()', () => {
    it('generates config with correct port settings', () => {
      const conf = manager.generateNeo4jConf({
        ports: { bolt: 7687, http: 7474, https: 7473 },
        instanceDir: '/tmp/test-instance',
      });

      expect(conf).toContain('server.bolt.listen_address=:7687');
      expect(conf).toContain('server.http.listen_address=:7474');
      expect(conf).toContain('server.https.enabled=false');
    });

    it('generates config with custom ports', () => {
      const conf = manager.generateNeo4jConf({
        ports: { bolt: 17687, http: 17474, https: 17473 },
        instanceDir: '/tmp/test-instance',
      });

      expect(conf).toContain('server.bolt.listen_address=:17687');
      expect(conf).toContain('server.http.listen_address=:17474');
    });

    it('redirects data directories to instance dir', () => {
      const conf = manager.generateNeo4jConf({
        ports: { bolt: 7687, http: 7474, https: 7473 },
        instanceDir: '/tmp/test-instance',
      });

      expect(conf).toContain('server.directories.data=/tmp/test-instance/data');
      expect(conf).toContain('server.directories.logs=/tmp/test-instance/logs');
      expect(conf).toContain('server.directories.run=/tmp/test-instance/run');
    });

    it('includes dev-friendly defaults', () => {
      const conf = manager.generateNeo4jConf({
        ports: { bolt: 7687, http: 7474, https: 7473 },
        instanceDir: '/tmp/test-instance',
      });

      expect(conf).toContain('server.memory.heap.initial_size=256m');
      expect(conf).toContain('server.memory.heap.max_size=512m');
      expect(conf).toContain('server.memory.pagecache.size=128m');
      expect(conf).toContain('dbms.usage_report.enabled=false');
      expect(conf).toContain('server.default_listen_address=127.0.0.1');
    });

    it('merges additional config overrides', () => {
      const conf = manager.generateNeo4jConf({
        ports: { bolt: 7687, http: 7474, https: 7473 },
        instanceDir: '/tmp/test-instance',
        additionalConfig: {
          'server.memory.heap.max_size': '2g',
          'dbms.security.procedures.unrestricted': 'apoc.*',
        },
      });

      // Override should take precedence
      expect(conf).toContain('server.memory.heap.max_size=2g');
      expect(conf).toContain('dbms.security.procedures.unrestricted=apoc.*');
    });

    it('includes header comment', () => {
      const conf = manager.generateNeo4jConf({
        ports: { bolt: 7687, http: 7474, https: 7473 },
        instanceDir: '/tmp/test-instance',
      });

      expect(conf).toContain('# neo4j-local generated configuration');
    });

    it('adds plugin procedure namespaces for all default plugins', () => {
      const conf = manager.generateNeo4jConf({
        ports: { bolt: 7687, http: 7474, https: 7473 },
        instanceDir: '/tmp/test-instance',
        plugins: ['apoc', 'gds', 'genai'],
      });

      expect(conf).toContain('dbms.security.procedures.unrestricted=apoc.*,gds.*,genai.*');
      expect(conf).toContain('dbms.security.procedures.allowlist=apoc.*,gds.*,genai.*');
    });

    it('adds plugin procedure namespaces for subset of plugins', () => {
      const conf = manager.generateNeo4jConf({
        ports: { bolt: 7687, http: 7474, https: 7473 },
        instanceDir: '/tmp/test-instance',
        plugins: ['apoc'],
      });

      expect(conf).toContain('dbms.security.procedures.unrestricted=apoc.*');
      expect(conf).toContain('dbms.security.procedures.allowlist=apoc.*');
      expect(conf).not.toContain('gds.*');
      expect(conf).not.toContain('genai.*');
    });

    it('omits procedure settings when no plugins', () => {
      const conf = manager.generateNeo4jConf({
        ports: { bolt: 7687, http: 7474, https: 7473 },
        instanceDir: '/tmp/test-instance',
        plugins: [],
      });

      expect(conf).not.toContain('dbms.security.procedures.unrestricted');
      expect(conf).not.toContain('dbms.security.procedures.allowlist');
    });

    it('allows additionalConfig to override plugin procedure settings', () => {
      const conf = manager.generateNeo4jConf({
        ports: { bolt: 7687, http: 7474, https: 7473 },
        instanceDir: '/tmp/test-instance',
        plugins: ['apoc', 'gds', 'genai'],
        additionalConfig: {
          'dbms.security.procedures.unrestricted': 'apoc.*,custom.*',
        },
      });

      // additionalConfig should override the auto-generated value
      expect(conf).toContain('dbms.security.procedures.unrestricted=apoc.*,custom.*');
    });
  });

  describe('setupInstance() password handling', () => {
    let tempDir: string;
    let instanceDir: string;
    let neo4jHome: string;

    beforeEach(async () => {
      tempDir = path.join(os.tmpdir(), `neo4j-config-test-${Date.now()}`);
      instanceDir = path.join(tempDir, 'instance');
      neo4jHome = path.join(tempDir, 'neo4j-home');

      // Create a fake neo4j-admin that succeeds
      const binDir = path.join(neo4jHome, 'bin');
      await fs.mkdir(binDir, { recursive: true });
      await fs.writeFile(path.join(binDir, 'neo4j-admin'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
      vi.restoreAllMocks();
    });

    it('stores custom password in credentials.json', async () => {
      await manager.setupInstance({
        neo4jHome,
        instanceDir,
        ports: { bolt: 7687, http: 7474, https: 7473 },
        credentials: { username: 'neo4j', password: 'my-custom-pass' },
        javaExecutable: '/usr/bin/java',
        javaHome: '/usr/lib/jvm/java-21',
        version: '5.26.0',
        edition: 'community',
        plugins: [],
      });

      const stored = await readCredentials(instanceDir);
      expect(stored).not.toBeNull();
      expect(stored!.password).toBe('my-custom-pass');
      expect(stored!.username).toBe('neo4j');
    });

    it('stores password with special characters in credentials.json', async () => {
      const specialPassword = 'p@$$w0rd!#%^&*()_+-={}[]|;:\'"<>,.?/~`';

      await manager.setupInstance({
        neo4jHome,
        instanceDir,
        ports: { bolt: 7687, http: 7474, https: 7473 },
        credentials: { username: 'neo4j', password: specialPassword },
        javaExecutable: '/usr/bin/java',
        javaHome: '/usr/lib/jvm/java-21',
        version: '5.26.0',
        edition: 'community',
        plugins: [],
      });

      const stored = await readCredentials(instanceDir);
      expect(stored!.password).toBe(specialPassword);
    });

    it('writes neo4j.conf with auth enabled alongside password setup', async () => {
      await manager.setupInstance({
        neo4jHome,
        instanceDir,
        ports: { bolt: 7687, http: 7474, https: 7473 },
        credentials: { username: 'neo4j', password: 'admin-test-pass' },
        javaExecutable: '/usr/bin/java',
        javaHome: '/usr/lib/jvm/java-21',
        version: '5.26.0',
        edition: 'community',
        plugins: [],
      });

      // Verify neo4j.conf was written with auth enabled
      const confPath = path.join(instanceDir, 'conf', 'neo4j.conf');
      const confContent = await fs.readFile(confPath, 'utf-8');
      expect(confContent).toContain('dbms.security.auth_enabled=true');

      // Verify the password was stored correctly
      const stored = await readCredentials(instanceDir);
      expect(stored!.password).toBe('admin-test-pass');
    });

    it('stores ports alongside password in credentials.json', async () => {
      await manager.setupInstance({
        neo4jHome,
        instanceDir,
        ports: { bolt: 17687, http: 17474, https: 17473 },
        credentials: { username: 'neo4j', password: 'test123' },
        javaExecutable: '/usr/bin/java',
        javaHome: '/usr/lib/jvm/java-21',
        version: '5.26.0',
        edition: 'community',
        plugins: [],
      });

      const stored = await readCredentials(instanceDir);
      expect(stored!.password).toBe('test123');
      expect(stored!.ports.bolt).toBe(17687);
      expect(stored!.ports.http).toBe(17474);
      expect(stored!.version).toBe('5.26.0');
      expect(stored!.edition).toBe('community');
    });
  });
});
