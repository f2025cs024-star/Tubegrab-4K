import os
import re
import sys
import time
import json
import uuid
import winsound
import threading
import subprocess
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import urllib.parse

try:
    import pyperclip
except ImportError:
    pyperclip = None

try:
    import keyboard
except ImportError:
    keyboard = None

try:
    import yt_dlp
except ImportError:
    yt_dlp = None

try:
    import imageio_ffmpeg
    FFMPEG_PATH = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    FFMPEG_PATH = None

NODE_PATH = r"C:\Program Files\nodejs\node.exe"
if not os.path.exists(NODE_PATH):
    NODE_PATH = "node"

PORT = 19876
DOWNLOADS_DIR = str(Path.home() / "Downloads")
COOKIES_FILE = str(Path(__file__).parent / "yt_cookies.txt")
ACTIVE_TASKS = {}
SHUTDOWN_TIMER = None
SHUTDOWN_LOCK = threading.Lock()
SERVER_INSTANCE = None

def cancel_shutdown():
    global SHUTDOWN_TIMER
    with SHUTDOWN_LOCK:
        if SHUTDOWN_TIMER is not None:
            try:
                SHUTDOWN_TIMER.cancel()
            except Exception:
                pass
            SHUTDOWN_TIMER = None

def check_auto_shutdown(delay=7200.0):
    """Keeps engine persistent in background for instant 0ms responses.
    Only terminates if TUBEGRAB_PERSISTENT=0 is explicitly configured."""
    global SHUTDOWN_TIMER
    if os.environ.get("TUBEGRAB_PERSISTENT", "1") == "1":
        return
    with SHUTDOWN_LOCK:
        active = any(
            t.get("status") in ("starting", "downloading", "merging")
            for t in ACTIVE_TASKS.values()
        )
        if not active:
            if SHUTDOWN_TIMER is None:
                log(f"[AutoStop] Inactivity detected. Scheduling auto-stop in {delay}s...")
                SHUTDOWN_TIMER = threading.Timer(delay, perform_shutdown)
                SHUTDOWN_TIMER.daemon = True
                SHUTDOWN_TIMER.start()
        else:
            if SHUTDOWN_TIMER is not None:
                try:
                    SHUTDOWN_TIMER.cancel()
                except Exception:
                    pass
                SHUTDOWN_TIMER = None

def perform_shutdown():
    log("[AutoStop] Auto-stop executed. Engine terminating cleanly to 0% CPU & 0 MB RAM.")
    try:
        if SERVER_INSTANCE:
            threading.Thread(target=SERVER_INSTANCE.shutdown, daemon=True).start()
    except Exception:
        pass
    time.sleep(0.5)
    os._exit(0)


LOG_FILE = str(Path(__file__).parent / "server.log")

def trigger_update_async():
    """Fetches latest yt-dlp, idm_4k_app.py, and extension files in the background."""
    def _worker():
        try:
            log("[AutoUpdate] Checking and applying updates from GitHub...")
            # 1. Update yt-dlp to support latest YouTube cipher
            subprocess.run(
                [sys.executable, "-m", "pip", "install", "-U", "--no-cache-dir", "yt-dlp"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120
            )
            # 2. Update idm_4k_app.py
            import urllib.request
            raw_url = "https://raw.githubusercontent.com/f2025cs024-star/Tubegrab-4K/main/idm_4k_app.py"
            req = urllib.request.Request(raw_url, headers={"User-Agent": "TubeGrab-Updater"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                if resp.status == 200:
                    code = resp.read().decode("utf-8")
                    if "TubeGrabServer" in code and len(code) > 2000:
                        with open(__file__, "w", encoding="utf-8") as f:
                            f.write(code)
                        log("[AutoUpdate] idm_4k_app.py updated successfully.")
            # 3. Update extension scripts on disk if folder exists
            ext_dir = Path(__file__).parent / "extension"
            if ext_dir.exists():
                for fname in ["content.js", "background.js", "manifest.json", "content.css"]:
                    u = f"https://raw.githubusercontent.com/f2025cs024-star/Tubegrab-4K/main/extension/{fname}"
                    r = urllib.request.Request(u, headers={"User-Agent": "TubeGrab-Updater"})
                    try:
                        with urllib.request.urlopen(r, timeout=10) as f_resp:
                            if f_resp.status == 200:
                                (ext_dir / fname).write_text(f_resp.read().decode("utf-8"), encoding="utf-8")
                    except Exception:
                        pass
                log("[AutoUpdate] Extension folder refreshed.")
            log("[AutoUpdate] Update process completed cleanly.")
        except Exception as e:
            log(f"[AutoUpdate] Failed: {e}")

    threading.Thread(target=_worker, daemon=True).start()

def log(msg):
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
    except Exception:
        pass

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
    except Exception as e:
        print(f"[OmniGrab] Cookie write error: {e}")
        return False


def format_bytes(num_bytes):
    if not num_bytes or num_bytes <= 0:
        return ""
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if num_bytes < 1024.0:
            return f"{num_bytes:.1f} {unit}"
        num_bytes /= 1024.0
    return f"{num_bytes:.1f} PB"


def run_download_task(task_id: str, url: str, title: str, quality: str, cookies_list: list = None):
    cancel_shutdown()
    log(f"Triggered task {task_id} for {url} ({quality})")
    info_dict = ACTIVE_TASKS.setdefault(task_id, {
        "id": task_id,
        "url": url,
        "title": title or "YouTube Video",
        "quality": quality,
        "status": "starting",
        "percent": 0.0,
        "speed": "Connecting...",
        "downloaded": "",
        "total": "",
        "filepath": "",
        "error": None
    })

    q = (str(quality) if quality else "max").lower().strip()
    is_mp3 = (q == "mp3")

    # Strictly enforce requested resolution height
    if is_mp3:
        fmt = "bestaudio/best"
        out_template = os.path.join(DOWNLOADS_DIR, "%(title)s.%(ext)s")
    elif q.isdigit():
        target_h = int(q)
        fmt = f"bestvideo[height={target_h}]+bestaudio/best[height={target_h}]/bestvideo[height<={target_h}]+bestaudio/best[height<={target_h}]/best"
        out_template = os.path.join(DOWNLOADS_DIR, f"%(title)s ({target_h}p).%(ext)s")
    else:
        fmt = "bestvideo+bestaudio/best"
        out_template = os.path.join(DOWNLOADS_DIR, "%(title)s.%(ext)s")

    print(f"[OmniGrab] Download request quality: {q} | fmt: {fmt} | outtmpl: {out_template}", flush=True)

    def progress_hook(d):
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes") or 0
            speed = d.get("speed") or 0
            pct = (downloaded / total * 100.0) if total > 0 else 0.0

            info_dict["status"] = "downloading"
            info_dict["percent"] = round(pct, 1)
            info_dict["speed"] = f"{format_bytes(speed)}/s" if speed else ""
            info_dict["downloaded"] = format_bytes(downloaded)
            info_dict["total"] = format_bytes(total)
            if d.get("filename"):
                info_dict["filepath"] = d.get("filename")

        elif d.get("status") == "finished":
            info_dict["status"] = "merging"
            info_dict["percent"] = 99.0
            info_dict["speed"] = f"Merging {q}..."

    ydl_opts = {
        "format": fmt,
        "outtmpl": out_template,
        "overwrites": True,
        "noplaylist": True,
        "progress_hooks": [progress_hook],
        "concurrent_fragment_downloads": 8,
        "merge_output_format": "mp4",
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 30,
        "retries": 10,
        "fragment_retries": 10,
        "http_headers": {
            "X-Forwarded-For": "8.8.8.8",
            "Client-IP": "8.8.8.8"
        },
        "js_runtimes": {"node": {"path": NODE_PATH}}
    }

    if FFMPEG_PATH:
        ydl_opts["ffmpeg_location"] = FFMPEG_PATH

    has_cookies = False
    if cookies_list:
        has_cookies = write_netscape_cookies(cookies_list, COOKIES_FILE)

    if has_cookies and os.path.exists(COOKIES_FILE):
        ydl_opts["cookiefile"] = COOKIES_FILE
    elif os.path.exists(COOKIES_FILE) and os.path.getsize(COOKIES_FILE) > 50:
        ydl_opts["cookiefile"] = COOKIES_FILE

    if is_mp3:
        ydl_opts["postprocessors"] = [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "320",
        }]

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            meta = ydl.extract_info(url, download=True)
            if meta:
                final_title = meta.get("title") or title
                info_dict["title"] = final_title

        info_dict["status"] = "finished"
        info_dict["percent"] = 100.0
        info_dict["speed"] = "Done"
        log(f"Task {task_id} completed successfully!")

        try:
            winsound.MessageBeep(winsound.MB_ICONASTERISK)
        except Exception:
            pass

    except Exception as e:
        info_dict["status"] = "error"
        info_dict["error"] = str(e)
        log(f"Task {task_id} ERROR: {e}")
    finally:
        check_auto_shutdown(delay=7200.0)


class TubeGrabServer(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def _send_cors(self, code=200):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_OPTIONS(self):
        self._send_cors(200)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        if parsed.path == "/status":
            self._send_cors(200)
            self.wfile.write(json.dumps({
                "status": "running",
                "app": "TubeGrab Downloader",
                "save_dir": DOWNLOADS_DIR,
                "active_tasks": len(ACTIVE_TASKS)
            }).encode("utf-8"))
            return

        if parsed.path == "/tasks":
            self._send_cors(200)
            self.wfile.write(json.dumps(list(ACTIVE_TASKS.values())).encode("utf-8"))
            return

        if parsed.path == "/progress":
            task_id = params.get("id", [""])[0]
            task_info = ACTIVE_TASKS.get(task_id)
            self._send_cors(200)
            if task_info:
                self.wfile.write(json.dumps(task_info).encode("utf-8"))
            else:
                self.wfile.write(json.dumps({"status": "unknown"}).encode("utf-8"))
            return

        if parsed.path == "/version":
            self._send_cors(200)
            self.wfile.write(json.dumps({
                "version": "2.2.5",
                "app": "TubeGrab",
                "changelog": "Auto-shutdown zero-resource engine, instant wake-up, dynamic quality picker.",
                "release_url": "https://github.com/f2025cs024-star/Tubegrab-4K"
            }).encode("utf-8"))
            return

        if parsed.path == "/config":
            self._send_cors(200)
            self.wfile.write(json.dumps({
                "version": "2.2.5",
                "min_version": "2.0.0",
                "supported_resolutions": ["4320", "2160", "1440", "1080", "720", "480", "360", "240", "144", "mp3"],
                "notice": ""
            }).encode("utf-8"))
            return

        if parsed.path == "/update":
            trigger_update_async()
            self._send_cors(200)
            self.wfile.write(json.dumps({"ok": True, "message": "Automatic update initiated in background"}).encode("utf-8"))
            return

        if parsed.path == "/shutdown":
            self._send_cors(200)
            self.wfile.write(json.dumps({"ok": True, "message": "Engine shutting down"}).encode("utf-8"))
            threading.Timer(0.8, perform_shutdown).start()
            return

        if parsed.path == "/open_folder":
            try:
                os.startfile(DOWNLOADS_DIR)
                self._send_cors(200)
                self.wfile.write(json.dumps({"ok": True}).encode("utf-8"))
            except Exception as e:
                self._send_cors(500)
                self.wfile.write(json.dumps({"ok": False, "error": str(e)}).encode("utf-8"))
            return

        self._send_cors(200)
        self.wfile.write(json.dumps({"status": "running", "app": "TubeGrab 4K Downloader"}).encode("utf-8"))

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == "/trigger":
            cancel_shutdown()
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
            try:
                payload = json.loads(raw)
            except Exception:
                payload = {}

            url = payload.get("url", "").strip()
            title = payload.get("title", "").strip()
            quality = payload.get("quality", "max")
            cookies_list = payload.get("cookies", [])

            if not url:
                self._send_cors(400)
                self.wfile.write(json.dumps({"ok": False, "error": "No URL provided"}).encode("utf-8"))
                return

            task_id = str(uuid.uuid4())[:8]
            t = threading.Thread(
                target=run_download_task,
                args=(task_id, url, title, quality, cookies_list),
                daemon=True
            )
            t.start()

            self._send_cors(200)
            self.wfile.write(json.dumps({
                "ok": True,
                "task_id": task_id,
                "save_dir": DOWNLOADS_DIR,
                "message": "Download started"
            }).encode("utf-8"))
            return

        self._send_cors(404)
        self.wfile.write(json.dumps({"ok": False, "error": "Not found"}).encode("utf-8"))


def main():
    global SERVER_INSTANCE
    try:
        ThreadingHTTPServer.allow_reuse_address = True
        server = ThreadingHTTPServer(("127.0.0.1", PORT), TubeGrabServer)
        SERVER_INSTANCE = server
        log(f"TubeGrab 4K engine listening on port {PORT}. Ready for instant downloads.")

        # Persistent resident helper - ready for instant 0ms requests

        server.serve_forever()
    except OSError:
        # Port 19876 already in use by active TubeGrab engine, exit silently
        sys.exit(0)


if __name__ == "__main__":
    main()
