const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const routes = new Map([
  ['/', ['plazahub.html', 'text/html; charset=utf-8']],
  ['/plazahub.html', ['plazahub.html', 'text/html; charset=utf-8']],
  ['/js/app.js', ['js/app.js', 'text/javascript; charset=utf-8']],
  ['/css/style.css', ['css/style.css', 'text/css; charset=utf-8']],
]);
const server = http.createServer((request, response) => {
  const route = routes.get(request.url.split('?')[0]);
  if (!route || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  fs.readFile(path.join(root, route[0]), (error, data) => {
    if (error) {
      response.writeHead(500);
      response.end('Unable to load preview');
      return;
    }
    response.writeHead(200, { 'Content-Type':route[1], 'Cache-Control':'no-store' });
    response.end(request.method === 'HEAD' ? undefined : data);
  });
});
server.on('error', error => {
  console.error(`Preview failed: ${error.message}`);
  process.exitCode = 1;
});
server.listen(4173, '127.0.0.1', () => console.log('PlazaHub preview: http://127.0.0.1:4173'));
