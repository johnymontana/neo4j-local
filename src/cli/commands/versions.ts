import { Command } from 'commander';
import { BinaryManager } from '../../binary-manager.js';
import { PlatformResolver } from '../../platform-resolver.js';
import { Logger } from '../../logger.js';
import { getCacheDir } from '../../fs-utils.js';

export const versionsCommand = new Command('versions')
  .description('List cached Neo4j versions')
  .action(async () => {
    try {
      const logger = new Logger('neo4j-local', false);
      const platformResolver = new PlatformResolver(logger);
      const platformInfo = platformResolver.resolve();
      const binaryManager = new BinaryManager(platformInfo, logger);
      const cachePath = getCacheDir();

      const versions = await binaryManager.listCachedVersions(cachePath);

      if (versions.length === 0) {
        console.log('No cached Neo4j versions found.');
        console.log('Run "npx neo4j-local install" to download one.');
      } else {
        console.log('');
        console.log('Cached Neo4j versions:');
        console.log('');
        for (const { version, edition } of versions) {
          console.log(`  ${version} (${edition})`);
        }
        console.log('');
      }
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });
