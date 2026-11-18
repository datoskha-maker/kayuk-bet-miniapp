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
    #phone-screen .luna-phone-app,#phone-screen .luna-phone-app:visited,#phone-screen .luna-phone-app:hover,#phone-screen .luna-phone-app:active{width:100%;min-height:58px;display:flex;align-items:center;gap:12px;padding:9px 12px;border-radius:13px;background-color:rgba(8,20,34,.82)!important;background-image:none!important;appearance:none;-webkit-appearance:none;backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);border:1px solid #ffffff65;color:#fff;text-align:left;font-size:13px;font-weight:800;box-shadow:0 3px 9px #0002;touch-action:manipulation}
    .luna-phone-app span:first-child{font-size:23px;width:29px;text-align:center;flex:none}
    .luna-phone-content{font-size:11px;line-height:1.45;max-height:calc(100% - 42px);overflow:auto;overscroll-behavior:contain}
    .luna-phone-content p{margin:5px 0}
    .luna-phone-content button,.luna-phone-content select,.luna-phone-content input{font:inherit}
    .luna-mini-btn{border:0;border-radius:9px;padding:8px 10px;background:#e9c36a;color:#1a2630;font-size:10px;font-weight:900;margin:4px 3px 0 0;touch-action:manipulation}
    .luna-mini-btn.secondary{background:#ffffff20;color:#fff;border:1px solid #ffffff30}
    .luna-mini-card{padding:10px;margin:7px 0;border-radius:11px;background:#ffffff12;border:1px solid #ffffff20}
    .luna-phone-scroll{max-height:100%;overflow:auto}
    .luna-phone-muted{opacity:.72}
    .luna-library{padding-top:5px}
  .luna-library-title{font-size:25px;line-height:1.05;letter-spacing:-1px;margin:8px 0 5px;color:#fff}
  .luna-library-sub{font-size:10px;color:#ffffff80;margin-bottom:17px}
  .luna-library-list{display:flex;flex-direction:column;gap:5px}
  .luna-library-track{width:100%;display:flex;align-items:center;gap:11px;text-align:left;padding:9px 7px;border:0;border-radius:12px;background:#ffffff0b;color:#fff}
  .luna-library-art{width:48px;height:48px;flex:0 0 48px;border-radius:8px;display:grid;place-items:center;overflow:hidden;color:#fff;font-size:17px;font-weight:950;box-shadow:0 4px 12px #0005}
  .luna-library-art.don,.luna-music-art.don{background:radial-gradient(circle at 70% 25%,#ffb2a5 0,transparent 27%),radial-gradient(circle at 25% 75%,#7d4b9c 0,transparent 38%),linear-gradient(145deg,#f06a65,#a93d68 48%,#242d59)}
  .luna-library-art.billie,.luna-music-art.billie{background:radial-gradient(ellipse at 50% 20%,#d7d7d7 0,transparent 22%),linear-gradient(160deg,#555b60,#17191d 55%,#08090b)}
  .luna-library-meta{min-width:0;flex:1;display:flex;flex-direction:column;gap:4px}
  .luna-library-meta strong{font-size:11px;line-height:1.2;font-weight:800}
  .luna-library-meta small{font-size:10px;color:#ffffff85}
  .luna-library-arrow{font-size:23px;color:#ffffff75;padding:0 6px}
  .luna-library-footer{text-align:center;font-size:9px;color:#ffffff60;margin-top:18px}
  .luna-music-art.don,.luna-music-art.billie{background-size:cover}
  .luna-music-art.billie:before{border-radius:45%;width:58%;left:21%;top:11%;height:85%;background:linear-gradient(180deg,#ffffff12,#0000);box-shadow:0 0 0 12px #ffffff08}
  .luna-music-art.billie:after{width:30%;left:35%;top:27%;background:#ffffff0b}
  .luna-music-screen{padding:3px 2px 12px;color:#fff}
    .luna-music-kicker{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#ff8295;font-weight:900;margin:2px 0 12px}
    .luna-music-art{position:relative;width:min(100%,218px);aspect-ratio:1;margin:7px auto 17px;border-radius:17px;overflow:hidden;background:radial-gradient(circle at 70% 25%,#ffb2a5 0,transparent 27%),radial-gradient(circle at 25% 75%,#7d4b9c 0,transparent 38%),linear-gradient(145deg,#f06a65 0%,#a93d68 42%,#242d59 100%);box-shadow:0 14px 30px #0008}
    .luna-music-art:before,.luna-music-art:after{content:"";position:absolute;border:1px solid #ffffff55;border-radius:50%;width:76%;aspect-ratio:1;left:12%;top:12%;box-shadow:0 0 0 13px #ffffff0c,0 0 0 27px #ffffff0a}
    .luna-music-art:after{width:38%;left:31%;top:31%;background:#ffffff12;backdrop-filter:blur(2px)}
    .luna-music-art-label{position:absolute;z-index:1;left:15px;right:15px;bottom:15px;text-align:left}
    .luna-music-art-label strong{display:block;font-size:23px;line-height:1;font-weight:950;letter-spacing:-1px}
    .luna-music-art-label span{display:block;margin-top:6px;font-size:8px;letter-spacing:3px;font-weight:800;opacity:.85}
    .luna-track-title{font-size:18px;line-height:1.15;font-weight:850;letter-spacing:-.4px;color:#000}
    .luna-track-artist{font-size:11px;color:#ff9aa8;margin-top:4px}
    .luna-track-progress{width:100%;height:4px;accent-color:#ff7188;margin:13px 0 2px;display:block}
    .luna-track-times{display:flex;justify-content:space-between;font-size:9px;color:#ffffff8c;font-variant-numeric:tabular-nums}
    .luna-player-controls{display:flex;align-items:center;justify-content:center;gap:27px;margin:11px 0 15px}
    .luna-player-side{border:0;background:transparent;color:#ffffffb8;font-size:17px;padding:7px}
    .luna-player-main{width:54px;height:54px;border:0;border-radius:50%;background:#fff;color:#171923;display:grid;place-items:center;font-size:22px;padding-left:4px;box-shadow:0 5px 18px #0005}
    .luna-player-note{padding:10px 12px;border-radius:12px;background:#ffffff10;border:1px solid #ffffff18;font-size:10px;color:#ffffffb8}
    .luna-card-choice{display:inline-block;width:30%;padding:9px 2px;border-radius:9px;margin:2px 1%;color:white;font-size:9px;font-weight:900;border:2px solid transparent}
    .luna-card-choice.selected{border-color:#f4d17d}
    #phone-screen:has(.luna-bank-screen) .luna-phone-head{color:#111;text-shadow:none}
    #phone-screen:has(.luna-bank-screen) .luna-phone-back{color:#111;background:#fff;border-color:#d7dbe0}
    .luna-bank-screen{color:#111!important;background:#f4f5f7;border-radius:14px;padding:10px 9px 14px;font-size:11px;line-height:1.4}
    .luna-bank-screen *{color:#111}
    .luna-bank-screen .luna-phone-head{color:#111;text-shadow:none}
    .luna-bank-screen .luna-phone-back{color:#111;background:#fff;border-color:#d7dbe0}
    .luna-bank-card{position:relative;min-height:145px;border-radius:17px;padding:13px 15px;margin:7px 0 13px;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;box-shadow:0 10px 22px #0002;color:#fff!important}
    .luna-bank-card *{color:inherit!important}
    .luna-bank-card.black{background:radial-gradient(ellipse at 85% 5%,#42464c 0,transparent 38%),linear-gradient(135deg,#080a0e,#20242a 58%,#08090b)}
    .luna-bank-card.gold{background:radial-gradient(ellipse at 85% 5%,#fff0a6 0,transparent 38%),linear-gradient(135deg,#765018,#d9b45b 48%,#8a6427);color:#211707!important}
    .luna-bank-card:after{content:"";position:absolute;width:180px;height:180px;border:1px solid #ffffff22;border-radius:50%;right:-70px;bottom:-115px;box-shadow:0 0 0 18px #ffffff09,0 0 0 38px #ffffff06}
    .luna-bank-card-top{position:relative;z-index:1;display:flex;justify-content:space-between;align-items:flex-start;font-size:9px;letter-spacing:1.2px;font-weight:900}
    .luna-bank-account{font-size:15px;letter-spacing:3px;font-variant-numeric:tabular-nums}
    .luna-bank-chip{width:27px;height:20px;border-radius:5px;border:1px solid currentColor;opacity:.8}
    .luna-bank-card-balance{position:relative;z-index:1;text-align:center;font-size:23px;font-weight:950;letter-spacing:-.7px;font-variant-numeric:tabular-nums}
    .luna-bank-card-balance small{display:block;font-size:8px;letter-spacing:2px;font-weight:800;margin-bottom:3px;opacity:.72}
    .luna-bank-card-bottom{position:relative;z-index:1;display:flex;justify-content:space-between;font-size:8px;letter-spacing:1.3px;font-weight:900}
    .luna-bank-section{background:#fff;border:1px solid #e0e3e7;border-radius:13px;padding:11px;margin:9px 0}
    .luna-bank-section h3{font-size:13px;margin:0 0 8px;color:#101317}
    .luna-bank-muted{font-size:10px;color:#69717b!important;line-height:1.45}
    .luna-bank-screen .luna-bank-btn{border:0;border-radius:9px;background:#15191f;color:#fff!important;padding:9px 12px;font-size:10px;font-weight:900;margin-top:7px}
    .luna-bank-screen .luna-bank-btn.gold{background:linear-gradient(135deg,#b68a36,#e3c46e);color:#211707!important}
    .luna-bank-screen .luna-bank-btn:disabled{opacity:.4}
    .luna-bank-input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #cbd0d7;border-radius:9px;background:#fff;color:#111!important;font-size:13px;margin:6px 0}
    .luna-bank-quote{background:#f4f0e6;border:1px solid #e4d6b5;border-radius:10px;padding:10px;margin-top:9px}
    .luna-bank-row{display:flex;justify-content:space-between;gap:8px;margin:5px 0;font-size:10px}
    .luna-bank-row b{font-variant-numeric:tabular-nums}
    .luna-bank-warning{color:#a13b27!important;font-size:10px;font-weight:800;margin-top:7px}

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
    .luna-shop-product .item-image{width:100%;height:112px;object-fit:contain;border-radius:9px;background:#fff}
    .luna-mini-card .lavka-item-image{display:block;width:100%;max-height:105px;object-fit:contain;border-radius:9px;background:#fff;margin:0 auto 7px}

    .luna-lavka-screen{color:#171717!important;background:#f6f5f2;border-radius:15px;padding:0 0 12px;overflow-x:hidden}
    .luna-lavka-screen .luna-phone-head{margin:0;padding:9px 10px;background:#fff;color:#171717;text-shadow:none}
    .luna-lavka-screen .luna-phone-back{background:#f1f0ed;color:#171717;border:0}
    .luna-lavka-hero{background:#8bd5f5;padding:13px 12px 14px;color:#171717;border-radius:0 0 17px 17px}
    .luna-lavka-brand{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:950}
    .luna-lavka-mark{width:22px;height:22px;border-radius:7px;background:#17394b;color:#a9e5ff;display:grid;place-items:center;font-size:15px;font-weight:950}
    .luna-lavka-headline{font-size:22px;line-height:1.02;font-weight:950;letter-spacing:-.7px;margin:12px 0}
    .luna-lavka-delivery{display:flex;align-items:center;gap:9px;background:#fff;border-radius:12px;padding:9px 10px}
    .luna-lavka-delivery>span:first-child{font-size:21px}
    .luna-lavka-delivery b,.luna-lavka-delivery small{display:block}
    .luna-lavka-delivery b{font-size:10px}
    .luna-lavka-delivery small{font-size:8px;color:#777;margin-top:2px}
    .luna-lavka-arrow{margin-left:auto;font-size:22px;color:#777}
    .luna-lavka-wallet{margin:10px 10px 13px;padding:9px 11px;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:space-between;box-shadow:0 2px 8px #00000008}
    .luna-lavka-wallet small,.luna-lavka-wallet b{display:block}
    .luna-lavka-wallet small{font-size:8px;letter-spacing:1px;color:#888;margin-bottom:3px}
    .luna-lavka-wallet b{font-size:15px}
    .luna-lavka-wallet-icon{width:29px;height:29px;border-radius:50%;background:#f4f2ec;display:grid;place-items:center;font-size:15px;font-weight:900}
    .luna-lavka-section-head{display:flex;align-items:baseline;justify-content:space-between;padding:0 10px;margin-bottom:8px}
    .luna-lavka-section-head b{font-size:13px}
    .luna-lavka-section-head small{font-size:9px;color:#8a8985}
    .luna-lavka-tabs{display:flex;gap:6px;padding:0 10px 10px;overflow:auto}
    .luna-lavka-tabs button{border:1px solid #e4e2dc;border-radius:20px;background:#fff;color:#333;padding:7px 12px;font-size:9px;font-weight:850;white-space:nowrap}
    .luna-lavka-tabs button.active{background:#17394b;color:#a9e5ff;border-color:#17394b}
    .luna-lavka-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 9px}
    .luna-lavka-product{min-width:0;background:#fff;border:1px solid #eeece6;border-radius:12px;padding:7px;display:flex;flex-direction:column;gap:6px;box-shadow:0 2px 8px #00000006}
    .luna-lavka-product-art{height:91px;border-radius:9px;background:#f7f6f2;display:grid;place-items:center;overflow:hidden}
    .luna-lavka-product-art img{width:100%;height:100%;object-fit:contain}
    .luna-lavka-product-art span{font-size:31px}
    .luna-lavka-product-info{min-height:34px}
    .luna-lavka-product-info b{display:block;font-size:10px;line-height:1.25;color:#171717}
    .luna-lavka-product-info small{display:block;font-size:8px;color:#92908a;margin-top:3px}
    .luna-lavka-product-buy{display:flex;align-items:center;justify-content:space-between;gap:4px;margin-top:auto}
    .luna-lavka-product-buy strong{font-size:10px;white-space:nowrap;color:#171717}
    .luna-lavka-product-buy button{border:0;border-radius:8px;background:#8bd5f5;color:#171717;padding:7px 9px;font-size:9px;font-weight:950}
    .luna-lavka-product-buy button:disabled{opacity:.4}
    .luna-lavka-empty{margin:0 10px;padding:23px 8px;background:#fff;border-radius:12px;text-align:center;color:#888;font-size:10px}
    .luna-lavka-footnote{text-align:center;padding:11px 8px 2px;color:#999;font-size:8px}
    .luna-shop-product b{font-size:12px}
    .luna-shop-product small{font-size:10px;color:#778274;line-height:1.3}
    .luna-shop-product button{border-radius:9px;background:#244f3b;color:white;padding:8px;font-size:10px;font-weight:900;margin-top:auto}
    .luna-shop-product button:disabled{opacity:.5}
  `;

  /* Hard override legacy green phone-button styles from the original Luna UI. */
  style.textContent += `
    #phone-screen button.luna-phone-app,
    #phone-screen button.luna-phone-app:link,
    #phone-screen button.luna-phone-app:visited,
    #phone-screen button.luna-phone-app:hover,
    #phone-screen button.luna-phone-app:focus,
    #phone-screen button.luna-phone-app:focus-visible,
    #phone-screen button.luna-phone-app:active {
      background: rgba(8,20,34,.88) !important;
      background-color: rgba(8,20,34,.88) !important;
      background-image: none !important;
      color: #fff !important;
      border: 1px solid rgba(255,255,255,.42) !important;
      box-shadow: 0 4px 14px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.08) !important;
      -webkit-appearance: none !important;
      appearance: none !important;
      outline: none;
    }
    #phone-screen button.luna-phone-app:active {
      background: rgba(18,39,61,.96) !important;
      transform: scale(.985);
    }
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
  let bankQuote = null;
  let bankAmount = '';
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
  async function recordActivity(eventType, details={}) {
    try { await api('POST',{action:'activity',eventType,details}); } catch (e) { console.warn('Luna activity was not saved',e); }
  }
  async function act(payload) {
    const result = await api('POST',payload);
    await recordActivity('game_action',{action:payload.action,itemId:payload.itemId||null,slot:payload.slot||null,amount:payload.amount||null});
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
    recordActivity('phone_open',{screen:String(name).slice(0,60)});
    if (name==='photos') {
      phoneScreen.innerHTML=phoneHeader('Фото Луны')+'<div class="luna-phone-content"><div class="luna-empty" style="color:#fff">📷<br>Альбом пока пуст.<br>Сюда добавим фотографии и видео Луны.</div></div>';
    } else if (name==='music') {
      const tracks=[{id:'don',title:'Danza Kuduro',artist:'Don Omar',art:'don'},{id:'billie',title:"Billie Eilish when the party's over",artist:'Billie Eilish',art:'billie'}];
      phoneScreen.innerHTML=phoneHeader('Музыка')+'<div class="luna-phone-content luna-music-screen luna-library"><div class="luna-music-kicker">LUNA MUSIC</div><h2 class="luna-library-title">Слушай своё</h2><div class="luna-library-sub">Плейлист Луны · '+tracks.length+' трека</div><div class="luna-library-list">'+tracks.map((t,i)=>'<button class="luna-library-track" data-track="'+t.id+'"><span class="luna-library-art '+t.art+'"><b>'+(i===0?'DK':'B')+'</b></span><span class="luna-library-meta"><strong>'+esc(t.title)+'</strong><small>'+esc(t.artist)+'</small></span><span class="luna-library-arrow">›</span></button>').join('')+'</div><div class="luna-library-footer">Выбери трек — откроется плеер</div></div>';
      phoneScreen.querySelectorAll('[data-track]').forEach(b=>b.addEventListener('click',()=>renderPhoneApp('music-player:'+b.dataset.track)));
    } else if (name.startsWith('music-player:')) {
      const tracks={don:{title:'Danza Kuduro',artist:'Don Omar',file:'%D0%94%D0%B0%D0%BD%D0%B7%D0%B0%20%D0%9A%D1%83%D0%B4%D1%83%D1%80%D0%BE.m4a',art:'don',label:'DANZA<br>KUDURO'},billie:{title:"Billie Eilish when the party's over",artist:'Billie Eilish',file:'billie_eilish_when_the_party_s_over_official_music_video_pbmwt.m4a',art:'billie',label:"WHEN THE<br>PARTY'S OVER"}};
      const track=tracks[name.split(':')[1]]||tracks.don,src='https://raw.githubusercontent.com/datoskha-maker/kayuk-bet-miniapp/main/'+track.file;
      phoneScreen.innerHTML=phoneHeader('Музыка','music')+'<div class="luna-phone-content luna-music-screen"><div class="luna-music-kicker">LUNA MUSIC · NOW PLAYING</div><div class="luna-music-art '+track.art+'"><div class="luna-music-art-label"><strong>'+track.label+'</strong><span>LUNA\'S PLAYLIST</span></div></div><div class="luna-track-title">'+esc(track.title)+'</div><div class="luna-track-artist">'+esc(track.artist)+'</div><audio id="luna-audio" preload="metadata" src="'+src+'"></audio><input id="luna-progress" class="luna-track-progress" type="range" min="0" max="100" value="0" step="0.1"><div class="luna-track-times"><span id="luna-current-time">0:00</span><span id="luna-duration">--:--</span></div><div class="luna-player-controls"><button class="luna-player-side" id="luna-restart">↺</button><button class="luna-player-main" id="luna-play">▶</button><button class="luna-player-side" id="luna-forward">+15</button></div><div class="luna-player-note">♫ <b>Сейчас играет</b><br>Музыка Луны. Можно свернуть телефон — воспроизведение продолжится.</div></div>';
      const audio=$('#luna-audio',phoneScreen),play=$('#luna-play',phoneScreen),progress=$('#luna-progress',phoneScreen);
      const clock=v=>Number.isFinite(v)?Math.floor(v/60)+':'+String(Math.floor(v%60)).padStart(2,'0'):'0:00';
      const sync=()=>{progress.value=audio.duration?audio.currentTime/audio.duration*100:0;$('#luna-current-time',phoneScreen).textContent=clock(audio.currentTime);$('#luna-duration',phoneScreen).textContent=clock(audio.duration);};
      play.addEventListener('click',async()=>{try{if(audio.paused){await audio.play();play.textContent='Ⅱ';recordActivity('music_play',{track:name.split(':')[1]||null});}else{audio.pause();play.textContent='▶';recordActivity('music_pause',{track:name.split(':')[1]||null});}}catch(e){toast2('Не удалось запустить музыку. Попробуй ещё раз.');}});
      audio.addEventListener('play',()=>play.textContent='Ⅱ');audio.addEventListener('pause',()=>play.textContent='▶');audio.addEventListener('timeupdate',sync);audio.addEventListener('loadedmetadata',sync);audio.addEventListener('ended',()=>{play.textContent='▶';progress.value=0;});
      progress.addEventListener('input',()=>{if(audio.duration)audio.currentTime=Number(progress.value)/100*audio.duration;});
      $('#luna-restart',phoneScreen).addEventListener('click',()=>{audio.currentTime=0;audio.play().catch(()=>{});});
      $('#luna-forward',phoneScreen).addEventListener('click',()=>{if(Number.isFinite(audio.duration))audio.currentTime=Math.min(audio.duration,audio.currentTime+15);});
    } else if (name==='lavka') {
      const items=(data.catalog||[]).filter(x=>x.category==='lavka');
      const renderLavka = filter => {
        const shown=items.filter(x=>filter==='all'||(filter==='food'?Number(x.effect?.hunger)>0:Number(x.effect?.thirst)>0));
        const balance=Number(data.balance||0);
        phoneScreen.innerHTML=phoneHeader('Яндекс Лавка')+
          '<div class="luna-phone-content luna-lavka-screen">'+
            '<div class="luna-lavka-hero"><div class="luna-lavka-brand"><span class="luna-lavka-mark">Я</span><span>Лавка Луны</span></div><div class="luna-lavka-headline">Мур-мур.<br>Всё нужное — рядом.</div><div class="luna-lavka-delivery"><span>🐾</span><span><b>Доставим прямо домой</b><small>Закажи вкусняшки для Луны</small></span><span class="luna-lavka-arrow">›</span></div></div>'+
            '<div class="luna-lavka-wallet"><span><small>ТВОЙ БАЛАНС</small><b>'+fmt(balance)+'</b></span><span class="luna-lavka-wallet-icon">₽</span></div>'+
            '<div class="luna-lavka-section-head"><b>Что будем заказывать?</b><small>'+shown.length+' товаров</small></div>'+
            '<div class="luna-lavka-tabs"><button data-lavka-filter="all" class="'+(filter==='all'?'active':'')+'">Всё</button><button data-lavka-filter="food" class="'+(filter==='food'?'active':'')+'">🍗 Еда</button><button data-lavka-filter="drink" class="'+(filter==='drink'?'active':'')+'">🥛 Напитки</button></div>'+
            (shown.length?'<div class="luna-lavka-grid">'+shown.map(x=>'<article class="luna-lavka-product">'+
              '<div class="luna-lavka-product-art">'+(x.image_url?'<img src="'+esc(x.image_url)+'" alt="'+esc(x.title)+'" loading="lazy">':'<span>'+esc(x.icon||'🐾')+'</span>')+'</div>'+
              '<div class="luna-lavka-product-info"><b>'+esc(x.title)+'</b><small>'+(Number(x.effect?.hunger)>0?'Для сытости Луны':Number(x.effect?.thirst)>0?'Чтобы утолить жажду':'Вкусное для Луны')+'</small></div>'+
              '<div class="luna-lavka-product-buy"><strong>'+fmt(x.price)+'</strong><button data-consume="'+esc(x.item_id)+'" '+(balance<Number(x.price)?'disabled':'')+'>Купить</button></div>'+
            '</article>').join('')+'</div>':'<div class="luna-lavka-empty">В этой категории пока пусто 🐾</div>')+
            '<div class="luna-lavka-footnote">Оплата списывается с общего баланса КАЮК BET</div>'+
          '</div>';
        phoneScreen.querySelectorAll('[data-lavka-filter]').forEach(b=>b.addEventListener('click',()=>renderLavka(b.dataset.lavkaFilter)));
        phoneScreen.querySelectorAll('[data-consume]').forEach(b=>b.addEventListener('click',async()=>{try{await act({action:'consume',itemId:b.dataset.consume});toast2('Покупка оформлена!');renderPhoneApp('lavka')}catch(e){toast2(e.message)}}));
      };
      renderLavka('all');

    } else if (name==='bank') {
      const bank=data.bank||{}, card=bank.card||{}, loan=bank.loan;
      const balance=Number(data.balance||0), account=card.account_number||'----';
      const money=n=>Number(n||0).toLocaleString('ru-RU')+' ₽';
      const weeklyLimit=Number(bank.weeklyLimit|| (balance<1000000?100000:200000));
      const weeklyRemaining=Number(bank.weeklyRemaining??weeklyLimit);
      const quote=bankQuote;
      phoneScreen.innerHTML=phoneHeader('Кошка Банк')+'<div class="luna-phone-content luna-bank-screen">'+
        '<div class="luna-bank-card '+(card.design==='gold'?'gold':'black')+'">'+
          '<div class="luna-bank-card-top"><div><div style="font-size:7px;opacity:.72;margin-bottom:4px">НОМЕР СЧЁТА</div><div class="luna-bank-account">'+esc(account)+'</div></div><div class="luna-bank-chip"></div></div>'+
          '<div class="luna-bank-card-balance"><small>ОБЩИЙ БАЛАНС КАЮК BET</small>'+money(balance)+'</div>'+
          '<div class="luna-bank-card-bottom"><span>КОШКА БАНК</span><span>DEBIT</span></div></div>'+
        (card.design==='gold'?'<div class="luna-bank-muted">Золотой дизайн карты активен.</div>':(card.gold_purchased?'<div class="luna-bank-muted">Золотой дизайн уже приобретён.</div>':'<div class="luna-bank-section"><h3>Дизайн карты</h3><div class="luna-bank-muted">Чёрная карта установлена по умолчанию. Золотой дизайн приобретается один раз и сразу применяется.</div><button class="luna-bank-btn gold" id="bank-buy-gold" '+(balance<10000?'disabled':'')+'>Купить золотую карту · 10 000 ₽</button></div>'))+
        '<div class="luna-bank-section"><h3>Кредитная линия</h3>'+
          '<div class="luna-bank-row"><span>Лимит на 7 дней</span><b>'+money(weeklyLimit)+'</b></div>'+
          '<div class="luna-bank-row"><span>Уже использовано</span><b>'+money(bank.weeklyUsed||0)+'</b></div>'+
          '<div class="luna-bank-row"><span>Доступно сейчас</span><b>'+money(weeklyRemaining)+'</b></div>'+
          (loan?'<div class="luna-bank-quote"><b>У вас активный кредит</b><div class="luna-bank-row"><span>Получено</span><b>'+money(loan.principal)+'</b></div><div class="luna-bank-row"><span>К возврату сейчас</span><b>'+money(loan.currentDue)+'</b></div><div class="luna-bank-row"><span>Вернуть до</span><b>'+new Date(loan.due_at).toLocaleDateString('ru-RU')+'</b></div><div class="luna-bank-row"><span>Просрочка</span><b>'+loan.lateDays+' дн. из 30</b></div><div class="luna-bank-muted">После срока долг растёт на 10% ежедневно. Через 30 дней просрочки банк спишет весь доступный баланс; остаток долга уйдёт в минус, счёт будет заблокирован.</div><button class="luna-bank-btn" id="bank-repay" '+(balance<Number(loan.currentDue)?'disabled':'')+'>Погасить кредит · '+money(loan.currentDue)+'</button>'+(balance<Number(loan.currentDue)?'<div class="luna-bank-warning">Недостаточно средств для полного погашения.</div>':'')+'</div>':
          '<div class="luna-bank-muted">До 50 000 ₽ — срок 7 дней. Свыше 50 000 ₽ — срок 14 дней. Первоначальная переплата 50%; после просрочки +10% ежедневно.</div>'+
          '<input class="luna-bank-input" id="bank-loan-amount" type="number" min="1" max="'+weeklyRemaining+'" step="1" inputmode="numeric" placeholder="Введите сумму кредита" value="'+esc(bankAmount)+'" '+(weeklyRemaining<=0||balance<0?'disabled':'')+'>'+
          '<button class="luna-bank-btn" id="bank-calculate" '+(weeklyRemaining<=0||balance<0?'disabled':'')+'>Рассчитать кредит</button>'+
          (quote?'<div class="luna-bank-quote" id="bank-quote-panel"><b>Условия кредита</b><div class="luna-bank-row"><span>Сумма к зачислению</span><b>'+money(quote.amount)+'</b></div><div class="luna-bank-row"><span>Переплата 50%</span><b>'+money(quote.initialInterest)+'</b></div><div class="luna-bank-row"><span>Всего к возврату</span><b>'+money(quote.totalDue)+'</b></div><div class="luna-bank-row"><span>Срок возврата</span><b>'+quote.termDays+' дней</b></div><div class="luna-bank-row"><span>Дата возврата</span><b>'+new Date(quote.dueAt).toLocaleDateString('ru-RU')+'</b></div><div class="luna-bank-muted">При просрочке начисляется ещё 10% в день. Через 30 дней просрочки включается принудительное взыскание.</div><button class="luna-bank-btn gold" id="bank-confirm">Подтвердить и получить '+money(quote.amount)+'</button></div>':'')
          )+
        '</div>'+
        (balance<0?'<div class="luna-bank-warning">Счёт заблокирован: отрицательный баланс. Новые кредиты и траты недоступны до погашения задолженности.</div>':'')+
        '</div>';
      $('#bank-buy-gold',phoneScreen)?.addEventListener('click',async()=>{try{await act({action:'card_gold'});renderPhoneApp('bank');toast2('Золотая карта куплена и применена!')}catch(e){toast2(e.message)}});
      $('#bank-loan-amount',phoneScreen)?.addEventListener('input',e=>{bankAmount=e.target.value;bankQuote=null;$('#bank-quote-panel',phoneScreen)?.setAttribute('hidden','hidden');});
      $('#bank-calculate',phoneScreen)?.addEventListener('click',async()=>{try{bankAmount=$('#bank-loan-amount',phoneScreen).value;bankQuote=await api('POST',{action:'loan_quote',amount:Number(bankAmount)});renderPhoneApp('bank');}catch(e){bankQuote=null;toast2(e.message)}});
      $('#bank-confirm',phoneScreen)?.addEventListener('click',async()=>{try{await act({action:'loan',amount:Number(bankQuote?.amount||bankAmount)});bankQuote=null;bankAmount='';renderPhoneApp('bank');toast2('Кредит зачислен на общий баланс!')}catch(e){toast2(e.message)}});
      $('#bank-repay',phoneScreen)?.addEventListener('click',async()=>{try{await act({action:'repay'});renderPhoneApp('bank');toast2('Кредит полностью погашен')}catch(e){toast2(e.message)}});
    } else if (name==='gift') {
      const claimed=Boolean(data.dailyGift);
      phoneScreen.innerHTML=phoneHeader('Ежедневный подарок')+'<div class="luna-phone-content"><div class="luna-empty" style="color:#fff">🎁<br>'+(claimed?'Сегодня подарок уже получен: '+fmt(data.dailyGift.amount):'Луна приготовила сюрприз!')+'</div><button class="luna-mini-btn" id="claim-gift" '+(claimed?'disabled':'')+'>'+(claimed?'До завтра 🐾':'Открыть подарок')+'</button></div>';
      $('#claim-gift',phoneScreen)?.addEventListener('click',async()=>{try{const result=await act({action:'gift'});renderPhoneApp('gift');toast2(result.alreadyClaimed?'Подарок уже получен':'Тебе выпало '+fmt(result.amount)+'!')}catch(e){toast2(e.message)}});
    } else if (name==='camera') {
      phoneScreen.innerHTML=phoneHeader('Фронтальная камера')+'<div class="luna-phone-content"><div class="luna-empty" style="color:#fff">🤳<br>Луна смотрит прямо на тебя!<br>Фото-заставку добавим, когда ты пришлёшь картинку.</div><button class="luna-mini-btn secondary" id="camera-snap">📸 Сделать вид, что сфоткал</button></div>';
      $('#camera-snap',phoneScreen)?.addEventListener('click',()=>{recordActivity('camera_snap');toast2('Мяу! Снимок получился 😹')});
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
      return '<div class="luna-shop-product">'+(x.image_url?'<img class="item-image" src="'+esc(x.image_url)+'" alt="'+esc(x.title)+'" loading="lazy">' : '<div class="emoji">'+esc(x.icon)+'</div>')+'<b>'+esc(x.title)+'</b><small>'+esc(x.description)+'</small>'+(shopCategory==='purchases'?(equipped?'<button data-unequip="'+esc(slot)+'" class="secondary">Снять</button>':'<button data-equip="'+esc(x.item_id)+'" data-slot="'+esc(slot)+'">Установить</button>'): '<button data-buy="'+esc(x.item_id)+'" '+(owned?'disabled':'')+'>'+(owned?'Куплено ✓':fmt(x.price)+' · Купить')+'</button>')+'</div>';
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