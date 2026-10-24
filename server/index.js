/* LE COMMERÇANT — server.
   Serves the game and holds the two things that need to be shared between players:
   the score board and the street chat. Gameplay itself runs in the browser. */
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const {WebSocketServer} = require('ws');
const nacl = require('tweetnacl');
const bs58 = require('bs58');
const store = require('./store');

const PORT = Number(process.env.PORT) || 3000;
const SHOP = process.env.SHOP_NAME || 'ÉPICERIE DU COIN';
const CONFIG = {
  shopName: SHOP,
  xUrl: process.env.X_URL || '',
  telegramUrl: process.env.TELEGRAM_URL || ''
};
const BOARD_N = 50, KEEP = 2000;
const clean = s => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, '').trim();
const clampNum = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };

/* ---------- http ---------- */
const app = express();
app.disable('x-powered-by');
app.use(express.json({limit:'8kb'}));
app.get('/healthz', (req, res) => res.json({ok:true, db:store.kind}));
app.get('/api/config', (req, res) => res.json(CONFIG));
app.get('/api/leaderboard', async (req, res, next) => {
  try{ res.json(board(await store.leaderboard(BOARD_N))); }catch(e){ next(e); }
});

// wallet sign-in: the player signs a one-time message; nothing is sent on-chain
const nonces = new Map();
const authMessage = n => `Sign in to LE COMMERÇANT\n\nThis proves you own this wallet. It is free and sends no funds.\n\nNonce: ${n}`;
app.get('/api/auth/nonce', (req, res) => {
  const n = crypto.randomBytes(16).toString('hex');
  nonces.set(n, Date.now());
  res.json({nonce:n, message:authMessage(n)});
});
app.post('/api/auth/wallet', async (req, res, next) => {
  try{
    const {pubkey, signature, nonce} = req.body || {};
    const issued = nonces.get(nonce); nonces.delete(nonce);
    if(!issued || Date.now() - issued > 5*60*1000) return res.status(400).json({error:'Sign-in expired, try again.'});
    let pk, sig;
    try{ pk = bs58.decode(String(pubkey)); sig = Buffer.from(String(signature), 'base64'); }catch{ return res.status(400).json({error:'Invalid signature.'}); }
    if(pk.length !== 32 || sig.length !== 64 || !nacl.sign.detached.verify(Buffer.from(authMessage(nonce)), sig, pk)) return res.status(401).json({error:'The signature does not match.'});
    const u = await store.walletUser(String(pubkey), null);
    tokenSockets.set(u.token, u.wallet);
    res.json({token:u.token, wallet:u.wallet, name:u.name || null});
  }catch(e){ next(e); }
});
setInterval(() => { const cut = Date.now() - 5*60*1000; for(const [n,t] of nonces) if(t < cut) nonces.delete(n); }, 60*1000).unref();

// score submission
app.post('/api/score', async (req, res, next) => {
  try{
    const b = req.body || {};
    const name = clean(b.name).slice(0, 16) || 'anonymous';
    const score = Math.round(clampNum(b.score, 0, 5e8, 0));
    const kos = Math.round(clampNum(b.kos, 0, 1e6, 0));
    const secs = Math.round(clampNum(b.time, 0, 7200, 0)*10)/10;
    if(score <= 0) return res.status(400).json({error:'Empty score.'});
    const wallet = ws_wallet_for(b.token) || null;
    const {rank} = await store.addScore({name, score, kos, secs, wallet});
    store.leaderboard(BOARD_N).then(rows => broadcast({type:'board', board:board(rows)})).catch(()=>{});
    if(rank <= 10) chat({kind:'sys', html:`<b>${esc(name)}</b> made the leaderboard: <b>${score.toLocaleString('en-US')}</b> pts (${kos} taken down, ${secs}s)`});
    res.json({rank, score, board:board(await store.leaderboard(BOARD_N))});
  }catch(e){ next(e); }
});

app.use(express.static(path.join(__dirname, '..', 'public'), {extensions:['html'], maxAge:'5m'}));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({error:'Server error'}); });

const server = http.createServer(app);
const wss = new WebSocketServer({server, path:'/ws', maxPayload:4096});

/* ---------- board + chat ---------- */
const esc = s => String(s).replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
const board = rows => rows.map(r => ({name:r.name, score:Number(r.score), kos:Number(r.kos), time:Number(r.secs)}));
const chatLog = [];
function chat(m){ chatLog.push(m); if(chatLog.length > 60) chatLog.shift(); broadcast({type:'chat', ...m}); }
const sys = html => chat({kind:'sys', html});

/* ---------- sockets ---------- */
const tokenSockets = new Map();     // auth token -> wallet address
function ws_wallet_for(token){ return tokenSockets.get(token) || null; }
function send(ws, m){ if(ws.readyState === 1) ws.send(JSON.stringify(m)); }
function broadcast(m){ const s = JSON.stringify(m); for(const ws of wss.clients) if(ws.readyState === 1) ws.send(s); }
function presence(){ const n = wss.clients.size; broadcast({type:'presence', watching:n}); }

wss.on('connection', ws => {
  ws.alive = true; ws.name = 'anonymous'; ws.lastChat = 0;
  ws.on('pong', () => { ws.alive = true; });
  store.leaderboard(BOARD_N).then(rows => send(ws, {type:'init', config:CONFIG, chat:chatLog, board:board(rows), watching:wss.clients.size})).catch(()=>{
    send(ws, {type:'init', config:CONFIG, chat:chatLog, board:[], watching:wss.clients.size});
  });
  presence();
  ws.on('message', async raw => {
    let m; try{ m = JSON.parse(raw); }catch{ return; }
    try{
      if(m.type === 'hello'){
        ws.name = clean(m.name).slice(0,16) || 'anonymous';
        if(m.name) chat({kind:'sys', html:`<b>${esc(ws.name)}</b> walks into the street.`});
        return;
      }
      if(m.type === 'chat'){
        const text = clean(m.text).slice(0, 140);
        if(!text) return;
        if(Date.now() - ws.lastChat < 1200) return send(ws, {type:'err', text:'Slow down…'});
        ws.lastChat = Date.now();
        chat({kind:'user', u:ws.name, text});
      }
    }catch(e){ console.error('ws', e); }
  });
  ws.on('close', () => { presence(); });
});
setInterval(() => { for(const ws of wss.clients){ if(!ws.alive){ ws.terminate(); continue; } ws.alive = false; ws.ping(); } }, 30000).unref();

(async () => {
  await store.init();
  await store.clean(KEEP).catch(()=>{});
  server.listen(PORT, '0.0.0.0', () => console.log(`LE COMMERÇANT on :${PORT} (store: ${store.kind})`));
})().catch(e => { console.error(e); process.exit(1); });
