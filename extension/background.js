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
      title: "TubeGrab 4K: Download Finished!",
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
            activeBgTasks.set(data.task_id, { url, title, quality, serverUrl });
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

  if (message.action === "get_active_task_for_url") {
    let match = null;
    for (const [taskId, info] of activeBgTasks.entries()) {
      if (info.url === message.url) {
        match = { taskId, ...info };
        break;
      }
    }
    try { sendResponse({ task: match }); } catch (e) {}
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

  if (message.action === "check_for_updates") {
    checkForUpdates();
    sendResponse({ ok: true });
    return true;
  }
});

function isNewerVersion(remote, local) {
  if (!remote || !local) return false;
  const r = remote.replace(/^v/i, "").split(".").map(Number);
  const l = local.replace(/^v/i, "").split(".").map(Number);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const rNum = r[i] || 0;
    const lNum = l[i] || 0;
    if (rNum > lNum) return true;
    if (rNum < lNum) return false;
  }
  return false;
}

function checkForUpdates() {
  getServerUrl((serverUrl) => {
    fetch(`${serverUrl}/version`)
      .then((res) => res.json())
      .then((data) => {
        if (!data || !data.version) return;
        const currentVersion = chrome.runtime.getManifest().version;
        if (isNewerVersion(data.version, currentVersion)) {
          chrome.storage.local.get(["lastNotifiedVersion"], (res) => {
            if (res.lastNotifiedVersion !== data.version) {
              chrome.storage.local.set({ lastNotifiedVersion: data.version });
              try {
                chrome.notifications.create("tubegrab_update_" + data.version, {
                  type: "basic",
                  iconUrl: chrome.runtime.getURL("icon.png"),
                  title: `⚡ TubeGrab 4K Update (v${data.version}) Available!`,
                  message: data.changelog || "A new update is available. Click to view the update.",
                  priority: 2
                });
              } catch (e) {}
            }
          });
        }
      })
      .catch(() => {});
  });
}

chrome.notifications.onClicked.addListener((notifId) => {
  if (notifId && (notifId.startsWith("tubegrab_update_") || notifId.startsWith("omnigrab_update_"))) {
    getServerUrl((serverUrl) => {
      fetch(`${serverUrl}/version`)
        .then((res) => res.json())
        .then((data) => {
          const url = data.release_url || "https://github.com";
          chrome.tabs.create({ url: url });
        })
        .catch(() => {
          chrome.tabs.create({ url: "https://github.com" });
        });
    });
  }
});

// Check for updates on startup, install, and periodically every 2 hours
chrome.runtime.onInstalled.addListener(() => {
  setTimeout(checkForUpdates, 3000);
});

chrome.runtime.onStartup.addListener(() => {
  setTimeout(checkForUpdates, 3000);
});

setInterval(checkForUpdates, 2 * 60 * 60 * 1000);
setTimeout(checkForUpdates, 5000);
