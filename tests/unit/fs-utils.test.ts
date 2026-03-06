import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  getCacheDir,
  getDataDir,
  getInstanceDir,
  getNeo4jCachePath,
  getJreCachePath,
  ensureDir,
  pathExists,
  generatePassword,
  writePidFile,
  readPidFile,
  removePidFile,
  writeCredentials,
  readCredentials,
} from '../../src/fs-utils.js';
import type { StoredCredentials } from '../../src/types.js';

describe('fs-utils', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `neo4j-local-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // --- getCacheDir ---
  describe('getCacheDir()', () => {
    it('returns override path when provided', () => {
      expect(getCacheDir('/custom/path')).toBe('/custom/path');
    });

    it('returns a path containing neo4j-local by default', () => {
      expect(getCacheDir()).toContain('neo4j-local');
    });

    it('respects XDG_CACHE_HOME on Unix', () => {
      if (process.platform === 'win32') return;
      const original = process.env.XDG_CACHE_HOME;
      process.env.XDG_CACHE_HOME = '/tmp/custom-xdg-cache';
      try {
        expect(getCacheDir()).toBe('/tmp/custom-xdg-cache/neo4j-local');
      } finally {
        if (original) { process.env.XDG_CACHE_HOME = original; } else { delete process.env.XDG_CACHE_HOME; }
      }
    });

    it('uses ~/.cache when XDG_CACHE_HOME is not set', () => {
      if (process.platform === 'win32') return;
      const original = process.env.XDG_CACHE_HOME;
      delete process.env.XDG_CACHE_HOME;
      try {
        expect(getCacheDir()).toBe(path.join(os.homedir(), '.cache', 'neo4j-local'));
      } finally {
        if (original) process.env.XDG_CACHE_HOME = original;
      }
    });
  });

  // --- getDataDir ---
  describe('getDataDir()', () => {
    it('returns override path when provided', () => {
      expect(getDataDir('/custom/data')).toBe('/custom/data');
    });

    it('returns a path containing neo4j-local by default', () => {
      expect(getDataDir()).toContain('neo4j-local');
    });

    it('respects XDG_DATA_HOME on Unix', () => {
      if (process.platform === 'win32') return;
      const original = process.env.XDG_DATA_HOME;
      process.env.XDG_DATA_HOME = '/tmp/custom-xdg-data';
      try {
        expect(getDataDir()).toBe('/tmp/custom-xdg-data/neo4j-local');
      } finally {
        if (original) { process.env.XDG_DATA_HOME = original; } else { delete process.env.XDG_DATA_HOME; }
      }
    });
  });

  // --- getInstanceDir ---
  describe('getInstanceDir()', () => {
    it('joins data dir with instance name', () => {
      expect(getInstanceDir('/data', 'my-instance')).toBe(path.join('/data', 'my-instance'));
    });

    it('handles default instance name', () => {
      expect(getInstanceDir('/data', 'default')).toBe(path.join('/data', 'default'));
    });
  });

  // --- getNeo4jCachePath ---
  describe('getNeo4jCachePath()', () => {
    it('builds correct path for community', () => {
      expect(getNeo4jCachePath('/cache', '5.26.0', 'community')).toBe(path.join('/cache', '5.26.0', 'community'));
    });

    it('builds correct path for enterprise', () => {
      expect(getNeo4jCachePath('/cache', '5.26.0', 'enterprise')).toBe(path.join('/cache', '5.26.0', 'enterprise'));
    });
  });

  // --- getJreCachePath ---
  describe('getJreCachePath()', () => {
    it('builds path with java version', () => {
      expect(getJreCachePath('/cache', 21)).toBe(path.join('/cache', 'jre', '21'));
      expect(getJreCachePath('/cache', 17)).toBe(path.join('/cache', 'jre', '17'));
    });
  });

  // --- ensureDir ---
  describe('ensureDir()', () => {
    it('creates nested directories', async () => {
      const nested = path.join(tempDir, 'a', 'b', 'c');
      await ensureDir(nested);
      expect(await pathExists(nested)).toBe(true);
    });

    it('is idempotent', async () => {
      const dir = path.join(tempDir, 'idempotent');
      await ensureDir(dir);
      await ensureDir(dir);
      expect(await pathExists(dir)).toBe(true);
    });

    it('does not throw on existing directory', async () => {
      await expect(ensureDir(tempDir)).resolves.toBeUndefined();
    });
  });

  // --- pathExists ---
  describe('pathExists()', () => {
    it('returns true for existing directory', async () => {
      expect(await pathExists(tempDir)).toBe(true);
    });

    it('returns true for existing file', async () => {
      const file = path.join(tempDir, 'test.txt');
      await fs.writeFile(file, 'hello');
      expect(await pathExists(file)).toBe(true);
    });

    it('returns false for non-existent path', async () => {
      expect(await pathExists(path.join(tempDir, 'nope'))).toBe(false);
    });

    it('returns false for deeply nested non-existent path', async () => {
      expect(await pathExists(path.join(tempDir, 'a', 'b', 'c', 'nope'))).toBe(false);
    });
  });

  // --- generatePassword ---
  describe('generatePassword()', () => {
    it('generates password of specified length', () => {
      expect(generatePassword(20)).toHaveLength(20);
      expect(generatePassword(8)).toHaveLength(8);
      expect(generatePassword(32)).toHaveLength(32);
    });

    it('generates default length of 16', () => {
      expect(generatePassword()).toHaveLength(16);
    });

    it('generates unique passwords', () => {
      const passwords = new Set(Array.from({ length: 50 }, () => generatePassword()));
      expect(passwords.size).toBe(50);
    });

    it('uses only alphanumeric characters', () => {
      for (let i = 0; i < 10; i++) {
        expect(generatePassword(100)).toMatch(/^[A-Za-z0-9]+$/);
      }
    });

    it('handles length of 1', () => {
      const p = generatePassword(1);
      expect(p).toHaveLength(1);
      expect(p).toMatch(/^[A-Za-z0-9]$/);
    });
  });

  // --- PID file operations ---
  describe('PID file operations', () => {
    it('writes and reads PID', async () => {
      await writePidFile(tempDir, 12345);
      expect(await readPidFile(tempDir)).toBe(12345);
    });

    it('handles large PIDs', async () => {
      await writePidFile(tempDir, 999999);
      expect(await readPidFile(tempDir)).toBe(999999);
    });

    it('returns null for missing PID file', async () => {
      expect(await readPidFile(path.join(tempDir, 'no-pid'))).toBeNull();
    });

    it('returns null for empty PID file', async () => {
      await fs.writeFile(path.join(tempDir, 'neo4j.pid'), '', 'utf-8');
      expect(await readPidFile(tempDir)).toBeNull();
    });

    it('returns null for non-numeric PID file', async () => {
      await fs.writeFile(path.join(tempDir, 'neo4j.pid'), 'not-a-number', 'utf-8');
      expect(await readPidFile(tempDir)).toBeNull();
    });

    it('overwrites existing PID file', async () => {
      await writePidFile(tempDir, 111);
      await writePidFile(tempDir, 222);
      expect(await readPidFile(tempDir)).toBe(222);
    });

    it('removes PID file', async () => {
      await writePidFile(tempDir, 12345);
      await removePidFile(tempDir);
      expect(await readPidFile(tempDir)).toBeNull();
    });

    it('removePidFile does not throw for missing file', async () => {
      await expect(removePidFile(tempDir)).resolves.toBeUndefined();
    });

    it('removePidFile does not throw for non-existent directory', async () => {
      await expect(removePidFile(path.join(tempDir, 'no-dir'))).resolves.toBeUndefined();
    });
  });

  // --- credentials operations ---
  describe('credentials operations', () => {
    const sampleCreds: StoredCredentials = {
      username: 'neo4j',
      password: 'testpass123',
      ports: { bolt: 7687, http: 7474, https: 7473 },
      version: '5.26.0',
      edition: 'community',
    };

    it('writes and reads credentials', async () => {
      await writeCredentials(tempDir, sampleCreds);
      expect(await readCredentials(tempDir)).toEqual(sampleCreds);
    });

    it('preserves all credential fields including enterprise edition', async () => {
      const creds: StoredCredentials = {
        username: 'admin',
        password: 'SuperSecret',
        ports: { bolt: 17687, http: 17474, https: 17473 },
        version: '4.4.35',
        edition: 'enterprise',
      };
      await writeCredentials(tempDir, creds);
      expect(await readCredentials(tempDir)).toEqual(creds);
    });

    it('overwrites existing credentials', async () => {
      await writeCredentials(tempDir, sampleCreds);
      const newCreds = { ...sampleCreds, password: 'newpass' };
      await writeCredentials(tempDir, newCreds);
      expect((await readCredentials(tempDir))?.password).toBe('newpass');
    });

    it('returns null for missing credentials file', async () => {
      expect(await readCredentials(path.join(tempDir, 'no-creds'))).toBeNull();
    });

    it('returns null for malformed JSON', async () => {
      await fs.writeFile(path.join(tempDir, 'credentials.json'), '{bad json', 'utf-8');
      expect(await readCredentials(tempDir)).toBeNull();
    });

    it('creates parent directory if needed', async () => {
      const nested = path.join(tempDir, 'sub', 'dir');
      await writeCredentials(nested, sampleCreds);
      expect(await readCredentials(nested)).toEqual(sampleCreds);
    });

    it('roundtrips password with special characters', async () => {
      const creds: StoredCredentials = {
        ...sampleCreds,
        password: 'p@$$w0rd!#%^&*()_+-={}[]|;:\'"<>,.?/~`',
      };
      await writeCredentials(tempDir, creds);
      const read = await readCredentials(tempDir);
      expect(read!.password).toBe(creds.password);
    });

    it('roundtrips empty string password', async () => {
      const creds: StoredCredentials = { ...sampleCreds, password: '' };
      await writeCredentials(tempDir, creds);
      const read = await readCredentials(tempDir);
      expect(read!.password).toBe('');
    });

    it('roundtrips password containing JSON-special characters', async () => {
      const creds: StoredCredentials = {
        ...sampleCreds,
        password: 'has"quotes\\and\nnewlines',
      };
      await writeCredentials(tempDir, creds);
      const read = await readCredentials(tempDir);
      expect(read!.password).toBe('has"quotes\\and\nnewlines');
    });
  });
});
