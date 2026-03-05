import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RuntimeManager } from '../../src/runtime-manager.js';
import { Logger } from '../../src/logger.js';

describe('RuntimeManager', () => {
  let manager: RuntimeManager;

  beforeEach(() => {
    const logger = new Logger('test', false);
    manager = new RuntimeManager(logger);
  });

  describe('initial state', () => {
    it('isRunning() returns false initially', () => {
      expect(manager.isRunning()).toBe(false);
    });

    it('getPid() returns undefined initially', () => {
      expect(manager.getPid()).toBeUndefined();
    });

    it('getUptime() returns null initially', () => {
      expect(manager.getUptime()).toBeNull();
    });
  });

  describe('checkHealth()', () => {
    it('returns false for non-listening port', async () => {
      // Use a port unlikely to have anything listening
      const healthy = await manager.checkHealth(19999);
      expect(healthy).toBe(false);
    });

    it('returns false for invalid port', async () => {
      const healthy = await manager.checkHealth(0);
      expect(healthy).toBe(false);
    });
  });

  describe('stop()', () => {
    it('does not throw when no process is running', async () => {
      await expect(manager.stop()).resolves.toBeUndefined();
    });

    it('accepts custom shutdown timeout', async () => {
      await expect(manager.stop({ shutdownTimeout: 1000 })).resolves.toBeUndefined();
    });
  });

  describe('start()', () => {
    it('throws StartupError for non-existent neo4j binary', async () => {
      await expect(
        manager.start({
          neo4jHome: '/nonexistent/neo4j',
          javaHome: '/nonexistent/java',
          confDir: '/nonexistent/conf',
          ports: { bolt: 7687, http: 7474, https: 7473 },
          startupTimeout: 5_000,
        }),
      ).rejects.toThrow();
    });
  });
});
