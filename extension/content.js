(function () {
  if (window.__tubegrab_loaded__) {
    const ep = document.getElementById("tubegrab-pill") || document.getElementById("omnigrab-pill");
    if (ep) ep.remove();
    const em = document.getElementById("tubegrab-dropdown-menu") || document.getElementById("omnigrab-dropdown-menu");
    if (em) em.remove();
  }
  window.__tubegrab_loaded__ = true;

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
  let maxLabel = "4K";

  const PILL_ID = "tubegrab-pill";
  const MENU_ID = "tubegrab-dropdown-menu";
  const TOAST_ID = "tubegrab-toast";
  const BRIDGE_ID = "tubegrab-bridge";
  const STORAGE_KEY = "tubegrab_pos";

  function getPill() {
    return document.getElementById(PILL_ID) || document.getElementById("omnigrab-pill");
  }

  function getMenu() {
    return document.getElementById(MENU_ID) || document.getElementById("omnigrab-dropdown-menu");
  }

  function getToast() {
    return document.getElementById(TOAST_ID) || document.getElementById("omnigrab-toast");
  }

  // All standard available YouTube video quality tiers
  const allKnownQualities = [
    { h: 4320, label: "8K Ultra HD", val: "4320", badge: "8K", cls: "omni-badge-4k" },
    { h: 2160, label: "4K (2160p)", val: "2160", badge: "4K", cls: "omni-badge-4k" },
    { h: 1440, label: "2K (1440p)", val: "1440", badge: "2K", cls: "omni-badge-hd" },
    { h: 1080, label: "1080p Full HD", val: "1080", badge: "1080p", cls: "omni-badge-hd" },
    { h: 720, label: "720p HD", val: "720", badge: "720p", cls: "omni-badge-hd" },
    { h: 480, label: "480p SD", val: "480", badge: "480p", cls: "omni-badge-sd" },
    { h: 360, label: "360p", val: "360", badge: "360p", cls: "omni-badge-sd" },
    { h: 240, label: "240p", val: "240", badge: "240p", cls: "omni-badge-low" },
    { h: 144, label: "144p", val: "144", badge: "144p", cls: "omni-badge-low" }
  ];

  function injectQualityReader() {
    // page_bridge.js runs natively in world: "MAIN" via manifest.json.
    // Trigger immediate probe via postMessage (100% CSP compliant, zero inline script injection).
    requestImmediateProbe();
  }

  function requestImmediateProbe() {
    window.postMessage({ type: "TUBEGRAB_REQUEST_PROBE" }, "*");
    window.postMessage({ type: "OMNIGRAB_REQUEST_PROBE" }, "*");
  }

  window.addEventListener("message", (event) => {
    if (event.data && (event.data.type === "TUBEGRAB_QUALITIES" || event.data.type === "OMNIGRAB_QUALITIES")) {
      const heights = event.data.heights;
      if (Array.isArray(heights) && heights.length > 0) {
        detectedHeights = heights;
        updateMaxLabel();
        if (isMenuOpen) {
          renderDropdownItems();
        }
      }
    }
  });

  function extractHeightsFromDom() {
    try {
      const scripts = document.querySelectorAll("script");
      for (let i = 0; i < scripts.length; i++) {
        const text = scripts[i].textContent || "";
        const marker = "ytInitialPlayerResponse = {";
        const idx = text.indexOf(marker);
        if (idx !== -1) {
          const start = idx + "ytInitialPlayerResponse = ".length;
          let depth = 0;
          let end = start;
          for (let j = start; j < text.length; j++) {
            if (text[j] === "{") depth++;
            else if (text[j] === "}") {
              depth--;
              if (depth === 0) {
                end = j + 1;
                break;
              }
            }
          }
          if (end > start) {
            const data = JSON.parse(text.substring(start, end));
            const sd = (data && data.streamingData) || {};
            const set = new Set();
            (sd.adaptiveFormats || []).forEach((f) => {
              if (f.height) set.add(f.height);
            });
            (sd.formats || []).forEach((f) => {
              if (f.height) set.add(f.height);
            });
            const list = Array.from(set)
              .filter((h) => typeof h === "number" && h > 0)
              .sort((a, b) => b - a);
            if (list.length > 0) return list;
          }
        }
      }
    } catch (e) {}

    try {
      const v = document.querySelector("video");
      if (v && v.videoHeight && v.videoHeight > 0) {
        return [v.videoHeight];
      }
    } catch (e) {}

    return [];
  }

  function updateMaxLabel() {
    if (!detectedHeights || detectedHeights.length === 0) {
      detectedHeights = extractHeightsFromDom();
    }

    if (detectedHeights && detectedHeights.length > 0) {
      const topH = detectedHeights[0];
      if (topH >= 4320) maxLabel = "8K";
      else if (topH >= 2160) maxLabel = "4K";
      else if (topH >= 1440) maxLabel = "2K";
      else if (topH >= 1080) maxLabel = "1080p";
      else if (topH >= 720) maxLabel = "720p";
      else maxLabel = topH + "p";
    } else {
      maxLabel = "4K";
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
    let toast = getToast();
    if (!toast) {
      toast = document.createElement("div");
      toast.id = TOAST_ID;
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

  function checkDomVideoHeights() {
    try {
      const v = document.querySelector("video");
      if (v && v.videoHeight && v.videoHeight > 0) {
        if (!detectedHeights.includes(v.videoHeight)) {
          detectedHeights.push(v.videoHeight);
          detectedHeights.sort((a, b) => b - a);
          updateMaxLabel();
        }
      }
    } catch (e) {}
  }

  function getAvailableItems() {
    if (!detectedHeights || detectedHeights.length === 0) {
      detectedHeights = extractHeightsFromDom();
    }
    const list = [];
    if (detectedHeights && detectedHeights.length > 0) {
      // STRICT FILTER: Only show qualities that actually exist for this specific video!
      allKnownQualities.forEach((item) => {
        if (detectedHeights.includes(item.h)) {
          list.push(item);
        }
      });

      // Also include any non-standard detected height (e.g. 540p, 900p, Shorts vertical heights)
      detectedHeights.forEach((h) => {
        if (h > 0 && !list.some((it) => it.h === h)) {
          const badge = h >= 2160 ? "4K" : (h >= 1080 ? "HD" : `${h}p`);
          const cls = h >= 2160 ? "omni-badge-4k" : (h >= 1080 ? "omni-badge-hd" : "omni-badge-sd");
          list.push({ h: h, label: `${h}p`, val: String(h), badge: badge, cls: cls });
        }
      });

      list.sort((a, b) => b.h - a.h);
    }
    return list;
  }

  function startProgressTracking(taskId, quality, serverUrl) {
    const pill = getPill();
    if (!pill) return;

    pill.classList.add("omni-is-downloading");
    pill.innerHTML = `
      <div class="omni-drag-grip" title="Drag">⠿</div>
      <div class="omni-dl-info">
        <svg class="omni-dl-icon" viewBox="0 0 24 24" width="13" height="13" fill="none">
          <path d="M12 3V15M12 15L7.5 10.5M12 15L16.5 10.5" stroke="#38bdf8" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M4 19H20" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
        <span class="omni-dl-pct" id="omni-pct-lbl">0%</span>
        <span class="omni-dl-meta" id="omni-meta-lbl">Connecting...</span>
      </div>
      <div class="omni-close-btn" id="omni-reset-btn" title="Cancel">✕</div>
      <div class="omni-blue-bar-track">
        <div class="omni-blue-bar-fill" id="omni-blue-fill"></div>
      </div>
    `;

    const rBtn = document.getElementById("omni-reset-btn");
    if (rBtn) {
      rBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        clearInterval(activePollTimer);
        activePollTimer = null;
        pill.classList.remove("omni-is-downloading");
        rebuildPill();
      });
    }

    makeDraggable(pill);

    if (activePollTimer) clearInterval(activePollTimer);

    activePollTimer = setInterval(() => {
      try {
        chrome.runtime.sendMessage(
          { action: "check_progress", taskId: taskId, serverUrl: serverUrl },
          (res) => {
            if (chrome.runtime.lastError || !res || !res.ok || !res.data) return;
            const d = res.data;
            const fill = document.getElementById("omni-blue-fill");
            const pctLbl = document.getElementById("omni-pct-lbl");
            const metaLbl = document.getElementById("omni-meta-lbl");

            if (!fill || !pctLbl) return;

            if (d.status === "starting" || d.status === "downloading") {
              const pct = d.percent || 0;
              fill.style.width = pct + "%";
              pctLbl.textContent = Math.round(pct) + "%";
              if (metaLbl) {
                if (d.downloaded && d.total) {
                  metaLbl.textContent = `${d.downloaded}/${d.total}`;
                } else if (d.speed) {
                  metaLbl.textContent = d.speed;
                } else {
                  metaLbl.textContent = d.status === "starting" ? "Connecting..." : "Downloading...";
                }
              }
            } else if (d.status === "merging") {
              fill.style.width = "99%";
              pctLbl.textContent = "99%";
              if (metaLbl) metaLbl.textContent = `Merging ${quality === "mp3" ? "MP3" : quality + "p"}...`;
            } else if (d.status === "finished") {
              clearInterval(activePollTimer);
              activePollTimer = null;
              fill.style.width = "100%";
              fill.style.background = "#10b981";
              fill.style.boxShadow = "0 0 10px #10b981";

              setTimeout(() => {
                pill.classList.remove("omni-is-downloading");
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
              }, 600);

              showToast(`✓ Download complete in ${quality === "mp3" ? "MP3" : quality + "p"}! Saved to Downloads.`, false);
            } else if (d.status === "error") {
              clearInterval(activePollTimer);
              activePollTimer = null;
              pill.classList.remove("omni-is-downloading");
              showToast("Download error: " + (d.error || "Failed"), true);
              setTimeout(rebuildPill, 3000);
            }
          }
        );
      } catch (e) {
        clearInterval(activePollTimer);
        activePollTimer = null;
      }
    }, 500);
  }

  function triggerWakeup() {
    try {
      const ifr = document.createElement("iframe");
      ifr.style.display = "none";
      ifr.src = "tubegrab://start";
      document.body.appendChild(ifr);
      setTimeout(() => ifr.remove(), 2500);
    } catch (e) {}
  }

  function triggerDownload(quality) {
    triggerWakeup();
    const videoUrl = window.location.href;
    const pageTitle = document.title.replace(/ - YouTube$/i, "").trim();

    let targetQ = quality;
    if (!targetQ || targetQ === "max") {
      targetQ = detectedHeights.length > 0 ? String(detectedHeights[0]) : "max";
    }

    closeDropdown();
    const labelTag = targetQ === "mp3" ? "MP3 Audio" : `${targetQ}p`;
    showToast(`Starting ${labelTag} download...`, false);

    const pill = getPill();
    if (pill) {
      pill.classList.add("omni-is-downloading");
      pill.innerHTML = `
        <div class="omni-drag-grip" title="Drag">⠿</div>
        <div class="omni-dl-info">
          <svg class="omni-dl-icon" viewBox="0 0 24 24" width="13" height="13" fill="none">
            <path d="M12 3V15M12 15L7.5 10.5M12 15L16.5 10.5" stroke="#38bdf8" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M4 19H20" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
          <span class="omni-dl-pct" id="omni-pct-lbl">0%</span>
          <span class="omni-dl-meta" id="omni-meta-lbl">Connecting...</span>
        </div>
        <div class="omni-close-btn" id="omni-reset-btn" title="Cancel">✕</div>
        <div class="omni-blue-bar-track">
          <div class="omni-blue-bar-fill" id="omni-blue-fill" style="width: 5%"></div>
        </div>
      `;
      const rBtn = document.getElementById("omni-reset-btn");
      if (rBtn) {
        rBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (activePollTimer) clearInterval(activePollTimer);
          activePollTimer = null;
          pill.classList.remove("omni-is-downloading");
          rebuildPill();
        });
      }
      makeDraggable(pill);
    }

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
            showToast("Connecting to engine...", false);
          } else {
            showToast(`⏬ Downloading in ${labelTag}!`, false);
            if (response.data && response.data.task_id) {
              startProgressTracking(response.data.task_id, targetQ, response.serverUrl);
            }
          }
        }
      );
    } catch (e) {
      showToast("Please refresh tab.", true);
    }
  }

  function toggleDropdown() {
    if (isMenuOpen) {
      closeDropdown();
      return;
    }

    let menu = getMenu();
    if (!menu) {
      menu = document.createElement("div");
      menu.id = MENU_ID;
      menu.className = "tubegrab-active";
      if (document.body) document.body.appendChild(menu);
    }
    menu.classList.remove("tubegrab-hidden");
    menu.classList.add("tubegrab-active");

    requestImmediateProbe();
    renderDropdownItems();
  }

  function renderDropdownItems() {
    let menu = getMenu();
    if (!menu) return;

    const pill = getPill();
    if (!pill) return;

    const rect = pill.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${Math.min(window.innerWidth - 185, Math.max(8, rect.left))}px`;

    const items = getAvailableItems();

    let itemsHtml = `<div class="omni-menu-header">Available Qualities</div>`;

    if (items.length === 0) {
      itemsHtml += `
        <div style="padding:10px 14px;color:#94a3b8;font-size:12px;text-align:center;">
          Detecting qualities...
        </div>
      `;
    } else {
      items.forEach((q) => {
        itemsHtml += `
          <div class="omni-menu-item" data-val="${q.val}">
            <span class="omni-item-name">${q.label}</span>
            <span class="${q.cls}">${q.badge}</span>
          </div>
        `;
      });
    }

    itemsHtml += `
      <div class="omni-menu-item" data-val="mp3">
        <span class="omni-item-name">Audio (MP3 320k)</span>
        <span class="omni-badge-audio">MP3</span>
      </div>
    `;

    menu.innerHTML = itemsHtml;
    menu.classList.remove("tubegrab-hidden");
    menu.classList.add("tubegrab-active");
    menu.style.setProperty("display", "flex", "important");
    isMenuOpen = true;

    menu.querySelectorAll(".omni-menu-item").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        triggerDownload(el.getAttribute("data-val"));
      });
    });
  }

  function closeDropdown() {
    isMenuOpen = false;
    const menu = getMenu();
    if (menu) {
      menu.classList.remove("tubegrab-active");
      menu.classList.add("tubegrab-hidden");
      menu.style.setProperty("display", "none", "important");
      try { menu.remove(); } catch (e) {}
    }
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
              STORAGE_KEY,
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
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem("omnigrab_pos");
      } catch (err) {}
      positionPillAtVideoSide(el);
      showToast("Position reset.");
    };
  }

  function isActivelyWatchingVideo() {
    try {
      // 1. Must be on a video watch page (/watch?v=...) or shorts (/shorts/...)
      const pathname = window.location.pathname;
      const search = window.location.search;
      const isWatch = pathname === "/watch" && Boolean(new URLSearchParams(search).get("v"));
      const isShorts = pathname.startsWith("/shorts/") && pathname.length > 8;

      if (!isWatch && !isShorts) {
        return false;
      }

      // 2. If in miniplayer mode, watch page is inactive / closed
      const miniplayer = document.querySelector("ytd-miniplayer[active], ytd-miniplayer:not([hidden])");
      if (miniplayer && miniplayer.offsetParent !== null) {
        return false;
      }

      // 3. On YouTube desktop, watch container must exist and be visible
      if (isWatch) {
        const watchContainer = document.querySelector("ytd-watch-flexy, ytd-watch-grid");
        if (watchContainer) {
          if (
            watchContainer.hasAttribute("hidden") ||
            watchContainer.style.display === "none" ||
            watchContainer.offsetParent === null
          ) {
            return false;
          }
        }
      }

      // 4. Player must exist and be visibly on the screen in the viewport
      const player =
        (isWatch ? document.querySelector("ytd-watch-flexy #movie_player, ytd-watch-grid #movie_player, #movie_player") : null) ||
        document.querySelector("ytd-player") ||
        document.querySelector("video");

      if (!player) return false;

      if (typeof player.checkVisibility === "function") {
        if (!player.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
          return false;
        }
      } else if (player.offsetParent === null) {
        return false;
      }

      const rect = player.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 60) {
        return false;
      }

      // If the video player has scrolled off the top or bottom of the screen, it's not active
      if (rect.top < -60 || rect.bottom < 100 || rect.top > (window.innerHeight - 60)) {
        return false;
      }

      return true;
    } catch (e) {
      return false;
    }
  }

  function positionPillAtVideoSide(pill) {
    if (!pill) return;

    if (isFullscreen() || !isActivelyWatchingVideo()) {
      hideUiImmediately();
      return;
    }

    if (hasUserDragged) return;

    try {
      const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("omnigrab_pos");
      if (saved) {
        const pos = JSON.parse(saved);
        if (pos.left && pos.top) {
          pill.style.left = pos.left;
          pill.style.top = pos.top;
          hasUserDragged = true;
          pill.classList.remove("tubegrab-hidden");
          pill.classList.add("tubegrab-active");
          return;
        }
      }
    } catch (e) {}

    const player =
      document.querySelector("ytd-watch-flexy #movie_player, ytd-watch-grid #movie_player, #movie_player") ||
      document.querySelector("ytd-player") ||
      document.querySelector("video");

    if (player) {
      const rect = player.getBoundingClientRect();
      if (rect.top < -60 || rect.bottom < 100 || rect.top > (window.innerHeight - 60)) {
        hideUiImmediately();
        return;
      }

      if (rect.width > 200 && rect.height > 100) {
        const topPos = rect.top + 12;
        const leftPos = Math.max(10, rect.right - pill.offsetWidth - 14);
        pill.style.top = `${topPos}px`;
        pill.style.left = `${leftPos}px`;
        pill.classList.remove("tubegrab-hidden");
        pill.classList.add("tubegrab-active");
        return;
      }
    }

    hideUiImmediately();
  }

  function rebuildPill() {
    const pill = getPill();
    if (!pill) return;

    pill.innerHTML = `
      <div class="omni-drag-grip" title="Drag">⠿</div>
      <div class="omni-main-btn" id="omni-main-btn" title="Click to Download">
        <svg class="omni-btn-icon" viewBox="0 0 24 24" width="13" height="13" fill="none">
          <path d="M12 3V15M12 15L7.5 10.5M12 15L16.5 10.5" stroke="#22c55e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M4 19H20" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
        <span id="omni-lbl-text">${maxLabel}</span>
      </div>
      <div class="omni-chevron-btn" id="omni-chevron-btn" title="Choose quality">
        <svg class="omni-chev-icon" viewBox="0 0 10 6" width="9" height="6" fill="none">
          <path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="omni-close-btn" id="omni-close-btn" title="Hide">✕</div>
    `;

    const mainBtn = document.getElementById("omni-main-btn");
    if (mainBtn) {
      mainBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const topQuality = detectedHeights.length > 0 ? String(detectedHeights[0]) : "max";
        triggerDownload(topQuality);
      });
      mainBtn.addEventListener("mouseenter", () => {
        requestImmediateProbe();
      });
    }

    const chevBtn = document.getElementById("omni-chevron-btn");
    if (chevBtn) {
      chevBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleDropdown();
      });
      chevBtn.addEventListener("mouseenter", () => {
        requestImmediateProbe();
      });
    }

    const closeBtn = document.getElementById("omni-close-btn");
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        isPillClosedByUser = true;
        hideUiImmediately();
      });
    }

    makeDraggable(pill);
  }

  function createPill() {
    if (!document.body) return null;
    let pill = getPill();
    if (pill) return pill;

    pill = document.createElement("div");
    pill.id = PILL_ID;
    pill.className = "tubegrab-active";
    document.body.appendChild(pill);

    rebuildPill();
    positionPillAtVideoSide(pill);
    return pill;
  }

  function hideUiImmediately() {
    isMenuOpen = false;

    const menu = getMenu();
    if (menu) {
      menu.classList.remove("tubegrab-active");
      menu.classList.add("tubegrab-hidden");
      menu.style.setProperty("display", "none", "important");
      menu.style.setProperty("visibility", "hidden", "important");
      menu.style.setProperty("opacity", "0", "important");
      try { menu.remove(); } catch (e) {}
    }

    const pill = getPill();
    if (pill) {
      pill.classList.remove("tubegrab-active");
      pill.classList.add("tubegrab-hidden");
      pill.style.setProperty("display", "none", "important");
      pill.style.setProperty("visibility", "hidden", "important");
      pill.style.setProperty("opacity", "0", "important");
      pill.style.setProperty("pointer-events", "none", "important");
      try { pill.remove(); } catch (e) {}
    }
  }

  function updateUi() {
    if (!isActivelyWatchingVideo() || isFullscreen()) {
      hideUiImmediately();
      return;
    }

    const curr = window.location.href;
    if (curr !== lastCheckedUrl) {
      lastCheckedUrl = curr;
      isPillClosedByUser = false;
      detectedHeights = extractHeightsFromDom();
      updateMaxLabel();
      closeDropdown();
      if (activePollTimer) {
        clearInterval(activePollTimer);
        activePollTimer = null;
      }
      injectQualityReader();
    }

    if (!isPillClosedByUser) {
      let pill = getPill();
      if (!pill) {
        pill = createPill();
      } else {
        pill.classList.remove("tubegrab-hidden");
        pill.classList.add("tubegrab-active");
        positionPillAtVideoSide(pill);
      }

      if (!activePollTimer) {
        try {
          chrome.runtime.sendMessage(
            { action: "get_active_task_for_url", url: window.location.href },
            (res) => {
              if (!chrome.runtime.lastError && res && res.task && !activePollTimer) {
                startProgressTracking(res.task.taskId, res.task.quality, res.task.serverUrl);
              }
            }
          );
        } catch (e) {}
      }
    } else {
      hideUiImmediately();
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
    if (isMenuOpen && !e.target.closest("#tubegrab-dropdown-menu") && !e.target.closest("#omnigrab-dropdown-menu") && !e.target.closest("#omni-chevron-btn")) {
      closeDropdown();
    }
  });

  ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange"].forEach((evt) => {
    document.addEventListener(evt, updateUi);
  });

  window.addEventListener("resize", () => {
    const pill = getPill();
    if (pill && !hasUserDragged) positionPillAtVideoSide(pill);
    closeDropdown();
  });

  window.addEventListener("scroll", () => {
    const pill = getPill();
    if (pill && !hasUserDragged) positionPillAtVideoSide(pill);
    closeDropdown();
  }, true);

  // Instant hiding when navigating away or closing video
  window.addEventListener("yt-navigate-start", hideUiImmediately);
  window.addEventListener("yt-page-type-changed", hideUiImmediately);
  window.addEventListener("popstate", () => {
    hideUiImmediately();
    setTimeout(updateUi, 80);
  });
  window.addEventListener("yt-navigate-finish", updateUi);
  window.addEventListener("yt-page-data-updated", updateUi);
  window.addEventListener("spfdone", updateUi);
  window.addEventListener("DOMContentLoaded", updateUi);
  window.addEventListener("load", updateUi);

  // MutationObserver for instantaneous hiding when YouTube hides the watch flexy container
  try {
    const appEl = document.querySelector("ytd-app") || document.body;
    if (appEl) {
      const observer = new MutationObserver(() => {
        if (!isActivelyWatchingVideo()) {
          hideUiImmediately();
        }
      });
      observer.observe(appEl, { attributes: true, subtree: true, attributeFilter: ["hidden", "style", "is-two-columns_", "active"] });
    }
  } catch (e) {}

  // Snappy 200ms polling loop
  setInterval(updateUi, 200);
})();
