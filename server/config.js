// Stage 10 is a loopback-only foundation, not a production configuration.
export function readConfig(environment = process.env) {
  const port = environment.PORT ?? '4174';
  const mode = environment.NODE_ENV ?? 'development';
  if (typeof port !== 'string' || !/^[1-9]\d{0,4}$/.test(port) || Number(port) > 65535) {
    throw new Error('PORT must be a whole number between 1 and 65535.');
  }
  if (!['development', 'test'].includes(mode)) {
    throw new Error('This API foundation supports development/test only.');
  }
  return Object.freeze({ port:Number(port), host:'127.0.0.1', environment:mode });
}
