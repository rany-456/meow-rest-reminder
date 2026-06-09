/**
 * background.js —— 喵了个咪 · 休息提醒 的后台核心
 *
 * 职责：
 *   1. 跟踪每个标签页「持续停留」的累计活跃时长；
 *   2. 只对【当前激活 + 窗口聚焦】的标签页累计时间（切走 / 锁屏 / 最小化都会暂停）；
 *   3. 当某个标签页累计时长达到用户设置的阈值时，向该标签页的 content script
 *      发送 SHOW_CAT 消息，触发猫咪走出来提醒休息；
 *   4. 处理来自 content script 的「再忙 5 分钟 / 已休息」等回执，重置或顺延计时。
 *
 * 为什么用 chrome.alarms 而不是 setInterval：
 *   Manifest V3 的 background 是 service worker，空闲时会被浏览器回收，
 *   setInterval 会随之失效。chrome.alarms 由浏览器持久调度，能可靠地周期唤醒。
 */

// ============ 常量配置 ============

// 计时心跳间隔（分钟）。alarms 的最小周期在打包扩展中是 1 分钟。
const TICK_PERIOD_MINUTES = 1;
const ALARM_NAME = 'meow-tick';

// 默认设置（用户可在 popup 中修改，存入 chrome.storage.sync）
const DEFAULT_SETTINGS = {
  enabled: true, // 总开关
  thresholdMinutes: 30, // 停留多久触发，单位：分钟
  snoozeMinutes: 5, // 点「再忙 5 分钟」后顺延多久
  respectIdle: true // 是否要求窗口聚焦才累计（true = 切走/锁屏暂停计时）
};

/**
 * 内存中的标签页计时表（service worker 重启会清空，这是可接受的——
 * 重启意味着浏览器空闲了一段时间，重新计时反而更符合「持续停留」的语义）。
 *
 * 结构：{ [tabId]: { activeMinutes, urlKey, snoozedUntilMinutes } }
 *   activeMinutes        —— 已累计的活跃分钟数
 *   urlKey               —— 当前页面的归一化 URL（用于判断是否换了页面）
 *   snoozedUntilMinutes  —— 顺延目标：activeMinutes 要超过它才会再次触发
 */
const tabTimers = new Map();

// 当前处于「激活 + 聚焦」状态的标签页 id（同一时刻只会有一个在累计）
let activeTabId = null;
let windowFocused = true;

// ============ 工具函数 ============

/** 读取设置，合并默认值，保证字段齐全 */
async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

/**
 * 把 URL 归一化为「页面级」标识：协议 + 主机 + 路径，忽略 query 和 hash。
 * 这样在同一篇文章内部锚点跳转不会被当成换页而重置计时，
 * 但跳到完全不同的页面会重置。
 */
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return url || '';
  }
}

/** 确保某个 tab 在计时表里有记录 */
function ensureTimer(tabId, urlKey) {
  let timer = tabTimers.get(tabId);
  if (!timer) {
    timer = { activeMinutes: 0, urlKey, snoozedUntilMinutes: 0 };
    tabTimers.set(tabId, timer);
  }
  return timer;
}

/** 当一个 tab 导航到新页面时，重置它的计时 */
function resetTimer(tabId, urlKey) {
  tabTimers.set(tabId, { activeMinutes: 0, urlKey, snoozedUntilMinutes: 0 });
}

// ============ 心跳：每分钟累计一次活跃时长 ============

async function onTick() {
  const settings = await getSettings();
  if (!settings.enabled) return;

  // 没有聚焦的激活标签页就不累计
  if (settings.respectIdle && (!windowFocused || activeTabId == null)) return;
  if (activeTabId == null) return;

  // 拿到当前激活标签页的真实信息（可能已被关闭）
  let tab;
  try {
    tab = await chrome.tabs.get(activeTabId);
  } catch {
    tabTimers.delete(activeTabId);
    return;
  }
  if (!tab || !tab.url) return;

  // 跳过浏览器内部页（chrome://、扩展页等），它们注入不了 content script
  if (!/^https?:/i.test(tab.url)) return;

  const urlKey = normalizeUrl(tab.url);
  const timer = ensureTimer(tab.id, urlKey);

  // 页面变了 → 重置计时
  if (timer.urlKey !== urlKey) {
    resetTimer(tab.id, urlKey);
    return;
  }

  timer.activeMinutes += TICK_PERIOD_MINUTES;

  // 达到阈值（且超过顺延目标）→ 触发猫咪
  const target = Math.max(settings.thresholdMinutes, timer.snoozedUntilMinutes);
  if (timer.activeMinutes >= target) {
    triggerCat(tab.id);
  }
}

/** 向指定标签页发送「让猫咪出场」的指令 */
async function triggerCat(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'SHOW_CAT' });
  } catch {
    // content script 可能尚未注入（如页面是在插件安装前打开的），静默忽略
  }
}

// ============ 监听浏览器状态，维护 activeTabId / windowFocused ============

// 切换激活标签页
chrome.tabs.onActivated.addListener(({ tabId }) => {
  activeTabId = tabId;
});

// 窗口焦点变化（切到别的应用 / 锁屏会触发 WINDOW_ID_NONE）
chrome.windows.onFocusChanged.addListener((windowId) => {
  windowFocused = windowId !== chrome.windows.WINDOW_ID_NONE;
});

// 标签页内容更新（导航到新 URL 时重置计时）
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    resetTimer(tabId, normalizeUrl(changeInfo.url));
  }
});

// 标签页关闭 → 清理计时
chrome.tabs.onRemoved.addListener((tabId) => {
  tabTimers.delete(tabId);
});

// ============ 接收 content script / popup 的回执 ============

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  switch (message?.type) {
    // 用户点了「好的，去休息」→ 直接重置该页计时，从头再来
    case 'CAT_DISMISSED': {
      if (tabId != null) {
        const timer = tabTimers.get(tabId);
        if (timer) {
          timer.activeMinutes = 0;
          timer.snoozedUntilMinutes = 0;
        }
      }
      sendResponse?.({ ok: true });
      break;
    }

    // 用户点了「再忙 5 分钟」→ 把触发目标顺延 snoozeMinutes
    case 'CAT_SNOOZED': {
      if (tabId != null) {
        getSettings().then((settings) => {
          const timer = tabTimers.get(tabId);
          if (timer) {
            timer.snoozedUntilMinutes = timer.activeMinutes + settings.snoozeMinutes;
          }
        });
      }
      sendResponse?.({ ok: true });
      break;
    }

    // popup 请求：返回当前激活标签页已累计的分钟数（用于设置页展示）
    case 'GET_ACTIVE_STATUS': {
      const timer = activeTabId != null ? tabTimers.get(activeTabId) : null;
      sendResponse?.({ activeMinutes: timer?.activeMinutes ?? 0 });
      break;
    }

    // 调试用：立即触发一次猫咪（popup 的「预览效果」按钮会用到）
    case 'PREVIEW_CAT': {
      if (message.targetTabId != null) {
        triggerCat(message.targetTabId);
      }
      sendResponse?.({ ok: true });
      break;
    }

    default:
      break;
  }

  // 返回 true 以支持上面异步分支里的 sendResponse
  return true;
});

// ============ 生命周期：注册心跳 alarm ============

function ensureAlarm() {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: TICK_PERIOD_MINUTES });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarm();
  // 首次安装时写入默认设置（不覆盖用户已有设置）
  chrome.storage.sync.get(DEFAULT_SETTINGS, (current) => {
    chrome.storage.sync.set({ ...DEFAULT_SETTINGS, ...current });
  });
});

chrome.runtime.onStartup.addListener(ensureAlarm);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) onTick();
});

// service worker 被唤醒时也兜底注册一次，防止 alarm 丢失
ensureAlarm();
