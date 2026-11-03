# IDM 4K YouTube Downloader (Extension + Cloud Server)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

A powerful, lightweight **IDM-style 4K YouTube Downloader** featuring a floating, draggable in-browser badge, automatic maximum quality detection (4K 2160p / 2K / 1080p), and a high-performance backend deployable to **Render** or runnable locally on your PC.

---

## ✨ Features

- **🎯 True 4K 60FPS & 8K Support**: Downloads raw separate ultra-HD video + audio tracks and muxes them into high-bitrate `.mp4` using FFmpeg.
- **⚡ Automatic Max Quality Detection**: No confusing resolution menus. Automatically matches and grabs the absolute highest resolution available for that specific video.
- **🖐️ Draggable & Compact Badge**: Sleek 24px floating button anchored to the side of the video player. Drag the `⠿` handle anywhere you like.
- **🎬 Fullscreen Auto-Hide**: The download button automatically disappears when entering full-screen mode so it never obstructs your viewing.
- **☁️ Cloud (Render) & Local (Desktop) Dual Support**:
  - **Render Cloud Backend**: Host it for free on Render. Anyone can install your Chrome extension and download videos with zero setup (no Python/FFmpeg required on their machine!).
  - **Local Desktop Backend**: Run locally on Windows with turbo multi-thread speed saving directly to `Downloads`.
- **🔐 Automatic Challenge Solver**: Built-in Node.js runner with remote `ejs:github` solver to bypass modern YouTube signature challenges and bot checks.

---

## 🚀 Quick Setup: Load Extension in Chrome / Edge / Brave

1. Download or clone this repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/yt-4k-idm.git
   ```
2. Open your browser and navigate to:
   - **Chrome / Brave**: `chrome://extensions`
   - **Microsoft Edge**: `edge://extensions`
3. Toggle on **Developer mode** (top-right corner).
4. Click **Load unpacked** and select the `yt_4k_idm` folder.
5. Open any video on [YouTube](https://www.youtube.com). You will see the floating badge:
   ```text
   [ ⠿ | ▶ Download this video | ? | ✕ ]
   ```

---

## ☁️ Deploy Backend to Render (Free 24/7 Cloud Server)

Deploy your own cloud backend in **2 clicks** so your friends or public users can use the extension without installing Python:

1. Fork or push this repository to your **GitHub** account.
2. Sign in to [Render.com](https://render.com).
3. Click **New +** → **Blueprint** (or **Web Service**).
4. Connect this GitHub repository. Render will automatically detect `render.yaml` and `Dockerfile`.
5. Click **Apply / Deploy**.
6. Once deployed, copy your Render URL:
   ```text
   https://your-service-name.onrender.com
   ```
7. In Chrome, right-click the extension icon → **Options** (or open `options.html`), paste your Render URL, and click **Save Settings**!

---

## 💻 Running the Backend Locally (Windows)

If you prefer to run the engine locally on your Windows PC:

1. Install requirements:
   ```bash
   pip install -r requirements.txt
   ```
2. Double-click `launch_idm_4k.bat` or run:
   ```bash
   python idm_4k_app.py
   ```
3. Videos will download directly into your `Downloads` folder at maximum network speed.

---

## ⌨️ Shortcuts

- **`Alt + D`** — Press anytime on YouTube to immediately trigger download.
- **`Ctrl + Shift + Y`** — Global Windows hotkey: copy any YouTube link and press to download.

---

## 📂 Project Structure

```text
yt_4k_idm/
├── Dockerfile          # Production Docker container for Render deployment
├── render.yaml         # One-click Render Blueprint specification
├── server.py           # FastAPI Cloud Server for Render
├── idm_4k_app.py       # Local desktop service with direct disk download
├── launch_idm_4k.bat   # Windows 1-click launcher
├── requirements.txt    # Python dependencies (yt-dlp, fastapi, etc.)
├── manifest.json       # Chrome Extension Manifest V3
├── content.js          # Draggable floating YouTube badge & progress
├── content.css         # IDM styling & fullscreen auto-hide
├── background.js       # Background service worker & Render communication
├── options.html        # Settings page to configure Render or Local URL
└── options.js          # Options script
```

---

## 📄 License

MIT License. Open-source and free to use!
