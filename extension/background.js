const LOCAL_SERVER = "http://127.0.0.1:19876";
const CLOUD_SERVER = "https://tubegrab-4k.onrender.com";
const activeBgTasks = new Map();

function wakeLocalHelper() {
  try {
    chrome.tabs.create({ url: "tubegrab://start", active: false }, (tab) => {
      setTimeout(() => {
        if (tab && tab.id) chrome.tabs.remove(tab.id);
      }, 500);
    });
  } catch (e) {}
}

function getServerUrl(callback) {
  // Always prefer local desktop engine if online (zero bot checks, max home internet speed)
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 600);
  fetch("http://127.0.0.1:19876/status", { signal: ctrl.signal })
    .then((r) => {
      clearTimeout(tid);
      if (r.ok) {
        callback(LOCAL_SERVER);
      } else {
        attemptWakeAndCallback(callback);
      }
    })
    .catch(() => {
      clearTimeout(tid);
      attemptWakeAndCallback(callback);
    });
}

function attemptWakeAndCallback(callback) {
  wakeLocalHelper();

  let attempts = 0;
  const poll = setInterval(() => {
    attempts++;
    fetch("http://127.0.0.1:19876/status")
      .then((r) => {
        if (r.ok) {
          clearInterval(poll);
          callback(LOCAL_SERVER);
        } else if (attempts >= 25) {
          clearInterval(poll);
          chrome.storage.sync.get(["serverUrl"], (res) => {
            callback(res.serverUrl || LOCAL_SERVER);
          });
        }
      })
      .catch(() => {
        if (attempts >= 25) {
          clearInterval(poll);
          chrome.storage.sync.get(["serverUrl"], (res) => {
            callback(res.serverUrl || LOCAL_SERVER);
          });
        }
      });
  }, 150);
}

function getYouTubeCookies(callback) {
  try {
    chrome.cookies.getAll({ url: "https://www.youtube.com" }, (c1) => {
      chrome.cookies.getAll({ domain: ".youtube.com" }, (c2) => {
        const cookieMap = new Map();
        (c1 || []).forEach((c) => cookieMap.set(c.name + "@" + c.domain, c));
        (c2 || []).forEach((c) => cookieMap.set(c.name + "@" + c.domain, c));
        callback(Array.from(cookieMap.values()));
      });
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
  if (activeBgTasks.has(taskId) && activeBgTasks.get(taskId).monitoring) return;
  activeBgTasks.set(taskId, { title, serverUrl, monitoring: true });

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
                filename: (data.title || title || "video").replace(/[\\/:*?"<>|]/g, "_") + ".mp4",
                saveAs: false
              });
            } catch (e) {}
          }

          notifyCompletion(data.title || title);

          // If all downloads are finished and using local engine, signal clean shutdown
          if (activeBgTasks.size === 0 && (serverUrl.includes("127.0.0.1") || serverUrl.includes("localhost"))) {
            setTimeout(() => {
              if (activeBgTasks.size === 0) {
                fetch(`${serverUrl}/shutdown`).catch(() => {});
              }
            }, 5000);
          }
        } else if (data.status === "error") {
          clearInterval(timer);
          activeBgTasks.delete(taskId);

          if (activeBgTasks.size === 0 && (serverUrl.includes("127.0.0.1") || serverUrl.includes("localhost"))) {
            setTimeout(() => {
              if (activeBgTasks.size === 0) {
                fetch(`${serverUrl}/shutdown`).catch(() => {});
              }
            }, 5000);
          }
        }
      })
      .catch(() => {});
  }, 1000);
}

function sendDownloadTrigger(url, title, quality, sendResponse) {
  getServerUrl((serverUrl) => {
    getYouTubeCookies((cookies) => {
      const payload = {
        url: url,
        title: title || "",
        quality: quality || "max",
        cookies: cookies || []
      };

      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 60000);

      fetch(`${serverUrl}/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ctrl.signal
      })
        .then((res) => res.json())
        .then((data) => {
          clearTimeout(tid);
          if (data && data.task_id) {
            activeBgTasks.set(data.task_id, { url, title, quality, serverUrl, monitoring: false });
            monitorTaskInBackground(data.task_id, title, serverUrl);
          }
          try { sendResponse({ ok: true, data, serverUrl }); } catch (e) {}
        })
        .catch((err) => {
          clearTimeout(tid);
          if (serverUrl !== CLOUD_SERVER) {
            fetch(`${CLOUD_SERVER}/trigger`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
            })
              .then((r) => r.json())
              .then((data) => {
                if (data && data.task_id) {
                  activeBgTasks.set(data.task_id, { url, title, quality, serverUrl: CLOUD_SERVER, monitoring: false });
                  monitorTaskInBackground(data.task_id, title, CLOUD_SERVER);
                }
                try { sendResponse({ ok: true, data, serverUrl: CLOUD_SERVER }); } catch (e) {}
              })
              .catch((e2) => {
                try { sendResponse({ ok: false, error: e2.message }); } catch (e3) {}
              });
          } else {
            try { sendResponse({ ok: false, error: err.message }); } catch (e) {}
          }
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
    let sUrl = message.serverUrl;
    if (!sUrl && activeBgTasks.has(message.taskId)) {
      sUrl = activeBgTasks.get(message.taskId).serverUrl;
    }
    const queryServer = (targetUrl) => {
      fetch(`${targetUrl}/progress?id=${encodeURIComponent(message.taskId)}`)
        .then((res) => res.json())
        .then((data) => {
          try { sendResponse({ ok: true, data, serverUrl: targetUrl }); } catch (e) {}
        })
        .catch((err) => {
          try { sendResponse({ ok: false, error: err.message }); } catch (e) {}
        });
    };
    if (sUrl) {
      queryServer(sUrl);
    } else {
      getServerUrl((targetUrl) => queryServer(targetUrl));
    }
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
  // Check official cloud release endpoint first
  fetch("https://tubegrab-4k-talha-950a.vercel.app/version.json")
    .then((res) => res.json())
    .then((data) => handleVersionData(data))
    .catch(() => {
      // Fallback to local/configured server
      getServerUrl((serverUrl) => {
        fetch(`${serverUrl}/version`)
          .then((res) => res.json())
          .then((data) => handleVersionData(data))
          .catch(() => {});
      });
    });
}

function handleVersionData(data) {
  if (!data || !data.version) return;
  const currentVersion = chrome.runtime.getManifest().version;
  if (isNewerVersion(data.version, currentVersion)) {
    chrome.storage.local.get(["lastNotifiedVersion"], (res) => {
      if (res.lastNotifiedVersion !== data.version) {
        chrome.storage.local.set({
          lastNotifiedVersion: data.version,
          hasUpdate: true,
          latestVersion: data.version,
          changelog: Array.isArray(data.changelog) ? data.changelog.join("; ") : (data.changelog || "")
        });
        try {
          const changeSummary = Array.isArray(data.changelog) ? data.changelog[0] : (data.changelog || "Click to update to latest version.");
          chrome.notifications.create("tubegrab_update_" + data.version, {
            type: "basic",
            iconUrl: chrome.runtime.getURL("icon.png"),
            title: `⚡ TubeGrab 4K Update (v${data.version}) Available!`,
            message: changeSummary,
            priority: 2
          });
        } catch (e) {}
      }
    });
  }
}

function reInjectActiveTabs() {
  chrome.tabs.query({ url: "*://*.youtube.com/*" }, (tabs) => {
    for (const tab of tabs || []) {
      if (tab.id) {
        chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ["content.css"]
        }).catch(() => {});
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"]
        }).catch(() => {});
      }
    }
  });
}

chrome.notifications.onClicked.addListener((notifId) => {
  if (notifId && (notifId.startsWith("tubegrab_update_") || notifId.startsWith("omnigrab_update_"))) {
    getServerUrl((serverUrl) => {
      fetch(`${serverUrl}/version`)
        .then((res) => res.json())
        .then((data) => {
          const url = data.release_url || "https://github.com/f2025cs024-star/Tubegrab-4K";
          chrome.tabs.create({ url: url });
        })
        .catch(() => {
          chrome.tabs.create({ url: "https://github.com/f2025cs024-star/Tubegrab-4K" });
        });
    });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(["serverUrl"], (res) => {
    if (res.serverUrl && res.serverUrl.includes("render.com")) {
      chrome.storage.sync.set({ serverUrl: LOCAL_SERVER });
    }
  });
  reInjectActiveTabs();
  setTimeout(checkForUpdates, 3000);
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.sync.get(["serverUrl"], (res) => {
    if (res.serverUrl && res.serverUrl.includes("render.com")) {
      chrome.storage.sync.set({ serverUrl: LOCAL_SERVER });
    }
  });
  setTimeout(checkForUpdates, 3000);
});

setInterval(checkForUpdates, 2 * 60 * 60 * 1000);
setTimeout(checkForUpdates, 5000);
