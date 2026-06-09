/**
 * popup.js —— 设置面板逻辑
 *
 * 读写 chrome.storage.sync 中的设置，所有改动即时保存；
 * 并提供「预览」按钮，向当前标签页立刻触发一次猫咪出场。
 */

const DEFAULT_SETTINGS = {
  enabled: true,
  thresholdMinutes: 30,
  snoozeMinutes: 5,
  respectIdle: true
};

// DOM 引用
const els = {
  enabled: document.getElementById('enabled'),
  threshold: document.getElementById('threshold'),
  thresholdValue: document.getElementById('thresholdValue'),
  snooze: document.getElementById('snooze'),
  snoozeValue: document.getElementById('snoozeValue'),
  respectIdle: document.getElementById('respectIdle'),
  activeMinutes: document.getElementById('activeMinutes'),
  preview: document.getElementById('preview')
};

// ============ 初始化：读取设置填充界面 ============
async function init() {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);

  els.enabled.checked = settings.enabled;
  els.threshold.value = settings.thresholdMinutes;
  els.thresholdValue.textContent = settings.thresholdMinutes;
  els.snooze.value = settings.snoozeMinutes;
  els.snoozeValue.textContent = settings.snoozeMinutes;
  els.respectIdle.checked = settings.respectIdle;

  refreshStatus();
}

// ============ 保存单个字段 ============
function save(key, value) {
  chrome.storage.sync.set({ [key]: value });
}

// ============ 绑定事件 ============
els.enabled.addEventListener('change', () => save('enabled', els.enabled.checked));

els.threshold.addEventListener('input', () => {
  els.thresholdValue.textContent = els.threshold.value;
  save('thresholdMinutes', Number(els.threshold.value));
});

els.snooze.addEventListener('input', () => {
  els.snoozeValue.textContent = els.snooze.value;
  save('snoozeMinutes', Number(els.snooze.value));
});

els.respectIdle.addEventListener('change', () => save('respectIdle', els.respectIdle.checked));

// 预览：让当前标签页立刻弹出猫咪
els.preview.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https?:/i.test(tab.url || '')) {
    els.preview.textContent = '⚠️ 当前页面无法预览';
    setTimeout(() => (els.preview.textContent = '▶ 预览猫咪出场效果'), 1800);
    return;
  }
  // 直接发给该标签页的 content script
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_CAT' });
    window.close(); // 关掉 popup 好让用户看到效果
  } catch {
    els.preview.textContent = '⚠️ 请刷新页面后重试';
    setTimeout(() => (els.preview.textContent = '▶ 预览猫咪出场效果'), 1800);
  }
});

// ============ 拉取当前页面已停留时长 ============
function refreshStatus() {
  chrome.runtime.sendMessage({ type: 'GET_ACTIVE_STATUS' }, (resp) => {
    if (chrome.runtime.lastError || !resp) {
      els.activeMinutes.textContent = '0';
      return;
    }
    els.activeMinutes.textContent = String(resp.activeMinutes ?? 0);
  });
}

init();
