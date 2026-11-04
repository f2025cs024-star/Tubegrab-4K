(function () {
  function probeQualities() {
    try {
      let heights = new Set();

      // 1. YouTube Player API - getPlayerResponse
      let p = document.getElementById("movie_player");
      if (p) {
        if (typeof p.getPlayerResponse === "function") {
          let pr = p.getPlayerResponse();
          if (pr && pr.streamingData) {
            (pr.streamingData.adaptiveFormats || []).forEach((f) => {
              if (f.height) heights.add(f.height);
            });
            (pr.streamingData.formats || []).forEach((f) => {
              if (f.height) heights.add(f.height);
            });
          }
        }

        if (typeof p.getAvailableQualityData === "function") {
          let qd = p.getAvailableQualityData();
          if (Array.isArray(qd)) {
            qd.forEach((item) => {
              if (item.qualityLabel) {
                let m = item.qualityLabel.match(/(\d+)p/);
                if (m) heights.add(parseInt(m[1]));
              }
            });
          }
        }

        if (typeof p.getAvailableQualityLevels === "function") {
          let qMap = {
            highres: 4320,
            hd2880: 2880,
            hd2160: 2160,
            hd1440: 1440,
            hd1080: 1080,
            hd720: 720,
            large: 480,
            medium: 360,
            small: 240,
            tiny: 144
          };
          let lvls = p.getAvailableQualityLevels();
          if (Array.isArray(lvls)) {
            lvls.forEach((lvl) => {
              if (qMap[lvl]) heights.add(qMap[lvl]);
            });
          }
        }
      }

      // 2. window.ytInitialPlayerResponse
      let r = window.ytInitialPlayerResponse;
      if (r && r.streamingData) {
        (r.streamingData.adaptiveFormats || []).forEach((f) => {
          if (f.height) heights.add(f.height);
        });
        (r.streamingData.formats || []).forEach((f) => {
          if (f.height) heights.add(f.height);
        });
      }

      // 3. Active video element
      let v = document.querySelector("video");
      if (v && v.videoHeight && v.videoHeight > 0) {
        heights.add(v.videoHeight);
      }

      let sorted = Array.from(heights)
        .filter((h) => typeof h === "number" && h > 0)
        .sort((a, b) => b - a);

      if (sorted.length > 0) {
        window.postMessage({ type: "TUBEGRAB_QUALITIES", heights: sorted }, "*");
      }
    } catch (e) {}
  }

  window.addEventListener("message", function (e) {
    if (e.data && (e.data.type === "TUBEGRAB_REQUEST_PROBE" || e.data.type === "OMNIGRAB_REQUEST_PROBE")) {
      probeQualities();
    }
  });

  probeQualities();
  setInterval(probeQualities, 1000);
  document.addEventListener("yt-navigate-finish", () => {
    probeQualities();
    setTimeout(probeQualities, 300);
    setTimeout(probeQualities, 800);
  });
})();
