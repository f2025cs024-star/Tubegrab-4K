const DEFAULT_SERVER = "http://127.0.0.1:19876";

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
        .then((data) => sendResponse({ ok: true, data, serverUrl }))
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
        .then((data) => {
          // If remote Render server finished downloading, trigger Chrome native download
          if (data && data.status === "finished" && !data.browser_download_triggered && !serverUrl.includes("127.0.0.1") && !serverUrl.includes("localhost")) {
            data.browser_download_triggered = true;
            try {
              chrome.downloads.download({
                url: `${serverUrl}/get_file?id=${encodeURIComponent(message.taskId)}`,
                filename: data.title ? `${data.title}.mp4` : "video.mp4"
              });
            } catch (e) {}
          }
          sendResponse({ ok: true, data, serverUrl });
        })
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

chrome.action.onClicked.addListener((tab) => {
  if (tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, { action: "show_or_trigger_bar" }, (res) => {
      if (chrome.runtime.lastError) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"]
        }, () => {
          chrome.scripting.insertCSS({
            target: { tabId: tab.id },
            files: ["content.css"]
          });
        });
      }
    });
  }
});
