const defaultUrl = "http://127.0.0.1:19876";
const renderCloudUrl = "https://tubegrab-4k.onrender.com";

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("serverUrl");
  const saveBtn = document.getElementById("saveBtn");
  const resetBtn = document.getElementById("resetLocalBtn");
  const useRenderBtn = document.getElementById("useRenderBtn");
  const msg = document.getElementById("msg");

  chrome.storage.sync.get(["serverUrl"], (res) => {
    input.value = res.serverUrl || defaultUrl;
  });

  saveBtn.addEventListener("click", () => {
    let url = input.value.trim().replace(/\/+$/, "");
    if (!url) url = defaultUrl;
    chrome.storage.sync.set({ serverUrl: url }, () => {
      msg.textContent = "✓ Settings saved!";
      msg.style.display = "block";
      setTimeout(() => { msg.style.display = "none"; }, 3000);
    });
  });

  if (useRenderBtn) {
    useRenderBtn.addEventListener("click", () => {
      input.value = renderCloudUrl;
      chrome.storage.sync.set({ serverUrl: renderCloudUrl }, () => {
        msg.textContent = "✓ Switched to Render Cloud Server!";
        msg.style.display = "block";
        setTimeout(() => { msg.style.display = "none"; }, 3000);
      });
    });
  }

  resetBtn.addEventListener("click", () => {
    input.value = defaultUrl;
    chrome.storage.sync.set({ serverUrl: defaultUrl }, () => {
      msg.textContent = "✓ Switched to local desktop server!";
      msg.style.display = "block";
      setTimeout(() => { msg.style.display = "none"; }, 3000);
    });
  });
});
