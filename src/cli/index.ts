import { Command } from 'commander';
import { startCommand } from './commands/start.js';
import { stopCommand } from './commands/stop.js';
import { statusCommand } from './commands/status.js';
import { credentialsCommand } from './commands/credentials.js';
import { resetCommand } from './commands/reset.js';
import { installCommand } from './commands/install.js';
import { versionsCommand } from './commands/versions.js';
import { clearCacheCommand } from './commands/clear-cache.js';

const program = new Command();

program
  .name('neo4j-local')
  .description('Download, install, and manage a local Neo4j database')
  .version('0.1.0');

program.addCommand(startCommand);
program.addCommand(stopCommand);
program.addCommand(statusCommand);
program.addCommand(credentialsCommand);
program.addCommand(resetCommand);
program.addCommand(installCommand);
program.addCommand(versionsCommand);
program.addCommand(clearCacheCommand);

program.parse();
