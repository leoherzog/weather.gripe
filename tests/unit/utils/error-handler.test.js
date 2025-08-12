import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ErrorHandler,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  RateLimitError
} from '../../../src/utils/error-handler.js';
import { Logger } from '../../../src/utils/logger.js';

describe('ErrorHandler', () => {
  let logger;
  let loggerErrorSpy;

  beforeEach(() => {
    logger = new Logger('test');
    loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  describe('handleError', () => {
    it('should handle generic errors with 500 status', async () => {
      const error = new Error('Something went wrong');
      const response = ErrorHandler.handleError(error, logger);
      
      expect(response.status).toBe(500);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      
      const body = await response.json();
      expect(body.error).toBe('Internal Server Error');
      expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should log error details', () => {
      const error = new Error('Test error');
      ErrorHandler.handleError(error, logger);
      
      expect(loggerErrorSpy).toHaveBeenCalledWith('Error details', {
        name: 'Error',
        message: 'Test error',
        stack: expect.stringContaining('Test error'),
        type: undefined,
        statusCode: undefined
      });
    });

    it('should handle ValidationError with 400 status', async () => {
      const error = new ValidationError('Invalid input');
      const response = ErrorHandler.handleError(error, logger);
      
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe('Invalid input');
    });

    it('should handle NotFoundError with 404 status', async () => {
      const error = new NotFoundError('Resource not found');
      const response = ErrorHandler.handleError(error, logger);
      
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toBe('Resource not found');
    });

    it('should handle UnauthorizedError with 401 status', async () => {
      const error = new UnauthorizedError('Authentication required');
      const response = ErrorHandler.handleError(error, logger);
      
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe('Authentication required');
    });

    it('should handle RateLimitError with 429 status', async () => {
      const error = new RateLimitError('Rate limit exceeded');
      const response = ErrorHandler.handleError(error, logger);
      
      expect(response.status).toBe(429);
      const body = await response.json();
      expect(body.error).toBe('Rate limit exceeded');
    });

    it('should use default messages when error message is empty', async () => {
      const validationError = new ValidationError('');
      let response = ErrorHandler.handleError(validationError, logger);
      let body = await response.json();
      expect(body.error).toBe('Bad Request');

      const notFoundError = new NotFoundError('');
      response = ErrorHandler.handleError(notFoundError, logger);
      body = await response.json();
      expect(body.error).toBe('Not Found');

      const unauthorizedError = new UnauthorizedError('');
      response = ErrorHandler.handleError(unauthorizedError, logger);
      body = await response.json();
      expect(body.error).toBe('Unauthorized');

      const rateLimitError = new RateLimitError('');
      response = ErrorHandler.handleError(rateLimitError, logger);
      body = await response.json();
      expect(body.error).toBe('Too Many Requests');
    });

    it('should handle errors with custom properties', () => {
      const error = new Error('Custom error');
      error.customProp = 'custom value';
      
      const response = ErrorHandler.handleError(error, logger);
      
      expect(response.status).toBe(500);
      expect(loggerErrorSpy).toHaveBeenCalledWith('Error details', {
        name: 'Error',
        message: 'Custom error',
        stack: expect.any(String),
        type: undefined,
        statusCode: undefined
      });
    });

    it('should return valid JSON response', async () => {
      const error = new Error('Test');
      const response = ErrorHandler.handleError(error, logger);
      
      const body = await response.json();
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('timestamp');
    });
  });

  describe('Custom Error Classes', () => {
    describe('ValidationError', () => {
      it('should create error with correct name', () => {
        const error = new ValidationError('Invalid data');
        expect(error.name).toBe('ValidationError');
        expect(error.message).toBe('Invalid data');
        expect(error).toBeInstanceOf(Error);
      });
    });

    describe('NotFoundError', () => {
      it('should create error with correct name', () => {
        const error = new NotFoundError('Not found');
        expect(error.name).toBe('NotFoundError');
        expect(error.message).toBe('Not found');
        expect(error).toBeInstanceOf(Error);
      });
    });

    describe('UnauthorizedError', () => {
      it('should create error with correct name', () => {
        const error = new UnauthorizedError('Unauthorized');
        expect(error.name).toBe('UnauthorizedError');
        expect(error.message).toBe('Unauthorized');
        expect(error).toBeInstanceOf(Error);
      });
    });

    describe('RateLimitError', () => {
      it('should create error with correct name', () => {
        const error = new RateLimitError('Too many requests');
        expect(error.name).toBe('RateLimitError');
        expect(error.message).toBe('Too many requests');
        expect(error).toBeInstanceOf(Error);
      });
    });

    it('should maintain stack trace', () => {
      const error = new ValidationError('Test');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ValidationError');
    });
  });

  describe('Edge cases', () => {
    it('should handle null error object', () => {
      const response = ErrorHandler.handleError(null, logger);
      expect(response.status).toBe(500);
    });

    it('should handle undefined error object', () => {
      const response = ErrorHandler.handleError(undefined, logger);
      expect(response.status).toBe(500);
    });

    it('should handle error without stack trace', () => {
      const error = new Error('No stack');
      delete error.stack;
      
      const response = ErrorHandler.handleError(error, logger);
      expect(response.status).toBe(500);
      
      expect(loggerErrorSpy).toHaveBeenCalledWith('Error details', {
        name: 'Error',
        message: 'No stack',
        stack: undefined
      });
    });
  });
});