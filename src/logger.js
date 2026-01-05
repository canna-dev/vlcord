const level = process.env.LOG_LEVEL || 'info';

function timestamp() {
  return new Date().toISOString();
}

export default {
  info: (...args) => console.log(`[INFO] [${timestamp()}]`, ...args),
  warn: (...args) => console.warn(`[WARN] [${timestamp()}]`, ...args),
  error: (...args) => console.error(`[ERROR] [${timestamp()}]`, ...args),
  debug: (...args) => {
    if (level === 'debug') console.debug(`[DEBUG] [${timestamp()}]`, ...args);
  }
};
