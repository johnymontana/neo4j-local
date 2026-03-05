import { describe, it, expect, beforeEach } from 'vitest';
import { PlatformResolver } from '../../src/platform-resolver.js';
import { Logger } from '../../src/logger.js';

describe('PlatformResolver', () => {
  let logger: Logger;
  let resolver: PlatformResolver;

  beforeEach(() => {
    logger = new Logger('test', false);
    resolver = new PlatformResolver(logger);
  });

  describe('resolve()', () => {
    it('returns all required PlatformInfo fields', () => {
      const info = resolver.resolve();
      expect(info).toHaveProperty('os');
      expect(info).toHaveProperty('arch');
      expect(info).toHaveProperty('neo4jDistSuffix');
      expect(info).toHaveProperty('archiveExtension');
      expect(info).toHaveProperty('adoptiumOs');
      expect(info).toHaveProperty('adoptiumArch');
    });

    it('resolves the current platform correctly', () => {
      const info = resolver.resolve();
      expect(info.os).toBe(process.platform);

      if (process.platform === 'darwin') {
        expect(info.neo4jDistSuffix).toBe('unix');
        expect(info.archiveExtension).toBe('.tar.gz');
        expect(info.adoptiumOs).toBe('mac');
      } else if (process.platform === 'linux') {
        expect(info.neo4jDistSuffix).toBe('unix');
        expect(info.archiveExtension).toBe('.tar.gz');
        expect(info.adoptiumOs).toBe('linux');
      } else if (process.platform === 'win32') {
        expect(info.neo4jDistSuffix).toBe('windows');
        expect(info.archiveExtension).toBe('.zip');
        expect(info.adoptiumOs).toBe('windows');
      }
    });

    it('maps arm64 to aarch64 for Adoptium', () => {
      const info = resolver.resolve();
      if (process.arch === 'arm64') {
        expect(info.adoptiumArch).toBe('aarch64');
      } else if (process.arch === 'x64') {
        expect(info.adoptiumArch).toBe('x64');
      }
    });

    it('resolves arch as x64 or arm64', () => {
      const info = resolver.resolve();
      expect(['x64', 'arm64']).toContain(info.arch);
    });

    it('returns consistent results on repeated calls', () => {
      const info1 = resolver.resolve();
      const info2 = resolver.resolve();
      expect(info1).toEqual(info2);
    });
  });

  describe('findSystemJava()', () => {
    it('returns valid result or null without throwing', async () => {
      const result = await resolver.findSystemJava();
      if (result !== null) {
        expect(typeof result.path).toBe('string');
        expect(result.path.length).toBeGreaterThan(0);
        expect(typeof result.version).toBe('number');
        expect(result.version).toBeGreaterThan(0);
      } else {
        expect(result).toBeNull();
      }
    });

    it('handles missing JAVA_HOME gracefully', async () => {
      const original = process.env.JAVA_HOME;
      delete process.env.JAVA_HOME;
      try {
        const result = await resolver.findSystemJava();
        expect(result === null || typeof result.version === 'number').toBe(true);
      } finally {
        if (original) process.env.JAVA_HOME = original;
      }
    });

    it('handles JAVA_HOME pointing to non-existent path', async () => {
      const original = process.env.JAVA_HOME;
      process.env.JAVA_HOME = '/nonexistent/java/home';
      try {
        const result = await resolver.findSystemJava();
        // Should gracefully fall back to PATH or return null
        expect(result === null || typeof result.version === 'number').toBe(true);
      } finally {
        if (original) {
          process.env.JAVA_HOME = original;
        } else {
          delete process.env.JAVA_HOME;
        }
      }
    });

    it('handles JAVA_HOME set to empty string', async () => {
      const original = process.env.JAVA_HOME;
      process.env.JAVA_HOME = '';
      try {
        const result = await resolver.findSystemJava();
        expect(result === null || typeof result.version === 'number').toBe(true);
      } finally {
        if (original) {
          process.env.JAVA_HOME = original;
        } else {
          delete process.env.JAVA_HOME;
        }
      }
    });
  });
});
