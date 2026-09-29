import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('.');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg' };
const routes = { '/': 'demo/index.html', '/user/1': 'demo/profile.html', '/user/2': 'demo/long-profile.html', '/topic/24317': 'demo/topic.html', '/message-demo': 'demo/message.html' };
const server = http.createServer(async (req, res) => {
 const url = new URL(req.url, 'http://127.0.0.1');
 const name = routes[url.pathname] || (url.pathname.startsWith('/dist/') ? url.pathname.slice(1) : null);
 if (!name) { res.writeHead(404); res.end('Not found'); return; }
 try { const data = await readFile(path.join(root, name)); res.writeHead(200, { 'Content-Type': types[path.extname(name)] || 'text/plain' }); res.end(data); }
 catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(4173, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:4173 (local fixture data)'));
