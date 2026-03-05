import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { CACHE_DIR_NAME, DATA_DIR_NAME, PASSWORD_LENGTH } from './constants.js';
import type { StoredCredentials } from './types.js';

export function getCacheDir(override?: string): string {
  if (override) return override;

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localAppData, CACHE_DIR_NAME);
  }

  const xdgCache = process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache');
  return path.join(xdgCache, CACHE_DIR_NAME);
}

export function getDataDir(override?: string): string {
  if (override) return override;

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localAppData, CACHE_DIR_NAME, 'data');
  }

  const xdgData = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share');
  return path.join(xdgData, DATA_DIR_NAME);
}

export function getInstanceDir(dataDir: string, instanceName: string): string {
  return path.join(dataDir, instanceName);
}

export function getNeo4jCachePath(cacheDir: string, version: string, edition: string): string {
  return path.join(cacheDir, version, edition);
}

export function getJreCachePath(cacheDir: string, javaVersion: number): string {
  return path.join(cacheDir, 'jre', String(javaVersion));
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export function generatePassword(length: number = PASSWORD_LENGTH): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

export async function writePidFile(instanceDir: string, pid: number): Promise<void> {
  await fs.writeFile(path.join(instanceDir, 'neo4j.pid'), String(pid), 'utf-8');
}

export async function readPidFile(instanceDir: string): Promise<number | null> {
  try {
    const content = await fs.readFile(path.join(instanceDir, 'neo4j.pid'), 'utf-8');
    const pid = parseInt(content.trim(), 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

export async function removePidFile(instanceDir: string): Promise<void> {
  try {
    await fs.unlink(path.join(instanceDir, 'neo4j.pid'));
  } catch {
    // ignore if already removed
  }
}

export async function writeCredentials(instanceDir: string, credentials: StoredCredentials): Promise<void> {
  await ensureDir(instanceDir);
  await fs.writeFile(
    path.join(instanceDir, 'credentials.json'),
    JSON.stringify(credentials, null, 2),
    'utf-8',
  );
}

export async function readCredentials(instanceDir: string): Promise<StoredCredentials | null> {
  try {
    const content = await fs.readFile(path.join(instanceDir, 'credentials.json'), 'utf-8');
    return JSON.parse(content) as StoredCredentials;
  } catch {
    return null;
  }
}
