import { Command } from 'commander';
import { BinaryManager } from '../../binary-manager.js';
import { PlatformResolver } from '../../platform-resolver.js';
import { Logger } from '../../logger.js';
import { getCacheDir } from '../../fs-utils.js';

export const clearCacheCommand = new Command('clear-cache')
  .description('Remove all cached Neo4j distributions and JREs')
  .option('--force', 'Skip confirmation', false)
  .action(async (opts) => {
    try {
      const cachePath = getCacheDir();
      const logger = new Logger('neo4j-local', false);
      const platformResolver = new PlatformResolver(logger);
      const platformInfo = platformResolver.resolve();
      const binaryManager = new BinaryManager(platformInfo, logger);

      const versions = await binaryManager.listCachedVersions(cachePath);

      if (versions.length === 0) {
        console.log('Cache is already empty.');
        process.exit(0);
      }

      if (!opts.force) {
        console.log(`This will remove ${versions.length} cached version(s) from ${cachePath}`);
        console.log('Use --force to skip this confirmation.');
        // In a non-interactive context, require --force
        console.log('');
        console.log('Cached versions:');
        for (const { version, edition } of versions) {
          console.log(`  ${version} (${edition})`);
        }
        console.log('');
        console.log('Run with --force to confirm deletion.');
        process.exit(0);
      }

      await binaryManager.clearCache(cachePath);
      console.log('Cache cleared.');
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });
