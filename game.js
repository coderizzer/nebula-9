'use strict';

const P = {
  void:   '#06070f',
  cold:   '#e8f0f7',
  steel:  '#8fa8c4',
  blue:   '#3a7bd5',
  blueGl: '#6fa3ff',
  ember:  '#c84b31',
  emberGl:'#f07050',
  gold:   '#c9a84c',
  goldGl: '#f0d080',
  // enemy palette
  scoutCol:  '#3ecfb2', scoutGl:  '#7ffce5',  // teal  — fast, glass
  fightCol:  '#c0623a', fightGl:  '#f0825a',  // amber — balanced
  tankCol:   '#6a72c0', tankGl:   '#9aa4ff',  // indigo — armored
  eliteCol:  '#b044c8', eliteGl:  '#e066ff',  // violet — dangerous
  white: '#ffffff',
};

/* ─── config ──────────────────────────────────────────────────────────── */
const W = 480, H = 720;
const CFG = {
  speed:320, fireDelay:0.16, bulletSpeed:640,
  lives:3, invuln:2,
};

/* ─── enemy archetypes ────────────────────────────────────────────────── */
const EDEF = {
  scout: {
    hp:1, r:11, score:150,
    col:P.scoutCol, glowCol:P.scoutGl,
    // movement & fire handled in updateMovement
    fireRate:0, bulletType:'none',
    warmCol:'#3ecfb2',
  },
  fighter: {
    hp:3, r:15, score:300,
    col:P.fightCol, glowCol:P.fightGl,
    fireRate:2.1, bulletType:'aimed',
    warmCol:'#c0623a',
  },
  tank: {
    hp:7, r:22, score:600,
    col:P.tankCol, glowCol:P.tankGl,
    fireRate:1.9, bulletType:'spread',
    warmCol:'#6a72c0',
  },
  elite: {
    hp:5, r:18, score:1200,
    col:P.eliteCol, glowCol:P.eliteGl,
    fireRate:1.5, bulletType:'burst',
    warmCol:'#b044c8',
  },
};

/* ─── wave composition ────────────────────────────────────────────────── */
// preset waves 1-5 for a taught difficulty ramp; 6+ uses budget system
const PRESET_WAVES = [
  null, // 1-indexed
  [{type:'scout',n:6}],                                            // W1 learn move+shoot
  [{type:'scout',n:5},{type:'fighter',n:2}],                       // W2 first return fire
  [{type:'scout',n:4},{type:'fighter',n:5}],                       // W3 volume
  [{type:'scout',n:3},{type:'fighter',n:4},{type:'tank',n:2}],     // W4 first tanks
  [{type:'scout',n:2},{type:'fighter',n:5},{type:'tank',n:3}],     // W5 attrition (milestone)
  [{type:'scout',n:3},{type:'fighter',n:4},{type:'tank',n:2},{type:'elite',n:1}], // W6 first elite
];
const WAVE_TAG={1:'WARM UP  -  MOVE & SHOOT',2:'FIGHTERS RETURN FIRE',3:'HOLD THE LINE',4:'ARMORED TANKS INBOUND',
  5:'MILESTONE WAVE  -  BONUS LIFE AT CLEAR',6:'ELITE DETECTED'};
const COMBO_WIN=2.6, MAX_MULT=8;
const MILESTONES=[5000,10000,25000,50000,100000,250000];

const COST = {scout:1, fighter:2, tank:3, elite:5};

function buildWaveQueue(wave){
  if(wave<=6){
    const q=[];
    for(const {type,n} of PRESET_WAVES[wave])
      for(let i=0;i<n;i++) q.push(type);
    // shuffle
    for(let i=q.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [q[i],q[j]]=[q[j],q[i]];
    }
    return q;
  }
  // budget system W6+
  let budget = Math.min(40, 10 + wave*3);
  const q=[];
  const types=['elite','tank','fighter','scout'];
  while(budget>0){
    // pick highest affordable type with weighted probability
    const affordable=types.filter(t=>COST[t]<=budget);
    if(!affordable.length) break;
    const r=Math.random();
    let pick;
    if(wave>=8 && r<0.18 && COST.elite<=budget) pick='elite';
    else if(r<0.30 && COST.tank<=budget)         pick='tank';
    else if(r<0.65 && COST.fighter<=budget)       pick='fighter';
    else                                           pick='scout';
    if(!affordable.includes(pick)) pick=affordable[affordable.length-1];
    q.push(pick);
    budget-=COST[pick];
  }
  // shuffle
  for(let i=q.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [q[i],q[j]]=[q[j],q[i]];
  }
  return q;
}

const FONT = '"SF Mono","Fira Mono","Consolas",ui-monospace,monospace';

/* ─── utils ───────────────────────────────────────────────────────────── */
const FX={q:2,glow:1,dpr:2,pCap:500,sCap:350,
  set(q){ this.q=q; Object.assign(this,[{glow:0,dpr:1,pCap:160,sCap:100},{glow:0.5,dpr:1.5,pCap:300,sCap:200},{glow:1,dpr:2,pCap:500,sCap:350}][q]); resize(); }};
const POOL={p:[],s:[]};
function compact(a,pool){            // in-place removal of dead objects; recycles pooled ones
  let j=0; for(let i=0;i<a.length;i++){ const o=a[i]; if(!o.dead) a[j++]=o; else if(pool&&pool.length<600) pool.push(o); }
  a.length=j;
}
const LIVE=document.getElementById('live');
const announce=m=>{ if(LIVE) LIVE.textContent=m; };          // screen-reader status line
const RM=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
const rand     = (a,b) => a+Math.random()*(b-a);
const clamp    = (v,a,b) => Math.min(b,Math.max(a,v));
const hit      = (a,b) => { const dx=a.x-b.x,dy=a.y-b.y,r=a.r+b.r; return dx*dx+dy*dy<r*r; };
const lerp     = (a,b,t) => a+(b-a)*t;
const expDecay = (a,b,d,dt) => b+(a-b)*Math.exp(-d*dt);

function txt(g,s,x,y,sz,col=P.cold,align='center',weight='600'){
  g.font=`${weight} ${sz}px ${FONT}`;
  g.textAlign=align; g.textBaseline='alphabetic';
  g.fillStyle=col; g.fillText(s,x,y);
}
function withGlow(g,glowCol,blur,fn){
  if(!FX.glow){ fn(); return; }
  g.save(); g.shadowColor=glowCol; g.shadowBlur=blur*FX.glow; fn(); g.shadowBlur=0; g.restore();
}

/* ─── input ───────────────────────────────────────────────────────────── */
const Input=(()=>{
  const down=new Set(),pressed=new Set(), T={x:0,y:0,fire:false,on:false};
  const PREVENT=['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
  addEventListener('keydown',e=>{
    T.on=false;
    if(PREVENT.includes(e.code))e.preventDefault();
    if(!down.has(e.code))pressed.add(e.code);
    down.add(e.code);
  });
  addEventListener('keyup',e=>down.delete(e.code));
  addEventListener('blur',()=>down.clear());
  return{ held:(...c)=>c.some(k=>down.has(k))||(T.fire&&c.includes('Space')), touch:T, hit:(...c)=>c.some(k=>pressed.has(k)), endStep:()=>pressed.clear() };
})();

/* ─── audio ───────────────────────────────────────────────────────────── */
const Sfx=(()=>{
  let ctx,master,sfxBus,musBus,duck,modeG,lpf,delayS,delayM,noiseBuf,notice=null;
  const S={master:0.7,music:true,sfx:true};
  try{Object.assign(S,JSON.parse(localStorage.getItem('n9-audio')||'{}'));}catch(e){}
  const save=()=>{try{localStorage.setItem('n9-audio',JSON.stringify(S));}catch(e){}};
  const last={}, jit=(v,a=0.05)=>v*(1+(Math.random()*2-1)*a);
  const ok=(k,gap=0)=>{ if(!ctx||!S.sfx||S.master<=0)return false; const n=ctx.currentTime; if(last[k]&&n-last[k]<gap)return false; last[k]=n; return true; };
  const say=s=>{notice={s,t:performance.now()};};
  const apply=()=>{ if(!ctx)return; const n=ctx.currentTime;
    master.gain.setTargetAtTime(S.master,n,0.03); sfxBus.gain.setTargetAtTime(S.sfx?1:0,n,0.03); musBus.gain.setTargetAtTime(S.music?1:0,n,0.1); };
  const mkDelay=(dest,time,fb,wet)=>{
    const inp=ctx.createGain(),d=ctx.createDelay(1),f=ctx.createGain(),lp=ctx.createBiquadFilter(),w=ctx.createGain();
    d.delayTime.value=time; f.gain.value=fb; lp.frequency.value=2400; w.gain.value=wet;
    inp.connect(d); d.connect(lp); lp.connect(f); f.connect(d); lp.connect(w); w.connect(dest); return inp;
  };
  const tone=(f,d,type='square',vol=0.05,slide=0,o={})=>{
    const t=ctx.currentTime+(o.at||0),osc=ctx.createOscillator(),g=ctx.createGain();
    osc.type=type; osc.frequency.setValueAtTime(f,t);
    if(slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30,f+slide),t+d);
    g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(vol,t+0.004); g.gain.exponentialRampToValueAtTime(0.0001,t+d);
    osc.connect(g); let n=g;
    if(o.lp){const fl=ctx.createBiquadFilter(); fl.frequency.value=o.lp; g.connect(fl); n=fl;}
    n.connect(sfxBus);
    if(o.send){const s=ctx.createGain(); s.gain.value=o.send; n.connect(s).connect(delayS);}
    osc.start(t); osc.stop(t+d+0.03);
  };
  const noise=(d,ft,f0,f1,vol,at=0,dest)=>{
    const t=ctx.currentTime+at,src=ctx.createBufferSource(),fl=ctx.createBiquadFilter(),g=ctx.createGain();
    src.buffer=noiseBuf; fl.type=ft; fl.frequency.setValueAtTime(f0,t); fl.frequency.exponentialRampToValueAtTime(f1,t+d);
    g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(0.0001,t+d);
    src.connect(fl).connect(g).connect(dest||sfxBus); src.start(t,Math.random()*0.5); src.stop(t+d+0.03);
  };
  const dip=d=>{ const n=ctx.currentTime; duck.gain.cancelScheduledValues(n); duck.gain.setTargetAtTime(0.35,n,0.02); duck.gain.setTargetAtTime(1,n+d,0.25); };

  /* generative music: pad + bass + arp + soft drums, intensity follows the wave */
  const M={sd:60/98/4,step:0,next:0,inten:0,tgt:0.2,cur:[45,0],bass:[0,6,10],arp:[0,1,2,1],pi:0,prog:null};
  const PROGS=[[[45,0],[41,1],[48,1],[43,1]],[[45,0],[43,1],[41,1],[43,1]],[[45,0],[48,1],[43,1],[40,0]]];
  const mf=m=>440*Math.pow(2,(m-69)/12), pick=a=>a[Math.floor(Math.random()*a.length)];
  const mv=(type,f,t,dur,vol,o={})=>{
    const osc=ctx.createOscillator(),g=ctx.createGain(),r=o.r||0.1; osc.type=type; osc.frequency.value=f; if(o.det)osc.detune.value=o.det;
    g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(vol,t+(o.a||0.01)); g.gain.setTargetAtTime(0.0001,t+dur,r);
    let n=osc; if(o.lp){const fl=ctx.createBiquadFilter(); fl.frequency.value=o.lp; osc.connect(fl); n=fl;}
    n.connect(g); g.connect(lpf);
    if(o.send){const s=ctx.createGain(); s.gain.value=o.send; g.connect(s).connect(delayM);}
    osc.start(t); osc.stop(t+dur+r*6);
  };
  const playStep=(s,t)=>{
    const I=M.inten, st=s%16, sd=M.sd;
    if(s%32===0){
      const ci=(s/32)%4;
      if(ci===0){ let p; do p=pick(PROGS); while(p===M.prog&&PROGS.length>1); M.prog=p; }
      M.cur=M.prog[ci]; const [r,mn]=M.cur, third=mn?4:3;
      for(const iv of [12,12+third,19]) for(const dt of [-7,7]) mv('sawtooth',mf(r+iv),t,32*sd,0.011,{det:dt,a:1.3,r:1.0,lp:850});
    }
    if(st===0){ M.bass=pick([[0,6,10],[0,3,8,11],[0,6,8,14],[0,4,8,12]]); M.arp=pick([[0,1,2,1],[0,2,4,2],[3,2,1,0],[0,3,2,4]]); }
    const [r,mn]=M.cur;
    if(I>0.12&&M.bass.includes(st)) mv('sawtooth',mf(r+pick([0,0,0,7,12])),t,sd*1.6,0.045,{lp:380,r:0.06});
    if(I>0.3&&Math.floor(s/16)%8!==7&&st%(I>0.7?1:2)===0&&Math.random()>(1-I)*0.45){
      const tones=[0,mn?3:4,7,12,12+(mn?3:4),19], n=tones[M.arp[(st>>1)%M.arp.length]%6];
      mv('triangle',mf(r+24+n),t,sd*1.3,0.02+I*0.012,{lp:2600,send:0.35,r:0.08});
    }
    if(I>0.45&&(st%8===0||(st===14&&Math.random()<0.3))){
      const o=ctx.createOscillator(),g=ctx.createGain(); o.frequency.setValueAtTime(115,t); o.frequency.exponentialRampToValueAtTime(42,t+0.12);
      g.gain.setValueAtTime(0.11,t); g.gain.exponentialRampToValueAtTime(0.0001,t+0.16); o.connect(g).connect(lpf); o.start(t); o.stop(t+0.2);
    }
    if(I>0.25&&(st%4===2||(I>0.75&&st%2===0))) noise(0.04,'highpass',7000,9000,0.014+I*0.01,t-ctx.currentTime,lpf);
  };
  const ui={confirm:[520,780],back:[520,330],tick:[900,900],pause:[330,220],resume:[220,330]};

  const api={
    init(){
      try{
        if(ctx){ctx.resume();return;}
        ctx=new(window.AudioContext||window.webkitAudioContext)();
        const comp=ctx.createDynamicsCompressor(); comp.threshold.value=-14; comp.ratio.value=4;
        master=ctx.createGain(); sfxBus=ctx.createGain(); musBus=ctx.createGain(); duck=ctx.createGain(); modeG=ctx.createGain(); lpf=ctx.createBiquadFilter();
        lpf.frequency.value=3500; modeG.gain.value=1;
        master.connect(comp).connect(ctx.destination); sfxBus.connect(master);
        lpf.connect(modeG); modeG.connect(duck); duck.connect(musBus); musBus.connect(master);
        delayS=mkDelay(sfxBus,0.17,0.3,0.5); delayM=mkDelay(lpf,0.23,0.38,0.5);
        noiseBuf=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate); const d=noiseBuf.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
        M.next=ctx.currentTime+0.1; apply();
        setInterval(()=>{ try{
          if(ctx.state!=='running')return;
          if(M.next<ctx.currentTime-0.3) M.next=ctx.currentTime+0.05;
          while(M.next<ctx.currentTime+0.25){ playStep(M.step++,M.next); M.next+=M.sd; M.inten+=(M.tgt-M.inten)*0.03; }
        }catch(e){} },50);
        document.addEventListener('visibilitychange',()=>{ document.hidden?ctx.suspend():ctx.resume(); });
      }catch(e){}
    },
    mode(m,wave=1){
      if(!ctx)return; const n=ctx.currentTime;
      M.tgt=m==='play'?Math.min(1,(wave-1)/9+0.1):m==='menu'?0.2:0;
      lpf.frequency.setTargetAtTime(m==='pause'?450:m==='menu'?3500:16000,n,0.15);
      modeG.gain.setTargetAtTime(m==='over'?0:m==='pause'?0.55:1,n,m==='over'?0.9:0.15);
    },
    toggleMusic(){S.music=!S.music;apply();save();say('MUSIC '+(S.music?'ON':'OFF'));},
    toggleSfx(){S.sfx=!S.sfx;apply();save();say('SFX '+(S.sfx?'ON':'OFF'));if(S.sfx)this.ui('tick');},
    vol(d){S.master=clamp(Math.round((S.master+d)*10)/10,0,1);apply();save();say('VOLUME '+Math.round(S.master*100)+'%');this.ui('tick');},
    get music(){return S.music;}, get sfx(){return S.sfx;}, get volume(){return Math.round(S.master*100);},
    drawNotice(g){ if(!notice)return; const a=1-(performance.now()-notice.t)/1400; if(a<=0){notice=null;return;}
      g.globalAlpha=Math.min(1,a*2.5); txt(g,notice.s,W/2,66,11,P.cold,'center','600'); g.globalAlpha=1; },

    ui(k){ if(!ok('ui',0.03))return; const [a,b]=ui[k]||ui.tick; tone(a,0.07,'square',0.025,0,{lp:2800}); if(b!==a) tone(b,0.1,'square',0.025,0,{at:0.07,lp:2800}); },
    shoot(){ if(!ok('shoot',0.045))return; tone(jit(820,0.06),0.07,'square',0.018,-460,{lp:3500}); tone(jit(410,0.06),0.06,'sawtooth',0.008,-200); },
    hitEnemy(){ if(!ok('hit',0.04))return; noise(0.04,'bandpass',3000,1500,0.05); tone(jit(240,0.12),0.05,'triangle',0.04); },
    boom(){ if(!ok('boom',0.05))return; noise(0.4,'lowpass',2200,150,0.16); tone(jit(120,0.08),0.35,'sine',0.14,-80); },
    boomBig(){ if(!ok('boomBig',0.1))return; noise(0.7,'lowpass',2600,100,0.22); noise(0.5,'lowpass',1400,90,0.12,0.09); tone(jit(80,0.05),0.6,'sine',0.2,-45); },
    hurt(){ if(!ok('hurt',0.1))return; noise(0.5,'lowpass',3000,200,0.2); tone(300,0.45,'sawtooth',0.09,-230,{lp:1800}); tone(150,0.5,'square',0.05,-100); dip(0.5); },
    pick(){ if(!ok('pick'))return; [520,780,1040].forEach((f,i)=>tone(f,i<2?0.09:0.18,'triangle',0.05,0,{at:i*0.07,send:0.3})); },
    heal(){ if(!ok('heal'))return; tone(440,0.22,'sine',0.06,220,{send:0.3}); tone(880,0.3,'sine',0.045,0,{at:0.13,send:0.35}); },
    shieldUp(){ if(!ok('shield'))return; tone(300,0.4,'sine',0.06,900,{send:0.35}); tone(1320,0.35,'triangle',0.035,0,{at:0.25,send:0.4}); },
    shieldBreak(){ if(!ok('sbreak'))return; tone(520,0.3,'sawtooth',0.06,-400,{lp:2000}); tone(260,0.2,'triangle',0.05,0,{at:0.06}); noise(0.25,'highpass',5000,1500,0.08); },
    expire(){ if(!ok('expire'))return; tone(440,0.18,'triangle',0.04,-220); tone(300,0.22,'triangle',0.035,-120,{at:0.11}); },
    wave(){ if(!ok('wave'))return; tone(160,0.5,'sawtooth',0.04,600,{lp:1400,send:0.2}); [392,523,659].forEach((f,i)=>tone(f,0.2,'triangle',0.045,0,{at:0.12+i*0.12,send:0.3})); dip(0.6); },
    clear(){ if(!ok('clear'))return; [660,880,1320].forEach((f,i)=>tone(f,0.16,'sine',0.045,0,{at:i*0.08,send:0.3})); },
    milestone(){ if(!ok('ms'))return; [523,659,784,1047].forEach(f=>tone(f,0.55,'triangle',0.035,0,{send:0.4})); },
    elite(){ if(!ok('elite'))return; tone(180,0.12,'sawtooth',0.04,-40); tone(360,0.1,'triangle',0.03,0,{at:0.08}); },
    gameOver(){ if(!ctx)return; this.mode('over');
      if(!S.sfx)return; tone(220,1.4,'sawtooth',0.07,-170,{lp:900,send:0.3}); tone(165,1.6,'sawtooth',0.05,-125,{lp:700}); noise(0.9,'lowpass',900,60,0.14); tone(55,1.2,'sine',0.12,-15); },
  };
  for(const k of Object.keys(api)){ const d=Object.getOwnPropertyDescriptor(api,k);
    if(typeof d.value==='function'){ const f=d.value; api[k]=function(...a){ try{ return f.apply(api,a); }catch(e){} }; } }
  return api;
})();

/* ─── parallax starfield ──────────────────────────────────────────────── */
class Starfield{
  constructor(){
    this.layers=[
      {stars:Array.from({length:80},()=>this.mk()),speed:28, size:0.9,alpha:0.22},
      {stars:Array.from({length:45},()=>this.mk()),speed:70, size:1.5,alpha:0.45},
      {stars:Array.from({length:18},()=>this.mk()),speed:160,size:2.2,alpha:0.75},
    ];
  }
  mk(){return{x:rand(0,W),y:rand(0,H),b:rand(0.5,1.0)};}
  update(dt,mul=1){
    for(const l of this.layers)
      for(const s of l.stars){
        s.y+=l.speed*mul*dt;
        if(s.y>H+4){s.y=-4;s.x=rand(0,W);s.b=rand(0.5,1.0);}
      }
  }
  draw(g){
    for(const l of this.layers){
      const streak=l.speed>100;
      for(const s of l.stars){
        g.globalAlpha=l.alpha*s.b; g.fillStyle=P.cold;
        if(streak)g.fillRect(s.x-l.size*0.3,s.y-l.size*3,l.size*0.6,l.size*6);
        else      g.fillRect(s.x,s.y,l.size*s.b,l.size*s.b);
      }
    }
    g.globalAlpha=1;
  }
}

/* ─── muzzle flash ────────────────────────────────────────────────────── */
class MuzzleFlash{
  constructor(x,y){Object.assign(this,{x,y,life:0.07,dead:false});}
  update(dt){this.life-=dt;if(this.life<=0)this.dead=true;}
  draw(g){
    const a=this.life/0.07,r=7*a;
    withGlow(g,P.blueGl,16*a,()=>{
      g.globalAlpha=a*0.9; g.fillStyle=P.white;
      g.beginPath();g.arc(this.x,this.y,r*0.45,0,7);g.fill();
    });
    g.globalAlpha=a*0.6; g.strokeStyle=P.blueGl; g.lineWidth=1.2;
    g.beginPath();g.moveTo(this.x,this.y-r);g.lineTo(this.x,this.y+r);g.stroke();
    g.beginPath();g.moveTo(this.x-r*0.6,this.y);g.lineTo(this.x+r*0.6,this.y);g.stroke();
    g.globalAlpha=1;
  }
}

/* ─── bullet ──────────────────────────────────────────────────────────── */
const TRAIL_LEN=8;
// btype: 'player' | 'aimed' | 'spread' | 'burst'
class Bullet{
  constructor(x,y,vx,vy,btype){
    const friendly=btype==='player';
    const r=friendly?3:btype==='spread'?5:btype==='burst'?3.5:4;
    Object.assign(this,{x,y,vx,vy,friendly,btype,r,dead:false});
    this.trail=[];
    for(let i=0;i<TRAIL_LEN;i++)this.trail.push({x,y});
    this._ti=0;
  }
  update(dt){
    const tr=this.trail[this._ti]; tr.x=this.x; tr.y=this.y;
    this._ti=(this._ti+1)%TRAIL_LEN;
    this.x+=this.vx*dt; this.y+=this.vy*dt;
    if(this.y<-30||this.y>H+30||this.x<-20||this.x>W+20)this.dead=true;
  }
  draw(g){
    const glowCol=this.friendly?P.blueGl:
                  this.btype==='spread'?P.tankGl:
                  this.btype==='burst' ?P.eliteGl:P.emberGl;
    const bodyCol=this.friendly?P.blueGl:
                  this.btype==='spread'?'#8090e8':
                  this.btype==='burst' ?'#cc77ff':P.emberGl;
    // trail
    for(let i=0;i<TRAIL_LEN;i++){
      const age=((this._ti-i-1+TRAIL_LEN)%TRAIL_LEN)/TRAIL_LEN;
      const idx=(this._ti-1-i+TRAIL_LEN)%TRAIL_LEN;
      const tp=this.trail[idx];
      const a=(1-age)*0.32; if(a<0.01)continue;
      g.globalAlpha=a; g.fillStyle=glowCol;
      const sr=this.friendly?lerp(1.4,0.3,age):lerp(2.2,0.4,age);
      g.beginPath();g.arc(tp.x,tp.y,sr,0,7);g.fill();
    }
    g.globalAlpha=1;
    // body
    if(this.friendly){
      withGlow(g,P.blueGl,8,()=>{
        g.fillStyle=P.blueGl; g.beginPath(); g.ellipse(this.x,this.y,1.8,8,0,0,7); g.fill();
      });
      g.fillStyle=P.white; g.beginPath(); g.ellipse(this.x,this.y,0.8,4,0,0,7); g.fill();
    } else {
      withGlow(g,glowCol,7,()=>{
        g.fillStyle=bodyCol;
        const rx=this.btype==='spread'?3.5:this.btype==='burst'?2.8:3;
        const ry=this.btype==='spread'?4  :this.btype==='burst'?4.5:5;
        const angle=Math.atan2(this.vy,this.vx)+Math.PI/2;
        g.beginPath();g.ellipse(this.x,this.y,rx,ry,angle,0,7);g.fill();
      });
      g.fillStyle=P.white; g.beginPath(); g.ellipse(this.x,this.y,1.2,2,0,0,7); g.fill();
    }
  }
}

/* ─── particle ────────────────────────────────────────────────────────── */
class Particle{
  constructor(x,y,col){this.init(x,y,col);}
  init(x,y,col){const a=rand(0,6.2832),s=rand(50,280);this.x=x;this.y=y;this.vx=Math.cos(a)*s;this.vy=Math.sin(a)*s;this.life=rand(0.25,0.65);this.col=col;this.sz=rand(1.2,2.8);}
  get dead(){return this.life<=0;}
  update(dt){this.x+=this.vx*dt;this.y+=this.vy*dt;this.vx*=0.97;this.vy*=0.97;this.life-=dt;}
  draw(g){g.globalAlpha=Math.max(0,this.life*2.2);g.fillStyle=this.col;g.fillRect(this.x-this.sz/2,this.y-this.sz/2,this.sz,this.sz);}
}

/* ─── spark ───────────────────────────────────────────────────────────── */
class Spark{
  constructor(x,y,col){this.init(x,y,col);}
  init(x,y,col){const a=rand(0,6.2832),s=rand(120,360);this.x=x;this.y=y;this.vx=Math.cos(a)*s;this.vy=Math.sin(a)*s;this.life=rand(0.08,0.22);this.col=col;this.sz=rand(0.8,1.8);}
  get dead(){return this.life<=0;}
  update(dt){this.x+=this.vx*dt;this.y+=this.vy*dt;this.vx*=0.93;this.vy*=0.93;this.life-=dt;}
  draw(g){g.globalAlpha=Math.max(0,this.life*6);g.fillStyle=this.col;g.fillRect(this.x-this.sz/2,this.y-this.sz/2,this.sz,this.sz);}
}

/* ─── score pop ───────────────────────────────────────────────────────── */
class ScorePop{
  constructor(x,y,v){Object.assign(this,{x,y,v,life:0.9,dead:false});}
  update(dt){this.y-=28*dt;this.life-=dt;if(this.life<=0)this.dead=true;}
  draw(g){
    g.globalAlpha=Math.min(1,this.life*3);
    txt(g,'+'+this.v,this.x,this.y,11,P.goldGl);
    g.globalAlpha=1;
  }
}

/* ─── power-ups ───────────────────────────────────────────────────────── */
const PW={
  rapid: {name:'RAPID FIRE', col:'#f0d080', dur:8},
  triple:{name:'TRIPLE SHOT',col:'#7ffce5', dur:10},
  shield:{name:'SHIELD',     col:'#6fa3ff', dur:12},
  health:{name:'+1 LIFE',    col:'#6fe0a0', dur:0},
};
const MAX_LIVES=5;
function glyph(g,k,col,s){           // unit-sized icons, drawn at scale s
  g.save(); g.scale(s,s); g.strokeStyle=col; g.fillStyle=col; g.lineWidth=1.6/s*s*0.6; g.lineJoin='round';
  g.beginPath();
  if(k==='rapid'){ g.moveTo(.25,-1); g.lineTo(-.5,.15); g.lineTo(0,.15); g.lineTo(-.25,1); g.lineTo(.5,-.15); g.lineTo(0,-.15); g.closePath(); g.fill(); }
  else if(k==='triple'){ for(const a of[-.5,0,.5]){ g.moveTo(0,.8); g.lineTo(Math.sin(a)*1.1,.8-Math.cos(a)*1.7); } g.lineWidth=.3; g.stroke(); }
  else if(k==='shield'){ g.moveTo(0,-.95); g.lineTo(.8,-.6); g.lineTo(.7,.3); g.lineTo(0,.95); g.lineTo(-.7,.3); g.lineTo(-.8,-.6); g.closePath(); g.lineWidth=.26; g.stroke(); }
  else { g.rect(-.22,-.8,.44,1.6); g.rect(-.8,-.22,1.6,.44); g.fill(); }
  g.restore();
}
class Ring{
  constructor(x,y,col,max=34){Object.assign(this,{x,y,col,max,t:0,dead:false});}
  update(dt){this.t+=dt; if(this.t>0.45)this.dead=true;}
  draw(g){const k=this.t/0.45; g.globalAlpha=1-k; g.strokeStyle=this.col; g.lineWidth=2.5*(1-k)+0.5;
    g.beginPath(); g.arc(this.x,this.y,6+this.max*k,0,6.283); g.stroke(); g.globalAlpha=1;}
}
class Powerup{
  constructor(kind,x,y){Object.assign(this,{kind,x,y,r:16,t:0,dead:false,col:PW[kind].col});}
  update(dt,world){
    this.t+=dt; this.y+=72*dt;
    if(this.y>H+24){this.dead=true;return;}
    if(!world.player.dead&&hit(this,world.player)) world.collect(this);
  }
  draw(g){
    const by=this.y+Math.sin(this.t*4)*3, pulse=0.5+0.5*Math.sin(this.t*6);
    g.save(); g.translate(this.x,by);
    g.globalAlpha=0.15+0.2*pulse; g.strokeStyle=this.col; g.lineWidth=1.5;
    g.beginPath(); g.arc(0,0,17+pulse*4,0,6.283); g.stroke(); g.globalAlpha=1;
    withGlow(g,this.col,12,()=>{
      g.fillStyle='rgba(6,7,15,0.85)'; g.strokeStyle=this.col; g.lineWidth=2; g.beginPath();
      if(this.kind==='health') g.arc(0,0,12,0,6.283);
      else{ g.rotate(this.t*1.6+0.785); g.rect(-9,-9,18,18); }
      g.fill(); g.stroke();
    });
    g.rotate(this.kind==='health'?0:-(this.t*1.6+0.785));
    glyph(g,this.kind,this.col,7); g.restore();
  }
}

/* ─── player ──────────────────────────────────────────────────────────── */
class Player{
  constructor(){
    Object.assign(this,{
      x:W/2, y:H-90, vx:0, vy:0, r:12,
      cool:0, inv:CFG.invuln, dead:false,
      tilt:0, recoilY:0, recoilV:0,
      _ax:0, _ay:0, _firing:false, pw:{rapid:0,triple:0,shield:0},
    });
  }
  update(dt,world){
    const ax=clamp((Input.held('ArrowRight','KeyD')?1:0)-(Input.held('ArrowLeft','KeyA')?1:0)+Input.touch.x,-1,1);
    const ay=clamp((Input.held('ArrowDown', 'KeyS')?1:0)-(Input.held('ArrowUp',  'KeyW')?1:0)+Input.touch.y,-1,1);
    this.vx=expDecay(this.vx,ax*CFG.speed,18,dt);
    this.vy=expDecay(this.vy,ay*CFG.speed,18,dt);
    this.x=clamp(this.x+this.vx*dt,22,W-22);
    this.y=clamp(this.y+this.vy*dt,H*0.38,H-28);
    this.tilt=expDecay(this.tilt,(this.vx/CFG.speed)*0.38,14,dt);
    const om=28,ze=0.6;
    this.recoilV+=(-om*om*this.recoilY-2*ze*om*this.recoilV)*dt;
    this.recoilY+=this.recoilV*dt;
    this.recoilY=clamp(this.recoilY,-8,2);
    this.cool-=dt; this.inv=Math.max(0,this.inv-dt);
    const firing=Input.held('Space');
    if(firing&&this.cool<=0){
      this.cool=CFG.fireDelay*(this.pw.rapid>0?0.55:1);
      const lx=this.x-10,rx=this.x+10,fy=this.y-6,S=CFG.bulletSpeed;
      if(this.pw.triple>0){   // 3-way fan from the nose
        const ny=this.y-20;
        world.bullets.push(new Bullet(this.x,ny,0,-S,'player'),new Bullet(this.x,ny,-S*0.17,-S*0.985,'player'),new Bullet(this.x,ny,S*0.17,-S*0.985,'player'));
        world.flashes.push(new MuzzleFlash(this.x,ny));
      } else {
        world.bullets.push(new Bullet(lx,fy,0,-S,'player'),new Bullet(rx,fy,0,-S,'player'));
        world.flashes.push(new MuzzleFlash(lx,fy),new MuzzleFlash(rx,fy));
      }
      this.recoilV+=10; Sfx.shoot();
    }
    this._ax=ax; this._ay=ay; this._firing=firing;
  }
  draw(g,t){
    if(this.inv>0&&Math.floor(t*10)%2)return;
    const flicker=0.7+Math.sin(t*55)*0.3;
    const thrustBoost=this._ay<0?1.4:1.0;
    g.save(); g.translate(this.x,this.y+this.recoilY); g.rotate(this.tilt);
    const fl=(14+flicker*8)*thrustBoost;
    const grad=g.createLinearGradient(0,8,0,8+fl);
    grad.addColorStop(0,'rgba(200,110,40,0.85)');
    grad.addColorStop(0.5,'rgba(200,80,20,0.4)');
    grad.addColorStop(1,'rgba(160,50,10,0)');
    g.fillStyle=grad; g.beginPath(); g.moveTo(-5,10); g.lineTo(0,8+fl); g.lineTo(5,10); g.fill();
    g.fillStyle='rgba(255,220,140,0.9)'; g.beginPath(); g.moveTo(-2.5,10); g.lineTo(0,10+fl*0.45); g.lineTo(2.5,10); g.fill();
    withGlow(g,P.blueGl,12,()=>{
      g.fillStyle=P.blue; g.beginPath();
      g.moveTo(0,-22); g.lineTo(13,10); g.lineTo(6,6); g.lineTo(0,9); g.lineTo(-6,6); g.lineTo(-13,10);
      g.closePath(); g.fill();
    });
    g.fillStyle='rgba(200,230,255,0.55)'; g.beginPath(); g.moveTo(0,-12); g.lineTo(3,0); g.lineTo(-3,0); g.closePath(); g.fill();
    g.strokeStyle=P.blueGl; g.lineWidth=0.8; g.globalAlpha=0.6;
    g.beginPath(); g.moveTo(6,6); g.lineTo(12,9); g.stroke();
    g.beginPath(); g.moveTo(-6,6); g.lineTo(-12,9); g.stroke();
    g.globalAlpha=1; g.restore();
  }
}

/* ─── enemy ───────────────────────────────────────────────────────────── */
class Enemy{
  constructor(type,x,wave){
    const d=EDEF[type];
    Object.assign(this,d,{
      type,x,y:-38,t:rand(0,6.2832),
      cool:d.fireRate?rand(0.4,d.fireRate):99,
      burstLeft:0, burstCool:0,
      flash:0, dead:false, hp:d.hp, maxHp:d.hp,
      scaleX:1, scaleY:1,
      wave,
      // movement state
      phase:'enter',  // enter | main | retreat (elite only)
      dashDir:1,      // scout dash direction
      dashCool:rand(0.5,1.5),
      strafeDir:1,    // elite strafe
    });
    // wave scaling — modest to keep fairness
    this.hp   = Math.ceil(d.hp   * (1 + (wave-1)*0.08));
    this.maxHp= this.hp;
    this.baseSpeed = d.speed ? d.speed : (type==='scout'?145:type==='fighter'?80:type==='tank'?50:100);
    this.baseSpeed *= Math.min(1.8, 1 + (wave-1)*0.04);
  }

  get speed(){ return this.baseSpeed; }

  updateMovement(dt){
    const t=this.t;
    switch(this.type){
      case 'scout': {
        // fast entry, then lateral dash sweep
        if(this.phase==='enter'){
          this.y+=this.speed*1.6*dt;
          if(this.y>H*0.25) this.phase='main';
        } else {
          this.y+=this.speed*0.35*dt; // slow drift down
          this.dashCool-=dt;
          if(this.dashCool<=0){
            this.dashDir*=-1;
            this.dashCool=rand(0.4,1.0);
          }
          this.x+=this.dashDir*this.speed*1.9*dt;
          this.x=clamp(this.x,18,W-18);
          // exit if too low
          if(this.y>H*0.78) this.y+=this.speed*2*dt;
        }
        break;
      }
      case 'fighter': {
        // slow sinusoidal weave, steady descent
        this.y+=this.speed*dt;
        this.x+=Math.sin(t*1.6)*this.speed*0.65*dt;
        this.x=clamp(this.x,20,W-20);
        break;
      }
      case 'tank': {
        // straight deliberate march, tiny wobble
        this.y+=this.speed*dt;
        this.x+=Math.sin(t*0.8)*18*dt;
        this.x=clamp(this.x,28,W-28);
        break;
      }
      case 'elite': {
        if(this.phase==='enter'){
          // diagonal entry from top edge
          this.y+=this.speed*1.1*dt;
          this.x+=this.strafeDir*this.speed*0.7*dt;
          this.x=clamp(this.x,28,W-28);
          if(this.y>H*0.22){ this.phase='main'; this.strafeDir*=-1; }
        } else {
          // strafe across screen horizontally, slow descent
          this.y+=this.speed*0.18*dt;
          this.x+=this.strafeDir*this.speed*1.05*dt;
          if(this.x<28||this.x>W-28){ this.strafeDir*=-1; this.x=clamp(this.x,28,W-28); }
          // retreat if too low
          if(this.y>H*0.52){
            this.y-=this.speed*0.9*dt;
          }
        }
        break;
      }
    }
    if(this.y>H+60) this.dead=true;
  }

  fireBullets(world){
    const ebs=world.enemyBullets;
    const pl=world.player;
    const dx=pl.x-this.x, dy=pl.y-this.y, l=Math.hypot(dx,dy)||1;
    const spd=220+(this.wave-1)*4;

    switch(this.bulletType){
      case 'aimed':
        ebs.push(new Bullet(this.x,this.y+this.r, dx/l*spd, dy/l*spd,'aimed'));
        break;
      case 'spread': {
        // fan of 3 bullets
        const base=Math.atan2(dy,dx);
        for(const ang of [-0.28,0,0.28])
          ebs.push(new Bullet(this.x,this.y+this.r, Math.cos(base+ang)*(spd*0.85), Math.sin(base+ang)*(spd*0.85),'spread'));
        break;
      }
      case 'burst': {
        // schedule 2 rapid shots
        this.burstLeft=2; this.burstCool=0;
        break;
      }
    }
  }

  updateFire(dt,world){
    if(this.bulletType==='none') return;
    if(this.y<0||this.y>H*0.7||world.player.dead) return;

    // burst shots
    if(this.burstLeft>0){
      this.burstCool-=dt;
      if(this.burstCool<=0){
        const pl=world.player;
        const dx=pl.x-this.x,dy=pl.y-this.y,l=Math.hypot(dx,dy)||1;
        const spd=260+(this.wave-1)*5;
        world.enemyBullets.push(new Bullet(this.x,this.y+this.r,dx/l*spd,dy/l*spd,'burst'));
        this.burstLeft--;
        this.burstCool=0.14;
        if(this.burstLeft===0) Sfx.elite();
      }
      return;
    }

    this.cool-=dt;
    if(this.cool<=0){
      this.cool=this.fireRate*(0.85+Math.random()*0.3)*Math.max(1,1.6-this.wave*0.15); // calmer fire early // ±15% jitter
      this.fireBullets(world);
    }
  }

  hitReaction(){ this.scaleX=1.35; this.scaleY=0.75; }

  update(dt,world){
    this.t+=dt;
    this.flash=Math.max(0,this.flash-dt);
    this.scaleX=expDecay(this.scaleX,1,22,dt);
    this.scaleY=expDecay(this.scaleY,1,22,dt);
    this.updateMovement(dt);
    this.updateFire(dt,world);
  }

  draw(g){
    g.save(); g.translate(this.x,this.y); g.scale(this.scaleX,this.scaleY);
    const fl=this.flash>0;
    const col=fl?P.white:this.col;
    const gc =fl?P.white:this.glowCol;

    withGlow(g,gc,fl?26:11,()=>{
      g.fillStyle=col;
      this._drawSilhouette(g,fl);
    });

    // hp bar for enemies with hp>1 (shown when not flashing and hp<max)
    if(!fl&&this.maxHp>1&&this.hp<this.maxHp){
      const bw=this.r*2.2, bh=2.5, bx=-bw/2, by=this.r+7;
      g.fillStyle='rgba(0,0,0,0.5)'; g.fillRect(bx,by,bw,bh);
      g.fillStyle=this.glowCol;
      g.fillRect(bx,by,bw*(this.hp/this.maxHp),bh);
    }

    g.restore();
  }

  _drawSilhouette(g,fl){
    const r=this.r;
    switch(this.type){
      case 'scout': {
        // sleek dart: needle-thin fuselage, two swept fins
        g.beginPath();
        g.moveTo(0,-r);          // nose
        g.lineTo(r*0.22,r*0.2);  // right fuselage
        g.lineTo(r*0.9,r*0.85);  // right fin tip
        g.lineTo(r*0.3,r*0.55);  // right fin root
        g.lineTo(0,r*0.6);       // tail center
        g.lineTo(-r*0.3,r*0.55);
        g.lineTo(-r*0.9,r*0.85);
        g.lineTo(-r*0.22,r*0.2);
        g.closePath(); g.fill();
        if(!fl){
          // cockpit slit
          g.fillStyle='rgba(0,0,0,0.5)';
          g.beginPath(); g.ellipse(0,-r*0.28,r*0.1,r*0.22,0,0,7); g.fill();
        }
        break;
      }
      case 'fighter': {
        // X-cross: 4-pointed star with a solid center disc
        const arm=r*0.55;
        for(let i=0;i<4;i++){
          const a=i*Math.PI/2-Math.PI/4;
          const ax=Math.cos(a), ay=Math.sin(a);
          const bx=Math.cos(a+Math.PI/4)*r, by=Math.sin(a+Math.PI/4)*r;
          const cx=Math.cos(a-Math.PI/4)*r, cy=Math.sin(a-Math.PI/4)*r;
          g.beginPath();
          g.moveTo(ax*arm*0.5, ay*arm*0.5);
          g.lineTo(bx*0.52,by*0.52);
          g.lineTo(ax*r,ay*r);
          g.lineTo(cx*0.52,cy*0.52);
          g.closePath(); g.fill();
        }
        // center cap
        g.beginPath(); g.arc(0,0,r*0.38,0,7); g.fill();
        if(!fl){
          g.fillStyle='rgba(0,0,0,0.4)';
          g.beginPath(); g.arc(0,0,r*0.18,0,7); g.fill();
        }
        break;
      }
      case 'tank': {
        // wide armored wedge with two outboard engine pods
        g.beginPath();
        g.moveTo(0,-r*0.5);        // top center
        g.lineTo(r*0.9,-r*0.15);   // top-right shoulder
        g.lineTo(r,r*0.35);        // right side
        g.lineTo(r*0.55,r*0.75);   // right-bottom
        g.lineTo(0,r*0.55);        // bottom center
        g.lineTo(-r*0.55,r*0.75);
        g.lineTo(-r,r*0.35);
        g.lineTo(-r*0.9,-r*0.15);
        g.closePath(); g.fill();
        // left pod
        g.beginPath(); g.ellipse(-r*0.78,r*0.1,r*0.22,r*0.42,0,0,7); g.fill();
        // right pod
        g.beginPath(); g.ellipse(r*0.78,r*0.1,r*0.22,r*0.42,0,0,7); g.fill();
        if(!fl){
          g.fillStyle='rgba(0,0,0,0.38)';
          // armored plate inset
          g.beginPath();
          g.moveTo(0,-r*0.22); g.lineTo(r*0.5,r*0.1); g.lineTo(r*0.35,r*0.5);
          g.lineTo(0,r*0.32); g.lineTo(-r*0.35,r*0.5); g.lineTo(-r*0.5,r*0.1);
          g.closePath(); g.fill();
        }
        break;
      }
      case 'elite': {
        // asymmetric predator: swept forward-angled wing, trailing spike
        g.beginPath();
        g.moveTo(0,-r);            // nose
        g.lineTo(r*0.55,-r*0.3);   // right shoulder
        g.lineTo(r*1.0,r*0.25);    // right wingtip (wide)
        g.lineTo(r*0.4,r*0.55);    // right rear
        g.lineTo(r*0.15,r);        // trailing spike right
        g.lineTo(0,r*0.65);        // center tail
        g.lineTo(-r*0.15,r);       // trailing spike left (subtle asymmetry)
        g.lineTo(-r*0.5,r*0.45);
        g.lineTo(-r*0.85,r*0.15);  // left wingtip (slightly shorter)
        g.lineTo(-r*0.45,-r*0.38);
        g.closePath(); g.fill();
        if(!fl){
          // cockpit shard
          g.fillStyle='rgba(200,100,255,0.35)';
          g.beginPath();
          g.moveTo(0,-r*0.55); g.lineTo(r*0.22,-r*0.1); g.lineTo(0,r*0.08); g.lineTo(-r*0.18,-r*0.12);
          g.closePath(); g.fill();
          // spine accent
          g.strokeStyle=this.glowCol; g.lineWidth=0.9; g.globalAlpha=0.5;
          g.beginPath(); g.moveTo(0,-r*0.85); g.lineTo(0,r*0.55); g.stroke();
          g.globalAlpha=1;
        }
        break;
      }
    }
  }
}

/* ─── world ───────────────────────────────────────────────────────────── */
class World{
  constructor(){
    Object.assign(this,{
      player:new Player(),
      bullets:[], enemyBullets:[], enemies:[], particles:[], sparks:[], flashes:[], pops:[],
      score:0, lives:CFG.lives,
      wave:0, queue:[], spawnT:0, gap:1.5,
      banner:0, bannerWave:0,
      shake:0,
      hurtAlpha:0,
      overT:0, time:0, powerups:[], sinceDrop:0, lastDrop:-99,
      combo:0, comboT:0, mult:1, bestCombo:0, flawless:true, cleared:false, ms:0, toasts:[], bannerSub:'',
    });
  }

  startWave(){
    this.wave++;
    this.queue=buildWaveQueue(this.wave);
    this.spawnT=0.8;
    this.banner=2.4; this.bannerWave=this.wave;
    this.bannerSub=WAVE_TAG[this.wave]||(this.wave%5===0?'MILESTONE WAVE  -  BONUS LIFE AT CLEAR':'HOSTILES: '+this.queue.length);
    this.cleared=false; this.flawless=true; announce('Wave '+this.wave+'. '+this.bannerSub);
    Sfx.wave(); Sfx.mode('play',this.wave);
  }

  toast(s,col=P.goldGl){
    announce(s);
    this.toasts.push({s,col,life:2.0}); if(this.toasts.length>3) this.toasts.shift();
  }

  waveCleared(){
    this.cleared=true;
    let b=200*this.wave, msg='WAVE CLEARED  +'+b;
    if(this.flawless){ b+=500; msg='FLAWLESS  +'+b; }
    this.score+=b; this.toast(msg);
    if(this.wave%5===0 && this.lives<5){ this.lives++; this.toast('BONUS LIFE',P.blueGl); setTimeout(()=>Sfx.heal(),250); }
    Sfx.clear();
  }

  updateWaves(dt){
    if(this.queue.length){
      this.spawnT-=dt;
      if(this.spawnT<=0){
        // spawn interval tightens with waves, floor at 0.28s
        this.spawnT=Math.max(0.3, 1.25-this.wave*0.07);
        const type=this.queue.pop();
        this.enemies.push(new Enemy(type,rand(38,W-38),this.wave));
      }
    } else if(!this.enemies.length){
      if(this.wave>0&&!this.cleared) this.waveCleared();
      this.gap+=dt;
      if(this.gap>1.8){ this.gap=0; this.startWave(); }
    }
  }

  burst(x,y,col,n){
    for(let i=0;i<n&&this.particles.length<FX.pCap;i++){ const o=POOL.p.pop(); if(o){o.init(x,y,col);this.particles.push(o);} else this.particles.push(new Particle(x,y,col)); }
  }
  sparkAt(x,y,col,n){
    for(let i=0;i<n&&this.sparks.length<FX.sCap;i++){ const o=POOL.s.pop(); if(o){o.init(x,y,col);this.sparks.push(o);} else this.sparks.push(new Spark(x,y,col)); }
  }

  kill(e){
    e.dead=true;
    this.combo++; this.comboT=COMBO_WIN; this.bestCombo=Math.max(this.bestCombo,this.combo);
    const nm=Math.min(MAX_MULT,1+Math.floor(this.combo/5));
    if(nm>this.mult) this.toast('x'+nm+' MULTIPLIER',P.goldGl);
    this.mult=nm;
    const pts=e.score*this.mult; this.score+=pts;
    this.pops.push(new ScorePop(e.x,e.y-e.r-8,pts));
    this.maybeDrop(e);
    while(this.ms<MILESTONES.length&&this.score>=MILESTONES[this.ms]){
      this.toast(MILESTONES[this.ms].toLocaleString()+' POINTS',P.cold); this.shake=Math.max(this.shake,5); Sfx.milestone(); this.ms++;
    }
    // explosion size / warmth by type
    const n=e.type==='tank'?28:e.type==='elite'?24:e.type==='fighter'?18:12;
    this.burst(e.x,e.y,e.warmCol,n);
    this.sparkAt(e.x,e.y,e.glowCol,e.type==='tank'?18:e.type==='elite'?16:10);
    this.shake=Math.max(this.shake,e.type==='tank'?8:e.type==='elite'?6:3.5);
    e.type==='tank'?Sfx.boomBig():Sfx.boom();
  }

  maybeDrop(e){
    this.sinceDrop++;
    if(this.time-this.lastDrop<7||this.powerups.length>=2) return;     // spacing cap
    const base={scout:.03,fighter:.07,tank:.18,elite:.3}[e.type]||.05;
    if(Math.random()>=base+Math.max(0,this.sinceDrop-12)*0.04) return; // pity ramp after 12 dry kills
    const pl=this.player, act=k=>pl.pw[k]>0;
    const w={rapid:act('rapid')?.8:3, triple:act('triple')?.8:3, shield:act('shield')?0:2.5,
             health:this.lives>=MAX_LIVES?0:({1:5,2:3,3:1.2,4:.6})[this.lives]||1};
    let r=Math.random()*Object.values(w).reduce((a,b)=>a+b,0),kind='rapid';
    for(const k in w){ if((r-=w[k])<=0){kind=k;break;} }
    this.powerups.push(new Powerup(kind,clamp(e.x,30,W-30),e.y));
    this.sinceDrop=0; this.lastDrop=this.time;
  }
  collect(pu){
    pu.dead=true; const d=PW[pu.kind], p=this.player;
    this.flashes.push(new Ring(pu.x,pu.y,d.col,46));
    this.burst(pu.x,pu.y,d.col,10); this.toast(d.name,d.col);
    if(pu.kind==='health'){ this.lives=Math.min(MAX_LIVES,this.lives+1); Sfx.heal(); }
    else{ p.pw[pu.kind]=d.dur; pu.kind==='shield'?Sfx.shieldUp():Sfx.pick(); }   // refreshes, never stacks past one timer
  }
  expire(k){
    this.toast(PW[k].name+' ENDED',P.steel); Sfx.expire();
    this.flashes.push(new Ring(this.player.x,this.player.y,PW[k].col,40));
  }

  hurt(){
    const p=this.player; if(p.inv>0)return;
    if(p.pw.shield>0){   // shield absorbs one hit, keeps combo
      p.pw.shield=0; p.inv=0.9; this.shake=7;
      this.flashes.push(new Ring(p.x,p.y,PW.shield.col,56));
      this.sparkAt(p.x,p.y,PW.shield.col,16); this.toast('SHIELD BROKEN',PW.shield.col); Sfx.shieldBreak(); return;
    }
    this.lives--; this.shake=14; this.combo=0; this.comboT=0; this.mult=1; this.flawless=false; this.hurtAlpha=0.58;
    this.burst(p.x,p.y,'#6fa3ff',22);
    this.sparkAt(p.x,p.y,P.blueGl,18);
    Sfx.hurt(); try{ navigator.vibrate&&navigator.vibrate(40); }catch(e){}
    if(this.lives<=0){ p.dead=true; Sfx.gameOver(); } else p.inv=CFG.invuln;
  }

  collide(){
    for(const b of this.bullets)
      for(const e of this.enemies){
        if(b.dead||e.dead||!hit(b,e))continue;
        b.dead=true; e.hp--; e.flash=0.1; e.hitReaction();
        if(e.hp<=0) this.kill(e);
        else{ this.sparkAt(b.x,b.y,e.glowCol,5); Sfx.hitEnemy(); }
      }
    const p=this.player; if(p.inv>0)return;
    // graze: near-miss refreshes combo and pays a small bonus (risk/reward)
    for(const b of this.enemyBullets) if(!b.grazed&&!hit(b,p)){
      const dx=b.x-p.x,dy=b.y-p.y,gr=p.r+b.r+14;
      if(dx*dx+dy*dy<gr*gr){
        b.grazed=true; if(this.combo>0) this.comboT=COMBO_WIN;
        const pts=25*this.mult; this.score+=pts;
        this.sparkAt(p.x,p.y,P.goldGl,4); this.pops.push(new ScorePop(p.x,p.y-24,pts));
      }
    }
    for(const b of this.enemyBullets) if(hit(b,p)){ b.dead=true; this.hurt(); return; }
    for(const e of this.enemies) if(!e.dead&&hit(e,p)){      // ramming hurts both sides; it is not a free kill
      e.hp-=3; e.flash=0.1; if(e.hp<=0) this.kill(e); this.hurt(); return;
    }
  }

  update(dt){
    this.time+=dt;
    this.banner=Math.max(0,this.banner-dt);
    this.shake=Math.max(0,this.shake-dt*35);
    this.hurtAlpha=Math.max(0,this.hurtAlpha-dt*2.8);
    if(!this.player.dead) for(const k in this.player.pw) if(this.player.pw[k]>0){
      this.player.pw[k]-=dt; if(this.player.pw[k]<=0){ this.player.pw[k]=0; this.expire(k); }
    }
    if(this.combo>0){ this.comboT-=dt; if(this.comboT<=0){ this.combo=0; this.mult=1; } }
    for(const t of this.toasts) t.life-=dt;
    this.toasts=this.toasts.filter(t=>t.life>0);
    if(this.player.dead) this.overT+=dt; else this.player.update(dt,this);
    this.updateWaves(dt);
    for(const list of [this.bullets,this.enemyBullets,this.enemies,this.particles,this.sparks,this.flashes,this.pops,this.powerups])
      for(const o of list) o.update(dt,this);
    if(!this.player.dead) this.collide();
    for(const k of ['bullets','enemyBullets','enemies','particles','sparks','flashes','pops','powerups'])
      compact(this[k],k==='particles'?POOL.p:k==='sparks'?POOL.s:null);
  }

  draw(g){
    g.save();
    if(this.shake>0.3){
      const s=this.shake;
      g.translate(rand(-1,1)*s*(RM?0.25:1),rand(-1,1)*s*0.6*(RM?0.25:1));
    }
    for(const e of this.enemies)      e.draw(g);
    for(const u of this.powerups)     u.draw(g);
    for(const b of this.bullets)      b.draw(g);
    for(const b of this.enemyBullets) b.draw(g);
    if(!this.player.dead){
      this.player.draw(g,this.time);
      const p=this.player, blink=k=>p.pw[k]>2||Math.floor(this.time*10)%2;
      if(p.pw.shield>0&&blink('shield')){
        g.globalAlpha=0.55+0.25*Math.sin(this.time*8);
        withGlow(g,PW.shield.col,14,()=>{g.strokeStyle=PW.shield.col;g.lineWidth=2;g.beginPath();g.arc(p.x,p.y-2,25,0,6.283);g.stroke();});
        g.globalAlpha=1;
      }
      const dot=(x,y,c)=>withGlow(g,c,10,()=>{g.fillStyle=c;g.beginPath();g.arc(x,y,2.6,0,6.283);g.fill();});
      if(p.pw.rapid>0&&blink('rapid')){dot(p.x-10,p.y-6,PW.rapid.col);dot(p.x+10,p.y-6,PW.rapid.col);}
      if(p.pw.triple>0&&blink('triple')) dot(p.x,p.y-21,PW.triple.col);
    }
    for(const f of this.flashes) f.draw(g);
    g.globalCompositeOperation='lighter';
    for(const p of this.particles) p.draw(g);
    for(const s of this.sparks)    s.draw(g);
    g.globalCompositeOperation='source-over';
    g.globalAlpha=1;
    for(const p of this.pops) p.draw(g);
    g.restore();

    if(this.hurtAlpha>0.01){
      const vg=g.createRadialGradient(W/2,H/2,H*0.18,W/2,H/2,H*0.72);
      vg.addColorStop(0,'rgba(0,0,0,0)');
      vg.addColorStop(1,`rgba(180,40,20,${this.hurtAlpha})`);
      g.fillStyle=vg; g.fillRect(0,0,W,H);
    }
    this._drawHud(g);
  }

  _drawHud(g){
    g.fillStyle='rgba(138,168,196,0.18)'; g.fillRect(0,44,W,1);
    txt(g,String(this.score).padStart(7,'0'),16,33,18,P.cold,'left','500');
    if(this.wave>0) txt(g,`WAVE  ${this.wave}`,W/2,33,12,P.steel,'center','500');
    for(let i=0;i<this.lives;i++){
      const cx=W-18-i*22;
      withGlow(g,P.blueGl,8,()=>{
        g.fillStyle=P.blue; g.beginPath();
        g.moveTo(cx,14); g.lineTo(cx+8,36); g.lineTo(cx,30); g.lineTo(cx-8,36);
        g.closePath(); g.fill();
      });
    }
    if(this.combo>0){
      txt(g,`COMBO ${this.combo}   x${this.mult}`,16,62,12,this.mult>1?P.goldGl:P.steel,'left','600');
      g.fillStyle='rgba(138,168,196,0.2)'; g.fillRect(16,68,90,3);
      g.fillStyle=P.gold; g.fillRect(16,68,90*clamp(this.comboT/COMBO_WIN,0,1),3);
    }
    let row=0;
    for(const k of ['shield','rapid','triple']){
      const t=this.player.pw[k]; if(!(t>0)) continue;
      const y=66+row++*26, d=PW[k];
      g.globalAlpha=(t<2&&Math.floor(this.time*8)%2)?0.35:1;
      g.save(); g.translate(W-22,y); glyph(g,k,d.col,7); g.restore();
      txt(g,t.toFixed(1)+'s',W-38,y+4,11,d.col,'right','600');
      g.fillStyle='rgba(138,168,196,0.2)'; g.fillRect(W-90,y+9,52,2);
      g.fillStyle=d.col; g.fillRect(W-90,y+9,52*clamp(t/d.dur,0,1),2);
      g.globalAlpha=1;
    }
    this.toasts.forEach((t,i)=>{
      g.globalAlpha=clamp(t.life*2,0,1);
      txt(g,t.s,W/2,H*0.22+i*22,14,t.col,'center','700');
    });
    g.globalAlpha=1;
    if(this.banner>0&&!this.player.dead){
      const fade=Math.min(1,this.banner)*Math.min(1,(2.4-this.banner)*3);
      g.globalAlpha=Math.max(0,fade);
      txt(g,`WAVE  ${this.bannerWave}`,W/2,H/2-10,38,P.cold,'center','700');
      txt(g,'─────────────────',W/2,H/2+10,11,P.steel);
      txt(g,this.bannerSub,W/2,H/2+34,12,P.goldGl,'center','500');
      g.globalAlpha=1;
    }
  }
}

/* ─── UI (menus, buttons, focus) ──────────────────────────────────────── */
const ease=t=>1-Math.pow(1-clamp(t,0,1),3);
const UI={
  key:'', sel:0, t:0, down:-1, pressT:0, anim:{},
  layout(key){
    const mk=(a,y0,st=52,w=232,h=42)=>a.map((r,i)=>({id:r[0],label:r[1],primary:!!r[2],x:(W-w)/2,y:y0+i*st,w,h}));
    switch(key){
      case 'menu':     return mk([['play','PLAY',1],['how','HOW TO PLAY'],['scores','HIGH SCORE'],['settings','SETTINGS']],382);
      case 'how': case 'scores': return mk([['back','BACK']],616);
      case 'settings': return mk([['music','MUSIC   '+(Sfx.music?'ON':'OFF')],['sfx','SFX   '+(Sfx.sfx?'ON':'OFF')],
                        ['vol','VOLUME   ◂  '+Sfx.volume+'%  ▸'],['back','BACK']],290);
      case 'pause':    return mk([['resume','RESUME',1],['restart','RESTART'],['settings','SETTINGS'],['menu','MAIN MENU']],296);
      case 'over':     return mk([['restart','RESTART',1],['menu','MAIN MENU']],486);
      case 'play':     return [{id:'pause',x:W/2+56,y:14,w:26,h:26}];
    } return [];
  },
  act(id,dir=0){
    const G=Game;
    switch(id){
      case 'play': case 'restart': Sfx.ui('confirm'); G.sub=null; G._fadeTo('play'); break;
      case 'how': case 'scores': case 'settings': Sfx.ui('confirm'); G.sub=id; break;
      case 'back': this.back(); break;
      case 'resume': Sfx.ui('resume'); G.state='play'; break;
      case 'menu': Sfx.ui('back'); G.sub=null; G._fadeTo('menu'); break;
      case 'pause': Sfx.ui('pause'); G.state='pause'; break;
      case 'music': Sfx.toggleMusic(); break;
      case 'sfx': Sfx.toggleSfx(); break;
      case 'vol': Sfx.vol(dir===0?(Sfx.volume>=100?-1:0.1):dir*0.1); break;
    }
  },
  back(){
    const G=Game;
    if(G.sub){ Sfx.ui('back'); G.sub=null; }
    else if(G.state==='pause') this.act('resume');
    else if(G.state==='over') this.act('menu');
  },
};

/* ─── game: state machine, screens, transitions ───────────────────────── */
const Game={
  state:'menu', sub:null, hiWave:0, hiCombo:0, newBest:false, world:null, stars:new Starfield(), time:0, hi:0,
  fadeAlpha:1, fadeDir:-1, _pendingState:null,

  init(){ try{ this.hi=+localStorage.getItem('n9-hi')||0; const b=JSON.parse(localStorage.getItem('n9-best')||'{}'); this.hiWave=b.w||0; this.hiCombo=b.c||0; }catch(e){} },

  _fadeTo(ns){
    if(this._pendingState)return;
    this._pendingState=ns; this.fadeDir=1;
  },
  start(){ Sfx.init(); this.world=new World(); this.state='play'; },
  end(){
    const w=this.world; this.state='over'; announce('Game over. Score '+w.score+', wave '+w.wave+'.');
    this.newBest=w.score>0&&w.score>this.hi;
    if(w.score>this.hi) this.hi=w.score;
    this.hiWave=Math.max(this.hiWave,w.wave); this.hiCombo=Math.max(this.hiCombo,w.bestCombo);
    try{ localStorage.setItem('n9-hi',this.hi); localStorage.setItem('n9-best',JSON.stringify({w:this.hiWave,c:this.hiCombo})); }catch(e){}
  },
  screen(){ return this.state==='play'?'play':(this.sub&&(this.state==='menu'||this.state==='pause'))?this.sub:this.state; },
  _ui(dt){
    const key=this.screen(), L=UI.layout(key);
    if(key!==UI.key){ UI.key=key; UI.t=0; UI.sel=key==='play'?-1:0; UI.down=-1; }
    UI.t+=dt; UI.pressT=Math.max(0,UI.pressT-dt);
    if(!this._pendingState&&key!=='play'&&UI.t>0.15){
      const n=L.length, cur=L[UI.sel];
      if(Input.hit('ArrowDown','KeyS')){ UI.sel=(UI.sel+1)%n; Sfx.ui('tick'); }
      if(Input.hit('ArrowUp','KeyW')){ UI.sel=(UI.sel+n-1)%n; Sfx.ui('tick'); }
      if(cur&&cur.id==='vol'&&Input.hit('ArrowLeft','KeyA')) UI.act('vol',-1);
      if(cur&&cur.id==='vol'&&Input.hit('ArrowRight','KeyD')) UI.act('vol',1);
      if(cur&&Input.hit('Enter','Space')&&(key!=='over'||UI.t>0.7)){ UI.pressT=0.12; UI.act(cur.id,0); }
      else if(Input.hit('Escape')) UI.back();
      else if(Input.hit('KeyP')&&key==='pause') UI.act('resume');
    }
    L.forEach((b,i)=>{ const a=UI.anim[key+b.id]||(UI.anim[key+b.id]={h:0,p:0});
      a.h=expDecay(a.h,i===UI.sel?1:0,16,dt); a.p=expDecay(a.p,(UI.down===i||(UI.pressT>0&&i===UI.sel))?1:0,30,dt); });
  },
  _btn(g,b,an,al){
    const hv=an.h,pr=an.p,sc=1-0.035*pr+0.02*hv;
    g.save(); g.globalAlpha=al; g.translate(b.x+b.w/2,b.y+b.h/2+(1-al)*8); g.scale(sc,sc); g.translate(-b.w/2,-b.h/2);
    g.fillStyle=b.primary?`rgba(58,123,213,${0.16+0.24*hv-0.1*pr})`:`rgba(138,168,196,${0.03+0.11*hv-0.04*pr})`;
    g.fillRect(0,0,b.w,b.h);
    g.strokeStyle=b.primary?(hv>0.5?P.blueGl:P.blue):`rgba(138,168,196,${0.28+0.55*hv})`; g.lineWidth=1+0.5*hv;
    if(hv>0.05) withGlow(g,P.blueGl,12*hv,()=>g.strokeRect(0.5,0.5,b.w-1,b.h-1)); else g.strokeRect(0.5,0.5,b.w-1,b.h-1);
    txt(g,b.label,b.w/2,b.h/2+5,14,b.primary?P.cold:P.steel,'center','600');
    if(!b.primary&&hv>0.02){ g.globalAlpha=al*hv; txt(g,b.label,b.w/2,b.h/2+5,14,P.cold,'center','600'); }
    if(hv>0.02&&b.id!=='vol'){ g.globalAlpha=al*hv; txt(g,'›',14-6*(1-hv),b.h/2+5,16,P.blueGl,'left','700'); txt(g,'‹',b.w-14+6*(1-hv),b.h/2+5,16,P.blueGl,'right','700'); }
    g.restore();
  },
  _drawUI(g){
    const key=this.screen(), L=UI.layout(key), t=UI.t, ap=(i=0)=>ease((t-0.05*i)/0.32);
    const T=(s,x,y,sz,c,al='center',w='600',i=0)=>{ const a=ap(i); g.globalAlpha=a; txt(g,s,x,y+(1-a)*10,sz,c,al,w); g.globalAlpha=1; };
    const rule=(y,i=0)=>{ g.globalAlpha=ap(i); g.fillStyle='rgba(138,168,196,0.25)'; g.fillRect(W/2-90,y,180,1); g.globalAlpha=1; };
    if(key==='play'){
      const b=L[0],a=UI.anim.playpause||{h:0,p:0};
      g.fillStyle=`rgba(58,123,213,${0.22*a.h+0.18*a.p})`; g.fillRect(b.x,b.y,b.w,b.h);
      g.strokeStyle=`rgba(138,168,196,${0.3+0.6*a.h})`; g.lineWidth=1; g.strokeRect(b.x+.5,b.y+.5,b.w-1,b.h-1);
      g.fillStyle=a.h>0.5?P.cold:P.steel; g.fillRect(b.x+8,b.y+7,3.5,12); g.fillRect(b.x+14.5,b.y+7,3.5,12);
      return;
    }
    if(key!=='menu'){ g.fillStyle=`rgba(6,7,15,${0.74*ap()})`; g.fillRect(0,0,W,H); }
    const hint=(s)=>{ if(!Input.touch.on) T(s,W/2,H-26,11,P.steel,'center','500',6); };
    if(key==='menu'){
      g.globalAlpha=ap(0); this._heroShip(g,W/2,128+Math.sin(this.time*1.4)*4,2.2); g.globalAlpha=1;
      T('NEBULA',W/2,232,46,P.cold,'center','700',1); T('//9',W/2,292,60,P.ember,'center','700',2); rule(310,3);
      hint('↑ ↓  SELECT     ENTER  CONFIRM     M  MUSIC     N  SFX');
    } else if(key==='how'){
      T('HOW TO PLAY',W/2,150,22,P.cold,'center','700'); rule(166,1);
      (Input.touch.on?[['MOVE','LEFT THUMB'],['FIRE','RIGHT THUMB'],['PAUSE','TOP BUTTON'],['SOUND','SETTINGS']]:[['MOVE','WASD / ARROWS'],['FIRE','SPACE'],['PAUSE','P / ESC'],['MUSIC · SFX','M · N']]).forEach((r,i)=>{
        T(r[0],W/2-120,214+i*28,12,P.steel,'left','500',2+i); T(r[1],W/2+120,214+i*28,12,P.cold,'right','600',2+i); });
      rule(342,5);
      ['Chain kills to build a x2 to x8 multiplier.','Graze enemy fire to keep the combo alive.','Take a hit and the combo resets.'].forEach((s,i)=>T(s,W/2,372+i*22,12,P.steel,'center','500',6+i));
      ['rapid','triple','shield','health'].forEach((k,i)=>{ const x=W/2-135+i*90,a=ap(9+i); g.globalAlpha=a; g.save(); g.translate(x,468); glyph(g,k,PW[k].col,9); g.restore(); g.globalAlpha=1; T(PW[k].name,x,496,10,PW[k].col,'center','600',9+i); });
      T('Power-ups are temporary.',W/2,540,11,P.steel,'center','500',13);
    } else if(key==='scores'){
      T('HIGH SCORE',W/2,150,22,P.cold,'center','700'); rule(166,1);
      T(String(this.hi).padStart(7,'0'),W/2,272,52,P.gold,'center','700',2); T('SCORE',W/2,296,11,P.steel,'center','500',2);
      T(String(this.hiWave),W/2-90,396,28,P.cold,'center','700',3); T('BEST WAVE',W/2-90,418,11,P.steel,'center','500',3);
      T(String(this.hiCombo),W/2+90,396,28,P.cold,'center','700',4); T('BEST COMBO',W/2+90,418,11,P.steel,'center','500',4);
    } else if(key==='settings'){
      T('SETTINGS',W/2,230,22,P.cold,'center','700'); rule(246,1); hint('← →  VOLUME     ESC  BACK');
    } else if(key==='pause'){
      T('PAUSED',W/2,230,30,P.cold,'center','700'); rule(248,1);
      T('SCORE '+String(this.world.score).padStart(7,'0')+'   ·   WAVE '+this.world.wave,W/2,272,11,P.steel,'center','500',2);
      hint('ESC  RESUME');
    } else if(key==='over'){
      const sc=Math.round(this.world.score*ease((t-0.3)/1.1));
      T('MISSION FAILED',W/2,150,14,P.ember,'center','700',0); rule(166,1);
      T(String(sc).padStart(7,'0'),W/2,236,52,P.cold,'center','700',1); T('FINAL SCORE',W/2,258,11,P.steel,'center','500',1);
      if(this.newBest&&t>1.2){ g.globalAlpha=0.6+0.4*Math.sin(t*6); txt(g,'↑  NEW HIGH SCORE',W/2,288,12,P.goldGl,'center','700'); g.globalAlpha=1; }
      rule(312,3);
      [[this.hi,'HIGH SCORE',P.gold],[this.world.wave,'WAVE',P.cold],[this.world.bestCombo,'BEST COMBO',P.cold]].forEach((c,i)=>{
        T(String(c[0]),W/2-130+i*130,372,22,c[2],'center','700',4+i); T(c[1],W/2-130+i*130,394,11,P.steel,'center','500',4+i); });
      rule(420,7);
    }
    L.forEach((b,i)=>this._btn(g,b,UI.anim[key+b.id]||{h:0,p:0},ap(2+i)));
  },
  pause(){ if(this.state==='play') this.state='pause'; },

  update(dt){
    this.time+=dt;
    if(Input.hit('KeyM')) Sfx.toggleMusic();
    if(Input.hit('KeyN')) Sfx.toggleSfx();
    if(Input.hit('Minus','NumpadSubtract')) Sfx.vol(-0.1);
    if(Input.hit('Equal','NumpadAdd')) Sfx.vol(0.1);
    if(this._pendingState){
      this.fadeAlpha=clamp(this.fadeAlpha+this.fadeDir*dt*5,0,1);
      if(this.fadeDir===1&&this.fadeAlpha>=1){
        const ns=this._pendingState; this._pendingState=null;
        if(ns==='play') this.start(); else this.state=ns;
        this.fadeDir=-1;
      }
      if(this.fadeDir===-1&&this.fadeAlpha<=0) this.fadeAlpha=0;
    } else {
      if(this.fadeAlpha>0) this.fadeAlpha=Math.max(0,this.fadeAlpha-dt*3);
    }
    this.stars.update(dt,this.state==='play'?1:0.35);
    if(this.state==='play'){
      if(Input.hit('KeyP','Escape')){ Sfx.ui('pause'); this.state='pause'; }
      else{ this.world.update(dt); if(this.world.overT>1.4) this.end(); }
    }
    this._ui(dt);
    this._afterUpdate();
  },

  buildBg(bw,bh){
    const c=this._bg||(this._bg=document.createElement('canvas')); c.width=bw; c.height=bh;
    const b=c.getContext('2d'); b.setTransform(bw/W,0,0,bh/H,0,0);
    b.fillStyle=P.void; b.fillRect(0,0,W,H);
    const n1=b.createRadialGradient(W*0.35,H*0.28,20,W*0.35,H*0.28,260);
    n1.addColorStop(0,'rgba(40,55,100,0.13)'); n1.addColorStop(1,'rgba(0,0,0,0)'); b.fillStyle=n1; b.fillRect(0,0,W,H);
    const n2=b.createRadialGradient(W*0.72,H*0.65,10,W*0.72,H*0.65,200);
    n2.addColorStop(0,'rgba(80,30,30,0.09)'); n2.addColorStop(1,'rgba(0,0,0,0)'); b.fillStyle=n2; b.fillRect(0,0,W,H);
  },
  _afterUpdate(){
    if(this.state!==this._ms){ this._ms=this.state; Sfx.mode(this.state,this.world?this.world.wave:1); }
  },
  _heroShip(g,cx,cy,sc){
    g.save(); g.translate(cx,cy); g.scale(sc,sc);
    withGlow(g,P.blueGl,22,()=>{
      g.fillStyle=P.blue; g.beginPath();
      g.moveTo(0,-22); g.lineTo(13,10); g.lineTo(6,6); g.lineTo(0,9); g.lineTo(-6,6); g.lineTo(-13,10);
      g.closePath(); g.fill();
    });
    g.fillStyle='rgba(200,230,255,0.5)'; g.beginPath(); g.moveTo(0,-12); g.lineTo(3,0); g.lineTo(-3,0); g.closePath(); g.fill();
    g.strokeStyle=P.blueGl; g.lineWidth=0.8; g.globalAlpha=0.6;
    g.beginPath(); g.moveTo(6,6); g.lineTo(12,9); g.stroke();
    g.beginPath(); g.moveTo(-6,6); g.lineTo(-12,9); g.stroke();
    g.globalAlpha=1; g.restore();
  },

  render(g){
    g.drawImage(this._bg,0,0,W,H);
    this.stars.draw(g);
    if(this.world&&this.state!=='menu') this.world.draw(g);

    this._drawUI(g);
    if(this.fadeAlpha>0.005){
      g.fillStyle=`rgba(6,7,15,${this.fadeAlpha})`; g.fillRect(0,0,W,H);
    }
  },
};

/* ─── bootstrap ───────────────────────────────────────────────────────── */
const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
if(!ctx){ const d=document.createElement('div'); d.id='fatal'; d.textContent='This browser does not support HTML5 Canvas, which NEBULA//9 requires.'; document.body.appendChild(d); throw new Error('Canvas 2D unavailable'); }
addEventListener('pointerdown',()=>window.focus());
function resize(){
  const cs=getComputedStyle(document.body), vv=window.visualViewport;
  const vw=(vv?vv.width:innerWidth)-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
  const vh=(vv?vv.height:innerHeight)-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom);
  const sc=Math.max(0.1,Math.min(vw/W,vh/H)), cw=Math.floor(W*sc), ch=Math.floor(H*sc);   // always 2:3, letterboxed
  canvas.style.width=cw+'px'; canvas.style.height=ch+'px';
  const d=Math.min(window.devicePixelRatio||1,FX.dpr), bw=Math.round(cw*d), bh=Math.round(ch*d);
  if(canvas.width!==bw||canvas.height!==bh){ canvas.width=bw; canvas.height=bh; ctx.setTransform(bw/W,0,0,bh/H,0,0); Game.buildBg(bw,bh); }
}
addEventListener('resize',resize); addEventListener('orientationchange',()=>setTimeout(resize,150));
if(window.visualViewport) visualViewport.addEventListener('resize',resize);
if(matchMedia('(pointer:coarse)').matches&&(navigator.hardwareConcurrency||8)<=4) FX.q=1,Object.assign(FX,{glow:0.5,dpr:1.5,pCap:300,sCap:200});
resize();
['touchmove','gesturestart','gesturechange','contextmenu'].forEach(t=>document.addEventListener(t,e=>e.preventDefault(),{passive:false}));
['touchend','click','pointerup'].forEach(t=>addEventListener(t,()=>Sfx.init()));
addEventListener('blur',()=>Game.pause());
document.addEventListener('visibilitychange',()=>{ if(document.hidden) Game.pause(); });
Game.fadeAlpha=1; Game.fadeDir=-1;
Game.init();
addEventListener('keydown',()=>Sfx.init());
addEventListener('pointerdown',()=>Sfx.init());
const pick=e=>{ const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)*W/r.width,y=(e.clientY-r.top)*H/r.height,L=UI.layout(Game.screen());
  return {x,L,i:L.findIndex(b=>{ const q=b.w<40?12:0; return x>=b.x-q&&x<=b.x+b.w+q&&y>=b.y-q&&y<=b.y+b.h+q; })}; };
canvas.addEventListener('pointermove',e=>{ const {i}=pick(e),k=Game.screen();
  if(i>=0&&i!==UI.sel){ UI.sel=i; if(k!=='play')Sfx.ui('tick'); } else if(i<0&&k==='play') UI.sel=-1;
  canvas.style.cursor=i>=0?'pointer':'default'; });
canvas.addEventListener('pointerdown',e=>{ const {i}=pick(e); if(i>=0){ UI.sel=i; UI.down=i; } });
addEventListener('pointerup',e=>{ const {i,x,L}=pick(e);
  if(i>=0&&i===UI.down&&!Game._pendingState){ const b=L[i]; UI.act(b.id,b.id==='vol'?(x<b.x+b.w/2?-1:1):0); } UI.down=-1; });

/* ─── touch controls: floating left stick, right-side fire, DOM overlay ── */
const TC={stick:-1,fire:-1,ox:0,oy:0,R:50};
const tcEl=document.createElement('div'); tcEl.id='tc';
tcEl.innerHTML='<div id="ts" class="tb"><div id="tk"></div></div><div id="tf" class="tb">FIRE</div>';
document.body.appendChild(tcEl);
const tsEl=document.getElementById('ts'), tkEl=document.getElementById('tk'), tfEl=document.getElementById('tf');
function stickReset(){ TC.stick=-1; Input.touch.x=Input.touch.y=0; tsEl.classList.remove('on'); tsEl.style.left=tsEl.style.top=tsEl.style.bottom=''; tkEl.style.transform=''; }
function fireReset(){ TC.fire=-1; Input.touch.fire=false; tfEl.classList.remove('on'); }
const TouchCtl={ on:false, sync(){
  const on=Input.touch.on&&Game.state==='play';
  if(on!==this.on){ this.on=on; document.body.classList.toggle('tplay',on); }
  if(Game.state!=='play'){ if(TC.stick>=0)stickReset(); if(TC.fire>=0)fireReset(); }
}};
addEventListener('pointerdown',e=>{
  if(e.pointerType!=='touch') return;
  Input.touch.on=true;
  if(Game.state!=='play'||Game._pendingState||pick(e).i>=0) return;      // pause button / UI wins
  if(e.clientX<innerWidth/2){
    if(TC.stick<0){ TC.stick=e.pointerId; TC.ox=e.clientX; TC.oy=e.clientY;
      tsEl.style.left=(TC.ox-52)+'px'; tsEl.style.top=(TC.oy-52)+'px'; tsEl.style.bottom='auto'; tsEl.classList.add('on'); }
  } else if(TC.fire<0){ TC.fire=e.pointerId; Input.touch.fire=true; tfEl.classList.add('on'); }
});
addEventListener('pointermove',e=>{
  if(e.pointerId!==TC.stick) return;
  let dx=e.clientX-TC.ox, dy=e.clientY-TC.oy; const l=Math.hypot(dx,dy);
  if(l>TC.R){ const k=(l-TC.R)/l; TC.ox+=dx*k; TC.oy+=dy*k; dx*=TC.R/l; dy*=TC.R/l;   // stick follows the thumb
    tsEl.style.left=(TC.ox-52)+'px'; tsEl.style.top=(TC.oy-52)+'px'; }
  const m=Math.hypot(dx,dy)/TC.R, dz=0.14, k2=m<dz?0:(m-dz)/(1-dz)/m;
  Input.touch.x=dx/TC.R*k2; Input.touch.y=dy/TC.R*k2; tkEl.style.transform='translate('+dx+'px,'+dy+'px)';
});
const tUp=e=>{ if(e.pointerId===TC.stick) stickReset(); if(e.pointerId===TC.fire) fireReset(); };
addEventListener('pointerup',tUp); addEventListener('pointercancel',tUp);

/* ─── main loop: fixed 60 Hz sim, render only after a sim step, adaptive quality ── */
const STEP=1/60; let last=0,acc=0,ema=16.7,slow=0,halted=false;
function fatal(e){
  halted=true; console.error(e);
  const d=document.createElement('div'); d.id='fatal'; d.textContent='Something went wrong. Reload the page to restart.'; document.body.appendChild(d);
}
function frame(ts){
  if(halted) return;
  requestAnimationFrame(frame);
  try{
    const raw=ts-last; last=ts; acc+=Math.min(0.1,raw/1000||0);
    let n=0;
    while(acc>=STEP){ Game.update(STEP); Input.endStep(); acc-=STEP; n++; }
    TouchCtl.sync();
    if(!n) return;                                  // 120/144 Hz displays: skip redundant draws
    Game.render(ctx); Sfx.drawNotice(ctx);
    if(raw>0&&raw<250) ema+=(raw-ema)*0.05;
    if(Game.state==='play'&&ema>25&&FX.q>0){ if(++slow>150){ slow=0; ema=16.7; FX.set(FX.q-1); } }
    else slow=Math.max(0,slow-2);
  }catch(e){ fatal(e); }
}
requestAnimationFrame(frame);
