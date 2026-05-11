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
    "Conic Sections","Introduction to Three Dimensional Geometry",
    "Limits and Derivatives","Mathematical Reasoning",
    "Statistics","Probability","Matrices","Determinants"
  ]
};

let selectedChapters = new Set();

document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();
  renderChapterList();
  setupEventListeners();
  await updateDbStatus();
});

async function loadSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(
      ["selectedChapters","blockingEnabled","youtubeFilterEnabled","unlockMinutes"],
      data => {
        if (data.selectedChapters?.length > 0) selectedChapters = new Set(data.selectedChapters);

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

function renderChapterList() {
  const container = document.getElementById("chapterList");
  container.innerHTML = "";
  const icons = { Physics:"⚡", Chemistry:"🧪", Mathematics:"📐" };

  for (const [subj, chapters] of Object.entries(CLASS_11_CHAPTERS)) {
    const group = document.createElement("div");
    group.className = "subject-group";
    group.innerHTML = `
      <div class="subject-header">
        ${icons[subj] || "📖"} ${subj}
        <span style="font-size:11px;color:#64748b;font-weight:400;">(${chapters.length} chapters)</span>
      </div>`;

    const grid = document.createElement("div");
    grid.className = "chapter-grid";

    chapters.forEach(ch => {
      const item = document.createElement("label");
      item.className = `chapter-item${selectedChapters.has(ch) ? " selected" : ""}`;

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = selectedChapters.has(ch);
      cb.addEventListener("change", () => {
        if (cb.checked) { selectedChapters.add(ch); item.classList.add("selected"); }
        else            { selectedChapters.delete(ch); item.classList.remove("selected"); }
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
    await chrome.storage.local.set({ blockingEnabled: e.target.checked });
    showToast(e.target.checked ? "🛡️ Blocking enabled" : "⚠️ Blocking disabled");
  });
  document.getElementById("toggleYoutube").addEventListener("change", async e => {
    await chrome.storage.local.set({ youtubeFilterEnabled: e.target.checked });
    showToast(e.target.checked ? "📺 YouTube filter on" : "📺 YouTube filter off");
  });

  // DB buttons
  document.getElementById("btnRefetch").addEventListener("click", async () => {
    setDbStatus("loading", "Fetching from GitHub…");
    chrome.runtime.sendMessage({ action: "refetchQuestions" }, async () => {
      await updateDbStatus();
      showToast("✅ Question bank refreshed!");
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
  for (const [subj, chapters] of Object.entries(CLASS_11_CHAPTERS)) {
    if (subject === null || subj === subject) {
      chapters.forEach(ch => select ? selectedChapters.add(ch) : selectedChapters.delete(ch));
    }
  }
  document.querySelectorAll(".chapter-item").forEach(item => {
    const cb = item.querySelector("input[type='checkbox']");
    const name = item.querySelector("span").textContent;
    cb.checked = selectedChapters.has(name);
    item.classList.toggle("selected", selectedChapters.has(name));
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
        setDbStatus("error", "No questions loaded. Click 'Re-fetch' or 'Load Built-in'.");
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
