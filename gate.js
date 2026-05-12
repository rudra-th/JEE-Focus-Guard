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
  currentQuestion = null;
  document.getElementById("loadingState").style.display = "block";
  document.getElementById("questionCard").style.display = "none";
  document.getElementById("resultCard").className = "result-card";
  document.getElementById("solutionBox").className = "solution-box";
  document.querySelector(".question-images")?.remove();
  document.querySelector(".solution-images")?.remove();
  const actionButtons = document.getElementById("actionButtons");
  actionButtons.style.display = "none";
  actionButtons.innerHTML = "";

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

  document.getElementById("qText").textContent = cleanQuestionText(q.question);
  document.querySelector(".question-images")?.remove();
  renderImages(q.questionImages, "question-images", document.getElementById("qText"));

  const list = document.getElementById("optionsList");
  list.innerHTML = "";

  if (q.type === "integer") {
    renderIntegerAnswer(list);
    scheduleMathRender();
    return;
  }

  const letters = ["A","B","C","D"];
  (q.options || []).slice(0, 4).forEach((opt, idx) => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.innerHTML = `<span class="option-letter">${letters[idx]}</span><span class="option-text"></span>`;
    btn.querySelector(".option-text").textContent = cleanOptionText(opt);
    btn.addEventListener("click", () => handleAnswer(idx));
    list.appendChild(btn);
  });

  scheduleMathRender();
}

function renderIntegerAnswer(container) {
  const wrap = document.createElement("div");
  wrap.className = "integer-answer";
  wrap.innerHTML = `
    <input class="integer-input" id="integerAnswer" type="text" inputmode="decimal" autocomplete="off" placeholder="Enter numerical answer">
    <button class="btn btn-unlock" id="integerSubmit">Submit</button>
  `;
  container.appendChild(wrap);

  const input = wrap.querySelector("#integerAnswer");
  const submit = wrap.querySelector("#integerSubmit");
  const submitAnswer = () => handleAnswer(input.value.trim());
  submit.addEventListener("click", submitAnswer);
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") submitAnswer();
  });
  setTimeout(() => input.focus(), 50);
}

function renderImages(images, className, anchor) {
  if (!Array.isArray(images) || images.length === 0 || !anchor) return;
  const wrap = document.createElement("div");
  wrap.className = className;
  images.slice(0, 3).forEach(image => {
    if (!image?.src) return;
    if (!/^https?:\/\//i.test(image.src)) return;
    const img = document.createElement("img");
    img.src = image.src;
    img.alt = image.alt || "";
    img.loading = "lazy";
    wrap.appendChild(img);
  });
  if (wrap.children.length > 0) anchor.insertAdjacentElement("afterend", wrap);
}

// ─── Handle Answer ──────────────────────────────────────────────
async function handleAnswer(selectedIdx) {
  if (answered) return;
  if (currentQuestion?.type === "integer" && !String(selectedIdx).trim()) return;
  answered = true;

  const isInteger = currentQuestion?.type === "integer";
  const correctIdx = isInteger ? -1 : getCorrectIndex();
  const isCorrect = isInteger
    ? answersMatch(selectedIdx, getCorrectAnswer())
    : selectedIdx === correctIdx;

  if (isInteger) {
    const wrap = document.querySelector(".integer-answer");
    const input = document.getElementById("integerAnswer");
    const submit = document.getElementById("integerSubmit");
    wrap?.classList.add(isCorrect ? "correct" : "wrong");
    if (input) input.disabled = true;
    if (submit) submit.disabled = true;
  } else {
    document.querySelectorAll(".option-btn").forEach((btn, idx) => {
      btn.classList.add("disabled");
      if (idx === correctIdx) btn.classList.add("correct");
      if (idx === selectedIdx && !isCorrect) btn.classList.add("wrong");
    });
  }

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

function getCorrectAnswer() {
  if (!currentQuestion) return "";
  return currentQuestion.correctAnswer ?? currentQuestion.answer ?? currentQuestion.correct ?? "";
}

function answersMatch(given, expected) {
  const a = normalizeAnswer(given);
  const b = normalizeAnswer(expected);
  if (a === b) return true;

  const na = Number(a);
  const nb = Number(b);
  return Number.isFinite(na) && Number.isFinite(nb) && Math.abs(na - nb) < 1e-9;
}

function normalizeAnswer(value) {
  return String(value ?? "")
    .trim()
    .replace(/^\+/, "")
    .replace(/\.0+$/, "")
    .toLowerCase();
}

function getDisplayAnswer() {
  if (!currentQuestion) return "";
  if (currentQuestion.type === "integer") return String(getCorrectAnswer());
  const idx = getCorrectIndex();
  return currentQuestion.options?.[idx] || "";
}

// ─── Solution ────────────────────────────────────────────────────
function showSolution() {
  const fallback = getDisplayAnswer() ? `Correct answer: ${getDisplayAnswer()}` : "";
  const text = currentQuestion?.solution || fallback;
  if (!text) return;
  const box = document.getElementById("solutionBox");
  document.getElementById("solutionText").textContent = cleanCommonText(text);
  document.querySelector(".solution-images")?.remove();
  renderImages(currentQuestion.solutionImages, "solution-images", document.getElementById("solutionText"));
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
      btn.addEventListener("click", () => { window.location.href = getYouTubeReturnUrl(); });
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
  container.innerHTML = "";

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
    btn.addEventListener("click", () => { window.location.href = getYouTubeReturnUrl(); });
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
  container.innerHTML = "";
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

function cleanQuestionText(value) {
  return cleanCommonText(value)
    .replace(/(?:\$\$|\\\[)?\s*\\begin\{align\*?\}\s*(?:\$\$|\\\])?\s*$/i, "")
    .trim();
}

function cleanOptionText(value) {
  let text = cleanCommonText(value)
    .replace(/\\begin\{(?:align|aligned)\*?\}/gi, "")
    .replace(/\\end\{(?:align|aligned)\*?\}/gi, "")
    .replace(/&/g, " ")
    .replace(/\\quad|\\qquad/gi, " ")
    .replace(/\\\\/g, " ")
    .replace(/^\\(?![a-zA-Z([\]])/, "")
    .replace(/\s*\\$/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (/\\[a-zA-Z]+|[_^]\{|\{.*\}/.test(text) && !/\$\$|\\\(|\\\[|\$[^$]+\$/.test(text)) {
    text = `\\(${text}\\)`;
  }
  return text;
}

function cleanCommonText(value) {
  return normalizeEmbeddedDisplayMath(String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\b([BEIVq])\?/g, "\\($1_0\\)")
    .replace(/\?=\?/g, "\\rightleftharpoons"))
    .trim();
}

function normalizeEmbeddedDisplayMath(text) {
  return text.split("\n").map(line => {
    if (!line.includes("$$")) return line;
    const outsideMath = line.replace(/\$\$[\s\S]*?\$\$/g, "").trim();
    if (!outsideMath) return line;
    return line.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => `\\(${math.trim()}\\)`);
  }).join("\n");
}

function getYouTubeReturnUrl() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("returnUrl") || "";

  try {
    const url = new URL(raw);
    const isYouTube = url.hostname === "youtube.com" || url.hostname.endsWith(".youtube.com");
    if (url.protocol === "https:" && isYouTube) return url.href;
  } catch (e) { /* fall back below */ }

  return "https://www.youtube.com/results?search_query=jee";
}

function sendMessage(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, response => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}
