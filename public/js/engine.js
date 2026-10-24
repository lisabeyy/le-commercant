/* LE COMMERÇANT — playable raid engine (client side).
   You are the shopkeeper. Waves of rioters never stop coming down the street for your glass
   storefront. Punch and kick them back; the longer you stand and the more you drop, the higher
   your score. The raid only ends when the glass breaks, the shop catches fire and you are left
   crying on the pavement. Pure logic — no rendering, no sound; arena.js drives it. */
(function(root){
const STEP = 1/60;
const GLASS_HP = 100;
const HALF_W = 7.0;            // how far the merchant can slide along the shopfront
const Z_MIN = 0.85, Z_MAX = 7.6, GLASS_Z = 0.7;
const GLASS_HALF = 5.3;        // rioters only ever attack in front of the glazing
const SPAWN_MIN = 10, SPAWN_MAX = 13;
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const rand = (a,b) => a + Math.random()*(b-a);

// rioter archetypes: hp, walk, glass damage, chance to go for the merchant, weight, bat, throw
const RAG = {
  brawler:{hp:42, spd:1.55, glass:4,  melee:.9,  w:1.2},
  kicker: {hp:38, spd:1.75, glass:7,  melee:.1,  w:1.1},
  bat:    {hp:54, spd:1.35, glass:13, melee:.5,  w:0.95, bat:true},
  thrower:{hp:34, spd:1.65, glass:8,  melee:0,   w:0.85, stand:7.5},
  lurker: {hp:26, spd:2.25, glass:3,  melee:.6,  w:0.7}
};
const PLACARDS = ['TOUT VA BIEN','ON EST LÀ','RENDEZ L\'ARGENT','LIBERTÉ','ASSEZ','NON',
  "BISMILAH C'EST LES TÉNÈBRES",'ON VEUT RIEN LÂCHER','ÇA SUFFIT','MACRON DEHORS',
  'BRIGITTE EST UN HOMME'];
const CLEAN_NEED = 12;
const PATK = {
  punch:{dur:.26, reach:1.7, dmg:32, arc:1.05, kb:.5},
  kick: {dur:.5,  reach:2.3, dmg:52, arc:.7,   kb:1.5}
};

function pickType(wave){
  const w = {
    brawler:1.3,
    kicker:1.0 + wave*.05,
    bat:wave>=2 ? .4 + wave*.08 : 0,
    thrower:wave>=2 ? .5 + wave*.16 : 0,
    lurker:wave>=3 ? .3 + wave*.1 : 0
  };
  const e = Object.entries(w); let r = rand(0, e.reduce((s,[,x])=>s+x,0));
  for(const [k,v] of e){ r -= v; if(r<=0) return k; }
  return 'brawler';
}

function createRaid(){
  return {
    t:0, phase:'guard', score:0, kos:0, wave:1, waveT:0, spawnT:1.6,
    glass:GLASS_HP, maxGlass:GLASS_HP, burn:0, overT:0, nextId:1, shake:0,
    merchant:{x:0, z:2.8, state:'idle', t:0, dur:0, atk:null, hitDone:false, face:1,
      aimX:0, aimZ:2.8, stagger:0, cry:0, hurt:0, clock:0, maskT:0, gassed:false,
      dirX:0, dirZ:1},
    rioters:[], projectiles:[], ev:[],
    marchers:[], barricades:[], crs:[], canisters:[], gasZones:[], pickups:[],
    marT:4.5, barrT:18, nextBarr:1, blunders:0, coughT:0,
    clean:0, crsCool:0, pauseSpawn:0
  };
}

function nearest(G, x, z){
  let best=null, bd=1e9;
  for(const r of G.rioters){ if(r.state==='down') continue;
    const d=(r.x-x)**2+(r.z-z)**2; if(d<bd){ bd=d; best=r; } }
  return best;
}
function ko(G, r){ r.state='down'; r.t=0; r.dur=1.6; r.hitDone=true; G.kos++; G.score += 100;
  G.ev.push({e:'ko', id:r.id, x:r.x, z:r.z, type:r.type}); }

function strike(G, m){
  const a = PATK[m.atk];
  let ux = m.aimX-m.x, uz = m.aimZ-m.z; const d0=Math.hypot(ux,uz)||1; ux/=d0; uz/=d0;
  let any=false;
  for(const r of G.rioters){
    if(r.state==='down') continue;
    const rx=r.x-m.x, rz=r.z-m.z, d=Math.hypot(rx,rz);
    if(d > a.reach+0.5) continue;
    const dot = d>0.001 ? (rx*ux+rz*uz)/d : 1;
    if(dot < Math.cos(a.arc)) continue;
    any = true;
    const dmg = a.dmg*rand(.9,1.1);
    r.hp -= dmg;
    r.x += ux*a.kb; r.z += uz*a.kb;
    G.ev.push({e:'hit', id:r.id, x:r.x, z:r.z, atk:m.atk});
    G.clean++;
    if(r.hp<=0) ko(G,r); else { r.state='hit'; r.t=0; r.dur=.3; }
  }
  for(const q of G.marchers){
    if(q.hitCool>0) continue;
    const rx=q.x-m.x, rz=q.z-m.z, d=Math.hypot(rx,rz);
    if(d > a.reach+0.55) continue;
    if(d>0.001 && (rx*ux+rz*uz)/d < Math.cos(a.arc)) continue;
    any = true;
    q.hitCool = 1.4; q.state='flee'; q.fdir = q.x>=0 ? 1 : -1;
    G.score = Math.max(0, G.score-150); G.blunders++; G.clean = 0;
    G.ev.push({e:'blunder', x:q.x, z:q.z});
  }
  for(const b of G.barricades){
    const rx=b.x-m.x, rz=b.z-m.z, d=Math.hypot(rx,rz);
    if(d > a.reach+0.95) continue;
    if(d>0.001 && (rx*ux+rz*uz)/d < Math.cos(a.arc)) continue;
    any = true; b.hp -= a.dmg*1.4; b.shake = .28;
    G.ev.push({e:'barrhit', x:b.x, z:b.z});
  }
  G.barricades = G.barricades.filter(b => {
    if(b.hp>0) return true;
    G.score += 80; G.ev.push({e:'barrdown', x:b.x, z:b.z});
    return false;
  });
  if(G.clean>=CLEAN_NEED && G.crsCool<=0 && G.phase==='guard'){ G.clean=0; crsWave(G); }
  if(!any) G.ev.push({e:'whiff', x:m.x, z:m.z, atk:m.atk});
}

function inGas(G, m){
  if(m.maskT>0) return false;
  for(const g of G.gasZones) if(Math.hypot(m.x-g.x, m.z-g.z) < g.r*0.9) return true;
  return false;
}
function blockMerchant(G){
  const m = G.merchant;
  for(const b of G.barricades){
    const dx=m.x-b.x, dz=m.z-b.z, d=Math.hypot(dx,dz);
    if(d<1.1){ const k=(1.1-d)/(d||1); m.x=clamp(m.x+dx*k,-HALF_W,HALF_W); m.z=clamp(m.z+dz*k,Z_MIN,Z_MAX); }
  }
}

function stepMerchant(G, input, dt){
  const m = G.merchant; m.t += dt; m.clock += dt;
  m.gassed = inGas(G, m);
  if(m.hurt>0) m.hurt -= dt;
  if(m.stagger>0){ m.stagger -= dt; m.state='stagger'; if(m.stagger<=0) m.state='idle'; return; }
  if(G.burn>0.15){ m.state='cry'; m.cry = Math.min(1, m.cry+dt*1.6); return; }
  if(m.state==='attack'){
    const p = m.t/m.dur;
    if(p<0.4){ m.x += (m.aimX-m.x)*Math.min(1,dt*6)*0.5; m.z += (m.aimZ-m.z)*Math.min(1,dt*6)*0.5; blockMerchant(G); }
    if(!m.hitDone && p>=0.42){ m.hitDone=true; strike(G,m); }
    if(p>=1) m.state='idle';
    return;
  }
  let mx=(input.right?1:0)-(input.left?1:0), mz=(input.down?1:0)-(input.up?1:0);
  const len=Math.hypot(mx,mz), sp = m.gassed ? 2.1 : 4.7;
  if(len>0){ mx/=len; mz/=len;
    m.x = clamp(m.x+mx*sp*dt, -HALF_W, HALF_W);
    m.z = clamp(m.z+mz*sp*dt, Z_MIN, Z_MAX);
    if(mx) m.face = mx>0?1:-1;
    m.dirX=mx; m.dirZ=mz;
    m.state='walk';
  } else m.state='idle';
  blockMerchant(G);
  const near = nearest(G,m.x,m.z);
  if(near){ if(Math.abs(near.x-m.x)>0.25) m.face = near.x>m.x?1:-1; }
  const start = atk => { m.atk=atk; m.hitDone=false; m.state='attack'; m.t=0; m.dur=PATK[atk].dur;
    let ax, az;
    if(len>0){ ax = m.x+mx*2.6; az = m.z+mz*2.6; }
    else { const tgt = nearest(G,m.x,m.z);
      if(tgt){ ax=tgt.x; az=tgt.z; } else { ax=m.x+m.dirX*2.6; az=m.z+m.dirZ*2.6; } }
    m.aimX=ax; m.aimZ=az;
    const dl=Math.hypot(ax-m.x, az-m.z)||1; m.dirX=(ax-m.x)/dl; m.dirZ=(az-m.z)/dl; };
  if(input.kick) start('kick'); else if(input.punch) start('punch');
}

function spawn(G){
  const side = Math.random()<.5?-1:1, type = pickType(G.wave), A=RAG[type];
  const pw = 1 + (G.wave-1)*0.06;
  const r = {id:G.nextId++, type, side, x:side*rand(SPAWN_MIN,SPAWN_MAX), z:rand(3.8,9.5), z0:0,
    tx:rand(-GLASS_HALF,GLASS_HALF), hp:A.hp*pw, spd:A.spd*(1+(G.wave-1)*0.02)*rand(.9,1.12),
    glass:A.glass*(1+(G.wave-1)*0.06), melee:A.melee, bat:!!A.bat, stand:A.stand,
    state:'walk', t:0, dur:0, hitDone:false, cool:rand(.3,1.2), clock:rand(0,6)};
  r.z0 = r.z;
  G.rioters.push(r);
  G.ev.push({e:'spawn', id:r.id, type:r.type, side:r.side, x:r.x, z:r.z});
}

function stepRioters(G, dt){
  const m = G.merchant, burn = G.burn>0.05;
  for(const r of G.rioters){
    r.t += dt; r.clock += dt;
    if(r.state==='down') continue;
    if(r.state==='flee'){ r.z += r.spd*2.6*dt; r.x += (r.x>=0?1:-1)*r.spd*0.9*dt; continue; }
    if(r.state==='hit'){ if(r.t>=r.dur) r.state='walk'; else continue; }
    if(r.state==='swing'){
      if(r.t>=r.dur*.42 && !r.hitDone){ r.hitDone=true;
        if(Math.hypot(m.x-r.x,m.z-r.z)<=1.45){ m.stagger=Math.max(m.stagger,.42); m.hurt=1; G.ev.push({e:'maul',x:m.x,z:m.z,id:r.id}); } }
      if(r.t>=r.dur){ r.state='walk'; r.t=0; r.cool=rand(.6,1.2); }
      continue;
    }
    if(r.state==='smash'){
      const a=RAG[r.type];
      if(r.t>=r.dur*.5 && !r.hitDone){ r.hitDone=true;
        const dmg=r.glass*rand(.85,1.15); G.glass=Math.max(0,G.glass-dmg); G.shake=Math.max(G.shake, r.bat?.16:.09);
        G.ev.push({e:'glass', hp:G.glass, dmg:Math.round(dmg), x:r.x, z:r.z, id:r.id, bat:r.bat});
        if(G.glass<=0 && G.phase==='guard'){ G.phase='burn'; G.ev.push({e:'break'}); }
      }
      if(r.t>=r.dur){ r.state='walk'; r.t=0; r.cool = r.bat?1.4:rand(.6,1.0); }
      continue;
    }
    if(r.state==='throw'){
      if(r.t>=r.dur*.5 && !r.hitDone){ r.hitDone=true;
        const n = 1 + Math.min(2, Math.floor((G.wave-1)/3));
        for(let i=0;i<n;i++){
          const off = (i-(n-1)/2)*0.5;
          G.projectiles.push({x:r.x+off, z:r.z, vz:-15, dmg:r.glass*rand(.8,1.1)*(n>1?.5:1), spin:0, kind:Math.random()<.5?'bottle':'stone'});
        }
        G.ev.push({e:'throw', x:r.x, z:r.z, id:r.id, n}); }
      if(r.t>=r.dur){ r.state='walk'; r.t=0; r.cool=Math.max(1.0, 1.9 - G.wave*0.08); }
      continue;
    }
    r.cool -= dt;
    // go for the merchant if close and inclined
    if(!burn && r.melee>0 && Math.hypot(m.x-r.x,m.z-r.z)<=1.25 && r.cool<=0 && Math.random()<r.melee*dt*8){
      r.state='swing'; r.t=0; r.dur=.55; r.hitDone=false; continue;
    }
    // reach the glass line -> smash (only when actually in front of the glazing)
    const gz = GLASS_Z;
    if(r.z <= gz+0.12){
      if(G.glass>0 && r.cool<=0 && Math.abs(r.x) <= GLASS_HALF+0.5){ r.state='smash'; r.t=0; r.dur=r.bat?.85:.6; r.hitDone=false; }
      else { r.z = gz+0.12; r.x += clamp(r.tx-r.x,-1,1)*r.spd*dt; }
      continue;
    }
    if(r.type==='thrower' && r.cool<=0 && r.z<=r.stand && Math.abs(r.x)<=GLASS_HALF+0.5){
      r.state='throw'; r.t=0; r.dur=.55; r.hitDone=false; continue;
    }
    // one lane at a time: get in front of the glazing first, then close on the window
    const hold = r.type==='thrower' && r.z <= (r.stand||0);
    const dxl = r.tx - r.x;
    if(hold){ r.x += clamp(dxl,-1,1)*r.spd*0.6*dt; }
    else if(Math.abs(dxl) > 0.55){
      r.x += clamp(dxl,-1,1)*r.spd*dt;
      if(r.z > r.z0 - 0.1) r.z -= r.spd*0.3*dt;     // drift in gently while crossing
    } else {
      r.z -= r.spd*dt; if(r.z<gz) r.z=gz;
    }
    if(r.z < 2.4) r.x = clamp(r.x, -(GLASS_HALF+0.7), GLASS_HALF+0.7);
    r.state='walk';
  }
  G.rioters = G.rioters.filter(r => !((r.state==='down' && r.t>r.dur) || (r.state==='flee' && r.z>14)));
}

function stepProjectiles(G, dt){
  for(let i=G.projectiles.length-1;i>=0;i--){
    const p=G.projectiles[i]; p.z += p.vz*dt; p.spin += dt*12;
    let blocked = false;
    for(const b of G.barricades){
      if(p.z <= b.z+0.15 && p.z >= b.z-0.55 && Math.abs(p.x-b.x) < 1.35){
        b.hp -= p.dmg*0.8; b.shake = .2; blocked = true;
        G.ev.push({e:'barrhit', x:p.x, z:b.z});
        break;
      }
    }
    if(blocked){ G.projectiles.splice(i,1); continue; }
    if(p.z<=GLASS_Z){
      G.glass=Math.max(0,G.glass-p.dmg); G.shake=Math.max(G.shake,.1);
      G.ev.push({e:'glass', hp:G.glass, dmg:Math.round(p.dmg), x:p.x, z:GLASS_Z, thrown:true, kind:p.kind});
      if(G.glass<=0 && G.phase==='guard'){ G.phase='burn'; G.ev.push({e:'break'}); }
      G.projectiles.splice(i,1);
    }
  }
  G.barricades = G.barricades.filter(b => {
    if(b.hp>0) return true;
    G.ev.push({e:'barrdown', x:b.x, z:b.z});
    return false;
  });
}

function spawnMarcher(G){
  if(G.marchers.length >= 3) return;
  const dir = Math.random()<.5 ? 1 : -1;
  G.marchers.push({id:G.nextId++, dir, x:-dir*rand(11.5,13), z:rand(5.4,7.3),
    spd:rand(.55,.85), t:0, clock:rand(0,6), state:'walk', hitCool:0,
    placard:(Math.random()*PLACARDS.length)|0, flag:Math.random()<.4});
}
function stepMarchers(G, dt){
  for(const r of G.marchers){
    r.t += dt; r.clock += dt; if(r.hitCool>0) r.hitCool -= dt;
    if(r.state==='flee') r.x += (r.fdir||1)*r.spd*3.4*dt;
    else r.x += r.dir*r.spd*dt;
  }
  G.marchers = G.marchers.filter(r => Math.abs(r.x) < 14);
}

function crsWave(G){
  const sides = [-4.6, 4.6];
  for(let i=0;i<2;i++){
    const sx=sides[i], sz=i?4.2:3.7;
    G.crs.push({id:G.nextId++, x:sx, z:sz, t:0, dur:8.2, clock:0});
    G.canisters.push({x0:sx, z0:sz, x:sx, z:sz,
      tx:clamp(sx*0.35+rand(-1.6,1.6),-5.4,5.4), tz:rand(2.8,4.6), t:0,
      dur:1.15+i*.18, h:0});
  }
  const msign = Math.random()<.5?-1:1;
  G.pickups.push({kind:'mask', x:clamp(G.merchant.x + msign*rand(1.9,3.0), -5.8, 5.8),
    z:rand(2.2,3.4), t:0, life:22});
  let scattered = 0;
  for(const r of G.rioters){
    if(r.state==='down' || r.state==='flee') continue;
    r.state='flee'; r.t=0; r.hitDone=true; r.cool=99; scattered++;
  }
  for(const q of G.marchers){ q.state='flee'; q.fdir = q.x>=0?1:-1; q.hitCool=1.5; }
  G.projectiles.length = 0;
  const bonus = 120 + scattered*20;
  G.score += bonus;
  G.pauseSpawn = 9.5;
  G.crsCool = 25;
  G.ev.push({e:'crs', x:0, z:5.2});
  G.ev.push({e:'disperse', bonus, n:scattered});
}
function spawnBarricade(G){
  if(G.barricades.length>=2) return;
  const x = rand(-4.4,4.4), z = rand(4.5,5.6);
  for(const b of G.barricades) if(Math.hypot(b.x-x, b.z-z) < 2.4) return;
  G.barricades.push({id:G.nextBarr++, x, z, hp:120, maxHp:120, t:0, shake:0});
  G.ev.push({e:'barricade', x, z});
}

function stepExtras(G, dt){
  const m = G.merchant;
  if(m.maskT>0) m.maskT = Math.max(0, m.maskT-dt);
  if(G.coughT>0) G.coughT -= dt;
  if(m.gassed && G.coughT<=0){ G.coughT = rand(2.2,3.6); G.ev.push({e:'cough'}); }

  for(const g of G.gasZones) g.t += dt;
  G.gasZones = G.gasZones.filter(g => g.t < g.life);

  for(const c of G.canisters){
    c.t += dt;
    const p = Math.min(1, c.t/c.dur);
    c.x = c.x0 + (c.tx-c.x0)*p; c.z = c.z0 + (c.tz-c.z0)*p;
    c.h = Math.sin(p*Math.PI)*2.6;
    if(p>=1){
      G.gasZones.push({x:c.tx, z:c.tz, r:2.5, t:0, life:8});
      G.ev.push({e:'gas', x:c.tx, z:c.tz});
      c.done = true;
    }
  }
  G.canisters = G.canisters.filter(c => !c.done);

  for(const p of G.pickups){
    p.t += dt;
    if(Math.hypot(m.x-p.x, m.z-p.z) < 1.05){
      m.maskT = 18; p.done = true;
      G.ev.push({e:'mask', x:p.x, z:p.z});
    }
  }
  G.pickups = G.pickups.filter(p => !p.done && p.t < p.life);

  for(const c of G.crs) c.t += dt;
  G.crs = G.crs.filter(c => c.t < c.dur);

  for(const b of G.barricades) if(b.shake>0) b.shake -= dt;
}

function step(G, input, dtRaw){
  const dt = Math.min(0.05, dtRaw);
  G.ev = [];
  if(G.phase==='over') return G.ev;
  G.t += dt;
  G.shake = Math.max(0, G.shake - dt*1.2);
  stepMerchant(G, input||{}, dt);
  stepRioters(G, dt);
  stepProjectiles(G, dt);
  stepMarchers(G, dt);
  stepExtras(G, dt);

  if(G.phase==='guard'){
    G.score += dt*10;
    G.waveT += dt;
    if(G.waveT >= 20){ G.waveT = 0; G.wave++; G.ev.push({e:'wave', wave:G.wave});
      }
    if(G.crsCool>0) G.crsCool -= dt;
    G.marT -= dt;
    if(G.marT<=0){ spawnMarcher(G); G.marT = rand(9,16); }
    G.barrT -= dt;
    if(G.barrT<=0){ if(G.wave>=2) spawnBarricade(G); G.barrT = rand(15,24); }
    if(G.pauseSpawn>0) G.pauseSpawn -= dt;
    else {
      G.spawnT -= dt;
      if(G.spawnT<=0 && G.rioters.length < Math.min(15, 3+G.wave)){
        spawn(G);
        if(G.wave>=4 && Math.random()<.4) spawn(G);
        G.spawnT = Math.max(0.45, 2.4 - G.wave*0.14) * rand(.7,1.25);
      }
    }
  } else if(G.phase==='burn'){
    G.burn = Math.min(1, G.burn + dt*0.22);
    // the shop is gone: no more points, the street just keeps coming
    G.spawnT -= dt;
    if(G.spawnT<=0 && G.rioters.length < Math.min(12, 4+G.wave)){ spawn(G); G.spawnT = Math.max(0.8, 2.6-G.wave*0.1)*rand(.8,1.3); }
    if(G.burn>=1){ G.overT += dt; if(G.overT>3.2){ G.phase='over'; G.ev.push({e:'over', score:Math.round(G.score), kos:G.kos, time:Math.round(G.t)}); } }
  }
  return G.ev;
}

const api = {STEP, GLASS_HP, HALF_W, RAG, PATK, PLACARDS, CLEAN_NEED, createRaid, step,
  spawnMarcher, spawnBarricade, crsWave};
if(typeof module!=='undefined' && module.exports) module.exports = api;
else root.RFGEngine = api;
})(typeof window!=='undefined'?window:this);
