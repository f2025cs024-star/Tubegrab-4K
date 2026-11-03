import os
import re
import time
import uuid
import shutil
import asyncio
from pathlib import Path
from typing import Optional, List
from fastapi import FastAPI, BackgroundTasks, Query, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import yt_dlp

app = FastAPI(title="TubeGrab 4K Cloud API", version="2.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMP_DIR = Path("/tmp/downloads" if os.name != "nt" else os.path.expanduser("~/Downloads/yt_4k_temp"))
TEMP_DIR.mkdir(parents=True, exist_ok=True)

ACTIVE_TASKS = {}
NODE_PATH = shutil.which("node") or shutil.which("nodejs") or r"C:\Program Files\nodejs\node.exe"


class DownloadRequest(BaseModel):
    url: str
    title: Optional[str] = ""
    quality: Optional[str] = "max"
    cookies: Optional[List[dict]] = None


def format_bytes(num_bytes):
    if not num_bytes or num_bytes <= 0:
        return ""
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if num_bytes < 1024.0:
            return f"{num_bytes:.1f} {unit}"
        num_bytes /= 1024.0
    return f"{num_bytes:.1f} PB"


def write_netscape_cookies(cookies_list, filepath):
    if not cookies_list:
        return False
    try:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write("# Netscape HTTP Cookie File\n\n")
            for c in cookies_list:
                domain = c.get("domain", "")
                if not domain:
                    continue
                flag = "TRUE" if domain.startswith(".") else "FALSE"
                path = c.get("path", "/")
                secure = "TRUE" if c.get("secure", False) else "FALSE"
                exp = int(c.get("expirationDate") or (time.time() + 86400 * 30))
                name = c.get("name", "")
                val = c.get("value", "")
                f.write(f"{domain}\t{flag}\t{path}\t{secure}\t{exp}\t{name}\t{val}\n")
        return True
    except Exception:
        return False


def run_yt_dlp(task_id: str, url: str, title: str, quality: str, cookies: Optional[List[dict]]):
    info = ACTIVE_TASKS[task_id]

    q = (str(quality) if quality else "max").lower().strip()
    is_mp3 = (q == "mp3")

    if is_mp3:
        fmt = "bestaudio/best"
    elif q.isdigit():
        target_h = int(q)
        fmt = f"bestvideo[height={target_h}]+bestaudio/best[height={target_h}]/bestvideo[height<={target_h}]+bestaudio/best[height<={target_h}]/best"
    else:
        fmt = "bestvideo+bestaudio/best"

    def progress_hook(d):
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes") or 0
            speed = d.get("speed") or 0
            pct = (downloaded / total * 100.0) if total > 0 else 0.0

            info["status"] = "downloading"
            info["percent"] = round(pct, 1)
            info["speed"] = f"{format_bytes(speed)}/s" if speed else "Downloading..."
            info["downloaded"] = format_bytes(downloaded)
            info["total"] = format_bytes(total)
            if d.get("filename"):
                info["filepath"] = d.get("filename")

        elif d.get("status") == "finished":
            info["status"] = "merging"
            info["percent"] = 99.0
            info["speed"] = "Merging streams..."

    task_folder = TEMP_DIR / task_id
    task_folder.mkdir(parents=True, exist_ok=True)
    out_tmpl = str(task_folder / "%(title)s.%(ext)s")

    ydl_opts = {
        "format": fmt,
        "outtmpl": out_tmpl,
        "noplaylist": True,
        "progress_hooks": [progress_hook],
        "concurrent_fragment_downloads": 8,
        "merge_output_format": "mp4",
        "quiet": True,
        "no_warnings": True,
        "extractor_args": {
            "youtube": {
                "player_client": ["web", "mweb", "android"]
            }
        },
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9"
        }
    }

    if NODE_PATH and os.path.exists(NODE_PATH):
        ydl_opts["js_runtimes"] = {"node": {"path": NODE_PATH}}

    cookie_file = task_folder / "cookies.txt"
    if cookies and write_netscape_cookies(cookies, cookie_file):
        ydl_opts["cookiefile"] = str(cookie_file)

    if is_mp3:
        ydl_opts["postprocessors"] = [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "320",
        }]

    try:
        info["status"] = "downloading"
        info["speed"] = "Connecting to YouTube..."
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            meta = ydl.extract_info(url, download=True)
            if meta:
                info["title"] = meta.get("title") or title
                expected_filename = ydl.prepare_filename(meta)
                ext = ".mp3" if is_mp3 else ".mp4"
                cand = os.path.splitext(expected_filename)[0] + ext
                if os.path.exists(cand):
                    info["filepath"] = cand
                elif os.path.exists(expected_filename):
                    info["filepath"] = expected_filename

        info["status"] = "finished"
        info["percent"] = 100.0
        info["speed"] = "Done"
    except Exception as e:
        info["status"] = "error"
        info["error"] = str(e)


@app.get("/")
@app.get("/status")
def health():
    return {
        "status": "running",
        "app": "TubeGrab 4K Cloud Server",
        "active_tasks": len(ACTIVE_TASKS),
        "version": "2.2.1"
    }


@app.post("/trigger")
def trigger(req: DownloadRequest, background_tasks: BackgroundTasks):
    task_id = str(uuid.uuid4())[:8]
    ACTIVE_TASKS[task_id] = {
        "id": task_id,
        "url": req.url,
        "title": req.title or "YouTube Video",
        "quality": req.quality or "max",
        "status": "starting",
        "percent": 0.0,
        "speed": "Starting...",
        "downloaded": "",
        "total": "",
        "filepath": "",
        "error": None
    }
    background_tasks.add_task(run_yt_dlp, task_id, req.url, req.title, req.quality, req.cookies)
    return {"ok": True, "task_id": task_id, "message": "Download started"}


@app.get("/progress")
def progress(id: str = Query(...)):
    task = ACTIVE_TASKS.get(id)
    if not task:
        return {"status": "unknown"}
    return task


@app.get("/get_file")
def get_file(id: str = Query(...)):
    task = ACTIVE_TASKS.get(id)
    if not task or not task.get("filepath") or not os.path.exists(task["filepath"]):
        raise HTTPException(status_code=404, detail="File not ready or expired")
    filepath = task["filepath"]
    filename = os.path.basename(filepath)
    media = "audio/mpeg" if filepath.endswith(".mp3") else "video/mp4"
    return FileResponse(filepath, media_type=media, filename=filename)


@app.get("/open_folder")
def open_folder():
    if os.name == "nt":
        downloads = os.path.expanduser("~/Downloads")
        os.startfile(downloads)
        return {"ok": True}
    return {"ok": True, "message": "Folder open supported on local desktop"}


@app.get("/version")
def get_version():
    return {
        "version": "2.2.1",
        "app": "TubeGrab 4K",
        "changelog": "Dynamic quality dropdown (144p to 4K), live electric blue progress bar, micro-pill UI.",
        "release_url": "https://github.com/f2025cs024-star/Tubegrab-4K"
    }


@app.get("/config")
def get_config():
    return {
        "version": "2.2.1",
        "min_version": "2.0.0",
        "supported_resolutions": ["4320", "2160", "1440", "1080", "720", "480", "360", "240", "144", "mp3"],
        "notice": ""
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 19876))
    uvicorn.run(app, host="0.0.0.0", port=port)
