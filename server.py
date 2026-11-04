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

app = FastAPI(title="TubeGrab 4K Cloud API", version="2.2.2")

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

# Locate FFmpeg
FFMPEG_EXE = None
try:
    import imageio_ffmpeg
    FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    pass
if not FFMPEG_EXE or not os.path.exists(FFMPEG_EXE):
    FFMPEG_EXE = shutil.which("ffmpeg")

# Locate JS Runtimes (Deno / Node.js)
DENO_PATH = shutil.which("deno") or (os.path.expanduser("~/.deno/bin/deno") if os.path.exists(os.path.expanduser("~/.deno/bin/deno")) else None)
NODE_PATH = shutil.which("node") or shutil.which("nodejs") or (r"C:\Program Files\nodejs\node.exe" if os.name == "nt" else None)

# TLS Fingerprint Impersonation Target (bypasses YouTube datacenter bot wall)
IMPERSONATE_TARGET = None
try:
    from yt_dlp.networking.impersonate import ImpersonateTarget
    IMPERSONATE_TARGET = ImpersonateTarget.from_str("chrome-131")
except Exception:
    try:
        from yt_dlp.networking.impersonate import ImpersonateTarget
        IMPERSONATE_TARGET = ImpersonateTarget.from_str("chrome")
    except Exception:
        pass


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
            f.write("# Netscape HTTP Cookie File\n")
            for c in cookies_list:
                domain = c.get("domain", "")
                if domain and not domain.startswith("."):
                    domain = "." + domain
                include_subdomains = "TRUE" if domain.startswith(".") else "FALSE"
                path = c.get("path", "/")
                secure = "TRUE" if c.get("secure", False) else "FALSE"
                expires = int(c.get("expirationDate") or (time.time() + 86400 * 30))
                name = c.get("name", "")
                value = c.get("value", "")
                if name and value:
                    f.write(f"{domain}\t{include_subdomains}\t{path}\t{secure}\t{expires}\t{name}\t{value}\n")
        return True
    except Exception as e:
        print(f"Error writing cookies: {e}")
        return False


def run_yt_dlp(task_id: str, url: str, title: str, quality: str, cookies: Optional[List[dict]] = None):
    info = ACTIVE_TASKS.get(task_id)
    if not info:
        return

    is_mp3 = False
    if quality == "mp3":
        fmt = "bestaudio/best"
        is_mp3 = True
    elif quality == "max":
        fmt = "bestvideo+bestaudio/best"
        is_mp3 = False
    else:
        fmt = f"bestvideo[height<={quality}]+bestaudio/best[height<={quality}]/best"
        is_mp3 = False

    def progress_hook(d):
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes", 0)
            speed = d.get("speed", 0)
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
            info["speed"] = "Finalizing video..."

    task_folder = TEMP_DIR / task_id
    task_folder.mkdir(parents=True, exist_ok=True)
    out_tmpl = str(task_folder / "%(title)s.%(ext)s")

    ydl_opts = {
        "format": fmt,
        "outtmpl": out_tmpl,
        "noplaylist": True,
        "progress_hooks": [progress_hook],
        "concurrent_fragment_downloads": 4,
        "merge_output_format": "mp4",
        "quiet": True,
        "no_warnings": True,
        "extractor_args": {
            "youtube": {
                "player_client": ["android", "ios", "mweb", "web"]
            }
        },
        "http_headers": {
            "Accept-Language": "en-US,en;q=0.9"
        }
    }

    if IMPERSONATE_TARGET:
        ydl_opts["impersonate"] = IMPERSONATE_TARGET

    if FFMPEG_EXE:
        ydl_opts["ffmpeg_location"] = FFMPEG_EXE

    js_runtimes = {}
    if DENO_PATH and os.path.exists(DENO_PATH):
        js_runtimes["deno"] = {"path": DENO_PATH}
    if NODE_PATH and os.path.exists(NODE_PATH):
        js_runtimes["node"] = {"path": NODE_PATH}
    if js_runtimes:
        ydl_opts["js_runtimes"] = js_runtimes

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
    except Exception as primary_err:
        print(f"Primary extraction failed ({primary_err}), attempting fallback...")
        try:
            info["speed"] = "Retrying via resilient engine..."
            fallback_opts = dict(ydl_opts)
            fallback_opts["format"] = "18/best" if not is_mp3 else "bestaudio/best"
            fallback_opts["extractor_args"] = {
                "youtube": {
                    "player_client": ["android", "ios"]
                }
            }
            fallback_opts.pop("cookiefile", None)
            with yt_dlp.YoutubeDL(fallback_opts) as ydl:
                meta = ydl.extract_info(url, download=True)
                if meta:
                    info["title"] = meta.get("title") or title
                    expected_filename = ydl.prepare_filename(meta)
                    ext = ".mp3" if is_mp3 else ".mp4"
                    cand = os.path.splitext(expected_filename)[0] + ext
                    if os.path.exists(cand):
                        info["filepath"] = cand
        except Exception as fallback_err:
            print(f"Fallback extraction failed: {fallback_err}")
            info["status"] = "error"
            info["error"] = str(fallback_err)
            return

    # Verify output file
    files = list(task_folder.glob("*.mp*"))
    if info.get("filepath") and os.path.exists(info["filepath"]):
        info["status"] = "finished"
        info["percent"] = 100.0
        info["speed"] = "Download Complete"
        info["downloaded"] = format_bytes(os.path.getsize(info["filepath"]))
        info["total"] = info["downloaded"]
    elif files:
        info["filepath"] = str(files[0])
        info["status"] = "finished"
        info["percent"] = 100.0
        info["speed"] = "Download Complete"
        info["downloaded"] = format_bytes(os.path.getsize(files[0]))
        info["total"] = info["downloaded"]
    elif not info.get("error"):
        info["status"] = "error"
        info["error"] = "Output file not found after download"


@app.get("/")
@app.get("/index.html")
def home():
    for candidate in [Path("index.html"), Path("api/index.html"), Path(__file__).resolve().parent / "index.html"]:
        if candidate.exists():
            return FileResponse(str(candidate), media_type="text/html")
    return {
        "status": "online",
        "app": "TubeGrab 4K Cloud Server",
        "version": "2.2.2",
        "docs": "/docs"
    }


@app.get("/extension.zip")
def download_ext():
    for candidate in [Path("extension.zip"), Path("api/extension.zip"), Path(__file__).resolve().parent / "extension.zip"]:
        if candidate.exists():
            return FileResponse(str(candidate), filename="TubeGrab-4K-Extension.zip", media_type="application/zip")
    raise HTTPException(status_code=404, detail="File not found")


@app.get("/tubegrab-windows-full.zip")
def download_suite():
    for candidate in [Path("tubegrab-windows-full.zip"), Path("api/tubegrab-windows-full.zip"), Path(__file__).resolve().parent / "tubegrab-windows-full.zip"]:
        if candidate.exists():
            return FileResponse(str(candidate), filename="TubeGrab-4K-Windows-Suite.zip", media_type="application/zip")
    raise HTTPException(status_code=404, detail="File not found")


@app.get("/icon.png")
def get_icon():
    for candidate in [Path("icon.png"), Path("api/icon.png"), Path(__file__).resolve().parent / "icon.png"]:
        if candidate.exists():
            return FileResponse(str(candidate), media_type="image/png")
    raise HTTPException(status_code=404, detail="File not found")


@app.get("/sitemap.xml")
def get_sitemap():
    for candidate in [Path("sitemap.xml"), Path("api/sitemap.xml"), Path(__file__).resolve().parent / "sitemap.xml"]:
        if candidate.exists():
            return FileResponse(str(candidate), media_type="application/xml")
    raise HTTPException(status_code=404, detail="File not found")


@app.get("/robots.txt")
def get_robots():
    for candidate in [Path("robots.txt"), Path("api/robots.txt"), Path(__file__).resolve().parent / "robots.txt"]:
        if candidate.exists():
            return FileResponse(str(candidate), media_type="text/plain")
    raise HTTPException(status_code=404, detail="File not found")


@app.get("/status")
def status():
    return {
        "status": "running",
        "app": "TubeGrab 4K Cloud Server",
        "active_tasks": len([t for t in ACTIVE_TASKS.values() if t.get("status") in ["starting", "downloading", "merging"]]),
        "version": "2.2.2"
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


@app.get("/tasks")
def list_tasks():
    return list(ACTIVE_TASKS.values())


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
        "version": "2.2.2",
        "app": "TubeGrab 4K",
        "changelog": "TLS Impersonation + VisionOS engine for 100% bypass of datacenter bot blocks.",
        "release_url": "https://github.com/f2025cs024-star/Tubegrab-4K"
    }


@app.get("/config")
def get_config():
    return {
        "version": "2.2.2",
        "min_version": "2.0.0",
        "supported_resolutions": ["4320", "2160", "1440", "1080", "720", "480", "360", "240", "144", "mp3"],
        "notice": ""
    }


@app.get("/updates.xml")
def get_updates():
    xml_path = Path("updates.xml")
    if xml_path.exists():
        return FileResponse(str(xml_path), media_type="application/xml")
    raise HTTPException(status_code=404, detail="updates.xml not found")


@app.get("/debug")
def debug():
    return {
        "ffmpeg": FFMPEG_EXE,
        "deno": DENO_PATH,
        "node": NODE_PATH,
        "impersonate": str(IMPERSONATE_TARGET),
        "yt_dlp_version": yt_dlp.version.__version__
    }


@app.get("/test_extract")
def test_extract(url: str = "https://www.youtube.com/watch?v=jNQXAC9IVRw"):
    opts = {
        "quiet": False,
        "format": "bestvideo+bestaudio/best"
    }
    if IMPERSONATE_TARGET:
        opts["impersonate"] = IMPERSONATE_TARGET
    if FFMPEG_EXE:
        opts["ffmpeg_location"] = FFMPEG_EXE
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            meta = ydl.extract_info(url, download=False)
            return {
                "ok": True,
                "title": meta.get("title"),
                "formats": len(meta.get("formats", []))
            }
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/test_cli")
def test_cli(url: str = "https://www.youtube.com/watch?v=jNQXAC9IVRw"):
    import subprocess
    cmd = ["yt-dlp", "-v", "--impersonate", "chrome-131", "-F", url]
    if FFMPEG_EXE:
        cmd.extend(["--ffmpeg-location", FFMPEG_EXE])
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        return {"stdout": res.stdout, "stderr": res.stderr, "code": res.returncode}
    except Exception as e:
        return {"error": str(e)}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 19876))
    uvicorn.run(app, host="0.0.0.0", port=port)
