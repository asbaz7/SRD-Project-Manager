// Structured logging as JSON lines on the console. Works the same on Node.js
// and Cloudflare Workers (where console output goes to Workers Logs).
const LEVELS = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };
const METHOD = { trace: 'debug', debug: 'debug', info: 'log', warn: 'warn', error: 'error', fatal: 'error' };

export function createLogger(level = 'info', bindings = {}) {
  const min = LEVELS[level] ?? LEVELS.info;
  const logger = { level, child: (more) => createLogger(level, { ...bindings, ...more }) };
  for (const name of Object.keys(LEVELS)) {
    logger[name] = (obj, msg) => {
      if (LEVELS[name] < min) return;
      let entry = obj instanceof Error ? { err: obj } : typeof obj === 'string' ? { msg: obj } : { ...obj };
      if (msg) entry.msg = msg;
      if (entry.err instanceof Error) entry.err = { message: entry.err.message, code: entry.err.code, stack: entry.err.stack };
      console[METHOD[name]](JSON.stringify({ level: name, time: new Date().toISOString(), ...bindings, ...entry }));
    };
  }
  return logger;
}

export const silentLogger = Object.assign(
  Object.fromEntries(Object.keys(LEVELS).map((name) => [name, () => {}])),
  { level: 'silent', child: () => silentLogger },
);
