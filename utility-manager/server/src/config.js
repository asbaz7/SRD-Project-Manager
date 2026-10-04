// All runtime configuration comes from environment variables.
import { fileURLToPath } from 'node:url';

const env = process.env;

function int(name, fallback) {
  const value = env[name];
  if (value === undefined || value === '') return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  return n;
}

// The built web app, next to the server folder. Not applicable on Cloudflare
// Workers (static files are served by Cloudflare), where this returns ''.
function defaultWebDist() {
  try {
    return fileURLToPath(new URL('../../web/dist', import.meta.url));
  } catch {
    return '';
  }
}

export function loadConfig(overrides = {}) {
  const production = env.NODE_ENV === 'production';
  const config = {
    production,
    port: int('PORT', 3000),
    host: env.HOST || '0.0.0.0',
    // Postgres connection string. Leave empty in development to use an
    // embedded database (PGlite) stored in PGLITE_DIR.
    databaseUrl: env.DATABASE_URL || '',
    databaseSsl: env.DATABASE_SSL === 'true',
    databasePoolSize: int('DATABASE_POOL_SIZE', 10),
    pgliteDir: env.PGLITE_DIR || './data/pglite',
    sessionTtlHours: int('SESSION_TTL_HOURS', 12),
    // HTTPS-only session cookie. On by default in production; set
    // COOKIE_SECURE=false only when serving plain HTTP on a trusted office network.
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : production,
    // Only these origins may send state-changing requests with a session cookie.
    allowedOrigins: (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
    timezone: env.APP_TIMEZONE || 'Indian/Maldives',
    webDist: env.WEB_DIST ?? defaultWebDist(),
    trustProxy: env.TRUST_PROXY === 'true',
    logLevel: env.LOG_LEVEL || (production ? 'info' : 'debug'),
    // Telegram bot token from @BotFather; the bot is off without it.
    telegramToken: env.TELEGRAM_BOT_TOKEN || '',
    // The site's public address, for links in Telegram messages.
    publicUrl: env.PUBLIC_URL || '',
    ...overrides,
  };
  if (config.production && !config.databaseUrl) {
    throw new Error('DATABASE_URL is required in production');
  }
  return config;
}
