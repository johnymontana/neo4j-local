import fs from 'node:fs/promises';
import path from 'node:path';
import { ADOPTIUM_API_BASE_URL, DEFAULT_JAVA_VERSION } from './constants.js';
import { JavaNotFoundError } from './errors.js';
import type { CachedJre, PlatformInfo } from './types.js';
import { Logger } from './logger.js';
import { PlatformResolver } from './platform-resolver.js';
import { downloadAndExtractTarGz, downloadFile } from './download-utils.js';
import { ensureDir, getJreCachePath, pathExists } from './fs-utils.js';

export class JavaManager {
  constructor(
    private readonly platformInfo: PlatformInfo,
    private readonly platformResolver: PlatformResolver,
    private readonly logger: Logger,
  ) {}

  async ensureJava(options: {
    neo4jVersion: string;
    javaVersion?: number;
    allowAutoDownload: boolean;
    cachePath: string;
  }): Promise<CachedJre> {
    const javaVersion = options.javaVersion ?? DEFAULT_JAVA_VERSION;

    // Step 1: Check cache
    const cachedJrePath = getJreCachePath(options.cachePath, javaVersion);
    const cached = await this.findCachedJre(cachedJrePath, javaVersion);
    if (cached) {
      this.logger.debug(`Using cached JRE ${javaVersion} at ${cached.javaHome}`);
      return cached;
    }

    // Step 2: Check system Java
    const systemJava = await this.platformResolver.findSystemJava();
    if (systemJava && systemJava.version >= 17) {
      this.logger.info(`Using system Java ${systemJava.version} at ${systemJava.path}`);
      return {
        javaHome: systemJava.path,
        javaExecutable: path.join(systemJava.path, 'bin', 'java'),
        version: systemJava.version,
      };
    }

    // Step 3: Auto-download
    if (!options.allowAutoDownload) {
      throw new JavaNotFoundError(
        `Java ${javaVersion}+ is required but not found. ` +
        'Install a JRE/JDK 17+ or set allowAutoDownloadJava: true to auto-download.',
      );
    }

    this.logger.info(`Downloading JRE ${javaVersion}...`);
    return this.downloadJre(javaVersion, options.cachePath);
  }

  async downloadJre(javaVersion: number, cachePath: string): Promise<CachedJre> {
    const jreCachePath = getJreCachePath(cachePath, javaVersion);
    const url = this.buildAdoptiumUrl(javaVersion);

    if (this.platformInfo.os === 'win32') {
      // Windows: download zip
      const tempFile = path.join(cachePath, `jre-${javaVersion}-temp.zip`);
      try {
        await downloadFile(url, tempFile, { logger: this.logger });
        // TODO: zip extraction for Windows support (Phase 2)
        throw new JavaNotFoundError('Windows JRE auto-download is not yet supported');
      } finally {
        try { await fs.unlink(tempFile); } catch { /* ignore */ }
      }
    } else {
      // macOS/Linux: download tar.gz
      await downloadAndExtractTarGz(url, jreCachePath, {
        strip: 1,
        logger: this.logger,
      });
    }

    // Find the java binary in the extracted directory
    const jre = await this.findJreBinary(jreCachePath, javaVersion);
    if (!jre) {
      throw new JavaNotFoundError(
        `Downloaded JRE but could not find java binary in ${jreCachePath}`,
      );
    }

    // Ensure java is executable
    await fs.chmod(jre.javaExecutable, 0o755);

    this.logger.info(`JRE ${javaVersion} installed at ${jre.javaHome}`);
    return jre;
  }

  private buildAdoptiumUrl(javaVersion: number): string {
    const { adoptiumOs, adoptiumArch } = this.platformInfo;
    return `${ADOPTIUM_API_BASE_URL}/binary/latest/${javaVersion}/ga/${adoptiumOs}/${adoptiumArch}/jre/hotspot/normal/eclipse`;
  }

  private async findCachedJre(jreCachePath: string, javaVersion: number): Promise<CachedJre | null> {
    if (!(await pathExists(jreCachePath))) {
      return null;
    }
    return this.findJreBinary(jreCachePath, javaVersion);
  }

  private async findJreBinary(basePath: string, javaVersion: number): Promise<CachedJre | null> {
    // On macOS, the JRE has a Contents/Home structure
    // On Linux, bin/java is directly in the extracted dir
    // Since we strip 1 level, check both patterns

    const candidates = [
      // Linux layout (direct)
      { javaHome: basePath, javaBin: path.join(basePath, 'bin', 'java') },
      // macOS layout (Contents/Home nested)
      { javaHome: path.join(basePath, 'Contents', 'Home'), javaBin: path.join(basePath, 'Contents', 'Home', 'bin', 'java') },
    ];

    for (const candidate of candidates) {
      if (await pathExists(candidate.javaBin)) {
        return {
          javaHome: candidate.javaHome,
          javaExecutable: candidate.javaBin,
          version: javaVersion,
        };
      }
    }

    // Fallback: scan one level deep for a directory containing bin/java
    try {
      const entries = await fs.readdir(basePath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const nested = path.join(basePath, entry.name);
          for (const sub of [nested, path.join(nested, 'Contents', 'Home')]) {
            const javaBin = path.join(sub, 'bin', 'java');
            if (await pathExists(javaBin)) {
              return {
                javaHome: sub,
                javaExecutable: javaBin,
                version: javaVersion,
              };
            }
          }
        }
      }
    } catch {
      // ignore scan errors
    }

    return null;
  }
}
