import { Command } from 'commander';
import { readPidFile, readCredentials, getInstanceDir, getDataDir } from '../../fs-utils.js';

export const statusCommand = new Command('status')
  .description('Check the status of a Neo4j instance')
  .option('--instance <name>', 'Instance name', 'default')
  .action(async (opts) => {
    try {
      const dataDir = getDataDir();
      const instanceDir = getInstanceDir(dataDir, opts.instance);
      const pid = await readPidFile(instanceDir);
      const creds = await readCredentials(instanceDir);

      if (!creds) {
        console.log(`No instance found for "${opts.instance}".`);
        console.log('Run "npx neo4j-local start" to create one.');
        process.exit(0);
      }

      let running = false;
      if (pid !== null) {
        try {
          process.kill(pid, 0);
          running = true;
        } catch {
          // Process not running
        }
      }

      // Health check if process appears to be running
      let healthy = false;
      if (running) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5_000);
          const response = await fetch(`http://127.0.0.1:${creds.ports.http}/`, {
            signal: controller.signal,
          });
          healthy = response.ok;
          clearTimeout(timeout);
        } catch {
          // not healthy
        }
      }

      console.log('');
      console.log(`Instance:  ${opts.instance}`);
      console.log(`Status:    ${running ? (healthy ? 'Running (healthy)' : 'Running (not ready)') : 'Stopped'}`);
      if (pid !== null && running) {
        console.log(`PID:       ${pid}`);
      }
      console.log(`Version:   ${creds.version}`);
      console.log(`Edition:   ${creds.edition}`);
      console.log(`Bolt port: ${creds.ports.bolt}`);
      console.log(`HTTP port: ${creds.ports.http}`);
      console.log('');
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });
