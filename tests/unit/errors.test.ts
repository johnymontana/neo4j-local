import { describe, it, expect } from 'vitest';
import {
  Neo4jLocalError,
  DownloadError,
  JavaNotFoundError,
  StartupError,
  StateError,
  TimeoutError,
} from '../../src/errors.js';

describe('Neo4jLocalError', () => {
  it('sets message and code', () => {
    const err = new Neo4jLocalError('something broke', 'TEST_ERROR');
    expect(err.message).toBe('something broke');
    expect(err.code).toBe('TEST_ERROR');
    expect(err.name).toBe('Neo4jLocalError');
  });

  it('is an instance of Error', () => {
    const err = new Neo4jLocalError('test', 'TEST');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(Neo4jLocalError);
  });

  it('has a stack trace', () => {
    const err = new Neo4jLocalError('test', 'TEST');
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('Neo4jLocalError');
  });
});

describe('DownloadError', () => {
  it('sets message, url, and statusCode', () => {
    const err = new DownloadError('not found', 'https://example.com', 404);
    expect(err.message).toBe('not found');
    expect(err.url).toBe('https://example.com');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('DOWNLOAD_ERROR');
    expect(err.name).toBe('DownloadError');
  });

  it('works without optional params', () => {
    const err = new DownloadError('generic error');
    expect(err.message).toBe('generic error');
    expect(err.url).toBeUndefined();
    expect(err.statusCode).toBeUndefined();
  });

  it('is an instance of Neo4jLocalError', () => {
    const err = new DownloadError('test');
    expect(err).toBeInstanceOf(Neo4jLocalError);
    expect(err).toBeInstanceOf(Error);
  });
});

describe('JavaNotFoundError', () => {
  it('sets message and code', () => {
    const err = new JavaNotFoundError('no java');
    expect(err.message).toBe('no java');
    expect(err.code).toBe('JAVA_NOT_FOUND');
    expect(err.name).toBe('JavaNotFoundError');
  });

  it('is an instance of Neo4jLocalError', () => {
    expect(new JavaNotFoundError('test')).toBeInstanceOf(Neo4jLocalError);
  });
});

describe('StartupError', () => {
  it('sets message and code', () => {
    const err = new StartupError('failed to start');
    expect(err.message).toBe('failed to start');
    expect(err.code).toBe('STARTUP_ERROR');
    expect(err.name).toBe('StartupError');
  });
});

describe('StateError', () => {
  it('formats message with state and action', () => {
    const err = new StateError('new', 'stop');
    expect(err.message).toBe('Cannot stop while in state "new"');
    expect(err.code).toBe('INVALID_STATE');
    expect(err.name).toBe('StateError');
  });

  it('works with different states and actions', () => {
    const err = new StateError('running', 'install');
    expect(err.message).toBe('Cannot install while in state "running"');
  });
});

describe('TimeoutError', () => {
  it('formats message with operation and timeout', () => {
    const err = new TimeoutError('Neo4j startup', 30000);
    expect(err.message).toBe('Operation "Neo4j startup" timed out after 30000ms');
    expect(err.code).toBe('TIMEOUT');
    expect(err.name).toBe('TimeoutError');
  });
});
