// ============================================================
// JEE Focus Guard — Gate Logic v1.2
// ============================================================

const ALLOWED_DOMAINS = [
  "instagram.com","facebook.com","twitter.com","x.com",
  "reddit.com","tiktok.com","snapchat.com","netflix.com",
  "twitch.tv","discord.com"
];

let currentQuestion = null;
let answered = false;
let unlockMinutes = 15;

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const source = params.get("source") || "";

  // Get configured unlock time
  try {
    const resp = await sendMessage({ action: "getUnlockMinutes" });
    unlockMinutes = resp.minutes || 15;
  } catch (e) { /* use default */ }

  // Show blocked notice
  const notice = document.getElementById("blockedNotice");
  const domainEl = document.getElementById("blockedDomain");
  if (source && source !== "popup") {
    notice.style.display = "block";
    if (source === "youtube") domainEl.textContent = "YouTube (non-educational video)";
    else if (source === "youtube-shorts") domainEl.textContent = "YouTube Shorts";
    else domainEl.textContent = source;
  }

  // Update all "15 minutes" placeholders with actual value
  document.querySelectorAll(".unlock-duration").forEach(el => {
    el.textContent = `${unlockMinutes} minute${unlockMinutes !== 1 ? "s" : ""}`;
  });

  // Check if already unlocked
  try {
    const lock = await sendMessage({ action: "checkLockStatus" });
    if (lock && !lock.locked) { showAlreadyUnlocked(lock.remaining, source); return; }
  } catch (e) { /* continue */ }

  await loadQuestion();
});

// ─── Load Question ─────────────────────────────────────────────
async function loadQuestion() {
  answered = false;
  document.getElementById("loadingState").style.display = "block";
  document.getElementById("questionCard").style.display = "none";
  document.getElementById("resultCard").className = "result-card";
  document.getElementById("solutionBox").className = "solution-box";
  document.getElementById("actionButtons").style.display = "none";

  try {
    const response = await sendMessage({ action: "getQuestion" });
    if (response.error) { showError(response.error); return; }
    currentQuestion = response.question;
    renderQuestion(currentQuestion);
  } catch (e) {
    showError("Failed to load question. Please check Options and reload.");
  }
}

// ─── Render Question ────────────────────────────────────────────
function renderQuestion(q) {
  document.getElementById("loadingState").style.display = "none";
  document.getElementById("questionCard").style.display = "block";

  // Meta tags
  const meta = document.getElementById("qMeta");
  meta.innerHTML = [
    q.subject    && `<span class="q-tag subject">${esc(q.subject)}</span>`,
    q.chapter    && `<span class="q-tag chapter">${esc(q.chapter)}</span>`,
    q.year       && `<span class="q-tag year">${esc(String(q.year))}</span>`,
    q.difficulty && `<span class="q-tag difficulty">${esc(q.difficulty)}</span>`
  ].filter(Boolean).join("");

  document.getElementById("qText").textContent = q.question;

  const list = document.getElementById("optionsList");
  list.innerHTML = "";
  const letters = ["A","B","C","D"];
  (q.options || []).slice(0, 4).forEach((opt, idx) => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.innerHTML = `<span class="option-letter">${letters[idx]}</span><span class="option-text"></span>`;
    btn.querySelector(".option-text").textContent = opt;
    btn.addEventListener("click", () => handleAnswer(idx));
    list.appendChild(btn);
  });

  scheduleMathRender();
}

// ─── Handle Answer ──────────────────────────────────────────────
async function handleAnswer(selectedIdx) {
  if (answered) return;
  answered = true;

  const correctIdx = getCorrectIndex();
  const isCorrect = selectedIdx === correctIdx;

  document.querySelectorAll(".option-btn").forEach((btn, idx) => {
    btn.classList.add("disabled");
    if (idx === correctIdx) btn.classList.add("correct");
    if (idx === selectedIdx && !isCorrect) btn.classList.add("wrong");
  });

  await sendMessage({ action: "recordAnswer", correct: isCorrect });

  const card = document.getElementById("resultCard");
  const title = document.getElementById("resultTitle");
  const msg   = document.getElementById("resultMessage");

  if (isCorrect) {
    card.className = "result-card show success";
    title.textContent = "✅ Correct!";
    await sendMessage({ action: "unlockSites" });
    // Re-read actual unlock time after unlock
    const lock = await sendMessage({ action: "checkLockStatus" });
    const rem = lock.remaining ? Math.ceil(lock.remaining / 60000) : unlockMinutes;
    msg.textContent = `Great job! Sites unlocked for ${rem} minute${rem !== 1 ? "s" : ""}.`;
  } else {
    card.className = "result-card show failure";
    title.textContent = "❌ Incorrect";
    msg.textContent = "That's not right — sites remain locked. Study the solution and try again!";
  }

  showSolution();
  showActions(isCorrect);
  scheduleMathRender();
}

// ─── Correct Index ──────────────────────────────────────────────
function getCorrectIndex() {
  if (!currentQuestion) return 0;
  const c = currentQuestion.correct;
  if (typeof c === "number") return c;
  if (typeof c === "string") {
    const clean = c.trim().toUpperCase().replace(/[().\s]/g, "");
    const map = { A:0, B:1, C:2, D:3, "1":0, "2":1, "3":2, "4":3 };
    if (map[clean] !== undefined) return map[clean];
    // Try matching option text
    const opts = currentQuestion.options || [];
    for (let i = 0; i < opts.length; i++) {
      if (opts[i].trim() === c.trim()) return i;
    }
  }
  return 0;
}

// ─── Solution ────────────────────────────────────────────────────
function showSolution() {
  if (!currentQuestion?.solution) return;
  const box = document.getElementById("solutionBox");
  document.getElementById("solutionText").textContent = currentQuestion.solution;
  box.className = "solution-box show";
}

// ─── Actions ─────────────────────────────────────────────────────
function showActions(unlocked) {
  const container = document.getElementById("actionButtons");
  container.style.display = "flex";
  container.innerHTML = "";

  const params = new URLSearchParams(window.location.search);
  const source = params.get("source") || "";

  if (unlocked) {
    if (source && source !== "popup" && source !== "youtube" && source !== "youtube-shorts"
        && ALLOWED_DOMAINS.includes(source)) {
      const btn = document.createElement("button");
      btn.className = "btn btn-unlock";
      btn.innerHTML = `🌐 Go to ${esc(source)}`;
      btn.addEventListener("click", () => { window.location.href = `https://${source}`; });
      container.appendChild(btn);
    }
    if (source === "youtube" || source === "youtube-shorts") {
      const btn = document.createElement("button");
      btn.className = "btn btn-unlock";
      btn.innerHTML = "▶ Back to YouTube";
      btn.addEventListener("click", () => { window.location.href = "https://www.youtube.com"; });
      container.appendChild(btn);
    }
  }

  const moreBtn = document.createElement("button");
  moreBtn.className = "btn btn-retry";
  moreBtn.innerHTML = unlocked ? "🧠 Solve Another" : "🔄 Try a New Question";
  moreBtn.addEventListener("click", loadQuestion);
  container.appendChild(moreBtn);
}

// ─── Already Unlocked ────────────────────────────────────────────
function showAlreadyUnlocked(remaining, source) {
  document.getElementById("loadingState").style.display = "none";
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);

  const card = document.getElementById("resultCard");
  card.className = "result-card show success";
  document.getElementById("resultTitle").textContent = "🔓 Already Unlocked!";
  document.getElementById("resultMessage").textContent =
    `You have ${mins}m ${secs}s remaining. Go enjoy your break!`;

  const container = document.getElementById("actionButtons");
  container.style.display = "flex";

  if (source && source !== "popup" && source !== "youtube" && source !== "youtube-shorts"
      && ALLOWED_DOMAINS.includes(source)) {
    const btn = document.createElement("button");
    btn.className = "btn btn-unlock";
    btn.innerHTML = `🌐 Go to ${esc(source)}`;
    btn.addEventListener("click", () => { window.location.href = `https://${source}`; });
    container.appendChild(btn);
  }
  if (source === "youtube" || source === "youtube-shorts") {
    const btn = document.createElement("button");
    btn.className = "btn btn-unlock";
    btn.innerHTML = "▶ Back to YouTube";
    btn.addEventListener("click", () => { window.location.href = "https://www.youtube.com"; });
    container.appendChild(btn);
  }

  const practiceBtn = document.createElement("button");
  practiceBtn.className = "btn btn-retry";
  practiceBtn.innerHTML = "🧠 Practice Anyway";
  practiceBtn.addEventListener("click", () => {
    card.className = "result-card";
    container.style.display = "none";
    loadQuestion();
  });
  container.appendChild(practiceBtn);
}

// ─── Error ───────────────────────────────────────────────────────
function showError(message) {
  document.getElementById("loadingState").style.display = "none";
  const card = document.getElementById("resultCard");
  card.className = "result-card show failure";
  document.getElementById("resultTitle").textContent = "⚠️ Error";
  document.getElementById("resultMessage").textContent = message;

  const container = document.getElementById("actionButtons");
  container.style.display = "flex";
  const btn = document.createElement("button");
  btn.className = "btn btn-retry";
  btn.innerHTML = "🔄 Retry";
  btn.addEventListener("click", () => location.reload());
  container.appendChild(btn);
}

// ─── Math Rendering ──────────────────────────────────────────
function scheduleMathRender() {
  clearTimeout(window._mathTimer);
  window._mathTimer = setTimeout(doRenderMath, 100);
}

function doRenderMath() {
  if (typeof JEEMath === "undefined") return;
  ["qText","optionsList","solutionText"].forEach(id => {
    const el = document.getElementById(id);
    if (el) JEEMath.renderMathInElement(el);
  });
}

// ─── Helpers ──────────────────────────────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function sendMessage(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, response => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}
