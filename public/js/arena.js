/* LE COMMERÇANT — renderer + input.
   A sunny Haussmannian Paris street. You play the shopkeeper: move along the storefront, punch
   and kick the rioters pouring down both sides of the boulevard, and keep the glass intact.
   The raid never stops until the glass breaks, the shop burns and the merchant is left crying.
   All gameplay lives in engine.js; this file draws it, plays it and talks to the server for
   chat + leaderboard. */
(function(){
const R = THREE;
const $ = id => document.getElementById(id);
const fmt = n => Math.round(n).toLocaleString('en-US');
const rand = (a,b) => a + Math.random()*(b-a);
const lerp = (a,b,t) => a + (b-a)*t;
function lerpAngle(a,b,t){ let d=(b-a)%(Math.PI*2); if(d>Math.PI) d-=Math.PI*2; if(d<-Math.PI) d+=Math.PI*2; return a+d*t; }
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const AUD = window.LCAudio;

/* ---------- renderer ---------- */
const canvas = $('scene');
const renderer = new R.WebGLRenderer({canvas, antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputEncoding = R.sRGBEncoding;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = R.PCFSoftShadowMap;
renderer.toneMapping = R.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;

const scene = new R.Scene();
const SKY = 0xcfe0f0;
scene.fog = new R.Fog(SKY, 34, 120);
const camera = new R.PerspectiveCamera(46, 1, 0.1, 400);

const hemi = new R.HemisphereLight(0xdceaff, 0x9a8f78, .85); scene.add(hemi);
const sun = new R.DirectionalLight(0xfff2d8, 1.25);
sun.position.set(-16, 26, 20); sun.castShadow = true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-20; sun.shadow.camera.right=20; sun.shadow.camera.top=22; sun.shadow.camera.bottom=-8;
sun.shadow.camera.near=1; sun.shadow.camera.far=70; sun.shadow.bias=-0.0006; scene.add(sun);
const fill = new R.DirectionalLight(0xbfd4ee, .28); fill.position.set(14, 10, -12); scene.add(fill);

const world = new R.Group(); scene.add(world);

/* ---------- textures ---------- */
function tex(w, h, draw, repeat){
  const c = document.createElement('canvas'); c.width=w; c.height=h;
  draw(c.getContext('2d'), w, h);
  const t = new R.CanvasTexture(c); t.encoding = R.sRGBEncoding; t.anisotropy = 4;
  if(repeat){ t.wrapS = t.wrapT = R.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const skyTex = tex(8,256,(g,w,h)=>{
  const grd=g.createLinearGradient(0,0,0,h);
  grd.addColorStop(0,'#6ea9e0'); grd.addColorStop(0.5,'#b9d5ee'); grd.addColorStop(0.8,'#dfeaf3'); grd.addColorStop(1,'#eef2f4');
  g.fillStyle=grd; g.fillRect(0,0,w,h);
});
const cobble = tex(256,256,(g,w,h)=>{
  g.fillStyle='#6d7280'; g.fillRect(0,0,w,h);
  const s=32;
  for(let y=0;y<h;y+=s) for(let x=0;x<w;x+=s){
    const o=(y/s%2)*s/2, v=Math.random()*26|0;
    g.fillStyle=`rgb(${118+v},${122+v},${132+v})`; g.fillRect(x+o+2,y+2,s-5,s-5);
    g.fillStyle='rgba(255,255,255,.06)'; g.fillRect(x+o+2,y+2,s-5,3);
  }
},[5,9]);
const road = tex(256,256,(g,w,h)=>{
  g.fillStyle='#4c4f57'; g.fillRect(0,0,w,h);
  for(let i=0;i<3200;i++){ const v=Math.random()*30|0;
    g.fillStyle=`rgba(${70+v},${72+v},${78+v},.5)`; g.fillRect(Math.random()*w,Math.random()*h,2,2); }
},[5,9]);
// Haussmann limestone: cream ashlar with fine joints
function limestoneTex(tint){
  return tex(256,256,(g,w,h)=>{
    g.fillStyle=tint||'#e6dcc6'; g.fillRect(0,0,w,h);
    for(let i=0;i<1600;i++){ g.fillStyle=`rgba(${150+Math.random()*70|0},${140+Math.random()*60|0},${115+Math.random()*55|0},.16)`; g.fillRect(Math.random()*w,Math.random()*h,3,3); }
    g.strokeStyle='rgba(120,108,88,.35)'; g.lineWidth=1.5;
    for(let y=0;y<=h;y+=64){ g.beginPath(); g.moveTo(0,y); g.lineTo(w,y); g.stroke(); }
    for(let y=0;y<h;y+=64){ const off=(y/64%2)*64; for(let x=off;x<=w;x+=128){ g.beginPath(); g.moveTo(x,y); g.lineTo(x,y+64); g.stroke(); } }
    g.fillStyle='rgba(90,80,64,.05)'; for(let y=0;y<h;y+=64) g.fillRect(0,y+58,w,6);
  },[1,1]);
}
const stoneTex = limestoneTex('#e9dfc9');
const stoneTex2 = limestoneTex('#ddcfb2');
const slateTex = tex(128,128,(g,w,h)=>{
  g.fillStyle='#565b63'; g.fillRect(0,0,w,h);
  for(let y=0;y<h;y+=14){ g.fillStyle=`rgba(${40+Math.random()*30|0},${44+Math.random()*30|0},${52+Math.random()*30|0},.7)`; g.fillRect(0,y+1,w,11); }
  g.strokeStyle='rgba(30,32,38,.5)'; for(let y=0;y<h;y+=14){ g.beginPath(); g.moveTo(0,y); g.lineTo(w,y); g.stroke(); }
},[10,4]);
const zincTex = tex(128,128,(g,w,h)=>{ g.fillStyle='#8b9099'; g.fillRect(0,0,w,h);
  for(let i=0;i<1200;i++){ g.fillStyle=`rgba(${120+Math.random()*60|0},${124+Math.random()*60|0},${132+Math.random()*60|0},.25)`; g.fillRect(Math.random()*w,Math.random()*h,2,6); } },[8,3]);
const awnTex = tex(256,64,(g,w,h)=>{ for(let i=0;i<10;i++){ g.fillStyle=i%2?'#12513a':'#f3ecda'; g.fillRect(i*w/10,0,w/10,h);} });
const flagTex = tex(192,128,(g,w,h)=>{ const c=['#0b3d91','#f4f4f4','#d3202a']; for(let i=0;i<3;i++){ g.fillStyle=c[i]; g.fillRect(i*w/3,0,w/3,h);} });
const smokeTex = tex(128,128,(g,w,h)=>{ const rg=g.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2); rg.addColorStop(0,'rgba(70,66,62,0.55)'); rg.addColorStop(1,'rgba(70,66,62,0)'); g.fillStyle=rg; g.fillRect(0,0,w,h); });
const gasTex = tex(128,128,(g,w,h)=>{ const rg=g.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);
  rg.addColorStop(0,'rgba(208,220,164,.6)'); rg.addColorStop(.55,'rgba(178,196,126,.34)'); rg.addColorStop(1,'rgba(150,170,100,0)');
  g.fillStyle=rg; g.fillRect(0,0,w,h); });
const flameTex = tex(96,128,(g,w,h)=>{ const rg=g.createRadialGradient(w/2,h*0.66,2,w/2,h*0.66,w/2); rg.addColorStop(0,'rgba(255,244,190,1)'); rg.addColorStop(.4,'rgba(255,170,50,.95)'); rg.addColorStop(.75,'rgba(224,70,20,.5)'); rg.addColorStop(1,'rgba(120,20,0,0)'); g.fillStyle=rg; g.fillRect(0,0,w,h); });
const glowTex = tex(96,96,(g,w,h)=>{ const rg=g.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2); rg.addColorStop(0,'rgba(255,240,200,.9)'); rg.addColorStop(1,'rgba(255,200,120,0)'); g.fillStyle=rg; g.fillRect(0,0,w,h); });

function signTex(text, sub){
  return tex(1024,256,(g,w,h)=>{
    g.fillStyle='#0f3d2a'; g.fillRect(0,0,w,h);
    g.fillStyle='#f6efdd'; g.fillRect(14,14,w-28,h-28);
    g.fillStyle='#0f3d2a'; g.font='900 104px "Saira Condensed", Arial'; g.textAlign='center'; g.textBaseline='middle';
    g.fillText(text, w/2, h/2 - (sub?14:0));
    if(sub){ g.font='700 40px "JetBrains Mono", monospace'; g.fillText(sub, w/2, h/2 + 64); }
  });
}

/* ---------- street ---------- */
const ST_Z = 0;
// the pavement is a raised slab in front of the shop: characters must stand on it
const PAVE_TOP = 0.22, PAVE_Z0 = 0.0, PAVE_Z1 = 4.4;
function floorY(z){ return (z >= PAVE_Z0 && z <= PAVE_Z1) ? PAVE_TOP : 0; }
function ground(){
  const sky = new R.Mesh(new R.SphereGeometry(200,24,16), new R.MeshBasicMaterial({map:skyTex, side:R.BackSide, depthWrite:false}));
  scene.add(sky);
  const roadM = new R.Mesh(new R.PlaneGeometry(90, 140), new R.MeshStandardMaterial({map:road, roughness:.85}));
  roadM.rotation.x=-Math.PI/2; roadM.position.set(0,0,40); roadM.receiveShadow=true; world.add(roadM);
  const pavement = new R.Mesh(new R.BoxGeometry(46, 0.22, 4.4), new R.MeshStandardMaterial({map:cobble, roughness:.92}));
  pavement.position.set(0,0.11,2.2); pavement.receiveShadow=true; world.add(pavement);
  const kerb = new R.Mesh(new R.BoxGeometry(46,0.3,0.22), new R.MeshStandardMaterial({color:0xb9bcc2, roughness:.9}));
  kerb.position.set(0,0.15,4.42); world.add(kerb);
  // zebra crossing
  const zw = new R.MeshStandardMaterial({color:0xf2f2ee, roughness:.8});
  for(let i=-5;i<=5;i++){ const s=new R.Mesh(new R.BoxGeometry(0.55,0.02,3.0), zw); s.position.set(i*1.15,0.02,7.4); world.add(s); }
}
function lamp(x,z){
  const g=new R.Group();
  const m=new R.MeshStandardMaterial({color:0x1d3a2c, metalness:.5, roughness:.5});
  const base=new R.Mesh(new R.CylinderGeometry(0.2,0.28,0.5,10), m); base.position.y=0.25; g.add(base);
  const pole=new R.Mesh(new R.CylinderGeometry(0.09,0.11,6.4,10), m); pole.position.y=3.4; pole.castShadow=true; g.add(pole);
  const top=new R.Mesh(new R.CylinderGeometry(0.16,0.3,0.9,10), m); top.position.y=6.7; g.add(top);
  const lantern=new R.Mesh(new R.SphereGeometry(0.22,10,8), new R.MeshStandardMaterial({color:0xfff3c8, emissive:0xffe9b0, emissiveIntensity:.35})); lantern.position.y=7.15; g.add(lantern);
  const fin=new R.Mesh(new R.ConeGeometry(0.2,0.3,10), m); fin.position.y=7.5; g.add(fin);
  g.position.set(x,floorY(z),z); world.add(g); return g;
}
function streetProps(){
  for(const [x,z] of [[-10.5,2.6],[10.5,2.6],[-19,7],[19,7]]) lamp(x,z);
  const bolM=new R.MeshStandardMaterial({color:0x21402f, metalness:.4, roughness:.5});
  for(let x=-15;x<=15;x+=2.6){ if(Math.abs(x)<0.6) continue;
    const b=new R.Mesh(new R.CylinderGeometry(0.09,0.1,0.95,10), bolM); b.position.set(x,floorY(3.9)+0.58,3.9); b.castShadow=true; world.add(b);
    const cap=new R.Mesh(new R.SphereGeometry(0.12,10,8), bolM); cap.position.set(x,floorY(3.9)+1.08,3.9); world.add(cap);
  }
  // Morris column (advertising)
  const col=new R.Group(); const cm=new R.MeshStandardMaterial({color:0x23402f, roughness:.5, metalness:.3});
  const body=new R.Mesh(new R.CylinderGeometry(0.55,0.6,3.2,16), cm); body.position.y=1.6; body.castShadow=true; col.add(body);
  const dom=new R.Mesh(new R.SphereGeometry(0.58,16,10,0,Math.PI*2,0,Math.PI/2), cm); dom.position.y=3.2; col.add(dom);
  const crown=new R.Mesh(new R.ConeGeometry(0.22,0.5,12), cm); crown.position.y=3.75; col.add(crown);
  const poster=new R.Mesh(new R.CylinderGeometry(0.565,0.615,2.2,16,1,true), new R.MeshStandardMaterial({map:tex(128,256,(g,w,h)=>{ g.fillStyle='#c94b3a'; g.fillRect(0,0,w,h); g.fillStyle='#f7f0dc'; g.font='900 40px Arial'; g.textAlign='center'; g.fillText('PARIS',w/2,h/2-10); g.font='700 20px Arial'; g.fillText('THÉÂTRE',w/2,h/2+30); }), side:R.DoubleSide})); poster.position.y=1.7; col.add(poster);
  col.position.set(-14.5,floorY(2.4),2.4); world.add(col);
  // tree in a grate
  const tr=new R.Group(); const trunk=new R.Mesh(new R.CylinderGeometry(0.18,0.24,3.0,8), new R.MeshStandardMaterial({color:0x5a4632, roughness:.9})); trunk.position.y=1.5; trunk.castShadow=true; tr.add(trunk);
  const leafM=new R.MeshStandardMaterial({color:0x4f7a3a, roughness:.95});
  for(const [dx,dy,dz,s] of [[0,3.4,0,1.9],[-0.9,3.0,0.4,1.3],[0.9,3.1,-0.3,1.4],[0.2,4.0,0.6,1.2]]){
    const b=new R.Mesh(new R.SphereGeometry(s,10,8), leafM); b.position.set(dx,dy,dz); b.castShadow=true; tr.add(b);
  }
  tr.position.set(13.5,floorY(2.4),2.4); world.add(tr);
  // scooter
  const sc=new R.Group(); const sm=new R.MeshStandardMaterial({color:0xd8d2c4, metalness:.4, roughness:.4});
  const sbod=new R.Mesh(new R.BoxGeometry(1.2,0.5,0.5), sm); sbod.position.y=0.6; sc.add(sbod);
  const seat=new R.Mesh(new R.BoxGeometry(0.6,0.18,0.42), new R.MeshStandardMaterial({color:0x22242a})); seat.position.set(-0.25,0.9,0); sc.add(seat);
  const bar=new R.Mesh(new R.CylinderGeometry(0.03,0.03,0.7,6), new R.MeshStandardMaterial({color:0x33363c})); bar.rotation.z=Math.PI/2; bar.position.set(0.5,1.0,0); sc.add(bar);
  for(const z of [-0.24,0.24]){ const w=new R.Mesh(new R.CylinderGeometry(0.32,0.32,0.14,14), new R.MeshStandardMaterial({color:0x17181c})); w.rotation.x=Math.PI/2; w.position.set(z>0?0.5:-0.5,0.32,z*2.6); sc.add(w); }
  sc.position.set(9.5,floorY(3.2),3.2); sc.rotation.y=0.3; world.add(sc);
}

/* Haussmann block: ground-floor shopfront is built separately for the hero building. */
function haussmann(x, z, opts){
  opts = opts||{};
  const stone = new R.MeshStandardMaterial({map: opts.tint? stoneTex2 : stoneTex, roughness:.95});
  const railM = new R.MeshStandardMaterial({color:0x1a1c20, metalness:.6, roughness:.5});
  const winM = new R.MeshStandardMaterial({color:0x2a3038, metalness:.5, roughness:.25});
  const g = new R.Group();
  const W = opts.w||14, D = opts.d||18, FLOORS = opts.floors||3;
  const gy = opts.ground||4.6, fh = 3.15;
  const body = new R.Mesh(new R.BoxGeometry(W, FLOORS*fh + 0.6, D), stone);
  body.position.set(0, gy + (FLOORS*fh)/2 - 0.3, 0); body.castShadow=true; body.receiveShadow=true; g.add(body);
  const base = new R.Mesh(new R.BoxGeometry(W+0.3, gy, opts.baseD||D+0.3), new R.MeshStandardMaterial({map:stoneTex2, color:0xd7cbb0, roughness:.95}));
  base.position.set(0, gy/2, opts.baseZ||0); base.castShadow=true; g.add(base);
  // cornices
  for(let f=0; f<=FLOORS; f++){
    const c=new R.Mesh(new R.BoxGeometry(W+0.44,0.26,D+0.44), new R.MeshStandardMaterial({color:0xe7dcc4, roughness:.9}));
    c.position.set(0, gy+f*fh, 0); c.castShadow=true; g.add(c);
  }
  // tall french windows + iron balconies (floor 0 and top get full balconies)
  const cols = Math.max(3, Math.round(W/3));
  for(let f=0; f<FLOORS; f++){
    const y = gy + f*fh + 1.75;
    for(let c=0;c<cols;c++){
      const wx = -W/2 + (c+0.5)*(W/cols);
      const win = new R.Mesh(new R.BoxGeometry(1.25, 2.05, 0.12), winM);
      win.position.set(wx, y, D/2+0.06); g.add(win);
      const lit = new R.Mesh(new R.PlaneGeometry(1.3,2.1), new R.MeshBasicMaterial({color:Math.random()<0.5?0x8a95a2:0x5c6672}));
      lit.position.set(wx, y, D/2+0.13); g.add(lit);
      const grid=new R.Mesh(new R.PlaneGeometry(1.32,2.12), new R.MeshBasicMaterial({color:0xf3f0e8, wireframe:true, transparent:true, opacity:.7}));
      grid.position.set(wx,y,D/2+0.14); g.add(grid);
      const lint=new R.Mesh(new R.BoxGeometry(1.7,0.22,0.34), new R.MeshStandardMaterial({color:0xefe6d2, roughness:.9})); lint.position.set(wx,y+1.2,D/2+0.1); g.add(lint);
      const sill=new R.Mesh(new R.BoxGeometry(1.6,0.14,0.34), new R.MeshStandardMaterial({color:0xefe6d2, roughness:.9})); sill.position.set(wx,y-1.12,D/2+0.1); g.add(sill);
      if(f===0 || f===FLOORS-1){
        const rail=new R.Mesh(new R.BoxGeometry(1.9,0.06,0.5), railM); rail.position.set(wx,y-1.0,D/2+0.28); g.add(rail);
        for(let b=0;b<7;b++){ const bar=new R.Mesh(new R.BoxGeometry(0.03,0.5,0.03), railM); bar.position.set(wx-0.85+b*0.28, y-0.75, D/2+0.5); g.add(bar); }
        const rail2=rail.clone(); rail2.position.y = y-0.5; g.add(rail2);
      }
    }
  }
  // mansard roof
  const roof=new R.Mesh(new R.BoxGeometry(W-0.5, 2.5, D-0.5), new R.MeshStandardMaterial({map:slateTex, roughness:.85}));
  roof.position.set(0, gy+FLOORS*fh+1.35, 0); roof.castShadow=true; g.add(roof);
  const roofTop=new R.Mesh(new R.BoxGeometry(W-1.6, 1.1, D-1.6), new R.MeshStandardMaterial({map:zincTex, roughness:.6, metalness:.3}));
  roofTop.position.set(0, gy+FLOORS*fh+2.8, 0); g.add(roofTop);
  for(let c=0;c<cols-1;c++){
    const dx = -W/2 + (c+1)*(W/cols);
    const dor=new R.Mesh(new R.BoxGeometry(0.9,1.05,0.1), winM); dor.position.set(dx, gy+FLOORS*fh+0.7, D/2-0.2); g.add(dor);
    const chim=new R.Mesh(new R.BoxGeometry(0.5,1.3,0.5), new R.MeshStandardMaterial({color:0xc9b79a, roughness:.95}));
    chim.position.set(dx, gy+FLOORS*fh+2.7, -D/4); g.add(chim);
  }
  if(!opts.noGround){
    // plain ground floor for the neighbours
    const gf=new R.Mesh(new R.BoxGeometry(W, gy, D), new R.MeshStandardMaterial({map:stoneTex2, color:0xcfc3a8, roughness:.95}));
    gf.position.set(0, gy/2, 0); g.add(gf);
    for(let c=0;c<cols;c++){
      const wx=-W/2+(c+0.5)*(W/cols);
      const dw=new R.Mesh(new R.BoxGeometry(1.3,2.6,0.12), new R.MeshStandardMaterial({color:0x2f3b32, roughness:.6}));
      dw.position.set(wx, 1.5, D/2+0.03); g.add(dw);
      if(c===0||c===cols-1){ const awn=new R.Mesh(new R.BoxGeometry(1.7,0.1,1.0), new R.MeshStandardMaterial({map:awnTex, roughness:.85})); awn.position.set(wx,2.9,D/2+0.5); awn.rotation.x=0.22; g.add(awn); }
    }
  }
  g.position.set(x, 0, z); world.add(g); return g;
}

/* ---------- hero storefront ---------- */
const glassMatBase = {color:0xbcd8ee, transparent:true, opacity:.24, shininess:150, specular:0xeaf6ff, side:R.DoubleSide, depthWrite:false};
const panes = [];                       // {mesh, x}
const cracks = [];                      // overlay meshes
let crackTex, crackCtx, crackFrac = -1, cracksDrawn = 0;
let shopSign, doorMesh, awningMesh, flag, flagBase, shopGlow;
function drawCracks(frac){
  if(Math.abs(frac-crackFrac) < 0.025 && (frac < 0.02) === (crackFrac < 0.02)) return;
  crackFrac = frac;
  const g = crackCtx, w = 512, h = 512; g.clearRect(0,0,w,h);
  if(frac <= 0.01){ crackTex.needsUpdate = true; return; }
  const impact = Math.floor(frac*7);
  for(let i=0;i<impact;i++){
    const cx = rand(40,w-40), cy = rand(40,h-40);
    g.strokeStyle = `rgba(246,252,255,${0.5+frac*0.45})`; g.lineWidth = 1.7;
    for(let r=0;r<9;r++){
      let a=r/9*Math.PI*2+rand(-0.2,0.2), x=cx, y=cy; g.beginPath(); g.moveTo(x,y);
      const seg=4+Math.floor(Math.random()*5);
      for(let s=0;s<seg;s++){ a+=rand(-0.4,0.4); const len=rand(8,34)*(0.5+frac); x+=Math.cos(a)*len; y+=Math.sin(a)*len; g.lineTo(x,y); }
      g.stroke();
    }
    g.beginPath(); g.arc(cx,cy,rand(6,16),0,Math.PI*2); g.stroke();
  }
  crackTex.needsUpdate = true;
}
function face(head, o){
  const skin = new R.MeshStandardMaterial({color:o.skin||0xd7a780, roughness:.75});
  for(const sx of [-1,1]){
    const e=new R.Mesh(new R.SphereGeometry(0.032,10,8), new R.MeshBasicMaterial({color:0xf7f8fb})); e.position.set(sx*0.062,0.14,0.108); head.add(e);
    const p=new R.Mesh(new R.SphereGeometry(0.016,8,6), new R.MeshBasicMaterial({color:0x20222a})); p.position.set(sx*0.062,0.138,0.132); head.add(p);
    const brow=new R.Mesh(new R.BoxGeometry(0.078,0.017,0.02), new R.MeshStandardMaterial({color:o.hair||0x2a1a10, roughness:.8}));
    brow.position.set(sx*0.062, 0.183 + (o.worried?0.006:0), 0.108);
    brow.rotation.z = o.worried ? -sx*0.44 : (o.angry ? sx*0.5 : sx*0.06);
    head.add(brow);
  }
  const nose=new R.Mesh(new R.BoxGeometry(0.036,0.06,0.05), skin); nose.position.set(0,0.108,0.122); head.add(nose);
  const mouth=new R.Mesh(new R.TorusGeometry(0.043,0.009,6,14,Math.PI), new R.MeshBasicMaterial({color:o.worried?0x8a3a34:0x5a2a26}));
  mouth.position.set(0,0.05,0.112); if(o.worried) mouth.rotation.x=-0.28; head.add(mouth);
  if(o.eyebag){ for(const sx of [-1,1]){ const b=new R.Mesh(new R.BoxGeometry(0.06,0.012,0.014), new R.MeshStandardMaterial({color:0xc9a58a})); b.position.set(sx*0.062,0.115,0.106); b.rotation.z=sx*0.42; head.add(b); } }
}
function storefront(){
  const stone = new R.MeshStandardMaterial({map:stoneTex, roughness:.95});
  const g = new R.Group();
  haussmann(0, -5.5, {w:22, d:11, floors:3, ground:4.6, tint:false, noGround:true, baseD:7.0, baseZ:-2.2});
  // shop interior
  const back=new R.Mesh(new R.BoxGeometry(14,4.4,0.2), new R.MeshStandardMaterial({color:0x7a5a34, roughness:.95})); back.position.set(0,2.2,-3.2); g.add(back);
  for(const [x,c] of [[-4.6,0xc23b2e],[-3.0,0x2e7d4f],[3.0,0xd8a53a],[4.6,0x3f5f9a]]){
    const sh=new R.Mesh(new R.BoxGeometry(1.7,2.7,0.5), new R.MeshStandardMaterial({color:0x4a3a24, roughness:.9})); sh.position.set(x,1.45,-2.4); g.add(sh);
    for(let i=0;i<4;i++){ const it=new R.Mesh(new R.BoxGeometry(1.4,0.16,0.4), new R.MeshStandardMaterial({color:c, roughness:.7})); it.position.set(x,0.5+i*0.62,-2.3); g.add(it); }
  }
  const counter=new R.Mesh(new R.BoxGeometry(3.0,1.0,0.8), new R.MeshStandardMaterial({color:0x5a4326, roughness:.9})); counter.position.set(-3.4,0.5,-1.4); g.add(counter);
  shopGlow=new R.PointLight(0xfff0cf, 1.7, 12, 2); shopGlow.position.set(0,2.4,-1.4); g.add(shopGlow);
  // pilasters framing the shop
  for(const x of [-9.2,-6.0,6.0,9.2]){
    const p=new R.Mesh(new R.BoxGeometry(2.4,4.6,2.4), new R.MeshStandardMaterial({map:stoneTex2, color:0xd8cdb4, roughness:.95}));
    p.position.set(x,2.3,-1.2); p.castShadow=true; g.add(p);
  }
  const lintel=new R.Mesh(new R.BoxGeometry(21,1.1,2.6), stone); lintel.position.set(0,4.4,-1.2); lintel.castShadow=true; g.add(lintel);
  // glazing: two big panes + transom
  crackTex = tex(512,512,()=>{}); crackCtx = crackTex.image.getContext('2d');
  const frameMat=new R.MeshStandardMaterial({color:0x27402f, roughness:.6, metalness:.2});
  function pane(x0,x1,y0,y1){
    const w=x1-x0, h=y1-y0;
    const m=new R.Mesh(new R.PlaneGeometry(w,h), new R.MeshPhongMaterial(glassMatBase));
    m.position.set((x0+x1)/2,(y0+y1)/2, ST_Z+0.02); g.add(m); panes.push({mesh:m, x:(x0+x1)/2, w, h});
    const ck=new R.Mesh(new R.PlaneGeometry(w,h), new R.MeshBasicMaterial({map:crackTex, transparent:true, depthWrite:false, opacity:0}));
    ck.position.set((x0+x1)/2,(y0+y1)/2, ST_Z+0.035); g.add(ck); cracks.push(ck);
    for(const y of [y0,y1]){ const f=new R.Mesh(new R.BoxGeometry(w+0.2,0.16,0.2), frameMat); f.position.set((x0+x1)/2,y,ST_Z+0.02); g.add(f); }
    for(const x of [x0,x1]){ const f=new R.Mesh(new R.BoxGeometry(0.16,h+0.3,0.2), frameMat); f.position.set(x,(y0+y1)/2,ST_Z+0.02); g.add(f); }
    const mid=new R.Mesh(new R.BoxGeometry(0.1,h,0.16), frameMat); mid.position.set((x0+x1)/2,(y0+y1)/2,ST_Z+0.02); g.add(mid);
  }
  pane(-5.9,-1.5, 0.5, 3.6);
  pane(1.5, 5.9, 0.5, 3.6);
  pane(-1.5, 1.5, 2.7, 3.6);
  doorMesh = new R.Mesh(new R.BoxGeometry(2.6,2.3,0.14), new R.MeshStandardMaterial({color:0x24382a, roughness:.6, metalness:.25}));
  doorMesh.position.set(0,1.15,ST_Z-0.05); doorMesh.castShadow=true; g.add(doorMesh);
  const dg=new R.Mesh(new R.PlaneGeometry(2.0,1.5), new R.MeshPhongMaterial(glassMatBase)); dg.position.set(0,1.35,ST_Z-0.1); g.add(dg);
  const handle=new R.Mesh(new R.BoxGeometry(0.06,0.5,0.06), new R.MeshStandardMaterial({color:0xd8c07a, metalness:.9, roughness:.3})); handle.position.set(1.0,1.1,ST_Z-0.14); g.add(handle);
  // awning
  const awn=new R.Mesh(new R.BoxGeometry(13.6,0.12,1.9), new R.MeshStandardMaterial({map:awnTex, roughness:.85}));
  awn.position.set(0,4.0,ST_Z+0.95); awn.rotation.x=0.24; awn.castShadow=true; g.add(awn); awningMesh=awn;
  const scallop=new R.Mesh(new R.BoxGeometry(13.6,0.24,0.14), new R.MeshStandardMaterial({map:awnTex, roughness:.9}));
  scallop.position.set(0,3.72,ST_Z+1.82); g.add(scallop);
  // sign
  shopSign=new R.Mesh(new R.BoxGeometry(9.6,1.4,0.24), new R.MeshStandardMaterial({map:signTex(shopName(),'TOUT POUR LA MAISON'), roughness:.6}));
  shopSign.position.set(0,5.35,ST_Z+0.08); g.add(shopSign);
  // french flag on a pole above the door
  const pole=new R.Mesh(new R.CylinderGeometry(0.035,0.045,2.6,8), new R.MeshStandardMaterial({color:0x3a3a40, metalness:.7, roughness:.4}));
  pole.position.set(3.6,4.9,ST_Z+0.3); pole.rotation.x=-0.5; g.add(pole);
  flag=new R.Mesh(new R.PlaneGeometry(1.5,1.0,14,1), new R.MeshStandardMaterial({map:flagTex, side:R.DoubleSide, roughness:.85}));
  flag.position.set(3.6,5.75,ST_Z+1.15); flag.rotation.y=-Math.PI/2+0.4; g.add(flag);
  flagBase = Float32Array.from(flag.geometry.attributes.position.array);
  // terrace crates
  for(const x of [-6.9,6.9]){
    const cr=new R.Mesh(new R.BoxGeometry(0.9,0.9,0.9), new R.MeshStandardMaterial({color:0x8a6a3a, roughness:.9})); cr.position.set(x,0.55,ST_Z+1.5); cr.castShadow=true; g.add(cr);
    const bo=new R.Mesh(new R.BoxGeometry(0.5,0.4,0.5), new R.MeshStandardMaterial({color:0x3f6b3a, roughness:.8})); bo.position.set(x+0.7,0.35,ST_Z+1.5); g.add(bo);
  }
  world.add(g);
  // fire rig (hidden until the glass breaks)
  fireFX = makeFire();
}
function shopName(){ return (window.LC && LC.config && LC.config.shopName) || 'ÉPICERIE DU COIN'; }

/* ---------- humanoids ---------- */
function mat(c,r){ return new R.MeshStandardMaterial({color:c, roughness:r==null?0.85:r}); }
function box(w,h,d,m){ const b=new R.Mesh(new R.BoxGeometry(w,h,d), m); b.castShadow=true; return b; }
function makeHuman(o){
  const skinM=mat(o.skin||0xd7a780,.75), shirtM=mat(o.shirt||0x17171c,.9), pantM=mat(o.pants||0x1a1c24,.95);
  const hairM=mat(o.hair||0x241a12,.85), shoeM=mat(o.shoe||0x141418,.7);
  const root=new R.Group();
  const hips=new R.Group(); hips.position.y=0.92; root.add(hips);
  const torso=new R.Group(); hips.add(torso);
  const pelvis=box(0.42,0.26,0.24, pantM); pelvis.position.y=-0.1; hips.add(pelvis);
  const chest=box(0.46,0.58,0.26, shirtM); chest.position.y=0.3; torso.add(chest);
  if(o.apron){ const ap=box(0.42,0.62,0.06, mat(o.apron,.85)); ap.position.set(0,0.2,0.16); torso.add(ap); }
  const head=new R.Group(); head.position.y=0.72; torso.add(head);
  const faceBox=box(0.22,0.26,0.22, skinM); faceBox.position.y=0.12; head.add(faceBox);
  if(o.chain){ const cm3=mat(0xd8b84a,.35); cm3.metalness=.85;
    const neck=new R.Mesh(new R.TorusGeometry(0.11,0.02,6,16), cm3); neck.rotation.x=Math.PI/2;
    neck.position.set(0,0.60,0.02); torso.add(neck);
    const med=box(0.05,0.065,0.02, cm3); med.position.set(0,0.48,0.15); torso.add(med); }
  if(o.track){ const wm=mat(0xf2f0e8,.85);
    const cs=box(0.07,0.58,0.028, wm); cs.position.set(0.13,0.3,0.148); torso.add(cs);
    for(const sx of [-1,1]){ const ls=box(0.028,0.86,0.03, wm); ls.position.set(sx*0.155,-0.03,0.0); hips.add(ls); } }
  if(o.face){ face(head, o); }
  if(o.hair){ const crown=new R.Mesh(new R.SphereGeometry(0.146,14,10,0,Math.PI*2,0,Math.PI*0.54), hairM);
    crown.position.set(0,0.168,-0.012); head.add(crown);
    const nape=new R.Mesh(new R.SphereGeometry(0.125,14,10), hairM);
    nape.scale.set(0.94,1.06,0.76); nape.position.set(0,0.10,-0.052); head.add(nape);
    for(const sx of [-1,1]){ const sb=box(0.028,0.115,0.15, hairM); sb.position.set(sx*0.112,0.125,0.0); head.add(sb); } }
  // head gear
  if(o.hood){
    const hood=new R.Mesh(new R.SphereGeometry(0.19,14,12), shirtM);
    hood.scale.set(0.98,1.08,1.02); hood.position.set(0,0.14,-0.03); head.add(hood);
    if(o.mask){ const mc=o.mask; const peek=box(0.21,0.21,0.07, mat(mc,.6)); peek.position.set(0,0.12,0.15); head.add(peek); }
    if(o.strings){ const sm=mat(0xe8e6da,.7);
      for(const sx of [-1,1]){ const s=box(0.022,0.15,0.022, sm); s.position.set(sx*0.055,0.045,0.135); head.add(s); } }
  } else if(o.beanie){
    const bm=mat(o.cap,.95); const dome=new R.Mesh(new R.SphereGeometry(0.152,14,10,0,Math.PI*2,0,Math.PI*0.5), bm);
    dome.position.set(0,0.185,-0.008); head.add(dome);
    const roll=new R.Mesh(new R.CylinderGeometry(0.156,0.156,0.06,16), bm); roll.position.set(0,0.155,-0.008); head.add(roll);
  } else if(o.cap !== null && o.cap !== undefined){
    const cm=mat(o.cap,.9);
    const dome=new R.Mesh(new R.SphereGeometry(0.152,14,8,0,Math.PI*2,0,Math.PI*0.5), cm); dome.position.set(0,0.19,-0.008); head.add(dome);
    const brim=new R.Mesh(new R.CylinderGeometry(0.155,0.155,0.04,16), cm);
    brim.scale.set(1,1,0.62); brim.position.set(0,0.20, o.backCap?-0.155:0.135); head.add(brim);
  }
  if(o.bandana){ const bc=mat(o.bandana,.9);
    const band=new R.Mesh(new R.CylinderGeometry(0.15,0.15,0.055,14), bc); band.position.set(0,0.15,0.0); head.add(band);
    const knot=box(0.055,0.055,0.07, bc); knot.position.set(0.12,0.17,-0.09); knot.rotation.z=0.5; head.add(knot); }
  if(o.shades){ const shm=mat(0x0e0e12,.5);
    const sb2=box(0.235,0.055,0.035, shm); sb2.position.set(0,0.155,0.105); head.add(sb2);
    for(const sx of [-1,1]){ const arm=box(0.09,0.018,0.02, shm); arm.position.set(sx*0.16,0.155,0.10); head.add(arm); } }
  function arm(side, sleeve){
    const sh=new R.Group(); sh.position.set(side*0.29,0.54,0); torso.add(sh);
    const up=box(0.13,0.3,0.14, shirtM); up.position.y=-0.15; sh.add(up);
    const el=new R.Group(); el.position.y=-0.3; sh.add(el);
    const fo=box(0.11,0.28,0.12, sleeve? skinM : shirtM); fo.position.y=-0.14; el.add(fo);
    const hand=box(0.11,0.11,0.12, skinM); hand.position.y=-0.31; el.add(hand);
    if(o.track){ const wm=mat(0xf2f0e8,.85); const st=box(0.028,0.62,0.15, wm); st.position.set(side*0.075,-0.22,0.0); sh.add(st); }
    return {sh, el, hand};
  }
  function leg(side){
    const hp=new R.Group(); hp.position.set(side*0.12,0,0); hips.add(hp);
    const th=box(0.17,0.44,0.19, pantM); th.position.y=-0.22; hp.add(th);
    const kn=new R.Group(); kn.position.y=-0.44; hp.add(kn);
    const sn=box(0.15,0.42,0.17, pantM); sn.position.y=-0.21; kn.add(sn);
    const foot=box(0.16,0.1,0.3, shoeM); foot.position.set(0,-0.44,0.07); kn.add(foot);
    if(o.track){ const wm=mat(0xf2f0e8,.85); const st=box(0.028,0.86,0.2, wm); st.position.set(side*0.085,-0.44,0.0); hp.add(st); }
    return {hp, kn};
  }
  const shortSleeve = !!o.shortSleeve;
  const parts={hips,torso,head,armL:arm(-1, shortSleeve), armR:arm(1, shortSleeve), legL:leg(-1), legR:leg(1)};
  if(o.bat){
    const batM=mat(0xb98a4a,.6);
    const bat=new R.Group();
    const shaft=new R.Mesh(new R.CylinderGeometry(0.035,0.05,0.95,8), batM); shaft.position.y=-0.45; bat.add(shaft);
    const knob=new R.Mesh(new R.SphereGeometry(0.055,8,6), batM); knob.position.y=0.03; bat.add(knob);
    bat.position.set(0,-0.32,0.02); parts.armR.hand.add(bat); parts.bat=bat;
  }
  if(o.bottle){
    const bm=new R.MeshStandardMaterial({color:0x2f5a2a, transparent:true, opacity:.85, roughness:.4});
    const b=new R.Group(); const bd=new R.Mesh(new R.CylinderGeometry(0.05,0.06,0.26,8), bm); b.add(bd);
    b.position.set(0,-0.36,0.02); parts.armR.hand.add(b);
  }
  root.userData=parts;
  return root;
}
function poseHuman(root, s, isMerchant){
  const p=root.userData, st=s.state||'idle';
  const t=s.t||0, dur=s.dur||0.6, k=dur?clamp(t/dur,0,1):0, c=s.clock||0;
  p.torso.rotation.set(0,0,Math.sin(c*2.2)*0.03);
  p.head.rotation.set(0,0,0);
  p.armL.sh.rotation.set(0,0,0.1); p.armR.sh.rotation.set(0,0,-0.1);
  p.armL.el.rotation.set(0,0,0); p.armR.el.rotation.set(0,0,0);
  p.legL.hp.rotation.set(0,0,0); p.legR.hp.rotation.set(0,0,0);
  p.legL.kn.rotation.set(0,0,0); p.legR.kn.rotation.set(0,0,0);
  p.hips.position.y=0.92; root.rotation.x=0; root.rotation.z=0;

  if(st==='walk'){
    const f=c*8.2, A=0.62;
    p.legL.hp.rotation.x=Math.sin(f)*A; p.legR.hp.rotation.x=-Math.sin(f)*A;
    p.legL.kn.rotation.x=Math.max(0,-Math.sin(f))*0.55; p.legR.kn.rotation.x=Math.max(0,Math.sin(f))*0.55;
    p.armL.sh.rotation.x=-Math.sin(f)*0.5; p.armR.sh.rotation.x=Math.sin(f)*0.5;
    p.hips.position.y=0.92+Math.abs(Math.sin(f))*0.02; p.torso.rotation.x=0.06;
  } else if(st==='attack'){
    p.torso.rotation.x=0.1;
    const ext = k<0.42 ? 0 : clamp((k-0.42)/0.22,0,1)*(1-clamp((k-0.72)/0.28,0,1));
    if(s.atk==='kick'){ const leg=p.legR; leg.hp.rotation.x=lerp(0,-1.5,ext); leg.kn.rotation.x=lerp(0.2,0.05,ext); p.torso.rotation.x=lerp(0.1,-0.22,ext); p.armL.sh.rotation.x=lerp(0,0.5,ext); }
    else { p.armR.sh.rotation.x=lerp(0,-1.5,ext); p.armR.el.rotation.x=lerp(0,-0.15,ext); p.torso.rotation.y=lerp(0,-0.3,ext); p.armL.sh.rotation.x=lerp(0,0.35,ext); }
  } else if(st==='swing'){
    const ext=k<0.42?0:clamp((k-0.42)/0.2,0,1)*(1-clamp((k-0.7)/0.3,0,1));
    const bat=p.bat;
    p.armR.sh.rotation.x=lerp(0.7,-1.75,ext); p.armR.sh.rotation.z=lerp(-0.4,-0.1,ext); p.armR.el.rotation.x=lerp(-1.0,0,ext);
    p.armL.sh.rotation.x=lerp(0,0.5,ext); p.torso.rotation.y=lerp(0.25,-0.35,ext);
    if(bat) bat.rotation.x = lerp(1.2, -0.5, ext);
  } else if(st==='smash'){
    const kick=k<0.4?0:clamp((k-0.4)/0.18,0,1)*(1-clamp((k-0.68)/0.32,0,1));
    p.legR.hp.rotation.x=-1.6*kick; p.legR.kn.rotation.x=0.15; p.torso.rotation.x=-0.28*kick;
    p.armL.sh.rotation.x=0.7*kick; p.armR.sh.rotation.x=0.7*kick;
    if(p.bat){ p.armR.sh.rotation.x=lerp(0.4,-1.2,k); p.bat.rotation.x=lerp(1.2,-0.5,k); }
  } else if(st==='throw'){
    const ext=clamp((k-0.3)/0.4,0,1);
    p.armR.sh.rotation.x=lerp(0.7,-1.8,ext); p.armR.el.rotation.x=lerp(-1.5,0,ext); p.torso.rotation.y=lerp(0.3,-0.3,ext);
  } else if(st==='hit'){
    p.torso.rotation.x=-0.45*Math.sin(k*Math.PI); p.head.rotation.x=-0.2; p.armL.sh.rotation.x=-0.5; p.armR.sh.rotation.x=-0.5;
  } else if(st==='stagger'){
    p.torso.rotation.x=-0.5; p.armL.sh.rotation.set(-1.4,0,0.55); p.armR.sh.rotation.set(-1.4,0,-0.55); p.head.rotation.x=-0.25;
  } else if(st==='down'){
    const f=clamp(t/0.5,0,1); root.rotation.x=-Math.PI/2*f; p.hips.position.y=0.92-0.85*f;
    p.armL.sh.rotation.x=0.5; p.armR.sh.rotation.x=0.5; p.legL.hp.rotation.x=0.35; p.legR.hp.rotation.x=-0.25;
  } else if(st==='cry'){
    const sob=Math.sin(c*7)*0.06;
    p.hips.position.y=0.92-0.42;
    p.legL.hp.rotation.x=1.15; p.legR.hp.rotation.x=1.15; p.legL.kn.rotation.x=-1.8; p.legR.kn.rotation.x=-1.8;
    p.torso.rotation.x=0.55+sob; p.head.rotation.x=0.5;
    p.armL.sh.rotation.set(-2.3,0,0.5); p.armR.sh.rotation.set(-2.3,0,-0.5);
    p.armL.el.rotation.x=-1.6; p.armR.el.rotation.x=-1.6;
    root.rotation.z = Math.sin(c*7)*0.03;
  } else { p.armL.sh.rotation.x=Math.sin(c*1.6)*0.04; p.armR.sh.rotation.x=-Math.sin(c*1.6)*0.04; }
}

/* ---------- FX ---------- */
// debris chips (glass, dust) — small solids that fly and settle, unlike the old pixel points
const chips=[];
function chipBurst(x,y,z, color, n, spd){
  const m=new R.MeshStandardMaterial({color, roughness:.45});
  for(let i=0;i<n;i++){
    const c=new R.Mesh(new R.BoxGeometry(rand(.03,.08),rand(.03,.08),rand(.02,.05)), m);
    c.position.set(x+rand(-.12,.12), y+rand(-.12,.12), z); world.add(c);
    chips.push({m:c, v:new R.Vector3(rand(-1,1),rand(.2,1.6),rand(.3,1.5)).normalize().multiplyScalar(rand(1,spd||3)),
      rv:new R.Vector3(rand(-9,9),rand(-9,9),rand(-9,9)), life:rand(.5,1.0)});
  }
}
function stepChips(dt){
  for(let i=chips.length-1;i>=0;i--){ const c=chips[i]; c.life-=dt; c.v.y-=12*dt;
    c.m.position.addScaledVector(c.v,dt);
    c.m.rotation.x+=c.rv.x*dt; c.m.rotation.y+=c.rv.y*dt; c.m.rotation.z+=c.rv.z*dt;
    const fy=floorY(c.m.position.z);
    if(c.m.position.y<fy+0.04){ c.m.position.y=fy+0.04; c.v.y*=-0.25; c.v.x*=0.7; c.v.z*=0.7; }
    if(c.life<=0){ world.remove(c.m); c.m.material.dispose(); chips.splice(i,1); }
  }
}
// short bright flash on the pane itself so a hit reads as an impact on the window
const flashes=[];
function glassFlash(x,y){
  const s=new R.Sprite(new R.SpriteMaterial({map:glowTex, color:0xffffff, transparent:true, depthWrite:false, opacity:.95}));
  s.position.set(x,y,0.16); s.scale.setScalar(rand(.5,.9)); scene.add(s); flashes.push({s, life:.22});
}
function stepFlashes(dt){ for(let i=flashes.length-1;i>=0;i--){ const f=flashes[i]; f.life-=dt;
  f.s.material.opacity=Math.max(0,f.life/.22)*.95; if(f.life<=0){ scene.remove(f.s); f.s.material.dispose(); flashes.splice(i,1);} } }
const smoke=[];
for(let i=0;i<28;i++){ const m=new R.Sprite(new R.SpriteMaterial({map:smokeTex, transparent:true, depthWrite:false, opacity:0})); scene.add(m); smoke.push({m,life:0,v:new R.Vector3()}); }
let smIdx=0;
function puff(pos,size){ const s=smoke[smIdx++%smoke.length]; s.m.position.copy(pos); s.m.scale.setScalar(size); s.life=1; s.v.set(rand(-0.3,0.3),rand(0.5,1.3),rand(-0.3,0.3)); }
function stepSmoke(dt){ for(const s of smoke){ if(s.life>0){ s.life-=dt*0.75; s.m.material.opacity=Math.max(0,s.life)*0.42; s.m.position.addScaledVector(s.v,dt); s.m.scale.multiplyScalar(1+dt*0.8);} else s.m.material.opacity=0; } }
// shards on break
const shards=[]; const shardMat=new R.MeshPhongMaterial({color:0xdff2ff, transparent:true, opacity:.85, shininess:140, side:R.DoubleSide});
function shardBurst(){
  for(let i=0;i<26;i++){ const m=new R.Mesh(new R.PlaneGeometry(rand(0.1,0.28),rand(0.1,0.26)), shardMat);
    m.position.set(rand(-5.5,5.5), rand(0.7,3.4), 0.1); world.add(m);
    shards.push({m, v:new R.Vector3(rand(-2.5,2.5), rand(1,3.4), rand(1.5,4.5)), rv:new R.Vector3(rand(-6,6),rand(-6,6),rand(-6,6)), life:rand(0.8,1.5)}); }
}
function stepShards(dt){ for(let i=shards.length-1;i>=0;i--){ const s=shards[i]; s.life-=dt;
  s.v.y-=9*dt; s.m.position.addScaledVector(s.v,dt);
  s.m.rotation.x+=s.rv.x*dt; s.m.rotation.y+=s.rv.y*dt; s.m.rotation.z+=s.rv.z*dt;
  const fy=floorY(s.m.position.z);
  if(s.m.position.y<fy+0.06){ s.m.position.y=fy+0.06; s.v.set(0,0,0); s.rv.set(0,0,0); s.life=Math.min(s.life,0.6); }
  s.m.material.opacity = Math.max(0, s.life)*0.85;
  if(s.life<=0){ world.remove(s.m); shards.splice(i,1); } } }
// projectiles
const projs=new Map();
const bottleMat=new R.MeshStandardMaterial({color:0x2f5a2a, transparent:true, opacity:.85, roughness:.35});
const stoneMat=new R.MeshStandardMaterial({color:0x6d6a63, roughness:.95});
function addProj(pr){ const kind=pr.kind||'bottle'; const g=new R.Group();
  if(kind==='bottle'){ g.add(new R.Mesh(new R.CylinderGeometry(0.05,0.06,0.26,8), bottleMat)); }
  else { g.add(new R.Mesh(new R.SphereGeometry(0.12,8,6), stoneMat)); }
  g.position.set(pr.x, 1.35, pr.z); world.add(g); projs.set(pr, g); }
function syncProjs(list){ const seen=new Set();
  for(const p of list){ seen.add(p); if(!projs.has(p)) addProj(p);
    const g=projs.get(p); g.position.set(p.x, Math.sin(clamp((p.z-0.7)/9,0,1)*Math.PI)*0.5+1.2, p.z); g.rotation.x+=0.5; g.rotation.z+=0.2; }
  for(const [p,g] of projs){ if(!seen.has(p)){ world.remove(g); projs.delete(p); } } }
// tears
const tears=[];
function tear(x,z){ const m=new R.Sprite(new R.SpriteMaterial({map:glowTex, color:0x9fd8ff, transparent:true, depthWrite:false, opacity:.9})); m.position.set(x+rand(-0.12,0.12),1.05,z+0.25); m.scale.setScalar(0.12); scene.add(m);
  tears.push({m, v:new R.Vector3(rand(-0.05,0.05),-1.6,rand(0,0.05)), life:0.55}); }
function stepTears(dt){ for(let i=tears.length-1;i>=0;i--){ const t=tears[i]; t.life-=dt; t.m.position.addScaledVector(t.v,dt); t.m.material.opacity=Math.max(0,t.life/0.55)*0.9; if(t.life<=0){ scene.remove(t.m); tears.splice(i,1);} } }
// fire rig
let fireFX=null;
function makeFire(){
  const flames=[], embers=new R.Group(); world.add(embers);
  for(let i=0;i<34;i++){
    const s=new R.Sprite(new R.SpriteMaterial({map:flameTex, transparent:true, depthWrite:false, blending:R.AdditiveBlending, opacity:0}));
    scene.add(s); flames.push({s, x:rand(-6.5,6.5), y:rand(0.3,3.4), h:rand(0,6.28), spd:rand(0.8,1.8), sc:rand(0.8,1.8)});
  }
  const light=new R.PointLight(0xff7a2a, 0, 22, 2); light.position.set(0,2.4,1.0); world.add(light);
  const light2=new R.PointLight(0xffb04a, 0, 16, 2); light2.position.set(-3,3.2,0.8); world.add(light2);
  for(let i=0;i<40;i++){ const e=new R.Sprite(new R.SpriteMaterial({map:glowTex, color:0xffb85a, transparent:true, depthWrite:false, blending:R.AdditiveBlending, opacity:0}));
    scene.add(e); flames.push({s:e, x:rand(-6.5,6.5), y:0, h:rand(0,6.28), spd:rand(1.4,3), sc:rand(0.12,0.3), ember:true}); }
  return {flames, light, light2, on:false};
}
function stepFire(dt, burn, t){
  if(!fireFX) return;
  const on = burn>0.02;
  if(on!==fireFX.on){ fireFX.on=on; if(on){ AUD.fire(true); AUD.play('siren'); } else AUD.fire(false); }
  for(const f of fireFX.flames){
    if(!on){ f.s.material.opacity=0; continue; }
    f.h += dt*f.spd;
    const wob = Math.sin(f.h)*0.25;
    if(f.ember){ f.s.position.set(f.x+wob*0.4, 1.0 + ((f.h*1.1)%4.2), 0.9+Math.sin(f.h*1.7)*0.5); f.s.scale.setScalar(f.sc*burn*1.4); f.s.material.opacity=burn*0.9; }
    else { f.s.position.set(f.x+wob*0.5, f.y*(0.6+burn*0.4)+Math.sin(f.h*1.3)*0.15, 0.7+Math.abs(wob)*0.5); f.s.scale.set(f.sc*(0.8+burn), f.sc*1.5*(0.7+burn), 1); f.s.material.opacity=burn*(0.55+Math.random()*0.35); }
  }
  const fl = burn*(0.85+Math.sin(t*13)*0.15 + Math.random()*0.1);
  fireFX.light.intensity = fl*3.4; fireFX.light2.intensity = fl*2.2;
  if(on && Math.random()<dt*14) puff(new R.Vector3(rand(-5,5), 3.6, rand(0,1.6)), rand(1.0,2.0));
}

/* ---------- state ---------- */
let G=null, phase='menu', name=localStorage.getItem('lc_name')||'';
const MERCHANT = makeHuman({skin:0xd7a780, shirt:0xf2efe6, pants:0x35507e, hair:0x241a12, shoe:0x2a2a30, shortSleeve:true, face:true, worried:true, eyebag:true});
world.add(MERCHANT);
const rioterMeshes=new Map();
const R_CLOTH=[0x141419,0x1c1f26,0x1f1a14,0x241a1c,0x101014,0x18202a,0x1a2a1e,0x2a2a30];
const R_PANTS=[0x101014,0x14161c,0x1c1a16,0x0e1014,0x22252c];
const R_MASK =[0x1a1a20,0xe8e8e8,0x2a2f36,0x8a2a2a,0x0f0f14];
const R_SKIN =[0x9c7a58,0x8a6a4a,0xc79a72,0x6f5238,0xd7a780,0x7a5a3c];
const R_HAIR =[0x14100c,0x1e1611,0x2a2018,0x0f0b07,0x3a2a1a];
function rioterMesh(r){
  const k = (r.id*2654435761)>>>0;
  const pick = (arr, mul) => arr[(k>>>((mul||0)%8))%arr.length];
  const masked = (k%10) > 2;                       // ~70% hooded balaclava
  const hooded = masked ? ((k>>3)%10) > 2 : false;
  const gear = hooded ? 'hood' : pick(['hood','cap','backcap','beanie','bandana','none'],1);
  const track = (k>>5)%10 < 4;                      // ~40% tracksuit
  const chain = ((k>>7)%10) < 4;
  const bandC = pick([0x8a1f1f,0x1f3a8a,0xe8e6da,0x1a1a20],3);
  const m=makeHuman({
    skin: pick(R_SKIN,1), shirt: pick(R_CLOTH,3),
    pants: track ? pick(R_CLOTH,6) : pick(R_PANTS,5),
    shoe: (k%2)?0x0a0a0d:0x2a2222,
    hair: pick(R_HAIR,4),
    hood: hooded, mask: hooded ? pick(R_MASK,7) : null, strings: hooded && ((k>>13)%10)<6,
    beanie: gear==='beanie',
    cap: (gear==='cap'||gear==='backcap') ? ((k%3)?0x1a1c22:0x2a1a1a) : null,
    backCap: gear==='backcap',
    bandana: gear==='bandana'?bandC:null,
    shades: !hooded && ((k>>9)%10)<5,
    chain, track, face:false,
    bat: !!r.bat, bottle: r.type==='thrower'
  });
  m.rotation.y=Math.PI;   // rioters advance toward the shop (−z): we see their backs
  const sc = 0.92 + ((k>>>9)%100)/100*0.18;  // varied builds
  m.scale.set(sc, 0.95+((k>>>17)%100)/100*0.15, sc);
  world.add(m); rioterMeshes.set(r.id, m); return m;
}

/* ---------- protest extras: marchers, CRS, barricades, gas ---------- */
const marcherMeshes=new Map(), crsMeshes=new Map(), barrMeshes=new Map(),
      canMeshes=new Map(), gasMeshes=new Map(), pickMeshes=new Map();
const placardCache={};
const PLACARD_BG=[0xd9b98a,0xf2efe6,0xe4d6b8];
const maskLabel = tex(160,72,(g,w,h)=>{
  g.fillStyle='rgba(10,18,10,.78)'; g.fillRect(8,8,w-16,h-16);
  g.strokeStyle='#9fe0a0'; g.lineWidth=3; g.strokeRect(8,8,w-16,h-16);
  g.fillStyle='#c8f0b0'; g.font='900 34px Arial'; g.textAlign='center'; g.textBaseline='middle';
  g.fillText('MASK', w/2, h/2+2);
});
const MARCH_SHIRT=[0x8a1f1f,0x1f3a8a,0xece7da,0x2a6a4a,0xd8c400];
function placardTex(txt, bg){
  if(placardCache[txt]) return placardCache[txt];
  return placardCache[txt] = tex(256,180,(g,w,h)=>{
    g.fillStyle = '#'+bg.toString(16).padStart(6,'0'); g.fillRect(0,0,w,h);
    g.fillStyle='rgba(60,40,20,.18)'; g.fillRect(0,0,w,10); g.fillRect(0,h-10,w,10);
    g.fillStyle='#191310'; g.font='900 38px Arial'; g.textAlign='center'; g.textBaseline='middle';
    const words=txt.split(' '), lines=[]; let cur='';
    for(const word of words){ const t=cur?cur+' '+word:word;
      if(g.measureText(t).width>w-30 && cur){ lines.push(cur); cur=word; } else cur=t; }
    if(cur) lines.push(cur);
    lines.forEach((l,i)=>g.fillText(l,w/2,h/2+(i-(lines.length-1)/2)*44));
  });
}
function marcherMesh(r){
  const k=(r.id*2654435761)>>>0;
  const vest=(k%3)===0;
  const m=makeHuman({skin:R_SKIN[k%R_SKIN.length], shirt:vest?0xe8c400:MARCH_SHIRT[k%MARCH_SHIRT.length],
    pants:[0x2a2f3a,0x1c1c22,0x3a4050][k%3], shoe:0x24242c, hair:R_HAIR[k%R_HAIR.length],
    beanie:(k>>4)%3===0, cap:((k>>6)%3===0)?0x2a2a32:null, face:true});
  const sign=new R.Group();
  const stick=box(0.035,1.05,0.035, mat(0x8a6b42,.9)); stick.position.y=0.48; sign.add(stick);
  const board=new R.Mesh(new R.BoxGeometry(0.64,0.44,0.045),
    new R.MeshStandardMaterial({map:placardTex(RFGEngine.PLACARDS[r.placard], PLACARD_BG[r.id%3]), roughness:.9}));
  board.position.y=1.02; sign.add(board);
  sign.position.set(0.3,0.2,0.14); sign.rotation.z=-0.1;
  m.userData.sign=sign; m.userData.torso.add(sign);
  if(r.flag){
    const fp=new R.Group();
    const pole=box(0.03,1.5,0.03, mat(0x9a9aa2,.5)); pole.position.y=0.75; fp.add(pole);
    const cloth=new R.Mesh(new R.PlaneGeometry(0.58,0.36),
      new R.MeshStandardMaterial({color:0xc41e2a, side:R.DoubleSide, roughness:.95}));
    cloth.position.set(0.31,1.34,0); fp.add(cloth);
    fp.position.set(-0.34,0.2,0.1); m.userData.torso.add(fp);
  }
  world.add(m); marcherMeshes.set(r.id,m); return m;
}
function crsMesh(c){
  const m=makeHuman({skin:0xd7a780, shirt:0x22335c, pants:0x141a2a, shoe:0x0b0d12,
    hair:0x1a1a20, face:true, shortSleeve:false});
  const helm=new R.Mesh(new R.SphereGeometry(0.17,14,10,0,Math.PI*2,0,Math.PI*0.62), mat(0x121722,.35));
  helm.position.set(0,0.17,0); m.userData.head.add(helm);
  const visor=box(0.3,0.1,0.06, mat(0x9fc4e0,.2)); visor.position.set(0,0.14,0.17); m.userData.head.add(visor);
  const shield=new R.Mesh(new R.BoxGeometry(0.52,0.92,0.06), mat(0x1b2a4a,.45));
  shield.position.set(0,-0.1,0.3); shield.rotation.x=-0.12;
  m.userData.armL.el.add(shield);
  const stripe=box(0.4,0.06,0.01, mat(0xe6e6e6,.6)); stripe.position.set(0,0.32,0.04); shield.add(stripe);
  world.add(m); crsMeshes.set(c.id,m); return m;
}
const crateMats=[mat(0x8a6a44,.92), mat(0x77562f,.92)];
function barricadeMesh(b){
  const g=new R.Group(), crates=[];
  const rows=[[-0.62,0.3],[0,0.3],[0.62,0.3],[-0.33,0.82],[0.33,0.82],[0,1.34]];
  rows.forEach(([x,y],i)=>{
    const c=box(0.58,0.5,0.52,crateMats[i%2]);
    c.position.set(x+rand(-0.04,0.04), y, rand(-0.06,0.06)); c.rotation.y=rand(-0.16,0.16);
    g.add(c); crates.push(c);
  });
  const plank=box(1.95,0.16,0.07, mat(0x6a4a2a,.9)); plank.position.set(0,1.72,0.16); plank.rotation.z=rand(-0.05,0.05); g.add(plank);
  const flagPole=box(0.03,1.1,0.03, mat(0x9a9aa2,.5)); flagPole.position.set(-0.85,1.3,0.1); g.add(flagPole);
  const flag=new R.Mesh(new R.PlaneGeometry(0.42,0.26), new R.MeshStandardMaterial({color:0xc41e2a, side:R.DoubleSide, roughness:.95}));
  flag.position.set(-0.62,1.7,0.1); g.add(flag);
  g.userData.crates=crates; world.add(g); return g;
}
function syncMarchers(dt){
  const seen=new Set();
  for(const r of G.marchers){
    seen.add(r.id);
    const m=marcherMeshes.get(r.id)||marcherMesh(r);
    m._x=lerp(m._x==null?r.x:m._x, r.x, clamp(dt*9,0,1));
    m._z=lerp(m._z==null?r.z:m._z, r.z, clamp(dt*9,0,1));
    m.position.set(m._x, floorY(r.z), m._z);
    const dir = r.state==='flee' ? (r.fdir||1) : r.dir;
    m.rotation.y = dir>0 ? Math.PI/2 : -Math.PI/2;
    const sign=m.userData.sign;
    if(sign) sign.rotation.y = -m.rotation.y + (dir>0?-0.25:0.25);
    poseHuman(m, {state:'walk', t:0, dur:1, clock:r.clock*(r.state==='flee'?2.1:1)}, false);
    m.userData.armL.sh.rotation.set(-2.25,0,0.28);
    m.userData.armL.el.rotation.set(0.55,0,0);
  }
  for(const [id,m] of marcherMeshes) if(!seen.has(id)){ world.remove(m); marcherMeshes.delete(id); }
}
function syncCrs(dt){
  const seen=new Set();
  for(const c of G.crs){
    seen.add(c.id);
    const m=crsMeshes.get(c.id)||crsMesh(c);
    m.position.set(c.x, floorY(c.z), c.z);
    m.rotation.y=Math.atan2(-c.x, 2.8-c.z);
    poseHuman(m,{state:'idle', t:0, dur:1, clock:c.t}, false);
    m.userData.armL.sh.rotation.set(-1.2,0,0.05);
  }
  for(const [id,m] of crsMeshes) if(!seen.has(id)){ world.remove(m); crsMeshes.delete(id); }
}
function syncCanisters(dt){
  const seen=new Set();
  for(const c of G.canisters){
    seen.add(c);
    let g=canMeshes.get(c);
    if(!g){ g=new R.Group();
      const body=new R.Mesh(new R.CylinderGeometry(0.075,0.075,0.26,8), mat(0x5c6752,.55)); g.add(body);
      const cap=new R.Mesh(new R.CylinderGeometry(0.05,0.05,0.06,8), mat(0xd8d0b0,.5)); cap.position.y=0.16; g.add(cap);
      world.add(g); canMeshes.set(c,g); }
    g.position.set(c.x, floorY(c.z)+0.35+c.h, c.z);
    g.rotation.x+=dt*7; g.rotation.z+=dt*5;
  }
  for(const [c,g] of canMeshes) if(!seen.has(c)){ world.remove(g); canMeshes.delete(c); }
}
function syncGas(dt){
  const seen=new Set();
  for(const z of G.gasZones){
    seen.add(z);
    let parts=gasMeshes.get(z);
    if(!parts){ parts=[];
      for(let i=0;i<6;i++){
        const sp=new R.Sprite(new R.SpriteMaterial({map:gasTex, color:0xffffff, transparent:true, depthWrite:false, opacity:0}));
        world.add(sp); parts.push({sp, ph:rand(0,6.28), ox:rand(-0.45,0.45), oz:rand(-0.45,0.45)});
      }
      gasMeshes.set(z,parts);
    }
    const grow=Math.min(1, z.t*2.0);
    const fade=Math.min(1, z.t*2.4) * clamp((z.life-z.t)/1.4, 0, 1);
    for(const p of parts){
      const sc=z.r*1.45*(0.8+0.22*Math.sin(p.ph+z.t*1.5));
      p.sp.scale.setScalar(sc*grow);
      p.sp.position.set(z.x+p.ox*z.r*grow, floorY(z.z)+0.45+Math.sin(p.ph*2+z.t)*0.3, z.z+p.oz*z.r*grow);
      p.sp.material.opacity=0.82*fade;
    }
  }
  for(const [z,parts] of gasMeshes) if(!seen.has(z)){
    for(const p of parts){ world.remove(p.sp); p.sp.material.dispose(); }
    gasMeshes.delete(z);
  }
}
function syncPickups(dt){
  const seen=new Set();
  for(const p of G.pickups){
    seen.add(p);
    let g=pickMeshes.get(p);
    if(!g){ g=new R.Group();
      const mask=new R.Mesh(new R.BoxGeometry(0.34,0.22,0.08), mat(0xf4f4ec,.4)); g.add(mask);
      for(const sx of [-1,1]){ const strap=box(0.025,0.2,0.025, mat(0xdadad2,.6)); strap.position.set(sx*0.15,0.02,-0.06); strap.rotation.z=sx*0.35; g.add(strap); }
      const ring=new R.Mesh(new R.TorusGeometry(0.36,0.028,6,22),
        new R.MeshStandardMaterial({color:0x9fe0a0, roughness:.4, emissive:0x2f5a2f}));
      ring.rotation.x=Math.PI/2; ring.position.y=-0.12; g.add(ring);
      const label=new R.Sprite(new R.SpriteMaterial({map:maskLabel, transparent:true, depthWrite:false}));
      label.scale.set(0.95,0.43,1); label.position.y=0.62; g.add(label);
      const glow=new R.Sprite(new R.SpriteMaterial({map:glowTex, color:0x9fe0a0, transparent:true, depthWrite:false, opacity:.55}));
      glow.scale.setScalar(0.95); g.add(glow);
      const beam=new R.Sprite(new R.SpriteMaterial({map:glowTex, color:0xc8f0b0, transparent:true, depthWrite:false, opacity:.3}));
      beam.scale.set(1.5,2.6,1); beam.position.y=0.6; g.add(beam);
      world.add(g); pickMeshes.set(p,g); }
    g.position.set(p.x, floorY(p.z)+0.7+Math.sin(p.t*2.2)*0.07, p.z);
    g.rotation.y+=dt*1.8;
  }
  for(const [p,g] of pickMeshes) if(!seen.has(p)){ world.remove(g); pickMeshes.delete(p); }
}
function syncBarricades(dt){
  const seen=new Set();
  for(const b of G.barricades){
    seen.add(b.id);
    let m=barrMeshes.get(b.id);
    if(!m){ m=barricadeMesh(b); barrMeshes.set(b.id,m); }
    m.position.set(b.x, floorY(b.z), b.z);
    const f=b.hp/b.maxHp;
    m.userData.crates.forEach((c,i)=>{ c.visible = f > (i>=5?0.68:i>=3?0.42:0); });
    m.rotation.z = b.shake>0 ? Math.sin(b.shake*70)*0.06 : 0;
  }
  for(const [id,m] of barrMeshes) if(!seen.has(id)){ world.remove(m); barrMeshes.delete(id); }
}

const input={left:false,right:false,up:false,down:false,punch:false,kick:false};
let shake=0, camKick=0, overSent=false, burnToast=false, cryT=0, stepT=0;

/* ---------- net ---------- */
let ws=null, connected=false, retry=0, watchers=0;
function connect(){
  const proto=location.protocol==='https:'?'wss':'ws';
  try{ ws=new WebSocket(`${proto}://${location.host}/ws`); }catch{ return; }
  ws.onopen=()=>{ connected=true; retry=0; send({type:'hello', name:displayName()}); setStatus(); };
  ws.onclose=()=>{ connected=false; setStatus(); retry=Math.min(retry+1,6); setTimeout(connect, 700*retry+500); };
  ws.onerror=()=>{};
  ws.onmessage=ev=>{ let m; try{ m=JSON.parse(ev.data); }catch{ return; } handle(m); };
}
function send(m){ if(ws && ws.readyState===1) ws.send(JSON.stringify(m)); }
function displayName(){ return name || 'anonymous'; }
function handle(m){
  if(m.type==='init'){ if(m.chat) m.chat.forEach(c=>addChat(c)); if(m.board) renderBoard(m.board); watchers=m.watching||0; setStatus(); }
  else if(m.type==='chat'){ addChat(m); }
  else if(m.type==='board'){ renderBoard(m.board); }
  else if(m.type==='presence'){ watchers=m.watching; setStatus(); }
  else if(m.type==='err'){ toast(m.text); }
  else if(m.type==='scored'){ /* broadcast echo, ignore */ }
}

/* ---------- UI ---------- */
function setStatus(){ const e=$('watch'); if(e) e.textContent = connected ? `${fmt(watchers)} online` : 'offline'; }
function toast(text){ const t=$('toast'); if(!t) return; t.textContent=text; t.hidden=false; clearTimeout(t._h); t._h=setTimeout(()=>t.hidden=true, 3200); }
function addChat(c){
  const log=$('chatLog'); if(!log) return;
  const d=document.createElement('div'); d.className='msg'+(c.kind==='sys'?' sys':'');
  if(c.kind==='sys') d.innerHTML=c.html||escapeHtml(c.text||'');
  else d.innerHTML=`<b>${escapeHtml(c.u||'?')}</b> ${escapeHtml(c.text||'')}`;
  log.appendChild(d); while(log.children.length>80) log.removeChild(log.firstChild); log.scrollTop=log.scrollHeight;
  if(c.kind!=='sys') AUD.play('blip');
}
function escapeHtml(s){ return String(s).replace(/[&<>"]/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])); }
function renderBoard(rows){
  const b=$('board'); if(!b) return;
  if(!rows || !rows.length){ b.innerHTML='<div class="empty">No scores yet. Be the first.</div>'; return; }
  b.innerHTML='<div class="brow head"><span>#</span><span>Player</span><span>Score</span></div>'+rows.map((r,i)=>
    `<div class="brow${r.me?' me':''}"><span>${i+1}</span><span class="nm">${escapeHtml(r.name)}</span><span class="num">${fmt(r.score)}</span></div>`).join('');
}
function updateHUD(){
  if(!G) return;
  const pct = clamp(G.glass/G.maxGlass,0,1);
  const bar=$('glassBar'); bar.style.width=(pct*100).toFixed(0)+'%';
  bar.className = pct<=0.2?'crit':pct<=0.55?'low':'';
  $('glassN').textContent = `WINDOW · ${Math.round(pct*100)}%`;
  $('score').textContent = fmt(G.score);
  $('wave').textContent = 'WAVE '+G.wave;
  $('time').textContent = G.t.toFixed(1);
  $('kos').textContent = fmt(G.kos);
  const el=$('rioters'); if(el) el.textContent = String(G.rioters.filter(r=>r.state!=='down').length);
}
function show(id, on){ const e=$(id); if(e) e.hidden=!on; }
function banner(text, cls){ const b=$('banner'); b.textContent=text; b.className='banner show '+(cls||''); clearTimeout(b._h); b._h=setTimeout(()=>{ b.className='banner '+(cls||''); }, 2200); }

/* ---------- game flow ---------- */
function startGame(){
  AUD.resume(); AUD.stopAll(); AUD.ambience(true); AUD.musicOn();
  G = window.RFGEngine.createRaid();
  for(const [,m] of rioterMeshes) world.remove(m); rioterMeshes.clear();
  for(const [,m] of marcherMeshes) world.remove(m); marcherMeshes.clear();
  for(const [,m] of crsMeshes) world.remove(m); crsMeshes.clear();
  for(const [,m] of barrMeshes) world.remove(m); barrMeshes.clear();
  for(const [,g] of canMeshes) world.remove(g); canMeshes.clear();
  for(const [,g] of pickMeshes) world.remove(g); pickMeshes.clear();
  for(const [,parts] of gasMeshes) for(const p of parts){ world.remove(p.sp); p.sp.material.dispose(); }
  gasMeshes.clear();
  const go=$('gas'); if(go) go.classList.remove('on');
  for(const [p,g] of projs) world.remove(g); projs.clear();
  shards.forEach(s=>world.remove(s.m)); shards.length=0;
  cracksDrawn=0; crackFrac=-1; clearCracks();
  for(const c of cracks) c.material.opacity=0;
  phase='play'; overSent=false; burnToast=false; cryT=0; lastWesh=0;
  AUD.cry(false); AUD.fire(false);
  if(document.activeElement && document.activeElement.blur) document.activeElement.blur();
  show('startOverlay', false); show('overOverlay', false);
  toast('Defend the shop!');
}
function clearCracks(){ if(crackCtx){ const g=crackCtx; g.clearRect(0,0,512,512); crackTex.needsUpdate=true; } }
function endGame(score, kos, time){
  phase='over';
  AUD.ambience(false);
  AUD.cry(false);
  $('overScore').textContent=fmt(score); $('overKos').textContent=fmt(kos); $('overTime').textContent=time.toFixed(1)+'s';
  $('rankLine').textContent='Submitting score…';
  show('overOverlay', true);
  fetch('/api/score', {method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({name:displayName(), score:Math.round(score), kos, time:Math.round(time), token:(window.LC && LC.token && LC.token()) || null})})
    .then(r=>r.json()).then(j=>{ if(j.rank) $('rankLine').textContent=`You are #${j.rank} on the leaderboard — ${fmt(j.score)} pts`; else $('rankLine').textContent=''; if(j.board) renderBoard(j.board); })
    .catch(()=>{ $('rankLine').textContent='Score not saved (offline)'; });
}

/* ---------- input ---------- */
const keymap={a:'left',arrowleft:'left',d:'right',arrowright:'right',w:'up',arrowup:'up',s:'down',arrowdown:'down'};
addEventListener('keydown', e=>{
  const t=e.target;
  if(t && (t.tagName==='INPUT' || t.tagName==='TEXTAREA' || t.isContentEditable)){
    if(t.id==='nameInput' && e.key==='Enter'){ startGame(); e.preventDefault(); }
    return;
  }
  const k=e.key.toLowerCase();
  if(phase==='menu' && (k==='enter'||k===' ')){ startGame(); return; }
  if(phase==='over' && (k==='enter'||k===' ')){ startGame(); return; }
  if(k in keymap){ input[keymap[k]]=true; e.preventDefault(); }
  else if(k==='j'||k===' '){ if(!e.repeat) input.punch=true; e.preventDefault(); }
  else if(k==='k'||k==='shift'){ if(!e.repeat) input.kick=true; e.preventDefault(); }
  else if(k==='m'){ toggleMute(); }
  else if(k==='c'){ togglePanel(); }
});
addEventListener('keyup', e=>{ const k=e.key.toLowerCase(); if(k in keymap) input[keymap[k]]=false; });
canvas.addEventListener('mousedown', e=>{ if(phase!=='play') return; if(e.button===2) input.kick=true; else input.punch=true; });
canvas.addEventListener('contextmenu', e=>e.preventDefault());
document.querySelectorAll('[data-k]').forEach(b=>{
  const k=b.dataset.k, oneShot=(k==='punch'||k==='kick');
  const press=()=>{ if(k in input){ input[k]=true; if(oneShot){ b.classList.add('on'); try{ navigator.vibrate && navigator.vibrate(12); }catch(_){} } } };
  const release=()=>{ if(!(k in input)) return; if(!oneShot) input[k]=false; b.classList.remove('on'); };
  b.addEventListener('pointerdown', e=>{ e.preventDefault(); try{ b.setPointerCapture(e.pointerId); }catch(_){} press(); });
  b.addEventListener('pointerup', e=>{ e.preventDefault(); release(); });
  b.addEventListener('pointercancel', release);
  b.addEventListener('lostpointercapture', release);
  b.addEventListener('contextmenu', e=>e.preventDefault());
});
/* touch joystick */
(function(){
  const stick=$('stick'), knob=$('stickKnob');
  if(!stick||!knob) return;
  let pid=null, cx=0, cy=0, rad=50;
  const neutral=()=>{ input.left=input.right=input.up=input.down=false;
    knob.style.transform='translate(-50%,-50%)'; stick.classList.remove('active'); };
  const track=e=>{
    let dx=e.clientX-cx, dy=e.clientY-cy;
    const d=Math.hypot(dx,dy);
    if(d>rad){ dx=dx/d*rad; dy=dy/d*rad; }
    knob.style.transform=`translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px))`;
    const nx=dx/rad, ny=dy/rad, dz=0.26;
    input.left=nx<-dz; input.right=nx>dz; input.up=ny<-dz; input.down=ny>dz;
  };
  stick.addEventListener('pointerdown', e=>{
    e.preventDefault();
    if(pid!==null) return;
    pid=e.pointerId;
    try{ stick.setPointerCapture(pid); }catch(_){}
    const r=stick.getBoundingClientRect();
    cx=r.left+r.width/2; cy=r.top+r.height/2; rad=r.width*0.32;
    stick.classList.add('active');
    track(e);
  });
  stick.addEventListener('pointermove', e=>{ if(pid!==e.pointerId) return; e.preventDefault(); track(e); });
  const end=e=>{ if(pid!==e.pointerId) return; pid=null; neutral(); };
  stick.addEventListener('pointerup', end);
  stick.addEventListener('pointercancel', end);
})();
function toggleMute(){ const m=!AUD.isMuted(); AUD.setMuted(m); const b=$('muteBtn'); if(b) b.textContent = m?'🔇':'🔊'; }
function togglePanel(){ $('panel').classList.toggle('open'); }
$('muteBtn').addEventListener('click', toggleMute);
$('panelToggle').addEventListener('click', togglePanel);
$('panelBtn') && $('panelBtn').addEventListener('click', togglePanel);
function setZoom(out){
  zoomedOut=out;
  if(camMode!=='street') setCam('street');
  const o=$('zoomOut'), i=$('zoomIn');
  if(o) o.classList.toggle('on', out);
  if(i) i.classList.toggle('on', !out);
}
$('zoomOut') && $('zoomOut').addEventListener('click', ()=>setZoom(true));
$('zoomIn') && $('zoomIn').addEventListener('click', ()=>setZoom(false));
$('panelClose').addEventListener('click', ()=>$('panel').classList.remove('open'));
$('startBtn').addEventListener('click', startGame);
$('againBtn').addEventListener('click', startGame);
$('boardBtn').addEventListener('click', ()=>{
  const p=$('panel'); if(p) p.classList.add('open');
  const t=document.querySelector('[data-tab="board"]'); if(t) t.click();
});
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click', ()=>{
  const tab=b.dataset.tab;
  document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('on', x===b));
  $('chatLog').hidden = tab!=='chat';
  $('board').hidden = tab!=='board';
  $('chatForm').hidden = tab!=='chat';
}));
$('chatForm').addEventListener('submit', e=>{ e.preventDefault();
  const t=$('chatInput').value.trim(); if(!t) return; send({type:'chat', text:t.slice(0,140)}); $('chatInput').value=''; });
$('nameInput').value=name;
$('nameInput').addEventListener('input', e=>{ name=e.target.value.slice(0,16); localStorage.setItem('lc_name', name); });

/* ---------- camera ---------- */
let camMode='street', camA=0.35, zoomedOut=false;
const controls = R.OrbitControls ? new R.OrbitControls(camera, canvas) : null;
if(controls){ controls.enableDamping=true; controls.dampingFactor=0.08; controls.minDistance=3; controls.maxDistance=44;
  controls.maxPolarAngle=Math.PI*0.5; controls.enablePan=false; controls.target.set(0,1.5,2);
  controls.enabled=false; controls.addEventListener('start', ()=>{ if(camMode!=='free') setCam('free'); }); }
function setCam(mode){
  if(mode==='free' && !controls) mode='street';
  if(mode==='free'){ controls.enabled=true; controls.target.set(0,1.5,2); camera.position.set(6,4,9); }
  else controls.enabled=false;
  camMode=mode;
  document.querySelectorAll('.cams button').forEach(b=>b.classList.toggle('on', b.dataset.cam===mode));
}
document.querySelectorAll('.cams button').forEach(b=>b.addEventListener('click', ()=>setCam(b.dataset.cam)));

let baseFov=46;
function resize(){ const w=canvas.clientWidth,h=canvas.clientHeight; renderer.setSize(w,h,false);
  camera.aspect=w/h; camera.fov=baseFov = w<780 ? 58 : 46; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

/* ---------- loop ---------- */
const camPos=new R.Vector3(0,3.4,12.4), camGoal=new R.Vector3(), camLook=new R.Vector3(0,1.6,2), look=new R.Vector3();
let last=performance.now(), time=0, hudT=0;
function frame(now){
  const dt=Math.min(0.05,(now-last)/1000); last=now; time+=dt;
  let ev=[];
  if(phase==='play'){
    ev=window.RFGEngine.step(G, input, dt);
    input.punch=false; input.kick=false;
    handleEvents(ev);
    if(G.phase==='over' && !overSent){ overSent=true; const o=ev.find(e=>e.e==='over'); endGame(o?o.score:G.score, G.kos, G.t); }
  } else { input.punch=false; input.kick=false; }
  render(dt);
  hudT-=dt; if(hudT<=0){ hudT=0.1; if(phase==='play') updateHUD(); }
  requestAnimationFrame(frame);
}
function handleEvents(ev){
  for(const e of ev) fx(e);
}
function fx(e){
  if(e.e==='hit'){ const y=1.0+Math.random()*0.7;
    puff(new R.Vector3(e.x,y,e.z), 0.32);
    chipBurst(e.x, y, e.z, 0xe6e0d0, 4, 2.4);
    AUD.play(e.atk==='kick'?'kick':'punch'); shake=Math.min(0.3,shake+0.05); }
  else if(e.e==='whiff'){ AUD.play('whiff'); }
  else if(e.e==='ko'){ puff(new R.Vector3(e.x,1.1,e.z), 0.7);
    chipBurst(e.x, 1.1, e.z, 0xd8d2c4, 6, 2.8);
    AUD.play('ko'); if(Math.random()<0.5) AUD.play('coin'); }
  else if(e.e==='glass'){ const big=e.bat||e.dmg>10; const y=1.35+Math.random()*1.6;
    glassFlash(e.x, y);
    chipBurst(e.x, y, 0.14, big?0xfff0cf:0xdff2ff, big?9:5, big?4:3);
    puff(new R.Vector3(e.x, y, 0.85), big?0.85:0.5);
    shake=Math.min(0.34, shake+(big?0.16:0.09));
    AUD.play(e.thrown?'bottle':(big?'smash':'crack')); if(Math.random()<0.35) AUD.play('clack'); }
  else if(e.e==='throw'){ AUD.play('throw'); }
  else if(e.e==='maul'){ AUD.play('hurt'); AUD.play('thud'); shake=Math.min(0.3,shake+0.08); }
  else if(e.e==='break'){ shardBurst(); AUD.play('smash'); shake=0.34; puff(new R.Vector3(0,2,1.2),2.2); toast('THE SHOP WINDOW GAVE WAY'); }
  else if(e.e==='wave'){ AUD.play('wave'); banner('WAVE '+e.wave, 'wave'); }
  else if(e.e==='blunder'){ toast('NOT THEM! They are on our side — −150'); AUD.play('boo'); AUD.play('hurt');
    shake=Math.min(.4,shake+.18); chipBurst(e.x,1.2,e.z,0xe8d24a,5,2.2); }
  else if(e.e==='crs'){ AUD.play('siren'); }
  else if(e.e==='disperse'){ banner('CRS DISPERSES THE STREET','wave'); AUD.play('coin');
    toast(`CRS BONUS +${e.bonus} — grab a mask!`); }
  else if(e.e==='gas'){ AUD.play('gas'); shake=Math.min(.3,shake+.08); }
  else if(e.e==='mask'){ toast('MASK ON — clean air for 18s'); AUD.play('coin'); AUD.play('blip'); }
  else if(e.e==='cough'){ AUD.play('cough'); }
  else if(e.e==='barricade'){ toast('BARRICADE — kick it apart'); AUD.play('thud'); }
  else if(e.e==='barrhit'){ AUD.play('clack'); chipBurst(e.x, 0.7, e.z, 0x8a6a44, 3, 2); shake=Math.min(.24,shake+.04); }
  else if(e.e==='barrdown'){ AUD.play('smash'); toast('BARRICADE DOWN +80');
    chipBurst(e.x,1.0,e.z,0x8a6a44,12,3.4); puff(new R.Vector3(e.x,1.0,e.z),1.1); shake=Math.min(.3,shake+.1); }
  else if(e.e==='over'){ /* handled in frame */ }
}
function syncRioters(dt){
  const seen=new Set();
  for(const r of G.rioters){
    seen.add(r.id);
    let m=rioterMeshes.get(r.id)||rioterMesh(r);
    m._x=lerp(m._x==null?r.x:m._x, r.x, clamp(dt*11,0,1));
    m._z=lerp(m._z==null?r.z:m._z, r.z, clamp(dt*11,0,1));
    m._gy=lerp(m._gy==null?floorY(r.z):m._gy, floorY(r.z), clamp(dt*14,0,1));
    m.position.set(m._x, m._gy, m._z);
    poseHuman(m,r,false);
  }
  for(const [id,m] of rioterMeshes){ if(!seen.has(id)){ world.remove(m); rioterMeshes.delete(id); } }
}
function render(dt){
  if(G){
    const m=G.merchant;
    MERCHANT.position.set(m.x,0,m.z);
    MERCHANT._gy = (MERCHANT._gy==null) ? floorY(m.z) : lerp(MERCHANT._gy, floorY(m.z), clamp(dt*14,0,1));
    MERCHANT.position.set(m.x, MERCHANT._gy, m.z);
    // face where you walk, and face the exact strike direction when attacking
    let yaw;
    if(m.state==='cry') yaw = 0;
    else if(m.state==='attack') yaw = Math.atan2(m.aimX-m.x, m.aimZ-m.z);
    else yaw = Math.atan2(m.dirX||0, m.dirZ||1);
    if(!isFinite(yaw)) yaw = 0;
    MERCHANT.rotation.y = MERCHANT._yaw==null ? yaw : lerpAngle(MERCHANT._yaw, yaw, clamp(dt*8,0,1));
    MERCHANT._yaw = MERCHANT.rotation.y;
    poseHuman(MERCHANT, m, true);
    // soft footfall ticks while the merchant is moving
    if(m.state==='walk'){ stepT-=dt; if(stepT<=0){ stepT=0.34; AUD.play('tick'); } }
    else stepT=0;
    // merchant bob/hurt tint
    if(m.state==='cry'){ cryT-=dt; if(cryT<=0){ cryT=0.22; tear(m.x, m.z); const a=window.LCAudio; if(!a._cryOn){ a.cry(true); a._cryOn=true; } } }
    else if(window.LCAudio._cryOn){ window.LCAudio.cry(false); window.LCAudio._cryOn=false; }
    syncRioters(dt);
    syncMarchers(dt);
    syncCrs(dt);
    syncCanisters(dt);
    syncGas(dt);
    syncPickups(dt);
    syncBarricades(dt);
    syncProjs(G.projectiles);
    const go=$('gas'); if(go) go.classList.toggle('on', !!m.gassed);
    // glass visual state
    const frac=1-clamp(G.glass/G.maxGlass,0,1);
    drawCracks(frac);
    const vis=clamp(frac*1.25,0,1);
    for(const c of cracks) c.material.opacity = G.glass<=0?0:vis;
    for(const p of panes) p.mesh.material.opacity = G.glass<=0?0.05:0.24*(1-vis*0.5);
    if(G.glass<=0){ doorMesh.rotation.z=0.45; }
    stepFire(dt, G.burn, time);
    // fire also inside when burning
    if(G.burn>0.02 && Math.random()<dt*2){ AUD.play('crowd'); }
  }
  stepSmoke(dt); stepChips(dt); stepFlashes(dt); stepShards(dt); stepTears(dt);
  // flag wave
  if(flag){ const pos=flag.geometry.attributes.position; for(let i=0;i<pos.count;i++){
    const x=flagBase[i*3]; pos.setZ(i, Math.sin(x*3.4 - time*4.2)*0.06 + Math.sin(x*7 - time*6)*0.02); }
    pos.needsUpdate=true; flag.geometry.computeVertexNormals(); }
  // camera
  const ease=1-Math.exp(-dt*3.4);
  if(camMode==='free'){ controls.update(); }
  else {
    const mx = G?G.merchant.x:0;
    if(camMode==='street'){
      const near = innerHeight<560 || innerWidth<560, wide = zoomedOut;
      camGoal.set(near?clamp(mx*(wide?0.45:0.8),-4,4):clamp(mx*0.3,-2,2),
        near?(wide?5.8:3.6):(wide?7.0:5.0),
        near?(wide?16.4:9.6):(wide?19.5:14.2));
      look.set(near?clamp(mx*(wide?0.5:0.95),-5,5):clamp(mx*0.42,-2.4,2.4),
        near?(wide?2.2:2.4):3.6,
        near?(wide?1.6:0.9):0.6);
    }
    else if(camMode==='cine'){ camA+=dt*(reduce?0.02:0.07); camGoal.set(Math.sin(camA)*13, 6+Math.sin(camA*0.7)*1.2, 6+Math.cos(camA)*13); look.set(0,1.8,2); }
    else if(camMode==='wide'){ camGoal.set(0,9,22); look.set(0,1.6,3); }
    else if(camMode==='close'){ camGoal.set(clamp(mx*0.5,-2,2), 2.1, 6.4); look.set(clamp(mx*0.5,-2,2), 1.5, 1.6); }
    camPos.lerp(camGoal,ease); camLook.lerp(look,ease);
    camera.position.copy(camPos);
    if(shake>0) camera.position.add(new R.Vector3(rand(-shake,shake),rand(-shake,shake),rand(-shake,shake)));
    camera.lookAt(camLook);
  }
  shake=Math.max(0,shake-dt*1.5);
  if(camKick>0.001){ camera.fov=baseFov*(1-0.05*camKick); camera.updateProjectionMatrix(); camKick=Math.max(0,camKick-dt*3.5); if(camKick<=0.001){ camera.fov=baseFov; camera.updateProjectionMatrix(); } }
  renderer.render(scene,camera);
}

/* ---------- boot ---------- */
ground(); streetProps();
haussmann(-19, 10, {w:14,d:20,floors:3,ground:4.0,tint:true});
haussmann(19, 10, {w:14,d:20,floors:3,ground:4.0,tint:false});
haussmann(-19, 34, {w:14,d:20,floors:3,ground:4.0,tint:false});
haussmann(19, 34, {w:14,d:20,floors:3,ground:4.0,tint:true});
haussmann(-19, -14, {w:14,d:20,floors:3,ground:4.0,tint:false});
haussmann(19, -14, {w:14,d:20,floors:3,ground:4.0,tint:true});
storefront();
setCam('street');
updateHUD();
window.LC && LC.ready && LC.ready.then(()=>{ if(shopSign && LC.config.shopName){ shopSign.material.map=signTex(LC.config.shopName,'TOUT POUR LA MAISON'); shopSign.material.needsUpdate=true; const e=$('shopName'); if(e) e.firstChild && (e.firstChild.nodeValue=LC.config.shopName+' '); } });
connect();
if(location.hash === '#debug') window.LCDebug = {
  game: () => G,
  burn(){ if(G){ G.glass = 0; G.phase = 'burn'; } },
  wave(n){ if(G){ G.wave = n|0; } },
  yaw(){ return MERCHANT.rotation.y; },
  marcher(){ if(G) window.RFGEngine.spawnMarcher(G); },
  crs(){ if(G) window.RFGEngine.crsWave(G); },
  barr(){ if(G) window.RFGEngine.spawnBarricade(G); }
};
requestAnimationFrame(frame);
})();
