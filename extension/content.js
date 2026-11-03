(function () {
  let isBarClosedByUser = false;
  let lastCheckedUrl = "";
  let activePollTimer = null;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let initialBarX = 0;
  let initialBarY = 0;
  let hasUserDragged = false;

  function isFullscreen() {
    return !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement ||
      document.querySelector(".ytp-fullscreen")
    );
  }

  function showToast(msg, isError = false) {
    let toast = document.getElementById("idm-4k-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "idm-4k-toast";
      document.body.appendChild(toast);
    }
    toast.style.borderColor = isError ? "#ef4444" : "#38bdf8";
    toast.innerHTML = msg;
    toast.style.display = "block";
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.style.display = "none";
    }, 4000);
  }

  function startProgressTracking(taskId) {
    const bar = document.getElementById("idm-4k-floating-bar");
    if (!bar) return;

    bar.innerHTML = `
      <div class="idm-drag-handle" title="Drag to move">⠿</div>
      <div class="idm-progress-compact">
        <span id="idm-pct-lbl">0%</span>
        <div class="idm-progress-compact-bar">
          <div class="idm-progress-compact-fill" id="idm-fill"></div>
        </div>
      </div>
      <div class="idm-4k-small-btn" id="idm-reset-btn" title="Cancel/Reset">✕</div>
    `;

    document.getElementById("idm-reset-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      clearInterval(activePollTimer);
      rebuildBar();
    });

    makeDraggable(bar);

    if (activePollTimer) clearInterval(activePollTimer);

    activePollTimer = setInterval(() => {
      chrome.runtime.sendMessage(
        { action: "check_progress", taskId: taskId },
        (res) => {
          if (!res || !res.ok || !res.data) return;
          const d = res.data;
          const fill = document.getElementById("idm-fill");
          const pctLbl = document.getElementById("idm-pct-lbl");

          if (!fill || !pctLbl) return;

          if (d.status === "downloading") {
            const pct = d.percent || 0;
            fill.style.width = pct + "%";
            pctLbl.textContent = pct + "%";
          } else if (d.status === "merging") {
            fill.style.width = "99%";
            pctLbl.textContent = "99%";
          } else if (d.status === "finished") {
            clearInterval(activePollTimer);
            fill.style.width = "100%";
            bar.innerHTML = `
              <div class="idm-drag-handle" title="Drag to move">⠿</div>
              <div class="idm-progress-compact" style="background:#064e3b;border-color:#10b981;cursor:pointer;" id="idm-open-folder" title="Click to open Downloads folder!">
                <span style="color:#34d399;">✓ Done! [Open]</span>
              </div>
              <div class="idm-4k-small-btn" id="idm-reset-btn" title="Back">✕</div>
            `;
            makeDraggable(bar);
            document.getElementById("idm-open-folder").addEventListener("click", () => {
              chrome.runtime.sendMessage({ action: "open_downloads_folder" });
            });
            document.getElementById("idm-reset-btn").addEventListener("click", (e) => {
              e.stopPropagation();
              rebuildBar();
            });
            showToast("✓ Download complete in <b>Max Quality</b>! Saved to Downloads.", false);
          } else if (d.status === "error") {
            clearInterval(activePollTimer);
            showToast("Notice: " + (d.error || "Download error"), true);
            setTimeout(rebuildBar, 3000);
          }
        }
      );
    }, 500);
  }

  function triggerDownload() {
    const videoUrl = window.location.href;
    const pageTitle = document.title.replace(/ - YouTube$/i, "").trim();

    showToast("Starting Max Quality download...", false);

    chrome.runtime.sendMessage(
      {
        action: "trigger_idm_download",
        url: videoUrl,
        title: pageTitle,
        quality: "max"
      },
      (response) => {
        if (chrome.runtime.lastError || !response || !response.ok) {
          showToast(
            "Service starting... If needed, run <b>IDM 4K Downloader</b> on Desktop.",
            true
          );
        } else {
          showToast("⏬ Downloading in <b>Max Available Quality</b>!", false);
          if (response.data && response.data.task_id) {
            startProgressTracking(response.data.task_id);
          }
        }
      }
    );
  }

  function makeDraggable(el) {
    const handle = el.querySelector(".idm-drag-handle") || el;

    handle.onmousedown = function (e) {
      if (e.target.id === "idm-4k-main-btn" || e.target.classList.contains("idm-4k-small-btn") || e.target.id === "idm-open-folder") {
        return;
      }
      e.preventDefault();
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;

      const rect = el.getBoundingClientRect();
      initialBarX = rect.left;
      initialBarY = rect.top;

      document.onmousemove = function (ev) {
        if (!isDragging) return;
        const dx = ev.clientX - dragStartX;
        const dy = ev.clientY - dragStartY;
        const newLeft = Math.max(5, Math.min(window.innerWidth - el.offsetWidth - 5, initialBarX + dx));
        const newTop = Math.max(5, Math.min(window.innerHeight - el.offsetHeight - 5, initialBarY + dy));

        el.style.left = `${newLeft}px`;
        el.style.top = `${newTop}px`;
        hasUserDragged = true;
      };

      document.onmouseup = function () {
        if (isDragging) {
          isDragging = false;
          document.onmousemove = null;
          document.onmouseup = null;
          try {
            localStorage.setItem(
              "idm_user_pos",
              JSON.stringify({ left: el.style.left, top: el.style.top })
            );
          } catch (e) {}
        }
      };
    };

    handle.ondblclick = function (e) {
      e.stopPropagation();
      hasUserDragged = false;
      try {
        localStorage.removeItem("idm_user_pos");
      } catch (err) {}
      positionBarAtVideoSide(el);
      showToast("Position reset to video side.");
    };
  }

  function positionBarAtVideoSide(bar) {
    if (isFullscreen()) {
      bar.style.display = "none";
      return;
    }

    if (hasUserDragged) return;

    try {
      const saved = localStorage.getItem("idm_user_pos");
      if (saved) {
        const pos = JSON.parse(saved);
        if (pos.left && pos.top) {
          bar.style.left = pos.left;
          bar.style.top = pos.top;
          hasUserDragged = true;
          return;
        }
      }
    } catch (e) {}

    const player =
      document.querySelector("#movie_player") ||
      document.querySelector("ytd-player") ||
      document.querySelector("video");

    if (player) {
      const rect = player.getBoundingClientRect();
      if (rect.width > 200 && rect.height > 100) {
        const topPos = Math.max(62, rect.top + 10);
        const leftPos = Math.max(10, rect.right - bar.offsetWidth - 14);
        bar.style.top = `${topPos}px`;
        bar.style.left = `${leftPos}px`;
        return;
      }
    }

    bar.style.top = "66px";
    bar.style.right = "20px";
  }

  function rebuildBar() {
    const bar = document.getElementById("idm-4k-floating-bar");
    if (!bar) return;

    bar.innerHTML = "";

    const dragHandle = document.createElement("div");
    dragHandle.className = "idm-drag-handle";
    dragHandle.title = "Drag to reposition (Double click to reset)";
    dragHandle.textContent = "⠿";

    const mainBtn = document.createElement("div");
    mainBtn.id = "idm-4k-main-btn";
    mainBtn.title = "Download in Max Quality (Shortcut: Alt+D)";

    const icon = document.createElement("span");
    icon.className = "idm-4k-play-icon";

    const label = document.createElement("span");
    label.textContent = "Download this video";

    mainBtn.appendChild(icon);
    mainBtn.appendChild(label);

    mainBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      triggerDownload();
    });

    const helpBtn = document.createElement("div");
    helpBtn.className = "idm-4k-small-btn";
    helpBtn.textContent = "?";
    helpBtn.title = "Downloads in Maximum Quality (4K/HD). Press Alt+D anytime!";
    helpBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      showToast("💡 <b>Max Quality Downloader</b>: Drag <b>⠿</b> to move. Press <b>Alt+D</b> for instant download!");
    });

    const closeBtn = document.createElement("div");
    closeBtn.className = "idm-4k-small-btn";
    closeBtn.textContent = "✕";
    closeBtn.title = "Hide button for this video";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      isBarClosedByUser = true;
      bar.style.display = "none";
    });

    bar.appendChild(dragHandle);
    bar.appendChild(mainBtn);
    bar.appendChild(helpBtn);
    bar.appendChild(closeBtn);

    makeDraggable(bar);
  }

  function createFloatingBar() {
    let bar = document.getElementById("idm-4k-floating-bar");
    if (bar) return bar;

    bar = document.createElement("div");
    bar.id = "idm-4k-floating-bar";
    document.body.appendChild(bar);

    rebuildBar();
    positionBarAtVideoSide(bar);
    return bar;
  }

  function updateUi() {
    const isVideoPage =
      window.location.pathname.startsWith("/watch") ||
      window.location.pathname.startsWith("/shorts");

    let bar = document.getElementById("idm-4k-floating-bar");

    if (!isVideoPage) {
      if (bar) bar.style.display = "none";
      return;
    }

    if (isFullscreen()) {
      if (bar) bar.style.display = "none";
      return;
    }

    const curr = window.location.href;
    if (curr !== lastCheckedUrl) {
      lastCheckedUrl = curr;
      isBarClosedByUser = false;
      if (activePollTimer) clearInterval(activePollTimer);
    }

    if (!isBarClosedByUser) {
      if (!bar) bar = createFloatingBar();
      bar.style.display = "flex";
      positionBarAtVideoSide(bar);
    }
  }

  // Keyboard shortcut: Alt + D
  window.addEventListener("keydown", (e) => {
    if (e.altKey && (e.key === "d" || e.key === "D")) {
      e.preventDefault();
      triggerDownload();
    }
  });

  // Listen to message from extension icon click
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "show_or_trigger_bar") {
      isBarClosedByUser = false;
      let bar = document.getElementById("idm-4k-floating-bar");
      if (!bar) bar = createFloatingBar();
      bar.style.display = "flex";
      rebuildBar();
      positionBarAtVideoSide(bar);
      bar.style.boxShadow = "0 0 15px #38bdf8";
      setTimeout(() => {
        if (bar) bar.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.45)";
      }, 1500);
      showToast("Download button ready! Click to download in <b>Max Quality</b>.");
      sendResponse({ ok: true });
    }
  });

  ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange"].forEach((evt) => {
    document.addEventListener(evt, updateUi);
  });

  window.addEventListener("resize", () => {
    const bar = document.getElementById("idm-4k-floating-bar");
    if (bar && !hasUserDragged) positionBarAtVideoSide(bar);
  });

  window.addEventListener("scroll", () => {
    const bar = document.getElementById("idm-4k-floating-bar");
    if (bar && !hasUserDragged) positionBarAtVideoSide(bar);
  }, true);

  window.addEventListener("yt-navigate-finish", updateUi);
  window.addEventListener("spfdone", updateUi);
  window.addEventListener("DOMContentLoaded", updateUi);
  window.addEventListener("load", updateUi);

  setInterval(updateUi, 800);
})();
