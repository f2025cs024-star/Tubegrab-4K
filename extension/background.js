const DEFAULT_SERVER = "http://127.0.0.1:19876";
const activeBgTasks = new Map(); // taskId -> { title, url, serverUrl }

function getServerUrl(callback) {
  chrome.storage.sync.get(["serverUrl"], (res) => {
    callback(res.serverUrl || DEFAULT_SERVER);
  });
}

function getYouTubeCookies(callback) {
  try {
    chrome.cookies.getAll({ domain: "youtube.com" }, (cookies) => {
      callback(cookies || []);
    });
  } catch (e) {
    callback([]);
  }
}

// Show native desktop notification when download completes
function notifyCompletion(title) {
  try {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' rx='12' fill='%230f172a'/><polygon points='24,18 24,46 48,32' fill='%2322c55e'/></svg>",
      title: "OmniGrab 4K: Download Finished!",
      message: `${title || "YouTube Video"} has been saved to your Downloads folder.`,
      priority: 2
    });
  } catch (e) {}
}

// Background polling loop that keeps running even when switching or closing tabs
function monitorTaskInBackground(taskId, title, serverUrl) {
  if (activeBgTasks.has(taskId)) return;
  activeBgTasks.set(taskId, { title, serverUrl });

  const timer = setInterval(() => {
    fetch(`${serverUrl}/progress?id=${encodeURIComponent(taskId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data || data.status === "unknown") return;

        if (data.status === "finished") {
          clearInterval(timer);
          activeBgTasks.delete(taskId);

          // If on remote Render server, trigger Chrome native download
          if (!serverUrl.includes("127.0.0.1") && !serverUrl.includes("localhost")) {
            chrome.downloads.download({
              url: `${serverUrl}/get_file?id=${encodeURIComponent(taskId)}`,
              filename: (data.title || title || "video") + ".mp4"
            });
          }

          notifyCompletion(data.title || title);
        } else if (data.status === "error") {
          clearInterval(timer);
          activeBgTasks.delete(taskId);
        }
      })
      .catch(() => {
        // Retry silently
      });
  }, 1000);
}

function sendDownloadTrigger(url, title, quality, sendResponse) {
  getServerUrl((serverUrl) => {
    getYouTubeCookies((cookies) => {
      fetch(`${serverUrl}/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url,
          title: title || "",
          quality: quality || "max",
          cookies: cookies || []
        })
      })
        .then((res) => res.json())
        .then((data) => {
          if (data && data.task_id) {
            // Register task in persistent background service worker so it continues across tabs!
            monitorTaskInBackground(data.task_id, title, serverUrl);
          }
          sendResponse({ ok: true, data, serverUrl });
        })
        .catch((err) => sendResponse({ ok: false, error: err.message }));
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "trigger_idm_download") {
    sendDownloadTrigger(message.url, message.title, message.quality, sendResponse);
    return true;
  }

  if (message.action === "check_progress") {
    getServerUrl((serverUrl) => {
      fetch(`${serverUrl}/progress?id=${encodeURIComponent(message.taskId)}`)
        .then((res) => res.json())
        .then((data) => sendResponse({ ok: true, data, serverUrl }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
    });
    return true;
  }

  if (message.action === "open_downloads_folder") {
    getServerUrl((serverUrl) => {
      fetch(`${serverUrl}/open_folder`)
        .then((res) => res.json())
        .then((data) => sendResponse({ ok: true, data }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
    });
    return true;
  }
});
