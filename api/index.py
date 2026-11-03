import os
from typing import Optional, List
from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import JSONResponse
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


class DownloadRequest(BaseModel):
    url: str
    title: Optional[str] = ""
    quality: Optional[str] = "max"
    cookies: Optional[List[dict]] = None


@app.get("/")
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

            sorted_res = sorted(list(heights), reverse=True)
            res_labels = [f"{h}p" for h in sorted_res]
            if has_audio:
                res_labels.append("MP3 Audio")

            return {
                "ok": True,
                "title": meta.get("title"),
                "thumbnail": meta.get("thumbnail"),
                "duration": meta.get("duration"),
                "uploader": meta.get("uploader"),
                "views": meta.get("view_count"),
                "qualities": res_labels,
                "max_resolution": f"{sorted_res[0]}p" if sorted_res else "1080p"
            }
    except Exception as e:
        return JSONResponse(
            status_code=400,
            content={"ok": False, "error": str(e)}
        )


@app.post("/trigger")
@app.post("/api/trigger")
def trigger(req: DownloadRequest):
    return JSONResponse(
        status_code=200,
        content={
            "ok": False,
            "task_id": None,
            "error": "Vercel Serverless payload limit notice",
            "message": (
                "Vercel Serverless Functions have a 4.5MB response payload limit and cannot stream 4K video files. "
                "For high-speed 4K/8K downloads, please run the local TubeGrab 4K Desktop Helper (http://127.0.0.1:19876) "
                "or connect to a Render Docker container."
            ),
            "recommendation": "Run launch_idm_4k.bat locally on your Windows PC for instant 4K downloads."
        }
    )


@app.get("/progress")
@app.get("/api/progress")
def progress(id: str = Query(...)):
    return {
        "status": "info",
        "message": "Use local desktop engine (http://127.0.0.1:19876) for real-time progress."
    }
