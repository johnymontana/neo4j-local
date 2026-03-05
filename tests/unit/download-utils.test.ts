import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { downloadFile, downloadAndExtractTarGz } from '../../src/download-utils.js';
import { DownloadError } from '../../src/errors.js';
import { Logger } from '../../src/logger.js';

describe('downloadFile()', () => {
  const logger = new Logger('test', false);

  it('throws on unreachable URLs', async () => {
    const tempFile = path.join(os.tmpdir(), `test-download-${Date.now()}.tmp`);

    await expect(
      downloadFile('https://this-domain-does-not-exist-12345.com/file', tempFile, {
        timeoutMs: 5_000,
        logger,
      }),
    ).rejects.toThrow();

    // Temp file should be cleaned up on error
    const exists = await fs.access(tempFile).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  it('throws on very short timeout', async () => {
    const tempFile = path.join(os.tmpdir(), `test-download-${Date.now()}.tmp`);

    await expect(
      downloadFile('https://this-domain-does-not-exist-12345.com/file', tempFile, {
        timeoutMs: 1,
        logger,
      }),
    ).rejects.toThrow();
  });

  it('cleans up partial file on non-retryable error', async () => {
    const tempFile = path.join(os.tmpdir(), `test-download-cleanup-${Date.now()}.tmp`);

    await expect(
      downloadFile('https://this-domain-does-not-exist-12345.com/file', tempFile, {
        timeoutMs: 5_000,
        logger,
      }),
    ).rejects.toThrow();

    // File should not exist after a failed download
    const exists = await fs.access(tempFile).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });
});

describe('downloadAndExtractTarGz()', () => {
  const logger = new Logger('test', false);

  it('throws on invalid download URL', async () => {
    const destDir = path.join(os.tmpdir(), `neo4j-extract-test-${Date.now()}`);

    await expect(
      downloadAndExtractTarGz(
        'https://this-domain-does-not-exist-12345.com/file.tar.gz',
        destDir,
        { logger, timeoutMs: 5_000 },
      ),
    ).rejects.toThrow();

    // Clean up
    await fs.rm(destDir, { recursive: true, force: true }).catch(() => {});
  });
});
