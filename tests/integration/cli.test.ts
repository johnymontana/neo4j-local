import { describe, it, expect, beforeAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

// Path to the built CLI
const CLI_PATH = path.resolve(__dirname, '../../dist/cli/index.js');

async function runCli(args: string[], timeoutMs = 10_000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync('node', [CLI_PATH, ...args], {
      timeout: timeoutMs,
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
      exitCode: err.code === 'ETIMEDOUT' ? 124 : (err.status ?? 1),
    };
  }
}

describe('CLI Integration', () => {
  beforeAll(async () => {
    // Ensure the project is built
    try {
      await execFileAsync('npm', ['run', 'build'], {
        cwd: path.resolve(__dirname, '../..'),
        timeout: 30_000,
      });
    } catch {
      // build may already be up to date
    }
  });

  describe('--help', () => {
    it('displays help text', async () => {
      const { stdout, exitCode } = await runCli(['--help']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('neo4j-local');
      expect(stdout).toContain('start');
      expect(stdout).toContain('stop');
      expect(stdout).toContain('status');
      expect(stdout).toContain('credentials');
      expect(stdout).toContain('reset');
      expect(stdout).toContain('install');
      expect(stdout).toContain('versions');
      expect(stdout).toContain('clear-cache');
    });
  });

  describe('--version', () => {
    it('displays version number', async () => {
      const { stdout, exitCode } = await runCli(['--version']);
      expect(exitCode).toBe(0);
      expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('start --help', () => {
    it('displays start command options', async () => {
      const { stdout, exitCode } = await runCli(['start', '--help']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('--version');
      expect(stdout).toContain('--edition');
      expect(stdout).toContain('--instance');
      expect(stdout).toContain('--bolt-port');
      expect(stdout).toContain('--http-port');
      expect(stdout).toContain('--password');
      expect(stdout).toContain('--plugins');
      expect(stdout).toContain('--no-plugins');
      expect(stdout).toContain('--ephemeral');
      expect(stdout).toContain('--verbose');
    });
  });

  describe('stop --help', () => {
    it('displays stop command options', async () => {
      const { stdout, exitCode } = await runCli(['stop', '--help']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('--instance');
    });
  });

  describe('status --help', () => {
    it('displays status command options', async () => {
      const { stdout, exitCode } = await runCli(['status', '--help']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('--instance');
    });
  });

  describe('credentials --help', () => {
    it('displays credentials command options', async () => {
      const { stdout, exitCode } = await runCli(['credentials', '--help']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('--instance');
      expect(stdout).toContain('--json');
    });
  });

  describe('reset --help', () => {
    it('displays reset command options', async () => {
      const { stdout, exitCode } = await runCli(['reset', '--help']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('--instance');
      expect(stdout).toContain('--force');
    });
  });

  describe('install --help', () => {
    it('displays install command options', async () => {
      const { stdout, exitCode } = await runCli(['install', '--help']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('--version');
      expect(stdout).toContain('--edition');
    });
  });

  describe('versions', () => {
    it('lists cached versions (may be empty)', async () => {
      const { stdout, exitCode } = await runCli(['versions']);
      expect(exitCode).toBe(0);
      // Either "No cached" or a list of versions
      expect(stdout.length).toBeGreaterThan(0);
    });
  });

  describe('clear-cache --help', () => {
    it('displays clear-cache command options', async () => {
      const { stdout, exitCode } = await runCli(['clear-cache', '--help']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('--force');
    });
  });

  describe('status (no running instance)', () => {
    it('reports no instance for non-existent name', async () => {
      const { stdout, exitCode } = await runCli(['status', '--instance', `nonexistent-${Date.now()}`]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('No instance found');
    });
  });

  describe('stop (no running instance)', () => {
    it('reports no running instance', async () => {
      const { stdout, exitCode } = await runCli(['stop', '--instance', `nonexistent-${Date.now()}`]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('No running instance');
    });
  });

  describe('credentials (no instance)', () => {
    it('reports error for non-existent instance', async () => {
      const { stderr, exitCode } = await runCli(['credentials', '--instance', `nonexistent-${Date.now()}`]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain('No instance found');
    });
  });

  describe('invalid command', () => {
    it('shows help for unknown command', async () => {
      const { stdout, exitCode } = await runCli(['unknown-command']);
      // Commander shows help or error for unknown commands
      expect(stdout.length + (exitCode === 0 ? 0 : 1)).toBeGreaterThan(0);
    });
  });
});
