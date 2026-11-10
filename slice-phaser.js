(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const tg = window.Telegram?.WebApp;
  const ASSET = '/assets/slice/items/';
  const money = n => Math.round(Number(n) || 0).toLocaleString('ru-RU') + ' ₽';
  const headers = () => ({ 'Content-Type': 'application/json', 'x-telegram-init-data': tg?.initData || '' });
  const DEMO_MODE = location.hostname.startsWith('kayuk-bet-miniapp-9nfa-') &&
    location.hostname.endsWith('.vercel.app') &&
    new URLSearchParams(location.search).get('sliceDemo') === '1';

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
    sessionId:null, running:false, paused:false, finished:false, score:0, lives:3,
    maxCombo:0, streak:0, swipeCutCount:0, multiplier:1, wave:0, wavesSinceBomb:0,
    wavesSinceBonus:0, lastWaveAt:0, objects:[], particles:[], game:null,
    scene:null, pointer:null, swipeHits:[], startBusy:false, audio:null, bgm:null, sfx:[], debrisCount:0, pendingLaunches:0, roundToken:0,
    rewardPending:false, rewardPayload:null, rewardSubmitting:false
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
      this.physics.world.gravity.y = 1120;
      this.cameras.main.setBackgroundColor('#081321');
      this.drawArena();
      this.bladeTrail=[];
      this.bladeGraphics=this.add.graphics().setDepth(30);
      this.handleResize = size => {
        this.physics.world.setBounds(0, 0, size.width, size.height + 180);
        this.drawArena();
      };
      this.scale.on('resize', this.handleResize);
      this.input.on('pointerdown', p => { if(state.running){ state.pointer = {x:p.x,y:p.y,t:this.time.now}; this.bladeTrail=[{x:p.x,y:p.y,t:this.time.now}]; state.swipeCutCount=0; } });
      this.input.on('pointermove', p => {
        if(!state.running || !p.isDown || !state.pointer) return;
        const next = {x:p.x,y:p.y,t:this.time.now};
        this.drawBlade(state.pointer,next);
        this.checkCuts(state.pointer,next);
        this.resolveHits();
        state.pointer = next;
      });
      const endSwipe=()=>{state.pointer=null;this.resolveHits();};
      this.input.on('pointerup', endSwipe);
      this.input.on('pointerupoutside', endSwipe);
      this.nextWaveAt = this.time.now + 650;
      this.lastHudAt = 0;
      this.events.once('shutdown', () => {
        this.scale.off('resize', this.handleResize);
        state.scene = null;
      });
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
      if(!this.bladeTrail)this.bladeTrail=[];
      const last=this.bladeTrail[this.bladeTrail.length-1];
      if(!last||Math.hypot(b.x-last.x,b.y-last.y)>1.5)this.bladeTrail.push({x:b.x,y:b.y,t:this.time.now});
      if(this.bladeTrail.length>18)this.bladeTrail.splice(0,this.bladeTrail.length-18);
      this.renderBlade(this.time.now);
    }
    renderBlade(time){
      const trail=this.bladeTrail||[];
      while(trail.length&&time-trail[0].t>145)trail.shift();
      const g=this.bladeGraphics;if(!g)return;
      g.clear();
      for(let i=1;i<trail.length;i++){
        const p=trail[i-1],q=trail[i],age=Math.max(0,time-q.t);
        const fade=Math.max(0,1-age/145);
        const progress=i/(trail.length-1||1);
        g.lineStyle(17*fade,0x48aaff,.09*fade);g.lineBetween(p.x,p.y,q.x,q.y);
        g.lineStyle(7*fade,0x9bdcff,.24*fade);g.lineBetween(p.x,p.y,q.x,q.y);
        g.lineStyle(2.4*fade,0xf4fbff,.94*fade);g.lineBetween(p.x,p.y,q.x,q.y);
        if(i===trail.length-1&&fade>.1){g.fillStyle(0xffffff,.8*fade);g.fillCircle(q.x,q.y,2.2*progress);}
      }
    }
    update(time,delta){
      this.renderBlade(time);
      if(!state.running||state.paused) return;
      this.objects = this.objects.filter(o => { if(!o.active || !o.body || o.isCut) return false; if(o.y > this.scale.height + 130){ if(!o.missHandled && o.item && (o.item.kind==='fruit'||o.item.kind==='club')){ o.missHandled=true; state.lives=Math.max(0,state.lives-1); state.streak=0; state.swipeCutCount=0; floatText(this.scale.width/2,this.scale.height-90,'ПРОПУЩЕНО! −1 ❤️'); playSound('miss'); haptic('warning'); hud(); if(state.lives<=0) finish(); } o.destroy(); return false; } return true; });
      if(!state.running)return;
      if(this.objects.length < this.maxOnScreen() && time >= this.nextWaveAt) this.spawnWave();
      if(time-this.lastHudAt>120){hud();this.lastHudAt=time;}
    }
    maxOnScreen(){ return state.lives===1 ? 5 : 7; }
    bombInterval(){
      const s=state.score;
      let n=s>=10000?6:s>=5000?7:s>=2500?8:9;
      if(state.lives===1) n+=2;
      // Increase bomb frequency at the requested score milestones.
      // Dividing the interval scales expected bomb frequency without
      // making bombs more common in the early game or changing bonuses.
      const frequencyMultiplier=s>=20000?4:s>=10000?3:s>=5000?2:1;
      return n/frequencyMultiplier;
    }
    bonusInterval(){
      const s=state.score;
      return s>=7000?20:s>=3500?22:s>=1200?24:26;
    }
    spawnWave(){
      const room=this.maxOnScreen()-this.objects.length-state.pendingLaunches-Math.min(2,Math.ceil(state.debrisCount/3));
      if(room<2){this.nextWaveAt=this.time.now+450;return;}
      state.wave++;
      state.wavesSinceBomb++;
      state.wavesSinceBonus++;
      const scoreTier=Math.floor(state.score/500);
      const count=Math.min(room,2+Math.floor(Math.random()*2)+Math.min(2,Math.floor(scoreTier/3)));
      const bombReady=state.wavesSinceBomb>=this.bombInterval();
      const bonusReady=state.wavesSinceBonus>=this.bonusInterval();
      const bombChance=bombReady?Math.min(.48,.32+scoreTier*.008):0;
      const bonusChance=bonusReady?Math.min(.34,.18+scoreTier*.004):0;
      const roll=Math.random();
      let special=null;
      if(bombReady && roll<bombChance){special=ITEMS.find(x=>x.id==='bomb');state.wavesSinceBomb=0;}
      else if(bonusReady && roll<bombChance+bonusChance){special=BONUSES[Math.floor(Math.random()*BONUSES.length)];state.wavesSinceBonus=0;}
      const items=[];
      if(special) items.push(special);
      const waveCount=Math.min(count,room);
      while(items.length<waveCount) items.push(REGULAR[Math.floor(Math.random()*REGULAR.length)]);
      Phaser.Utils.Array.Shuffle(items);
      const baseX=this.scale.width*.28+Math.random()*this.scale.width*.44;
      const gap=special?Math.min(88,this.scale.width*.21):Math.min(56,this.scale.width*.13);
      const token=state.roundToken;
      items.forEach((item,i)=>{
        const offset=(i-(items.length-1)/2)*gap;
        const x=Phaser.Math.Clamp(baseX+offset+(Math.random()-.5)*34,45,this.scale.width-45);
        const delay=i*155+Math.random()*105;
        state.pendingLaunches++;
        this.time.delayedCall(delay,()=>{
          if(token!==state.roundToken)return;
          state.pendingLaunches=Math.max(0,state.pendingLaunches-1);
          if(state.running)this.launch(item,x,i,items.length);
        });
      });
      const scorePace=Math.min(360,Math.floor(scoreTier*5));
      this.nextWaveAt=this.time.now+Math.max(520,1050-scorePace)+Math.random()*240;
    }
    launch(item,x,index,total){
      const key=item.id;
      const hasTexture=this.textures.exists(key);
      const launchY=this.scale.height+34+Math.random()*66;
      const obj=hasTexture?this.physics.add.image(x,launchY,key):this.addFallback(item,x,launchY);
      if(!obj.body) this.physics.add.existing(obj);
      obj.setDepth(5);
      const targetH=Math.min(104,Math.max(66,this.scale.height*.135));
      if(hasTexture){
        const source=obj.texture.getSourceImage();
        const scale=targetH/Math.max(1,source.height);
        obj.setScale(scale);
      } else obj.setScale(targetH/78);
      obj.item=item;obj.isCut=false;
      // Keep Phaser's native scaled texture body; swipe hits use our own ellipse test.
      obj.body.setAllowGravity(true);
      obj.body.setBounce(0.08);
      const gravity=this.physics.world.gravity.y||1120;
      const scoreTier=Math.floor(state.score/500);
      const difficultyLift=Math.min(.075,scoreTier*.004);
      const apexRatio=Phaser.Math.Clamp(.48+Math.random()*.18+difficultyLift,.46,.72);
      const apexY=this.scale.height*(1-apexRatio);
      const rise=Math.max(180,launchY-apexY);
      const vy=-Math.sqrt(2*gravity*rise);
      const spread=(index-(total-1)/2)*42;
      const desiredVx=spread+(Math.random()-.5)*120;
      const flightBudget=1.8;
      const minVx=(42-x)/flightBudget;
      const maxVx=(this.scale.width-42-x)/flightBudget;
      const vx=Phaser.Math.Clamp(desiredVx,minVx,maxVx);
      if(obj.setVelocity)obj.setVelocity(vx,vy);else obj.body.setVelocity(vx,vy);
      const spin=(Math.random()-.5)*230;
      if(obj.setAngularVelocity)obj.setAngularVelocity(spin);else obj.body.setAngularVelocity(spin);
      obj.setRotation((Math.random()-.5)*.5);
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
        const rx=Math.max(12,o.displayWidth*.46),ry=Math.max(14,o.displayHeight*.46);
        const hitT=segmentEllipseHitT(p1,p2,rx,ry);
        if(hitT!==null){
          o.isCut=true;
          o.cutNormal={x:-dy/Math.max(1,Math.hypot(dx,dy)),y:dx/Math.max(1,Math.hypot(dx,dy))};
          o.cutPoint={x:a.x+dx*hitT,y:a.y+dy*hitT};
          const elapsed=Math.max(8,(b.t||this.time.now)-(a.t||this.time.now-16));
          o.cutSpeed=Phaser.Math.Clamp(Math.hypot(dx,dy)/elapsed*1000,500,3200);
          o.cutTangent={x:dx/Math.max(1,Math.hypot(dx,dy)),y:dy/Math.max(1,Math.hypot(dx,dy))};
          o.cutProgress=hitT;
          state.swipeHits.push(o);
        }
      });
    }
    resolveHits(){
      if(!state.swipeHits.length) return;
      const hits=state.swipeHits.splice(0).sort((a,b)=>(a.cutProgress??0)-(b.cutProgress??0));
      hits.forEach(o=>{
        const item=o.item;
        const x=o.x,y=o.y;
        if(item.kind==='bomb'||item.kind==='hazard'){
          state.lives=Math.max(0,state.lives-1);state.streak=0;state.swipeCutCount=0;
          floatText(x,y,item.kind==='bomb'?'БА-БАХ! −1 ❤️':'ОПАСНО! −1 ❤️');
          this.burst(x,y,0xff704d);playSound(item.kind==='bomb'?'bomb':'hazard');haptic('heavy');
        } else {
          state.streak++;
          state.swipeCutCount++;
          state.maxCombo=Math.max(state.maxCombo,state.swipeCutCount);
          if(item.kind==='bonus'){
            state.multiplier=item.multiplier;
            floatText(x,y,'БУСТ ×'+item.multiplier);
            this.burst(x,y,0xf5d77c);playSound('bonus');haptic('success');
          } else {
            if(item.life){const before=state.lives;state.lives=Math.min(3,state.lives+1);floatText(x,y,before<3?'＋1 ❤️':'МАКС. ЖИЗНИ');}
            const combo=Math.max(1,Math.min(5,state.swipeCutCount));
            const streakBonus=Math.min(3,1+Math.floor(state.streak/5));
            const pts=10*combo*streakBonus*state.multiplier;
            state.score+=pts;state.multiplier=1;
            floatText(x,y,'+'+pts);playSound('slice');haptic('light');
            this.burst(x,y,0x9bdcff);
          }
        }
        this.split(o);
      });
      hud();
      if(state.lives<=0) finish();
    }
    split(o){
      const item=o.item,x=o.x,y=o.y;
      const vx=o.body?.velocity.x||0,vy=o.body?.velocity.y||0;
      const normal=o.cutNormal||{x:1,y:0};
      const tangent=o.cutTangent||{x:0,y:-1};
      // The supplied PNG halves are split top/bottom. Rotate their seam
      // to the actual swipe direction so the two halves separate correctly.
      const cutAngle=Math.atan2(tangent.y,tangent.x);
      const swipeSpeed=Phaser.Math.Clamp(Number(o.cutSpeed)||1100,500,3200);
      const separation=Phaser.Math.Clamp(95+swipeSpeed*.052,120,260);
      const carry=Phaser.Math.Clamp(swipeSpeed*.018,8,58);
      const spin=Phaser.Math.Clamp(170+swipeSpeed*.105,220,510);
      const cut=o.cutPoint||{x,y};
      o.destroy();
      ['top','bottom'].forEach((part,i)=>{
        const key=item.id+'-'+part;
        if(!this.textures.exists(key)) return;
        const sign=i===0?-1:1;
        const half=this.physics.add.image(x+normal.x*sign*5,y+normal.y*sign*5,key);
        state.debrisCount++;
        half.setDepth(7);half.setRotation(cutAngle);
        half.setDisplaySize(Math.max(24,o.displayWidth*.96),Math.max(20,o.displayHeight*.52));
        half.body.setAllowGravity(true);
        const kick=separation+Math.random()*32;
        half.setVelocity(vx+normal.x*sign*kick+tangent.x*carry,vy+normal.y*sign*kick+tangent.y*carry-35);
        half.setAngularVelocity(sign*(spin+Math.random()*85));
        this.tweens.add({targets:half,alpha:0,duration:950,delay:300,ease:'Quad.easeIn'});
        this.time.delayedCall(1300,()=>{if(half.active)half.destroy();state.debrisCount=Math.max(0,state.debrisCount-1);});
      });
      this.juiceSplash(cut.x,cut.y,item.kind==='bonus'?0xf5d77c:item.kind==='club'?0x8fcfff:0xff6f78);
    }
    juiceSplash(x,y,color){
      const flash=this.add.circle(x,y,Math.max(8,Math.min(22,this.scale.width*.035)),color,.72).setDepth(18);
      this.tweens.add({targets:flash,scale:2.1,alpha:0,duration:180,ease:'Quad.easeOut',onComplete:()=>flash.destroy()});
      const p=this.add.particles(x,y,'__WHITE',{speed:{min:95,max:430},angle:{min:0,max:360},scale:{start:.8,end:0},tint:color,quantity:24,lifespan:620,gravityY:560,blendMode:Phaser.BlendModes.ADD});
      this.time.delayedCall(680,()=>p.destroy());
    }
    burst(x,y,color){
      this.cameras.main.shake(105,0.0025);
      const p=this.add.particles(x,y,'__WHITE',{speed:{min:80,max:360},angle:{min:0,max:360},scale:{start:.9,end:0},tint:color,quantity:22,lifespan:560,gravityY:480,blendMode:Phaser.BlendModes.ADD});
      this.time.delayedCall(620,()=>p.destroy());
    }
    };
  }

  function segmentEllipseHitT(a,b,rx,ry){
    const ax=a.x/rx,ay=a.y/ry,bx=b.x/rx,by=b.y/ry;
    const dx=bx-ax,dy=by-ay;
    const A=dx*dx+dy*dy;
    const C=ax*ax+ay*ay-1;
    if(C<=0)return 0;
    if(A<1e-9)return null;
    const B=2*(ax*dx+ay*dy);
    const discriminant=B*B-4*A*C;
    if(discriminant<0)return null;
    const root=Math.sqrt(discriminant);
    const t1=(-B-root)/(2*A),t2=(-B+root)/(2*A);
    const enter=Math.max(0,Math.min(t1,t2));
    const leave=Math.min(1,Math.max(t1,t2));
    return enter<=leave?Phaser.Math.Clamp(enter,0,1):null;
  }

  function segmentBoxHitT(a,b,halfW,halfH){
    let tMin=0,tMax=1;
    const dx=b.x-a.x,dy=b.y-a.y;
    const p=[-dx,dx,-dy,dy];
    const q=[a.x+halfW,halfW-a.x,a.y+halfH,halfH-a.y];
    for(let i=0;i<4;i++){
      if(Math.abs(p[i])<1e-7){if(q[i]<0)return null;continue;}
      const t=q[i]/p[i];
      if(p[i]<0)tMin=Math.max(tMin,t);else tMax=Math.min(tMax,t);
      if(tMin>tMax)return null;
    }
    return Phaser.Math.Clamp((tMin+tMax)*.5,0,1);
  }

  function haptic(kind){try{if(kind==='success'||kind==='warning')tg?.HapticFeedback?.notificationOccurred?.(kind);else tg?.HapticFeedback?.impactOccurred?.(kind);}catch(e){}}
  const AUDIO_URLS={
    background:'/audio/slice/%D0%B7%D0%B2%D1%83%D0%BA%20%D0%BD%D0%B0%20%D1%84%D0%BE%D0%BD.mp3',
    slice:'/audio/slice/%D0%BC%D1%8F%D1%83.mp3',
    bomb:'/audio/slice/%D1%83%D0%B2%D1%83.mp3',
    start:'/audio/slice/%D1%8F%D0%BC%D0%B0%D1%82%D1%8D%20%D0%BA%D1%83%D0%B4%D0%B0%D1%81%D0%B0%D0%B8%CC%86.mp3'
  };
  function startBackground(){
    try{
      if(!state.bgm){
        state.bgm=new Audio(AUDIO_URLS.background);
        state.bgm.loop=true;
        state.bgm.preload='auto';
        state.bgm.volume=.32;
      }
      if(state.bgm.paused){
        const p=state.bgm.play();
        if(p&&typeof p.catch==='function')p.catch(()=>{});
      }
    }catch(e){}
  }
  function stopBackground(){
    try{if(state.bgm){state.bgm.pause();state.bgm.currentTime=0;}}catch(e){}
  }
  function playSound(kind){
    if(kind==='slice'||kind==='bomb'||kind==='start'){
      try{
        const sound=new Audio(AUDIO_URLS[kind]);
        sound.preload='auto';
        sound.volume=kind==='start'?.9:kind==='bomb'?.95:.85;
        state.sfx.push(sound);
        sound.addEventListener('ended',()=>{state.sfx=state.sfx.filter(x=>x!==sound);},{once:true});
        const p=sound.play();
        if(p&&typeof p.catch==='function')p.catch(()=>{});
      }catch(e){}
      return;
    }
    try{
      const Ctx=window.AudioContext||window.webkitAudioContext;
      if(!Ctx)return;
      if(!state.audio)state.audio=new Ctx();
      if(state.audio.state==='suspended')state.audio.resume();
      const ctx=state.audio,now=ctx.currentTime;
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      const presets={bonus:[740,1180,.22,'sine',.07],hazard:[150,55,.28,'sawtooth',.09],miss:[220,90,.2,'triangle',.065]};
      const p=presets[kind]||presets.miss;
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
    if(state.rewardPending){if(typeof window.toast==='function')window.toast('Сначала повтори начисление предыдущего раунда.');return;}
    if(!tg?.initData&&!DEMO_MODE){if(typeof window.toast==='function')window.toast('Открой КАЮК BET внутри Telegram');return;}
    playSound('start');
    startBackground();
    enterFullscreen(true);
    try{tg?.disableVerticalSwipes?.();}catch(e){}
    state.startBusy=true;$('sliceStart').disabled=true;$('sliceStart').textContent='ЗАПУСКАЕМ…';
    try{
      await ensurePhaser();
      let sessionId;
      if(DEMO_MODE) sessionId='demo-'+Date.now();
      else {
        const r=await fetch('/api/slice/start',{method:'POST',headers:headers(),body:'{}'}),d=await r.json();
        if(!r.ok)throw new Error(d.error||'Не удалось начать игру');
        sessionId=d.sessionId;
      }
      Object.assign(state,{sessionId,running:true,paused:false,finished:false,score:0,lives:3,maxCombo:0,streak:0,swipeCutCount:0,multiplier:1,wave:0,wavesSinceBomb:0,wavesSinceBonus:0,objects:[],pointer:null,swipeHits:[],pendingLaunches:0,roundToken:state.roundToken+1,rewardPending:false,rewardPayload:null,rewardSubmitting:false});
      document.body.classList.add('slice-playing');
      $('sliceIntro').classList.add('hidden');$('sliceEnd').classList.add('hidden');
      $('sliceHud').classList.remove('hidden');$('sliceStart').classList.add('hidden');
      hud();
      if(!state.game){
        state.game=new Phaser.Game({type:Phaser.AUTO,parent:'sliceGame',transparent:false,backgroundColor:'#081321',
          scale:{mode:Phaser.Scale.RESIZE,width:Math.max(320,document.getElementById('sliceGame')?.clientWidth||window.innerWidth),height:Math.max(480,document.getElementById('sliceGame')?.clientHeight||window.innerHeight),autoCenter:Phaser.Scale.CENTER_BOTH},
          physics:{default:'arcade',arcade:{gravity:{y:1120},debug:false}},
          render:{antialias:true,roundPixels:false},scene:[createSliceSceneClass()]});
        state.game.events.once('ready',()=>{});
      } else {
        state.scene?.scene.restart();
      }
    }catch(e){
      state.running=false;stopBackground();if(typeof window.toast==='function')window.toast(e.message);
      $('sliceStart').disabled=false;$('sliceStart').textContent='НАЧАТЬ ИГРУ';
    }finally{state.startBusy=false;}
  }
  async function leaderboard(){
    const box=$('sliceLeaderboard');if(!box)return;
    if(DEMO_MODE){box.innerHTML='<div class="empty">Демо-режим: реальные рекорды не загружаются.</div>';return;}
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
  async function submitReward(){
    if(!state.rewardPending||!state.rewardPayload||state.rewardSubmitting)return;
    if(DEMO_MODE){
      state.rewardPending=false;
      state.rewardPayload=null;
      try{localStorage.removeItem('kayukSlicePendingReward');}catch(e){}
      $('sliceReward').textContent='ДЕМО-РЕЖИМ: очки не зачисляются в баланс.';
      const demoButton=$('slicePlayAgain');
      if(demoButton){demoButton.disabled=false;demoButton.textContent='ИГРАТЬ ЕЩЁ';}
      return;
    }
    state.rewardSubmitting=true;
    const button=$('slicePlayAgain');
    if(button){button.disabled=true;button.textContent='НАЧИСЛЯЕМ…';}
    $('sliceReward').textContent='Зачисляем '+money(state.rewardPayload.score)+'…';
    try{
      const r=await fetch('/api/slice/finish',{method:'POST',headers:headers(),body:JSON.stringify(state.rewardPayload)}),d=await r.json();
      if(!r.ok)throw new Error(d.error||'Не удалось зачислить результат');
      state.rewardPending=false;
      state.rewardPayload=null;
      try{localStorage.removeItem('kayukSlicePendingReward');}catch(e){}
      $('sliceReward').textContent='+'+money(d.reward)+' на общий баланс';
      $('sliceBalance').textContent=money(d.balance);
      if(typeof window.loadProfile==='function')await window.loadProfile();
      $('sliceBalance').textContent=$('balance')?.textContent||money(d.balance);
      if(button){button.disabled=false;button.textContent='ИГРАТЬ ЕЩЁ';}
      await leaderboard();
    }catch(e){
      state.rewardPending=true;
      if(button){button.disabled=false;button.textContent='ПОВТОРИТЬ НАЧИСЛЕНИЕ';}
      $('sliceReward').textContent='Не удалось зачислить: '+e.message+'. Награда сохранена — повтори начисление.';
      if(typeof window.toast==='function')window.toast('Начисление не завершено. Нажми «Повторить начисление».');
    }finally{
      state.rewardSubmitting=false;
    }
  }
  async function finish(){
    if(state.lives>0||state.finished||!state.sessionId)return;
    state.finished=true;state.running=false;state.paused=false;stopBackground();
    document.body.classList.remove('slice-playing');
    state.rewardPayload={sessionId:state.sessionId,score:state.score,maxCombo:state.maxCombo};
    state.rewardPending=true;
    try{localStorage.setItem('kayukSlicePendingReward',JSON.stringify(state.rewardPayload));}catch(e){}
    $('sliceEnd').classList.remove('hidden');
    $('sliceEndTitle').textContent='ВСЕ ТРИ ЖИЗНИ ПОТРАЧЕНЫ';
    $('sliceFinalScore').textContent=state.score.toLocaleString('ru-RU');
    $('sliceReward').textContent='Зачисляем '+money(state.score)+'…';
    $('slicePlayAgain').disabled=false;
    $('slicePlayAgain').textContent='ПОВТОРИТЬ НАЧИСЛЕНИЕ';
    await submitReward();
  }
  function close(){
    // Return to the regular KAYUK BET page layout. SLICE fullscreen is only
    // a CSS state; leaving it means removing those classes and navigating home.
    if(state.running&&!state.finished){
      state.paused=true;
      state.pointer=null;
      state.swipeHits=[];
      state.scene?.scene.pause();
      stopBackground();
      document.body.classList.remove('slice-playing');
      if(typeof window.toast==='function')window.toast('Раунд на паузе. Очки начислятся только после потери всех 3 жизней.');
    }
    document.body.classList.remove('slice-fullscreen','slice-playing');
    document.documentElement.classList.remove('slice-fullscreen');
    try{tg?.enableVerticalSwipes?.();}catch(e){}
    if(typeof window.page==='function')window.page('home');
  }
  function syncViewport(){
    // SLICE owns these viewport variables only while its immersive screen is open.
    // Telegram may emit delayed viewportChanged/resize events after returning home;
    // ignore those so they cannot restore stale game dimensions on the main page.
    if(!document.body.classList.contains('slice-fullscreen'))return;
    const height=Math.max(320,Number(tg?.viewportHeight)||window.visualViewport?.height||window.innerHeight||0);
    const stable=Math.max(320,Number(tg?.viewportStableHeight)||height);
    document.documentElement.style.setProperty('--slice-viewport-height',height+'px');
    document.documentElement.style.setProperty('--slice-stable-height',stable+'px');
    if(state.game){state.game.scale.refresh();}
  }
  function enterFullscreen(){
    document.body.classList.add('slice-fullscreen');
    document.documentElement.classList.add('slice-fullscreen');
    syncViewport();
    // Keep the game immersive with CSS + Telegram expand(), without switching
    // the Telegram WebView into native fullscreen. Native fullscreen transitions
    // can leave a narrowed viewport on iOS after the game is closed.
    try{tg?.expand?.();}catch(e){}
  }
  function open(){
    leaderboard();$('sliceBalance').textContent=$('balance')?.textContent||'—';enterFullscreen(false);
    if(state.rewardPending){$('sliceIntro').classList.add('hidden');$('sliceEnd').classList.remove('hidden');$('sliceHud').classList.remove('hidden');}
    if(state.running&&!state.finished){
      state.paused=false;
      document.body.classList.add('slice-playing');
      state.scene?.scene.resume();
      startBackground();
    }
  }
  function init(){
    if(DEMO_MODE){
      $('sliceStart').textContent='ЗАПУСТИТЬ ДЕМО';
      const subtitle=$('sliceIntro')?.querySelector('p');
      if(subtitle)subtitle.textContent='Демо-просмотр полноценной игры. Очки и награды не зачисляются в виртуальный баланс.';
    }
    $('sliceStart')?.addEventListener('click',start);
    $('slicePlayAgain')?.addEventListener('click',()=>state.rewardPending?submitReward():start());
    try{
      const pending=JSON.parse(localStorage.getItem('kayukSlicePendingReward')||'null');
      const score=Number(pending?.score),combo=Number(pending?.maxCombo||0);
      if(pending&&typeof pending.sessionId==='string'&&Number.isSafeInteger(score)&&score>=0&&Number.isSafeInteger(combo)&&combo>=0){
        state.rewardPayload={sessionId:pending.sessionId,score,maxCombo:combo};
        state.rewardPending=true;state.finished=true;state.score=score;state.lives=0;
        $('sliceIntro')?.classList.add('hidden');$('sliceEnd')?.classList.remove('hidden');$('sliceHud')?.classList.remove('hidden');
        $('sliceEndTitle').textContent='НАГРАДА ОЖИДАЕТ НАЧИСЛЕНИЯ';
        $('sliceFinalScore').textContent=score.toLocaleString('ru-RU');
        $('sliceReward').textContent='Раунд завершён. Награда ожидает подтверждения.';
        $('slicePlayAgain').textContent='ПОВТОРИТЬ НАЧИСЛЕНИЕ';
      }
    }catch(e){}
    if(!window.Phaser)console.warn('Phaser CDN unavailable; fallback will load when the player starts.');
    if($('sliceTimer'))$('sliceTimer').closest('.slice-hud-item')?.remove();
    const gameHost=$('sliceGame');
    if(gameHost){gameHost.style.width='100%';gameHost.style.height='100%';gameHost.style.minHeight='0';gameHost.style.touchAction='none';}
    syncViewport();
    tg?.onEvent?.('viewportChanged',syncViewport);
    window.addEventListener('resize',syncViewport,{passive:true});
    window.visualViewport?.addEventListener('resize',syncViewport,{passive:true});
    document.addEventListener('visibilitychange',()=>{if(!state.game)return;if(document.hidden){state.scene?.scene.pause();state.bgm?.pause();}else if(state.running&&!state.paused){state.scene?.scene.resume();startBackground();}});
  }
  window.KayukSlice={open,close,leaderboard};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();