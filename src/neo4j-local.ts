import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  Neo4jLocalOptions,
  Neo4jLocalState,
  Neo4jEdition,
  Neo4jPlugin,
  Neo4jCredentials,
  Neo4jStatus,
  PortConfig,
  CachedBinary,
  CachedJre,
  DownloadProgressCallback,
} from './types.js';
import {
  DEFAULT_NEO4J_VERSION,
  DEFAULT_EDITION,
  DEFAULT_INSTANCE_NAME,
  DEFAULT_JAVA_VERSION,
  DEFAULT_PORTS,
  DEFAULT_USERNAME,
  STARTUP_TIMEOUT_MS,
} from './constants.js';
import { StateError } from './errors.js';
import { Logger } from './logger.js';
import { PlatformResolver } from './platform-resolver.js';
import { BinaryManager } from './binary-manager.js';
import { JavaManager } from './java-manager.js';
import { RuntimeManager } from './runtime-manager.js';
import { ConfigManager } from './config-manager.js';
import {
  getCacheDir,
  getDataDir,
  getInstanceDir,
  ensureDir,
  generatePassword,
  writePidFile,
  removePidFile,
} from './fs-utils.js';

export const DEFAULT_PLUGINS: Neo4jPlugin[] = ['apoc', 'gds', 'genai'];

interface ResolvedOptions {
  version: string;
  edition: Neo4jEdition;
  instanceName: string;
  ephemeral: boolean;
  plugins: Neo4jPlugin[];
  ports: Required<PortConfig>;
  username: string;
  password: string;
  javaVersion: number;
  allowAutoDownloadJava: boolean;
  allowAutoDownloadNeo4j: boolean;
  cachePath: string;
  dataPath: string;
  neo4jConf: Record<string, string>;
  startupTimeout: number;
  verbose: boolean;
}

export class Neo4jLocal extends EventEmitter {
  private state: Neo4jLocalState = 'new';
  private options: ResolvedOptions;
  private cachedBinary: CachedBinary | null = null;
  private cachedJre: CachedJre | null = null;
  private instanceDir: string;

  private platformResolver: PlatformResolver;
  private binaryManager: BinaryManager;
  private javaManager: JavaManager;
  private runtimeManager: RuntimeManager;
  private configManager: ConfigManager;
  private logger: Logger;

  constructor(options?: Neo4jLocalOptions) {
    super();
    this.options = this.resolveOptions(options);
    this.logger = new Logger('neo4j-local', this.options.verbose);

    this.platformResolver = new PlatformResolver(this.logger);
    const platformInfo = this.platformResolver.resolve();

    this.binaryManager = new BinaryManager(platformInfo, this.logger);
    this.javaManager = new JavaManager(platformInfo, this.platformResolver, this.logger);
    this.runtimeManager = new RuntimeManager(this.logger);
    this.configManager = new ConfigManager(this.logger);

    this.instanceDir = getInstanceDir(this.options.dataPath, this.options.instanceName);
  }

  async install(onProgress?: DownloadProgressCallback): Promise<void> {
    this.assertState(['new', 'stopped'], 'install');
    this.setState('installing');

    try {
      // Ensure Java is available
      this.cachedJre = await this.javaManager.ensureJava({
        neo4jVersion: this.options.version,
        javaVersion: this.options.javaVersion,
        allowAutoDownload: this.options.allowAutoDownloadJava,
        cachePath: this.options.cachePath,
      });

      // Ensure Neo4j binary is available
      this.cachedBinary = await this.binaryManager.ensureBinary({
        version: this.options.version,
        edition: this.options.edition,
        allowAutoDownload: this.options.allowAutoDownloadNeo4j,
        cachePath: this.options.cachePath,
        onProgress,
      });

      // Setup instance directory, plugins, and config
      await this.configManager.setupInstance({
        neo4jHome: this.cachedBinary.neo4jHome,
        instanceDir: this.instanceDir,
        ports: this.options.ports,
        credentials: {
          username: this.options.username,
          password: this.options.password,
        },
        javaExecutable: this.cachedJre.javaExecutable,
        javaHome: this.cachedJre.javaHome,
        version: this.options.version,
        edition: this.options.edition,
        plugins: this.options.plugins,
        additionalConfig: this.options.neo4jConf,
      });

      this.setState('installed');
    } catch (err) {
      this.setState('error');
      throw err;
    }
  }

  async start(onProgress?: DownloadProgressCallback): Promise<Neo4jCredentials> {
    // Auto-install if needed
    if (this.state === 'new' || this.state === 'stopped') {
      await this.install(onProgress);
    }

    this.assertState(['installed'], 'start');
    this.setState('starting');

    try {
      if (!this.cachedBinary || !this.cachedJre) {
        throw new Error('Binary or JRE not available after install');
      }

      const confDir = path.join(this.instanceDir, 'conf');

      const pid = await this.runtimeManager.start({
        neo4jHome: this.cachedBinary.neo4jHome,
        javaHome: this.cachedJre.javaHome,
        confDir,
        ports: this.options.ports,
        startupTimeout: this.options.startupTimeout,
      });

      await writePidFile(this.instanceDir, pid);
      this.setState('running');

      return this.getCredentials();
    } catch (err) {
      this.setState('error');
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.state !== 'running') {
      // Idempotent stop — not an error if already stopped
      if (this.state === 'stopped' || this.state === 'new') {
        return;
      }
      this.assertState(['running'], 'stop');
    }

    this.setState('stopping');

    try {
      await this.runtimeManager.stop();
      await removePidFile(this.instanceDir);

      if (this.options.ephemeral) {
        this.logger.info('Ephemeral mode: cleaning up instance data...');
        await fs.rm(this.instanceDir, { recursive: true, force: true });
      }

      this.setState('stopped');
    } catch (err) {
      this.setState('error');
      throw err;
    }
  }

  async reset(): Promise<void> {
    // Stop if running
    if (this.state === 'running') {
      await this.stop();
    }

    this.logger.info('Resetting instance data...');
    await fs.rm(this.instanceDir, { recursive: true, force: true });

    // Re-setup if we have the binary cached
    if (this.cachedBinary && this.cachedJre) {
      await this.configManager.setupInstance({
        neo4jHome: this.cachedBinary.neo4jHome,
        instanceDir: this.instanceDir,
        ports: this.options.ports,
        credentials: {
          username: this.options.username,
          password: this.options.password,
        },
        javaExecutable: this.cachedJre.javaExecutable,
        javaHome: this.cachedJre.javaHome,
        version: this.options.version,
        edition: this.options.edition,
        plugins: this.options.plugins,
        additionalConfig: this.options.neo4jConf,
      });
      this.setState('installed');
    } else {
      this.setState('new');
    }
  }

  getCredentials(): Neo4jCredentials {
    return {
      uri: `bolt://localhost:${this.options.ports.bolt}`,
      username: this.options.username,
      password: this.options.password,
      httpUrl: `http://localhost:${this.options.ports.http}`,
    };
  }

  async getStatus(): Promise<Neo4jStatus> {
    const isHealthy =
      this.state === 'running'
        ? await this.runtimeManager.checkHealth(this.options.ports.http)
        : false;

    return {
      state: isHealthy ? 'running' : this.state,
      pid: this.runtimeManager.getPid(),
      ports: this.options.ports,
      version: this.options.version,
      edition: this.options.edition,
      uptime: this.runtimeManager.getUptime() ?? undefined,
    };
  }

  getState(): Neo4jLocalState {
    return this.state;
  }

  getInstanceDir(): string {
    return this.instanceDir;
  }

  static async create(options?: Neo4jLocalOptions): Promise<Neo4jLocal> {
    const instance = new Neo4jLocal(options);
    await instance.start();
    return instance;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (this.state === 'running') {
      await this.stop();
    }
  }

  private setState(newState: Neo4jLocalState): void {
    const oldState = this.state;
    this.state = newState;
    this.emit('stateChange', newState, oldState);
  }

  private assertState(allowed: Neo4jLocalState[], action: string): void {
    if (!allowed.includes(this.state)) {
      throw new StateError(this.state, action);
    }
  }

  private resolveOptions(options?: Neo4jLocalOptions): ResolvedOptions {
    return {
      version: options?.version ?? DEFAULT_NEO4J_VERSION,
      edition: options?.edition ?? DEFAULT_EDITION,
      instanceName: options?.instanceName ?? DEFAULT_INSTANCE_NAME,
      ephemeral: options?.ephemeral ?? false,
      plugins: options?.plugins ?? DEFAULT_PLUGINS,
      ports: {
        bolt: options?.ports?.bolt ?? DEFAULT_PORTS.bolt,
        http: options?.ports?.http ?? DEFAULT_PORTS.http,
        https: options?.ports?.https ?? DEFAULT_PORTS.https,
      },
      username: options?.credentials?.username ?? DEFAULT_USERNAME,
      password: options?.credentials?.password ?? generatePassword(),
      javaVersion: options?.javaVersion ?? DEFAULT_JAVA_VERSION,
      allowAutoDownloadJava: options?.allowAutoDownloadJava ?? true,
      allowAutoDownloadNeo4j: options?.allowAutoDownloadNeo4j ?? true,
      cachePath: getCacheDir(options?.cachePath),
      dataPath: getDataDir(options?.dataPath),
      neo4jConf: options?.neo4jConf ?? {},
      startupTimeout: options?.startupTimeout ?? STARTUP_TIMEOUT_MS,
      verbose: options?.verbose ?? false,
    };
  }
}
