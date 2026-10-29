// Tiny static server. Node 18+, no dependencies.
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, 'public'), port = process.env.PORT || 3000;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
http.createServer((req, res) => {
  const p = path.normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^([/\\])+/, '');
  const file = path.join(root, p || 'index.html');
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, () => console.log(`http://localhost:${port}`));
