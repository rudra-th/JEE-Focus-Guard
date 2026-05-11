// ============================================================
// JEE Focus Guard — Background Service Worker v1.2
// ============================================================

const DEFAULT_UNLOCK_MINUTES = 15;
const MAX_QUESTIONS = 2000;

const GITHUB_DATA_URLS = [
  "https://raw.githubusercontent.com/HostServer001/jee_mains_pyqs_data_base/main/data/questions.json",
  "https://raw.githubusercontent.com/HostServer001/jee_mains_pyqs_data_base/main/jee_data_base/data/questions.json",
  "https://raw.githubusercontent.com/HostServer001/jee_mains_pyqs_data_base/main/questions.json"
];

const GITHUB_API_CONTENTS = "https://api.github.com/repos/HostServer001/jee_mains_pyqs_data_base/contents/";

// ─── Installation ─────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    await chrome.storage.local.set({
      unlockedUntil: 0,
      totalSolved: 0,
      totalCorrect: 0,
      streak: 0,
      selectedChapters: [],
      blockingEnabled: true,
      youtubeFilterEnabled: true,
      questionBankReady: false,
      unlockMinutes: DEFAULT_UNLOCK_MINUTES
    });
  }
  await fetchQuestionBank();
  ensureAlarm();
});

chrome.runtime.onStartup.addListener(ensureAlarm);

function ensureAlarm() {
  chrome.alarms.get("checkLock", (alarm) => {
    if (!alarm) chrome.alarms.create("checkLock", { periodInMinutes: 0.5 });
  });
}

// ─── Alarm Handler ─────────────────────────────────────────────
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "checkLock" || alarm.name === "reLock") {
    const { unlockedUntil } = await chrome.storage.local.get("unlockedUntil");
    if (unlockedUntil && Date.now() > unlockedUntil) {
      await enableBlockingRules();
    }
  }
});

// ─── Message Handler ───────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    checkLockStatus:    () => handleCheckLock(),
    unlockSites:        () => handleUnlock(),
    getQuestion:        () => handleGetQuestion(message),
    recordAnswer:       () => handleRecordAnswer(message),
    refetchQuestions:   () => fetchQuestionBank().then(() => ({ success: true })),
    loadBuiltinQuestions: () => loadBuiltinOnly().then(() => ({ success: true })),
    getStats:           () => getStats(),
    getUnlockMinutes:   () => getUnlockMinutes(),
    setUnlockMinutes:   () => setUnlockMinutes(message.minutes)
  };

  const handler = handlers[message.action];
  if (handler) {
    handler().then(sendResponse).catch(e => sendResponse({ error: e.message }));
    return true;
  }
});

// ─── Handlers ──────────────────────────────────────────────────
async function handleCheckLock() {
  const { unlockedUntil, blockingEnabled } = await chrome.storage.local.get(["unlockedUntil", "blockingEnabled"]);
  if (blockingEnabled === false) return { locked: false, remaining: 0 };
  const now = Date.now();
  if (unlockedUntil && now < unlockedUntil) return { locked: false, remaining: unlockedUntil - now };
  return { locked: true, remaining: 0 };
}

async function handleUnlock() {
  const { unlockMinutes } = await chrome.storage.local.get("unlockMinutes");
  const mins = (typeof unlockMinutes === "number" && unlockMinutes >= 1 && unlockMinutes <= 20)
    ? unlockMinutes : DEFAULT_UNLOCK_MINUTES;
  const until = Date.now() + mins * 60 * 1000;
  await chrome.storage.local.set({ unlockedUntil: until });
  await disableBlockingRules();
  // Cancel any existing reLock alarm, then set a fresh one
  chrome.alarms.clear("reLock", () => {
    chrome.alarms.create("reLock", { delayInMinutes: mins });
  });
  return { success: true, unlockedUntil: until, minutes: mins };
}

async function handleGetQuestion(message) {
  const { questions, selectedChapters } = await chrome.storage.local.get(["questions", "selectedChapters"]);
  if (!questions || questions.length === 0) {
    return { error: "No questions loaded. Go to Options to fetch the database." };
  }

  let pool = questions;
  if (selectedChapters && selectedChapters.length > 0) {
    const filtered = questions.filter(q =>
      selectedChapters.includes(q.chapter) || selectedChapters.includes(q.subject)
    );
    if (filtered.length > 0) pool = filtered;
  }

  const idx = Math.floor(Math.random() * pool.length);
  return { question: pool[idx] };
}

async function handleRecordAnswer(message) {
  const { totalSolved = 0, totalCorrect = 0, streak = 0 } =
    await chrome.storage.local.get(["totalSolved", "totalCorrect", "streak"]);
  const updates = {
    totalSolved: totalSolved + 1,
    totalCorrect: message.correct ? totalCorrect + 1 : totalCorrect,
    streak: message.correct ? streak + 1 : 0
  };
  await chrome.storage.local.set(updates);
  return updates;
}

async function getStats() {
  return chrome.storage.local.get(["totalSolved", "totalCorrect", "streak", "unlockedUntil"]);
}

async function getUnlockMinutes() {
  const { unlockMinutes } = await chrome.storage.local.get("unlockMinutes");
  return { minutes: unlockMinutes || DEFAULT_UNLOCK_MINUTES };
}

async function setUnlockMinutes(minutes) {
  const mins = Math.max(1, Math.min(20, parseInt(minutes, 10) || DEFAULT_UNLOCK_MINUTES));
  await chrome.storage.local.set({ unlockMinutes: mins });
  return { success: true, minutes: mins };
}

// ─── Blocking Rules ────────────────────────────────────────────
async function enableBlockingRules() {
  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: ["block_rules"] });
  } catch (e) { /* already enabled */ }
}

async function disableBlockingRules() {
  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets({ disableRulesetIds: ["block_rules"] });
  } catch (e) { /* already disabled */ }
}

// ─── Question Bank Fetch ───────────────────────────────────────
async function fetchQuestionBank() {
  for (const url of GITHUB_DATA_URLS) {
    try {
      const resp = await fetch(url, { cache: "no-cache" });
      if (!resp.ok) continue;
      const data = await resp.json();
      if (Array.isArray(data) && data.length > 0) {
        await storeQuestions(normalizeQuestions(data).slice(0, MAX_QUESTIONS));
        return;
      }
    } catch (e) { /* try next */ }
  }

  // API crawl fallback
  try {
    const questions = await crawlRepoForJSON("");
    if (questions.length > 0) {
      await storeQuestions(questions.slice(0, MAX_QUESTIONS));
      return;
    }
  } catch (e) { /* fall through */ }

  await loadBuiltinOnly();
}

async function loadBuiltinOnly() {
  try {
    const resp = await fetch(chrome.runtime.getURL("data/questions.json"));
    const data = await resp.json();
    await storeQuestions(normalizeQuestions(Array.isArray(data) ? data : []));
  } catch (e) {
    await storeQuestions(getHardcodedQuestions());
  }
}

async function crawlRepoForJSON(path) {
  const resp = await fetch(GITHUB_API_CONTENTS + path, {
    headers: { "Accept": "application/vnd.github.v3+json" }
  });
  if (!resp.ok) return [];

  const items = await resp.json();
  let all = [];

  for (const item of items) {
    if (item.type === "file" && item.name.endsWith(".json") && item.size < 10_000_000) {
      try {
        const fileResp = await fetch(item.download_url);
        const fileData = await fileResp.json();
        if (Array.isArray(fileData)) {
          all = all.concat(normalizeQuestions(fileData.filter(q => q.question || q.text || q.problem)));
        } else if (typeof fileData === "object") {
          for (const key of Object.keys(fileData)) {
            if (Array.isArray(fileData[key])) {
              all = all.concat(normalizeQuestions(fileData[key].filter(q => q.question || q.text || q.problem), key));
            }
          }
        }
      } catch (e) { /* skip malformed */ }
    } else if (item.type === "dir" && !item.name.startsWith(".")) {
      all = all.concat(await crawlRepoForJSON(item.path));
    }
  }
  return all;
}

function normalizeQuestions(rawQuestions, defaultChapter = "General") {
  return rawQuestions.map((q, i) => ({
    id: q.id || `q_${Date.now()}_${i}`,
    question: q.question || q.text || q.problem || q.Question || "",
    options: q.options || q.Options || q.choices || [
      q.option_a || q.optionA || q.a || "(A)",
      q.option_b || q.optionB || q.b || "(B)",
      q.option_c || q.optionC || q.c || "(C)",
      q.option_d || q.optionD || q.d || "(D)"
    ],
    correct: q.correct ?? q.answer ?? q.correct_answer ?? q.Answer ?? q.correctAnswer ?? 0,
    solution: q.solution || q.explanation || q.Solution || q.Explanation || "",
    chapter: q.chapter || q.Chapter || q.topic || q.Topic || defaultChapter,
    subject: q.subject || q.Subject || detectSubject(q.chapter || q.topic || defaultChapter),
    year: q.year || q.Year || "",
    difficulty: q.difficulty || "Medium"
  })).filter(q => q.question && Array.isArray(q.options) && q.options.length >= 2);
}

function detectSubject(chapter) {
  const ch = (chapter || "").toLowerCase();
  const physics = ["mechanics","kinematics","thermodynamics","electrostatics","magnetism","optics","waves","gravitation","fluid","rotation","oscillation","current","electromagnetic","modern physics","semiconductor","ray optics","wave optics","alternating current","units","motion","work, energy","laws of motion"];
  const chemistry = ["organic","inorganic","equilibrium","solutions","electrochemistry","kinetics","surface","periodic","bonding","hydrogen","s-block","p-block","d-block","f-block","coordination","polymer","biomolecule","aldehyde","ketone","alcohol","phenol","ether","amine","carboxylic","hydrocarbon","halide","metallurgy","chemical","mole","stoichiometry","atomic structure","redox","solid state","gaseous"];
  const maths = ["algebra","calculus","trigonometry","geometry","probability","statistics","vector","matrix","determinant","complex","quadratic","sequence","series","binomial","permutation","combination","function","limit","continuity","differentiation","integration","differential equation","conic","circle","parabola","ellipse","hyperbola","straight line","3d geometry","area under","sets","relations"];

  if (physics.some(k => ch.includes(k))) return "Physics";
  if (chemistry.some(k => ch.includes(k))) return "Chemistry";
  if (maths.some(k => ch.includes(k))) return "Mathematics";
  return "General";
}

async function storeQuestions(questions) {
  const chapterSet = new Set(questions.map(q => q.chapter).filter(Boolean));
  await chrome.storage.local.set({
    questions,
    availableChapters: [...chapterSet].sort(),
    questionBankReady: true,
    questionCount: questions.length,
    lastFetched: Date.now()
  });
}

// ─── Hardcoded Fallback ────────────────────────────────────────
function getHardcodedQuestions() {
  return [
    { id:"p1", chapter:"Kinematics", subject:"Physics",
      question:"A ball is thrown vertically upwards with \\(20\\,\\text{m/s}\\) from the top of a 25 m building. Time to reach ground? \\((g=10\\,\\text{m/s}^2)\\)",
      options:["5 s","3 s","2 s","4 s"], correct:0,
      solution:"Using \\(s=ut+\\frac{1}{2}at^2\\) with \\(s=-25,u=20,a=-10\\): \\(5t^2-20t-25=0\\Rightarrow t=5\\,\\text{s}\\)"
    },
    { id:"p2", chapter:"Laws of Motion", subject:"Physics",
      question:"A block on a smooth incline of angle \\(\\theta\\) has acceleration:",
      options:["\\(g\\sin\\theta\\)","\\(g\\cos\\theta\\)","\\(g\\)","\\(g\\tan\\theta\\)"], correct:0,
      solution:"Net force along plane \\(=mg\\sin\\theta\\Rightarrow a=g\\sin\\theta\\)"
    },
    { id:"p3", chapter:"Work, Energy and Power", subject:"Physics",
      question:"KE of a 2 kg body moving at 4 m/s:",
      options:["16 J","8 J","32 J","4 J"], correct:0,
      solution:"\\(KE=\\frac{1}{2}mv^2=\\frac{1}{2}(2)(16)=16\\,J\\)"
    },
    { id:"p4", chapter:"Thermodynamics", subject:"Physics",
      question:"Quantity constant in an adiabatic process for ideal gas:",
      options:["\\(PV^\\gamma\\)","\\(PV\\)","\\(P/V\\)","\\(TV^2\\)"], correct:0,
      solution:"Adiabatic: \\(PV^\\gamma=\\text{const}\\) where \\(\\gamma=C_p/C_v\\)"
    },
    { id:"p5", chapter:"Oscillations", subject:"Physics",
      question:"Time period of simple pendulum of length \\(l\\):",
      options:["\\(2\\pi\\sqrt{l/g}\\)","\\(2\\pi\\sqrt{g/l}\\)","\\(\\frac{1}{2\\pi}\\sqrt{l/g}\\)","\\(\\frac{1}{2\\pi}\\sqrt{g/l}\\)"], correct:0,
      solution:"SHM: \\(T=2\\pi\\sqrt{l/g}\\)"
    },
    { id:"c1", chapter:"Atomic Structure", subject:"Chemistry",
      question:"Max electrons in sub-shell with \\(l=3\\):",
      options:["14","10","6","2"], correct:0,
      solution:"\\(l=3\\) (f-subshell): \\(2(2l+1)=14\\)"
    },
    { id:"c2", chapter:"Chemical Equilibrium", subject:"Chemistry",
      question:"For \\(N_2+3H_2\\rightleftharpoons 2NH_3\\), \\(K_c\\) in terms of \\(K_p\\):",
      options:["\\(K_c=K_p(RT)^2\\)","\\(K_c=K_p/(RT)^2\\)","\\(K_c=K_p\\cdot RT\\)","\\(K_c=K_p\\)"], correct:0,
      solution:"\\(\\Delta n_g=2-4=-2\\), so \\(K_c=K_p(RT)^2\\)"
    },
    { id:"c3", chapter:"Redox Reactions", subject:"Chemistry",
      question:"Oxidation state of Mn in \\(KMnO_4\\):",
      options:["+7","+6","+4","+2"], correct:0,
      solution:"\\((+1)+x+4(-2)=0\\Rightarrow x=+7\\)"
    },
    { id:"c4", chapter:"Chemical Kinetics", subject:"Chemistry",
      question:"Half-life of a first-order reaction:",
      options:["\\(0.693/k\\)","\\(0.693/k^2\\)","\\(1/k\\)","\\(2.303/k\\)"], correct:0,
      solution:"\\(t_{1/2}=\\ln2/k=0.693/k\\) (independent of concentration)"
    },
    { id:"m1", chapter:"Trigonometry", subject:"Mathematics",
      question:"\\(\\sin^2\\theta+\\cos^2\\theta=\\)?",
      options:["1","0","\\(\\sin2\\theta\\)","\\(\\cos2\\theta\\)"], correct:0,
      solution:"Pythagorean identity: always 1"
    },
    { id:"m2", chapter:"Complex Numbers", subject:"Mathematics",
      question:"Modulus of \\(z=3+4i\\):",
      options:["5","7","\\(\\sqrt{7}\\)","25"], correct:0,
      solution:"\\(|z|=\\sqrt{9+16}=5\\)"
    },
    { id:"m3", chapter:"Probability", subject:"Mathematics",
      question:"Probability of sum 7 with two dice:",
      options:["\\(1/6\\)","\\(1/12\\)","\\(1/36\\)","\\(7/36\\)"], correct:0,
      solution:"6 favourable outcomes out of 36: \\(P=1/6\\)"
    },
    { id:"m4", chapter:"Limits and Derivatives", subject:"Mathematics",
      question:"\\(\\lim_{x\\to0}\\frac{\\sin x}{x}=\\)?",
      options:["1","0","\\(\\infty\\)","-1"], correct:0,
      solution:"Standard limit = 1"
    }
  ];
}
