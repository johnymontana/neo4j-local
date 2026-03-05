import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { StartupError, TimeoutError } from './errors.js';
import type { PortConfig } from './types.js';
import { Logger } from './logger.js';
import { HEALTH_CHECK_INTERVAL_MS, SHUTDOWN_TIMEOUT_MS } from './constants.js';

export class RuntimeManager {
  private process: ChildProcess | null = null;
  private startTime: number | null = null;
  private exitPromise: Promise<number | null> | null = null;

  constructor(private readonly logger: Logger) {}

  async start(options: {
    neo4jHome: string;
    javaHome: string;
    confDir: string;
    ports: Required<PortConfig>;
    startupTimeout: number;
  }): Promise<number> {
    const { neo4jHome, javaHome, confDir, ports, startupTimeout } = options;

    const neo4jBin = process.platform === 'win32'
      ? path.join(neo4jHome, 'bin', 'neo4j.bat')
      : path.join(neo4jHome, 'bin', 'neo4j');

    const env = {
      ...process.env,
      JAVA_HOME: javaHome,
      NEO4J_HOME: neo4jHome,
      NEO4J_CONF: confDir,
    };

    this.logger.debug(`Starting Neo4j: ${neo4jBin} console`);
    this.logger.debug(`JAVA_HOME=${javaHome}`);
    this.logger.debug(`NEO4J_HOME=${neo4jHome}`);
    this.logger.debug(`NEO4J_CONF=${confDir}`);

    const child = spawn(neo4jBin, ['console'], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    this.process = child;
    this.startTime = Date.now();

    // Capture output for debugging
    child.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        this.logger.debug(`[neo4j:stdout] ${line}`);
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        this.logger.debug(`[neo4j:stderr] ${line}`);
      }
    });

    // Track process exit
    this.exitPromise = new Promise<number | null>((resolve) => {
      child.on('exit', (code) => {
        this.logger.debug(`Neo4j process exited with code ${code}`);
        resolve(code);
      });
    });

    // Handle spawn errors
    const spawnError = await new Promise<Error | null>((resolve) => {
      child.on('error', (err) => resolve(err));
      // Give it a moment to see if it fails immediately
      setTimeout(() => resolve(null), 500);
    });

    if (spawnError) {
      this.process = null;
      throw new StartupError(`Failed to spawn Neo4j process: ${spawnError.message}`);
    }

    if (!child.pid) {
      this.process = null;
      throw new StartupError('Neo4j process failed to start (no PID assigned)');
    }

    // Wait for Neo4j to become ready
    await this.waitForReady({
      httpPort: ports.http,
      timeoutMs: startupTimeout,
    });

    this.logger.info(`Neo4j started (PID: ${child.pid})`);
    return child.pid;
  }

  async stop(options?: { shutdownTimeout?: number }): Promise<void> {
    const timeout = options?.shutdownTimeout ?? SHUTDOWN_TIMEOUT_MS;

    if (!this.process) {
      this.logger.debug('No process to stop');
      return;
    }

    const child = this.process;
    const pid = child.pid;

    this.logger.debug(`Stopping Neo4j (PID: ${pid})...`);

    // Send SIGTERM for graceful shutdown
    child.kill('SIGTERM');

    // Wait for exit with timeout
    const exited = await Promise.race([
      this.exitPromise?.then(() => true) ?? Promise.resolve(true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), timeout)),
    ]);

    if (!exited) {
      this.logger.warn(`Neo4j did not exit within ${timeout}ms, sending SIGKILL`);
      child.kill('SIGKILL');
      // Wait a bit more for the forced kill
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }

    this.process = null;
    this.startTime = null;
    this.exitPromise = null;

    this.logger.info('Neo4j stopped');
  }

  async waitForReady(options: { httpPort: number; timeoutMs: number }): Promise<void> {
    const { httpPort, timeoutMs } = options;
    const startTime = Date.now();
    const url = `http://127.0.0.1:${httpPort}/`;

    this.logger.debug(`Waiting for Neo4j to be ready at ${url}...`);

    while (Date.now() - startTime < timeoutMs) {
      // Check if process has exited
      if (this.process?.exitCode !== null && this.process?.exitCode !== undefined) {
        throw new StartupError(
          `Neo4j process exited unexpectedly with code ${this.process.exitCode}. ` +
          'Check logs for details or run with verbose: true.',
        );
      }

      if (await this.checkHealth(httpPort)) {
        this.logger.debug('Neo4j is ready');
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, HEALTH_CHECK_INTERVAL_MS));
    }

    // Timeout — kill the process and throw
    await this.stop();
    throw new TimeoutError('Neo4j startup', timeoutMs);
  }

  async checkHealth(httpPort: number): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);
      try {
        const response = await fetch(`http://127.0.0.1:${httpPort}/`, {
          signal: controller.signal,
        });
        return response.ok;
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      return false;
    }
  }

  getUptime(): number | null {
    if (this.startTime === null) return null;
    return Date.now() - this.startTime;
  }

  isRunning(): boolean {
    return this.process !== null && this.process.exitCode === null;
  }

  getPid(): number | undefined {
    return this.process?.pid;
  }
}
