import express from 'express';
import { randomUUID } from 'node:crypto';

export function sendError(response, status, code, message) {
  const requestId = response.locals.requestId || randomUUID();
  response.set('X-Request-Id', requestId);
  return response.status(status).json({ error:{ code, message, requestId } });
}

export function createErrorHandler(reportError = event => console.error(JSON.stringify(event))) {
  return (error, request, response, next) => {
    if (response.headersSent) { next(error); return; }
    // Error messages/stacks may contain credentials or input; never serialize them.
    const requestId = response.locals.requestId || randomUUID();
    response.locals.requestId = requestId;
    try { reportError({ code:'INTERNAL_ERROR', requestId }); } catch { /* Logging failure must not expose the original error. */ }
    sendError(response, 500, 'INTERNAL_ERROR', 'An unexpected server error occurred.');
  };
}

export function createApp({ reportError } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.disable('etag');
  app.set('trust proxy', false);
  app.set('case sensitive routing', true);
  app.set('json escape', true);
  app.set('json spaces', 2);
  app.use((request, response, next) => {
    response.locals.requestId = randomUUID(); // Do not trust a caller's ID/header.
    response.set({ 'X-Request-Id':response.locals.requestId,
      'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",
      'Referrer-Policy':'no-referrer' });
    next();
  });

  app.get('/api/health', (request, response) => {
    response.json({ data:{ service:'plazahub-api', status:'ok', stage:10,
      database:'not_configured', authentication:'not_configured', readyForBusiness:false } });
  });
  app.all('/api/health', (request, response) => {
    response.set('Allow', 'GET, HEAD');
    sendError(response, 405, 'METHOD_NOT_ALLOWED', 'Use GET or HEAD for the health endpoint.');
  });
  app.get('/api/ready', (request, response) => {
    sendError(response, 503, 'NOT_READY', 'Database and authentication are not configured.');
  });
  app.all('/api/ready', (request, response) => {
    response.set('Allow', 'GET, HEAD');
    sendError(response, 405, 'METHOD_NOT_ALLOWED', 'Use GET or HEAD for the readiness endpoint.');
  });
  // No resource routes, token decoding or body processing until auth exists.
  // Supplying a cookie, role, tenant ID or Bearer header cannot open this boundary.
  app.use('/api', (request, response) => {
    sendError(response, 503, 'AUTH_NOT_CONFIGURED', 'Protected API access is unavailable until authentication is configured.');
  });
  app.use((request, response) => {
    sendError(response, 404, 'NOT_FOUND', 'Route not found.');
  });
  app.use(createErrorHandler(reportError));
  return app;
}
