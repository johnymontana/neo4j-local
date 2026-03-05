import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger } from '../../src/logger.js';

describe('Logger', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.NEO4J_LOCAL_DEBUG;
  });

  describe('info()', () => {
    it('logs with prefix', () => {
      const logger = new Logger('test-prefix');
      logger.info('hello world');
      expect(consoleLogSpy).toHaveBeenCalledWith('[test-prefix] hello world');
    });

    it('passes additional args', () => {
      const logger = new Logger('test');
      logger.info('count:', 42);
      expect(consoleLogSpy).toHaveBeenCalledWith('[test] count:', 42);
    });
  });

  describe('debug()', () => {
    it('does not log when verbose is false', () => {
      const logger = new Logger('test', false);
      logger.debug('secret');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('logs when verbose is true', () => {
      const logger = new Logger('test', true);
      logger.debug('details');
      expect(consoleLogSpy).toHaveBeenCalledWith('[test:debug] details');
    });

    it('logs when NEO4J_LOCAL_DEBUG env var is set', () => {
      process.env.NEO4J_LOCAL_DEBUG = '1';
      const logger = new Logger('test', false);
      logger.debug('env debug');
      expect(consoleLogSpy).toHaveBeenCalledWith('[test:debug] env debug');
    });

    it('does not log when NEO4J_LOCAL_DEBUG is not "1"', () => {
      process.env.NEO4J_LOCAL_DEBUG = '0';
      const logger = new Logger('test', false);
      logger.debug('should not show');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('warn()', () => {
    it('logs to console.warn with prefix', () => {
      const logger = new Logger('test');
      logger.warn('caution');
      expect(consoleWarnSpy).toHaveBeenCalledWith('[test:warn] caution');
    });
  });

  describe('error()', () => {
    it('logs to console.error with prefix', () => {
      const logger = new Logger('test');
      logger.error('failure');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[test:error] failure');
    });

    it('passes additional args to console.error', () => {
      const logger = new Logger('test');
      const errObj = new Error('inner');
      logger.error('wrapped:', errObj);
      expect(consoleErrorSpy).toHaveBeenCalledWith('[test:error] wrapped:', errObj);
    });
  });
});
