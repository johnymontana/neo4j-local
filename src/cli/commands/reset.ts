import fs from 'node:fs/promises';
import { Command } from 'commander';
import { readPidFile, removePidFile, getInstanceDir, getDataDir, pathExists } from '../../fs-utils.js';

export const resetCommand = new Command('reset')
  .description('Reset a Neo4j instance (stop and wipe all data)')
  .option('--instance <name>', 'Instance name', 'default')
  .option('--force', 'Skip confirmation', false)
  .action(async (opts) => {
    try {
      const dataDir = getDataDir();
      const instanceDir = getInstanceDir(dataDir, opts.instance);

      if (!(await pathExists(instanceDir))) {
        console.log(`No instance found for "${opts.instance}".`);
        process.exit(0);
      }

      // Stop if running
      const pid = await readPidFile(instanceDir);
      if (pid !== null) {
        try {
          process.kill(pid, 0);
          console.log(`Stopping instance "${opts.instance}" (PID: ${pid})...`);
          process.kill(pid, 'SIGTERM');

          // Wait for exit
          const startTime = Date.now();
          while (Date.now() - startTime < 15_000) {
            try {
              process.kill(pid, 0);
              await new Promise((resolve) => setTimeout(resolve, 500));
            } catch {
              break;
            }
          }
        } catch {
          // already stopped
        }
        await removePidFile(instanceDir);
      }

      // Wipe data
      await fs.rm(instanceDir, { recursive: true, force: true });
      console.log(`Instance "${opts.instance}" has been reset. All data wiped.`);
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });
