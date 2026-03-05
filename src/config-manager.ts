import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Neo4jPlugin, PortConfig, StoredCredentials } from './types.js';
import { Logger } from './logger.js';
import { ensureDir, pathExists, writeCredentials } from './fs-utils.js';

const execFileAsync = promisify(execFile);

export class ConfigManager {
  constructor(private readonly logger: Logger) {}

  async setupInstance(options: {
    neo4jHome: string;
    instanceDir: string;
    ports: Required<PortConfig>;
    credentials: { username: string; password: string };
    javaExecutable: string;
    javaHome: string;
    version: string;
    edition: 'community' | 'enterprise';
    plugins?: Neo4jPlugin[];
    additionalConfig?: Record<string, string>;
  }): Promise<void> {
    const { instanceDir, ports, credentials, version, edition } = options;
    const plugins = options.plugins ?? ['apoc', 'gds', 'genai'];

    // Create instance directory structure
    const dataDir = path.join(instanceDir, 'data');
    const logsDir = path.join(instanceDir, 'logs');
    const confDir = path.join(instanceDir, 'conf');
    const runDir = path.join(instanceDir, 'run');

    await Promise.all([
      ensureDir(dataDir),
      ensureDir(logsDir),
      ensureDir(confDir),
      ensureDir(runDir),
    ]);

    // Install plugins (copy JARs from bundled locations to plugins/)
    if (plugins.length > 0) {
      await this.setupPlugins(options.neo4jHome, plugins);
    }

    // Generate and write neo4j.conf (includes plugin config)
    const conf = this.generateNeo4jConf({
      ports,
      instanceDir,
      plugins,
      additionalConfig: options.additionalConfig,
    });
    await fs.writeFile(path.join(confDir, 'neo4j.conf'), conf, 'utf-8');
    this.logger.debug(`Wrote neo4j.conf to ${confDir}`);

    // Store credentials
    const storedCreds: StoredCredentials = {
      username: credentials.username,
      password: credentials.password,
      ports,
      version,
      edition,
    };
    await writeCredentials(instanceDir, storedCreds);

    // Set initial password
    await this.setInitialPassword({
      neo4jHome: options.neo4jHome,
      javaExecutable: options.javaExecutable,
      javaHome: options.javaHome,
      password: credentials.password,
      confDir,
      dataDir,
    });
  }

  generateNeo4jConf(options: {
    ports: Required<PortConfig>;
    instanceDir: string;
    plugins?: Neo4jPlugin[];
    additionalConfig?: Record<string, string>;
  }): string {
    const { ports, instanceDir } = options;
    const plugins = options.plugins ?? [];
    const dataDir = path.join(instanceDir, 'data');
    const logsDir = path.join(instanceDir, 'logs');
    const runDir = path.join(instanceDir, 'run');

    const settings: Record<string, string> = {
      // Network
      'server.default_listen_address': '127.0.0.1',
      'server.bolt.enabled': 'true',
      'server.bolt.listen_address': `:${ports.bolt}`,
      'server.http.enabled': 'true',
      'server.http.listen_address': `:${ports.http}`,
      'server.https.enabled': 'false',

      // Directories (redirect to instance-specific paths)
      'server.directories.data': dataDir,
      'server.directories.logs': logsDir,
      'server.directories.run': runDir,
      'server.directories.transaction.logs.root': path.join(dataDir, 'transactions'),

      // Memory (reduced for local dev)
      'server.memory.heap.initial_size': '256m',
      'server.memory.heap.max_size': '512m',
      'server.memory.pagecache.size': '128m',

      // Security
      'dbms.security.auth_enabled': 'true',

      // Telemetry
      'dbms.usage_report.enabled': 'false',

      // Logging (reduced for local dev)
      'dbms.logs.query.enabled': 'OFF',

      // Transaction log retention (minimal disk usage)
      'db.tx_log.rotation.retention_policy': '1 files',
    };

    // Plugin security configuration
    if (plugins.length > 0) {
      const procedureNamespaces = this.getPluginProcedureNamespaces(plugins);
      if (procedureNamespaces.length > 0) {
        settings['dbms.security.procedures.unrestricted'] = procedureNamespaces.join(',');
        settings['dbms.security.procedures.allowlist'] = procedureNamespaces.join(',');
      }
    }

    // Merge additional config (user overrides)
    if (options.additionalConfig) {
      for (const [key, value] of Object.entries(options.additionalConfig)) {
        settings[key] = value;
      }
    }

    const lines = [
      '# neo4j-local generated configuration',
      '# Do not edit manually — this file is regenerated on instance setup.',
      '',
    ];

    for (const [key, value] of Object.entries(settings)) {
      lines.push(`${key}=${value}`);
    }

    return lines.join('\n') + '\n';
  }

  async setupPlugins(neo4jHome: string, plugins: Neo4jPlugin[]): Promise<void> {
    const pluginsDir = path.join(neo4jHome, 'plugins');
    await ensureDir(pluginsDir);

    for (const plugin of plugins) {
      const installed = await this.installPlugin(neo4jHome, pluginsDir, plugin);
      if (installed) {
        this.logger.info(`Plugin "${plugin}" installed`);
      } else {
        this.logger.warn(`Plugin "${plugin}" JAR not found in Neo4j distribution — skipping`);
      }
    }
  }

  private async installPlugin(neo4jHome: string, pluginsDir: string, plugin: Neo4jPlugin): Promise<boolean> {
    // Each plugin may be in different bundled locations within the Neo4j distribution.
    // APOC Core: labs/apoc-*-core.jar
    // GDS: products/*graph-data-science*.jar or products/*gds*.jar
    // GenAI: products/neo4j-genai*.jar
    const sourcePatterns = this.getPluginSourcePatterns(neo4jHome, plugin);

    for (const { dir, prefix } of sourcePatterns) {
      if (!(await pathExists(dir))) continue;

      try {
        const entries = await fs.readdir(dir);
        for (const entry of entries) {
          if (entry.endsWith('.jar') && entry.toLowerCase().includes(prefix)) {
            const src = path.join(dir, entry);
            const dest = path.join(pluginsDir, entry);

            // Skip if already installed
            if (await pathExists(dest)) {
              this.logger.debug(`Plugin JAR already in plugins/: ${entry}`);
              return true;
            }

            await fs.copyFile(src, dest);
            this.logger.debug(`Copied ${src} -> ${dest}`);
            return true;
          }
        }
      } catch {
        // directory read failed, try next pattern
      }
    }

    return false;
  }

  private getPluginSourcePatterns(neo4jHome: string, plugin: Neo4jPlugin): Array<{ dir: string; prefix: string }> {
    const labsDir = path.join(neo4jHome, 'labs');
    const productsDir = path.join(neo4jHome, 'products');

    switch (plugin) {
      case 'apoc':
        return [
          { dir: labsDir, prefix: 'apoc' },
          { dir: productsDir, prefix: 'apoc' },
        ];
      case 'gds':
        return [
          { dir: productsDir, prefix: 'graph-data-science' },
          { dir: productsDir, prefix: 'gds' },
          { dir: labsDir, prefix: 'graph-data-science' },
          { dir: labsDir, prefix: 'gds' },
        ];
      case 'genai':
        return [
          { dir: productsDir, prefix: 'neo4j-genai' },
          { dir: productsDir, prefix: 'genai' },
          { dir: labsDir, prefix: 'genai' },
        ];
    }
  }

  private getPluginProcedureNamespaces(plugins: Neo4jPlugin[]): string[] {
    const namespaces: string[] = [];
    for (const plugin of plugins) {
      switch (plugin) {
        case 'apoc':
          namespaces.push('apoc.*');
          break;
        case 'gds':
          namespaces.push('gds.*');
          break;
        case 'genai':
          namespaces.push('genai.*');
          break;
      }
    }
    return namespaces;
  }

  private async setInitialPassword(options: {
    neo4jHome: string;
    javaExecutable: string;
    javaHome: string;
    password: string;
    confDir: string;
    dataDir: string;
  }): Promise<void> {
    const { neo4jHome, javaHome, password, confDir } = options;

    const neo4jAdmin = process.platform === 'win32'
      ? path.join(neo4jHome, 'bin', 'neo4j-admin.bat')
      : path.join(neo4jHome, 'bin', 'neo4j-admin');

    const env = {
      ...process.env,
      JAVA_HOME: javaHome,
      NEO4J_HOME: neo4jHome,
      NEO4J_CONF: confDir,
    };

    try {
      this.logger.debug(`Setting initial password via neo4j-admin...`);
      await execFileAsync(
        neo4jAdmin,
        ['dbms', 'set-initial-password', password],
        { env, timeout: 30_000 },
      );
      this.logger.debug('Initial password set successfully');
    } catch (err) {
      // neo4j-admin may fail if password was already set (e.g., re-setup without data wipe)
      // This is acceptable — the password from the previous setup is still valid
      const message = (err as Error).message ?? '';
      if (message.includes('already set') || message.includes('existing')) {
        this.logger.debug('Initial password was already set, skipping');
      } else {
        this.logger.warn(`Failed to set initial password: ${message}`);
        // Don't throw — we still want to try starting the instance
      }
    }
  }
}
