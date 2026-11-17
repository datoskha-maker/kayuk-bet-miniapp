(() => {
  const $ = (s, root=document) => root.querySelector(s);
  const tg = window.Telegram?.WebApp;
  const initData = tg?.initData || '';
  const api = async (method='GET', body=null) => {
    const response = await fetch('/api/profile?scope=luna', {
      method,
      headers: { 'Content-Type':'application/json', 'x-telegram-init-data': initData },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Не удалось выполнить действие');
    return data;
  };

  const style = document.createElement('style');
  style.textContent = `
    #phone-screen{background:#00ff00 url('https://raw.githubusercontent.com/datoskha-maker/kayuk-bet-miniapp/main/IMG_2031.png') center center / 100% 100% no-repeat;color:#fff;display:block;padding:12px 11px 14px;overflow:auto;overflow-x:hidden;overscroll-behavior:contain;text-align:left;font-size:12px;scrollbar-width:none;border-radius:8.5% / 4.8%;box-shadow:inset 0 0 0 1px #ffffff24}
    .luna-phone-head{display:flex;align-items:center;justify-content:space-between;gap:5px;margin-bottom:13px;font-size:12px;font-weight:900;letter-spacing:.25px;min-height:28px;text-shadow:0 1px 5px #000}
    .luna-phone-back{background:#ffffff18;border:1px solid #ffffff35;border-radius:9px;padding:6px 9px;font-size:10px;color:#fff;white-space:nowrap}
    .luna-phone-menu{display:flex;flex-direction:column;gap:9px}
    .luna-phone-app{width:100%;min-height:58px;display:flex;align-items:center;gap:12px;padding:9px 12px;border-radius:13px;background:rgba(8,20,34,.56);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);border:1px solid #ffffff65;color:#fff;text-align:left;font-size:13px;font-weight:800;box-shadow:0 3px 9px #0002;touch-action:manipulation}
    .luna-phone-app span:first-child{font-size:23px;width:29px;text-align:center;flex:none}
    .luna-phone-content{font-size:11px;line-height:1.45;max-height:calc(100% - 42px);overflow:auto;overscroll-behavior:contain}
    .luna-phone-content p{margin:5px 0}
    .luna-phone-content button,.luna-phone-content select,.luna-phone-content input{font:inherit}
    .luna-mini-btn{border:0;border-radius:9px;padding:8px 10px;background:#e9c36a;color:#1a2630;font-size:10px;font-weight:900;margin:4px 3px 0 0;touch-action:manipulation}
    .luna-mini-btn.secondary{background:#ffffff20;color:#fff;border:1px solid #ffffff30}
    .luna-mini-card{padding:10px;margin:7px 0;border-radius:11px;background:#ffffff12;border:1px solid #ffffff20}
    .luna-phone-scroll{max-height:100%;overflow:auto}
    .luna-phone-muted{opacity:.72}
    .luna-card-choice{display:inline-block;width:30%;padding:9px 2px;border-radius:9px;margin:2px 1%;color:white;font-size:9px;font-weight:900;border:2px solid transparent}
    .luna-card-choice.selected{border-color:#f4d17d}
    #food-actions{display:none;left:92px;right:12px;bottom:calc(var(--safe-bottom) + 22px);justify-content:flex-end}
    #food-menu-open{background:rgba(13,30,49,.92);border:1px solid #ffffff66;border-radius:14px;padding:13px 20px;font-weight:900;font-size:13px;color:#fff;backdrop-filter:blur(10px)}
    #food-overlay .panel{background:#f8f1e3;color:#26342b}
    .luna-food-choice{width:48%;padding:18px 8px;border-radius:16px;background:#fffaf0;border:1px solid #e5dac6;color:#26342b;font-weight:900;font-size:15px}
    .luna-food-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
    .luna-shop-cats{display:flex;gap:6px;overflow:auto;padding:3px 0 10px}
    .luna-shop-cats button{white-space:nowrap;border:1px solid #d8cbb6;background:#fffaf0;color:#324237;border-radius:10px;padding:8px 10px;font-size:11px;font-weight:800}
    .luna-shop-cats button.active{background:#173653;color:#fff}
    .luna-empty{padding:20px 10px;text-align:center;color:#778274;font-size:12px;line-height:1.5}
    .luna-shop-product{background:#fffaf0;border:1px solid #e5dac6;border-radius:13px;padding:10px;display:flex;flex-direction:column;gap:6px;min-height:116px}
    .luna-shop-product .emoji{font-size:25px}
    .luna-shop-product b{font-size:12px}
    .luna-shop-product small{font-size:10px;color:#778274;line-height:1.3}
    .luna-shop-product button{border-radius:9px;background:#244f3b;color:white;padding:8px;font-size:10px;font-weight:900;margin-top:auto}
    .luna-shop-product button:disabled{opacity:.5}
  `;
  document.head.appendChild(style);

  const phoneOpenOld = $('#phone-open');
  if (phoneOpenOld) {
    const phoneOpen = phoneOpenOld.cloneNode(true);
    phoneOpenOld.replaceWith(phoneOpen);
    phoneOpen.addEventListener('click', () => {
      $('#phone-overlay')?.classList.add('open');
      renderPhoneHome();
    });
  }
  const shopOpenOld = $('#shop-open');
  if (shopOpenOld) {
    const shopOpen = shopOpenOld.cloneNode(true);
    shopOpenOld.replaceWith(shopOpen);
    shopOpen.addEventListener('click', () => {
      $('#shop-overlay')?.classList.add('open');
      renderShop();
    });
  }

  const foodActions = $('#food-actions');
  if (foodActions) {
    foodActions.innerHTML = '<button id="food-menu-open">🍽️ Меню</button>';
    $('#food-menu-open').addEventListener('click', () => {
      $('#food-overlay').classList.add('open');
      renderFoodChoices();
    });
  }

  let phoneScreen = null;
  const phoneTools = $('.phone-tools');
  if (phoneTools) phoneTools.style.display = 'none';

  const shopOverlay = $('#shop-overlay');
  if (shopOverlay) shopOverlay.innerHTML = `
    <div class="panel">
      <div class="panel-head"><h2>Магазин Луны 🛍️</h2><button class="close" data-close="shop-overlay">×</button></div>
      <div class="wallet"><span>Баланс КАЮК BET</span><span id="luna-shop-balance">…</span></div>
      <div class="luna-shop-cats" id="luna-shop-cats"></div>
      <div class="shop-grid" id="luna-shop-grid"></div>
      <p style="font-size:10px;color:#7d897b;line-height:1.5;margin:14px 2px 0">Покупки оплачиваются с общего баланса КАЮК BET. Купленные предметы появятся в разделе «Покупки».</p>
    </div>`;
  const phoneOverlay = $('#phone-overlay');
  if (phoneOverlay) {
    phoneOverlay.innerHTML = `
      <button class="close phone-close" data-close="phone-overlay">×</button>
      <div class="phone-wrap">
        <img class="phone-img" src="https://raw.githubusercontent.com/datoskha-maker/kayuk-bet-miniapp/main/%D0%98%D0%B7%D0%BE%D0%B1%D1%80%D0%B0%D0%B6%D0%B5%D0%BD%D0%B8%D0%B5%20HEIF.jpeg" alt="Телефон Луны">
        <div class="phone-screen" id="phone-screen"><span>Загрузка…</span></div>
      </div>`;
  }
  // The overlay markup above replaces the original screen node; always bind to the live node.
  phoneScreen = $('#phone-screen');
  if (phoneScreen) {
    phoneScreen.style.left='2.7%'; phoneScreen.style.top='10.4%'; phoneScreen.style.width='94.6%'; phoneScreen.style.height='82.3%'; phoneScreen.style.aspectRatio='auto';
  }
  const foodOverlay = document.createElement('div');
  foodOverlay.id='food-overlay'; foodOverlay.className='overlay';
  foodOverlay.innerHTML = `<div class="panel"><div class="panel-head"><h2>Меню Луны 🍽️</h2><button class="close" data-close="food-overlay">×</button></div><div id="luna-food-content"></div></div>`;
  $('#game').appendChild(foodOverlay);

  let data = null;
  let shopCategory = 'stadium';
  const categories = [
    ['stadium','Стадион','🏟️'],['house','Дом','🏡'],['food','Еда','🍱'],
    ['bed','Лежанки','🛏️'],['scratchers','Когтеточки','🐾'],['toys','Игрушки','🧶'],
    ['interior','Интерьер','🪑'],['purchases','Покупки','🎁']
  ];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fmt = n => Number(n || 0).toLocaleString('ru-RU') + ' 🪙';
  function toast2(message) {
    const el=$('#toast'); if(!el) return;
    el.textContent=message; el.classList.add('show');
    clearTimeout(toast2.t); toast2.t=setTimeout(()=>el.classList.remove('show'),2300);
  }
  async function refresh() {
    data = await api();
    return data;
  }
  async function act(payload) {
    const result = await api('POST',payload);
    await refresh();
    renderStats2();
    return result;
  }
  function renderStats2() {
    if (!data) return;
    $('#coins-v') && ($('#coins-v').textContent=Number(data.balance).toLocaleString('ru-RU'));
    const state=data.state||{};
    for (const k of ['hunger','thirst','mood','energy','comfort']) {
      const el=$('#'+k+'-v'); if(el) el.textContent=(state[k] ?? 80)+'%';
    }
  }
  function phoneHeader(title, back='home') {
    return '<div class="luna-phone-head"><span>'+esc(title)+'</span><button class="luna-phone-back" data-phone-back="'+back+'">← Назад</button></div>';
  }
  function renderPhoneHome() {
    if (!phoneScreen) return;
    phoneScreen.innerHTML = '<div class="luna-phone-head"><span>ЛУНА PHONE 🐾</span><span>●●●</span></div><div class="luna-phone-menu">'+[
      ['📸','Фото','photos'],['🎵','Музыка','music'],['🛍️','Яндекс Лавка','lavka'],
      ['🏦','Кошка Банк','bank'],['🎁','Подарок','gift'],['🤳','Камера','camera']
    ].map(x=>'<button class="luna-phone-app" data-phone-app="'+x[2]+'"><span>'+x[0]+'</span><span>'+x[1]+'</span></button>').join('')+'</div>';
    phoneScreen.querySelectorAll('[data-phone-app]').forEach(b=>b.addEventListener('click',()=>renderPhoneApp(b.dataset.phoneApp)));
  }
  function bindBack() { phoneScreen.querySelectorAll('[data-phone-back]').forEach(b=>b.addEventListener('click',renderPhoneHome)); }
  function renderPhoneApp(name) {
    if (!data) return;
    if (name==='photos') {
      phoneScreen.innerHTML=phoneHeader('Фото Луны')+'<div class="luna-phone-content"><div class="luna-empty" style="color:#fff">📷<br>Альбом пока пуст.<br>Сюда добавим фотографии и видео Луны.</div></div>';
    } else if (name==='music') {
      phoneScreen.innerHTML=phoneHeader('Музыка')+'<div class="luna-phone-content"><div class="luna-empty" style="color:#fff">🎧<br>Плейлист пока пуст.<br>Добавим треки, когда ты пришлёшь музыку.</div></div>';
    } else if (name==='lavka') {
      const items=(data.catalog||[]).filter(x=>x.category==='lavka');
      phoneScreen.innerHTML=phoneHeader('Яндекс Лавка')+'<div class="luna-phone-content"><p>Покупки за общий баланс</p>'+(items.length?items.map(x=>'<div class="luna-mini-card"><b>'+esc(x.icon)+' '+esc(x.title)+'</b><br>'+fmt(x.price)+'<br><button class="luna-mini-btn" data-consume="'+esc(x.item_id)+'">Купить</button></div>').join(''):'<div class="luna-empty" style="color:#fff">Каталог пока пуст.<br>Позже добавим товары и цены.</div>')+'</div>';
      phoneScreen.querySelectorAll('[data-consume]').forEach(b=>b.addEventListener('click',async()=>{try{await act({action:'consume',itemId:b.dataset.consume});toast2('Покупка оформлена!');renderPhoneApp('lavka')}catch(e){toast2(e.message)}}));
    } else if (name==='bank') {
      const loan=data.loan;
      const card=data.state?.equipped?.card||'midnight';
      phoneScreen.innerHTML=phoneHeader('Кошка Банк')+'<div class="luna-phone-content"><div class="luna-mini-card"><small>ОБЩИЙ БАЛАНС</small><h2 style="margin:3px 0">'+fmt(data.balance)+'</h2></div><p>Выбери дизайн карты:</p><div>'+[
        ['midnight','Тёмная'],['barcelona','Барса'],['gold','Золотая']
      ].map(([id,label])=>'<button class="luna-card-choice '+(card===id?'selected':'')+'" data-card="'+id+'" style="background:'+(id==='midnight'?'#142b46':id==='barcelona'?'linear-gradient(135deg,#173c82 50%,#a51f36 50%)':'#9a7028')+'">'+label+'</button>').join('')+'</div>'+(loan?'<div class="luna-mini-card"><b>Кредит активен</b><p>Долг сейчас: '+fmt(loan.currentDue)+'</p><p>Срок: '+new Date(loan.due_at).toLocaleDateString('ru-RU')+' · Просрочка: '+loan.lateDays+' дн.</p><button class="luna-mini-btn" data-repay>Погасить</button></div>':'<div class="luna-mini-card"><b>Кредит</b><p>+50% к сумме · 7 дней · после срока +10% в день</p><button class="luna-mini-btn" data-loan="5000">5 000</button><button class="luna-mini-btn" data-loan="10000">10 000</button><button class="luna-mini-btn" data-loan="25000">25 000</button></div>')+'</div>';
      phoneScreen.querySelectorAll('[data-card]').forEach(b=>b.addEventListener('click',async()=>{try{await act({action:'card',card:b.dataset.card});renderPhoneApp('bank');toast2('Дизайн карты сохранён')}catch(e){toast2(e.message)}}));
      phoneScreen.querySelectorAll('[data-loan]').forEach(b=>b.addEventListener('click',async()=>{try{await act({action:'loan',amount:Number(b.dataset.loan)});renderPhoneApp('bank');toast2('Кредит зачислен')}catch(e){toast2(e.message)}}));
      phoneScreen.querySelector('[data-repay]')?.addEventListener('click',async()=>{try{await act({action:'repay'});renderPhoneApp('bank');toast2('Кредит погашен')}catch(e){toast2(e.message)}});
    } else if (name==='gift') {
      const claimed=Boolean(data.dailyGift);
      phoneScreen.innerHTML=phoneHeader('Ежедневный подарок')+'<div class="luna-phone-content"><div class="luna-empty" style="color:#fff">🎁<br>'+(claimed?'Сегодня подарок уже получен: '+fmt(data.dailyGift.amount):'Луна приготовила сюрприз!')+'</div><button class="luna-mini-btn" id="claim-gift" '+(claimed?'disabled':'')+'>'+(claimed?'До завтра 🐾':'Открыть подарок')+'</button></div>';
      $('#claim-gift',phoneScreen)?.addEventListener('click',async()=>{try{const result=await act({action:'gift'});renderPhoneApp('gift');toast2(result.alreadyClaimed?'Подарок уже получен':'Тебе выпало '+fmt(result.amount)+'!')}catch(e){toast2(e.message)}});
    } else if (name==='camera') {
      phoneScreen.innerHTML=phoneHeader('Фронтальная камера')+'<div class="luna-phone-content"><div class="luna-empty" style="color:#fff">🤳<br>Луна смотрит прямо на тебя!<br>Фото-заставку добавим, когда ты пришлёшь картинку.</div><button class="luna-mini-btn secondary" id="camera-snap">📸 Сделать вид, что сфоткал</button></div>';
      $('#camera-snap',phoneScreen)?.addEventListener('click',()=>toast2('Мяу! Снимок получился 😹'));
    }
    bindBack();
  }
  function renderShop() {
    if (!data) return;
    $('#luna-shop-balance').textContent=fmt(data.balance);
    $('#luna-shop-cats').innerHTML=categories.map(([id,label,icon])=>'<button data-shop-cat="'+id+'" class="'+(shopCategory===id?'active':'')+'">'+icon+' '+label+'</button>').join('');
    $('#luna-shop-cats').querySelectorAll('[data-shop-cat]').forEach(b=>b.addEventListener('click',()=>{shopCategory=b.dataset.shopCat;renderShop()}));
    const inventory=new Set((data.inventory||[]).map(x=>x.item_id));
    const items=shopCategory==='purchases'?(data.catalog||[]).filter(x=>inventory.has(x.item_id)):(data.catalog||[]).filter(x=>x.category===shopCategory);
    $('#luna-shop-grid').innerHTML=items.length?items.map(x=>{
      const slot=x.category, equipped=data.state?.equipped?.[slot]===x.item_id, owned=inventory.has(x.item_id);
      return '<div class="luna-shop-product"><div class="emoji">'+esc(x.icon)+'</div><b>'+esc(x.title)+'</b><small>'+esc(x.description)+'</small>'+(shopCategory==='purchases'?(equipped?'<button data-unequip="'+esc(slot)+'" class="secondary">Снять</button>':'<button data-equip="'+esc(x.item_id)+'" data-slot="'+esc(slot)+'">Установить</button>'): '<button data-buy="'+esc(x.item_id)+'" '+(owned?'disabled':'')+'>'+(owned?'Куплено ✓':fmt(x.price)+' · Купить')+'</button>')+'</div>';
    }).join(''):'<div class="luna-empty" style="grid-column:1/-1">В этом разделе пока пусто.<br>Наполним его предметами и ценами следующим этапом 🐾</div>';
    $('#luna-shop-grid').querySelectorAll('[data-buy]').forEach(b=>b.addEventListener('click',async()=>{try{await act({action:'purchase',itemId:b.dataset.buy});renderShop();toast2('Покупка сохранена в инвентаре')}catch(e){toast2(e.message)}}));
    $('#luna-shop-grid').querySelectorAll('[data-equip]').forEach(b=>b.addEventListener('click',async()=>{try{await act({action:'equip',slot:b.dataset.slot,itemId:b.dataset.equip});renderShop();toast2('Предмет установлен')}catch(e){toast2(e.message)}}));
    $('#luna-shop-grid').querySelectorAll('[data-unequip]').forEach(b=>b.addEventListener('click',async()=>{try{await act({action:'unequip',slot:b.dataset.unequip});renderShop();toast2('Предмет снят')}catch(e){toast2(e.message)}}));
  }
  function renderFoodChoices() {
    $('#luna-food-content').innerHTML='<div class="luna-food-grid"><button class="luna-food-choice" data-food-type="food">🍗 Еда</button><button class="luna-food-choice" data-food-type="drink">🥛 Напитки</button></div><p style="font-size:10px;color:#7d897b;margin-top:12px">Баланс КАЮК BET: <b id="luna-food-balance">'+fmt(data?.balance)+'</b></p>';
    $('#luna-food-content').querySelectorAll('[data-food-type]').forEach(b=>b.addEventListener('click',()=>renderFoodItems(b.dataset.foodType)));
  }
  function renderFoodItems(type) {
    const items=(data?.catalog||[]).filter(x=>x.category==='lavka' && Number(x.effect?.[type==='food'?'hunger':'thirst'])>0);
    $('#luna-food-content').innerHTML='<button class="luna-mini-btn secondary" id="food-back">← Назад</button><h3>'+(type==='food'?'🍗 Еда':'🥛 Напитки')+'</h3>'+(items.length?'<div class="luna-food-grid">'+items.map(x=>'<div class="luna-shop-product"><div class="emoji">'+esc(x.icon)+'</div><b>'+esc(x.title)+'</b><small>'+fmt(x.price)+'</small><button data-eat="'+esc(x.item_id)+'">Купить и '+(type==='food'?'покормить':'напоить')+'</button></div>').join('')+'</div>':'<div class="luna-empty">Пока здесь нет товаров.<br>Добавим еду и напитки в каталог.</div>');
    $('#food-back')?.addEventListener('click',renderFoodChoices);
    $('#luna-food-content').querySelectorAll('[data-eat]').forEach(b=>b.addEventListener('click',async()=>{try{const result=await act({action:'consume',itemId:b.dataset.eat});renderFoodItems(type);toast2(type==='food'?'Луна покушала 🍗':'Луна попила 🥛')}catch(e){toast2(e.message)}}));
  }

  document.addEventListener('click',e=>{
    const close=e.target.closest('[data-close]');
    if(close) $('#'+close.dataset.close)?.classList.remove('open');
  });

  refresh().then(() => {
    renderStats2();
    renderPhoneHome();
    renderShop();
    const oldShop = $('#shop-overlay');
    oldShop?.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>oldShop.classList.remove('open')));
    $('#phone-overlay')?.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$('#phone-overlay').classList.remove('open')));
  }).catch(error => {
    toast2(error.message);
    if (phoneScreen) phoneScreen.innerHTML='<div class="luna-empty" style="color:#fff">Не удалось подключиться к Кошка Банку.<br>Открой Луну внутри Telegram.</div>';
  });
})();