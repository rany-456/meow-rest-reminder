<p align="center">
  <img src="icons/logo.png" width="120" alt="本喵命你去休息" />
</p>

<h1 align="center">本喵命你去休息</h1>

<p align="center">
  <strong>一只住在浏览器里的猫咪，专门盯着你的工作时长，盯够了就来找你。</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-black?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/Manifest-V3-black?style=flat-square" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/Chrome-Extension-black?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome Extension" />
  <img src="https://img.shields.io/badge/dependencies-0-black?style=flat-square" alt="Zero Dependencies" />
</p>

---

当你在同一个网页上持续停留超过设定时间，一只黑猫会从屏幕底部走出来，越走越近，站到你面前，提醒你该休息了。

不是冷冰冰的弹窗通知，而是一只猫——走到你屏幕前的那只猫。

你可以摸摸它的头，它会开心地抖动，爱心从头顶飞出来。然后你选择去休息，或者让它过几分钟再来。

<p align="center">
  <img src="docs/preview.gif" width="600" alt="效果预览" />
</p>

## 功能

| | 功能 | 说明 |
|---|---|---|
| ⏱ | **久坐计时** | 在同一页面持续停留达到设定时长后触发。切走窗口、锁屏自动暂停（可关闭） |
| 🐾 | **由远及近的出场** | 猫咪从屏幕底部走出来，一边走一边放大，真的走到你面前 |
| 💕 | **摸头互动** | 点击猫咪，爱心飞出来，猫咪开心地抖动 |
| ☕ | **两个选择** | 「好的，去休息」计时清零；「再忙 N 分钟」顺延后再来找你 |
| ⚙️ | **设置面板** | 点击扩展图标，调整触发时长、顺延时长、是否暂停计时 |
| ▶️ | **一键预览** | 不用等 30 分钟，点「预览」立刻看猫咪出场效果 |
| 🧩 | **无干扰** | 基于 Shadow DOM，猫咪 UI 与网页样式完全隔离，互不影响 |

## 安装

本扩展尚未上架 Chrome 应用商店，通过开发者模式本地加载即可。

1. **克隆仓库**
   ```bash
   git clone https://github.com/rany-456/meow-rest-reminder.git
   ```
2. 打开 Chrome，地址栏输入 `chrome://extensions/`
3. 右上角打开 **「开发者模式」**
4. 点击 **「加载已解压的扩展程序」**，选择项目根目录（含 `manifest.json` 的那层）
5. 打开任意网页，点扩展图标 → **「预览猫咪出场效果」** 立刻查看

> 计时只在 `http` / `https` 普通网页生效；`chrome://`、新标签页等内部页面无法注入。

## 换上你自己的猫

插件内置了一套默认黑猫素材。你也可以换成自己喜欢的猫咪——把动图放到 `assets/cat/` 目录，不需要改任何代码：

| 文件名 | 用途 |
| --- | --- |
| `cat-walk.webp` | 走进来的行走循环 |
| `cat-idle.webp` | 走到面前后的待机 |
| `cat-happy.webp` | 被摸头时的开心反馈 |

推荐使用 WebP 动图格式（体积小，Chrome 原生支持）。三个文件不必都准备，缺失的会自动回退。

## 项目结构

```
meow-rest-reminder/
├── manifest.json          # Manifest V3 配置
├── src/
│   ├── background.js      # Service Worker：计时心跳、消息分发
│   ├── content.js         # 猫咪出场动画 + 互动 UI（Shadow DOM）
│   ├── cat.css            # 猫咪动画样式
│   ├── popup.html         # 设置面板
│   ├── popup.css          # 设置面板样式
│   └── popup.js           # 设置面板逻辑
├── assets/cat/            # 猫咪素材（可替换）
└── icons/                 # 扩展图标
```

## 技术要点

- **零依赖**：原生 JavaScript + HTML + CSS，无构建工具，无第三方库，加载即用
- **Manifest V3**：使用 `chrome.alarms` 做持久心跳计时，避免 Service Worker 被回收导致 `setInterval` 失效
- **Shadow DOM 隔离**：猫咪 UI 与宿主网页样式双向隔离，既不被网页 CSS 污染，也不影响网页布局
- **精准计时**：只对「当前激活 + 窗口聚焦」的标签页累计时间；页面导航到新 URL 自动重置

## 后续计划

- [ ] 上架 Chrome 应用商店
- [ ] 猫咪轻量养成：记录互动次数，解锁不同表情
- [ ] 勿扰时段设置
- [ ] 休息建议（喝水 / 远眺 / 拉伸）随机轮换
- [ ] 多猫咪主题支持

## 参与贡献

欢迎提交 Issue 和 Pull Request。

1. Fork 本仓库
2. 创建你的分支：`git checkout -b feat/your-feature`
3. 提交更改：`git commit -m "feat: add something"`
4. 推送分支：`git push origin feat/your-feature`
5. 发起 Pull Request

## 开源协议

[MIT](LICENSE) — 自由使用、修改和分发。
