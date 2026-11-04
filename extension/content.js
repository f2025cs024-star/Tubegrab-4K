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
  let maxLabel = "Download";

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
    if (document.getElementById(BRIDGE_ID) || document.getElementById("omnigrab-bridge")) {
      requestImmediateProbe();
      return;
    }

    const s = document.createElement("script");
    s.id = BRIDGE_ID;
    s.textContent = `
      (function() {
        function probeQualities() {
          try {
            let heights = new Set();

            // 1. YouTube Player API - getPlayerResponse (most reliable & current)
            let p = document.getElementById("movie_player");
            if (p) {
              if (typeof p.getPlayerResponse === "function") {
                let pr = p.getPlayerResponse();
                if (pr && pr.streamingData) {
                  (pr.streamingData.adaptiveFormats || []).forEach(f => {
                    if (f.height) heights.add(f.height);
                  });
                  (pr.streamingData.formats || []).forEach(f => {
                    if (f.height) heights.add(f.height);
                  });
                }
              }

              if (typeof p.getAvailableQualityData === "function") {
                let qd = p.getAvailableQualityData();
                if (Array.isArray(qd)) {
                  qd.forEach(item => {
                    if (item.qualityLabel) {
                      let m = item.qualityLabel.match(/(\\d+)p/);
                      if (m) heights.add(parseInt(m[1]));
                    }
                  });
                }
              }

              if (typeof p.getAvailableQualityLevels === "function") {
                let qMap = {
                  "highres": 4320, "hd2880": 2880, "hd2160": 2160,
                  "hd1440": 1440, "hd1080": 1080, "hd720": 720,
                  "large": 480, "medium": 360, "small": 240, "tiny": 144
                };
                let lvls = p.getAvailableQualityLevels();
                if (Array.isArray(lvls)) {
                  lvls.forEach(lvl => {
                    if (qMap[lvl]) heights.add(qMap[lvl]);
                  });
                }
              }
            }

            // 2. ytd-watch-flexy DOM component
            let flexy = document.querySelector("ytd-watch-flexy");
            if (flexy && flexy.playerData && flexy.playerData.streamingData) {
              (flexy.playerData.streamingData.adaptiveFormats || []).forEach(f => {
                if (f.height) heights.add(f.height);
              });
              (flexy.playerData.streamingData.formats || []).forEach(f => {
                if (f.height) heights.add(f.height);
              });
            }

            // 3. window.ytInitialPlayerResponse
            let r = window.ytInitialPlayerResponse;
            if (r && r.streamingData) {
              (r.streamingData.adaptiveFormats || []).forEach(f => {
                if (f.height) heights.add(f.height);
              });
              (r.streamingData.formats || []).forEach(f => {
                if (f.height) heights.add(f.height);
              });
            }

            // 4. ytplayer raw config
            if (window.ytplayer && window.ytplayer.config && window.ytplayer.config.args) {
              try {
                let raw = window.ytplayer.config.args.raw_player_response;
                if (typeof raw === "string") raw = JSON.parse(raw);
                if (raw && raw.streamingData) {
                  (raw.streamingData.adaptiveFormats || []).forEach(f => {
                    if (f.height) heights.add(f.height);
                  });
                }
              } catch (err) {}
            }

            // 5. Active video element
            let v = document.querySelector("video");
            if (v && v.videoHeight && v.videoHeight > 0) {
              heights.add(v.videoHeight);
            }

            let sorted = Array.from(heights).sort((a, b) => b - a);
            if (sorted.length > 0) {
              window.postMessage({ type: "TUBEGRAB_QUALITIES", heights: sorted }, "*");
              window.postMessage({ type: "OMNIGRAB_QUALITIES", heights: sorted }, "*");
            }
          } catch(e) {}
        }

        window.addEventListener("message", function(e) {
          if (e.data && (e.data.type === "TUBEGRAB_REQUEST_PROBE" || e.data.type === "OMNIGRAB_REQUEST_PROBE")) {
            probeQualities();
          }
        });

        probeQualities();
        setTimeout(probeQualities, 200);
        setTimeout(probeQualities, 600);
        setTimeout(probeQualities, 1200);
        setTimeout(probeQualities, 2200);

        document.addEventListener("yt-navigate-finish", function() {
          probeQualities();
          setTimeout(probeQualities, 300);
          setTimeout(probeQualities, 800);
          setTimeout(probeQualities, 1600);
        });
        document.addEventListener("spfdone", probeQualities);
        setInterval(probeQualities, 1500);
      })();
    `;
    (document.head || document.documentElement).appendChild(s);
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

  function updateMaxLabel() {
    if (detectedHeights.length > 0) {
      const topH = detectedHeights[0];
      if (topH >= 4320) {
        maxLabel = "8K";
      } else if (topH >= 2160) {
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
    } else {
      maxLabel = "Download";
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
    checkDomVideoHeights();
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
    } else {
      // Immediate intelligent fallback so the dropdown is NEVER empty or stuck
      allKnownQualities.forEach((item) => {
        if (item.h <= 1080) {
          list.push(item);
        }
      });
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
    let menu = getMenu();
    if (!menu) {
      menu = document.createElement("div");
      menu.id = MENU_ID;
      if (document.body) document.body.appendChild(menu);
    }

    if (isMenuOpen) {
      closeDropdown();
      return;
    }

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
    const menu = getMenu();
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

  function positionPillAtVideoSide(pill) {
    if (isFullscreen()) {
      pill.style.display = "none";
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
        closeDropdown();
        pill.style.display = "none";
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
    document.body.appendChild(pill);

    rebuildPill();
    positionPillAtVideoSide(pill);
    return pill;
  }

  function updateUi() {
    const isVideoPage =
      window.location.pathname.startsWith("/watch") ||
      window.location.pathname.startsWith("/shorts");

    let pill = getPill();

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
      maxLabel = "Download";
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

      if (!activePollTimer && isVideoPage) {
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

  window.addEventListener("yt-navigate-finish", updateUi);
  window.addEventListener("spfdone", updateUi);
  window.addEventListener("DOMContentLoaded", updateUi);
  window.addEventListener("load", updateUi);

  setInterval(updateUi, 800);
})();
