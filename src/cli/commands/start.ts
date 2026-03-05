import { Command } from 'commander';
import { Neo4jLocal, DEFAULT_PLUGINS } from '../../neo4j-local.js';
import type { Neo4jPlugin } from '../../types.js';

export const startCommand = new Command('start')
  .description('Start a local Neo4j instance')
  .option('--version <version>', 'Neo4j version', '5.26.0')
  .option('--edition <edition>', 'Neo4j edition (community or enterprise)', 'community')
  .option('--instance <name>', 'Instance name', 'default')
  .option('--bolt-port <port>', 'Bolt protocol port', '7687')
  .option('--http-port <port>', 'HTTP browser port', '7474')
  .option('--password <password>', 'Set a specific password (auto-generated if not provided)')
  .option('--plugins <plugins>', 'Comma-separated list of plugins (apoc,gds,genai)', 'apoc,gds,genai')
  .option('--no-plugins', 'Disable all plugins')
  .option('--ephemeral', 'Delete data on stop', false)
  .option('--verbose', 'Verbose logging', false)
  .action(async (opts) => {
    try {
      // Parse plugins option
      let plugins: Neo4jPlugin[] | undefined;
      if (opts.plugins === false) {
        plugins = [];
      } else if (typeof opts.plugins === 'string') {
        plugins = opts.plugins.split(',').map((p: string) => p.trim()) as Neo4jPlugin[];
      } else {
        plugins = DEFAULT_PLUGINS;
      }

      const neo4j = new Neo4jLocal({
        version: opts.version,
        edition: opts.edition as 'community' | 'enterprise',
        instanceName: opts.instance,
        ephemeral: opts.ephemeral,
        verbose: opts.verbose,
        plugins,
        ports: {
          bolt: parseInt(opts.boltPort, 10),
          http: parseInt(opts.httpPort, 10),
        },
        credentials: opts.password ? { password: opts.password } : undefined,
      });

      const creds = await neo4j.start();

      console.log('');
      console.log('Neo4j is running!');
      console.log('');
      console.log(`  Bolt URI:  ${creds.uri}`);
      console.log(`  HTTP URL:  ${creds.httpUrl}`);
      console.log(`  Username:  ${creds.username}`);
      console.log(`  Password:  ${creds.password}`);
      if (plugins && plugins.length > 0) {
        console.log(`  Plugins:   ${plugins.join(', ')}`);
      }
      console.log('');
      console.log('Press Ctrl+C to stop.');
      console.log('');

      // Keep process alive; handle SIGINT/SIGTERM for graceful shutdown
      let stopping = false;
      const shutdown = async () => {
        if (stopping) return;
        stopping = true;
        console.log('\nStopping Neo4j...');
        try {
          await neo4j.stop();
          console.log('Neo4j stopped.');
        } catch (err) {
          console.error(`Error stopping Neo4j: ${(err as Error).message}`);
        }
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });
