const DEFAULT_SERVER = "http://127.0.0.1:19876";
const activeBgTasks = new Map();

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

function notifyCompletion(title) {
  try {
    chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL("icon.png"),
      title: "OmniGrab 4K: Download Finished!",
      message: `${title || "YouTube Video"} has been saved to your Downloads folder.`,
      priority: 2
    });
  } catch (e) {}
}

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

          if (!serverUrl.includes("127.0.0.1") && !serverUrl.includes("localhost")) {
            try {
              chrome.downloads.download({
                url: `${serverUrl}/get_file?id=${encodeURIComponent(taskId)}`,
                filename: (data.title || title || "video") + ".mp4"
              });
            } catch (e) {}
          }

          notifyCompletion(data.title || title);
        } else if (data.status === "error") {
          clearInterval(timer);
          activeBgTasks.delete(taskId);
        }
      })
      .catch(() => {});
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
            monitorTaskInBackground(data.task_id, title, serverUrl);
          }
          try { sendResponse({ ok: true, data, serverUrl }); } catch (e) {}
        })
        .catch((err) => {
          try { sendResponse({ ok: false, error: err.message }); } catch (e) {}
        });
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
        .then((data) => {
          try { sendResponse({ ok: true, data, serverUrl }); } catch (e) {}
        })
        .catch((err) => {
          try { sendResponse({ ok: false, error: err.message }); } catch (e) {}
        });
    });
    return true;
  }

  if (message.action === "open_downloads_folder") {
    getServerUrl((serverUrl) => {
      fetch(`${serverUrl}/open_folder`)
        .then((res) => res.json())
        .then((data) => {
          try { sendResponse({ ok: true, data }); } catch (e) {}
        })
        .catch((err) => {
          try { sendResponse({ ok: false, error: err.message }); } catch (e) {}
        });
    });
    return true;
  }
});
