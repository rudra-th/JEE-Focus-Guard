// ============================================================
// JEE Focus Guard — Popup v1.2
// ============================================================

document.addEventListener("DOMContentLoaded", async () => {
  await updateStatus();
  await updateStats();
  await updateDbStatus();

  document.getElementById("btnSolve").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("gate.html?source=popup") });
  });
  document.getElementById("btnOptions").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  // Live timer
  setInterval(updateStatus, 1000);
});

async function updateStatus() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action: "checkLockStatus" }, async response => {
      if (chrome.runtime.lastError || !response) { resolve(); return; }

      const card  = document.getElementById("statusCard");
      const icon  = document.getElementById("statusIcon");
      const text  = document.getElementById("statusText");
      const timer = document.getElementById("timerDisplay");
      const label = document.getElementById("timerLabel");

      if (response.locked) {
        card.className  = "status-card locked";
        icon.textContent  = "🔒";
        text.textContent  = "SITES LOCKED";
        timer.className   = "timer expired";
        timer.textContent = "00:00";

        // Show configured time
        const { minutes } = await sendMessage({ action: "getUnlockMinutes" }).catch(() => ({ minutes: 15 }));
        label.textContent = `Solve 1 question → ${minutes} min unlocked`;
      } else {
        card.className  = "status-card unlocked";
        icon.textContent  = "🔓";
        text.textContent  = "SITES UNLOCKED";
        timer.className   = "timer active";

        const rem  = response.remaining;
        const mins = Math.floor(rem / 60000);
        const secs = Math.floor((rem % 60000) / 1000);
        timer.textContent = `${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}`;
        label.textContent = "remaining until re-lock";
      }
      resolve();
    });
  });
}

async function updateStats() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action: "getStats" }, response => {
      if (chrome.runtime.lastError || !response) { resolve(); return; }
      const solved   = response.totalSolved  || 0;
      const correct  = response.totalCorrect || 0;
      const streak   = response.streak       || 0;
      const accuracy = solved > 0 ? Math.round((correct / solved) * 100) : 0;
      document.getElementById("statSolved").textContent   = solved;
      document.getElementById("statAccuracy").textContent = accuracy + "%";
      document.getElementById("statStreak").textContent   = streak;
      resolve();
    });
  });
}

async function updateDbStatus() {
  chrome.storage.local.get(["questionBankReady","questionCount"], data => {
    const dot    = document.getElementById("dbDot");
    const status = document.getElementById("dbStatus");
    if (data.questionBankReady) {
      dot.className    = "db-dot";
      status.textContent = `${data.questionCount || 0} questions ready`;
    } else {
      dot.className    = "db-dot error";
      status.textContent = "No questions — open Options";
    }
  });
}

function sendMessage(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, r => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(r);
    });
  });
}
