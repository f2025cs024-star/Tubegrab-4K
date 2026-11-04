import os
from pathlib import Path
from typing import Optional, List
from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import JSONResponse, FileResponse, PlainTextResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import yt_dlp

app = FastAPI(
    title="TubeGrab 4K Cloud & Hub API",
    description="Official API for TubeGrab 4K YouTube Video Downloader Extension",
    version="2.2.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def google_verification_middleware(request, call_next):
    path = request.url.path
    if path.startswith("/google") and path.endswith(".html"):
        filename = path.lstrip("/")
        return Response(content=f"google-site-verification: {filename}\n", media_type="text/html")
    return await call_next(request)

CURRENT_DIR = Path(__file__).resolve().parent
ROOT_DIR = CURRENT_DIR.parent if CURRENT_DIR.name == "api" else CURRENT_DIR

def find_file(filename: str) -> Optional[Path]:
    for base in [CURRENT_DIR, ROOT_DIR, Path(".")]:
        target = base / filename
        if target.exists() and target.is_file():
            return target
    return None

class DownloadRequest(BaseModel):
    url: str
    title: Optional[str] = ""
    quality: Optional[str] = "max"
    cookies: Optional[List[dict]] = None


@app.get("/")
@app.get("/index.html")
def home():
    f = find_file("index.html")
    if f:
        return FileResponse(str(f), media_type="text/html")
    return {"status": "online", "app": "TubeGrab 4K Website"}


@app.get("/extension.zip")
def download_extension():
    f = find_file("extension.zip")
    if f:
        return FileResponse(str(f), filename="TubeGrab-4K-Extension.zip", media_type="application/zip")
    raise HTTPException(status_code=404, detail="extension.zip not found")


@app.get("/tubegrab-windows-full.zip")
def download_full():
    f = find_file("tubegrab-windows-full.zip")
    if f:
        return FileResponse(str(f), filename="TubeGrab-4K-Windows-Suite.zip", media_type="application/zip")
    raise HTTPException(status_code=404, detail="tubegrab-windows-full.zip not found")


@app.get("/icon.png")
def get_icon():
    f = find_file("icon.png")
    if f:
        return FileResponse(str(f), media_type="image/png")
    raise HTTPException(status_code=404, detail="icon.png not found")


@app.get("/sitemap.xml")
def get_sitemap():
    f = find_file("sitemap.xml")
    if f:
        return FileResponse(str(f), media_type="application/xml")
    raise HTTPException(status_code=404, detail="sitemap.xml not found")


@app.get("/robots.txt")
def get_robots():
    f = find_file("robots.txt")
    if f:
        return FileResponse(str(f), media_type="text/plain")
    raise HTTPException(status_code=404, detail="robots.txt not found")


@app.get("/googleea333b6af960c847.html")
@app.get("/google283a7b7c4b960849.html")
def get_google_verification():
    return Response(content="google-site-verification: googleea333b6af960c847.html\n", media_type="text/html")


@app.get("/api")
@app.get("/status")
@app.get("/api/status")
def health():
    return {
        "status": "online",
        "app": "TubeGrab 4K Vercel Hub API",
        "version": "2.2.0",
        "deployment": "Vercel Serverless (Fluid Compute)",
        "features": {
            "metadata_extraction": "supported",
            "remote_config": "supported",
            "auto_updates": "supported",
            "4k_video_muxing": "local_desktop_engine_or_render_docker"
        },
        "github": "https://github.com/f2025cs024-star/Tubegrab-4K"
    }


@app.get("/version")
@app.get("/api/version")
def get_version():
    return {
        "version": "2.2.0",
        "app": "TubeGrab 4K",
        "changelog": "Dynamic quality dropdown (144p to 4K), live electric blue progress bar, micro-pill UI.",
        "release_url": "https://github.com/f2025cs024-star/Tubegrab-4K",
        "download_url": "https://github.com/f2025cs024-star/Tubegrab-4K/archive/refs/heads/main.zip"
    }


@app.get("/config")
@app.get("/api/config")
def get_config():
    return {
        "version": "2.2.0",
        "min_version": "2.0.0",
        "supported_resolutions": ["4320", "2160", "1440", "1080", "720", "480", "360", "240", "144", "mp3"],
        "notice": "TubeGrab 4K is active. For full 4K 60fps downloads, ensure the local desktop helper is running."
    }


@app.get("/info")
@app.get("/api/info")
def get_video_info(url: str = Query(..., description="YouTube video URL")):
    if not url or ("youtube.com" not in url and "youtu.be" not in url):
        raise HTTPException(status_code=400, detail="Invalid YouTube URL provided")

    try:
        ydl_opts = {
            "skip_download": True,
            "quiet": True,
            "no_warnings": True,
            "extract_flat": False
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            meta = ydl.extract_info(url, download=False)
            if not meta:
                raise HTTPException(status_code=404, detail="Could not retrieve video information")

            formats = meta.get("formats", []) or []
            heights = set()
            has_audio = False
            for f in formats:
                h = f.get("height")
                if h and isinstance(h, int):
                    heights.add(h)
                if f.get("acodec") and f.get("acodec") != "none":
                    has_audio = True

            sorted_h = sorted(list(heights), reverse=True)
            max_res = f"{sorted_h[0]}p" if sorted_h else "1080p"

            qualities = []
            for h in sorted_h:
                label = f"{h}p"
                if h >= 2160:
                    label += " (4K UHD)"
                elif h >= 1440:
                    label += " (2K QHD)"
                elif h >= 1080:
                    label += " (Full HD)"
                qualities.append(label)

            if has_audio:
                qualities.append("MP3 Audio (320kbps)")

            return {
                "ok": True,
                "title": meta.get("title", "YouTube Video"),
                "uploader": meta.get("uploader", "YouTube Creator"),
                "duration": meta.get("duration", 0),
                "thumbnail": meta.get("thumbnail", ""),
                "max_resolution": max_res,
                "qualities": qualities,
                "available_heights": sorted_h
            }
    except Exception as e:
        return {
            "ok": False,
            "error": str(e),
            "notice": "Cloud extractor blocked by YouTube datacenter bot wall. Use local TubeGrab helper for instant extraction."
        }
