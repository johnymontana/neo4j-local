import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigManager } from '../../src/config-manager.js';
import { Logger } from '../../src/logger.js';

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
});
