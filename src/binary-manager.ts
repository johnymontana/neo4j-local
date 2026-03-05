import fs from 'node:fs/promises';
import path from 'node:path';
import { NEO4J_DIST_BASE_URL } from './constants.js';
import { DownloadError } from './errors.js';
import type { CachedBinary, Neo4jEdition, PlatformInfo, DownloadProgressCallback } from './types.js';
import { Logger } from './logger.js';
import { downloadAndExtractTarGz } from './download-utils.js';
import { getNeo4jCachePath, pathExists } from './fs-utils.js';

export class BinaryManager {
  constructor(
    private readonly platformInfo: PlatformInfo,
    private readonly logger: Logger,
  ) {}

  async ensureBinary(options: {
    version: string;
    edition: Neo4jEdition;
    allowAutoDownload: boolean;
    cachePath: string;
    onProgress?: DownloadProgressCallback;
  }): Promise<CachedBinary> {
    const neo4jCachePath = getNeo4jCachePath(options.cachePath, options.version, options.edition);

    // Check cache
    if (await this.isCacheValid(neo4jCachePath)) {
      this.logger.debug(`Using cached Neo4j ${options.edition} ${options.version} at ${neo4jCachePath}`);
      return {
        neo4jHome: neo4jCachePath,
        version: options.version,
        edition: options.edition,
      };
    }

    if (!options.allowAutoDownload) {
      throw new DownloadError(
        `Neo4j ${options.edition} ${options.version} is not cached and auto-download is disabled. ` +
        'Run "npx neo4j-local install" first or set allowAutoDownloadNeo4j: true.',
      );
    }

    // Download and extract
    const url = this.buildDownloadUrl(options.version, options.edition);
    this.logger.info(`Downloading Neo4j ${options.edition} ${options.version}...`);

    await downloadAndExtractTarGz(url, neo4jCachePath, {
      strip: 1,
      onProgress: options.onProgress,
      logger: this.logger,
    });

    // Verify extraction
    if (!(await this.isCacheValid(neo4jCachePath))) {
      // Clean up failed extraction
      try {
        await fs.rm(neo4jCachePath, { recursive: true, force: true });
      } catch { /* ignore */ }
      throw new DownloadError(
        `Downloaded Neo4j but the extracted directory is invalid. Expected bin/neo4j in ${neo4jCachePath}`,
        url,
      );
    }

    this.logger.info(`Neo4j ${options.edition} ${options.version} installed at ${neo4jCachePath}`);
    return {
      neo4jHome: neo4jCachePath,
      version: options.version,
      edition: options.edition,
    };
  }

  buildDownloadUrl(version: string, edition: Neo4jEdition): string {
    const { neo4jDistSuffix, archiveExtension } = this.platformInfo;
    return `${NEO4J_DIST_BASE_URL}/neo4j-${edition}-${version}-${neo4jDistSuffix}${archiveExtension}`;
  }

  async listCachedVersions(cachePath: string): Promise<Array<{ version: string; edition: Neo4jEdition }>> {
    const results: Array<{ version: string; edition: Neo4jEdition }> = [];

    try {
      const versions = await fs.readdir(cachePath, { withFileTypes: true });
      for (const versionEntry of versions) {
        if (!versionEntry.isDirectory() || versionEntry.name === 'jre') continue;
        const versionPath = path.join(cachePath, versionEntry.name);
        const editions = await fs.readdir(versionPath, { withFileTypes: true });
        for (const editionEntry of editions) {
          if (!editionEntry.isDirectory()) continue;
          const edition = editionEntry.name as Neo4jEdition;
          if (edition === 'community' || edition === 'enterprise') {
            results.push({ version: versionEntry.name, edition });
          }
        }
      }
    } catch {
      // cache directory doesn't exist
    }

    return results;
  }

  async clearCache(cachePath: string): Promise<void> {
    await fs.rm(cachePath, { recursive: true, force: true });
    this.logger.info(`Cache cleared: ${cachePath}`);
  }

  private async isCacheValid(neo4jCachePath: string): Promise<boolean> {
    // Check for the neo4j launcher script
    const neo4jBin = process.platform === 'win32'
      ? path.join(neo4jCachePath, 'bin', 'neo4j.bat')
      : path.join(neo4jCachePath, 'bin', 'neo4j');
    return pathExists(neo4jBin);
  }
}
