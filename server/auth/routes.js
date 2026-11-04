import express from 'express';
import { createHash } from 'node:crypto';
import { validSessionToken } from './crypto.js';
import { AuthenticationError } from './provider.js';
import { sessionLifetime } from './sessions.js';

export function readSessionCookie(header = '', name = 'plazahub_local_session') {
  if (typeof header !== 'string' || header.length > 8192) return null;
  const matches = header.split(';').map(part => part.trim().split('=')).filter(([key]) => key === name);
  return matches.length === 1 && matches[0].length === 2 && validSessionToken(matches[0][1]) ? matches[0][1] : null;
}

// Bounded, single-process development limiter. Shared deployment limits remain
// a release gate. Client IP comes from the socket, never X-Forwarded-For.
function loginLimiter(clock, limit) {
  const attempts = new Map();
  return key => {
    const now = clock();
    for (const [entry, value] of attempts) if (value.expiresAt <= now) attempts.delete(entry);
    let bucket = attempts.get(key);
    if (!bucket) {
      if (attempts.size >= 10000) return false;
      bucket = { count:0, expiresAt:now + 10 * 60_000 };
      attempts.set(key, bucket);
    }
    return ++bucket.count <= limit;
  };
}

// Mounted only by explicit composition (currently integration tests). There is
// no CLI environment switch that opens login before the provider/RLS gates.
export function createSessionRouter({ service, origin, clock = Date.now, loginLimit = 10 }) {
  const configured = new URL(origin);
  if (configured.origin !== origin || configured.username || configured.password
    || !(configured.protocol === 'https:' || (configured.protocol === 'http:' && configured.hostname === '127.0.0.1'))) {
    throw new Error('Session routes require an explicit HTTPS or loopback origin.');
  }
  const router = express.Router({ caseSensitive:true });
  const secure = configured.protocol === 'https:';
  const cookieName = secure ? '__Host-plazahub_session' : 'plazahub_local_session';
  const cookieOptions = { httpOnly:true, secure, sameSite:'strict', path:secure ? '/' : '/api' };
  const takeAttempt = loginLimiter(clock, loginLimit);
  const error = (response, status, code, message) => response.status(status).json({
    error:{ code, message, requestId:response.locals.requestId },
  });
  const cookie = request => readSessionCookie(request.headers.cookie, cookieName);
  const clear = response => response.clearCookie(cookieName, cookieOptions);

  router.use((request, response, next) => {
    const mutation = !['GET', 'HEAD'].includes(request.method);
    const suppliedOrigin = request.headers.origin;
    if ((secure && !request.secure) || request.headers.host !== configured.host || request.headers['sec-fetch-site'] === 'cross-site'
      || (suppliedOrigin && suppliedOrigin !== origin) || (mutation && suppliedOrigin !== origin)) {
      return error(response, 403, 'ORIGIN_REJECTED', 'Use the configured application origin.');
    }
    if (Object.keys(request.query).length) return error(response, 400, 'VALIDATION_ERROR', 'Session routes do not accept query parameters.');
    next();
  });

  router.post('/login', (request, response, next) => {
    if (!takeAttempt(`ip:${request.socket.remoteAddress}`)) return error(response, 429, 'RATE_LIMITED', 'Too many attempts. Try again later.');
    if (!request.is('application/json')) return error(response, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json.');
    next();
  }, express.json({ limit:'4kb', strict:true }), async (request, response) => {
    const body = request.body;
    if (!body || Array.isArray(body) || Object.keys(body).sort().join(',') !== 'email,password'
      || typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) || body.email.length > 254
      || typeof body.password !== 'string' || !body.password.length || body.password.length > 1024) {
      return error(response, 400, 'VALIDATION_ERROR', 'Enter an email and password; extra fields are not accepted.');
    }
    const email = body.email.trim().toLowerCase();
    const key = createHash('sha256').update(email).digest('hex');
    if (!takeAttempt(`email:${key}`)) return error(response, 429, 'RATE_LIMITED', 'Too many attempts. Try again later.');
    const result = await service.login({ email, password:body.password }, cookie(request));
    response.cookie(cookieName, result.token, { ...cookieOptions, maxAge:sessionLifetime.absoluteMs });
    response.json({ data:result.data });
  });

  router.get('/', async (request, response) => {
    const data = await service.current(cookie(request));
    if (!data) { clear(response); return error(response, 401, 'AUTHENTICATION_REQUIRED', 'Sign in to continue.'); }
    response.json({ data });
  });
  router.delete('/', async (request, response) => {
    const token = cookie(request);
    if (token) await service.logout(token, request.headers['x-csrf-token']);
    clear(response);
    response.status(204).end();
  });
  router.all(['/', '/login'], (request, response) => {
    response.set('Allow', request.path === '/login' ? 'POST' : 'GET, HEAD, DELETE');
    error(response, 405, 'METHOD_NOT_ALLOWED', 'Use a supported session method.');
  });
  router.use((err, request, response, next) => {
    if (err instanceof AuthenticationError) {
      if (err.code === 'CSRF_FAILED') return error(response, 403, 'CSRF_FAILED', 'Reload the session before signing out.');
      if (err.code === 'AUTHENTICATION_FAILED') return error(response, 401, 'AUTHENTICATION_FAILED', 'Sign-in details or account access could not be verified.');
      return error(response, 503, 'AUTH_UNAVAILABLE', 'Authentication is temporarily unavailable.');
    }
    if (['entity.parse.failed', 'entity.too.large', 'charset.unsupported', 'encoding.unsupported'].includes(err.type)) {
      return error(response, err.type === 'entity.too.large' ? 413 : 400, 'INVALID_BODY', 'Send a small valid JSON object.');
    }
    next(err);
  });
  return router;
}
