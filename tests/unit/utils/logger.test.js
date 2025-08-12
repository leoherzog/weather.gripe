import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Logger } from '../../../src/utils/logger.js';

describe('Logger', () => {
  let logger;
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger = new Logger('test');
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should initialize with environment', () => {
      const prodLogger = new Logger('production');
      expect(prodLogger.environment).toBe('production');
      
      const devLogger = new Logger('development');
      expect(devLogger.environment).toBe('development');
    });

    it('should initialize with empty context', () => {
      expect(logger.context).toEqual({});
    });
  });

  describe('setContext', () => {
    it('should set context properties', () => {
      logger.setContext({ requestId: '123', userId: 'abc' });
      expect(logger.context).toEqual({ requestId: '123', userId: 'abc' });
    });

    it('should merge context properties', () => {
      logger.setContext({ requestId: '123' });
      logger.setContext({ userId: 'abc' });
      expect(logger.context).toEqual({ requestId: '123', userId: 'abc' });
    });

    it('should override existing context properties', () => {
      logger.setContext({ requestId: '123' });
      logger.setContext({ requestId: '456' });
      expect(logger.context).toEqual({ requestId: '456' });
    });
  });

  describe('log levels', () => {
    it('should log info messages', () => {
      logger.info('Test info message', { data: 'test' });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '[INFO] Test info message',
        { data: 'test' }
      );
    });

    it('should log warning messages', () => {
      logger.warn('Test warning', { warning: true });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '[WARN] Test warning',
        { warning: true }
      );
    });

    it('should log error messages with Error objects', () => {
      const error = new Error('Test error');
      logger.error('Error occurred', error);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '[ERROR] Error occurred',
        {
          name: 'Error',
          message: 'Test error',
          stack: expect.stringContaining('Test error')
        }
      );
    });

    it('should log error messages with plain objects', () => {
      logger.error('Error details', { code: 500, message: 'Server error' });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '[ERROR] Error details',
        { code: 500, message: 'Server error' }
      );
    });

    it('should log debug messages in non-production', () => {
      logger.debug('Debug info', { debug: true });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '[DEBUG] Debug info',
        { debug: true }
      );
    });

    it('should not log debug messages in production', () => {
      const prodLogger = new Logger('production');
      prodLogger.debug('Debug info', { debug: true });
      
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('structured logging in production', () => {
    it('should output JSON in production environment', () => {
      const prodLogger = new Logger('production');
      const testData = { key: 'value' };
      
      prodLogger.info('Test message', testData);
      
      expect(consoleSpy).toHaveBeenCalledOnce();
      const logOutput = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);
      
      expect(parsed).toMatchObject({
        level: 'INFO',
        environment: 'production',
        message: 'Test message',
        key: 'value',
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      });
    });

    it('should include context in production logs', () => {
      const prodLogger = new Logger('production');
      prodLogger.setContext({ requestId: 'req-123' });
      
      prodLogger.info('With context');
      
      const logOutput = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);
      
      expect(parsed.requestId).toBe('req-123');
    });
  });

  describe('child logger', () => {
    it('should create child logger with additional context', () => {
      logger.setContext({ parent: 'context' });
      const child = logger.child({ child: 'context' });
      
      expect(child.context).toEqual({
        parent: 'context',
        child: 'context'
      });
    });

    it('should not affect parent logger context', () => {
      logger.setContext({ parent: 'context' });
      const child = logger.child({ child: 'context' });
      
      expect(logger.context).toEqual({ parent: 'context' });
      expect(child.context).toEqual({ parent: 'context', child: 'context' });
    });

    it('should inherit environment from parent', () => {
      const prodLogger = new Logger('production');
      const child = prodLogger.child({ child: 'context' });
      
      expect(child.environment).toBe('production');
    });

    it('should log with combined context', () => {
      logger.setContext({ app: 'weather' });
      const child = logger.child({ module: 'activitypub' });
      
      child.info('Child log', { action: 'test' });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '[INFO] Child log',
        { action: 'test' }
      );
    });
  });

  describe('edge cases', () => {
    it('should handle undefined data gracefully', () => {
      logger.info('No data');
      
      expect(consoleSpy).toHaveBeenCalledWith('[INFO] No data', {});
    });

    it('should handle null error objects', () => {
      logger.error('Error occurred', null);
      
      expect(consoleSpy).toHaveBeenCalledWith('[ERROR] Error occurred', {});
    });

    it('should handle circular references in production', () => {
      const prodLogger = new Logger('production');
      const circular = { a: 1 };
      circular.self = circular;
      
      expect(() => {
        prodLogger.info('Circular', circular);
      }).toThrow(); // JSON.stringify will throw on circular references
    });
  });
});