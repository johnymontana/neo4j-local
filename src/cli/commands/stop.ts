import { Command } from 'commander';
import { readPidFile, removePidFile, getInstanceDir, getDataDir } from '../../fs-utils.js';

export const stopCommand = new Command('stop')
  .description('Stop a running Neo4j instance')
  .option('--instance <name>', 'Instance name', 'default')
  .action(async (opts) => {
    try {
      const dataDir = getDataDir();
      const instanceDir = getInstanceDir(dataDir, opts.instance);
      const pid = await readPidFile(instanceDir);

      if (pid === null) {
        console.log(`No running instance found for "${opts.instance}".`);
        process.exit(0);
      }

      // Check if process is still alive
      try {
        process.kill(pid, 0);
      } catch {
        console.log(`Instance "${opts.instance}" is not running (stale PID file).`);
        await removePidFile(instanceDir);
        process.exit(0);
      }

      console.log(`Stopping Neo4j instance "${opts.instance}" (PID: ${pid})...`);

      // Send SIGTERM
      process.kill(pid, 'SIGTERM');

      // Wait for process to exit
      const startTime = Date.now();
      const timeout = 30_000;
      while (Date.now() - startTime < timeout) {
        try {
          process.kill(pid, 0);
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch {
          // Process has exited
          await removePidFile(instanceDir);
          console.log('Neo4j stopped.');
          process.exit(0);
        }
      }

      // Force kill
      console.log('Graceful shutdown timed out, sending SIGKILL...');
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // already dead
      }
      await removePidFile(instanceDir);
      console.log('Neo4j stopped (forced).');
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });
