/**
 * Logging utility for Cloudflare Workers
 */

export class Logger {
  constructor(environment = 'production') {
    this.environment = environment;
    this.context = {};
  }

  /**
   * Set context that will be included in all log messages
   * @param {Object} context
   */
  setContext(context) {
    this.context = { ...this.context, ...context };
  }

  /**
   * Log info level message
   * @param {string} message
   * @param {Object} data
   */
  info(message, data = {}) {
    this.log('INFO', message, data);
  }

  /**
   * Log warning level message
   * @param {string} message
   * @param {Object} data
   */
  warn(message, data = {}) {
    this.log('WARN', message, data);
  }

  /**
   * Log error level message
   * @param {string} message
   * @param {Error|Object} error
   */
  error(message, error = {}) {
    const errorData = error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : (error || {});
    
    this.log('ERROR', message, errorData);
  }

  /**
   * Log debug level message (only in development)
   * @param {string} message
   * @param {Object} data
   */
  debug(message, data = {}) {
    if (this.environment !== 'production') {
      this.log('DEBUG', message, data);
    }
  }

  /**
   * Core logging function
   * @param {string} level
   * @param {string} message
   * @param {Object} data
   */
  log(level, message, data = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      environment: this.environment,
      message,
      ...this.context,
      ...data
    };

    // In production, use structured logging
    if (this.environment === 'production') {
      console.log(JSON.stringify(logEntry));
    } else {
      // In development, use more readable format
      console.log(`[${level}] ${message}`, data);
    }
  }

  /**
   * Create a child logger with additional context
   * @param {Object} additionalContext
   * @returns {Logger}
   */
  child(additionalContext) {
    const childLogger = new Logger(this.environment);
    childLogger.context = { ...this.context, ...additionalContext };
    return childLogger;
  }
}