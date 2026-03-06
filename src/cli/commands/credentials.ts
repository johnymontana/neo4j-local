import { Command } from 'commander';
import { readCredentials, getInstanceDir, getDataDir } from '../../fs-utils.js';

export const credentialsCommand = new Command('credentials')
  .description('Print connection credentials for a Neo4j instance')
  .option('--instance <name>', 'Instance name', 'default')
  .option('--json', 'Output as JSON', false)
  .action(async (opts) => {
    try {
      const dataDir = getDataDir();
      const instanceDir = getInstanceDir(dataDir, opts.instance);
      const creds = await readCredentials(instanceDir);

      if (!creds) {
        console.error(`No instance found for "${opts.instance}".`);
        console.error('Run "npx @johnymontana/neo4j-local start" to create one.');
        process.exit(1);
      }

      if (opts.json) {
        console.log(JSON.stringify({
          uri: `bolt://localhost:${creds.ports.bolt}`,
          httpUrl: `http://localhost:${creds.ports.http}`,
          username: creds.username,
          password: creds.password,
        }, null, 2));
      } else {
        console.log('');
        console.log(`Bolt URI:  bolt://localhost:${creds.ports.bolt}`);
        console.log(`HTTP URL:  http://localhost:${creds.ports.http}`);
        console.log(`Username:  ${creds.username}`);
        console.log(`Password:  ${creds.password}`);
        console.log('');
      }
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });
