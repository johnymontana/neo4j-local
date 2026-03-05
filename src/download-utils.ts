import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import os from 'node:os';
import * as tar from 'tar';
import { DownloadError } from './errors.js';
import { MAX_DOWNLOAD_RETRIES, RETRY_BASE_DELAY_MS, DOWNLOAD_TIMEOUT_MS } from './constants.js';
import type { DownloadProgressCallback } from './types.js';
import { Logger } from './logger.js';
import { ensureDir } from './fs-utils.js';

export async function downloadFile(
  url: string,
  destPath: string,
  options?: {
    onProgress?: DownloadProgressCallback;
    timeoutMs?: number;
    logger?: Logger;
  },
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? DOWNLOAD_TIMEOUT_MS;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_DOWNLOAD_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });

        if (!response.ok) {
          throw new DownloadError(
            `HTTP ${response.status}: ${response.statusText}`,
            url,
            response.status,
          );
        }

        if (!response.body) {
          throw new DownloadError('Response body is empty', url);
        }

        const totalBytes = parseInt(response.headers.get('content-length') ?? '0', 10);
        let downloadedBytes = 0;

        await ensureDir(path.dirname(destPath));
        const writeStream = createWriteStream(destPath);
        const readable = Readable.fromWeb(response.body as import('stream/web').ReadableStream);

        readable.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          if (options?.onProgress && totalBytes > 0) {
            options.onProgress({
              totalBytes,
              downloadedBytes,
              percentage: Math.round((downloadedBytes / totalBytes) * 100),
            });
          }
        });

        await pipeline(readable, writeStream);
        return;
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      lastError = err as Error;
      const isRetryable =
        lastError instanceof DownloadError
          ? (lastError.statusCode ?? 0) >= 500
          : lastError.name === 'AbortError' ||
            (lastError as NodeJS.ErrnoException).code === 'ECONNRESET' ||
            (lastError as NodeJS.ErrnoException).code === 'ETIMEDOUT';

      if (!isRetryable || attempt === MAX_DOWNLOAD_RETRIES) {
        // Clean up partial download
        try {
          await fs.unlink(destPath);
        } catch {
          // ignore
        }
        break;
      }

      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      options?.logger?.debug(`Download attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError ?? new DownloadError(`Download failed after ${MAX_DOWNLOAD_RETRIES} attempts`, url);
}

export async function downloadAndExtractTarGz(
  url: string,
  destDir: string,
  options?: {
    strip?: number;
    onProgress?: DownloadProgressCallback;
    timeoutMs?: number;
    logger?: Logger;
  },
): Promise<string> {
  const tempFile = path.join(os.tmpdir(), `neo4j-local-${Date.now()}.tar.gz`);

  try {
    options?.logger?.info(`Downloading ${url}...`);
    await downloadFile(url, tempFile, {
      onProgress: options?.onProgress,
      timeoutMs: options?.timeoutMs,
      logger: options?.logger,
    });

    options?.logger?.info(`Extracting to ${destDir}...`);
    await ensureDir(destDir);

    await tar.extract({
      file: tempFile,
      cwd: destDir,
      strip: options?.strip ?? 1,
    });

    return destDir;
  } finally {
    try {
      await fs.unlink(tempFile);
    } catch {
      // ignore cleanup errors
    }
  }
}
