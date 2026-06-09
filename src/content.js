/**
 * content.js —— 注入到每个网页，负责「猫咪霸占屏幕 + 互动」的全部表现层
 *
 * 流程：
 *   background 计时到达阈值 → 发来 { type: 'SHOW_CAT' }
 *   → 全屏半透明遮罩淡入
 *   → 猫咪从屏幕底部中央走出来，一边走一边放大，占据屏幕中下方
 *   → 气泡弹出：「喵～你已经盯着屏幕很久啦」
 *   → 互动：点猫咪（摸头爱心）/ 「好的，去休息」/ 「再忙5分钟」/ 点遮罩空白（等同再忙5分钟）
 */

(() => {
  if (window.__meowCatInjected) return;
  window.__meowCatInjected = true;

  // ============ 素材接入点 ============
  const CAT_ASSETS = {
    walk: safeUrl('assets/cat/cat-walk.webp'),
    idle: safeUrl('assets/cat/cat-idle.webp'),
    happy: safeUrl('assets/cat/cat-happy.webp')
  };

  function safeUrl(path) {
    try { return chrome.runtime.getURL(path); }
    catch { return ''; }
  }

  let catOnStage = false;
  let snoozeMinutes = 5; // 默认值，稍后从 storage 更新

  const REST_FAREWELLS = [
    '那我先走啦，记得喝水 💧 喵～',
    '喵～ 小零食超好吃 😋，你也吃点呀～',
    '去！伸个懒腰！本喵看着你 🐾',
    '眼睛要瞎了喵，快去看看窗外 🌿',
    '起来走走嘛，腿都坐麻了吧 😼',
    '喵～ 出去透透气，回来更有劲！✨',
    '本喵允许你休息五分钟，去吧 🫡',
    '屏幕盯够了，去喝口水，本喵等你回来 🐱',
  ];
  let farewellQueue = [];
  function pickFarewell() {
    if (farewellQueue.length === 0) {
      // 队列用完，重新洗牌
      farewellQueue = [...REST_FAREWELLS].sort(() => Math.random() - 0.5);
    }
    return farewellQueue.pop();
  }

  // 读取顺延时长配置
  try {
    chrome.storage.sync.get({ snoozeMinutes: 5 }, (result) => {
      snoozeMinutes = result.snoozeMinutes || 5;
    });
  } catch {}

  // ============ 监听 background ============
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'SHOW_CAT') {
      // 触发前刷新一次设置，确保文案是最新的
      try {
        chrome.storage.sync.get({ snoozeMinutes: 5 }, (result) => {
          snoozeMinutes = result.snoozeMinutes || 5;
          showCat();
        });
      } catch {
        showCat();
      }
    }
  });

  // ============ 主流程 ============
  function showCat() {
    if (catOnStage) return;
    catOnStage = true;

    const host = document.createElement('div');
    host.id = 'meow-cat-host';
    host.style.cssText = [
      'position:fixed', 'inset:0',
      'z-index:2147483647',
      'pointer-events:none',
      'border:0', 'margin:0', 'padding:0'
    ].join(';');
    document.documentElement.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = buildMarkup();
    bindInteractions(shadow, host);

    const stage = shadow.querySelector('.stage');

    // 等 cat.css 加载完再启动动画，避免 FALLBACK_CSS 闪烁出现"影子"
    injectShadowStyles(shadow).then(() => {
      requestAnimationFrame(() => stage.classList.add('walking'));

      setTimeout(() => {
        stage.classList.remove('walking');
        stage.classList.add('arrived');
        setCatImage(shadow, 'idle');
        showBubble(shadow);
      }, 2800);
    });
  }

  // ============ DOM 结构 ============
  function buildMarkup() {
    const hasAsset = Boolean(CAT_ASSETS.walk);
    const catVisual = hasAsset
      ? `<img class="cat-img" alt="猫咪" src="${CAT_ASSETS.walk}" />`
      : `<div class="css-cat" role="img" aria-label="猫咪">
           <div class="ear ear-left"></div><div class="ear ear-right"></div>
           <div class="face">
             <div class="eye eye-left"></div><div class="eye eye-right"></div>
             <div class="nose"></div><div class="whiskers"></div>
           </div>
           <div class="tail"></div>
         </div>`;

    return `
      <div class="stage" data-has-asset="${hasAsset}">

        <!-- 气泡（猫咪上方，绝对定位居中） -->
        <div class="bubble" role="dialog" aria-live="polite">
          <p class="bubble-text">喵～你已经盯着屏幕很久啦<br/>起来活动一下，喝口水吧 🐱</p>
          <div class="actions">
            <button class="btn btn-primary" data-action="rest"   type="button">好的，去休息 ☕</button>
            <button class="btn btn-ghost"   data-action="snooze" type="button">再忙 ${snoozeMinutes} 分钟</button>
          </div>
        </div>

        <!-- 猫咪外层（负责出场 transform） -->
        <div class="cat-wrap">
          <button class="cat" type="button" aria-label="摸摸猫咪">
            ${catVisual}
            <span class="paw-hint">摸摸我 🐾</span>
          </button>
        </div>

      </div>
    `;
  }

  // ============ 注入样式到 Shadow DOM ============
  // 返回 Promise，resolved 后再启动动画，避免 FALLBACK_CSS 闪烁
  function injectShadowStyles(shadow) {
    const style = document.createElement('style');
    style.textContent = FALLBACK_CSS;
    shadow.appendChild(style);

    const cssUrl = safeUrl('src/cat.css');
    if (!cssUrl) return Promise.resolve();

    return fetch(cssUrl, { cache: 'no-store' })
      .then(r => r.text())
      .then(css => { style.textContent = css; })
      .catch(() => {});
  }

  // ============ 交互绑定 ============
  function bindInteractions(shadow, host) {
    const stage    = shadow.querySelector('.stage');
    const catBtn   = shadow.querySelector('.cat');

    // 摸猫咪
    catBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // 防止冒泡到遮罩
      setCatImage(shadow, 'happy');
      spawnHearts(shadow, catBtn);
      catBtn.classList.add('purr');
      setTimeout(() => {
        catBtn.classList.remove('purr');
        if (stage.classList.contains('arrived')) setCatImage(shadow, 'idle');
      }, 900);
    });

    // 点遮罩空白区域 → 等同「再忙5分钟」
    stage.addEventListener('click', (e) => {
      if (e.target === stage) handleSnooze(shadow, host);
    });

    // 按钮
    shadow.querySelectorAll('.btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (btn.dataset.action === 'rest') {
          notifyBackground('CAT_DISMISSED');
          catLeave(shadow, host, pickFarewell());
        } else if (btn.dataset.action === 'snooze') {
          handleSnooze(shadow, host);
        }
      });
    });
  }

  function handleSnooze(shadow, host) {
    notifyBackground('CAT_SNOOZED');
    catLeave(shadow, host, `😤 哼，${snoozeMinutes} 分钟后我再来找你！`);
  }

  // ============ 猫咪离场 ============
  function catLeave(shadow, host, farewell) {
    const stage      = shadow.querySelector('.stage');
    const bubble     = shadow.querySelector('.bubble');
    const cat        = shadow.querySelector('.cat');
    const bubbleText = shadow.querySelector('.bubble-text');
    const actions    = shadow.querySelector('.actions');

    // 隐藏按钮，更新文案，强制文字深色（覆盖 CSS 的白色）
    if (actions) actions.style.display = 'none';
    if (bubbleText) {
      bubbleText.innerHTML = farewell;
      bubbleText.style.setProperty('color', '#2a2a2a', 'important');
      bubbleText.style.setProperty('text-shadow', 'none', 'important');
      bubbleText.style.setProperty('margin', '0', 'important');
      bubbleText.style.setProperty('padding', '0', 'important');
      bubbleText.style.setProperty('line-height', '1.65', 'important');
      bubbleText.style.setProperty('font-size', '15px', 'important');
      bubbleText.style.setProperty('font-weight', '500', 'important');
    }

    stage.classList.remove('arrived');

    // 1. 猫咪渐隐
    if (cat) {
      cat.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 800, easing: 'ease', fill: 'forwards'
      });
    }

    // 2. 告别气泡：强制 inline style 覆盖所有 CSS，完全用 setTimeout 控制时序
    if (bubble) {
      // 初始状态：透明、缩小、居中
      // 先清空所有 class，防止旧 CSS 干扰
      bubble.className = '';
      // 逐条用 setProperty 写入，优先级最高
      const bs = bubble.style;
      bs.setProperty('position', 'fixed', 'important');
      bs.setProperty('top', '50%', 'important');
      bs.setProperty('left', '50%', 'important');
      bs.setProperty('bottom', 'auto', 'important');
      bs.setProperty('transform', 'translateX(-50%) translateY(-50%) scale(0.85)', 'important');
      bs.setProperty('opacity', '0', 'important');
      bs.setProperty('pointer-events', 'none', 'important');
      bs.setProperty('z-index', '9999', 'important');
      bs.setProperty('transition', 'opacity 0.6s ease, transform 0.6s cubic-bezier(0.18,0.89,0.32,1.2)', 'important');
      bs.setProperty('width', 'clamp(180px, 22vw, 260px)', 'important');
      bs.setProperty('background', 'rgba(255,255,255,0.82)', 'important');
      bs.setProperty('backdrop-filter', 'blur(32px) saturate(180%)', 'important');
      bs.setProperty('-webkit-backdrop-filter', 'blur(32px) saturate(180%)', 'important');
      bs.setProperty('border-radius', '24px', 'important');
      bs.setProperty('border', '1.5px solid rgba(255,255,255,0.95)', 'important');
      bs.setProperty('padding', '22px 20px 28px', 'important');
      bs.setProperty('box-shadow', '0 4px 24px rgba(220,120,160,0.18), inset 0 1.5px 0 rgba(255,255,255,1)', 'important');
      bs.setProperty('color', '#2a2a2a', 'important');
      bs.setProperty('font-size', '15px', 'important');
      bs.setProperty('font-family', 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif', 'important');
      bs.setProperty('font-weight', '600', 'important');
      bs.setProperty('text-align', 'center', 'important');
      bs.setProperty('display', 'flex', 'important');
      bs.setProperty('flex-direction', 'column', 'important');
      bs.setProperty('align-items', 'center', 'important');
      bs.setProperty('justify-content', 'center', 'important');
      bs.setProperty('min-height', '80px', 'important');
      // 爪印绝对定位在右下角（fixed 元素建立包含块，子元素 absolute 相对于它定位）
      const paw = document.createElement('span');
      paw.textContent = '🐾';
      paw.style.cssText = 'position:absolute;bottom:10px;right:14px;font-size:26px;opacity:0.5;filter:grayscale(1) brightness(0);pointer-events:none;line-height:1';
      bubble.appendChild(paw);

      // 下一帧渐显
      requestAnimationFrame(() => requestAnimationFrame(() => {
        bubble.style.setProperty('opacity', '1', 'important');
        bubble.style.setProperty('transform', 'translateX(-50%) translateY(-50%) scale(1)', 'important');
      }));

      // 渐显 600ms 后稳定停留
      setTimeout(() => {
        bubble.style.setProperty('opacity', '1', 'important');

        // 停留结束后淡出
        setTimeout(() => {
          bubble.style.setProperty('transition', 'opacity 0.4s ease', 'important');
          bubble.style.setProperty('opacity', '0', 'important');
          setTimeout(() => {
            host.remove();
            catOnStage = false;
          }, 450);
        }, 1500);
      }, 650);

    } else {
      setTimeout(() => { host.remove(); catOnStage = false; }, 800);
    }
  }

  // ============ 切换猫咪图片 ============
  function setCatImage(shadow, key) {
    const img = shadow.querySelector('.cat-img');
    if (img && CAT_ASSETS[key]) img.src = CAT_ASSETS[key];
  }

  // ============ 摸头爱心 ============
  function spawnHearts(shadow, anchor) {
    const rect = anchor.getBoundingClientRect();
    ['❤️','💛','💕','✨','🐾'].forEach((emoji, i) => {
      const h = document.createElement('span');
      h.textContent = emoji;
      h.style.cssText = [
        `position:fixed`,
        `left:${rect.left + rect.width / 2 + (Math.random() * 80 - 40)}px`,
        `bottom:${window.innerHeight - rect.bottom - 80}px`,
        `animation-delay:${i * 0.09}s`,
        `font-size:${20 + Math.random() * 10}px`,
        `pointer-events:none`,
        `z-index:2147483647`,
        `animation:heart-float 1.2s ease-out forwards`,
      ].join(';');
      // 直接挂到 shadow root，层级高于气泡，不影响气泡点击
      shadow.appendChild(h);
      setTimeout(() => h.remove(), 1400);
    });
  }

  // ============ 通知 background ============
  function notifyBackground(type) {
    try { chrome.runtime.sendMessage({ type }); } catch {}
  }

  function showBubble(shadow) {
    shadow.querySelector('.bubble')?.classList.add('show');
  }

  // ============ 兜底样式 ============
  const FALLBACK_CSS = `
    .stage{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;
      justify-content:flex-end;pointer-events:none;background:rgba(0,0,0,0);
      transition:background .4s;font-family:system-ui,sans-serif}
    .stage.walking,.stage.arrived{background:transparent;pointer-events:none}
    .cat-wrap{width:300px;height:300px;display:flex;align-items:flex-end;justify-content:center;opacity:0;transform:translateY(30%) scale(0.15)}
    .cat{width:100%;height:100%;background:none;border:0;cursor:pointer;pointer-events:auto}
    .cat-img{width:100%;height:100%;object-fit:contain;object-position:bottom center}
    .bubble{position:absolute;bottom:310px;left:50%;transform:translateX(-50%) scale(.94);
      width:300px;background:#fff;border-radius:16px;padding:16px 18px;
      box-shadow:0 12px 40px rgba(0,0,0,.25);opacity:0;transition:opacity .4s,transform .4s;text-align:center}
    .bubble.show{opacity:1;transform:translateX(-50%) scale(1)}
    .bubble-text{margin:0 0 14px;font-size:15px;line-height:1.6;color:#1a1a1a}
    .actions{display:flex;gap:10px;justify-content:center}
    .btn{cursor:pointer;border:0;border-radius:999px;padding:10px 18px;font-size:14px;font-weight:600;pointer-events:auto}
    .btn-primary{background:linear-gradient(135deg,#ff8fb1,#ff5577);color:#fff}
    .btn-ghost{background:rgba(255,255,255,.2);color:#fff;border:1.5px solid rgba(255,255,255,.4)}
    @keyframes heart-float{0%{transform:translateY(0) scale(.5);opacity:0}20%{opacity:1}100%{transform:translateY(-180px) scale(1.3);opacity:0}}
  `;
})();
