# ⚡ TubeGrab 4K — YouTube Video Downloader Extension & Cloud Engine

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/f2025cs024-star/Tubegrab-4K)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

An ultra-sleek, high-performance **YouTube Video Downloader Extension** featuring a floating glassmorphism capsule pill, live electric blue download progress bar, dynamic quality dropdown tailored to each video (144p to 4K & 8K), and background downloading that never stops—even if you switch or close tabs.

---

## ✨ Features

- **🎯 True 4K 60FPS & 8K**: Uses FFmpeg to merge uncompressed raw video & audio streams into pristine MP4 files.
- **💎 Frosted Glassmorphism UI**: Beautiful floating dark pill with neon accents (`[ ⠿ | ↓ 4K ▾ | ✕ ]`).
- **🔵 Live Electric Blue Progress Bar**: Full-width glowing neon blue progress bar along the capsule showing live percentages (`45%`), download speed, and downloaded MB in real-time.
- **📋 Dynamic Quality Dropdown (`▾`)**: Automatically reads the specific video's available streams directly from the player. Displays tailored badges (`4K`, `2K`, `1080p`, `720p`, `480p`, `360p`, `240p`, `144p`, `MP3`). On videos with max 1080p, higher resolutions are cleanly hidden.
- **🎯 Strict Quality Matching**: Downloads strictly in the resolution you choose (e.g. `720p` saves exact 720p stream labeled `(720p).mp4`).
- **🔄 Tab-Independent Background Downloads**: Start a download and switch tabs, open 20 new pages, or minimize Chrome. The background service worker keeps downloading and fires a native Windows desktop notification when ready.
- **🖐️ Draggable Capsule**: Click & drag `⠿` anywhere across the screen. Remembers your favorite position. Double-click `⠿` to reset to video side.
- **🎬 Fullscreen Auto-Hide**: Automatically vanishes when you go into Fullscreen mode.
- **☁️ 1-Click Deploy on Render**: Deploy your cloud backend to Render for free. Anyone can install your extension from GitHub without installing Python, FFmpeg, or Node.js!
- **🔄 Auto-Update Notification**: Cloud-connected update checking automatically notifies users whenever a new version is released.

---

## 🚀 Quick Install (Browser Extension)

1. Clone or download this repo:
   ```bash
   git clone https://github.com/f2025cs024-star/Tubegrab-4K.git
   ```
2. Open **Chrome** or **Edge** and go to `chrome://extensions` (or `edge://extensions`).
3. Toggle on **Developer mode** (top-right).
4. Click **Load unpacked** and select the `yt_4k_idm` (or `extension`) folder.
5. Open any YouTube video. The sleek glass pill will appear docked on the side of the video!

---

## ☁️ Deploy Backend to Render (Free 24/7 Cloud Engine)

1. Push this repository to your **GitHub** account:
   ```bash
   git remote add origin https://github.com/f2025cs024-star/Tubegrab-4K.git
   git branch -M main
   git push -u origin main
   ```
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
