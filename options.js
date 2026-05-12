// ============================================================
// JEE Focus Guard — Options v1.2
// ============================================================

const CLASS_11_CHAPTERS = {
  "Physics": [
    "Units and Measurements","Kinematics","Laws of Motion",
    "Work, Energy and Power","System of Particles and Rotational Motion",
    "Rotational Motion","Gravitation","Properties of Matter",
    "Mechanical Properties of Solids","Mechanical Properties of Fluids",
    "Fluid Mechanics","Thermal Properties of Matter","Thermodynamics",
    "Kinetic Theory of Gases","Oscillations","Waves"
  ],
  "Chemistry": [
    "Some Basic Concepts of Chemistry","Stoichiometry","Atomic Structure",
    "Structure of Atom","Classification of Elements and Periodicity",
    "Periodic Table","Chemical Bonding and Molecular Structure",
    "Chemical Bonding","States of Matter","Chemical Thermodynamics",
    "Thermodynamics","Chemical Equilibrium","Equilibrium",
    "Redox Reactions","Hydrogen","s-Block Elements","p-Block Elements",
    "Organic Chemistry - Basics","Organic Chemistry - Some Basic Principles",
    "Hydrocarbons","Environmental Chemistry","Solutions",
    "Electrochemistry","Chemical Kinetics"
  ],
  "Mathematics": [
    "Sets and Relations","Sets","Relations and Functions",
    "Trigonometric Functions","Trigonometry","Complex Numbers",
    "Complex Numbers and Quadratic Equations","Quadratic Equations",
    "Linear Inequalities","Permutations and Combinations",
    "Binomial Theorem","Sequences and Series","Straight Lines",
    "Straight Lines and Circles","Conic Sections",
    "Introduction to Three Dimensional Geometry","Three Dimensional Geometry",
    "Limits and Derivatives","Limits, Continuity and Differentiability",
    "Differential Equations","Integral Calculus","Functions and Relations",
    "Mathematical Reasoning","Statistics","Probability","Matrices",
    "Determinants","Matrices and Determinants","Vector Algebra",
    "Mathematics - Mixed"
  ]
};

let selectedChapters = new Set();
let chapterGroups = CLASS_11_CHAPTERS;

function normalizeName(value, fallback = "General") {
  return String(value || fallback).replace(/\s+/g, " ").trim() || fallback;
}

function chapterKey(subject, chapter) {
  return `${normalizeName(subject)}::${normalizeName(chapter)}`;
}

function isChapterSelected(subject, chapter) {
  const subj = normalizeName(subject);
  const ch = normalizeName(chapter);
  return selectedChapters.has(chapterKey(subj, ch))
    || selectedChapters.has(ch)
    || selectedChapters.has(subj);
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();
  renderChapterList();
  setupEventListeners();
  await updateDbStatus();
});

async function loadSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(
      ["selectedChapters","blockingEnabled","youtubeFilterEnabled","unlockMinutes","questions"],
      data => {
        if (data.selectedChapters?.length > 0) selectedChapters = new Set(data.selectedChapters);
        if (Array.isArray(data.questions) && data.questions.length > 0) {
          chapterGroups = groupChaptersBySubject(data.questions);
        }
        selectedChapters = migrateStoredSelection(selectedChapters, chapterGroups);

        document.getElementById("toggleBlocking").checked  = data.blockingEnabled  !== false;
        document.getElementById("toggleYoutube").checked   = data.youtubeFilterEnabled !== false;

        const mins = (typeof data.unlockMinutes === "number") ? data.unlockMinutes : 15;
        const slider = document.getElementById("unlockMinutes");
        const label  = document.getElementById("unlockMinutesLabel");
        slider.value = mins;
        label.textContent = minsLabel(mins);
        resolve();
      }
    );
  });
}

function minsLabel(m) {
  return `${m} minute${m !== 1 ? "s" : ""} per question`;
}

function groupChaptersBySubject(questions) {
  const groups = {};
  questions.forEach(q => {
    const subject = normalizeName(q.subject);
    const chapter = normalizeName(q.chapter);
    if (!groups[subject]) groups[subject] = new Map();
    const key = chapter.toLowerCase();
    if (!groups[subject].has(key)) groups[subject].set(key, chapter);
  });

  return Object.fromEntries(
    Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([subject, chapters]) => [
        subject,
        [...chapters.values()].sort((a, b) => a.localeCompare(b))
      ])
  );
}

function renderChapterList() {
  const container = document.getElementById("chapterList");
  container.innerHTML = "";
  const icons = { Physics:"⚡", Chemistry:"🧪", Mathematics:"📐" };

  for (const [subj, chapters] of Object.entries(chapterGroups)) {
    const group = document.createElement("div");
    group.className = "subject-group";
    group.dataset.subject = subj;
    group.innerHTML = `
      <div class="subject-header">
        ${icons[subj] || "📖"} ${subj}
        <span style="font-size:11px;color:#64748b;font-weight:400;">(${chapters.length} chapters)</span>
      </div>`;

    const grid = document.createElement("div");
    grid.className = "chapter-grid";

    chapters.forEach(ch => {
      const item = document.createElement("label");
      const key = chapterKey(subj, ch);
      item.className = `chapter-item${isChapterSelected(subj, ch) ? " selected" : ""}`;

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = isChapterSelected(subj, ch);
      cb.addEventListener("change", () => {
        if (cb.checked) { selectedChapters.add(key); item.classList.add("selected"); }
        else            {
          selectedChapters.delete(key);
          selectedChapters.delete(ch);
          item.classList.remove("selected");
        }
      });

      const lbl = document.createElement("span");
      lbl.textContent = ch;

      item.appendChild(cb);
      item.appendChild(lbl);
      grid.appendChild(item);
    });

    group.appendChild(grid);
    container.appendChild(group);
  }
}

function migrateStoredSelection(selection, groups) {
  const migrated = new Set();
  for (const selected of selection) {
    const value = normalizeName(selected, "");
    if (!value) continue;
    if (value.includes("::")) {
      migrated.add(value);
      continue;
    }
    for (const [subject, chapters] of Object.entries(groups)) {
      if (value === subject) {
        chapters.forEach(chapter => migrated.add(chapterKey(subject, chapter)));
      } else {
        chapters
          .filter(chapter => value === chapter)
          .forEach(chapter => migrated.add(chapterKey(subject, chapter)));
      }
    }
  }
  return migrated;
}

function setupEventListeners() {
  // Chapter filters
  document.getElementById("filterAll").addEventListener("click",       () => selectBySubject(null, true));
  document.getElementById("filterNone").addEventListener("click",      () => selectBySubject(null, false));
  document.getElementById("filterPhysics").addEventListener("click",   () => selectBySubject("Physics", true, true));
  document.getElementById("filterChemistry").addEventListener("click", () => selectBySubject("Chemistry", true, true));
  document.getElementById("filterMaths").addEventListener("click",     () => selectBySubject("Mathematics", true, true));

  document.getElementById("btnSaveChapters").addEventListener("click", async () => {
    await chrome.storage.local.set({ selectedChapters: [...selectedChapters] });
    showToast("✅ Chapter selection saved!");
  });

  // Unlock minutes slider
  const slider = document.getElementById("unlockMinutes");
  const label  = document.getElementById("unlockMinutesLabel");
  slider.addEventListener("input", () => { label.textContent = minsLabel(parseInt(slider.value, 10)); });
  slider.addEventListener("change", async () => {
    const mins = parseInt(slider.value, 10);
    await chrome.storage.local.set({ unlockMinutes: mins });
    chrome.runtime.sendMessage({ action: "setUnlockMinutes", minutes: mins });
    showToast(`⏱️ Unlock time set to ${minsLabel(mins)}`);
  });

  // Toggles
  document.getElementById("toggleBlocking").addEventListener("change", async e => {
    await sendMessage({ action: "setBlockingEnabled", enabled: e.target.checked });
    showToast(e.target.checked ? "🛡️ Blocking enabled" : "⚠️ Blocking disabled");
  });
  document.getElementById("toggleYoutube").addEventListener("change", async e => {
    await sendMessage({ action: "setYoutubeFilterEnabled", enabled: e.target.checked });
    showToast(e.target.checked ? "📺 YouTube filter on" : "📺 YouTube filter off");
  });

  // DB buttons
  document.getElementById("btnRefetch").addEventListener("click", async () => {
    setDbStatus("loading", "Reloading local question bank...");
    chrome.runtime.sendMessage({ action: "refetchQuestions" }, async () => {
      await updateDbStatus();
      showToast("Question bank reloaded!");
    });
  });
  document.getElementById("btnLoadFallback").addEventListener("click", async () => {
    setDbStatus("loading", "Loading built-in questions…");
    chrome.runtime.sendMessage({ action: "loadBuiltinQuestions" }, async () => {
      await updateDbStatus();
      showToast("✅ Built-in questions loaded!");
    });
  });

  // Stats & reset
  document.getElementById("btnResetStats").addEventListener("click", async () => {
    await chrome.storage.local.set({ totalSolved: 0, totalCorrect: 0, streak: 0 });
    showToast("📊 Stats reset!");
  });
  document.getElementById("btnResetQuestionHistory").addEventListener("click", async () => {
    await sendMessage({ action: "resetQuestionHistory" });
    showToast("Question history reset!");
  });
  document.getElementById("btnResetAll").addEventListener("click", async () => {
    if (confirm("Reset ALL data (questions + stats)? This cannot be undone.")) {
      await chrome.storage.local.clear();
      showToast("🗑️ All data cleared. Reloading…");
      setTimeout(() => location.reload(), 1500);
    }
  });
}

function selectBySubject(subject, select, exclusive = false) {
  if (exclusive) selectedChapters.clear();
  if (subject === null && select === false) selectedChapters.clear();
  for (const [subj, chapters] of Object.entries(chapterGroups)) {
    if (subject === null || subj === subject) {
      chapters.forEach(ch => {
        const key = chapterKey(subj, ch);
        if (select) selectedChapters.add(key);
        else {
          selectedChapters.delete(key);
          selectedChapters.delete(ch);
        }
      });
    }
  }
  document.querySelectorAll(".chapter-item").forEach(item => {
    const cb = item.querySelector("input[type='checkbox']");
    const name = item.querySelector("span").textContent;
    const subject = item.closest(".subject-group")?.dataset.subject || "";
    const checked = isChapterSelected(subject, name);
    cb.checked = checked;
    item.classList.toggle("selected", checked);
  });
}

function setDbStatus(state, text) {
  const dot  = document.getElementById("dbDot");
  const span = document.getElementById("dbStatusText");
  dot.className = state === "loading" ? "dot loading" : state === "error" ? "dot error" : "dot";
  span.textContent = text;
}

async function updateDbStatus() {
  return new Promise(resolve => {
    chrome.storage.local.get(["questionBankReady","questionCount","lastFetched"], data => {
      if (data.questionBankReady) {
        const date = data.lastFetched ? new Date(data.lastFetched).toLocaleString() : "Unknown";
        setDbStatus("ok", `${data.questionCount || 0} questions loaded · Last fetched: ${date}`);
      } else {
        setDbStatus("error", "No questions loaded. Click 'Reload Local Bank' or 'Load Built-in'.");
      }
      resolve();
    });
  });
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, response => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}
