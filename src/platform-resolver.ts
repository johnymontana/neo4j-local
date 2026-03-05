import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { Neo4jLocalError } from './errors.js';
import type { PlatformInfo } from './types.js';
import { Logger } from './logger.js';
import { pathExists } from './fs-utils.js';

const execFileAsync = promisify(execFile);

export class PlatformResolver {
  constructor(private readonly logger: Logger) {}

  resolve(): PlatformInfo {
    const os = process.platform;
    const rawArch = process.arch;

    // Validate architecture
    if (rawArch !== 'x64' && rawArch !== 'arm64') {
      throw new Neo4jLocalError(
        `Unsupported architecture: ${rawArch}. Only x64 and arm64 are supported.`,
        'UNSUPPORTED_PLATFORM',
      );
    }

    const arch = rawArch as 'x64' | 'arm64';

    switch (os) {
      case 'darwin':
        return {
          os,
          arch,
          neo4jDistSuffix: 'unix',
          archiveExtension: '.tar.gz',
          adoptiumOs: 'mac',
          adoptiumArch: arch === 'arm64' ? 'aarch64' : 'x64',
        };
      case 'linux':
        return {
          os,
          arch,
          neo4jDistSuffix: 'unix',
          archiveExtension: '.tar.gz',
          adoptiumOs: 'linux',
          adoptiumArch: arch === 'arm64' ? 'aarch64' : 'x64',
        };
      case 'win32':
        if (arch === 'arm64') {
          throw new Neo4jLocalError(
            'Windows ARM64 is not currently supported.',
            'UNSUPPORTED_PLATFORM',
          );
        }
        return {
          os,
          arch,
          neo4jDistSuffix: 'windows',
          archiveExtension: '.zip',
          adoptiumOs: 'windows',
          adoptiumArch: 'x64',
        };
      default:
        throw new Neo4jLocalError(
          `Unsupported platform: ${os}. Only macOS, Linux, and Windows are supported.`,
          'UNSUPPORTED_PLATFORM',
        );
    }
  }

  async findSystemJava(): Promise<{ path: string; version: number } | null> {
    // Step 1: Check JAVA_HOME
    const javaHome = process.env.JAVA_HOME;
    if (javaHome) {
      const javaBin = path.join(javaHome, 'bin', 'java');
      if (await pathExists(javaBin)) {
        const version = await this.parseJavaVersion(javaBin);
        if (version !== null) {
          this.logger.debug(`Found Java ${version} at JAVA_HOME: ${javaHome}`);
          return { path: javaHome, version };
        }
      }
    }

    // Step 2: Check PATH
    try {
      const javaBin = process.platform === 'win32' ? 'java.exe' : 'java';
      const version = await this.parseJavaVersion(javaBin);
      if (version !== null) {
        // Resolve the actual java home from the PATH-based java
        const javaPath = await this.resolveJavaHome(javaBin);
        if (javaPath) {
          this.logger.debug(`Found Java ${version} on PATH: ${javaPath}`);
          return { path: javaPath, version };
        }
      }
    } catch {
      // java not on PATH
    }

    this.logger.debug('No system Java found');
    return null;
  }

  private async parseJavaVersion(javaBin: string): Promise<number | null> {
    try {
      const { stderr } = await execFileAsync(javaBin, ['-version'], {
        timeout: 10_000,
      });
      // java -version outputs to stderr. Format examples:
      // openjdk version "21.0.2" 2024-01-16
      // java version "17.0.10" 2024-01-16 LTS
      const match = stderr.match(/version "(\d+)(?:\.(\d+))?/);
      if (match) {
        return parseInt(match[1], 10);
      }
      return null;
    } catch {
      return null;
    }
  }

  private async resolveJavaHome(javaBin: string): Promise<string | null> {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execFileAsync('where', [javaBin], { timeout: 5_000 });
        const javaExe = stdout.trim().split('\n')[0].trim();
        // java.exe -> bin/java.exe -> JAVA_HOME
        return path.dirname(path.dirname(javaExe));
      } else {
        const { stdout } = await execFileAsync('which', [javaBin], { timeout: 5_000 });
        let javaExe = stdout.trim();
        // Follow symlinks
        const { stdout: realPath } = await execFileAsync('readlink', ['-f', javaExe], {
          timeout: 5_000,
        }).catch(() => ({ stdout: javaExe }));
        javaExe = realPath.trim() || javaExe;
        // java -> bin/java -> JAVA_HOME
        return path.dirname(path.dirname(javaExe));
      }
    } catch {
      return null;
    }
  }
}
