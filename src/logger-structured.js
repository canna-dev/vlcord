/**
 * Structured logging with JSON output
 * Supports filtering, parsing, and analysis
 */

const level = process.env.LOG_LEVEL || 'info';

const levels = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

function timestamp() {
  return new Date().toISOString();
}

function formatJsonLog(logLevel, module, message, data = {}) {
  return JSON.stringify({
    timestamp: timestamp(),
    level: logLevel,
    module,
    message,
    ...data
  });
}

function formatTextLog(logLevel, message) {
  const prefix = logLevel.toUpperCase().padEnd(5);
  return `[${prefix}] [${timestamp()}] ${message}`;
}

// Detect if output is being piped (for JSON) or terminal (for text)
const isJson = process.env.LOG_FORMAT === 'json' || !process.stdout.isTTY;

export default {
  /**
   * Log at debug level (verbose, internal details)
   */
  debug: (message, module = 'app', data = {}) => {
    if (levels[level] <= levels.debug) {
      if (isJson) {
        console.log(formatJsonLog('debug', module, message, data));
      } else {
        console.log(formatTextLog('debug', message));
      }
    }
  },

  /**
   * Log at info level (important lifecycle events)
   */
  info: (message, module = 'app', data = {}) => {
    if (levels[level] <= levels.info) {
      if (isJson) {
        console.log(formatJsonLog('info', module, message, data));
      } else {
        console.log(formatTextLog('info', message));
      }
    }
  },

  /**
   * Log at warn level (non-critical issues)
   */
  warn: (message, module = 'app', data = {}) => {
    if (levels[level] <= levels.warn) {
      if (isJson) {
        console.warn(formatJsonLog('warn', module, message, data));
      } else {
        console.warn(formatTextLog('warn', message));
      }
    }
  },

  /**
   * Log at error level (critical failures)
   */
  error: (message, module = 'app', data = {}) => {
    if (levels[level] <= levels.error) {
      if (isJson) {
        console.error(formatJsonLog('error', module, message, data));
      } else {
        console.error(formatTextLog('error', message));
      }
    }
  }
};
