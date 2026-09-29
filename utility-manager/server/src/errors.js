export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.statusCode = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const unauthorized = (msg = 'Sign in required') => new HttpError(401, msg);
export const forbidden = (msg = 'You do not have permission to do this') => new HttpError(403, msg);
export const notFound = (what = 'Record') => new HttpError(404, `${what} not found`);
export const conflict = (msg) => new HttpError(409, msg);

// Translate Postgres errors into client-facing HTTP errors.
const PG_ERRORS = {
  '23505': [409, 'A record with these details already exists'],
  '23503': [409, 'This refers to a record that does not exist, or is still in use'],
  '23514': [400, 'A value is outside the allowed range'],
  '23502': [400, 'A required value is missing'],
  '22P02': [400, 'A value has the wrong format'],
  '22007': [400, 'A date or time has the wrong format'],
  '22008': [400, 'A date or time is out of range'],
  '22003': [400, 'A number is out of range'],
};

export function errorHandler(err, req, reply) {
  if (err instanceof HttpError) {
    return reply.code(err.statusCode).send({ error: err.message, details: err.details });
  }
  const pg = err.code && PG_ERRORS[err.code];
  if (pg) {
    req.log.info({ pgCode: err.code, detail: err.detail }, 'database constraint rejected request');
    // Trigger-raised check messages are written for users; others are generic.
    const message = err.code === '23514' && err.where?.includes('PL/pgSQL') ? err.message : pg[1];
    return reply.code(pg[0]).send({ error: message });
  }
  if (err.statusCode && err.statusCode < 500) {
    // Fastify's own errors (bad JSON, payload too large, rate limit ...)
    return reply.code(err.statusCode).send({ error: err.message });
  }
  req.log.error(err);
  return reply.code(500).send({ error: 'Something went wrong. The error has been logged.' });
}
