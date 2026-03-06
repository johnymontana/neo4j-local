import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { JavaManager } from '../../src/java-manager.js';
import { PlatformResolver } from '../../src/platform-resolver.js';
import { Logger } from '../../src/logger.js';
import { JavaNotFoundError } from '../../src/errors.js';

describe('JavaManager', () => {
  let manager: JavaManager;
  let logger: Logger;
  let resolver: PlatformResolver;
  let tempDir: string;

  beforeEach(async () => {
    logger = new Logger('test', false);
    resolver = new PlatformResolver(logger);
    const platformInfo = resolver.resolve();
    manager = new JavaManager(platformInfo, resolver, logger);
    tempDir = path.join(os.tmpdir(), `neo4j-jm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('ensureJava()', () => {
    it('throws JavaNotFoundError when auto-download is disabled and no Java is found', async () => {
      // Mock findSystemJava to return null so the test is reliable
      // regardless of whether Java is installed on the host
      vi.spyOn(resolver, 'findSystemJava').mockResolvedValue(null);

      await expect(
        manager.ensureJava({
          neo4jVersion: '5.26.0',
          javaVersion: 21,
          allowAutoDownload: false,
          cachePath: path.join(tempDir, 'empty'),
        }),
      ).rejects.toThrow(JavaNotFoundError);
    });

    it('error message includes instructions when auto-download disabled', async () => {
      vi.spyOn(resolver, 'findSystemJava').mockResolvedValue(null);

      await expect(
        manager.ensureJava({
          neo4jVersion: '5.26.0',
          javaVersion: 21,
          allowAutoDownload: false,
          cachePath: path.join(tempDir, 'empty'),
        }),
      ).rejects.toThrow(/allowAutoDownloadJava/);
    });

    it('returns cached JRE when it exists', async () => {
      // Create a fake cached JRE
      const jrePath = path.join(tempDir, 'jre', '21');
      const binDir = path.join(jrePath, 'bin');
      await fs.mkdir(binDir, { recursive: true });
      await fs.writeFile(path.join(binDir, 'java'), '#!/bin/sh');

      const result = await manager.ensureJava({
        neo4jVersion: '5.26.0',
        javaVersion: 21,
        allowAutoDownload: false,
        cachePath: tempDir,
      });

      expect(result.javaHome).toBe(jrePath);
      expect(result.javaExecutable).toBe(path.join(binDir, 'java'));
      expect(result.version).toBe(21);
    });

    it('returns cached JRE with macOS Contents/Home layout', async () => {
      // Create a fake cached JRE with macOS layout
      const jrePath = path.join(tempDir, 'jre', '21');
      const macBinDir = path.join(jrePath, 'Contents', 'Home', 'bin');
      await fs.mkdir(macBinDir, { recursive: true });
      await fs.writeFile(path.join(macBinDir, 'java'), '#!/bin/sh');

      const result = await manager.ensureJava({
        neo4jVersion: '5.26.0',
        javaVersion: 21,
        allowAutoDownload: false,
        cachePath: tempDir,
      });

      expect(result.javaHome).toBe(path.join(jrePath, 'Contents', 'Home'));
      expect(result.javaExecutable).toBe(path.join(macBinDir, 'java'));
    });

    it('returns cached JRE with nested directory layout', async () => {
      // Create a fake cached JRE with nested subdir (like Adoptium extracts)
      const jrePath = path.join(tempDir, 'jre', '21');
      const nested = path.join(jrePath, 'jdk-21.0.2+13-jre');
      const binDir = path.join(nested, 'bin');
      await fs.mkdir(binDir, { recursive: true });
      await fs.writeFile(path.join(binDir, 'java'), '#!/bin/sh');

      const result = await manager.ensureJava({
        neo4jVersion: '5.26.0',
        javaVersion: 21,
        allowAutoDownload: false,
        cachePath: tempDir,
      });

      expect(result.javaHome).toBe(nested);
      expect(result.javaExecutable).toBe(path.join(binDir, 'java'));
    });

    it('uses system Java when available and compatible', async () => {
      // If system Java 17+ exists, it should be found
      const systemJava = await resolver.findSystemJava();
      if (systemJava && systemJava.version >= 17) {
        const result = await manager.ensureJava({
          neo4jVersion: '5.26.0',
          allowAutoDownload: false,
          cachePath: path.join(tempDir, 'empty'),
        });
        expect(result.version).toBeGreaterThanOrEqual(17);
        expect(result.javaHome).toBeTruthy();
      }
    });
  });
});
