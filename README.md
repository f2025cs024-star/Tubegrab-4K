# ⚡ TubeGrab 4K — YouTube Video Downloader Extension & Engine

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/f2025cs024-star/Tubegrab-4K)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

An ultra-sleek, high-performance **YouTube Video Downloader Extension** featuring a floating glassmorphism capsule pill, live electric blue download progress bar, dynamic quality dropdown tailored to each video (144p to 4K & 8K), and background downloading that never stops—even if you switch or close tabs.

---

## 💻 2-Step Setup on Any New Laptop (Using GitHub)

Setting up TubeGrab 4K on a new laptop takes less than **60 seconds**:

### Step 1: Download the Repository from GitHub
* **Option A (No Git needed)**: Go to [https://github.com/f2025cs024-star/Tubegrab-4K](https://github.com/f2025cs024-star/Tubegrab-4K), click the green **Code** button → click **Download ZIP**, and extract the ZIP folder.
* **Option B (Using Git)**:
  ```bash
  git clone https://github.com/f2025cs024-star/Tubegrab-4K.git
  ```

### Step 2: Run the 1-Click Installer
Inside the downloaded folder, simply double-click:
```text
install.bat
```
This automated script will:
* Verify Python (and notify you if Python is needed with PATH enabled).
* Automatically install required libraries (`fastapi`, `uvicorn`, `yt-dlp`, `imageio-ffmpeg`, `curl_cffi`).
* Configure **Windows Silent Auto-Start** so TubeGrab 4K runs silently in the background on every PC boot (zero popups, zero terminal windows).
* Register the custom `tubegrab://` protocol.
* Launch the background helper immediately!

### Step 3: Load the Extension in Google Chrome
1. Open Google Chrome and go to: `chrome://extensions`
2. Turn **ON** the **Developer mode** toggle in the top-right corner.
3. Click the **Load unpacked** button in the top-left corner.
4. Select the `extension` folder inside the downloaded `Tubegrab-4K` directory.
5. **Done!** Open any YouTube video. The sleek glass pill will appear docked on the side of the video, ready to download!

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
- **🚀 Zero-Click Background Helper**: Starts automatically on PC boot with `pythonw.exe`—completely invisible with zero RAM overhead (~15MB).

---

## ⌨️ Shortcuts

- **`Alt + D`** — Instant download in Max Quality on YouTube.
- **`Ctrl + Shift + Y`** — Global Windows hotkey: copy any YouTube URL and press.

---

## 📄 License

MIT License. Open-source and free to share!
