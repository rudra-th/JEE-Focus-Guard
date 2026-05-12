// ============================================================
// JEE Focus Guard — YouTube Content Script v1.3
// Blocks non-educational videos, YouTube Shorts (SPA + direct),
// and YouTube homepage/feed browsing.
// ============================================================

(function () {
  "use strict";

  // ─── Educational allow-lists ───────────────────────────────
  // Only STRONG keywords (exam/subject specific) count.
  // Generic words like "science" or "explained" alone are NOT enough.
  const STRONG_KEYWORDS = [
    "jee", "neet", "iit", "ncert", "cbse",
    "jee main", "jee advanced", "bitsat", "olympiad",
    "class 11", "class 12", "class11", "class12", "11th", "12th",
    "board exam", "lecture", "tutorial", "derivation", "proof",
    "khan academy", "unacademy", "byju", "vedantu",
    "physics wallah", "pw", "mit opencourseware", "crash course",
    "etoos", "allen", "motion iit", "aakash",
    "organic chemistry tutor", "professor leonard",
    "3blue1brown", "blackpenredpen", "mathologer",
    "neso academy", "gate smashers", "apna college",
    "physics", "chemistry", "mathematics", "maths", "biology",
    "algebra", "coordinate geometry", "vectors", "matrices",
    "determinants", "complex numbers", "quadratic equations",
    "sequence and series", "permutation", "combination",
    "limits", "continuity", "differential equations",
    "straight lines", "circles", "conic sections", "3d geometry",
    "mole concept", "atomic structure", "chemical bonding",
    "periodic table", "equilibrium", "redox", "solutions",
    "solid state", "metallurgy", "coordination compounds",
    "hydrocarbons", "amines", "biomolecules",
    "laws of motion", "work energy power", "rotational motion",
    "gravitation", "waves", "oscillations", "current electricity",
    "magnetism", "electromagnetic induction", "modern physics",
    "semiconductors", "ray optics", "wave optics",
    "calculus", "thermodynamics", "electrostatics",
    "kinematics", "mechanics lecture", "optics lecture",
    "trigonometry lecture", "integration lecture",
    "differentiation", "binomial theorem", "probability lecture",
    "stoichiometry", "electrochemistry", "chemical kinetics"
  ];

  const EDUCATIONAL_CHANNELS = new Set([
    "physics wallah", "pw", "khan academy", "3blue1brown", "veritasium",
    "vsauce", "ted-ed", "mit opencourseware", "unacademy", "byju's",
    "vedantu", "etoos india", "motion education", "allen career",
    "mathologer", "blackpenredpen", "professor leonard",
    "the organic chemistry tutor", "crash course", "kurzgesagt",
    "minutephysics", "smarter every day", "numberphile", "computerphile",
    "neso academy", "gate smashers", "apna college", "code with harry",
    "aakash byjus", "motion iit jee", "pw english medium",
    "pw - pathshala", "pw foundation", "science and fun",
    "lectures by walter lewin", "mit ocw", "nptel"
  ]);

  // ─── State ─────────────────────────────────────────────────
  let overlayActive   = false;
  let lastBlockedUrl  = "";
  let navTimer        = null;
  let expiryTimer     = null;
  let shortsObserver  = null;
  let shortsObserverTarget = null;
  let shortsTimer     = null;
  let overlayType     = "";
  let bodyReadyPromise = null;
  let lastUrl = location.href;

  // ─── Expiry timer: show overlay exactly when unlock ends ───
  function scheduleExpiryCheck(unlockedUntil) {
    clearTimeout(expiryTimer);
    if (!unlockedUntil) return;
    const delay = unlockedUntil - Date.now();
    if (delay <= 0) return;
    expiryTimer = setTimeout(() => {
      overlayActive  = false;
      lastBlockedUrl = "";
      startShortsObserver();
      checkCurrentPage();
    }, delay + 50);
  }

  // React the moment background.js writes a new unlockedUntil
  chrome.storage.onChanged.addListener((changes) => {
    if (!changes.unlockedUntil && !changes.blockingEnabled && !changes.youtubeFilterEnabled) return;
    if (changes.unlockedUntil) {
      const newVal = changes.unlockedUntil.newValue;
      if (newVal && newVal > Date.now()) {
        scheduleExpiryCheck(newVal);
        removeOverlay();
        stopShortsObserver();
      } else {
        clearTimeout(expiryTimer);
        overlayActive  = false;
        lastBlockedUrl = "";
        startShortsObserver();
        checkCurrentPage();
      }
      return;
    }

    if (changes.blockingEnabled?.newValue === false || changes.youtubeFilterEnabled?.newValue === false) {
      clearTimeout(expiryTimer);
      removeOverlay();
      stopShortsObserver();
      return;
    }

    overlayActive  = false;
    lastBlockedUrl = "";
    startShortsObserver();
    checkCurrentPage();
  });

  // ─── Main page check ───────────────────────────────────────
  async function checkCurrentPage() {
    const path = window.location.pathname;
    const url  = window.location.href;

    const s = await getSettings();
    if (s.youtubeFilterEnabled === false) { removeOverlay(); return; }
    if (isBrowsingAllowed(s))             { removeOverlay(); return; }

    // 1. Shorts
    if (path.startsWith("/shorts")) {
      showBlockOverlay("shorts");
      return;
    }

    // 2. Non-educational /watch video
    if (path.startsWith("/watch")) {
      if (url === lastBlockedUrl && overlayActive) return;
      removeOverlay();

      await waitForTitle(6000);

      // Re-check lock in case user solved while we were waiting
      const s2 = await getSettings();
      if (isBrowsingAllowed(s2)) return;

      if (!isPageEducational()) {
        lastBlockedUrl = url;
        showBlockOverlay("video");
      }
      return;
    }

    // 3. Homepage / feed / trending / channel pages — all blocked.
    //    /results (search) is the only non-watch path we allow so
    //    the user can search for and navigate to educational videos.
    if (!path.startsWith("/results")) {
      showBlockOverlay("feed");
      return;
    }

    removeOverlay();
  }

  // ─── Shorts SPA modal detection ────────────────────────────
  // When clicking a Shorts link from within YouTube, YouTube sometimes
  // renders a <ytd-shorts> element WITHOUT a URL path change.
  // We watch the DOM directly for that element.
  function startShortsObserver() {
    if (shortsObserver) return;
    const target = document.querySelector("ytd-page-manager") || document.querySelector("ytd-app") || document.body;
    if (!target) {
      waitForBody().then(startShortsObserver);
      return;
    }
    shortsObserverTarget = target;

    const checkForShorts = async () => {
      shortsTimer = null;
      if (overlayActive || window.location.pathname.startsWith("/shorts")) return;

      const hasShortsRenderer = !!(
        document.querySelector("ytd-shorts") ||
        document.querySelector("ytd-reel-video-renderer") ||
        document.querySelector("#shorts-container")
      );
      if (!hasShortsRenderer) return;

      const s = await getSettings();
      if (s.youtubeFilterEnabled === false || isBrowsingAllowed(s)) return;
      showBlockOverlay("shorts");
    };

    shortsObserver = new MutationObserver(() => {
      if (shortsTimer || overlayActive) return;
      const betterTarget = document.querySelector("ytd-page-manager") || document.querySelector("ytd-app");
      if (betterTarget && betterTarget !== shortsObserverTarget) {
        stopShortsObserver();
        startShortsObserver();
        return;
      }
      shortsTimer = setTimeout(checkForShorts, 250);
    });
    shortsObserver.observe(target, { childList: true });
    checkForShorts();
  }

  function stopShortsObserver() {
    if (shortsTimer) {
      clearTimeout(shortsTimer);
      shortsTimer = null;
    }
    if (shortsObserver) {
      shortsObserver.disconnect();
      shortsObserver = null;
      shortsObserverTarget = null;
    }
  }

  // ─── Educational Detection ─────────────────────────────────
  function isPageEducational() {
    const title   = getVideoTitle().toLowerCase();
    const channel = getChannelName().toLowerCase();

    // Known educational channel → always allow
    if (channel && [...EDUCATIONAL_CHANNELS].some(ec => channel.includes(ec))) return true;

    // Strong keyword in title OR channel name → allow
    if (STRONG_KEYWORDS.some(kw => title.includes(kw))) return true;

    // YouTube's own structured-data genre — exact "Education" only
    if (getCategory().toLowerCase() === "education") return true;

    return false;
  }

  // ─── DOM Extractors ────────────────────────────────────────
  function getVideoTitle() {
    const selectors = [
      "h1.ytd-watch-metadata yt-formatted-string",
      "#title h1 yt-formatted-string",
      "h1.title yt-formatted-string",
      "#container h1 yt-formatted-string",
      "ytd-watch-metadata h1 yt-formatted-string"
    ];
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el?.textContent?.trim()) return el.textContent.trim();
    }
    return document.title.replace(/ - YouTube$/, "").trim();
  }

  function getChannelName() {
    const selectors = [
      "#channel-name yt-formatted-string a",
      "ytd-channel-name yt-formatted-string a",
      ".ytd-channel-name a",
      "#owner-name a",
      "#upload-info ytd-channel-name a",
      "ytd-video-owner-renderer #channel-name a"
    ];
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el?.textContent?.trim()) return el.textContent.trim();
    }
    return "";
  }

  function getCategory() {
    for (const el of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const d = JSON.parse(el.textContent);
        if (d.genre) return d.genre;
      } catch (e) {}
    }
    return document.querySelector('meta[itemprop="genre"]')?.content || "";
  }

  // ─── Overlay ───────────────────────────────────────────────
  async function showBlockOverlay(type) {
    if (overlayActive && overlayType === type && document.getElementById("fg-overlay")) return;
    await waitForBody();
    if (overlayActive && overlayType === type && document.getElementById("fg-overlay")) return;

    document.getElementById("fg-overlay")?.remove();
    overlayActive = true;
    overlayType = type;
    pauseAllVideos();

    const cfg = {
      shorts: {
        icon:  "🚫",
        title: "YouTube Shorts Blocked",
        body:  "Shorts are blocked to keep you focused on JEE prep.",
        showSearch: false,
      },
      feed: {
        icon:  "📵",
        title: "YouTube Feed Blocked",
        body:  "The YouTube feed is blocked. Search for an educational video below, or solve a question to unlock free browsing.",
        showSearch: true,
      },
      video: {
        icon:  "📚",
        title: "Non-Educational Video",
        body:  "This video doesn't appear to be educational content.",
        showSearch: false,
      },
    }[type] || { icon: "🎯", title: "Blocked", body: "Solve a JEE question to continue.", showSearch: false };

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
        <div style="font-size:56px;margin-bottom:16px;">${cfg.icon}</div>
        <h2 style="
          font-size:22px;font-weight:900;margin-bottom:10px;
          background:linear-gradient(135deg,#10b981,#34d399);
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;
        ">${cfg.title}</h2>
        <p style="color:#94a3b8;font-size:14px;line-height:1.7;margin-bottom:6px;">${cfg.body}</p>
        <p id="fg-unlock-info" style="color:#64748b;font-size:13px;margin-bottom:${cfg.showSearch ? "16px" : "28px"};">
          Solve a JEE question to unlock <strong style="color:#10b981;">15 minutes</strong> of browsing.
        </p>
        ${cfg.showSearch ? `
        <div style="display:flex;gap:8px;margin-bottom:24px;">
          <input id="fg-search" type="text" placeholder="Search educational videos…" style="
            flex:1;padding:11px 16px;
            background:rgba(255,255,255,0.07);
            border:1px solid rgba(16,185,129,0.35);
            border-radius:10px;
            color:#f0f4ff;font-size:14px;outline:none;
            font-family:'Segoe UI',system-ui,sans-serif;
          "/>
          <button id="fg-search-btn" style="
            padding:11px 18px;
            background:linear-gradient(135deg,#3b82f6,#2563eb);
            color:#fff;border:none;border-radius:10px;
            font-size:14px;font-weight:700;cursor:pointer;
            white-space:nowrap;
          ">🔍 Search</button>
        </div>` : ""}
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

    chrome.storage.local.get("unlockMinutes", ({ unlockMinutes }) => {
      const mins = unlockMinutes || 15;
      const info = document.getElementById("fg-unlock-info");
      if (info) info.innerHTML = `Solve a JEE question to unlock <strong style="color:#10b981;">${mins} minute${mins !== 1 ? "s" : ""}</strong> of browsing.`;
    });

    if (cfg.showSearch) {
      const doSearch = () => {
        const q = document.getElementById("fg-search")?.value?.trim();
        if (q) window.location.href = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
      };
      overlay.querySelector("#fg-search-btn").onclick = doSearch;
      overlay.querySelector("#fg-search").addEventListener("keydown", e => {
        if (e.key === "Enter") doSearch();
      });
      // Auto-focus the search box
      setTimeout(() => document.getElementById("fg-search")?.focus(), 50);
    }

    overlay.querySelector("#fg-solve").onclick = () => {
      const params = new URLSearchParams({
        source: type === "shorts" ? "youtube-shorts" : "youtube",
        returnUrl: window.location.href
      });
      window.location.href = chrome.runtime.getURL(`gate.html?${params.toString()}`);
    };
    overlay.querySelector("#fg-back").onclick = () => window.history.back();
    overlay.querySelector("#fg-check").onclick = async () => {
      const s = await getSettings();
      if (isBrowsingAllowed(s)) { removeOverlay(); }
      else {
        const el = document.getElementById("fg-check");
        if (el) el.textContent = "Still locked — solve a question!";
      }
    };

    document.addEventListener("play", pauseAllVideos, true);
  }

  function removeOverlay() {
    const el = document.getElementById("fg-overlay");
    if (el) el.remove();
    overlayActive = false;
    overlayType = "";
    document.removeEventListener("play", pauseAllVideos, true);
  }

  function pauseAllVideos() {
    document.querySelectorAll("video").forEach(v => { try { v.pause(); } catch (e) {} });
  }

  // ─── Helpers ───────────────────────────────────────────────
  function getSettings() {
    return new Promise(r => chrome.storage.local.get(["blockingEnabled", "youtubeFilterEnabled", "unlockedUntil"], r));
  }

  function isUnlocked(s) {
    return s.unlockedUntil && Date.now() < s.unlockedUntil;
  }

  function isBrowsingAllowed(s) {
    return s.blockingEnabled === false || isUnlocked(s);
  }

  function waitForTitle(timeout) {
    const selectors = [
      "h1.ytd-watch-metadata yt-formatted-string",
      "#title h1 yt-formatted-string",
      "h1.title yt-formatted-string",
      "ytd-watch-metadata h1 yt-formatted-string"
    ];
    return new Promise(resolve => {
      let done = false;
      let bodyWatcher = null;
      let timer = null;

      const find = () => selectors.some(s => document.querySelector(s)?.textContent?.trim());
      if (find()) { resolve(); return; }

      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        obs.disconnect();
        if (bodyWatcher) bodyWatcher.disconnect();
        resolve();
      };

      const obs = new MutationObserver(() => { if (find()) finish(); });

      const attachObs = () => obs.observe(document.body, { childList: true, subtree: true });

      if (document.body) {
        attachObs();
      } else {
        // document_start — body not yet available
        bodyWatcher = new MutationObserver(() => {
          if (document.body) {
            bodyWatcher.disconnect();
            bodyWatcher = null;
            attachObs();
            if (find()) finish();
          }
        });
        bodyWatcher.observe(document.documentElement, { childList: true });
      }

      timer = setTimeout(finish, timeout);
    });
  }

  function waitForBody() {
    if (document.body) return Promise.resolve();
    if (bodyReadyPromise) return bodyReadyPromise;

    bodyReadyPromise = new Promise(resolve => {
      const obs = new MutationObserver(() => {
        if (!document.body) return;
        obs.disconnect();
        resolve();
      });
      obs.observe(document.documentElement, { childList: true });
    });

    return bodyReadyPromise;
  }

  // ─── SPA Navigation ────────────────────────────────────────
  function onNavigate() {
    lastUrl = location.href;
    overlayActive = false;
    overlayType = "";
    clearTimeout(navTimer);
    const delay = window.location.pathname.startsWith("/shorts") ? 100 : 800;
    navTimer = setTimeout(checkCurrentPage, delay);
  }

  for (const method of ["pushState", "replaceState"]) {
    const orig = history[method].bind(history);
    history[method] = function (...args) { orig(...args); onNavigate(); };
  }

  window.addEventListener("popstate", onNavigate);

  document.addEventListener("yt-navigate-finish", onNavigate);
  document.addEventListener("yt-page-data-updated", () => {
    if (location.href !== lastUrl) onNavigate();
  });
  setInterval(() => {
    if (location.href !== lastUrl) onNavigate();
  }, 500);

  // ─── Boot ──────────────────────────────────────────────────
  getSettings().then(s => {
    if (s.youtubeFilterEnabled !== false && !isBrowsingAllowed(s)) startShortsObserver();
  });

  if (document.body) {
    setTimeout(checkCurrentPage, 800);
  } else {
    document.addEventListener("DOMContentLoaded", () => setTimeout(checkCurrentPage, 800), { once: true });
  }

  chrome.storage.local.get("unlockedUntil", ({ unlockedUntil }) => {
    scheduleExpiryCheck(unlockedUntil);
  });

})();
