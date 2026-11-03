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

  let detectedHeights = [];
  let maxLabel = "HD";

  function injectQualityReader() {
    const s = document.createElement("script");
    s.id = "omnigrab-bridge";
    s.textContent = `
      (function() {
        function probeQualities() {
          try {
            let heights = new Set();
            let r = window.ytInitialPlayerResponse;
            if (r && r.streamingData && r.streamingData.adaptiveFormats) {
              r.streamingData.adaptiveFormats.forEach(f => {
                if (f.height && f.vcodec && !f.vcodec.startsWith("none")) {
                  heights.add(f.height);
                }
              });
            }
            let p = document.getElementById("movie_player");
            if (p && typeof p.getAvailableQualityLevels === "function") {
              let qMap = { "highres": 4320, "hd2880": 2880, "hd2160": 2160, "hd1440": 1440, "hd1080": 1080, "hd720": 720, "large": 480, "medium": 360, "small": 240, "tiny": 144 };
              p.getAvailableQualityLevels().forEach(lvl => {
                if (qMap[lvl]) heights.add(qMap[lvl]);
              });
            }
            let v = document.querySelector("video");
            if (v && v.videoHeight) {
              heights.add(v.videoHeight);
            }
            let sorted = Array.from(heights).sort((a, b) => b - a);
            window.postMessage({ type: "OMNIGRAB_QUALITIES", heights: sorted }, "*");
          } catch(e) {}
        }
        probeQualities();
        document.addEventListener("yt-navigate-finish", probeQualities);
        document.addEventListener("spfdone", probeQualities);
        setInterval(probeQualities, 2500);
      })();
    `;
    if (!document.getElementById("omnigrab-bridge")) {
      (document.head || document.documentElement).appendChild(s);
    }
  }

  window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "OMNIGRAB_QUALITIES") {
      const heights = event.data.heights;
      if (Array.isArray(heights) && heights.length > 0) {
        detectedHeights = heights;
        updateMaxLabel();
      }
    }
  });

  function updateMaxLabel() {
    if (detectedHeights.length === 0) return;
    const topH = detectedHeights[0];
    if (topH >= 2160) {
      maxLabel = "4K";
    } else if (topH >= 1440) {
      maxLabel = "2K";
    } else if (topH >= 1080) {
      maxLabel = "1080p";
    } else if (topH >= 720) {
      maxLabel = "720p";
    } else {
      maxLabel = topH + "p";
    }

    const lbl = document.getElementById("omni-lbl-text");
    if (lbl && !activePollTimer) {
      lbl.textContent = maxLabel;
    }
  }

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
    if (!document.body) return;
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
      if (toast) toast.style.display = "none";
    }, 3500);
  }

  function getAvailableItems() {
    const list = [];
    const known = [
      { h: 2160, label: "4K (2160p)", val: "2160", badge: "4K", cls: "omni-badge-4k" },
      { h: 1440, label: "2K (1440p)", val: "1440", badge: "2K", cls: "omni-badge-hd" },
      { h: 1080, label: "1080p Full HD", val: "1080", badge: "1080p", cls: "omni-badge-hd" },
      { h: 720, label: "720p HD", val: "720", badge: "720p", cls: "omni-badge-hd" },
      { h: 480, label: "480p SD", val: "480", badge: "480p", cls: "omni-badge-hd" },
      { h: 360, label: "360p", val: "360", badge: "360p", cls: "omni-badge-hd" }
    ];

    if (detectedHeights.length > 0) {
      const topH = detectedHeights[0];
      known.forEach(item => {
        if (item.h <= topH) {
          list.push(item);
        }
      });
    } else {
      list.push(
        { label: "1080p Full HD", val: "1080", badge: "1080p", cls: "omni-badge-hd" },
        { label: "720p HD", val: "720", badge: "720p", cls: "omni-badge-hd" }
      );
    }

    return list;
  }

  function startProgressTracking(taskId, quality) {
    const pill = document.getElementById("omnigrab-pill");
    if (!pill) return;

    pill.innerHTML = `
      <div class="omni-drag-grip" title="Drag">⠿</div>
      <div class="omni-progress-mode">
        <span class="omni-progress-text" id="omni-pct-lbl">0%</span>
        <div class="omni-progress-track">
          <div class="omni-progress-fill" id="omni-fill"></div>
        </div>
      </div>
      <div class="omni-close-btn" id="omni-reset-btn" title="Cancel">✕</div>
    `;

    const rBtn = document.getElementById("omni-reset-btn");
    if (rBtn) {
      rBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        clearInterval(activePollTimer);
        activePollTimer = null;
        rebuildPill();
      });
    }

    makeDraggable(pill);

    if (activePollTimer) clearInterval(activePollTimer);

    activePollTimer = setInterval(() => {
      try {
        chrome.runtime.sendMessage(
          { action: "check_progress", taskId: taskId },
          (res) => {
            if (chrome.runtime.lastError || !res || !res.ok || !res.data) return;
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
              activePollTimer = null;
              fill.style.width = "100%";
              pill.innerHTML = `
                <div class="omni-drag-grip" title="Drag">⠿</div>
                <div class="omni-main-btn" style="background:rgba(16,185,129,0.25);border-color:#10b981;color:#34d399;" id="omni-open-folder" title="Click to open Downloads">
                  <span>✓ Done</span>
                </div>
                <div class="omni-close-btn" id="omni-reset-btn" title="Back">✕</div>
              `;
              makeDraggable(pill);
              const ofBtn = document.getElementById("omni-open-folder");
              if (ofBtn) {
                ofBtn.addEventListener("click", () => {
                  try { chrome.runtime.sendMessage({ action: "open_downloads_folder" }); } catch (e) {}
                });
              }
              const rsBtn = document.getElementById("omni-reset-btn");
              if (rsBtn) {
                rsBtn.addEventListener("click", (e) => {
                  e.stopPropagation();
                  rebuildPill();
                });
              }
              showToast(`✓ Download complete in ${quality === "mp3" ? "MP3" : quality + "p"}! Saved to Downloads.`, false);
            } else if (d.status === "error") {
              clearInterval(activePollTimer);
              activePollTimer = null;
              showToast("Download error: " + (d.error || "Failed"), true);
              setTimeout(rebuildPill, 3000);
            }
          }
        );
      } catch (e) {
        clearInterval(activePollTimer);
        activePollTimer = null;
      }
    }, 600);
  }

  function triggerDownload(quality) {
    const videoUrl = window.location.href;
    const pageTitle = document.title.replace(/ - YouTube$/i, "").trim();

    // Determine target quality explicitly
    let targetQ = quality;
    if (!targetQ || targetQ === "max") {
      targetQ = detectedHeights.length > 0 ? String(detectedHeights[0]) : "1080";
    }

    closeDropdown();
    const labelTag = targetQ === "mp3" ? "MP3 Audio" : `${targetQ}p`;
    showToast(`Downloading in ${labelTag}... (Continues across tabs)`, false);

    try {
      chrome.runtime.sendMessage(
        {
          action: "trigger_idm_download",
          url: videoUrl,
          title: pageTitle,
          quality: targetQ
        },
        (response) => {
          if (chrome.runtime.lastError || !response || !response.ok) {
            showToast("Connecting to service...", true);
          } else {
            showToast(`⏬ Downloading in ${labelTag}!`, false);
            if (response.data && response.data.task_id) {
              startProgressTracking(response.data.task_id, targetQ);
            }
          }
        }
      );
    } catch (e) {
      showToast("Please refresh tab.", true);
    }
  }

  function toggleDropdown() {
    let menu = document.getElementById("omnigrab-dropdown-menu");
    if (!menu) {
      menu = document.createElement("div");
      menu.id = "omnigrab-dropdown-menu";
      if (document.body) document.body.appendChild(menu);
    }

    if (isMenuOpen) {
      closeDropdown();
      return;
    }

    const pill = document.getElementById("omnigrab-pill");
    if (!pill) return;

    const rect = pill.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 5}px`;
    menu.style.left = `${Math.min(window.innerWidth - 170, Math.max(10, rect.left))}px`;

    const items = getAvailableItems();

    let itemsHtml = `<div class="omni-menu-header">Available Qualities</div>`;

    items.forEach((q) => {
      itemsHtml += `
        <div class="omni-menu-item" data-val="${q.val}">
          <span>${q.label}</span>
          <span class="${q.cls}">${q.badge}</span>
        </div>
      `;
    });

    itemsHtml += `
      <div class="omni-menu-item" data-val="mp3">
        <span>Audio (MP3 320k)</span>
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
        const newLeft = Math.max(6, Math.min(window.innerWidth - el.offsetWidth - 6, initialPillX + dx));
        const newTop = Math.max(6, Math.min(window.innerHeight - el.offsetHeight - 6, initialPillY + dy));

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
      showToast("Position reset.");
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
        const topPos = Math.max(60, rect.top + 10);
        const leftPos = Math.max(10, rect.right - pill.offsetWidth - 12);
        pill.style.top = `${topPos}px`;
        pill.style.left = `${leftPos}px`;
        return;
      }
    }

    pill.style.top = "66px";
    pill.style.right = "16px";
  }

  function rebuildPill() {
    const pill = document.getElementById("omnigrab-pill");
    if (!pill) return;

    pill.innerHTML = `
      <div class="omni-drag-grip" title="Drag">⠿</div>
      <div class="omni-main-btn" id="omni-main-btn" title="Click to Download">
        <span class="omni-play-icon"></span>
        <span id="omni-lbl-text">${maxLabel}</span>
      </div>
      <div class="omni-chevron-btn" id="omni-chevron-btn" title="Choose quality">▾</div>
      <div class="omni-close-btn" id="omni-close-btn" title="Hide">✕</div>
    `;

    const mainBtn = document.getElementById("omni-main-btn");
    if (mainBtn) {
      mainBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const topQuality = detectedHeights.length > 0 ? String(detectedHeights[0]) : "max";
        triggerDownload(topQuality);
      });
    }

    const chevBtn = document.getElementById("omni-chevron-btn");
    if (chevBtn) {
      chevBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleDropdown();
      });
    }

    const closeBtn = document.getElementById("omni-close-btn");
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        isPillClosedByUser = true;
        closeDropdown();
        pill.style.display = "none";
      });
    }

    makeDraggable(pill);
  }

  function createPill() {
    if (!document.body) return null;
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
      detectedHeights = [];
      maxLabel = "HD";
      closeDropdown();
      if (activePollTimer) {
        clearInterval(activePollTimer);
        activePollTimer = null;
      }
      injectQualityReader();
    }

    if (!isPillClosedByUser) {
      if (!pill) pill = createPill();
      if (pill) {
        pill.style.display = "flex";
        positionPillAtVideoSide(pill);
      }
    }
  }

  injectQualityReader();

  window.addEventListener("keydown", (e) => {
    if (e.altKey && (e.key === "d" || e.key === "D")) {
      e.preventDefault();
      const topQuality = detectedHeights.length > 0 ? String(detectedHeights[0]) : "max";
      triggerDownload(topQuality);
    }
  });

  document.addEventListener("click", (e) => {
    if (isMenuOpen && !e.target.closest("#omnigrab-dropdown-menu") && !e.target.closest("#omni-chevron-btn")) {
      closeDropdown();
    }
  });

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
