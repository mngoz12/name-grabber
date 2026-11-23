// Minecraft skin viewer: no dependencies, needs Node 18+
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const page = fs.readFileSync(path.join(__dirname, 'index.html'));
const cache = new Map(); // name -> {t, data}
const TTL = 10 * 60 * 1000;

async function getSkin(name) {
  const key = name.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.data;

  const r = await fetch('https://api.mojang.com/users/profiles/minecraft/' + encodeURIComponent(name));
  if (r.status !== 200) return null;
  const { id } = await r.json();

  const p = await fetch('https://sessionserver.mojang.com/session/minecraft/profile/' + id);
  if (!p.ok) throw new Error('session');
  const prof = await p.json();
  const tex = (prof.properties || []).find(x => x.name === 'textures');
  if (!tex) return null;
  const skin = JSON.parse(Buffer.from(tex.value, 'base64').toString()).textures.SKIN;
  if (!skin) return null;

  const img = await fetch(skin.url);
  const data = {
    buf: Buffer.from(await img.arrayBuffer()),
    slim: !!(skin.metadata && skin.metadata.model === 'slim'),
    name: prof.name,
  };
  cache.set(key, { t: Date.now(), data });
  return data;
}

http.createServer(async (req, res) => {
  const m = req.url.split('?')[0].match(/^\/api\/skin\/(\w{1,16})$/);
  if (!m) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(page);
  }
  try {
    const s = await getSkin(m[1]);
    if (!s) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=300',
      'X-Skin-Model': s.slim ? 'slim' : 'classic',
      'X-Skin-Name': s.name,
    });
    res.end(s.buf);
  } catch (e) {
    res.writeHead(502); res.end('lookup failed');
  }
}).listen(PORT, () => console.log('Running on port ' + PORT));
