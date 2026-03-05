import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { BinaryManager } from '../../src/binary-manager.js';
import { PlatformResolver } from '../../src/platform-resolver.js';
import { Logger } from '../../src/logger.js';

describe('BinaryManager', () => {
  let manager: BinaryManager;
  let tempDir: string;

  beforeEach(async () => {
    const logger = new Logger('test', false);
    const resolver = new PlatformResolver(logger);
    const platformInfo = resolver.resolve();
    manager = new BinaryManager(platformInfo, logger);
    tempDir = path.join(os.tmpdir(), `neo4j-bm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('buildDownloadUrl()', () => {
    it('builds correct URL for community edition on Unix', () => {
      const url = manager.buildDownloadUrl('5.26.0', 'community');
      expect(url).toContain('https://dist.neo4j.org/neo4j-community-5.26.0-');
      if (process.platform === 'win32') {
        expect(url.endsWith('-windows.zip')).toBe(true);
      } else {
        expect(url.endsWith('-unix.tar.gz')).toBe(true);
      }
    });

    it('builds correct URL for enterprise edition', () => {
      const url = manager.buildDownloadUrl('5.26.0', 'enterprise');
      expect(url).toContain('https://dist.neo4j.org/neo4j-enterprise-5.26.0-');
    });

    it('handles various version formats', () => {
      expect(manager.buildDownloadUrl('5.18.0', 'community')).toContain('neo4j-community-5.18.0');
      expect(manager.buildDownloadUrl('4.4.35', 'community')).toContain('neo4j-community-4.4.35');
      expect(manager.buildDownloadUrl('2025.01', 'community')).toContain('neo4j-community-2025.01');
    });

    it('produces fully-formed HTTPS URLs', () => {
      const url = manager.buildDownloadUrl('5.26.0', 'community');
      expect(url).toMatch(/^https:\/\//);
    });
  });

  describe('listCachedVersions()', () => {
    it('returns empty array for non-existent cache dir', async () => {
      const versions = await manager.listCachedVersions(path.join(tempDir, 'nonexistent'));
      expect(versions).toEqual([]);
    });

    it('returns empty array for empty cache dir', async () => {
      const versions = await manager.listCachedVersions(tempDir);
      expect(versions).toEqual([]);
    });

    it('lists single cached version', async () => {
      await fs.mkdir(path.join(tempDir, '5.26.0', 'community'), { recursive: true });
      const versions = await manager.listCachedVersions(tempDir);
      expect(versions).toEqual([{ version: '5.26.0', edition: 'community' }]);
    });

    it('lists multiple cached versions', async () => {
      await fs.mkdir(path.join(tempDir, '5.26.0', 'community'), { recursive: true });
      await fs.mkdir(path.join(tempDir, '5.18.0', 'enterprise'), { recursive: true });
      const versions = await manager.listCachedVersions(tempDir);
      expect(versions).toHaveLength(2);
      expect(versions).toContainEqual({ version: '5.26.0', edition: 'community' });
      expect(versions).toContainEqual({ version: '5.18.0', edition: 'enterprise' });
    });

    it('ignores jre directory in cache', async () => {
      await fs.mkdir(path.join(tempDir, 'jre', '21'), { recursive: true });
      await fs.mkdir(path.join(tempDir, '5.26.0', 'community'), { recursive: true });
      const versions = await manager.listCachedVersions(tempDir);
      expect(versions).toHaveLength(1);
      expect(versions[0].version).toBe('5.26.0');
    });

    it('ignores non-edition directories', async () => {
      await fs.mkdir(path.join(tempDir, '5.26.0', 'something-else'), { recursive: true });
      const versions = await manager.listCachedVersions(tempDir);
      expect(versions).toEqual([]);
    });
  });

  describe('clearCache()', () => {
    it('removes the entire cache directory', async () => {
      await fs.mkdir(path.join(tempDir, '5.26.0', 'community'), { recursive: true });
      await fs.writeFile(path.join(tempDir, '5.26.0', 'community', 'dummy'), 'data');
      await manager.clearCache(tempDir);

      const exists = await fs.access(tempDir).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    it('does not throw on non-existent cache', async () => {
      await expect(manager.clearCache(path.join(tempDir, 'nonexistent'))).resolves.toBeUndefined();
    });
  });

  describe('ensureBinary()', () => {
    it('throws when auto-download is disabled and binary is not cached', async () => {
      await expect(
        manager.ensureBinary({
          version: '5.26.0',
          edition: 'community',
          allowAutoDownload: false,
          cachePath: path.join(tempDir, 'empty-cache'),
        }),
      ).rejects.toThrow(/not cached/);
    });

    it('returns cached binary when cache is valid', async () => {
      // Create a fake cached binary with bin/neo4j
      const cachePath = path.join(tempDir, '5.26.0', 'community');
      const binDir = path.join(cachePath, 'bin');
      await fs.mkdir(binDir, { recursive: true });
      await fs.writeFile(path.join(binDir, process.platform === 'win32' ? 'neo4j.bat' : 'neo4j'), '#!/bin/sh');

      const result = await manager.ensureBinary({
        version: '5.26.0',
        edition: 'community',
        allowAutoDownload: false,
        cachePath: tempDir,
      });

      expect(result.neo4jHome).toBe(cachePath);
      expect(result.version).toBe('5.26.0');
      expect(result.edition).toBe('community');
    });
  });
});
