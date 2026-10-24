/* LE COMMERÇANT — audio. Everything is synthesised in the browser (no asset files):
   punches, kicks, glass cracks and shatters, bottle smashes, fire crackle, police siren,
   a low riot rumble, and short percussive game-feel ticks (impacts, footfalls, pickups). */
(function(root){
let ctx=null, master=null, info=null, rumble=null, fireSrc=null, muted=false, started=false;
let crying=null, crySrc=null;
let music=null, musicWanted=false;
const MUSIC_VOL=0.38;

function now(){ return ctx ? ctx.currentTime : 0; }
function noiseBuf(sec){
  const n = Math.floor(ctx.sampleRate*sec), b = ctx.createBuffer(1,n,ctx.sampleRate), d = b.getChannelData(0);
  for(let i=0;i<n;i++) d[i] = Math.random()*2-1;
  return b;
}
function env(g, t, a, d, peak){
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002,peak), t+a);
  g.gain.exponentialRampToValueAtTime(0.0001, t+a+d);
}

function init(){
  if(ctx) return;
  const AC = root.AudioContext || root.webkitAudioContext; if(!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.85; master.connect(ctx.destination);
  // low riot rumble bed
  const rs = ctx.createBufferSource(); rs.buffer = noiseBuf(3); rs.loop = true;
  const rf = ctx.createBiquadFilter(); rf.type='lowpass'; rf.frequency.value=170;
  const rg = ctx.createGain(); rg.gain.value=0.0; rs.connect(rf); rf.connect(rg); rg.connect(master); rs.start();
  rumble = rg;
}
function resume(){ init(); if(ctx && ctx.state==='suspended') ctx.resume(); }
function setMuted(m){ muted=!!m; if(master) master.gain.value = muted?0:0.85; if(music) music.muted=muted; }
function isMuted(){ return muted; }

function tone(t, type, f0, f1, dur, peak, dest){
  const o=ctx.createOscillator(), g=ctx.createGain(); o.type=type;
  o.frequency.setValueAtTime(f0,t); o.frequency.exponentialRampToValueAtTime(Math.max(20,f1), t+dur);
  env(g,t,0.004,dur,peak); o.connect(g); g.connect(dest||master); o.start(t); o.stop(t+dur+0.05);
}
function burst(t, dur, f0, f1, peak, q, type){
  const s=ctx.createBufferSource(); s.buffer=noiseBuf(dur);
  const b=ctx.createBiquadFilter(); b.type=type||'bandpass'; b.Q.value=q||1;
  b.frequency.setValueAtTime(f0,t); b.frequency.exponentialRampToValueAtTime(Math.max(60,f1),t+dur);
  const g=ctx.createGain(); env(g,t,0.003,dur,peak);
  s.connect(b); b.connect(g); g.connect(master); s.start(t); s.stop(t+dur+0.05);
}

const SFX = {
  punch(t){ burst(t,0.12,900,180,0.5,1.1); tone(t,'sine',180,60,0.12,0.35); },
  kick(t){ burst(t,0.18,600,120,0.6,0.9); tone(t,'sine',140,42,0.2,0.5); },
  whiff(t){ burst(t,0.16,1500,500,0.16,3.5,'highpass'); },
  ko(t){ burst(t,0.2,500,90,0.55,1); tone(t,'triangle',120,40,0.3,0.4); },
  hurt(t){ tone(t,'sawtooth',320,110,0.22,0.28); burst(t,0.14,700,200,0.25,1.4); },
  crack(t){ burst(t,0.09,5200,2600,0.4,7); tone(t,'triangle',2400,1500,0.07,0.12); },
  smash(t){ for(let i=0;i<5;i++) burst(t+i*0.03,0.09,7000-i*900,2200,0.32,6); tone(t,'triangle',1800,700,0.16,0.16); },
  bottle(t){ for(let i=0;i<7;i++) burst(t+i*0.018,0.06,6000-i*500,3000,0.28,9); },
  throw(t){ burst(t,0.2,1200,400,0.16,2.5,'bandpass'); },
  siren(t){ const base=now(); for(let i=0;i<3;i++){ const b=t+i*0.9;
    tone(b,'square',740,470,0.45,0.09); tone(b+0.45,'square',470,740,0.45,0.09); } },
  wave(t){ [523,659,784].forEach((f,i)=>tone(t+i*0.12,'triangle',f,f,0.22,0.2)); },
  over(t){ [392,330,262,196].forEach((f,i)=>tone(t+i*0.22,'sawtooth',f,f,0.5,0.22)); },
  // short percussive game-feel ticks
  thud(t){ tone(t,'sine',96,38,0.16,0.5); burst(t,0.07,420,140,0.3,1.2); },
  clack(t){ burst(t,0.05,3400,1200,0.34,5); tone(t,'square',900,420,0.04,0.1); },
  tick(t){ burst(t,0.028,4200,2600,0.2,8); },
  blip(t){ tone(t,'triangle',1180,1560,0.06,0.16); },
  sweep(t){ burst(t,0.13,2600,700,0.14,2.4,'highpass'); },
  coin(t){ tone(t,'triangle',1046,1046,0.05,0.16); tone(t+0.055,'triangle',1568,1568,0.09,0.14); },
  crowd(t){ for(let i=0;i<3;i++) burst(t+i*0.05,0.1,900-i*160,380,0.1,1.6); },
  gas(t){ burst(t,1.1,2200,600,0.2,0.7,'lowpass'); burst(t+0.15,0.7,900,300,0.12,0.6,'lowpass'); },
  cough(t){ burst(t,0.15,900,280,0.28,0.9); burst(t+0.22,0.11,700,220,0.2,0.9); },
  boo(t){ for(let i=0;i<5;i++) burst(t+i*0.07,0.16,300-i*18,130,0.13,0.7); }
};

function play(name){
  if(!ctx || muted) return; init();
  const fn = SFX[name]; if(!fn) return; fn(now()+0.001);
}

function ambience(on){
  if(!ctx) init(); if(!ctx) return;
  const target = on ? 0.05 : 0.0;
  if(rumble) rumble.gain.setTargetAtTime(target, now(), 0.4);
}
function fire(on){
  if(!ctx) init(); if(!ctx) return;
  if(on && !fireSrc){
    const s=ctx.createBufferSource(); s.buffer=noiseBuf(4); s.loop=true;
    const f=ctx.createBiquadFilter(); f.type='bandpass'; f.frequency.value=900; f.Q.value=0.6;
    const g=ctx.createGain(); g.gain.value=0.0;
    s.connect(f); f.connect(g); g.connect(master); s.start();
    g.gain.setTargetAtTime(0.11, now(), 0.6);
    fireSrc={s,g,f}; const wob=()=>{ if(!fireSrc) return; fireSrc.f.frequency.value=700+Math.random()*700; fireSrc.t=setTimeout(wob,120); }; wob();
  } else if(!on && fireSrc){ try{ fireSrc.g.gain.setTargetAtTime(0, now(), 0.5); fireSrc.s.stop(now()+1.5); clearTimeout(fireSrc.t);}catch(e){} fireSrc=null; }
}
function cry(on){
  if(!ctx) init(); if(!ctx) return;
  if(on && !crySrc){
    // a wobbly sobbing tone for the merchant
    const o=ctx.createOscillator(), o2=ctx.createOscillator(), g=ctx.createGain(), lfo=ctx.createOscillator(), lg=ctx.createGain();
    o.type='triangle'; o.frequency.value=180; o2.type='sine'; o2.frequency.value=182;
    lfo.frequency.value=5.5; lg.gain.value=26; lfo.connect(lg); lg.connect(o.frequency);
    g.gain.value=0.0; o.connect(g); o2.connect(g); g.connect(master);
    o.start(); o2.start(); lfo.start(); g.gain.setTargetAtTime(0.05, now(), 0.5);
    crySrc={o,o2,g,lfo};
  } else if(!on && crySrc){ try{ crySrc.g.gain.setTargetAtTime(0, now(), 0.4); const t0=now(); crySrc.o.stop(t0+1.2); crySrc.o2.stop(t0+1.2); crySrc.lfo.stop(t0+1.2);}catch(e){} crySrc=null; }
}
function stopAll(){ ambience(false); fire(false); cry(false); }

/* background music: plain <audio> stream, decoded off the render thread, loops forever */
function musicOn(){
  musicWanted=true;
  if(!music){
    music=new Audio('/audio/sous-le-ciel-de-paris.mp3');
    music.loop=true; music.preload='auto'; music.volume=0; music.muted=muted;
  }
  const p=music.play();
  if(p && p.catch) p.catch(()=>{});
  clearInterval(music._fade);
  music._fade=setInterval(()=>{
    if(!music) return clearInterval(music._fade);
    const t=Math.min(MUSIC_VOL, music.volume+0.02);
    music.volume=t;
    if(t>=MUSIC_VOL || music.paused) clearInterval(music._fade);
  },80);
}
function musicOff(){ musicWanted=false; if(music){ clearInterval(music._fade); music.pause(); } }

const api = {init, resume, play, ambience, fire, cry, stopAll, musicOn, musicOff, setMuted, isMuted, get ready(){return started;}};
root.LCAudio = api;
})(typeof window!=='undefined'?window:this);
