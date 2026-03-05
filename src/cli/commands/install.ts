import { Command } from 'commander';
import { Neo4jLocal } from '../../neo4j-local.js';

export const installCommand = new Command('install')
  .description('Download and cache Neo4j and JRE without starting')
  .option('--version <version>', 'Neo4j version', '5.26.0')
  .option('--edition <edition>', 'Neo4j edition (community or enterprise)', 'community')
  .option('--verbose', 'Verbose logging', false)
  .action(async (opts) => {
    try {
      const neo4j = new Neo4jLocal({
        version: opts.version,
        edition: opts.edition as 'community' | 'enterprise',
        instanceName: `install-check-${Date.now()}`,
        ephemeral: true,
        verbose: opts.verbose,
      });

      console.log(`Installing Neo4j ${opts.edition} ${opts.version}...`);

      await neo4j.install((progress) => {
        if (progress.percentage > 0) {
          process.stdout.write(`\rDownloading... ${progress.percentage}%`);
        }
      });

      console.log('');
      console.log(`Neo4j ${opts.edition} ${opts.version} is ready.`);
      console.log('Run "npx neo4j-local start" to start an instance.');
    } catch (err) {
      console.error(`\nError: ${(err as Error).message}`);
      process.exit(1);
    }
  });
