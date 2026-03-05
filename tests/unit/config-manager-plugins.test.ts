import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ConfigManager } from '../../src/config-manager.js';
import { Logger } from '../../src/logger.js';

describe('ConfigManager - Plugin Support', () => {
  let manager: ConfigManager;
  let tempDir: string;
  let fakeNeo4jHome: string;

  beforeEach(async () => {
    const logger = new Logger('test', false);
    manager = new ConfigManager(logger);
    tempDir = path.join(os.tmpdir(), `neo4j-cm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fakeNeo4jHome = path.join(tempDir, 'neo4j-home');

    // Create a fake Neo4j home with labs/ and products/ directories
    await fs.mkdir(path.join(fakeNeo4jHome, 'labs'), { recursive: true });
    await fs.mkdir(path.join(fakeNeo4jHome, 'products'), { recursive: true });
    await fs.mkdir(path.join(fakeNeo4jHome, 'plugins'), { recursive: true });
    await fs.mkdir(path.join(fakeNeo4jHome, 'bin'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('setupPlugins()', () => {
    it('copies APOC JAR from labs/ to plugins/', async () => {
      await fs.writeFile(
        path.join(fakeNeo4jHome, 'labs', 'apoc-5.26.0-core.jar'),
        'fake-jar-content',
      );

      await manager.setupPlugins(fakeNeo4jHome, ['apoc']);

      const dest = path.join(fakeNeo4jHome, 'plugins', 'apoc-5.26.0-core.jar');
      const exists = await fs.access(dest).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('copies GDS JAR from products/ to plugins/', async () => {
      await fs.writeFile(
        path.join(fakeNeo4jHome, 'products', 'neo4j-graph-data-science-2.12.0.jar'),
        'fake-jar-content',
      );

      await manager.setupPlugins(fakeNeo4jHome, ['gds']);

      const dest = path.join(fakeNeo4jHome, 'plugins', 'neo4j-graph-data-science-2.12.0.jar');
      const exists = await fs.access(dest).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('copies GenAI JAR from products/ to plugins/', async () => {
      await fs.writeFile(
        path.join(fakeNeo4jHome, 'products', 'neo4j-genai-5.26.0.jar'),
        'fake-jar-content',
      );

      await manager.setupPlugins(fakeNeo4jHome, ['genai']);

      const dest = path.join(fakeNeo4jHome, 'plugins', 'neo4j-genai-5.26.0.jar');
      const exists = await fs.access(dest).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('installs all three plugins at once', async () => {
      await fs.writeFile(path.join(fakeNeo4jHome, 'labs', 'apoc-5.26.0-core.jar'), 'data');
      await fs.writeFile(path.join(fakeNeo4jHome, 'products', 'neo4j-graph-data-science-2.12.0.jar'), 'data');
      await fs.writeFile(path.join(fakeNeo4jHome, 'products', 'neo4j-genai-5.26.0.jar'), 'data');

      await manager.setupPlugins(fakeNeo4jHome, ['apoc', 'gds', 'genai']);

      const pluginFiles = await fs.readdir(path.join(fakeNeo4jHome, 'plugins'));
      expect(pluginFiles).toHaveLength(3);
      expect(pluginFiles).toContain('apoc-5.26.0-core.jar');
      expect(pluginFiles).toContain('neo4j-graph-data-science-2.12.0.jar');
      expect(pluginFiles).toContain('neo4j-genai-5.26.0.jar');
    });

    it('skips plugin when JAR not found in distribution', async () => {
      // No JARs created — all plugins should be skipped gracefully
      await manager.setupPlugins(fakeNeo4jHome, ['apoc', 'gds', 'genai']);

      const pluginFiles = await fs.readdir(path.join(fakeNeo4jHome, 'plugins'));
      expect(pluginFiles).toHaveLength(0);
    });

    it('does not duplicate JAR if already in plugins/', async () => {
      const jarName = 'apoc-5.26.0-core.jar';
      await fs.writeFile(path.join(fakeNeo4jHome, 'labs', jarName), 'source');
      await fs.writeFile(path.join(fakeNeo4jHome, 'plugins', jarName), 'already-installed');

      await manager.setupPlugins(fakeNeo4jHome, ['apoc']);

      // Should keep the existing file, not overwrite
      const content = await fs.readFile(path.join(fakeNeo4jHome, 'plugins', jarName), 'utf-8');
      expect(content).toBe('already-installed');
    });

    it('creates plugins/ directory if it does not exist', async () => {
      await fs.rm(path.join(fakeNeo4jHome, 'plugins'), { recursive: true });
      await fs.writeFile(path.join(fakeNeo4jHome, 'labs', 'apoc-5.26.0-core.jar'), 'data');

      await manager.setupPlugins(fakeNeo4jHome, ['apoc']);

      const exists = await fs.access(path.join(fakeNeo4jHome, 'plugins')).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('handles empty plugins array', async () => {
      await expect(manager.setupPlugins(fakeNeo4jHome, [])).resolves.toBeUndefined();
    });

    it('handles APOC in products/ directory as fallback', async () => {
      await fs.writeFile(
        path.join(fakeNeo4jHome, 'products', 'apoc-5.26.0-core.jar'),
        'from-products',
      );

      await manager.setupPlugins(fakeNeo4jHome, ['apoc']);

      const dest = path.join(fakeNeo4jHome, 'plugins', 'apoc-5.26.0-core.jar');
      const content = await fs.readFile(dest, 'utf-8');
      expect(content).toBe('from-products');
    });

    it('handles missing labs/ directory gracefully', async () => {
      await fs.rm(path.join(fakeNeo4jHome, 'labs'), { recursive: true });
      await fs.writeFile(
        path.join(fakeNeo4jHome, 'products', 'neo4j-genai-5.26.0.jar'),
        'data',
      );

      await manager.setupPlugins(fakeNeo4jHome, ['apoc', 'genai']);

      const pluginFiles = await fs.readdir(path.join(fakeNeo4jHome, 'plugins'));
      // APOC should be skipped (labs/ doesn't exist), GenAI should be installed
      expect(pluginFiles).toContain('neo4j-genai-5.26.0.jar');
    });
  });
});
