'use strict';
/* TURBO VALLEY — 3D гоночный полигон. Three.js (CDN) + собственная физика, ИИ, звук. */
(function boot(){
  var srcs=[
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
    'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js',
    'https://unpkg.com/three@0.128.0/build/three.min.js'
  ];
  var i=0;
  window.__fatal=function(e){
    var sp=document.getElementById('loadSpin'),bar=document.getElementById('loadBar');
    if(sp)sp.style.display='none'; if(bar)bar.style.display='none';
    var m=document.getElementById('loadMsg');
    m.textContent='Ошибка: '+(e&&e.message?e.message:e);
    m.style.color='#ef4444';
    document.getElementById('loadRetry').style.display='inline-block';
    console.error(e);
  };
  function next(){
    if(i>=srcs.length){window.__fatal(new Error('Не удалось загрузить 3D-движок. При первом запуске нужен интернет.'));return;}
    var s=document.createElement('script');
    s.src=srcs[i++];
    s.onload=function(){ try{ startApp(); }catch(e){ window.__fatal(e); } };
    s.onerror=next;
    document.head.appendChild(s);
  }
  next();
})();

function startApp(){
if(!window.THREE) throw new Error('THREE не загрузился');
if(window.__TV_STARTED) return; window.__TV_STARTED=true;

/* ---------- утилиты ---------- */
var $=function(id){return document.getElementById(id);};
var clamp=function(v,a,b){return Math.max(a,Math.min(b,v));};
var lerp=function(a,b,t){return a+(b-a)*t;};
var rnd=function(a,b){return a+Math.random()*(b-a);};
var rndi=function(a,b){return Math.floor(rnd(a,b+1));};
var TAU=Math.PI*2;
var store={
  get:function(k,d){try{var v=localStorage.getItem(k);return v==null?d:JSON.parse(v);}catch(e){return d;}},
  set:function(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
};

/* ---------- настройки ---------- */
var SET={
  mode:store.get('tv_mode','time'), diff:store.get('tv_diff',1),
  tod:store.get('tv_tod','day'), weather:store.get('tv_weather','clear'),
  quality:store.get('tv_quality','high'), sens:store.get('tv_sens',100),
  invert:store.get('tv_invert',false), lefty:store.get('tv_lefty',false),
  glow:store.get('tv_glow',true), stripe:store.get('tv_stripe',false),
  paint:store.get('tv_paint',0), rim:store.get('tv_rim',0)
};
var DIFFS=[
  {name:'ЛЁГКО',time:55,add:14,dmg:.65,ai:.72,score:.8},
  {name:'НОРМА',time:45,add:11,dmg:1.0,ai:.86,score:1.0},
  {name:'ХАРД',time:36,add:9,dmg:1.35,ai:.99,score:1.35}
];
var MODES={
  time:{name:'ВРЕМЯ',laps:1,rivals:0,timed:true},
  race:{name:'ГОНКА',laps:2,rivals:3,timed:false},
  free:{name:'СВОБОДА',laps:99,rivals:2,timed:false}
};
var TOD={
  day:{sky:0x8fc7ee,fog:0xcfe6f7,fn:150,ff:470,hemi:1.0,hsky:0xffffff,hgnd:0x6f8f6a,sun:0xfff4e0,si:1.4,sp:[70,100,45],amb:.30,lamps:false,expo:1.1},
  dusk:{sky:0xf59a5a,fog:0xf7c49a,fn:120,ff:430,hemi:.82,hsky:0xffd9b0,hgnd:0x5a4a3a,sun:0xff9a4d,si:1.55,sp:[-100,38,-45],amb:.28,lamps:true,expo:1.05},
  night:{sky:0x0c1a33,fog:0x14243d,fn:95,ff:360,hemi:.5,hsky:0x9fc0ff,hgnd:0x1e2c44,sun:0xaecbff,si:.6,sp:[-60,85,-35],amb:.34,lamps:true,expo:1.15}
};

/* ---------- звук ---------- */
var Snd={
  ctx:null,master:null,on:store.get('tv_snd',true),
  eng:null,engG:null,engF:null,skidG:null,windG:null,turboO:null,turboG:null,
  init:function(){
    if(this.ctx)return;
    try{
      var AC=window.AudioContext||window.webkitAudioContext; if(!AC)return;
      this.ctx=new AC();
      this.master=this.ctx.createGain(); this.master.gain.value=this.on?1:0;
      var comp=this.ctx.createDynamicsCompressor();
      comp.threshold.value=-14; comp.ratio.value=6;
      this.master.connect(comp); comp.connect(this.ctx.destination);
    }catch(e){}
  },
  resume:function(){ if(this.ctx&&this.ctx.state==='suspended'){try{this.ctx.resume();}catch(e){}} },
  setOn:function(v){
    this.on=v; store.set('tv_snd',v);
    if(this.master)this.master.gain.value=v?1:0;
    $('sndIcon').textContent=v?'🔊':'';
    $('tglSound').classList.toggle('on',v);
  },
  beep:function(f,dur,type,vol,slide){
    if(!this.ctx||!this.on)return;
    try{
      var t=this.ctx.currentTime,o=this.ctx.createOscillator(),g=this.ctx.createGain();
      o.type=type||'sine'; o.frequency.setValueAtTime(f,t);
      if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,slide),t+dur);
      g.gain.setValueAtTime(vol||.15,t); g.gain.exponentialRampToValueAtTime(.0001,t+dur);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t+dur+.03);
    }catch(e){}
  },
  noise:function(dur,vol,freq,type){
    if(!this.ctx||!this.on)return;
    try{
      var len=Math.max(1,Math.floor(this.ctx.sampleRate*dur));
      var buf=this.ctx.createBuffer(1,len,this.ctx.sampleRate),d=buf.getChannelData(0);
      for(var i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);
      var src=this.ctx.createBufferSource(); src.buffer=buf;
      var f=this.ctx.createBiquadFilter(); f.type=type||'lowpass'; f.frequency.value=freq||900;
      var g=this.ctx.createGain(); g.gain.value=vol||.25;
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
    }catch(e){}
  },
  ui:function(){this.beep(620,.05,'square',.06);},
  chime:function(){this.beep(880,.11,'sine',.15);var s=this;setTimeout(function(){s.beep(1320,.18,'sine',.15);},85);},
  coin:function(){this.beep(1180,.07,'triangle',.12);var s=this;setTimeout(function(){s.beep(1560,.1,'triangle',.1);},55);},
  crash:function(big){this.noise(big?.55:.26,big?.5:.3,big?520:950);this.beep(92,.26,'square',.13,38);},
  scrape:function(){this.noise(.18,.14,2400,'bandpass');},
  boost:function(){this.beep(280,.4,'sawtooth',.11,980);},
  nos:function(){this.noise(.6,.22,1800,'bandpass');this.beep(180,.6,'sawtooth',.09,700);},
  whoosh:function(){this.noise(.42,.2,1500);},
  tick:function(){this.beep(1250,.06,'square',.08);},
  gear:function(){this.beep(160,.06,'square',.07,110);},
  fanfare:function(){var s=this;[523,659,784,1047,1319].forEach(function(f,i){setTimeout(function(){s.beep(f,.32,'triangle',.17);},i*120);});},
  lose:function(){this.beep(320,.55,'sawtooth',.15,85);},
  unlock:function(){var s=this;[700,900,1200].forEach(function(f,i){setTimeout(function(){s.beep(f,.22,'triangle',.16);},i*100);});},
  startEngine:function(){
    if(!this.ctx||this.eng)return;
    try{
      var c=this.ctx;
      var o1=c.createOscillator(),o2=c.createOscillator(),g=c.createGain(),f=c.createBiquadFilter();
      o1.type='sawtooth'; o2.type='square'; o2.detune.value=11;
      f.type='lowpass'; f.frequency.value=430; g.gain.value=0;
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
      o1.start(); o2.start();
      this.eng={o1:o1,o2:o2}; this.engG=g; this.engF=f;
      var len=c.sampleRate,buf=c.createBuffer(1,len,c.sampleRate),d=buf.getChannelData(0);
      for(var i=0;i<len;i++)d[i]=Math.random()*2-1;
      var ns=c.createBufferSource(); ns.buffer=buf; ns.loop=true;
      var nf=c.createBiquadFilter(); nf.type='bandpass'; nf.frequency.value=1500; nf.Q.value=1.1;
      var ng=c.createGain(); ng.gain.value=0;
      ns.connect(nf); nf.connect(ng); ng.connect(this.master); ns.start();
      this.skidG=ng;
      var ws=c.createBufferSource(); ws.buffer=buf; ws.loop=true;
      var wf=c.createBiquadFilter(); wf.type='lowpass'; wf.frequency.value=620;
      var wg=c.createGain(); wg.gain.value=0;
      ws.connect(wf); wf.connect(wg); wg.connect(this.master); ws.start();
      this.windG=wg;
      var to=c.createOscillator(),tg=c.createGain();
      to.type='sine'; to.frequency.value=1800; tg.gain.value=0;
      to.connect(tg); tg.connect(this.master); to.start();
      this.turboO=to; this.turboG=tg;
    }catch(e){}
  },
  updateEngine:function(speed,rpm,throttle,skid,nos){
    if(!this.eng)return;
    try{
      var t=this.ctx.currentTime,base=48+rpm*118;
      this.eng.o1.frequency.setTargetAtTime(base,t,.045);
      this.eng.o2.frequency.setTargetAtTime(base*.5,t,.045);
      this.engF.frequency.setTargetAtTime(280+rpm*900+throttle*260,t,.07);
      this.engG.gain.setTargetAtTime(.03+throttle*.05+rpm*.022,t,.09);
      if(this.skidG)this.skidG.gain.setTargetAtTime(skid?.085:0,t,.05);
      if(this.windG)this.windG.gain.setTargetAtTime(clamp(speed/60,0,1)*.05,t,.15);
      if(this.turboG)this.turboG.gain.setTargetAtTime(nos?.05:(throttle&&rpm>.7?.018:0),t,.08);
      if(this.turboO)this.turboO.frequency.setTargetAtTime(1400+rpm*2200,t,.08);
    }catch(e){}
  },
  stopEngine:function(){
    var t=this.ctx?this.ctx.currentTime:0;
    var kill=function(g){ if(g){try{g.gain.setTargetAtTime(0,t,.09);}catch(e){}} };
    kill(this.engG); kill(this.skidG); kill(this.windG); kill(this.turboG);
  }
};
$('sndIcon').textContent=Snd.on?'🔊':'🔇';
$('tglSound').classList.toggle('on',Snd.on);
$('sndBtn').addEventListener('click',function(){Snd.init();Snd.resume();Snd.setOn(!Snd.on);Snd.ui();});
window.addEventListener('pointerdown',function once(){Snd.init();Snd.resume();window.removeEventListener('pointerdown',once);},{once:true});

/* ---------- текстуры ---------- */
function makeTex(w,h,fn,rx,ry){
  var c=document.createElement('canvas'); c.width=w; c.height=h;
  fn(c.getContext('2d'),w,h);
  var t=new THREE.CanvasTexture(c); t.encoding=THREE.sRGBEncoding;
  if(rx){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rx,ry||rx);}
  t.anisotropy=4; return t;
}
var texGrass=makeTex(256,256,function(g,w,h){
  g.fillStyle='#4e8f3a'; g.fillRect(0,0,w,h);
  for(var i=0;i<3000;i++){
    var v=Math.random();
    g.fillStyle=v<.42?'rgba(32,74,26,.4)':(v<.8?'rgba(122,178,82,.32)':'rgba(160,196,110,.22)');
    g.fillRect(Math.random()*w,Math.random()*h,2,2);
  }
},80,80);
var texRoad=makeTex(256,512,function(g,w,h){
  g.fillStyle='#2c3038'; g.fillRect(0,0,w,h);
  for(var i=0;i<3600;i++){
    g.fillStyle=Math.random()<.5?'rgba(0,0,0,.28)':'rgba(255,255,255,.055)';
    g.fillRect(Math.random()*w,Math.random()*h,2,2);
  }
  g.fillStyle='#eceff3'; g.fillRect(9,0,7,h); g.fillRect(w-16,0,7,h);
  g.fillStyle='#f5c542';
  for(var y=0;y<h;y+=92)g.fillRect(w/2-4,y,8,54);
});
texRoad.wrapS=texRoad.wrapT=THREE.RepeatWrapping;
var texCurb=makeTex(64,64,function(g,w,h){
  for(var i=0;i<4;i++){g.fillStyle=i%2?'#e8e8e8':'#d7263d';g.fillRect(0,i*16,w,16);}
},1,40);
var texChecker=makeTex(128,128,function(g,w,h){
  var s=16;
  for(var y=0;y<8;y++)for(var x=0;x<8;x++){g.fillStyle=(x+y)%2?'#12151b':'#f2f5f8';g.fillRect(x*s,y*s,s,s);}
},5,1);
var texHazard=makeTex(128,64,function(g,w,h){
  g.fillStyle='#f5c542'; g.fillRect(0,0,w,h); g.fillStyle='#16181d';
  for(var x=-h;x<w+h;x+=32){g.beginPath();g.moveTo(x,h);g.lineTo(x+h,0);g.lineTo(x+h+16,0);g.lineTo(x+16,h);g.closePath();g.fill();}
},3,1);
var texBoost=makeTex(128,128,function(g,w,h){
  g.fillStyle='rgba(10,16,32,.85)'; g.fillRect(0,0,w,h);
  for(var i=0;i<3;i++){
    var y=16+i*36;
    var grd=g.createLinearGradient(0,y,0,y+34);
    grd.addColorStop(0,'#a855f7'); grd.addColorStop(1,'#22d3ee');
    g.fillStyle=grd;
    g.beginPath(); g.moveTo(18,y+28); g.lineTo(64,y); g.lineTo(110,y+28);
    g.lineTo(110,y+40); g.lineTo(64,y+12); g.lineTo(18,y+40); g.closePath(); g.fill();
  }
});
var texOil=makeTex(128,128,function(g,w,h){
  var grd=g.createRadialGradient(64,64,6,64,64,62);
  grd.addColorStop(0,'rgba(18,10,30,.95)'); grd.addColorStop(.6,'rgba(30,16,48,.8)'); grd.addColorStop(1,'rgba(30,16,48,0)');
  g.fillStyle=grd; g.fillRect(0,0,w,h);
  g.strokeStyle='rgba(168,85,247,.45)'; g.lineWidth=2;
  for(var i=0;i<4;i++){g.beginPath();g.arc(64,64,16+i*12,rnd(0,3),rnd(3,6));g.stroke();}
});
var texSkid=makeTex(32,64,function(g,w,h){
  var grd=g.createLinearGradient(0,0,w,0);
  grd.addColorStop(0,'rgba(10,10,12,0)'); grd.addColorStop(.5,'rgba(10,10,12,.85)'); grd.addColorStop(1,'rgba(10,10,12,0)');
  g.fillStyle=grd; g.fillRect(0,0,w,h);
});
var texCoin=makeTex(64,64,function(g,w,h){
  var grd=g.createRadialGradient(26,22,3,32,32,30);
  grd.addColorStop(0,'#fff6cf'); grd.addColorStop(.5,'#fbbf24'); grd.addColorStop(1,'#b45309');
  g.fillStyle=grd; g.beginPath(); g.arc(32,32,30,0,TAU); g.fill();
  g.fillStyle='rgba(120,53,15,.85)'; g.font='bold 30px Arial'; g.textAlign='center'; g.textBaseline='middle';
  g.fillText('₡',32,34);
});
var envTex=makeTex(512,256,function(g,w,h){
  var gr=g.createLinearGradient(0,0,0,h);
  gr.addColorStop(0,'#6fb9ec'); gr.addColorStop(.44,'#dff0ff'); gr.addColorStop(.5,'#e9f4ff');
  gr.addColorStop(.53,'#93ac8c'); gr.addColorStop(1,'#54724f');
  g.fillStyle=gr; g.fillRect(0,0,w,h);
  var sun=g.createRadialGradient(w*.7,h*.24,3,w*.7,h*.24,72);
  sun.addColorStop(0,'rgba(255,255,246,1)'); sun.addColorStop(1,'rgba(255,255,246,0)');
  g.fillStyle=sun; g.fillRect(0,0,w,h);
});
envTex.mapping=THREE.EquirectangularReflectionMapping;

/* ---------- рендерер ---------- */
var renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setSize(window.innerWidth,window.innerHeight);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.1;
renderer.domElement.id='gl';
document.body.appendChild(renderer.domElement);
var pmrem=new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
var envRT=pmrem.fromEquirectangular(envTex);
envTex.dispose(); pmrem.dispose();
var ENV=envRT.texture;

/* ---------- салон ---------- */
var shScene=new THREE.Scene();
shScene.background=new THREE.Color(0x080f1c);
shScene.fog=new THREE.Fog(0x080f1c,20,52);
shScene.environment=ENV;
var shCam=new THREE.PerspectiveCamera(48,window.innerWidth/window.innerHeight,.1,220);
shScene.add(new THREE.HemisphereLight(0xbfd8ff,0x141c2c,.6));
var shKey=new THREE.SpotLight(0xfff2dd,2.0,70,.6,.65,1.3);
shKey.position.set(8,12,7); shKey.castShadow=true; shKey.shadow.mapSize.set(1024,1024);
shKey.shadow.bias=-.001; shScene.add(shKey); shScene.add(shKey.target);
var shRim=new THREE.PointLight(0x22d3ee,1.5,34); shRim.position.set(-8,3.4,-7); shScene.add(shRim);
var shFill=new THREE.PointLight(0xa855f7,.9,30); shFill.position.set(6,2.2,-8); shScene.add(shFill);
var shFloor=new THREE.Mesh(new THREE.CircleGeometry(34,56),
  new THREE.MeshStandardMaterial({color:0x0d1524,roughness:.62,metalness:.35,envMapIntensity:.5}));
shFloor.rotation.x=-Math.PI/2; shFloor.receiveShadow=true; shScene.add(shFloor);
var gridHelper=new THREE.GridHelper(60,30,0x1d3a5c,0x14263c);
gridHelper.position.y=.01; shScene.add(gridHelper);
var platform=new THREE.Group(); shScene.add(platform);
var platMesh=new THREE.Mesh(new THREE.CylinderGeometry(4.7,4.95,.28,56),
  new THREE.MeshStandardMaterial({color:0x18243a,metalness:.7,roughness:.32,envMapIntensity:.9}));
platMesh.position.y=.14; platMesh.receiveShadow=true; platform.add(platMesh);
var platRing=new THREE.Mesh(new THREE.TorusGeometry(4.82,.07,10,72),
  new THREE.MeshStandardMaterial({color:0x22d3ee,emissive:0x22d3ee,emissiveIntensity:1.8}));
platRing.rotation.x=Math.PI/2; platRing.position.y=.29; platform.add(platRing);
var platRing2=new THREE.Mesh(new THREE.TorusGeometry(4.3,.03,8,64),
  new THREE.MeshStandardMaterial({color:0xa855f7,emissive:0xa855f7,emissiveIntensity:1.2}));
platRing2.rotation.x=Math.PI/2; platRing2.position.y=.29; platform.add(platRing2);
for(var pi=0;pi<8;pi++){
  var pa=pi/8*TAU;
  var pillar=new THREE.Mesh(new THREE.BoxGeometry(.12,3.4,.12),
    new THREE.MeshStandardMaterial({color:0x22d3ee,emissive:0x22d3ee,emissiveIntensity:.9}));
  pillar.position.set(Math.sin(pa)*9,1.7,Math.cos(pa)*9); shScene.add(pillar);
}

/* ---------- игровая сцена ---------- */
var gScene=new THREE.Scene();
gScene.environment=ENV;
var gCam=new THREE.PerspectiveCamera(62,window.innerWidth/window.innerHeight,.1,950);
var hemi=new THREE.HemisphereLight(0xffffff,0x6f8f6a,1.0); gScene.add(hemi);
var amb=new THREE.AmbientLight(0xffffff,.3); gScene.add(amb);
var sun=new THREE.DirectionalLight(0xfff4e0,1.4);
sun.castShadow=true; sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.near=10; sun.shadow.camera.far=320;
sun.shadow.camera.left=-75; sun.shadow.camera.right=75;
sun.shadow.camera.top=75; sun.shadow.camera.bottom=-75;
sun.shadow.bias=-.0006;
gScene.add(sun); gScene.add(sun.target);

/* ---------- автопарк ---------- */
var PAINTS=[0xd7263d,0x22d3ee,0xa3e635,0xfbbf24,0xf4f7fa,0x141a24,0xa855f7,0xff7a1a,0x0ea5e9,0x16a34a];
var RIMS=[0xcfd6e0,0x2b3038,0xfbbf24,0x22d3ee,0xb45309,0xf4f7fa];
var CARS=[
 {id:'vaz',name:'ВАЗ 2107',klass:'КЛАССИКА',hp:75,top:150,grip:.62,off:.58,drive:'ЗАДНИЙ',L:4.10,W:1.66,H:1.44,r:.33,type:'classic',drift:false,cost:0},
 {id:'priora',name:'Lada Priora',klass:'СЕДАН',hp:106,top:180,grip:.68,off:.55,drive:'ПЕРЕДНИЙ',L:4.35,W:1.72,H:1.42,r:.34,type:'sedan',drift:false,cost:0},
 {id:'camry',name:'Toyota Camry',klass:'БИЗНЕС',hp:249,top:215,grip:.79,off:.5,drive:'ПЕРЕДНИЙ',L:4.88,W:1.86,H:1.45,r:.36,type:'sedan',drift:false,cost:0},
 {id:'uaz',name:'УАЗ Патриот',klass:'ОФФРОУД',hp:150,top:150,grip:.7,off:.95,drive:'ПОЛНЫЙ',L:4.75,W:1.9,H:1.92,r:.48,type:'g63',drift:false,cost:0},
 {id:'g63',name:'Mercedes G63',klass:'ВНЕДОРОЖНИК',hp:585,top:230,grip:.82,off:.92,drive:'ПОЛНЫЙ',L:4.62,W:1.98,H:1.97,r:.5,type:'g63',drift:false,cost:0},
 {id:'x5',name:'BMW X5 M',klass:'КРОССОВЕР',hp:625,top:255,grip:.85,off:.76,drive:'ПОЛНЫЙ',L:4.94,W:2.0,H:1.74,r:.44,type:'suv',drift:false,cost:0},
 {id:'chal',name:'Dodge Challenger',klass:'МАСЛКАР',hp:485,top:255,grip:.66,off:.45,drive:'ЗАДНИЙ',L:5.02,W:1.96,H:1.38,r:.38,type:'muscle',drift:true,cost:0},
 {id:'supra',name:'Toyota Supra',klass:'СПОРТ',hp:340,top:255,grip:.88,off:.4,drive:'ЗАДНИЙ',L:4.38,W:1.86,H:1.29,r:.35,type:'sport',drift:true,cost:1200},
 {id:'gtr',name:'Nissan GT-R R35',klass:'СПОРТ',hp:570,top:285,grip:.93,off:.42,drive:'ПОЛНЫЙ',L:4.68,W:1.9,H:1.37,r:.36,type:'sport',drift:true,cost:2200},
 {id:'p911',name:'Porsche 911 GT3',klass:'СПОРТ',hp:510,top:300,grip:.95,off:.36,drive:'ЗАДНИЙ',L:4.57,W:1.85,H:1.28,r:.35,type:'sport',drift:true,cost:3400},
 {id:'avent',name:'Lamborghini Aventador',klass:'СУПЕРКАР',hp:740,top:330,grip:.95,off:.3,drive:'ПОЛНЫЙ',L:4.78,W:2.03,H:1.14,r:.34,type:'super',drift:true,cost:5200},
 {id:'chiron',name:'Bugatti Chiron',klass:'ГИПЕРКАР',hp:1500,top:390,grip:.98,off:.3,drive:'ПОЛНЫЙ',L:4.54,W:2.04,H:1.21,r:.35,type:'hyper',drift:true,cost:8500}
];
var SIL={
 classic:'M3 31 L9 29 L13 20 L33 20 L39 28 L49 30 L49 34 L3 34 Z',
 sedan:'M3 32 L9 29 L16 21 L33 21 L40 28 L49 31 L49 34 L3 34 Z',
 g63:'M4 34 L4 15 L35 15 L39 24 L49 26 L49 34 Z',
 suv:'M3 34 L4 22 L13 17 L34 17 L41 24 L49 28 L49 34 Z',
 muscle:'M2 32 L8 28 L15 22 L31 22 L39 27 L50 29 L50 34 L2 34 Z',
 sport:'M2 33 L9 29 L17 22 L30 22 L40 28 L50 31 L50 34 L2 34 Z',
 super:'M1 33 L10 29 L18 24 L28 24 L41 29 L51 32 L51 34 L1 34 Z',
 hyper:'M2 33 L9 28 L18 23 L30 23 L41 28 L50 31 L50 34 L2 34 Z'
};
function bodyProfile(t,L,H){
  var P={
    classic:[[-.5,.34],[-.5,.8],[-.41,.84],[-.29,.86],[-.2,H],[.12,H],[.22,.88],[.44,.84],[.5,.78],[.5,.34]],
    sedan:[[-.5,.32],[-.5,.76],[-.41,.82],[-.27,.86],[-.16,H],[.15,H],[.27,.87],[.46,.79],[.5,.7],[.5,.32]],
    g63:[[-.5,.44],[-.5,H-.07],[-.45,H],[.27,H],[.32,1.0],[.5,.94],[.5,.44]],
    suv:[[-.5,.4],[-.5,.92],[-.43,.98],[-.28,H],[.17,H],[.31,.97],[.47,.88],[.5,.79],[.5,.4]],
    muscle:[[-.5,.32],[-.5,.8],[-.37,.86],[-.19,H],[.09,H],[.21,.86],[.47,.81],[.5,.72],[.5,.32]],
    sport:[[-.5,.3],[-.5,.68],[-.37,.76],[-.17,H],[.1,H],[.25,.73],[.47,.57],[.5,.46],[.5,.3]],
    super:[[-.5,.28],[-.5,.6],[-.33,.7],[-.11,H],[.08,H],[.23,.6],[.49,.42],[.5,.36],[.5,.28]],
    hyper:[[-.5,.3],[-.5,.66],[-.35,.78],[-.13,H],[.12,H],[.29,.74],[.48,.53],[.5,.43],[.5,.3]]
  }[t];
  var s=new THREE.Shape();
  P.forEach(function(q,i){var x=q[0]*L,y=q[1]; if(i)s.lineTo(x,y); else s.moveTo(x,y);});
  s.closePath(); return s;
}
function glassProfile(t,L,H){
  var P={
    classic:[[-.27,.88],[-.19,H-.03],[.11,H-.03],[.21,.89]],
    sedan:[[-.25,.88],[-.15,H-.03],[.14,H-.03],[.25,.88]],
    g63:[[-.43,H-.05],[.25,H-.05],[.29,1.02],[-.41,1.02]],
    suv:[[-.27,.99],[-.17,H-.03],[.16,H-.03],[.29,.98]],
    muscle:[[-.17,.88],[-.11,H-.03],[.08,H-.03],[.19,.87]],
    sport:[[-.16,.77],[-.09,H-.03],[.09,H-.03],[.23,.74]],
    super:[[-.11,.71],[-.03,H-.02],[.07,H-.02],[.21,.61]],
    hyper:[[-.13,.79],[-.05,H-.03],[.11,H-.03],[.27,.75]]
  }[t];
  var s=new THREE.Shape();
  P.forEach(function(q,i){var x=q[0]*L,y=q[1]; if(i)s.lineTo(x,y); else s.moveTo(x,y);});
  s.closePath(); return s;
}
function extrudePart(shape,w,mat,bev){
  var g=new THREE.ExtrudeGeometry(shape,{depth:w,bevelEnabled:!!bev,bevelThickness:.05,bevelSize:.05,bevelSegments:2,curveSegments:6,steps:1});
  g.translate(0,0,-w/2); g.rotateY(-Math.PI/2);
  var m=new THREE.Mesh(g,mat); m.castShadow=true; return m;
}
function buildCar(cfg,paint,rimColor,opts){
  opts=opts||{};
  var simple=!!opts.simple,glow=!!opts.glow,stripe=!!opts.stripe;
  var L=cfg.L,W=cfg.W,H=cfg.H,r=cfg.r;
  var root=new THREE.Group(),tilt=new THREE.Group(); root.add(tilt);
  var M={
    paint:new THREE.MeshStandardMaterial({color:paint,metalness:.78,roughness:.26,envMapIntensity:1.15}),
    dark:new THREE.MeshStandardMaterial({color:0x12161d,metalness:.45,roughness:.62}),
    matte:new THREE.MeshStandardMaterial({color:0x1a1f27,metalness:.2,roughness:.85}),
    chrome:new THREE.MeshStandardMaterial({color:0xdde4ec,metalness:.98,roughness:.14,envMapIntensity:1.4}),
    glass:new THREE.MeshStandardMaterial({color:0x0c1520,metalness:.92,roughness:.1,envMapIntensity:1.5,transparent:true,opacity:.93}),
    head:new THREE.MeshStandardMaterial({color:0xfffbe8,emissive:0xfff2c4,emissiveIntensity:1.6}),
    tail:new THREE.MeshStandardMaterial({color:0xff2a2a,emissive:0xff1414,emissiveIntensity:1.0}),
    amber:new THREE.MeshStandardMaterial({color:0xffa53c,emissive:0xff8c1a,emissiveIntensity:.8}),
    tire:new THREE.MeshStandardMaterial({color:0x0e1014,roughness:.96}),
    rim:new THREE.MeshStandardMaterial({color:rimColor,metalness:.92,roughness:.24,envMapIntensity:1.25}),
    caliper:new THREE.MeshStandardMaterial({color:0xd7263d,metalness:.4,roughness:.5}),
    disc:new THREE.MeshStandardMaterial({color:0x6b7280,metalness:.85,roughness:.42})
  };
  var dmgParts=[];
  var body=extrudePart(bodyProfile(cfg.type,L,H),W,M.paint,true);
  tilt.add(body); dmgParts.push(body);
  var glass=extrudePart(glassProfile(cfg.type,L,H),W*.87,M.glass,false);
  tilt.add(glass); dmgParts.push(glass);
  var bf=new THREE.Mesh(new THREE.BoxGeometry(W*.97,.18,.3),M.matte);
  bf.position.set(0,.35,L/2-.05); bf.castShadow=true; tilt.add(bf); dmgParts.push(bf);
  var br=bf.clone(); br.position.z=-L/2+.05; tilt.add(br); dmgParts.push(br);
  var splitter=new THREE.Mesh(new THREE.BoxGeometry(W*1.0,.05,.34),M.dark);
  splitter.position.set(0,.24,L/2-.02); tilt.add(splitter);
  var diffuser=new THREE.Mesh(new THREE.BoxGeometry(W*.9,.14,.28),M.dark);
  diffuser.position.set(0,.26,-L/2+.02); tilt.add(diffuser);
  var grille=new THREE.Mesh(new THREE.BoxGeometry(W*.52,.16,.07),M.dark);
  grille.position.set(0,.62,L/2+.02); tilt.add(grille);
  var plate=new THREE.Mesh(new THREE.BoxGeometry(.42,.12,.03),new THREE.MeshStandardMaterial({color:0xf1f5f9,roughness:.7}));
  plate.position.set(0,.42,-L/2-.05); tilt.add(plate);
  [-1,1].forEach(function(s){
    var hl=new THREE.Mesh(new THREE.BoxGeometry(W*.21,.11,.09),M.head);
    hl.position.set(s*W*.32,.68,L/2+.01); tilt.add(hl);
    var drl=new THREE.Mesh(new THREE.BoxGeometry(W*.19,.025,.06),M.head);
    drl.position.set(s*W*.32,.6,L/2+.03); tilt.add(drl);
    var tl=new THREE.Mesh(new THREE.BoxGeometry(W*.23,.1,.08),M.tail);
    tl.position.set(s*W*.3,.7,-L/2-.01); tilt.add(tl);
    var ind=new THREE.Mesh(new THREE.BoxGeometry(.1,.06,.06),M.amber);
    ind.position.set(s*W*.46,.6,L/2-.04); tilt.add(ind);
    var stalk=new THREE.Mesh(new THREE.BoxGeometry(.1,.03,.04),M.dark);
    stalk.position.set(s*(W/2+.04),.94,L*.16); tilt.add(stalk);
    var mir=new THREE.Mesh(new THREE.BoxGeometry(.07,.1,.17),M.paint);
    mir.position.set(s*(W/2+.11),.96,L*.16); mir.castShadow=true; tilt.add(mir); dmgParts.push(mir);
    var skirt=new THREE.Mesh(new THREE.BoxGeometry(.06,.12,L*.5),M.matte);
    skirt.position.set(s*(W/2-.01),.3,0); tilt.add(skirt);
    var ex=new THREE.Mesh(new THREE.CylinderGeometry(.055,.06,.18,10),M.chrome);
    ex.rotation.x=Math.PI/2; ex.position.set(s*W*.26,.3,-L/2-.05); tilt.add(ex);
    if(cfg.type==='super'||cfg.type==='hyper'){var ex2=ex.clone();ex2.position.x=s*W*.13;tilt.add(ex2);}
    if(!simple){
      var dl=new THREE.Mesh(new THREE.BoxGeometry(.015,.5,L*.28),M.dark);
      dl.position.set(s*(W/2+.005),.62,L*.02); tilt.add(dl);
      var handle=new THREE.Mesh(new THREE.BoxGeometry(.03,.04,.16),M.chrome);
      handle.position.set(s*(W/2+.02),.82,L*.05); tilt.add(handle);
    }
  });
  if(cfg.type==='muscle'){
    var scoop=new THREE.Mesh(new THREE.BoxGeometry(W*.34,.12,.7),M.dark);
    scoop.position.set(0,.88,L*.28); tilt.add(scoop);
  }
  if(['sport','super','hyper','muscle'].indexOf(cfg.type)>=0){
    var wingH=(cfg.type==='super'||cfg.type==='hyper')?H*.92:H*.84;
    var wing=new THREE.Mesh(new THREE.BoxGeometry(W*1.04,.055,.36),M.dark);
    wing.position.set(0,wingH,-L/2+.14); wing.castShadow=true; tilt.add(wing); dmgParts.push(wing);
    [-1,1].forEach(function(s){
      var st=new THREE.Mesh(new THREE.BoxGeometry(.06,Math.max(.1,wingH-.62),.1),M.dark);
      st.position.set(s*W*.38,(wingH+.62)/2,-L/2+.16); tilt.add(st);
    });
  }
  if(cfg.type==='g63'){
    [-1,1].forEach(function(s){
      var rail=new THREE.Mesh(new THREE.BoxGeometry(.06,.07,L*.62),M.dark);
      rail.position.set(s*W*.36,H+.07,-.1); tilt.add(rail);
    });
    var spare=new THREE.Mesh(new THREE.CylinderGeometry(r*.82,r*.82,.22,18),M.tire);
    spare.rotation.x=Math.PI/2; spare.position.set(0,H*.56,-L/2-.16); spare.castShadow=true; tilt.add(spare);
    var spareRim=new THREE.Mesh(new THREE.CylinderGeometry(r*.45,r*.45,.24,12),M.rim);
    spareRim.rotation.x=Math.PI/2; spareRim.position.copy(spare.position); tilt.add(spareRim);
    var snork=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,H*.8,8),M.matte);
    snork.position.set(W/2-.02,H*.62,L*.3); tilt.add(snork);
    var bull=new THREE.Mesh(new THREE.BoxGeometry(W*.9,.08,.08),M.chrome);
    bull.position.set(0,.62,L/2+.14); tilt.add(bull);
  }
  if(stripe){
    var st1=new THREE.Mesh(new THREE.BoxGeometry(.16,.02,L*.94),new THREE.MeshStandardMaterial({color:0xf8fafc,roughness:.4,metalness:.3}));
    st1.position.set(-.16,H+.005,-.02); tilt.add(st1);
    var st2=st1.clone(); st2.position.x=.16; tilt.add(st2);
  }
  var glowMesh=null;
  if(glow){
    glowMesh=new THREE.Mesh(new THREE.PlaneGeometry(W*1.5,L*1.05),
      new THREE.MeshBasicMaterial({color:0x22d3ee,transparent:true,opacity:.34,depthWrite:false}));
    glowMesh.rotation.x=-Math.PI/2; glowMesh.position.y=.06; tilt.add(glowMesh);
  }
  var wheels=[];
  var tireG=new THREE.CylinderGeometry(r,r,.27,simple?12:20); tireG.rotateZ(Math.PI/2);
  var rimG=new THREE.CylinderGeometry(r*.6,r*.6,.28,simple?10:16); rimG.rotateZ(Math.PI/2);
  var discG=new THREE.CylinderGeometry(r*.52,r*.52,.05,12); discG.rotateZ(Math.PI/2);
  var spokeG=new THREE.BoxGeometry(.04,r*.95,.07);
  var archG=new THREE.TorusGeometry(r*1.16,.055,6,14,Math.PI);
  [[-1,1],[1,1],[-1,-1],[1,-1]].forEach(function(q){
    var pivot=new THREE.Group();
    pivot.position.set(q[0]*(W/2+.015),r,q[1]*(L/2-.78));
    var spin=new THREE.Group(); pivot.add(spin);
    var tire=new THREE.Mesh(tireG,M.tire); tire.castShadow=true; spin.add(tire);
    var rim=new THREE.Mesh(rimG,M.rim); spin.add(rim);
    if(!simple){
      var disc=new THREE.Mesh(discG,M.disc); disc.position.x=q[0]*.06; spin.add(disc);
      for(var i=0;i<5;i++){var sp=new THREE.Mesh(spokeG,M.rim);sp.rotation.x=i*TAU/5;sp.position.x=q[0]*.13;spin.add(sp);}
      var cal=new THREE.Mesh(new THREE.BoxGeometry(.05,r*.5,.12),M.caliper);
      cal.position.set(q[0]*.08,r*.35,0); pivot.add(cal);
      var arch=new THREE.Mesh(archG,M.paint);
      arch.rotation.y=Math.PI/2; arch.position.set(q[0]*(W/2-.03),r,q[1]*(L/2-.78));
      tilt.add(arch);
    }
    tilt.add(pivot);
    wheels.push({pivot:pivot,spin:spin,front:q[1]>0,r:r,side:q[0]});
  });
  var beams=[];
  if(!simple){
    [-1,1].forEach(function(s){
      var beam=new THREE.SpotLight(0xfff3d0,0,52,.44,.55,1.1);
      beam.position.set(s*W*.3,.7,L/2);
      var tgt=new THREE.Object3D(); tgt.position.set(s*W*.3,.1,L/2+22);
      tilt.add(tgt); beam.target=tgt; tilt.add(beam); beams.push(beam);
    });
  }
  root.userData={tilt:tilt,wheels:wheels,tailM:M.tail,headM:M.head,paintM:M.paint,dmgParts:dmgParts,glow:glowMesh,beams:beams,cfg:cfg};
  return root;
}
function disposeTree(o){
  o.traverse(function(n){
    if(n.geometry)n.geometry.dispose();
    if(n.material){(Array.isArray(n.material)?n.material:[n.material]).forEach(function(m){if(m&&m.dispose)m.dispose();});}
  });
}
function setCarNight(car,on){
  if(!car||!car.userData.beams)return;
  car.userData.beams.forEach(function(b){b.intensity=on?2.4:0;});
  car.userData.headM.emissiveIntensity=on?2.6:1.6;
}
function applyDamageVisual(car,dmg,dirX,dirZ){
  if(!car)return;
  var parts=car.userData.dmgParts; if(!parts.length)return;
  var k=clamp(dmg/100,0,1),p=parts[rndi(0,parts.length-1)];
  if(!p.userData.base)p.userData.base={px:p.position.x,py:p.position.y,pz:p.position.z,rx:p.rotation.x,ry:p.rotation.y,rz:p.rotation.z};
  var b=p.userData.base,amp=k*.16;
  p.position.x=b.px+rnd(-amp,amp)+dirX*amp*.5;
  p.position.y=b.py+rnd(-amp*.4,amp*.3);
  p.position.z=b.pz+rnd(-amp,amp)+dirZ*amp*.5;
  p.rotation.x=b.rx+rnd(-amp,amp)*.7;
  p.rotation.z=b.rz+rnd(-amp,amp)*.7;
  car.userData.paintM.roughness=clamp(.26+k*.45,0,1);
}
function resetDamageVisual(car){
  if(!car)return;
  car.userData.dmgParts.forEach(function(p){
    var b=p.userData.base; if(!b)return;
    p.position.set(b.px,b.py,b.pz); p.rotation.set(b.rx,b.ry,b.rz);
  });
}

/* ---------- трасса ---------- */
var ROAD_W=16;
var TRACK_WP=[[0,-255],[115,-238],[196,-182],[232,-96],[214,-8],[152,48],[96,98],[124,170],[70,242],[-24,262],[-112,232],[-172,166],[-222,74],[-236,-32],[-198,-136],[-112,-220]];
var curve=new THREE.CatmullRomCurve3(TRACK_WP.map(function(p){return new THREE.Vector3(p[0],0,p[1]);}),true,'catmullrom',.5);
var ROAD_N=760;
var RP=curve.getSpacedPoints(ROAD_N).slice(0,ROAD_N);
var trackLen=curve.getLength();
var GATES_N=12;
function roadNormal(i){
  var p=RP[i],q=RP[(i+1)%ROAD_N];
  var tx=q.x-p.x,tz=q.z-p.z,l=Math.hypot(tx,tz)||1; tx/=l; tz/=l;
  return {tx:tx,tz:tz,nx:-tz,nz:tx};
}
function distToRoad(x,z){
  var best=1e12;
  for(var i=0;i<ROAD_N;i+=4){var p=RP[i],dx=x-p.x,dz=z-p.z,d=dx*dx+dz*dz;if(d<best)best=d;}
  return Math.sqrt(best);
}
function roadAt(f,lat){
  var i=Math.floor(((f%1)+1)%1*ROAD_N)%ROAD_N;
  var p=RP[i],n=roadNormal(i);
  return {x:p.x+n.nx*lat,z:p.z+n.nz*lat,yaw:Math.atan2(n.tx,n.tz),i:i};
}

/* ---------- коллекции ---------- */
var clouds=[],lamps=[],obstacles=[],pendulums=[],crushers=[],sweepers=[],coins=[],rivals=[],debris=[],skids=[],gates=[];
var worldGroup=new THREE.Group(); gScene.add(worldGroup);
var obsGroup=new THREE.Group(); gScene.add(obsGroup);
var gateGroup=new THREE.Group(); gScene.add(gateGroup);
var coinGroup=new THREE.Group(); gScene.add(coinGroup);
var fxGroup=new THREE.Group(); gScene.add(fxGroup);
var rivalGroup=new THREE.Group(); gScene.add(rivalGroup);

function buildWorld(){
  var ground=new THREE.Mesh(new THREE.PlaneGeometry(1500,1500),new THREE.MeshStandardMaterial({map:texGrass,roughness:.96}));
  ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; worldGroup.add(ground);
  var pos=[],uv=[],idx=[];
  for(var i=0;i<ROAD_N;i++){
    var p=RP[i],n=roadNormal(i);
    pos.push(p.x+n.nx*ROAD_W/2,.04,p.z+n.nz*ROAD_W/2);
    pos.push(p.x-n.nx*ROAD_W/2,.04,p.z-n.nz*ROAD_W/2);
    uv.push(0,i*.34,1,i*.34);
    var a=i*2,b=i*2+1,c=((i+1)%ROAD_N)*2,d=((i+1)%ROAD_N)*2+1;
    idx.push(a,b,c,b,d,c);
  }
  var rg=new THREE.BufferGeometry();
  rg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  rg.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  rg.setIndex(idx); rg.computeVertexNormals();
  var road=new THREE.Mesh(rg,new THREE.MeshStandardMaterial({map:texRoad,roughness:.82}));
  road.receiveShadow=true; worldGroup.add(road);
  [-1,1].forEach(function(s){
    var cp=[],cu=[],ci=[];
    for(var i=0;i<ROAD_N;i++){
      var p=RP[i],n=roadNormal(i),o1=ROAD_W/2,o2=ROAD_W/2+.9;
      cp.push(p.x+n.nx*o1*s,.11,p.z+n.nz*o1*s);
      cp.push(p.x+n.nx*o2*s,.05,p.z+n.nz*o2*s);
      cu.push(0,i*.5,1,i*.5);
      var a=i*2,b=i*2+1,c=((i+1)%ROAD_N)*2,d=((i+1)%ROAD_N)*2+1;
      ci.push(a,b,c,b,d,c);
    }
    var cg=new THREE.BufferGeometry();
    cg.setAttribute('position',new THREE.Float32BufferAttribute(cp,3));
    cg.setAttribute('uv',new THREE.Float32BufferAttribute(cu,2));
    cg.setIndex(ci); cg.computeVertexNormals();
    var curb=new THREE.Mesh(cg,new THREE.MeshStandardMaterial({map:texCurb,roughness:.7}));
    curb.receiveShadow=true; worldGroup.add(curb);
  });
  var rockM=new THREE.MeshStandardMaterial({color:0x7b8290,roughness:.96,flatShading:true});
  var rockM2=new THREE.MeshStandardMaterial({color:0x6a7180,roughness:.96,flatShading:true});
  var snowM=new THREE.MeshStandardMaterial({color:0xf6f9fc,roughness:.78,flatShading:true});
  for(var m=0;m<30;m++){
    var a=m/30*TAU+rnd(-.08,.08),R=rnd(430,640),h=rnd(85,225),rad=rnd(70,135);
    var mm=new THREE.Mesh(new THREE.ConeGeometry(rad,h,7),m%2?rockM:rockM2);
    mm.position.set(Math.sin(a)*R,h/2-6,Math.cos(a)*R); mm.rotation.y=rnd(0,TAU); worldGroup.add(mm);
    if(h>120){
      var sn=new THREE.Mesh(new THREE.ConeGeometry(rad*.36,h*.32,7),snowM);
      sn.position.set(mm.position.x,h*.81,mm.position.z); sn.rotation.y=mm.rotation.y; worldGroup.add(sn);
    }
  }
  var hillM=new THREE.MeshStandardMaterial({color:0x5c7f49,roughness:.95,flatShading:true});
  for(var hh=0;hh<20;hh++){
    var ha=rnd(0,TAU),hR=rnd(280,390),hh2=rnd(20,52);
    var hm=new THREE.Mesh(new THREE.ConeGeometry(rnd(34,72),hh2,8),hillM);
    hm.position.set(Math.sin(ha)*hR,hh2/2-3,Math.cos(ha)*hR); worldGroup.add(hm);
  }
  var lake=new THREE.Mesh(new THREE.CircleGeometry(52,40),
    new THREE.MeshStandardMaterial({color:0x2f6f9e,metalness:.85,roughness:.14,envMapIntensity:1.3,transparent:true,opacity:.92}));
  lake.rotation.x=-Math.PI/2; lake.position.set(-330,.06,190); worldGroup.add(lake);
  var shore=new THREE.Mesh(new THREE.RingGeometry(52,58,40),new THREE.MeshStandardMaterial({color:0xc2b280,roughness:.95}));
  shore.rotation.x=-Math.PI/2; shore.position.set(-330,.05,190); worldGroup.add(shore);
  var trunkM=new THREE.MeshStandardMaterial({color:0x5a3a22,roughness:.92});
  var leafM=new THREE.MeshStandardMaterial({color:0x2f6b2a,roughness:.9,flatShading:true});
  var leafM2=new THREE.MeshStandardMaterial({color:0x3d7c33,roughness:.9,flatShading:true});
  var trunkG=new THREE.CylinderGeometry(.26,.42,2.6,6);
  var leafG=new THREE.ConeGeometry(2.0,4.6,7);
  for(var t=0;t<150;t++){
    var ta=rnd(0,TAU),tR=rnd(55,370),tx=Math.sin(ta)*tR,tz=Math.cos(ta)*tR;
    if(distToRoad(tx,tz)<ROAD_W/2+7)continue;
    if(Math.hypot(tx+330,tz-190)<62)continue;
    var tr=new THREE.Group();
    var trm=new THREE.Mesh(trunkG,trunkM); trm.position.y=1.3; trm.castShadow=true; tr.add(trm);
    var l1=new THREE.Mesh(leafG,t%3?leafM:leafM2); l1.position.y=4.1; l1.castShadow=true; tr.add(l1);
    var l2=new THREE.Mesh(leafG,leafM); l2.scale.setScalar(.72); l2.position.y=6.1; tr.add(l2);
    var l3=new THREE.Mesh(leafG,leafM2); l3.scale.setScalar(.46); l3.position.y=7.6; tr.add(l3);
    tr.position.set(tx,0,tz); tr.scale.setScalar(rnd(.75,1.6)); tr.rotation.y=rnd(0,TAU);
    tr.userData.tree=true; worldGroup.add(tr);
  }
  var rockG=new THREE.IcosahedronGeometry(1,0);
  for(var r=0;r<44;r++){
    var ra=rnd(0,TAU),rR=rnd(45,340),rx=Math.sin(ra)*rR,rz=Math.cos(ra)*rR;
    if(distToRoad(rx,rz)<ROAD_W/2+5)continue;
    var rm=new THREE.Mesh(rockG,rockM);
    rm.position.set(rx,rnd(.2,.7),rz); rm.scale.setScalar(rnd(.6,2.4));
    rm.rotation.set(rnd(0,3),rnd(0,3),rnd(0,3)); rm.castShadow=true; worldGroup.add(rm);
  }
  var poleM=new THREE.MeshStandardMaterial({color:0x39424f,metalness:.6,roughness:.5});
  var lampM=new THREE.MeshStandardMaterial({color:0xfff0c0,emissive:0xffdf9a,emissiveIntensity:0});
  for(var li=0;li<ROAD_N;li+=32){
    var ln=roadNormal(li),lp=RP[li],ls=(li/32)%2?1:-1;
    var lg=new THREE.Group();
    var pole=new THREE.Mesh(new THREE.CylinderGeometry(.11,.16,7,7),poleM);
    pole.position.y=3.5; pole.castShadow=true; lg.add(pole);
    var arm=new THREE.Mesh(new THREE.BoxGeometry(1.7,.12,.12),poleM);
    arm.position.set(-ls*.85,6.9,0); lg.add(arm);
    var head=new THREE.Mesh(new THREE.BoxGeometry(.7,.2,.42),lampM);
    head.position.set(-ls*1.6,6.78,0); lg.add(head);
    lg.position.set(lp.x+ln.nx*(ROAD_W/2+2.2)*ls,0,lp.z+ln.nz*(ROAD_W/2+2.2)*ls);
    lg.rotation.y=Math.atan2(ln.tx,ln.tz);
    worldGroup.add(lg); lamps.push(head);
  }
  var cloudM=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,transparent:true,opacity:.92});
  for(var ci2=0;ci2<14;ci2++){
    var cl=new THREE.Group();
    for(var j=0;j<5;j++){
      var cs=new THREE.Mesh(new THREE.SphereGeometry(rnd(7,14),8,6),cloudM);
      cs.position.set(rnd(-18,18),rnd(-3,3),rnd(-8,8)); cs.scale.y=.48; cl.add(cs);
    }
    cl.position.set(rnd(-560,560),rnd(78,140),rnd(-560,560));
    cl.userData.v=rnd(1.2,3.4); worldGroup.add(cl); clouds.push(cl);
  }
  var st=RP[0],sn2=roadNormal(0);
  var gantry=new THREE.Group();
  var gM=new THREE.MeshStandardMaterial({color:0x1f2937,metalness:.6,roughness:.4});
  [-1,1].forEach(function(s){
    var post=new THREE.Mesh(new THREE.BoxGeometry(.6,8,.6),gM);
    post.position.set(s*(ROAD_W/2+1),4,0); post.castShadow=true; gantry.add(post);
  });
  var beam=new THREE.Mesh(new THREE.BoxGeometry(ROAD_W+3.2,1.5,.7),gM);
  beam.position.y=7.6; gantry.add(beam);
  var banner=new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W+2.6,1.2),new THREE.MeshBasicMaterial({map:texChecker,side:THREE.DoubleSide}));
  banner.position.set(0,7.6,.38); gantry.add(banner);
  var startLine=new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W,2.2),new THREE.MeshBasicMaterial({map:texChecker}));
  startLine.rotation.x=-Math.PI/2; startLine.position.y=.06; gantry.add(startLine);
  gantry.position.set(st.x,0,st.z); gantry.rotation.y=Math.atan2(sn2.tx,sn2.tz);
  worldGroup.add(gantry);
}
function buildGates(){
  for(var i=0;i<GATES_N;i++){
    var idx=Math.floor(i/GATES_N*ROAD_N)%ROAD_N;
    var p=RP[idx],n=roadNormal(idx),finish=(i===0);
    var col=finish?0xfbbf24:0x22d3ee;
    var mat=new THREE.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:1.3,transparent:true,opacity:.42});
    var ring=new THREE.Mesh(new THREE.TorusGeometry(5.4,.34,10,44),mat);
    ring.position.set(p.x,3.4,p.z); ring.rotation.y=Math.atan2(n.tx,n.tz);
    gateGroup.add(ring);
    var postM=new THREE.MeshStandardMaterial({color:0x28323f,metalness:.55,roughness:.5});
    [-1,1].forEach(function(s){
      var post=new THREE.Mesh(new THREE.CylinderGeometry(.22,.3,3.6,8),postM);
      post.position.set(p.x+n.nx*s*(ROAD_W/2-.7),1.8,p.z+n.nz*s*(ROAD_W/2-.7));
      post.castShadow=true; gateGroup.add(post);
      var cap=new THREE.Mesh(new THREE.SphereGeometry(.26,10,8),new THREE.MeshStandardMaterial({color:col,emissive:col,emissiveIntensity:1.4}));
      cap.position.set(post.position.x,3.7,post.position.z); gateGroup.add(cap);
    });
    gates.push({x:p.x,z:p.z,dx:n.tx,dz:n.tz,ring:ring,mat:mat,finish:finish,idx:i});
  }
}
var START={x:RP[0].x,z:RP[0].z,yaw:Math.atan2(roadNormal(0).tx,roadNormal(0).tz)};

/* ---------- препятствия ---------- */
function clearGroup(g){ while(g.children.length){var c=g.children[0];g.remove(c);disposeTree(c);} }
function buildObstacles(){
  clearGroup(obsGroup);
  obstacles.length=0; pendulums.length=0; crushers.length=0; sweepers.length=0;
  var concM=new THREE.MeshStandardMaterial({color:0x9aa1ab,roughness:.86});
  var hazM=new THREE.MeshStandardMaterial({map:texHazard,roughness:.68});
  var metalM=new THREE.MeshStandardMaterial({color:0x3a4150,metalness:.75,roughness:.38});
  var frameM=new THREE.MeshStandardMaterial({color:0xf5c542,metalness:.4,roughness:.5});
  var D=SET.diff;
  [[.055,0],[.235,0],[.44,0],[.63,0],[.845,0]].forEach(function(q){
    var p=roadAt(q[0],q[1]);
    var m=new THREE.Mesh(new THREE.BoxGeometry(9,.5,12),hazM);
    m.position.set(p.x,1.05,p.z); m.rotation.y=p.yaw; m.rotateX(-.3);
    m.castShadow=true; m.receiveShadow=true; obsGroup.add(m);
    obstacles.push({type:'ramp',x:p.x,z:p.z,yaw:p.yaw,hx:4.5,hz:6,r:7,alive:true,cd:0,mesh:m});
  });
  var barrelN=D===0?14:D===1?20:26;
  for(var i=0;i<barrelN;i++){
    var bp=roadAt(rnd(.02,.98),rnd(-5.5,5.5));
    var bm=new THREE.Mesh(new THREE.CylinderGeometry(.56,.56,1.25,12),
      new THREE.MeshStandardMaterial({color:i%3?0xff6a1a:0xd7263d,metalness:.45,roughness:.5}));
    bm.position.set(bp.x,.63,bp.z); bm.castShadow=true; obsGroup.add(bm);
    var band=new THREE.Mesh(new THREE.TorusGeometry(.57,.05,6,14),metalM);
    band.rotation.x=Math.PI/2; band.position.y=.2; bm.add(band);
    obstacles.push({type:'barrel',x:bp.x,z:bp.z,yaw:0,hx:.6,hz:.6,r:.75,alive:true,cd:0,mesh:bm});
  }
  for(var c=0;c<22;c++){
    var cp=roadAt(rnd(.02,.98),rnd(-6.5,6.5));
    var cm=new THREE.Mesh(new THREE.ConeGeometry(.36,.85,10),new THREE.MeshStandardMaterial({color:0xff7a1a,roughness:.6}));
    cm.position.set(cp.x,.43,cp.z); cm.castShadow=true; obsGroup.add(cm);
    obstacles.push({type:'cone',x:cp.x,z:cp.z,yaw:0,hx:.4,hz:.4,r:.5,alive:true,cd:0,mesh:cm});
  }
  [[.12,5],[.2,-5],[.33,5],[.5,-5],[.68,5],[.78,-5],[.92,4.5]].forEach(function(q){
    var p=roadAt(q[0],q[1]);
    var g=new THREE.Group();
    var w=new THREE.Mesh(new THREE.BoxGeometry(5.4,1.7,.8),concM);
    w.position.y=.85; w.castShadow=true; g.add(w);
    var hz=new THREE.Mesh(new THREE.BoxGeometry(5.4,.26,.82),hazM);
    hz.position.y=1.83; g.add(hz);
    g.position.set(p.x,0,p.z); g.rotation.y=p.yaw+Math.PI/2; obsGroup.add(g);
    obstacles.push({type:'wall',x:p.x,z:p.z,yaw:p.yaw+Math.PI/2,hx:2.7,hz:.5,r:3.4,alive:true,cd:0,mesh:g});
  });
  [[.17,0],[.4,0],[.58,0],[.87,0]].forEach(function(q){
    var p=roadAt(q[0],q[1]);
    var g=new THREE.Group();
    var base=new THREE.Mesh(new THREE.BoxGeometry(7,.16,1.7),new THREE.MeshStandardMaterial({color:0x20242b,roughness:.8}));
    base.position.y=.08; g.add(base);
    for(var i=0;i<7;i++){var sp=new THREE.Mesh(new THREE.ConeGeometry(.15,.55,6),concM);sp.position.set(-3+i,.42,0);g.add(sp);}
    g.position.set(p.x,0,p.z); g.rotation.y=p.yaw; obsGroup.add(g);
    obstacles.push({type:'spikes',x:p.x,z:p.z,yaw:p.yaw,hx:3.5,hz:1,r:3.8,alive:true,cd:0,mesh:g});
  });
  [[.09,0],[.29,0],[.48,0],[.66,0],[.9,0]].forEach(function(q){
    var p=roadAt(q[0],q[1]);
    var m=new THREE.Mesh(new THREE.PlaneGeometry(4.6,7),new THREE.MeshBasicMaterial({map:texBoost,transparent:true,opacity:.85,depthWrite:false}));
    m.rotation.x=-Math.PI/2; m.rotation.z=-p.yaw; m.position.set(p.x,.07,p.z); obsGroup.add(m);
    obstacles.push({type:'boost',x:p.x,z:p.z,yaw:p.yaw,hx:2.3,hz:3.5,r:4,alive:true,cd:0,mesh:m});
  });
  [[.26,2],[.55,-2],[.73,2.5]].forEach(function(q){
    var p=roadAt(q[0],q[1]);
    var m=new THREE.Mesh(new THREE.PlaneGeometry(7,7),new THREE.MeshBasicMaterial({map:texOil,transparent:true,opacity:.9,depthWrite:false}));
    m.rotation.x=-Math.PI/2; m.position.set(p.x,.065,p.z); obsGroup.add(m);
    obstacles.push({type:'oil',x:p.x,z:p.z,yaw:0,hx:3.2,hz:3.2,r:3.6,alive:true,cd:0,mesh:m});
  });
  [[.35,0],[.8,0]].forEach(function(q,k){
    var p=roadAt(q[0],q[1]);
    var g=new THREE.Group();
    [-1,1].forEach(function(s){
      var post=new THREE.Mesh(new THREE.CylinderGeometry(.26,.32,7.4,8),frameM);
      post.position.set(s*4.4,3.7,0); post.castShadow=true; g.add(post);
    });
    var bar=new THREE.Mesh(new THREE.BoxGeometry(9.4,.42,.42),frameM);
    bar.position.y=7.4; g.add(bar);
    var arm=new THREE.Group(); arm.position.y=7.4; g.add(arm);
    var chain=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,4.1,6),metalM);
    chain.position.y=-2.05; arm.add(chain);
    var ball=new THREE.Mesh(new THREE.SphereGeometry(1.35,16,12),metalM);
    ball.position.y=-4.6; ball.castShadow=true; arm.add(ball);
    g.position.set(p.x,0,p.z); g.rotation.y=p.yaw; obsGroup.add(g);
    var ref={arm:arm,ball:ball,cd:0,phase:k*2.3,speed:1.05+k*.32};
    pendulums.push(ref);
    obstacles.push({type:'pend',x:p.x,z:p.z,yaw:p.yaw,hx:4.4,hz:2,r:6,alive:true,cd:0,mesh:g,ref:ref});
  });
  if(D>=1){
    [[.155,0],[.62,0]].forEach(function(q,k){
      var p=roadAt(q[0],q[1]);
      var g=new THREE.Group();
      var block=new THREE.Mesh(new THREE.BoxGeometry(3.4,2.6,2.2),new THREE.MeshStandardMaterial({color:0xd7263d,metalness:.5,roughness:.45}));
      block.position.y=1.3; block.castShadow=true; g.add(block);
      var stripe=new THREE.Mesh(new THREE.BoxGeometry(3.45,.4,2.25),hazM);
      stripe.position.y=2.2; g.add(stripe);
      var n=roadNormal(p.i);
      g.position.set(p.x,0,p.z); g.rotation.y=p.yaw; obsGroup.add(g);
      var cr={mesh:g,baseX:p.x,baseZ:p.z,nx:n.nx,nz:n.nz,amp:5.4,speed:.8+k*.25,phase:k*1.7,x:p.x,z:p.z};
      crushers.push(cr);
      obstacles.push({type:'crusher',x:p.x,z:p.z,yaw:p.yaw,hx:1.7,hz:1.1,r:3,alive:true,cd:0,mesh:g,ref:cr});
    });
    [[.47,0],[.88,0]].forEach(function(q,k){
      var p=roadAt(q[0],q[1]);
      var g=new THREE.Group();
      var hub=new THREE.Mesh(new THREE.CylinderGeometry(.5,.6,2.4,10),frameM);
      hub.position.y=1.2; hub.castShadow=true; g.add(hub);
      var arm=new THREE.Group(); arm.position.y=1.3; g.add(arm);
      var bar=new THREE.Mesh(new THREE.BoxGeometry(11,.34,.5),new THREE.MeshStandardMaterial({color:0xf5c542,metalness:.4,roughness:.5}));
      bar.castShadow=true; arm.add(bar);
      [-1,1].forEach(function(s){
        var tip=new THREE.Mesh(new THREE.SphereGeometry(.6,12,10),metalM);
        tip.position.x=s*5.4; tip.castShadow=true; arm.add(tip);
      });
      g.position.set(p.x,0,p.z); obsGroup.add(g);
      var sw={mesh:g,arm:arm,x:p.x,z:p.z,speed:(k?-1:1)*(1.1+D*.2),angle:rnd(0,TAU)};
      sweepers.push(sw);
      obstacles.push({type:'sweeper',x:p.x,z:p.z,yaw:0,hx:1,hz:1,r:6.4,alive:true,cd:0,mesh:g,ref:sw});
    });
  }
}
function buildCoins(){
  clearGroup(coinGroup); coins.length=0;
  var n=SET.mode==='free'?46:22;
  var coinM=new THREE.MeshStandardMaterial({map:texCoin,emissive:0xfbbf24,emissiveIntensity:.35,metalness:.7,roughness:.3,side:THREE.DoubleSide});
  var geo=new THREE.CircleGeometry(.62,16);
  for(var i=0;i<n;i++){
    var p=roadAt((i+.5)/n,rnd(-5,5));
    var m=new THREE.Mesh(geo,coinM);
    m.position.set(p.x,1.35,p.z); coinGroup.add(m);
    coins.push({mesh:m,x:p.x,z:p.z,taken:false,ph:rnd(0,TAU)});
  }
}

/* ---------- частицы / следы / обломки / дождь ---------- */
var P_MAX=340;
var pGeo=new THREE.BufferGeometry();
var pPos=new Float32Array(P_MAX*3),pCol=new Float32Array(P_MAX*3);
pGeo.setAttribute('position',new THREE.BufferAttribute(pPos,3).setUsage(THREE.DynamicDrawUsage));
pGeo.setAttribute('color',new THREE.BufferAttribute(pCol,3).setUsage(THREE.DynamicDrawUsage));
var pMat=new THREE.PointsMaterial({size:.34,vertexColors:true,transparent:true,opacity:.95,depthWrite:false});
var points=new THREE.Points(pGeo,pMat); points.frustumCulled=false; gScene.add(points);
var parts=[];
for(var pp=0;pp<P_MAX;pp++){parts.push({life:0,vx:0,vy:0,vz:0,grav:0});pPos[pp*3+1]=-999;}
var pCursor=0,tmpC=new THREE.Color();
function emit(x,y,z,n,opt){
  for(var k=0;k<n;k++){
    var i=pCursor; pCursor=(pCursor+1)%P_MAX;
    var p=parts[i];
    p.life=opt.life||.6; p.grav=(opt.grav!=null?opt.grav:-6);
    p.vx=rnd(-1,1)*(opt.spread||2)+(opt.vx||0);
    p.vy=rnd(.3,1)*(opt.up||2);
    p.vz=rnd(-1,1)*(opt.spread||2)+(opt.vz||0);
    pPos[i*3]=x+rnd(-.3,.3); pPos[i*3+1]=y; pPos[i*3+2]=z+rnd(-.3,.3);
    tmpC.setHex(opt.colors[rndi(0,opt.colors.length-1)]);
    pCol[i*3]=tmpC.r; pCol[i*3+1]=tmpC.g; pCol[i*3+2]=tmpC.b;
  }
  pGeo.attributes.color.needsUpdate=true;
}
function updateParts(dt){
  var any=false;
  for(var i=0;i<P_MAX;i++){
    var p=parts[i]; if(p.life<=0)continue;
    any=true; p.life-=dt;
    if(p.life<=0){pPos[i*3+1]=-999;continue;}
    p.vy+=p.grav*dt;
    pPos[i*3]+=p.vx*dt; pPos[i*3+1]+=p.vy*dt; pPos[i*3+2]+=p.vz*dt;
    if(pPos[i*3+1]<.05){pPos[i*3+1]=.05;p.vy*=-.28;p.vx*=.7;p.vz*=.7;}
  }
  if(any)pGeo.attributes.position.needsUpdate=true;
}
function clearParts(){ for(var i=0;i<P_MAX;i++){parts[i].life=0;pPos[i*3+1]=-999;} pGeo.attributes.position.needsUpdate=true; }
var skidGeo=new THREE.PlaneGeometry(.34,1.1),SKID_MAX=70;
function addSkid(x,z,yaw){
  var s;
  if(skids.length<SKID_MAX){
    var m=new THREE.Mesh(skidGeo,new THREE.MeshBasicMaterial({map:texSkid,transparent:true,opacity:.75,depthWrite:false}));
    m.rotation.x=-Math.PI/2; fxGroup.add(m);
    s={mesh:m,life:6}; skids.push(s);
  }else{ s=skids.shift(); skids.push(s); s.life=6; }
  s.mesh.position.set(x,.055,z); s.mesh.rotation.z=-yaw;
  s.mesh.material.opacity=.75; s.mesh.visible=true;
}
function updateSkids(dt){
  for(var i=0;i<skids.length;i++){
    var s=skids[i]; if(s.life<=0)continue;
    s.life-=dt;
    if(s.life<=0){s.mesh.visible=false;continue;}
    s.mesh.material.opacity=clamp(s.life/6,0,1)*.75;
  }
}
function clearSkids(){ skids.forEach(function(s){s.life=0;s.mesh.visible=false;}); }
function spawnDebris(mesh,vx,vy,vz){
  fxGroup.attach(mesh);
  if(mesh.material&&!Array.isArray(mesh.material)){mesh.material=mesh.material.clone();mesh.material.transparent=true;}
  debris.push({mesh:mesh,vx:vx,vy:vy,vz:vz,rx:rnd(-6,6),rz:rnd(-6,6),life:2.4,max:2.4});
}
function updateDebris(dt){
  for(var i=debris.length-1;i>=0;i--){
    var d=debris[i]; d.life-=dt;
    if(d.life<=0){fxGroup.remove(d.mesh);disposeTree(d.mesh);debris.splice(i,1);continue;}
    d.vy-=19*dt;
    d.mesh.position.x+=d.vx*dt; d.mesh.position.y+=d.vy*dt; d.mesh.position.z+=d.vz*dt;
    if(d.mesh.position.y<.3){d.mesh.position.y=.3;d.vy*=-.34;d.vx*=.7;d.vz*=.7;}
    d.mesh.rotation.x+=d.rx*dt; d.mesh.rotation.z+=d.rz*dt;
    if(d.mesh.material)d.mesh.material.opacity=clamp(d.life/d.max,0,1);
  }
}
function clearDebris(){ while(debris.length){var d=debris.pop();fxGroup.remove(d.mesh);disposeTree(d.mesh);} }
var RAIN_MAX=700;
var rainGeo=new THREE.BufferGeometry();
var rainPos=new Float32Array(RAIN_MAX*3);
for(var rp=0;rp<RAIN_MAX;rp++){rainPos[rp*3]=rnd(-60,60);rainPos[rp*3+1]=rnd(0,50);rainPos[rp*3+2]=rnd(-60,60);}
rainGeo.setAttribute('position',new THREE.BufferAttribute(rainPos,3).setUsage(THREE.DynamicDrawUsage));
var rainMat=new THREE.PointsMaterial({color:0xbcd8f0,size:.16,transparent:true,opacity:.6,depthWrite:false});
var rain=new THREE.Points(rainGeo,rainMat); rain.frustumCulled=false; rain.visible=false; gScene.add(rain);
function updateRain(dt,cx,cz){
  if(!rain.visible)return;
  var n=SET.quality==='high'?RAIN_MAX:280;
  for(var i=0;i<n;i++){
    rainPos[i*3+1]-=(38+(i%7)*3)*dt;
    if(rainPos[i*3+1]<0){rainPos[i*3]=cx+rnd(-55,55);rainPos[i*3+1]=rnd(34,52);rainPos[i*3+2]=cz+rnd(-55,55);}
  }
  rainGeo.attributes.position.needsUpdate=true;
}

/* ---------- соперники ---------- */
var RIVAL_PAINTS=[0x0ea5e9,0x16a34a,0xfbbf24,0xa855f7];
var RIVAL_POOL=['camry','chal','gtr','x5','supra','p911'];
function buildRivals(){
  clearGroup(rivalGroup); rivals.length=0;
  var n=MODES[SET.mode].rivals;
  for(var i=0;i<n;i++){
    var cid=RIVAL_POOL[(i+rndi(0,2))%RIVAL_POOL.length],cfg=null;
    for(var k=0;k<CARS.length;k++)if(CARS[k].id===cid)cfg=CARS[k];
    if(!cfg)cfg=CARS[2];
    var car=buildCar(cfg,RIVAL_PAINTS[i%RIVAL_PAINTS.length],RIMS[1],{simple:true});
    rivalGroup.add(car);
    var t0=((0-(i+1)*7/trackLen)%1+1)%1;
    rivals.push({car:car,cfg:cfg,t:t0,dist:t0*trackLen,lap:0,line:rnd(-3.4,3.4),phase:rnd(0,TAU),
      speed:0,x:0,z:0,yaw:0,finished:false,order:0,nearCd:0,hitCd:0,kick:0,skill:rnd(.9,1.06),traffic:SET.mode==='free'});
  }
  setNightAll();
}
function updateRivals(dt){
  var df=DIFFS[SET.diff];
  rivals.forEach(function(r){
    var targetBase=r.cfg.top/3.6*(r.traffic?.42:df.ai*r.skill);
    var i=Math.floor(r.t*ROAD_N)%ROAD_N;
    var n1=roadNormal(i),n2=roadNormal((i+14)%ROAD_N);
    var dot=clamp(n1.tx*n2.tx+n1.tz*n2.tz,-1,1);
    var corner=clamp(.42+dot*.6,.42,1);
    var target=targetBase*corner;
    if(r.finished)target=8;
    if(SET.weather==='rain')target*=.86;
    r.speed=lerp(r.speed,target,dt*(r.speed<target?.9:2.2));
    r.dist+=r.speed*dt;
    if(r.dist>=trackLen){
      r.dist-=trackLen; r.lap++;
      if(!r.traffic&&r.lap>=MODES[SET.mode].laps&&!r.finished){r.finished=true;r.order=++finishCounter;}
    }
    r.t=(r.dist/trackLen)%1;
    var fi=r.t*ROAD_N,i0=Math.floor(fi)%ROAD_N,i1=(i0+1)%ROAD_N,fr=fi-Math.floor(fi);
    var p0=RP[i0],p1=RP[i1];
    var bx=lerp(p0.x,p1.x,fr),bz=lerp(p0.z,p1.z,fr);
    var n=roadNormal(i0);
    r.kick=lerp(r.kick,0,dt*2);
    var line=r.line+Math.sin(r.t*TAU*3+r.phase)*1.9+r.kick;
    r.x=bx+n.nx*line; r.z=bz+n.nz*line;
    r.yaw=Math.atan2(n.tx,n.tz);
    r.car.position.set(r.x,0,r.z); r.car.rotation.y=r.yaw;
    r.car.userData.wheels.forEach(function(w){w.spin.rotation.x-=r.speed*dt/w.r;});
    if(r.nearCd>0)r.nearCd-=dt;
    if(r.hitCd>0)r.hitCd-=dt;
  });
}

/* ---------- состояние ---------- */
var state='showroom',prevState='race',stateT=0,lastT=performance.now(),frame=0;
var selCar=0,shCar=null,gameCar=null,gameCarKey='';
var shAngle=.7,shVel=.004,shRadius=9,shHeight=2.7;
var raceTime=45,raceElapsed=0,score=0,driftBank=0,wreckCount=0,coinCount=0;
var gateNext=1,lap=0,dmg=0,nos=0,nosActive=false;
var airTime=0,shake=0,camMode=0,camYawOff=0,chaseDist=8.4;
var countT=0,lastCountShown=-1,lastTickSec=-1,finishCounter=0,playerPos=1;
var driftCombo=1,driftTimer=0,driftScore=0,oilTimer=0,gear=1,rpm=0,shiftCd=0;
var credits=store.get('tv_credits',0),unlocked=store.get('tv_unlocked',{});
var respawn={x:START.x,z:START.z,yaw:START.yaw};
var tutorialDone=store.get('tv_tut',false);
var phys={x:START.x,z:START.z,y:1,vx:0,vy:0,vz:0,yaw:START.yaw,grounded:true};
var input={steer:0,gas:false,brake:false,hand:false,nos:false};
var keys={},joyPid=null;
var guide=new THREE.Mesh(new THREE.ConeGeometry(.42,1.2,4),new THREE.MeshStandardMaterial({color:0x22d3ee,emissive:0x22d3ee,emissiveIntensity:1.6}));
guide.rotation.x=Math.PI/2; guide.visible=false; gScene.add(guide);
function carCfg(){return CARS[selCar];}
function restH(){return carCfg().r+.3;}
function fwd(){return {x:Math.sin(phys.yaw),z:Math.cos(phys.yaw)};}
function forwardSpeed(){var f=fwd();return phys.vx*f.x+phys.vz*f.z;}
function isUnlocked(c){return c.cost===0||!!unlocked[c.id];}
function bankCredits(n){credits+=n;store.set('tv_credits',credits);$('credChip').textContent='₡ '+credits;}
function bestKey(){return 'tv_best_'+carCfg().id+'_'+SET.mode;}

/* ---------- салон UI ---------- */
function renderSlider(){
  var sl=$('slider'); sl.innerHTML='';
  CARS.forEach(function(c,i){
    var lock=!isUnlocked(c);
    var d=document.createElement('div');
    d.className='card'+(i===selCar?' on':'')+(lock?' lock':'');
    var col=i===selCar?'#22d3ee':'#5b7396';
    d.innerHTML='<svg viewBox="0 0 52 40"><path d="'+SIL[c.type]+'" fill="'+col+'"/>'+
      '<circle cx="14" cy="34" r="5" fill="#0b1220" stroke="#8fa3c0" stroke-width="1.6"/>'+
      '<circle cx="40" cy="34" r="5" fill="#0b1220" stroke="#8fa3c0" stroke-width="1.6"/></svg>'+
      '<div class="nm">'+c.name+'</div><div class="hp">'+c.hp+' л.с. · '+c.top+' км/ч</div>'+
      (lock?'<div class="lk">🔒 ₡'+c.cost+'</div>':'');
    d.addEventListener('click',function(){
      Snd.init(); Snd.resume();
      if(lock){
        if(credits>=c.cost){
          bankCredits(-c.cost); unlocked[c.id]=true; store.set('tv_unlocked',unlocked);
          Snd.unlock(); toast('ОТКРЫТО: '+c.name,'good'); selectCar(i);
        }else{ Snd.beep(200,.18,'square',.1); toast('НУЖНО ₡'+(c.cost-credits)+' ЕЩЁ','warn'); }
        return;
      }
      Snd.ui(); selectCar(i);
    });
    sl.appendChild(d);
  });
}
function renderSwatches(){
  var w=$('swatches'); w.innerHTML='';
  PAINTS.forEach(function(p,i){
    var b=document.createElement('button');
    b.className='sw'+(i===SET.paint?' on':'');
    b.style.background='#'+p.toString(16).padStart(6,'0');
    b.addEventListener('click',function(){Snd.ui();SET.paint=i;store.set('tv_paint',i);selectCar(selCar);gameCarKey='';});
    w.appendChild(b);
  });
  var rw=$('rimSwatches'); rw.innerHTML='';
  RIMS.forEach(function(p,i){
    var b=document.createElement('button');
    b.className='sw rim'+(i===SET.rim?' on':'');
    b.style.background='#'+p.toString(16).padStart(6,'0');
    b.addEventListener('click',function(){Snd.ui();SET.rim=i;store.set('tv_rim',i);selectCar(selCar);gameCarKey='';});
    rw.appendChild(b);
  });
}
function selectCar(i){
  selCar=i;
  if(shCar){platform.remove(shCar);disposeTree(shCar);}
  shCar=buildCar(CARS[i],PAINTS[SET.paint],RIMS[SET.rim],{glow:SET.glow,stripe:SET.stripe});
  shCar.position.y=.28; platform.add(shCar);
  var c=CARS[i];
  $('carName').textContent=c.name; $('carKlass').textContent=c.klass;
  $('hpN').textContent=c.hp+' л.с.'; $('topN').textContent=c.top+' км/ч';
  $('gripN').textContent=Math.round(c.grip*100)+'%'; $('offN').textContent=Math.round(c.off*100)+'%';
  $('driveChip').textContent=c.drive+' ПРИВОД'+(c.drift?' · ДРИФТ':'');
  document.querySelector('#barHp .fl').style.width=clamp(c.hp/1500*100,6,100)+'%';
  document.querySelector('#barTop .fl').style.width=clamp(c.top/390*100,6,100)+'%';
  document.querySelector('#barGrip .fl').style.width=(c.grip*100)+'%';
  document.querySelector('#barOff .fl').style.width=(c.off*100)+'%';
  $('bestChip').textContent='РЕКОРД '+store.get(bestKey(),0);
  renderSlider();
}
function updateStartSub(){ $('startSub').textContent=MODES[SET.mode].name+' · '+DIFFS[SET.diff].name; }
function bindSeg(id,key,cast,after){
  var box=$(id);
  Array.prototype.forEach.call(box.children,function(b){
    b.addEventListener('click',function(){
      Snd.ui();
      SET[key]=cast?cast(b.dataset.v):b.dataset.v;
      store.set('tv_'+key,SET[key]);
      Array.prototype.forEach.call(box.children,function(x){x.classList.toggle('on',x===b);});
      if(after)after();
    });
  });
}
function syncSegs(){
  [['segMode','mode'],['segDiff','diff'],['segTime','tod'],['segWeather','weather'],['segQual','quality']].forEach(function(m){
    var box=$(m[0]);
    Array.prototype.forEach.call(box.children,function(b){b.classList.toggle('on',String(SET[m[1]])===b.dataset.v);});
  });
}
function bindToggle(id,key,after){
  var el=$(id);
  el.classList.toggle('on',!!SET[key]);
  el.addEventListener('click',function(){
    Snd.ui(); SET[key]=!SET[key]; store.set('tv_'+key,SET[key]);
    el.classList.toggle('on',SET[key]);
    if(after)after();
  });
}
function applyTOD(){
  var t=TOD[SET.tod];
  gScene.background=new THREE.Color(t.sky);
  gScene.fog=new THREE.Fog(t.fog,t.fn,t.ff);
  hemi.intensity=t.hemi; hemi.color.setHex(t.hsky); hemi.groundColor.setHex(t.hgnd);
  sun.color.setHex(t.sun); sun.intensity=t.si; sun.userData.off=t.sp;
  amb.intensity=t.amb; renderer.toneMappingExposure=t.expo;
  lamps.forEach(function(l){l.material.emissiveIntensity=t.lamps?2.2:0;});
  setNightAll();
}
function setNightAll(){
  setCarNight(gameCar,SET.tod!=='day');
  rivals.forEach(function(r){setCarNight(r.car,false);});
}
function applyWeather(){ rain.visible=SET.weather==='rain'; rainMat.opacity=SET.weather==='rain'?.62:0; }
function applyQuality(){
  var hi=SET.quality==='high';
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,hi?2:1));
  if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}
  sun.shadow.mapSize.set(hi?2048:1024,hi?2048:1024);
  pMat.size=hi?.34:.42;
  var shown=0;
  worldGroup.children.forEach(function(c){ if(c.userData.tree){shown++;c.visible=hi||shown%2===0;} });
  clouds.forEach(function(c,i){c.visible=hi||i%2===0;});
  onResize();
}
function applyLefty(){ document.body.classList.toggle('lefty',SET.lefty); }

/* ---------- заезд ---------- */
function show(el,on){ el.classList.toggle('off',!on); }
function ensureGameCar(){
  var key=carCfg().id+'_'+SET.paint+'_'+SET.rim+'_'+SET.glow+'_'+SET.stripe;
  if(gameCarKey===key&&gameCar)return;
  if(gameCar){gScene.remove(gameCar);disposeTree(gameCar);}
  gameCar=buildCar(carCfg(),PAINTS[SET.paint],RIMS[SET.rim],{glow:SET.glow,stripe:SET.stripe});
  gScene.add(gameCar); gameCarKey=key;
  setCarNight(gameCar,SET.tod!=='day');
}
function gatePassedInLap(){ return gateNext===0?GATES_N-1:gateNext-1; }
function playerProgress(){ return lap*GATES_N+gatePassedInLap(); }
function resetRace(){
  buildObstacles(); buildCoins(); buildRivals();
  gates.forEach(function(g){
    var col=g.finish?0xfbbf24:0x22d3ee;
    g.mat.color.setHex(col); g.mat.emissive.setHex(col);
    g.mat.opacity=.42; g.mat.emissiveIntensity=1.3; g.ring.scale.setScalar(1);
  });
  var M=MODES[SET.mode],D=DIFFS[SET.diff];
  raceTime=M.timed?D.time:0; raceElapsed=0;
  score=0; driftBank=0; wreckCount=0; coinCount=0;
  gateNext=1; lap=0; dmg=0; nos=35; nosActive=false;
  airTime=0; shake=0; camYawOff=0; finishCounter=0; playerPos=1;
  driftCombo=1; driftTimer=0; driftScore=0; oilTimer=0; gear=1; rpm=0; shiftCd=0; lastTickSec=-1;
  respawn={x:START.x,z:START.z,yaw:START.yaw};
  phys.x=START.x; phys.z=START.z; phys.y=restH();
  phys.vx=phys.vy=phys.vz=0; phys.yaw=START.yaw; phys.grounded=true;
  input.steer=0; input.gas=input.brake=input.hand=input.nos=false;
  clearParts(); clearDebris(); clearSkids();
  if(gameCar)resetDamageVisual(gameCar);
  $('dmgFl').style.width='0%'; $('dmgFl').style.background='var(--lime)';
  $('nosFl').style.width=nos+'%';
  $('timeBox').classList.remove('warn'); $('combo').classList.remove('on');
  $('posChip').style.display=SET.mode==='race'?'block':'none';
  $('lapChip').style.display=SET.mode==='free'?'none':'block';
  $('timeLbl').textContent=M.timed?'ВРЕМЯ':'НА ТРАССЕ';
  $('timeBox').style.display=SET.mode==='free'?'none':'block';
  updateHUD();
}
function startRace(){
  Snd.init(); Snd.resume(); Snd.ui();
  ensureGameCar(); resetRace();
  show($('showroom'),false); show($('game'),true);
  $('results').style.display='none'; $('pause').style.display='none';
  $('logo').style.display='none'; $('setup').style.display='none';
  state='countdown'; countT=3.6; lastCountShown=-1;
  $('count').style.display='flex'; Snd.startEngine();
  var f=fwd(); gCam.position.set(phys.x+f.x*11,2.4,phys.z+f.z*11);
  if(!tutorialDone){
    tutorialDone=true; store.set('tv_tut',true);
    setTimeout(function(){toast('ГАЗ — СПРАВА ВНИЗУ','warn');},3800);
    setTimeout(function(){toast('РУЛЬ — ДЖОЙСТИК СЛЕВА','warn');},5600);
    setTimeout(function(){toast('ПРОХОДИ КОЛЬЦА — ОНИ ДАЮТ ВРЕМЯ','good');},7400);
  }
}
function toShowroom(){
  Snd.stopEngine(); Snd.ui();
  state='showroom';
  show($('game'),false); show($('showroom'),true);
  $('results').style.display='none'; $('count').style.display='none'; $('pause').style.display='none';
  $('logo').style.display='block'; $('setup').style.display='block';
  selectCar(selCar);
}
function doPause(){
  if(state!=='race'&&state!=='countdown')return;
  prevState=state; state='paused'; Snd.stopEngine(); Snd.ui();
  $('pScore').textContent=score;
  $('pGates').textContent=(lap*GATES_N+gatePassedInLap())+' шт';
  $('pDmg').textContent=Math.round(dmg)+'%';
  $('pause').style.display='flex';
}
function doResume(){
  if(state!=='paused')return;
  state=prevState; lastT=performance.now();
  $('pause').style.display='none'; Snd.resume(); Snd.startEngine(); Snd.ui();
}
$('startBtn').addEventListener('click',startRace);
$('btnPause').addEventListener('click',doPause);
$('btnResume').addEventListener('click',doResume);
$('btnRestart').addEventListener('click',function(){
  $('pause').style.display='none'; ensureGameCar(); resetRace();
  state='countdown'; countT=3.6; lastCountShown=-1; $('count').style.display='flex'; Snd.startEngine();
});
$('btnQuit').addEventListener('click',function(){
  if(SET.mode==='free'&&(score>0||coinCount>0)){
    var c=Math.floor(score/10)+coinCount*10;
    bankCredits(c); toast('+₡'+c+' ЗА ЗАЕЗД','good');
  }
  toShowroom();
});
$('btnSalon').addEventListener('click',toShowroom);
$('btnAgain').addEventListener('click',function(){
  Snd.ui(); $('results').style.display='none'; ensureGameCar(); resetRace();
  state='countdown'; countT=3.6; lastCountShown=-1; $('count').style.display='flex'; Snd.startEngine();
});
$('btnCam').addEventListener('click',function(){
  Snd.ui(); camMode=(camMode+1)%4;
  toast(['КАМЕРА: ДАЛЬНЯЯ','КАМЕРА: БЛИЖНЯЯ','КАМЕРА: КАПОТ','КАМЕРА: КИНО'][camMode],'');
});
$('btnReset').addEventListener('click',function(){
  if(state!=='race')return;
  Snd.ui();
  phys.x=respawn.x; phys.z=respawn.z; phys.y=restH();
  phys.vx=phys.vy=phys.vz=0; phys.yaw=respawn.yaw; nosActive=false;
  toast('ВОЗВРАТ НА КП','warn');
});
function toast(txt,cls){
  var w=$('toasts'),d=document.createElement('div');
  d.className='toast '+(cls||''); d.textContent=txt; w.appendChild(d);
  while(w.children.length>4)w.removeChild(w.firstChild);
  setTimeout(function(){if(d.parentNode)d.parentNode.removeChild(d);},1500);
}
function flashScreen(a){ var f=$('flash'); f.style.opacity=a; setTimeout(function(){f.style.opacity=0;},90); }

/* ---------- ввод ---------- */
(function joystick(){
  var zone=$('joy'),knob=$('knob'),cx=0,cy=0,R=42;
  function setF(e){
    var dx=e.clientX-cx,dy=e.clientY-cy;
    var d=Math.hypot(dx,dy),cl=Math.min(d,R),a=Math.atan2(dy,dx);
    var mx=Math.cos(a)*cl,my=Math.sin(a)*cl;
    knob.style.transform='translate('+mx+'px,'+my+'px)';
    var v=clamp(mx/R,-1,1);
    if(SET.invert)v=-v;
    input.steer=v;
  }
  zone.addEventListener('pointerdown',function(e){
    e.preventDefault(); joyPid=e.pointerId;
    try{zone.setPointerCapture(e.pointerId);}catch(_){}
    var r=zone.getBoundingClientRect(); cx=r.left+r.width/2; cy=r.top+r.height/2; setF(e);
  });
  zone.addEventListener('pointermove',function(e){if(e.pointerId===joyPid)setF(e);});
  function end(e){ if(e.pointerId!==joyPid)return; joyPid=null; knob.style.transform='translate(0,0)'; input.steer=0; }
  zone.addEventListener('pointerup',end); zone.addEventListener('pointercancel',end);
})();
function bindPedal(id,prop){
  var el=$(id);
  el.addEventListener('pointerdown',function(e){
    e.preventDefault();
    try{el.setPointerCapture(e.pointerId);}catch(_){}
    input[prop]=true; el.classList.add('on');
  });
  var off=function(){input[prop]=false;el.classList.remove('on');};
  el.addEventListener('pointerup',off); el.addEventListener('pointercancel',off);
}
bindPedal('pGas','gas'); bindPedal('pBrk','brake'); bindPedal('pHand','hand'); bindPedal('pNos','nos');
window.addEventListener('keydown',function(e){
  keys[e.code]=true;
  if(e.code==='Space')e.preventDefault();
  if(e.code==='KeyC')$('btnCam').click();
  if(e.code==='KeyR')$('btnReset').click();
  if(e.code==='KeyM')$('sndBtn').click();
  if(e.code==='KeyP'||e.code==='Escape'){ if(state==='paused')doResume(); else doPause(); }
  if(e.code==='Enter'&&state==='showroom')startRace();
});
window.addEventListener('keyup',function(e){keys[e.code]=false;});
function readKeys(){
  var s=SET.sens/100;
  if(keys.KeyA||keys.ArrowLeft)input.steer=Math.max(-1,input.steer-.14*s*(SET.invert?-1:1));
  if(keys.KeyD||keys.ArrowRight)input.steer=Math.min(1,input.steer+.14*s*(SET.invert?-1:1));
  if(!(keys.KeyA||keys.ArrowLeft||keys.KeyD||keys.ArrowRight)&&joyPid===null)input.steer*=.8;
  if(keys.KeyW||keys.ArrowUp)input.gas=true; else if(!$('pGas').classList.contains('on'))input.gas=false;
  if(keys.KeyS||keys.ArrowDown)input.brake=true; else if(!$('pBrk').classList.contains('on'))input.brake=false;
  if(keys.Space)input.hand=true; else if(!$('pHand').classList.contains('on'))input.hand=false;
  if(keys.ShiftLeft||keys.ShiftRight)input.nos=true; else if(!$('pNos').classList.contains('on'))input.nos=false;
}
(function canvasDrag(){
  var cv=renderer.domElement,ptrs=new Map(),pinchD=0;
  cv.addEventListener('pointerdown',function(e){
    ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
    try{cv.setPointerCapture(e.pointerId);}catch(_){}
    if(ptrs.size===2){var a=Array.from(ptrs.values());pinchD=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);}
  });
  cv.addEventListener('pointermove',function(e){
    if(!ptrs.has(e.pointerId))return;
    var p=ptrs.get(e.pointerId),dx=e.clientX-p.x;
    p.x=e.clientX; p.y=e.clientY;
    if(ptrs.size===2){
      var a=Array.from(ptrs.values()),d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
      if(pinchD>0)shRadius=clamp(shRadius*(pinchD/d),5.6,15);
      pinchD=d; return;
    }
    if(state==='showroom'){shVel=dx*.0035;shAngle+=dx*.006;}
    else camYawOff=clamp(camYawOff-dx*.004,-1.3,1.3);
  });
  function up(e){ptrs.delete(e.pointerId);pinchD=0;}
  cv.addEventListener('pointerup',up); cv.addEventListener('pointercancel',up);
  cv.addEventListener('wheel',function(e){
    e.preventDefault();
    if(state==='showroom')shRadius=clamp(shRadius*(1+e.deltaY*.001),5.6,15);
    else chaseDist=clamp(chaseDist*(1+e.deltaY*.001),5,13);
  },{passive:false});
  cv.addEventListener('contextmenu',function(e){e.preventDefault();});
})();

/* ---------- физика ---------- */
function updatePhysics(dt){
  var cfg=carCfg(),maxV=cfg.top/3.6,eff=1-dmg/100*.55;
  var grass=distToRoad(phys.x,phys.z)>ROAD_W/2+1.2;
  var wet=SET.weather==='rain'?.86:1,offF=grass?cfg.off:1;
  var f=fwd(),fv=forwardSpeed();
  if(input.nos&&nos>1&&state==='race'){
    if(!nosActive){Snd.nos();toast('НИТРО!','vi');}
    nosActive=true; nos=Math.max(0,nos-38*dt);
  }else nosActive=false;
  var nosBoost=nosActive?1.55:1;
  var accel=(cfg.hp/1000*8.6+3.7)*eff*offF*nosBoost;
  if(input.gas){phys.vx+=f.x*accel*dt;phys.vz+=f.z*accel*dt;}
  if(input.brake){
    if(fv>1){var b=15.5*dt*wet;phys.vx-=f.x*b;phys.vz-=f.z*b;}
    else{phys.vx-=f.x*accel*.5*dt;phys.vz-=f.z*accel*.5*dt;}
  }
  var hv=Math.hypot(phys.vx,phys.vz),cap=maxV*(grass?cfg.off:1)*(nosActive?1.16:1);
  if(hv>cap){var k=1-Math.min(1,(hv-cap)/hv)*dt*3;phys.vx*=k;phys.vz*=k;}
  var lat={x:phys.vx-f.x*fv,z:phys.vz-f.z*fv};
  var slip=Math.hypot(lat.x,lat.z);
  var gripK=input.hand?(cfg.drift?1.5:2.3):(7.2+cfg.grip*7)*wet;
  if(oilTimer>0)gripK*=.22;
  var gk=Math.min(1,gripK*dt);
  phys.vx-=lat.x*gk; phys.vz-=lat.z*gk;
  var drag=(grass?(1-cfg.off)*1.15:0)+.28+(input.hand?1.5:0)+(SET.weather==='rain'?.06:0);
  phys.vx*=Math.max(0,1-drag*dt); phys.vz*=Math.max(0,1-drag*dt);
  var spd=Math.hypot(phys.vx,phys.vz);
  if(spd>.4&&phys.grounded){
    var sf=1/(1+spd*.042);
    var rate=2.15*sf*(SET.sens/100)*(input.hand?1.75:1)*(oilTimer>0?1.5:1);
    phys.yaw-=input.steer*rate*dt*Math.sign(fv||1);
    if(oilTimer>0)phys.yaw+=Math.sin(performance.now()*.006)*dt*.7;
  }
  if(oilTimer>0)oilTimer-=dt;
  if(state==='race'&&input.hand&&slip>3.2&&spd>11&&phys.grounded){
    driftTimer=1.4;
    driftScore+=slip*spd*dt*.42;
    driftCombo=Math.min(5,driftCombo+dt*.55);
    nos=Math.min(100,nos+dt*9);
    [-1,1].forEach(function(s){
      addSkid(phys.x-f.x*1.4+(-f.z)*s*.8,phys.z-f.z*1.4+f.x*s*.8,phys.yaw);
    });
    if(Math.random()<.6)emit(phys.x-f.x*1.5,.3,phys.z-f.z*1.5,2,{colors:[0xd8dee8,0xa8b4c4],life:.7,spread:1.6,up:1.6,grav:-1});
  }else if(driftTimer>0){
    driftTimer-=dt;
    if(driftTimer<=0&&driftScore>10){
      var gained=Math.floor(driftScore*driftCombo);
      score+=gained; driftBank+=gained;
      toast('ДРИФТ ×'+driftCombo.toFixed(1)+' +'+gained,'vi');
      Snd.beep(700,.16,'triangle',.13,1100);
      driftScore=0; driftCombo=1;
    }else if(driftTimer<=0){driftScore=0;driftCombo=1;}
  }
  var ratio=clamp(spd/(maxV||1),0,1);
  var g=Math.min(6,Math.max(1,Math.floor(ratio*6)+1));
  if(g!==gear&&shiftCd<=0){gear=g;shiftCd=.18;Snd.gear();}
  if(shiftCd>0)shiftCd-=dt;
  var gearLo=(gear-1)/6,gearHi=gear/6;
  rpm=clamp((ratio-gearLo)/(gearHi-gearLo),0,1)*.82+(input.gas?.18:.02);
  if(nosActive)rpm=Math.min(1,rpm+.15);
  phys.vy-=23*dt;
  phys.x+=phys.vx*dt; phys.z+=phys.vz*dt; phys.y+=phys.vy*dt;
  var rh=restH();
  if(phys.y<=rh){
    if(!phys.grounded&&airTime>.5){
      var bonus=Math.floor(airTime*70);
      score+=bonus; toast('ПОЛЁТ +'+bonus,'good');
      Snd.beep(520,.2,'triangle',.14,760);
      emit(phys.x,.3,phys.z,16,{colors:[0x9b8a6a,0x7d7460],life:.85,spread:3.2,up:2.6});
      shake=Math.max(shake,.28);
    }
    phys.y=rh; phys.vy=0; phys.grounded=true; airTime=0;
  }else{phys.grounded=false;airTime+=dt;}
  phys.x=clamp(phys.x,-520,520); phys.z=clamp(phys.z,-520,520);
  if(phys.grounded&&spd>9&&Math.random()<.5)
    emit(phys.x-f.x*1.7,.25,phys.z-f.z*1.7,2,{colors:grass?[0x6f8f4a,0x87a35c]:[0x8a8f96,0x6f747b],life:.55,spread:1.2,up:1.4,grav:-1});
  if(nosActive)
    emit(phys.x-f.x*2.1,.45,phys.z-f.z*2.1,3,{colors:[0xa855f7,0xf472b6,0x22d3ee,0xffffff],life:.4,spread:.7,up:1.1,grav:1,vx:-f.x*7,vz:-f.z*7});
  if(dmg>62&&Math.random()<.4)
    emit(phys.x+f.x*1.4,phys.y+.55,phys.z+f.z*1.4,1,{colors:dmg>85?[0x3c4048,0x22262c]:[0x6b7280,0x555a63],life:1.2,spread:.5,up:2.4,grav:2});
  if(dmg>90&&Math.random()<.25)
    emit(phys.x+f.x*1.4,phys.y+.6,phys.z+f.z*1.4,1,{colors:[0xff8c1a,0xffd23c],life:.4,spread:.4,up:2,grav:3});
}
function localCheck(o,px,pz,pad){
  var dx=px-o.x,dz=pz-o.z,c=Math.cos(-o.yaw),s=Math.sin(-o.yaw);
  var lx=dx*c+dz*s,lz=-dx*s+dz*c;
  return {lx:lx,lz:lz,hit:Math.abs(lx)<o.hx+pad&&Math.abs(lz)<o.hz+pad};
}
function hitDamage(amount,label,silent){
  var before=dmg;
  dmg=clamp(dmg+amount*DIFFS[SET.diff].dmg,0,100);
  var fl=$('dmgFl');
  fl.style.width=dmg+'%';
  fl.style.background=dmg<35?'var(--lime)':dmg<70?'var(--amber)':'var(--red)';
  shake=Math.max(shake,clamp(amount/24,.15,.75));
  if(label)toast(label,'bad');
  if(dmg-before>4){
    var f=fwd();
    applyDamageVisual(gameCar,dmg,-f.x,-f.z);
    if(!silent)flashScreen(clamp((dmg-before)/70,.05,.3));
  }
  if(dmg>=100&&state==='race'){
    state='wrecked'; stateT=1.6;
    Snd.crash(true); Snd.lose(); Snd.stopEngine();
    emit(phys.x,phys.y+.5,phys.z,46,{colors:[0xff8c1a,0xffd23c,0x555a63,0xffffff],life:1.5,spread:5.5,up:7});
    flashScreen(.5); toast('МАШИНА РАЗБИТА!','bad');
  }
}
function checkCollisions(dt){
  var px=phys.x,pz=phys.z,carR=1.2,spd=Math.hypot(phys.vx,phys.vz);
  for(var k=0;k<obstacles.length;k++){
    var o=obstacles[k];
    if(!o.alive)continue;
    if(o.cd>0)o.cd-=dt;
    var d=Math.hypot(px-o.x,pz-o.z);
    if(d>o.r+carR+1.5)continue;
    if(o.type==='barrel'||o.type==='cone'){
      if(d<o.r+carR&&spd>2.4){
        o.alive=false; wreckCount++;
        spawnDebris(o.mesh,phys.vx*.6+rnd(-2,2),rnd(4,8),phys.vz*.6+rnd(-2,2));
        emit(o.x,1,o.z,12,{colors:[0xff8c1a,0xffd23c,0xffffff],life:.65,spread:3.2,up:3.4});
        if(o.type==='barrel'){score+=25;hitDamage(3,null,true);toast('РАЗРУШЕНО +25','good');phys.vx*=.9;phys.vz*=.9;Snd.crash(false);}
        else{score+=5;phys.vx*=.98;phys.vz*=.98;Snd.beep(320,.07,'square',.06);}
      }
    }else if(o.type==='wall'||o.type==='crusher'){
      var t=localCheck(o,px,pz,carR);
      if(t.hit){
        var penX=o.hx+carR-Math.abs(t.lx),penZ=o.hz+carR-Math.abs(t.lz);
        var nx=0,nz=0;
        if(penX<penZ)nx=Math.sign(t.lx)*penX; else nz=Math.sign(t.lz)*penZ;
        var c=Math.cos(o.yaw),s=Math.sin(o.yaw);
        var wx=nx*c+nz*s,wz=-nx*s+nz*c;
        phys.x+=wx; phys.z+=wz;
        var vl=Math.hypot(wx,wz)||1,vn={x:wx/vl,z:wz/vl};
        var dot=phys.vx*vn.x+phys.vz*vn.z;
        if(dot<0){phys.vx-=vn.x*dot*1.55;phys.vz-=vn.z*dot*1.55;}
        phys.vx*=.55; phys.vz*=.55;
        if(o.cd<=0){
          o.cd=.8;
          var dm=clamp(spd*1.15,6,27)*(o.type==='crusher'?1.25:1);
          hitDamage(dm,'УДАР! −'+Math.round(dm));
          Snd.crash(spd>15);
          emit(px,phys.y,pz,18,{colors:[0xffd23c,0xff8c1a,0xffffff],life:.55,spread:4.2,up:3.4});
        }
      }
    }else if(o.type==='spikes'){
      var ts=localCheck(o,px,pz,carR*.7);
      if(ts.hit&&o.cd<=0&&spd>2){o.cd=1.5;phys.vx*=.5;phys.vz*=.5;hitDamage(8,'ШИПЫ! −8');Snd.noise(.3,.3,650);
        emit(px,.4,pz,12,{colors:[0xffd23c,0x33363c],life:.55,spread:3,up:2.2});}
    }else if(o.type==='boost'){
      var tb=localCheck(o,px,pz,carR*.6);
      if(tb.hit&&o.cd<=0){o.cd=1.2;var fb=fwd();phys.vx+=fb.x*12;phys.vz+=fb.z*12;nos=Math.min(100,nos+34);
        score+=15;toast('ТУРБО +15 · НИТРО','vi');Snd.boost();
        emit(px,.4,pz,20,{colors:[0xa855f7,0x22d3ee,0xffffff],life:.75,spread:2.2,up:2.4,grav:0});}
    }else if(o.type==='oil'){
      var to=localCheck(o,px,pz,carR*.6);
      if(to.hit&&o.cd<=0&&spd>4){o.cd=2.2;oilTimer=1.5;toast('МАСЛО! ЗАНЕСЛО','warn');Snd.scrape();
        emit(px,.3,pz,10,{colors:[0xa855f7,0x2b1f3d],life:.6,spread:2,up:1.4});}
    }else if(o.type==='ramp'){
      var tr=localCheck(o,px,pz,carR*.5);
      if(tr.hit&&phys.grounded&&o.cd<=0&&forwardSpeed()>6){o.cd=1.2;phys.vy=5.8+spd*.2;phys.grounded=false;airTime=0;Snd.whoosh();toast('ТРАМПЛИН!','warn');}
    }else if(o.type==='pend'){
      var bp=new THREE.Vector3(); o.ref.ball.getWorldPosition(bp);
      var dd=Math.hypot(px-bp.x,pz-bp.z),dy=Math.abs(phys.y+.5-bp.y);
      if(dd<2.7&&dy<2.5&&o.ref.cd<=0){
        o.ref.cd=1.2;
        var npx=(px-bp.x)/(dd||1),npz=(pz-bp.z)/(dd||1);
        phys.vx=npx*17; phys.vz=npz*17; phys.vy=5.5; phys.grounded=false;
        hitDamage(30,'РАЗРУШИТЕЛЬ! −30'); Snd.crash(true);
        emit(px,phys.y+.5,pz,28,{colors:[0xffd23c,0xff8c1a,0xffffff],life:.85,spread:6,up:5.5});
      }
    }else if(o.type==='sweeper'){
      var sw=o.ref;
      for(var s2=-1;s2<=1;s2+=2){
        var ax=sw.x+Math.cos(sw.angle)*5.4*s2,az=sw.z-Math.sin(sw.angle)*5.4*s2;
        var dd2=Math.hypot(px-ax,pz-az);
        if(dd2<1.9&&o.cd<=0&&phys.y<2.6){
          o.cd=1.1;
          var nx2=(px-ax)/(dd2||1),nz2=(pz-az)/(dd2||1);
          phys.vx=nx2*15; phys.vz=nz2*15; phys.vy=4.2; phys.grounded=false;
          hitDamage(22,'СТРЕЛА! −22'); Snd.crash(true);
          emit(px,phys.y+.4,pz,22,{colors:[0xf5c542,0xff8c1a,0xffffff],life:.7,spread:5,up:4.5});
          break;
        }
      }
    }
  }
  for(var i=0;i<pendulums.length;i++)if(pendulums[i].cd>0)pendulums[i].cd-=dt;
  for(var r=0;r<rivals.length;r++){
    var rv=rivals[r],dd3=Math.hypot(px-rv.x,pz-rv.z);
    if(dd3<2.5&&rv.hitCd<=0){
      rv.hitCd=.7;
      var nx3=(px-rv.x)/(dd3||1),nz3=(pz-rv.z)/(dd3||1);
      phys.vx+=nx3*7; phys.vz+=nz3*7; rv.kick=-nx3*2.6;
      phys.vx*=.86; phys.vz*=.86;
      hitDamage(9,'КОНТАКТ −9'); Snd.crash(false);
      emit((px+rv.x)/2,1.1,(pz+rv.z)/2,16,{colors:[0xffd23c,0xffffff,0xff8c1a],life:.6,spread:4,up:3});
    }else if(dd3<4.2&&dd3>2.6&&spd>16&&rv.nearCd<=0){
      rv.nearCd=2.5; score+=15; toast('НА ГРАНИ +15','good'); Snd.beep(1000,.09,'triangle',.1);
    }
  }
  for(var c2=0;c2<coins.length;c2++){
    var cn=coins[c2];
    if(cn.taken)continue;
    if(Math.hypot(px-cn.x,pz-cn.z)<2.3&&Math.abs(phys.y-1.2)<2.4){
      cn.taken=true; cn.mesh.visible=false; coinCount++; score+=20;
      nos=Math.min(100,nos+6); Snd.coin();
      emit(cn.x,1.4,cn.z,12,{colors:[0xfbbf24,0xfff6cf,0xffffff],life:.7,spread:2.4,up:3,grav:-3});
      if(coinCount%5===0)toast('МОНЕТЫ ×'+coinCount+' +₡','good');
    }
  }
  if(state==='race'&&gateNext<gates.length){
    var g=gates[gateNext];
    if(Math.hypot(px-g.x,pz-g.z)<7.2){
      if(g.finish){
        lap++;
        var M=MODES[SET.mode];
        if(SET.mode!=='free'&&lap>=M.laps){
          state='finished'; stateT=1.5;
          playerPos=1+finishCounter;
          score+=Math.floor(Math.max(0,raceTime))*10+(M.timed?0:Math.max(0,240-Math.floor(raceElapsed))*3);
          Snd.fanfare(); Snd.stopEngine();
          emit(g.x,4.5,g.z,130,{colors:[0x22d3ee,0xa3e635,0xfbbf24,0xef4444,0xa855f7,0xffffff],life:2.2,spread:9,up:11,grav:-8});
          flashScreen(.35); toast('ФИНИШ! 🏁','good');
        }else{
          gateNext=1; score+=250; nos=Math.min(100,nos+25);
          respawn={x:g.x,z:g.z,yaw:Math.atan2(g.dx,g.dz)};
          if(M.timed)raceTime+=DIFFS[SET.diff].add+4;
          gates.forEach(function(gg){
            var col=gg.finish?0xfbbf24:0x22d3ee;
            gg.mat.color.setHex(col); gg.mat.emissive.setHex(col); gg.mat.opacity=.42;
          });
          toast('КРУГ '+lap+' ПРОЙДЕН +250','good'); Snd.chime();
          emit(g.x,4,g.z,40,{colors:[0xa3e635,0x22d3ee,0xffffff],life:1.2,spread:6,up:6,grav:-3});
        }
      }else{
        gateNext=(gateNext+1)%GATES_N;
        var add=DIFFS[SET.diff].add;
        if(MODES[SET.mode].timed)raceTime+=add;
        score+=100; nos=Math.min(100,nos+12);
        respawn={x:g.x,z:g.z,yaw:Math.atan2(g.dx,g.dz)};
        g.mat.color.setHex(0xa3e635); g.mat.emissive.setHex(0xa3e635); g.mat.opacity=.85;
        toast((MODES[SET.mode].timed?'+'+add+' СЕК · ':'')+'КП '+gatePassedInLap()+'/'+GATES_N,'good');
        Snd.chime();
        emit(g.x,3.4,g.z,22,{colors:[0xa3e635,0x22d3ee],life:.85,spread:4.4,up:4.4,grav:-2});
      }
    }
  }
}

/* ---------- визуал / камера ---------- */
function syncCar(dt){
  if(!gameCar)return;
  gameCar.position.set(phys.x,phys.y-restH(),phys.z);
  gameCar.rotation.y=phys.yaw;
  var ud=gameCar.userData,tilt=ud.tilt;
  var spd=Math.hypot(phys.vx,phys.vz),sf=clamp(spd/20,0,1);
  tilt.rotation.z=lerp(tilt.rotation.z,-input.steer*.075*sf,.15);
  var acc=(input.gas?1:0)-(input.brake?1:0);
  tilt.rotation.x=lerp(tilt.rotation.x,-acc*.032*sf,.1);
  if(!phys.grounded)tilt.rotation.x=lerp(tilt.rotation.x,-.06,.06);
  if(state==='wrecked'){tilt.rotation.z=lerp(tilt.rotation.z,.17,.05);tilt.rotation.x=lerp(tilt.rotation.x,.06,.05);}
  var fv=forwardSpeed();
  ud.wheels.forEach(function(w){
    w.spin.rotation.x-=fv*dt/w.r;
    if(w.front)w.pivot.rotation.y=lerp(w.pivot.rotation.y,-input.steer*.42,.25);
  });
  ud.tailM.emissiveIntensity=input.brake?3.0:1.0;
  if(ud.glow){
    ud.glow.material.opacity=nosActive?.55:(.28+Math.sin(performance.now()*.004)*.06);
    ud.glow.material.color.setHex(nosActive?0xa855f7:0x22d3ee);
  }
}
function updateCamera(dt){
  var f=fwd(),yaw=phys.yaw+camYawOff,cf={x:Math.sin(yaw),z:Math.cos(yaw)};
  var spd=Math.hypot(phys.vx,phys.vz);
  if(state==='countdown'){
    var t=1-clamp(countT/3.6,0,1);
    var ang=lerp(Math.PI,0,t*t)+phys.yaw,r=lerp(11,chaseDist,t);
    gCam.position.set(phys.x-Math.sin(ang)*r,lerp(2.3,3.5,t),phys.z-Math.cos(ang)*r);
    gCam.lookAt(phys.x,phys.y+1,phys.z);
  }else if(camMode===2){
    gCam.position.set(phys.x+f.x*.55,phys.y+1.05,phys.z+f.z*.55);
    gCam.lookAt(phys.x+f.x*14,phys.y+.85,phys.z+f.z*14);
  }else if(camMode===3){
    var a=performance.now()*.00035;
    gCam.position.set(phys.x+Math.sin(a)*11,phys.y+4.2,phys.z+Math.cos(a)*11);
    gCam.lookAt(phys.x,phys.y+.8,phys.z);
  }else{
    var dist=(camMode===0?chaseDist:chaseDist*.62)+(phys.grounded?0:2),h=camMode===0?3.5:2.35;
    var k=1-Math.pow(.0016,dt);
    gCam.position.x=lerp(gCam.position.x,phys.x-cf.x*dist,k);
    gCam.position.y=lerp(gCam.position.y,phys.y+h,k);
    gCam.position.z=lerp(gCam.position.z,phys.z-cf.z*dist,k);
    gCam.lookAt(phys.x+f.x*4,phys.y+1,phys.z+f.z*4);
  }
  if(shake>0){
    shake=Math.max(0,shake-dt*1.7);
    gCam.position.x+=rnd(-1,1)*shake*.36;
    gCam.position.y+=rnd(-1,1)*shake*.3;
    gCam.position.z+=rnd(-1,1)*shake*.36;
  }
  camYawOff*=Math.pow(.05,dt);
  var targetFov=62+clamp(spd/55,0,1)*12+(nosActive?6:0);
  gCam.fov=lerp(gCam.fov,targetFov,.07); gCam.updateProjectionMatrix();
  var off=sun.userData.off||[70,100,45];
  sun.position.set(phys.x+off[0],off[1],phys.z+off[2]);
  sun.target.position.set(phys.x,0,phys.z);
  if(state==='race'&&gateNext<gates.length){
    var g=gates[gateNext],d=Math.hypot(phys.x-g.x,phys.z-g.z);
    guide.visible=d>28;
    guide.position.set(phys.x,phys.y+3+Math.sin(performance.now()*.004)*.16,phys.z);
    guide.rotation.y=Math.atan2(g.x-phys.x,g.z-phys.z);
  }else guide.visible=false;
}

/* ---------- миникарта / HUD ---------- */
var mm=$('mmap').getContext('2d');
var mmB=(function(){
  var a=1e9,b=-1e9,c=1e9,d=-1e9;
  TRACK_WP.forEach(function(p){a=Math.min(a,p[0]);b=Math.max(b,p[0]);c=Math.min(c,p[1]);d=Math.max(d,p[1]);});
  return {minX:a,maxX:b,minZ:c,maxZ:d};
})();
function mmXY(x,z){
  var pad=20,W=224;
  var sc=Math.min((W-pad*2)/(mmB.maxX-mmB.minX),(W-pad*2)/(mmB.maxZ-mmB.minZ));
  return [pad+(x-mmB.minX)*sc+(W-pad*2-(mmB.maxX-mmB.minX)*sc)/2,
          W-pad-(z-mmB.minZ)*sc-(W-pad*2-(mmB.maxZ-mmB.minZ)*sc)/2];
}
function drawMap(){
  mm.clearRect(0,0,224,224);
  mm.strokeStyle='rgba(140,165,200,.85)'; mm.lineWidth=9; mm.lineJoin='round'; mm.lineCap='round';
  mm.beginPath();
  for(var i=0;i<ROAD_N;i+=8){
    var p=RP[i],q=mmXY(p.x,p.z);
    if(i===0)mm.moveTo(q[0],q[1]); else mm.lineTo(q[0],q[1]);
  }
  mm.closePath(); mm.stroke();
  mm.strokeStyle='rgba(26,36,54,.92)'; mm.lineWidth=5; mm.stroke();
  if(SET.mode==='free'){
    mm.fillStyle='rgba(251,191,36,.75)';
    coins.forEach(function(c){ if(c.taken)return; var q=mmXY(c.x,c.z); mm.beginPath(); mm.arc(q[0],q[1],2,0,TAU); mm.fill(); });
  }
  gates.forEach(function(g,i){
    var q=mmXY(g.x,g.z);
    mm.beginPath(); mm.arc(q[0],q[1],i===gateNext?6.5:4,0,TAU);
    mm.fillStyle=g.finish?(i===gateNext?'#fbbf24':'rgba(251,191,36,.5)')
      :(i===gateNext?'#22d3ee':(gatePassedInLap()>=i&&i>0?'rgba(163,230,53,.7)':'rgba(120,150,190,.42)'));
    mm.fill();
    if(i===gateNext){
      mm.strokeStyle='rgba(255,255,255,'+(0.45+0.45*Math.sin(performance.now()*.008))+')';
      mm.lineWidth=2.4; mm.beginPath(); mm.arc(q[0],q[1],10,0,TAU); mm.stroke();
    }
  });
  rivals.forEach(function(r,i){
    var q=mmXY(r.x,r.z);
    mm.fillStyle='#'+RIVAL_PAINTS[i%RIVAL_PAINTS.length].toString(16).padStart(6,'0');
    mm.beginPath(); mm.arc(q[0],q[1],4.2,0,TAU); mm.fill();
    mm.strokeStyle='rgba(6,10,18,.85)'; mm.lineWidth=1.4; mm.stroke();
  });
  var cq=mmXY(phys.x,phys.z);
  mm.save(); mm.translate(cq[0],cq[1]); mm.rotate(phys.yaw);
  mm.fillStyle='#fff'; mm.strokeStyle='#0b1220'; mm.lineWidth=2;
  mm.beginPath(); mm.moveTo(0,-9); mm.lineTo(6,7); mm.lineTo(0,3); mm.lineTo(-6,7);
  mm.closePath(); mm.fill(); mm.stroke(); mm.restore();
}
function updateHUD(){
  var spd=Math.hypot(phys.vx,phys.vz);
  $('speedVal').textContent=Math.round(spd*3.6);
  $('gearVal').textContent=forwardSpeed()<-.5?'R':(spd<.6?'N':String(gear));
  $('rpmFl').style.width=(rpm*100)+'%';
  $('nosFl').style.width=nos+'%';
  $('pNos').classList.toggle('ready',nos>25&&!nosActive);
  $('scoreVal').textContent=score;
  var M=MODES[SET.mode];
  if(M.timed){
    $('timeVal').textContent=Math.max(0,raceTime).toFixed(1);
    $('timeBox').classList.toggle('warn',raceTime<8&&state==='race');
  }else{
    $('timeVal').textContent=Math.floor(raceElapsed/60)+':'+String(Math.floor(raceElapsed%60)).padStart(2,'0');
    $('timeBox').classList.remove('warn');
  }
  $('gateVal').textContent=gatePassedInLap()+'/'+GATES_N;
  $('lapVal').textContent=Math.min(lap+1,M.laps)+'/'+M.laps;
  if(SET.mode==='race'){
    var pp=playerProgress(),pos=1;
    rivals.forEach(function(r){ if(r.lap*GATES_N+Math.floor(r.t*GATES_N)>pp)pos++; });
    playerPos=pos;
    $('posVal').textContent=pos+'/'+(rivals.length+1);
  }
  var cEl=$('combo');
  if(driftTimer>0&&driftScore>10){
    cEl.classList.add('on');
    cEl.querySelector('.cv').textContent='×'+driftCombo.toFixed(1);
    cEl.querySelector('.cl').textContent='ДРИФТ '+Math.floor(driftScore*driftCombo);
  }else cEl.classList.remove('on');
}
function showResults(win,reason){
  var M=MODES[SET.mode],stars=0;
  if(win){
    if(SET.mode==='race')stars=playerPos===1?3:playerPos===2?2:1;
    else stars=(dmg<20&&raceTime>=12)?3:(dmg<55?2:1);
    if(dmg>=85)stars=Math.max(1,stars-1);
  }
  var finalScore=win?score:Math.floor(score*.5);
  var earned=Math.floor(finalScore/10)+coinCount*10+stars*120;
  bankCredits(earned);
  var bk=bestKey(),oldBest=store.get(bk,0),isNew=win&&finalScore>oldBest;
  if(isNew)store.set(bk,finalScore);
  $('resTitle').textContent=win?(SET.mode==='race'?'ФИНИШ! P'+playerPos:'ФИНИШ! 🏁'):(reason==='wreck'?'МАШИНА РАЗБИТА':'ВРЕМЯ ВЫШЛО');
  $('resTitle').className=win?'win':'lose';
  $('resKicker').textContent=win?'ЗАЕЗД ЗАВЕРШЁН':'ЗАЕЗД ПРОВАЛЕН';
  $('rScore').textContent=finalScore;
  $('rDrift').textContent=driftBank;
  $('rWreck').textContent=wreckCount;
  $('rCoins').textContent=coinCount;
  $('rDmg').textContent=Math.round(dmg)+'%';
  $('rCred').textContent='₡ '+earned;
  $('rBest').textContent=Math.max(oldBest,finalScore);
  $('newBadge').style.display=isNew?'block':'none';
  var sp=$('stars').children;
  for(var i=0;i<3;i++){sp[i].className='';sp[i].style.transform='scale(0)';}
  $('results').style.display='flex';
  for(var s=0;s<stars;s++){
    (function(idx){setTimeout(function(){sp[idx].className='lit';Snd.beep(700+idx*220,.16,'triangle',.15);},350+idx*280);})(s);
  }
  var nextLock=null;
  for(var c=0;c<CARS.length;c++){ if(!isUnlocked(CARS[c])){nextLock=CARS[c];break;} }
  var un=$('unlockNote');
  un.style.display='block';
  if(nextLock){
    un.textContent=credits>=nextLock.cost
      ?('🔓 Доступно к разблокировке: '+nextLock.name+' — открой в салоне!')
      :('Следующая машина: '+nextLock.name+' · ещё ₡'+(nextLock.cost-credits));
  }else un.textContent='🏆 Весь автопарк открыт!';
  $('bestChip').textContent='РЕКОРД '+store.get(bk,0);
  renderSlider();
}

/* ---------- главный цикл ---------- */
function loop(now){
  requestAnimationFrame(loop);
  var dt=Math.min((now-lastT)/1000,.05);
  lastT=now; frame++;
  if(state==='showroom'){
    shVel=lerp(shVel,.004,.02); shAngle+=shVel; platform.rotation.y=shAngle;
    platRing.material.emissiveIntensity=1.7+Math.sin(now*.003)*.6;
    platRing2.material.emissiveIntensity=1.1+Math.sin(now*.0045+1)*.5;
    shCam.position.set(0,shHeight,shRadius); shCam.lookAt(0,1.05,0);
    if(shCar){
      shCar.userData.wheels.forEach(function(w){w.spin.rotation.x-=dt*.35;});
      if(shCar.userData.glow)shCar.userData.glow.material.opacity=.26+Math.sin(now*.004)*.07;
    }
    renderer.render(shScene,shCam);
    return;
  }
  if(state==='paused'){ renderer.render(gScene,gCam); return; }
  clouds.forEach(function(c){ c.position.x+=c.userData.v*dt; if(c.position.x>620)c.position.x=-620; });
  pendulums.forEach(function(p){ p.arm.rotation.z=Math.sin(now*.001*p.speed+p.phase)*.86; });
  sweepers.forEach(function(s){ s.angle+=s.speed*dt; s.arm.rotation.y=s.angle; });
  crushers.forEach(function(c){
    var o=Math.sin(now*.001*c.speed+c.phase)*c.amp;
    c.x=c.baseX+c.nx*o; c.z=c.baseZ+c.nz*o;
    c.mesh.position.set(c.x,0,c.z);
    for(var i=0;i<obstacles.length;i++){
      var ob=obstacles[i];
      if(ob.type==='crusher'&&ob.ref===c){ob.x=c.x;ob.z=c.z;break;}
    }
  });
  obstacles.forEach(function(o){ if(o.type==='boost')o.mesh.material.opacity=.62+.33*Math.sin(now*.006+o.x); });
  coins.forEach(function(c){
    if(c.taken)return;
    c.mesh.rotation.y=now*.003+c.ph;
    c.mesh.position.y=1.35+Math.sin(now*.004+c.ph)*.16;
  });
  if(gateNext<gates.length){
    var g=gates[gateNext];
    g.ring.scale.setScalar(1+.06*Math.sin(now*.007));
    g.mat.opacity=.62+.3*Math.sin(now*.007); g.mat.emissiveIntensity=1.9;
  }
  if(state==='countdown'){
    countT-=dt;
    var n=Math.ceil(countT);
    if(n!==lastCountShown){
      lastCountShown=n;
      if(n>0){
        $('countN').textContent=n;
        $('countN').style.animation='none'; void $('countN').offsetWidth; $('countN').style.animation='';
        Snd.tick();
      }
    }
    if(countT<=0){
      state='race'; $('countN').textContent='СТАРТ!';
      $('countN').style.animation='none'; void $('countN').offsetWidth; $('countN').style.animation='';
      Snd.beep(950,.32,'triangle',.2);
      setTimeout(function(){$('count').style.display='none';},700);
    }
    updateRivals(dt*.2);
    syncCar(dt); updateCamera(dt); updateParts(dt);
    renderer.render(gScene,gCam);
    return;
  }
  if(state==='race'){
    readKeys();
    for(var i=0;i<2;i++){
      updatePhysics(dt/2); checkCollisions(dt/2);
      if(state!=='race')break;
    }
    updateRivals(dt);
    raceElapsed+=dt;
    if(MODES[SET.mode].timed){
      raceTime-=dt;
      var sec=Math.ceil(raceTime);
      if(raceTime<6&&sec!==lastTickSec&&raceTime>0){lastTickSec=sec;Snd.tick();}
      if(raceTime<=0&&state==='race'){state='timeout';stateT=1.3;Snd.lose();Snd.stopEngine();toast('ВРЕМЯ ВЫШЛО!','bad');}
    }
    Snd.updateEngine(Math.hypot(phys.vx,phys.vz),rpm,input.gas?1:0,input.hand&&Math.hypot(phys.vx,phys.vz)>8,nosActive);
    updateHUD();
  }
  if(state==='finished'||state==='wrecked'||state==='timeout'){
    phys.vx*=Math.pow(.2,dt); phys.vz*=Math.pow(.2,dt);
    phys.vy-=23*dt;
    phys.x+=phys.vx*dt; phys.z+=phys.vz*dt; phys.y+=phys.vy*dt;
    if(phys.y<restH()){phys.y=restH();phys.vy=0;}
    updateRivals(dt*.6);
    stateT-=dt;
    if(stateT<=0){ var s=state; state='results'; showResults(s==='finished',s==='wrecked'?'wreck':'time'); }
  }
  syncCar(dt); updateCamera(dt); updateParts(dt); updateDebris(dt); updateSkids(dt);
  updateRain(dt,phys.x,phys.z);
  if(frame%2===0)drawMap();
  renderer.render(gScene,gCam);
}

/* ---------- lifecycle ---------- */
function onResize(){
  var w=window.innerWidth,h=window.innerHeight;
  renderer.setSize(w,h);
  shCam.aspect=w/h; shCam.updateProjectionMatrix();
  gCam.aspect=w/h; gCam.updateProjectionMatrix();
  var portrait=window.matchMedia('(orientation: portrait) and (max-width: 860px)').matches;
  $('orient').style.display=portrait?'flex':'none';
}
window.addEventListener('resize',onResize);
window.addEventListener('orientationchange',function(){setTimeout(onResize,180);});
document.addEventListener('visibilitychange',function(){
  if(document.hidden)Snd.stopEngine();
  else{lastT=performance.now();Snd.resume();}
});

/* ---------- старт ---------- */
buildWorld();
buildGates();
applyTOD();
applyWeather();
applyLefty();
renderSwatches();
syncSegs();
selectCar(0);
updateStartSub();
$('credChip').textContent='₡ '+credits;
$('sensRange').value=SET.sens;
$('sensN').textContent=SET.sens+'%';
bindSeg('segMode','mode',null,function(){updateStartSub();$('bestChip').textContent='РЕКОРД '+store.get(bestKey(),0);});
bindSeg('segDiff','diff',function(v){return parseInt(v,10);},updateStartSub);
bindSeg('segTime','tod',null,applyTOD);
bindSeg('segWeather','weather',null,applyWeather);
bindSeg('segQual','quality',null,applyQuality);
bindToggle('tglInvert','invert');
bindToggle('tglLefty','lefty',applyLefty);
bindToggle('tglGlow','glow',function(){selectCar(selCar);gameCarKey='';});
bindToggle('tglStripe','stripe',function(){selectCar(selCar);gameCarKey='';});
$('tglSound').addEventListener('click',function(){Snd.init();Snd.resume();Snd.setOn(!Snd.on);Snd.ui();});
$('sensRange').addEventListener('input',function(e){
  SET.sens=parseInt(e.target.value,10);
  store.set('tv_sens',SET.sens);
  $('sensN').textContent=SET.sens+'%';
});
applyQuality();
onResize();
requestAnimationFrame(loop);
setTimeout(function(){
  var l=$('loader');
  l.classList.add('off');
  setTimeout(function(){if(l.parentNode)l.parentNode.removeChild(l);},650);
},450);
}