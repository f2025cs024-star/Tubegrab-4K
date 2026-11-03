# ⚡ OmniGrab 4K - YouTube Downloader & Cloud Server

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

An ultra-sleek, high-performance **YouTube Downloader** featuring a floating glassmorphism capsule pill, a dynamic quality dropdown tailored to each video, and background downloading that never stops—even if you switch or close tabs.

---

## ✨ Features

- **🎯 True 4K 60FPS & 8K**: Uses FFmpeg to merge uncompressed raw video & audio streams into pristine MP4 files.
- **💎 Frosted Glassmorphism UI**: Beautiful floating dark pill with neon accents (`[ ⠿ | ▶ Download | ▾ | ✕ ]`).
- **📋 Dynamic Quality Dropdown (`▾`)**: Automatically reads the specific video's available streams directly from the player. Displays tailored badges (`4K`, `2K`, `1080p`, `720p`, `MP3`).
- **🔄 Tab-Independent Background Downloads**: Start a download and switch tabs, open 20 new pages, or minimize Chrome. The background service worker keeps downloading and fires a native Windows desktop notification when ready.
- **🖐️ Draggable Capsule**: Click & drag `⠿` anywhere across the screen. Remembers your favorite position. Double-click `⠿` to reset to video side.
- **🎬 Fullscreen Auto-Hide**: Automatically vanishes when you go into Fullscreen mode.
- **☁️ 1-Click Deploy on Render**: Deploy your cloud backend to Render for free. Anyone can install your extension from GitHub without installing Python, FFmpeg, or Node.js!

---

## 🚀 Quick Install (Browser Extension)

1. Clone or download this repo:
   ```bash
   git clone https://github.com/YOUR_USERNAME/omnigrab-4k.git
   ```
2. Open **Chrome** or **Edge** and go to `chrome://extensions` (or `edge://extensions`).
3. Toggle on **Developer mode** (top-right).
4. Click **Load unpacked** and select the `yt_4k_idm` (or `extension`) folder.
5. Open any YouTube video. The sleek glass pill will appear docked on the side of the video!

---

## ☁️ Deploy Backend to Render (Free 24/7 Cloud Engine)

1. Push this repository to your **GitHub** account.
2. Sign in to [Render.com](https://render.com).
3. Click **New +** → **Blueprint** (or **Web Service**).
4. Select this repository. Render automatically reads `render.yaml` and `Dockerfile`.
5. Click **Apply**.
6. Copy your service URL: `https://your-service.onrender.com`.
7. In Chrome, right-click the extension icon → **Options**, paste your Render URL, and click **Save Settings**!

---

## 💻 Running the Local Desktop Engine (Windows)

To run the local turbo backend:
```bash
pip install -r requirements.txt
python idm_4k_app.py
```
*(Or double-click `launch_idm_4k.bat`)*.

---

## ⌨️ Shortcuts

- **`Alt + D`** — Instant download in Max Quality on YouTube.
- **`Ctrl + Shift + Y`** — Global Windows hotkey: copy any YouTube URL and press.

---

## 📄 License

MIT License. Open-source and free to share!
