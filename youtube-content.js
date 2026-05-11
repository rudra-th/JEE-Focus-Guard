// ============================================================
// JEE Focus Guard — YouTube Content Script v1.2
// Blocks non-educational videos AND YouTube Shorts
// ============================================================

(function () {
  "use strict";

  const EDUCATIONAL_KEYWORDS = [
    "jee", "neet", "iit", "physics", "chemistry", "mathematics", "maths", "math",
    "calculus", "lecture", "tutorial", "class 11", "class 12", "ncert",
    "engineering", "medical", "education", "learn", "study", "concept",
    "organic chemistry", "mechanics", "thermodynamics", "algebra",
    "programming", "coding", "computer science", "biology", "science",
    "ted-ed", "khan academy", "unacademy", "byju", "vedantu",
    "physics wallah", "pw", "mit opencourseware", "crash course",
    "explained", "derivation", "proof", "formula", "theorem", "equation",
    "cbse", "jee main", "jee advanced", "bitsat", "olympiad", "gate",
    "class12", "class11", "12th", "11th", "board exam"
  ];

  const EDUCATIONAL_CHANNELS = new Set([
    "physics wallah", "pw", "khan academy", "3blue1brown", "veritasium",
    "vsauce", "ted-ed", "mit opencourseware", "unacademy", "byju",
    "vedantu", "etoos india", "motion education", "allen career",
    "mathologer", "blackpenredpen", "professor leonard", "organic chemistry tutor",
    "crash course", "kurzgesagt", "minutephysics", "smarter every day",
    "numberphile", "computerphile", "neso academy", "gate smashers",
    "apna college", "code with harry", "the organic chemistry tutor",
    "aakash byjus", "motion iit jee", "pw english medium"
  ]);

  let overlayActive = false;
  let lastBlockedUrl = "";
  let navTimer = null;
  let expiryTimer = null;   // fires overlay exactly when unlock window ends

  // ─── Schedule overlay to fire exactly when unlock expires ──
  function scheduleExpiryCheck(unlockedUntil) {
    clearTimeout(expiryTimer);
    if (!unlockedUntil) return;
    const delay = unlockedUntil - Date.now();
    if (delay <= 0) return;   // already expired
    expiryTimer = setTimeout(() => {
      // Re-run the full page check; isUnlocked() will now be false
      overlayActive = false;  // force re-evaluation
      checkCurrentPage();
    }, delay);
  }

  // Listen for storage changes so we schedule the timer the moment
  // the user solves a question (unlockedUntil gets written by background.js)
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.unlockedUntil) {
      const newVal = changes.unlockedUntil.newValue;
      if (newVal && newVal > Date.now()) {
        scheduleExpiryCheck(newVal);
        // If an overlay is currently showing (e.g. user just solved), remove it
        removeOverlay();
      } else {
        clearTimeout(expiryTimer);
      }
    }
  });

  // ─── Quick Shorts guard — runs at document_start ───────────
  // The declarativeNetRequest rule handles direct navigation,
  // but SPA transitions (clicking a Shorts link on YouTube) need this.
  function blockIfShorts() {
    if (window.location.pathname.startsWith("/shorts")) {
      getSettings().then(s => {
        if (s.youtubeFilterEnabled === false) return;
        if (isUnlocked(s)) return;
        showBlockOverlay("shorts");
      });
    }
  }

  // ─── Main check ────────────────────────────────────────────
  async function checkCurrentPage() {
    const path = window.location.pathname;
    const url  = window.location.href;

    // Block Shorts immediately
    if (path.startsWith("/shorts")) {
      const s = await getSettings();
      if (s.youtubeFilterEnabled === false || isUnlocked(s)) { removeOverlay(); return; }
      showBlockOverlay("shorts");
      return;
    }

    // Only inspect /watch pages
    if (!path.includes("/watch")) { removeOverlay(); return; }

    // Don't re-check if we already blocked this exact URL
    if (url === lastBlockedUrl && overlayActive) return;

    removeOverlay();

    const s = await getSettings();
    if (s.youtubeFilterEnabled === false || isUnlocked(s)) return;

    // Wait for title to render
    await waitForTitle(5000);
    await sleep(600);

    if (isPageEducational()) return;

    lastBlockedUrl = url;
    showBlockOverlay("video");
  }

  // ─── Educational Detection ─────────────────────────────────
  function isPageEducational() {
    const title   = getVideoTitle();
    const channel = getChannelName();
    const desc    = getDescription().slice(0, 600);

    if (channel) {
      const cl = channel.toLowerCase();
      if ([...EDUCATIONAL_CHANNELS].some(ec => cl.includes(ec))) return true;
    }

    const combined = `${title} ${channel} ${desc}`.toLowerCase();
    if (EDUCATIONAL_KEYWORDS.some(kw => combined.includes(kw))) return true;

    const cat = getCategory().toLowerCase();
    if (cat.includes("education") || cat.includes("science") || cat.includes("technology")) return true;

    return false;
  }

  // ─── DOM Extractors ────────────────────────────────────────
  function getVideoTitle() {
    const sel = [
      "h1.ytd-watch-metadata yt-formatted-string",
      "#title h1 yt-formatted-string",
      "h1.title yt-formatted-string",
      "#container h1 yt-formatted-string"
    ];
    for (const s of sel) {
      const el = document.querySelector(s);
      if (el?.textContent?.trim()) return el.textContent.trim();
    }
    return document.title.replace(" - YouTube", "").trim();
  }

  function getChannelName() {
    const sel = [
      "#channel-name yt-formatted-string a",
      "ytd-channel-name yt-formatted-string a",
      ".ytd-channel-name a",
      "#owner-name a",
      "#upload-info ytd-channel-name a"
    ];
    for (const s of sel) {
      const el = document.querySelector(s);
      if (el?.textContent?.trim()) return el.textContent.trim();
    }
    return "";
  }

  function getDescription() {
    const sel = [
      "#description-inline-expander yt-formatted-string",
      "#description yt-formatted-string",
      "ytd-text-inline-expander yt-formatted-string"
    ];
    for (const s of sel) {
      const el = document.querySelector(s);
      if (el?.textContent?.trim()) return el.textContent.trim();
    }
    return "";
  }

  function getCategory() {
    for (const el of document.querySelectorAll('script[type="application/ld+json"]')) {
      try { const d = JSON.parse(el.textContent); if (d.genre) return d.genre; } catch (e) {}
    }
    return document.querySelector('meta[itemprop="genre"]')?.content || "";
  }

  // ─── Overlay ────────────────────────────────────────────────
  function showBlockOverlay(type) {
    if (overlayActive) return;
    overlayActive = true;

    // Pause & suppress video
    pauseAllVideos();

    const isShorts = type === "shorts";
    const title = isShorts ? "🚫 YouTube Shorts Blocked" : "📚 Non-Educational Video";
    const body  = isShorts
      ? "YouTube Shorts are blocked to keep you focused on your JEE prep."
      : "This video doesn't appear to be educational content.";

    const overlay = document.createElement("div");
    overlay.id = "fg-overlay";
    overlay.style.cssText = `
      position:fixed;inset:0;
      background:rgba(8,12,24,0.97);
      z-index:2147483647;
      display:flex;align-items:center;justify-content:center;
      font-family:'Segoe UI',system-ui,sans-serif;
      color:#f0f4ff;
      backdrop-filter:blur(12px);
    `;

    // We'll fill unlock-time dynamically
    overlay.innerHTML = `
      <div style="
        text-align:center;max-width:500px;padding:44px 36px;
        background:rgba(20,28,48,0.95);
        border:1px solid rgba(16,185,129,0.25);
        border-radius:24px;
        box-shadow:0 0 80px rgba(16,185,129,0.1);
        position:relative;overflow:hidden;
      ">
        <div style="
          position:absolute;top:0;left:0;right:0;height:3px;
          background:linear-gradient(90deg,#10b981,#3b82f6,#8b5cf6);
        "></div>
        <div style="font-size:56px;margin-bottom:16px;">🎯</div>
        <h2 style="
          font-size:22px;font-weight:900;margin-bottom:10px;
          background:linear-gradient(135deg,#10b981,#34d399);
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;
        ">${title}</h2>
        <p style="color:#94a3b8;font-size:14px;line-height:1.7;margin-bottom:6px;">${body}</p>
        <p id="fg-unlock-info" style="color:#64748b;font-size:13px;margin-bottom:28px;">
          Solve a JEE question to unlock <strong style="color:#10b981;">15 minutes</strong> of browsing.
        </p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
          <button id="fg-solve" style="
            padding:13px 28px;
            background:linear-gradient(135deg,#10b981,#059669);
            color:#fff;border:none;border-radius:12px;
            font-size:15px;font-weight:700;cursor:pointer;
            box-shadow:0 4px 20px rgba(16,185,129,0.3);
          ">🧠 Solve to Unlock</button>
          <button id="fg-back" style="
            padding:13px 22px;
            background:rgba(255,255,255,0.05);
            color:#94a3b8;border:1px solid rgba(255,255,255,0.1);
            border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;
          ">← Go Back</button>
        </div>
        <p style="margin-top:20px;font-size:12px;color:#334155;">
          Already solved? <span id="fg-check" style="color:#10b981;cursor:pointer;text-decoration:underline;">Check unlock status</span>
        </p>
      </div>`;

    document.body.appendChild(overlay);

    // Fill in the actual configured time
    chrome.storage.local.get("unlockMinutes", ({ unlockMinutes }) => {
      const mins = unlockMinutes || 15;
      const info = document.getElementById("fg-unlock-info");
      if (info) info.innerHTML = `Solve a JEE question to unlock <strong style="color:#10b981;">${mins} minute${mins !== 1 ? "s" : ""}</strong> of browsing.`;
    });

    overlay.querySelector("#fg-solve").onclick = () => {
      window.location.href = chrome.runtime.getURL("gate.html?source=youtube");
    };
    overlay.querySelector("#fg-back").onclick = () => window.history.back();
    overlay.querySelector("#fg-check").onclick = async () => {
      const s = await getSettings();
      if (isUnlocked(s)) removeOverlay();
      else {
        const el = document.getElementById("fg-check");
        if (el) el.textContent = "Still locked — solve a question!";
      }
    };

    // Keep suppressing play
    document.addEventListener("play", pauseAllVideos, true);
  }

  function removeOverlay() {
    const el = document.getElementById("fg-overlay");
    if (el) el.remove();
    overlayActive = false;
    document.removeEventListener("play", pauseAllVideos, true);
  }

  function pauseAllVideos() {
    document.querySelectorAll("video").forEach(v => { try { v.pause(); } catch (e) {} });
  }

  // ─── Helpers ───────────────────────────────────────────────
  function getSettings() {
    return new Promise(r => chrome.storage.local.get(["youtubeFilterEnabled", "unlockedUntil"], r));
  }

  function isUnlocked(s) {
    return s.unlockedUntil && Date.now() < s.unlockedUntil;
  }

  function waitForTitle(timeout) {
    const selectors = [
      "h1.ytd-watch-metadata yt-formatted-string",
      "#title h1 yt-formatted-string",
      "h1.title yt-formatted-string"
    ];
    return new Promise(resolve => {
      const find = () => selectors.some(s => document.querySelector(s)?.textContent?.trim());
      if (find()) { resolve(); return; }
      const obs = new MutationObserver(() => { if (find()) { obs.disconnect(); resolve(); } });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); resolve(); }, timeout);
    });
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ─── SPA Navigation (YouTube is a Single Page App) ─────────
  function onNavigate() {
    overlayActive = false;
    clearTimeout(navTimer);
    navTimer = setTimeout(checkCurrentPage, 1200);
  }

  // Intercept pushState / replaceState
  for (const method of ["pushState", "replaceState"]) {
    const orig = history[method].bind(history);
    history[method] = function (...args) {
      orig(...args);
      onNavigate();
    };
  }

  window.addEventListener("popstate", onNavigate);

  // Also watch DOM for URL changes (YouTube sometimes skips history API)
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) { lastUrl = location.href; onNavigate(); }
  }).observe(document.documentElement, { childList: true, subtree: true });

  // Initial check (delayed enough for DOM to be ready)
  setTimeout(checkCurrentPage, 1500);

  // Seed the expiry timer in case we're already inside an unlock window
  chrome.storage.local.get("unlockedUntil", ({ unlockedUntil }) => {
    scheduleExpiryCheck(unlockedUntil);
  });

})();

