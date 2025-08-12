/**
 * Error handling utility
 */

export class ErrorHandler {
  /**
   * Handle errors and return appropriate responses
   * @param {Error} error
   * @param {Logger} logger
   * @returns {Response}
   */
  static handleError(error, logger) {
    // Handle null/undefined errors
    if (!error) {
      error = new Error('Unknown error');
    }
    
    // Log the full error
    logger.error('Error details', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      type: error.type,
      statusCode: error.statusCode
    });

    // Determine status code and message
    let status = 500;
    let message = 'Internal Server Error';

    // Handle AppError instances
    if (error instanceof AppError) {
      status = error.statusCode;
      // Use default message if message is empty
      if (!error.message || error.message.trim() === '') {
        // Provide default messages based on status code
        switch (status) {
          case 400:
            message = 'Bad Request';
            break;
          case 401:
            message = 'Unauthorized';
            break;
          case 404:
            message = 'Not Found';
            break;
          case 429:
            message = 'Too Many Requests';
            break;
          default:
            message = 'Internal Server Error';
        }
      } else {
        message = error.message;
      }
    }
    // Legacy error name handling for backward compatibility
    else if (error.name === 'ValidationError') {
      status = 400;
      message = error.message || 'Bad Request';
    } else if (error.name === 'NotFoundError') {
      status = 404;
      message = error.message || 'Not Found';
    } else if (error.name === 'UnauthorizedError') {
      status = 401;
      message = error.message || 'Unauthorized';
    } else if (error.name === 'RateLimitError') {
      status = 429;
      message = error.message || 'Too Many Requests';
    }
    // For generic errors, don't expose the message to the user
    else if (error.name === 'Error' && error.message) {
      // Log the real message but return generic message to user
      message = 'Internal Server Error';
    }

    // Return error response
    return new Response(JSON.stringify({
      error: message,
      timestamp: new Date().toISOString()
    }), {
      status,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}

/**
 * Unified application error class with factory methods
 */
export class AppError extends Error {
  constructor(message, type = 'GENERIC', statusCode = 500) {
    super(message);
    this.name = 'AppError';
    this.type = type;
    this.statusCode = statusCode;
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
  
  /**
   * Create a validation error
   * @param {string} message - Error message
   * @returns {AppError}
   */
  static validation(message = 'Validation failed') {
    return new AppError(message, 'VALIDATION', 400);
  }
  
  /**
   * Create a not found error
   * @param {string} resource - Resource that was not found
   * @returns {AppError}
   */
  static notFound(resource = 'Resource') {
    return new AppError(`${resource} not found`, 'NOT_FOUND', 404);
  }
  
  /**
   * Create an unauthorized error
   * @param {string} message - Error message
   * @returns {AppError}
   */
  static unauthorized(message = 'Unauthorized access') {
    return new AppError(message, 'UNAUTHORIZED', 401);
  }
  
  /**
   * Create a forbidden error
   * @param {string} message - Error message
   * @returns {AppError}
   */
  static forbidden(message = 'Access forbidden') {
    return new AppError(message, 'FORBIDDEN', 403);
  }
  
  /**
   * Create a rate limit error
   * @param {string} message - Error message
   * @returns {AppError}
   */
  static rateLimit(message = 'Rate limit exceeded') {
    return new AppError(message, 'RATE_LIMIT', 429);
  }
  
  /**
   * Create a bad request error
   * @param {string} message - Error message
   * @returns {AppError}
   */
  static badRequest(message = 'Bad request') {
    return new AppError(message, 'BAD_REQUEST', 400);
  }
  
  /**
   * Create an internal server error
   * @param {string} message - Error message
   * @returns {AppError}
   */
  static internal(message = 'Internal server error') {
    return new AppError(message, 'INTERNAL', 500);
  }
  
  /**
   * Create a service unavailable error
   * @param {string} message - Error message
   * @returns {AppError}
   */
  static serviceUnavailable(message = 'Service temporarily unavailable') {
    return new AppError(message, 'SERVICE_UNAVAILABLE', 503);
  }
}

// Export legacy error classes for backward compatibility
// These now use AppError internally
export class ValidationError extends AppError {
  constructor(message) {
    super(message, 'VALIDATION', 400);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message) {
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message) {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'UnauthorizedError';
  }
}

export class RateLimitError extends AppError {
  constructor(message) {
    super(message, 'RATE_LIMIT', 429);
    this.name = 'RateLimitError';
  }
}