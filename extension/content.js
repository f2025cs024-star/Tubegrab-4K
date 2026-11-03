(function () {
  let isPillClosedByUser = false;
  let lastCheckedUrl = "";
  let activePollTimer = null;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let initialPillX = 0;
  let initialPillY = 0;
  let hasUserDragged = false;
  let isMenuOpen = false;

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
    let toast = document.getElementById("omnigrab-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "omnigrab-toast";
      document.body.appendChild(toast);
    }
    toast.style.borderColor = isError ? "rgba(239, 68, 68, 0.7)" : "rgba(56, 189, 248, 0.6)";
    toast.innerHTML = msg;
    toast.style.display = "block";
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.style.display = "none";
    }, 4000);
  }

  // Detect specific video's available qualities directly from YouTube Player
  function detectAvailableQualities() {
    const player = document.getElementById("movie_player");
    let levels = [];
    if (player && typeof player.getAvailableQualityLevels === "function") {
      levels = player.getAvailableQualityLevels() || [];
    }

    const qualityMap = [
      { key: "highres", label: "4K / 8K Ultra HD", val: "2160", badge: "4K", cls: "omni-badge-4k" },
      { key: "hd2160", label: "4K Ultra HD (2160p)", val: "2160", badge: "4K", cls: "omni-badge-4k" },
      { key: "hd1440", label: "2K QHD (1440p)", val: "1440", badge: "2K", cls: "omni-badge-hd" },
      { key: "hd1080", label: "Full HD (1080p)", val: "1080", badge: "FHD", cls: "omni-badge-hd" },
      { key: "hd720", label: "HD (720p)", val: "720", badge: "HD", cls: "omni-badge-hd" },
      { key: "large", label: "SD (480p)", val: "480", badge: "480p", cls: "omni-badge-hd" },
      { key: "medium", label: "SD (360p)", val: "360", badge: "360p", cls: "omni-badge-hd" }
    ];

    let found = [];
    if (levels.length > 0) {
      const addedVals = new Set();
      qualityMap.forEach((q) => {
        if (levels.includes(q.key) && !addedVals.has(q.val)) {
          addedVals.add(q.val);
          found.push(q);
        }
      });
    }

    // Default fallback if player API hasn't loaded yet
    if (found.length === 0) {
      found = [
        { label: "4K Ultra HD (2160p)", val: "2160", badge: "4K", cls: "omni-badge-4k" },
        { label: "Full HD (1080p)", val: "1080", badge: "FHD", cls: "omni-badge-hd" },
        { label: "HD (720p)", val: "720", badge: "HD", cls: "omni-badge-hd" }
      ];
    }

    return found;
  }

  function startProgressTracking(taskId) {
    const pill = document.getElementById("omnigrab-pill");
    if (!pill) return;

    pill.innerHTML = `
      <div class="omni-drag-grip" title="Drag to move">⠿</div>
      <div class="omni-progress-mode">
        <span class="omni-progress-text" id="omni-pct-lbl">0%</span>
        <div class="omni-progress-track">
          <div class="omni-progress-fill" id="omni-fill"></div>
        </div>
      </div>
      <div class="omni-close-btn" id="omni-reset-btn" title="Cancel/Reset">✕</div>
    `;

    document.getElementById("omni-reset-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      clearInterval(activePollTimer);
      rebuildPill();
    });

    makeDraggable(pill);

    if (activePollTimer) clearInterval(activePollTimer);

    activePollTimer = setInterval(() => {
      chrome.runtime.sendMessage(
        { action: "check_progress", taskId: taskId },
        (res) => {
          if (!res || !res.ok || !res.data) return;
          const d = res.data;
          const fill = document.getElementById("omni-fill");
          const pctLbl = document.getElementById("omni-pct-lbl");

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
            pill.innerHTML = `
              <div class="omni-drag-grip" title="Drag to move">⠿</div>
              <div class="omni-main-btn" style="background:rgba(16,185,129,0.25);border-color:#10b981;color:#34d399;" id="omni-open-folder" title="Click to open Downloads folder">
                <span>✓ Complete! [Open]</span>
              </div>
              <div class="omni-close-btn" id="omni-reset-btn" title="Back">✕</div>
            `;
            makeDraggable(pill);
            document.getElementById("omni-open-folder").addEventListener("click", () => {
              chrome.runtime.sendMessage({ action: "open_downloads_folder" });
            });
            document.getElementById("omni-reset-btn").addEventListener("click", (e) => {
              e.stopPropagation();
              rebuildPill();
            });
            showToast("✓ Download complete! Saved into <b>Downloads</b> folder.", false);
          } else if (d.status === "error") {
            clearInterval(activePollTimer);
            showToast("Download notice: " + (d.error || "Error"), true);
            setTimeout(rebuildPill, 3000);
          }
        }
      );
    }, 500);
  }

  function triggerDownload(quality = "max") {
    const videoUrl = window.location.href;
    const pageTitle = document.title.replace(/ - YouTube$/i, "").trim();

    closeDropdown();
    showToast("Starting download... Runs in background even if you switch tabs!", false);

    chrome.runtime.sendMessage(
      {
        action: "trigger_idm_download",
        url: videoUrl,
        title: pageTitle,
        quality: quality
      },
      (response) => {
        if (chrome.runtime.lastError || !response || !response.ok) {
          showToast(
            "Service connecting... Runs in background automatically.",
            true
          );
        } else {
          showToast("⏬ Downloading in background!", false);
          if (response.data && response.data.task_id) {
            startProgressTracking(response.data.task_id);
          }
        }
      }
    );
  }

  function toggleDropdown() {
    let menu = document.getElementById("omnigrab-dropdown-menu");
    if (!menu) {
      menu = document.createElement("div");
      menu.id = "omnigrab-dropdown-menu";
      document.body.appendChild(menu);
    }

    if (isMenuOpen) {
      closeDropdown();
      return;
    }

    const pill = document.getElementById("omnigrab-pill");
    if (!pill) return;

    const rect = pill.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 6}px`;
    menu.style.left = `${Math.min(window.innerWidth - 200, rect.left)}px`;

    const qualities = detectAvailableQualities();

    let itemsHtml = `
      <div class="omni-menu-header">Available for this video</div>
      <div class="omni-menu-item" data-val="max">
        <span>✨ Auto Max Quality</span>
        <span class="omni-badge-max">BEST</span>
      </div>
    `;

    qualities.forEach((q) => {
      itemsHtml += `
        <div class="omni-menu-item" data-val="${q.val}">
          <span>${q.label}</span>
          <span class="${q.cls}">${q.badge}</span>
        </div>
      `;
    });

    itemsHtml += `
      <div class="omni-menu-item" data-val="mp3">
        <span>🎵 Audio (MP3 320k)</span>
        <span class="omni-badge-audio">MP3</span>
      </div>
    `;

    menu.innerHTML = itemsHtml;
    menu.style.display = "flex";
    isMenuOpen = true;

    menu.querySelectorAll(".omni-menu-item").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        triggerDownload(el.getAttribute("data-val"));
      });
    });
  }

  function closeDropdown() {
    const menu = document.getElementById("omnigrab-dropdown-menu");
    if (menu) menu.style.display = "none";
    isMenuOpen = false;
  }

  function makeDraggable(el) {
    const grip = el.querySelector(".omni-drag-grip") || el;

    grip.onmousedown = function (e) {
      if (e.target.closest(".omni-main-btn") || e.target.closest(".omni-chevron-btn") || e.target.closest(".omni-close-btn")) {
        return;
      }
      e.preventDefault();
      closeDropdown();
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;

      const rect = el.getBoundingClientRect();
      initialPillX = rect.left;
      initialPillY = rect.top;

      document.onmousemove = function (ev) {
        if (!isDragging) return;
        const dx = ev.clientX - dragStartX;
        const dy = ev.clientY - dragStartY;
        const newLeft = Math.max(8, Math.min(window.innerWidth - el.offsetWidth - 8, initialPillX + dx));
        const newTop = Math.max(8, Math.min(window.innerHeight - el.offsetHeight - 8, initialPillY + dy));

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
              "omnigrab_pos",
              JSON.stringify({ left: el.style.left, top: el.style.top })
            );
          } catch (e) {}
        }
      };
    };

    grip.ondblclick = function (e) {
      e.stopPropagation();
      hasUserDragged = false;
      try {
        localStorage.removeItem("omnigrab_pos");
      } catch (err) {}
      positionPillAtVideoSide(el);
      showToast("Position reset to video side.");
    };
  }

  function positionPillAtVideoSide(pill) {
    if (isFullscreen()) {
      pill.style.display = "none";
      return;
    }

    if (hasUserDragged) return;

    try {
      const saved = localStorage.getItem("omnigrab_pos");
      if (saved) {
        const pos = JSON.parse(saved);
        if (pos.left && pos.top) {
          pill.style.left = pos.left;
          pill.style.top = pos.top;
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
        const leftPos = Math.max(10, rect.right - pill.offsetWidth - 14);
        pill.style.top = `${topPos}px`;
        pill.style.left = `${leftPos}px`;
        return;
      }
    }

    pill.style.top = "66px";
    pill.style.right = "20px";
  }

  function rebuildPill() {
    const pill = document.getElementById("omnigrab-pill");
    if (!pill) return;

    pill.innerHTML = `
      <div class="omni-drag-grip" title="Drag to move (Double-click to reset)">⠿</div>
      <div class="omni-main-btn" id="omni-main-btn" title="Download in Max Quality (Shortcut: Alt+D)">
        <span class="omni-play-icon"></span>
        <span>Download</span>
      </div>
      <div class="omni-chevron-btn" id="omni-chevron-btn" title="Choose specific video quality">▾</div>
      <div class="omni-close-btn" id="omni-close-btn" title="Hide button for this video">✕</div>
    `;

    document.getElementById("omni-main-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      triggerDownload("max");
    });

    document.getElementById("omni-chevron-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleDropdown();
    });

    document.getElementById("omni-close-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      isPillClosedByUser = true;
      closeDropdown();
      pill.style.display = "none";
    });

    makeDraggable(pill);
  }

  function createPill() {
    let pill = document.getElementById("omnigrab-pill");
    if (pill) return pill;

    pill = document.createElement("div");
    pill.id = "omnigrab-pill";
    document.body.appendChild(pill);

    rebuildPill();
    positionPillAtVideoSide(pill);
    return pill;
  }

  function updateUi() {
    const isVideoPage =
      window.location.pathname.startsWith("/watch") ||
      window.location.pathname.startsWith("/shorts");

    let pill = document.getElementById("omnigrab-pill");

    if (!isVideoPage || isFullscreen()) {
      if (pill) pill.style.display = "none";
      closeDropdown();
      return;
    }

    const curr = window.location.href;
    if (curr !== lastCheckedUrl) {
      lastCheckedUrl = curr;
      isPillClosedByUser = false;
      closeDropdown();
      if (activePollTimer) clearInterval(activePollTimer);
    }

    if (!isPillClosedByUser) {
      if (!pill) pill = createPill();
      pill.style.display = "flex";
      positionPillAtVideoSide(pill);
    }
  }

  // Alt + D shortcut
  window.addEventListener("keydown", (e) => {
    if (e.altKey && (e.key === "d" || e.key === "D")) {
      e.preventDefault();
      triggerDownload("max");
    }
  });

  // Close dropdown on outside click
  document.addEventListener("click", (e) => {
    if (isMenuOpen && !e.target.closest("#omnigrab-dropdown-menu") && !e.target.closest("#omni-chevron-btn")) {
      closeDropdown();
    }
  });

  // Fullscreen detection
  ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange"].forEach((evt) => {
    document.addEventListener(evt, updateUi);
  });

  window.addEventListener("resize", () => {
    const pill = document.getElementById("omnigrab-pill");
    if (pill && !hasUserDragged) positionPillAtVideoSide(pill);
    closeDropdown();
  });

  window.addEventListener("scroll", () => {
    const pill = document.getElementById("omnigrab-pill");
    if (pill && !hasUserDragged) positionPillAtVideoSide(pill);
    closeDropdown();
  }, true);

  window.addEventListener("yt-navigate-finish", updateUi);
  window.addEventListener("spfdone", updateUi);
  window.addEventListener("DOMContentLoaded", updateUi);
  window.addEventListener("load", updateUi);

  setInterval(updateUi, 800);
})();
