/* Shared top nav: menu, socials and the LC config/token API used by the game. */
(function(){
const LS = {
  get(k){ try{ return localStorage.getItem(k); }catch{ return null; } },
  set(k, v){ try{ v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); }catch{} }
};
const listeners = [];
const LC = window.LC = {
  config:{},
  token: () => LS.get('lc_token'),
  setToken: t => LS.set('lc_token', t),
  wallet: () => LS.get('lc_wallet'),
  onAuth: cb => listeners.push(cb)
};
const ICON = {
  x:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.8 3h3.1l-6.8 7.7 8 10.3h-6.3l-4.9-6.4L5.3 21H2.2l7.2-8.3L1.8 3h6.4l4.4 5.9L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z"/></svg>',
  tg:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.3-5 9.2-8.3c.4-.4-.1-.6-.6-.2L6.2 13 1.3 11.4c-1-.3-1.1-1 .2-1.5L20.6 2.5c.9-.3 1.6.2 1.3 1.8z"/></svg>'
};

const host = document.getElementById('topnav');
host.innerHTML = `
  <nav class="topnav glass" aria-label="Main">
    <a class="brand" href="/"><b>LE <em>COMMERÇANT</em></b><span>Defend your shop · Paris</span></a>
    <button class="menu-btn" type="button" aria-expanded="false" aria-controls="navlinks" aria-label="Menu">☰</button>
    <div class="navlinks" id="navlinks">
      <a href="/" aria-current="page">The Shop</a>
      <a href="#" id="openPanel">Chat &amp; leaderboard</a>
      <span class="sep" id="socSep" hidden></span>
      <a class="soc" id="socX" target="_blank" rel="noopener" hidden>${ICON.x}X</a>
      <a class="soc" id="socTg" target="_blank" rel="noopener" hidden>${ICON.tg}Telegram</a>
    </div>
  </nav>`;
const $ = id => document.getElementById(id);
$('openPanel').addEventListener('click', e => { e.preventDefault(); const p=$('panel'); if(p) p.classList.toggle('open'); const n=$('navlinks'); n.classList.remove('open'); });
const menu = host.querySelector('.menu-btn'), links = $('navlinks');
menu.addEventListener('click', () => { const o = links.classList.toggle('open'); menu.setAttribute('aria-expanded', o); });
document.addEventListener('click', e => { if(!host.contains(e.target)){ links.classList.remove('open'); menu.setAttribute('aria-expanded', false); } });

function renderConfig(){
  const c = LC.config;
  const soc = [['socX', c.xUrl], ['socTg', c.telegramUrl]];
  soc.forEach(([id, url]) => { const a = $(id); if(url){ a.href = url; a.hidden = false; } });
  $('socSep').hidden = !soc.some(s => s[1]);
}

LC.ready = fetch('/api/config').then(r => r.json()).then(c => { LC.config = c; renderConfig(); return c; }).catch(() => {});
})();
