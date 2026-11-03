const cloudUrl = "https://tubegrab-4k.onrender.com";
const localUrl = "http://127.0.0.1:19876";

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("serverUrl");
  const saveBtn = document.getElementById("saveBtn");
  const useRenderBtn = document.getElementById("useRenderBtn");
  const resetBtn = document.getElementById("resetLocalBtn");
  const msg = document.getElementById("msg");

  chrome.storage.sync.get(["serverUrl"], (res) => {
    input.value = res.serverUrl || cloudUrl;
  });

  saveBtn.addEventListener("click", () => {
    let url = input.value.trim().replace(/\/+$/, "");
    if (!url) url = cloudUrl;
    chrome.storage.sync.set({ serverUrl: url }, () => {
      msg.textContent = "✓ Settings saved!";
      msg.style.display = "block";
      setTimeout(() => { msg.style.display = "none"; }, 3000);
    });
  });

  useRenderBtn.addEventListener("click", () => {
    input.value = cloudUrl;
    chrome.storage.sync.set({ serverUrl: cloudUrl }, () => {
      msg.textContent = "✓ Switched to Render Cloud Server!";
      msg.style.display = "block";
      setTimeout(() => { msg.style.display = "none"; }, 3000);
    });
  });

  resetBtn.addEventListener("click", () => {
    input.value = localUrl;
    chrome.storage.sync.set({ serverUrl: localUrl }, () => {
      msg.textContent = "✓ Switched to Local Desktop Server!";
      msg.style.display = "block";
      setTimeout(() => { msg.style.display = "none"; }, 3000);
    });
  });
});
