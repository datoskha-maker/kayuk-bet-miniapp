(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const tg = window.Telegram?.WebApp;
  const ASSET = '/assets/slice/items/';
  const money = n => Math.round(Number(n) || 0).toLocaleString('ru-RU') + ' ₽';
  const headers = () => ({ 'Content-Type': 'application/json', 'x-telegram-init-data': tg?.initData || '' });

  const ITEMS = [
    { id:'coconut', label:'КОКОС', kind:'fruit', life:true },
    { id:'banana', label:'БАНАН', kind:'fruit', life:true },
    { id:'watermelon', label:'АРБУЗ', kind:'fruit' },
    { id:'grapes', label:'ВИНОГРАД', kind:'fruit' },
    { id:'spartak', label:'СПАРТАК', kind:'club' },
    { id:'cska', label:'ЦСКА', kind:'club' },
    { id:'krasnodar', label:'КРАСНОДАР', kind:'club' },
    { id:'zenit', label:'ЗЕНИТ', kind:'club' },
    { id:'lokomotiv', label:'ЛОКОМОТИВ', kind:'club' },
    { id:'barcelona', label:'БАРСЕЛОНА', kind:'club' },
    { id:'real', label:'РЕАЛ МАДРИД', kind:'club' },
    { id:'bayern', label:'БАВАРИЯ', kind:'club' },
    { id:'psg', label:'ПСЖ', kind:'club' },
    { id:'village', label:'ДЕРЕВЕНЬКА', kind:'bonus', multiplier:2 },
    { id:'five_lakes', label:'ПЯТЬ ОЗЁР', kind:'bonus', multiplier:3 },
    { id:'hoegaarden', label:'HOEGAARDEN', kind:'bonus', multiplier:5 },
    { id:'absinthe', label:'АБСЕНТ', kind:'hazard' },
    { id:'bomb', label:'МИТЬКИН ЗАГАШНИК', kind:'bomb' }
  ];
  const REGULAR = ITEMS.filter(x => x.kind === 'fruit' || x.kind === 'club');
  const BONUSES = ITEMS.filter(x => x.kind === 'bonus');
  const state = {
    sessionId:null, running:false, finished:false, score:0, lives:3,
    maxCombo:0, streak:0, multiplier:1, wave:0, wavesSinceBomb:0,
    wavesSinceBonus:0, lastWaveAt:0, objects:[], particles:[], game:null,
    scene:null, pointer:null, swipeHits:[], startBusy:false, audio:null, debrisCount:0
  };

  function createSliceSceneClass(){
    return class SliceScene extends Phaser.Scene {
    constructor(){ super({ key:'KayukSliceScene' }); }
    preload(){
      ITEMS.forEach(item => {
        this.load.image(item.id, ASSET + item.id + '.png');
        this.load.image(item.id + '-top', ASSET + item.id + '-top.png');
        this.load.image(item.id + '-bottom', ASSET + item.id + '-bottom.png');
      });
    }
    create(){
      state.scene = this;
      this.objects = [];
      state.debrisCount = 0;
      this.physics.world.setBounds(0, 0, this.scale.width, this.scale.height + 180);
      this.physics.world.gravity.y = 980;
      this.cameras.main.setBackgroundColor('#081321');
      this.drawArena();
      this.scale.on('resize', size => {
        this.physics.world.setBounds(0, 0, size.width, size.height + 180);
        this.drawArena();
      });
      this.input.on('pointerdown', p => { if(state.running) state.pointer = {x:p.x,y:p.y}; });
      this.input.on('pointermove', p => {
        if(!state.running || !p.isDown || !state.pointer) return;
        const next = {x:p.x,y:p.y};
        this.drawBlade(state.pointer,next);
        this.checkCuts(state.pointer,next);
        this.resolveHits();
        state.pointer = next;
      });
      this.input.on('pointerup', () => { state.pointer = null; this.resolveHits(); });
      this.input.on('pointerupoutside', () => { state.pointer = null; this.resolveHits(); });
      this.nextWaveAt = this.time.now + 650;
      this.lastHudAt = 0;
      this.events.once('shutdown', () => { state.scene = null; });
    }
    drawArena(){
      if(this.arena) this.arena.destroy();
      this.arena = this.add.graphics();
      const w=this.scale.width,h=this.scale.height;
      const g=this.arena;
      g.fillGradientStyle(0x14283d,0x14283d,0x081321,0x081321,1);
      g.fillRect(0,0,w,h);
      g.fillStyle(0x8ac7ed,0.12);
      for(let i=0;i<34;i++) g.fillCircle((i*83)%w,(i*47)%Math.max(1,h*.72),1+(i%2));
      g.fillStyle(0x142d42,1); g.fillRect(0,h-30,w,30);
      g.lineStyle(1,0x5b94bd,0.2);
      for(let i=0;i<8;i++){g.beginPath();g.moveTo(i*w/7,h-30);g.lineTo(i*w/7-22,h);g.strokePath();}
    }
    drawBlade(a,b){
      const g=this.add.graphics().setDepth(30);
      g.lineStyle(18,0x63baff,0.10);g.lineBetween(a.x,a.y,b.x,b.y);
      g.lineStyle(8,0x9bdcff,0.28);g.lineBetween(a.x,a.y,b.x,b.y);
      g.lineStyle(2.8,0xf0faff,0.98);g.lineBetween(a.x,a.y,b.x,b.y);
      g.fillStyle(0xffffff,0.85);g.fillCircle(b.x,b.y,2.4);
      this.tweens.add({targets:g,alpha:0,duration:115,ease:'Quad.easeOut',onComplete:()=>g.destroy()});
    }
    update(time,delta){
      if(!state.running) return;
      this.objects = this.objects.filter(o => { if(!o.active || !o.body || o.isCut) return false; if(o.y > this.scale.height + 130){ o.destroy(); return false; } return true; });
      if(this.objects.length < this.maxOnScreen() && time >= this.nextWaveAt) this.spawnWave();
      if(time-this.lastHudAt>120){hud();this.lastHudAt=time;}
    }
    maxOnScreen(){ return state.lives===1 ? 5 : 7; }
    bombInterval(){
      const s=state.score;
      let n=s>=10000?5:s>=5000?6:s>=2500?7:s>=1000?8:8;
      if(state.lives===1) n+=2;
      return n;
    }
    bonusInterval(){
      const s=state.score;
      return s>=7000?12:s>=3500?14:s>=1200?16:18;
    }
    spawnWave(){
      const room=this.maxOnScreen()-this.objects.length-Math.min(2,Math.ceil(state.debrisCount/3));
      if(room<2){this.nextWaveAt=this.time.now+450;return;}
      state.wave++;
      state.wavesSinceBomb++;
      state.wavesSinceBonus++;
      const scoreTier=Math.floor(state.score/500);
      const count=Math.min(room,2+Math.floor(Math.random()*2)+Math.min(2,Math.floor(scoreTier/3)));
      const bombReady=state.wavesSinceBomb>=this.bombInterval();
      const bonusReady=state.wavesSinceBonus>=this.bonusInterval();
      const bombChance=bombReady?Math.min(.48,.22+scoreTier*.025):0;
      const bonusChance=bonusReady ? 0.52 : 0;
      const roll=Math.random();
      let special=null;
      if(bombReady && roll<bombChance){special=ITEMS.find(x=>x.id==='bomb');state.wavesSinceBomb=0;}
      else if(bonusReady && roll<bombChance+bonusChance){special=BONUSES[Math.floor(Math.random()*BONUSES.length)];state.wavesSinceBonus=0;}
      const items=[];
      if(special) items.push(special);
      const waveCount=special?Math.min(2,room):count;
      while(items.length<waveCount) items.push(REGULAR[Math.floor(Math.random()*REGULAR.length)]);
      if(!special) Phaser.Utils.Array.Shuffle(items);
      const baseX=this.scale.width*.2+Math.random()*this.scale.width*.6;
      const speed=1+Math.min(.55,scoreTier*.035);
      const gap=special?Math.min(128,this.scale.width*.3):Math.min(66,this.scale.width*.16);
      items.forEach((item,i)=>{
        const offset=(i-(items.length-1)/2)*gap;
        const x=Phaser.Math.Clamp(baseX+offset,45,this.scale.width-45);
        this.launch(item,x,speed,i,items.length);
      });
      const scorePace=Math.min(360,Math.floor(scoreTier*5));
      this.nextWaveAt=this.time.now+Math.max(520,1050-scorePace)+Math.random()*240;
    }
    launch(item,x,speed,index,total){
      const key=item.id;
      const hasTexture=this.textures.exists(key);
      const obj=hasTexture?this.physics.add.image(x,this.scale.height+75,key):this.addFallback(item,x,this.scale.height+75);
      if(!obj.body) this.physics.add.existing(obj);
      obj.setDepth(5);
      const targetH=Math.min(104,Math.max(66,this.scale.height*.135));
      if(hasTexture){
        const source=obj.texture.getSourceImage();
        const scale=targetH/Math.max(1,source.height);
        obj.setScale(scale);
      } else obj.setScale(targetH/78);
      obj.item=item;obj.isCut=false;if(obj.setCircle)obj.setCircle(Math.max(22,obj.displayWidth*.36));else if(obj.body?.setCircle)obj.body.setCircle(Math.max(22,obj.displayWidth*.36));
      obj.body.setAllowGravity(true);
      obj.body.setBounce(0.12);
      const spread=(index-(total-1)/2)*1.45;
      const vx=spread+(Math.random()-.5)*1.2;
      const vy=-(Math.min(900,760+state.score*.006)*speed+Math.random()*130);
      const launchY=this.scale.height+48+Math.random()*70;
      obj.setY(launchY);
      if(obj.setVelocity)obj.setVelocity(vx*75,vy);else obj.body.setVelocity(vx*75,vy);
      const spin=(Math.random()-.5)*210;if(obj.setAngularVelocity)obj.setAngularVelocity(spin);else obj.body.setAngularVelocity(spin);
      obj.setRotation((Math.random()-.5)*.45);
      this.objects.push(obj);
    }
    addFallback(item,x,y){
      const g=this.add.container(x,y);
      const body=this.add.graphics();
      const color=item.kind==='bomb'?0x222b36:item.kind==='hazard'?0x258b47:item.kind==='bonus'?0xcca85d:0x3c82a7;
      body.fillStyle(color,1);body.fillRoundedRect(-25,-38,50,76,12);
      body.lineStyle(2,0xffffff,.55);body.strokeRoundedRect(-25,-38,50,76,12);
      const label=this.add.text(0,0,item.label,{fontFamily:'Arial',fontSize:'8px',fontStyle:'bold',color:'#ffffff',align:'center',wordWrap:{width:44}}).setOrigin(.5);
      g.add([body,label]);this.physics.add.existing(g);g.setSize(50,76);return g;
    }
    checkCuts(a,b){
      const dx=b.x-a.x,dy=b.y-a.y;
      if(dx*dx+dy*dy<36)return;
      this.objects.forEach(o=>{
        if(!o.active||o.isCut||!o.body)return;
        const angle=o.rotation||0,cos=Math.cos(angle),sin=Math.sin(angle);
        const toLocal=p=>{
          const px=p.x-o.x,py=p.y-o.y;
          return {x:px*cos+py*sin,y:-px*sin+py*cos};
        };
        const p1=toLocal(a),p2=toLocal(b);
        const hw=Math.max(12,o.displayWidth*.43),hh=Math.max(14,o.displayHeight*.44);
        if(segmentHitsBox(p1,p2,hw,hh)){
          o.isCut=true;
          state.swipeHits.push(o);
        }
      });
    }
    resolveHits(){
      if(!state.swipeHits.length) return;
      const hits=state.swipeHits.splice(0);
      const safe=hits.filter(o=>o.item.kind!=='bomb'&&o.item.kind!=='hazard');
      const combo=Math.max(1,Math.min(5,safe.length));
      if(safe.length){state.streak++;state.maxCombo=Math.max(state.maxCombo,safe.length);}
      hits.forEach(o=>{
        const item=o.item;
        const x=o.x,y=o.y;
        if(item.kind==='bomb'||item.kind==='hazard'){
          state.lives=Math.max(0,state.lives-1);state.streak=0;
          floatText(x,y,item.kind==='bomb'?'БА-БАХ! −1 ❤️':'ОПАСНО! −1 ❤️');
          this.burst(x,y,0xff704d);playSound('hazard');haptic('heavy');
        } else if(item.kind==='bonus'){
          state.multiplier=item.multiplier;
          floatText(x,y,'БУСТ ×'+item.multiplier);
          this.burst(x,y,0xf5d77c);playSound('bonus');haptic('success');
        } else {
          if(item.life){const before=state.lives;state.lives=Math.min(3,state.lives+1);floatText(x,y,before<3?'＋1 ❤️':'МАКС. ЖИЗНИ');}
          const streakBonus=Math.min(3,1+Math.floor(state.streak/5));
          const pts=10*combo*streakBonus*state.multiplier;
          state.score+=pts;state.multiplier=1;
          floatText(x,y,'+'+pts);playSound('slice');haptic('light');
          this.burst(x,y,0x9bdcff);
        }
        this.split(o);
      });
      hud();
      if(state.lives<=0) finish();
    }
    split(o){
      const item=o.item,x=o.x,y=o.y,rot=o.rotation;
      const vx=o.body?.velocity.x||0,vy=o.body?.velocity.y||0;
      if(typeof o.disableBody==='function')o.disableBody(true,true);else o.destroy();
      ['top','bottom'].forEach((part,i)=>{
        const key=item.id+'-'+part;
        if(!this.textures.exists(key)) return;
        const half=this.physics.add.image(x,y,key);
        state.debrisCount++;
        half.setDepth(7);half.setRotation(rot);
        half.setDisplaySize(Math.max(24,o.displayWidth*.96),Math.max(20,o.displayHeight*.52));
        half.body.setAllowGravity(true);
        half.setVelocity(vx+(i===0?-95:95),vy-70-(Math.random()*35));
        half.setAngularVelocity(i===0?-260:260);
        this.time.delayedCall(850,()=>{if(half.active)half.destroy();state.debrisCount=Math.max(0,state.debrisCount-1);});
      });
    }
    burst(x,y,color){
      const p=this.add.particles(x,y,'__WHITE',{speed:{min:80,max:360},angle:{min:0,max:360},scale:{start:.9,end:0},tint:color,quantity:18,lifespan:520,gravityY:450});
      this.time.delayedCall(600,()=>p.destroy());
    }
    };
  }

  function segmentHitsBox(a,b,halfW,halfH){
    let tMin=0,tMax=1;
    const dx=b.x-a.x,dy=b.y-a.y;
    const p=[-dx,dx,-dy,dy];
    const q=[a.x+halfW,halfW-a.x,a.y+halfH,halfH-a.y];
    for(let i=0;i<4;i++){
      if(Math.abs(p[i])<1e-7){if(q[i]<0)return false;continue;}
      const t=q[i]/p[i];
      if(p[i]<0)tMin=Math.max(tMin,t);else tMax=Math.min(tMax,t);
      if(tMin>tMax)return false;
    }
    return true;
  }

  function haptic(kind){try{if(kind==='success')tg?.HapticFeedback?.notificationOccurred?.('success');else tg?.HapticFeedback?.impactOccurred?.(kind);}catch(e){}}
  function playSound(kind){
    try{
      const Ctx=window.AudioContext||window.webkitAudioContext;
      if(!Ctx)return;
      if(!state.audio)state.audio=new Ctx();
      if(state.audio.state==='suspended')state.audio.resume();
      const ctx=state.audio,now=ctx.currentTime;
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      const presets={slice:[520,260,.075,'triangle',.055],bonus:[740,1180,.22,'sine',.07],hazard:[150,55,.28,'sawtooth',.09]};
      const p=presets[kind]||presets.slice;
      osc.type=p[3];osc.frequency.setValueAtTime(p[0],now);osc.frequency.exponentialRampToValueAtTime(Math.max(35,p[1]),now+p[2]);
      gain.gain.setValueAtTime(p[4],now);gain.gain.exponentialRampToValueAtTime(.001,now+p[2]);
      osc.connect(gain);gain.connect(ctx.destination);osc.start(now);osc.stop(now+p[2]);
    }catch(e){}
  }
  function hud(){
    $('sliceScore').textContent=state.score.toLocaleString('ru-RU');
    $('sliceLives').textContent='❤️'.repeat(Math.max(0,state.lives))+'🖤'.repeat(Math.max(0,3-state.lives));
    $('sliceStreak').textContent=state.streak;
    $('sliceMultiplier').textContent='×'+state.multiplier;
  }
  function floatText(x,y,text){
    const el=document.createElement('div');el.className='slice-float';el.textContent=text;
    el.style.left=x+'px';el.style.top=y+'px';$('sliceStage').appendChild(el);
    setTimeout(()=>el.remove(),850);
  }
  function ensurePhaser(){
    if(window.Phaser)return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='https://unpkg.com/phaser@3.90.0/dist/phaser.min.js';
      script.onload=()=>window.Phaser?resolve():reject(new Error('Игровой движок не загрузился. Проверь интернет и нажми ещё раз.'));
      script.onerror=()=>reject(new Error('Не удалось загрузить игровой движок. Проверь интернет и нажми ещё раз.'));
      document.head.appendChild(script);
    });
  }

  async function start(){
    if(state.startBusy||state.running)return;
    if(!tg?.initData){if(typeof window.toast==='function')window.toast('Открой КАЮК BET внутри Telegram');return;}
    playSound('slice');
    enterFullscreen(true);
    state.startBusy=true;$('sliceStart').disabled=true;$('sliceStart').textContent='ЗАПУСКАЕМ…';
    try{
      await ensurePhaser();
      const r=await fetch('/api/slice/start',{method:'POST',headers:headers(),body:'{}'}),d=await r.json();
      if(!r.ok)throw new Error(d.error||'Не удалось начать игру');
      Object.assign(state,{sessionId:d.sessionId,running:true,finished:false,score:0,lives:3,maxCombo:0,streak:0,multiplier:1,wave:0,wavesSinceBomb:0,wavesSinceBonus:0,objects:[],pointer:null,swipeHits:[]});
      document.body.classList.add('slice-playing');
      $('sliceIntro').classList.add('hidden');$('sliceEnd').classList.add('hidden');
      $('sliceHud').classList.remove('hidden');$('sliceStart').classList.add('hidden');
      hud();
      if(!state.game){
        state.game=new Phaser.Game({type:Phaser.AUTO,parent:'sliceGame',transparent:false,backgroundColor:'#081321',
          scale:{mode:Phaser.Scale.RESIZE,width:Math.max(320,window.innerWidth),height:Math.max(480,window.innerHeight),autoCenter:Phaser.Scale.CENTER_BOTH},
          physics:{default:'arcade',arcade:{gravity:{y:980},debug:false}},
          render:{antialias:true,roundPixels:false},scene:[createSliceSceneClass()]});
        state.game.events.once('ready',()=>{});
      } else {
        state.scene?.scene.restart();
      }
    }catch(e){
      state.running=false;if(typeof window.toast==='function')window.toast(e.message);
      $('sliceStart').disabled=false;$('sliceStart').textContent='НАЧАТЬ ИГРУ';
    }finally{state.startBusy=false;}
  }
  async function leaderboard(){
    const box=$('sliceLeaderboard');if(!box)return;
    if(!tg?.initData){box.innerHTML='<div class="empty">Открой Mini App в Telegram, чтобы увидеть рейтинг.</div>';return;}
    try{
      const r=await fetch('/api/slice/leaderboard',{headers:{'x-telegram-init-data':tg.initData},cache:'no-store'}),d=await r.json();
      if(!r.ok)throw new Error(d.error||'Ошибка рейтинга');
      const rows=d.players||[];
      box.innerHTML=rows.length?rows.map((p,i)=>'<div class="slice-leader"><span class="slice-rank">'+(i+1)+'</span><span class="slice-name">'+escapeHtml(p.name)+(String(p.user_id)===String(window.playerId)?' <small>(ты)</small>':'')+'</span><b>'+Number(p.best_score||0).toLocaleString('ru-RU')+'</b></div>').join(''):'<div class="empty">Пока нет рекордов. Стань первым!</div>';
      $('sliceMyRank').textContent=d.myRank?'Твоё место: №'+d.myRank:'Сыграй первую игру, чтобы попасть в рейтинг.';
    }catch(e){box.innerHTML='<div class="empty">Не удалось загрузить рейтинг. Попробуй позже.</div>';}
  }
  function escapeHtml(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'" :'&#39;'}[c]));}
  async function finish(reason='lives'){
    if(state.finished||!state.sessionId)return;
    state.finished=true;state.running=false;
    document.body.classList.remove('slice-playing');
    $('sliceEnd').classList.remove('hidden');
    $('sliceEndTitle').textContent=reason==='exit'?'РАУНД ЗАВЕРШЁН':'ВСЕ ТРИ ЖИЗНИ ПОТРАЧЕНЫ';
    $('sliceFinalScore').textContent=state.score.toLocaleString('ru-RU');
    $('sliceReward').textContent='Зачисляем '+money(state.score)+'…';
    try{
      const r=await fetch('/api/slice/finish',{method:'POST',headers:headers(),body:JSON.stringify({sessionId:state.sessionId,score:state.score,maxCombo:state.maxCombo})}),d=await r.json();
      if(!r.ok)throw new Error(d.error||'Не удалось зачислить результат');
      $('sliceReward').textContent='+'+money(d.reward)+' на общий баланс';
      $('sliceBalance').textContent=money(d.balance);
      if(typeof window.loadProfile==='function')await window.loadProfile();
      $('sliceBalance').textContent=$('balance')?.textContent||money(d.balance);
      await leaderboard();
    }catch(e){$('sliceReward').textContent='Не удалось зачислить: '+e.message;if(typeof window.toast==='function')window.toast(e.message);}
    $('sliceStart').disabled=false;$('sliceStart').textContent='ИГРАТЬ ЕЩЁ';$('sliceStart').classList.remove('hidden');
  }
  async function close(){
    if(state.running)await finish('exit');
    document.body.classList.remove('slice-fullscreen','slice-playing');
    try{if(tg?.exitFullscreen)await tg.exitFullscreen();else if(document.fullscreenElement)await document.exitFullscreen();}catch(e){}
    if(typeof window.page==='function')window.page('home');
  }
  function enterFullscreen(requestNative=false){
    document.body.classList.add('slice-fullscreen');
    document.documentElement.classList.add('slice-fullscreen');
    try{tg?.expand?.();}catch(e){}
    if(!requestNative)return;
    try{
      if(tg?.requestFullscreen && (!tg.isVersionAtLeast || tg.isVersionAtLeast('8.0'))){
        const result=tg.requestFullscreen();
        if(result&&typeof result.catch==='function')result.catch(()=>{try{tg?.expand?.();}catch(e){}});
      }else if(document.documentElement.requestFullscreen){
        const result=document.documentElement.requestFullscreen();
        if(result&&typeof result.catch==='function')result.catch(()=>{});
      }
    }catch(e){try{tg?.expand?.();}catch(_){}}
  }
  function open(){
    leaderboard();$('sliceBalance').textContent=$('balance')?.textContent||'—';enterFullscreen(false);
  }
  function init(){
    $('sliceStart')?.addEventListener('click',start);
    $('slicePlayAgain')?.addEventListener('click',start);
    if(!window.Phaser)console.warn('Phaser CDN unavailable; fallback will load when the player starts.');
    if($('sliceTimer'))$('sliceTimer').closest('.slice-hud-item')?.remove();
    const gameHost=$('sliceGame');
    if(gameHost){gameHost.style.width='100%';gameHost.style.height='100%';gameHost.style.minHeight='0';gameHost.style.touchAction='none';}
    tg?.onEvent?.('viewportChanged',()=>{if(state.game)state.game.scale.refresh();});
    tg?.onEvent?.('fullscreenChanged',()=>{if(state.game)state.game.scale.refresh();});
    document.addEventListener('visibilitychange',()=>{if(!state.game)return;if(document.hidden)state.scene?.scene.pause();else if(state.running)state.scene?.scene.resume();});
  }
  window.KayukSlice={open,close,leaderboard};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();