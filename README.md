# JEE Focus Guard

A Chrome Manifest V3 extension for JEE aspirants that blocks distracting sites and requires solving real JEE questions to earn browsing time.

## How It Works

When you visit a blocked site, you're redirected to a question page with a genuine JEE Main/AIEEE MCQ or integer-type question (Physics, Chemistry, or Mathematics). Answer correctly to unlock the site for a configurable duration (1–20 minutes). On YouTube, non-educational videos, Shorts, and the homepage feed are blocked with an overlay — solve a question to continue watching.

## Features

- **Site blocking** — Instagram, Facebook, Twitter/X, Reddit, TikTok, Snapchat, Netflix, Twitch, Discord, and YouTube Shorts blocked via `declarativeNetRequest`
- **Smart YouTube filtering** — blocks Shorts (URL + SPA modal), homepage feed, trending, channel pages, and non-educational `/watch` videos by analyzing titles against JEE keywords and known educational channels
- **1000+ real JEE questions** — sourced from JEE Main / AIEEE (2003–2024) spanning Physics, Chemistry, and Mathematics, with solutions and images
- **Custom LaTeX renderer** (`lib/jeemath.js`) — zero-dependency math renderer for fractions, integrals, matrices, Greek letters, and more
- **Chapter/subject filter** — choose which topics questions come from
- **Statistics tracking** — total solved, accuracy percentage, streak
- **Dark-themed UI** — consistent dark design across popup, options, and gate pages

## Installation

### From a release (recommended)

1. Go to the [Releases page](https://github.com/rudra-th/JEE-Focus-Guard/releases)
2. Download the latest `JEE-Focus-Guard-v*.zip` asset
3. Extract the ZIP to a folder on your computer
4. Open Chrome and go to `chrome://extensions/`
5. Enable **Developer mode** (top-right toggle)
6. Click **Load unpacked** and select the extracted folder

### From source

```bash
git clone https://github.com/rudra-th/JEE-Focus-Guard.git
```

Then follow steps 4–6 above, selecting the cloned folder.

## Usage

1. Click the extension icon to open the popup and check lock status
2. Visit a blocked site — you'll be prompted to solve a JEE question
3. Answer correctly to unlock for the configured time (default 15 min)
4. While unlocked, browse freely until the timer expires
5. Right-click the icon > **Options** to tweak settings:
   - Unlock duration
   - Enable/disable blocking or YouTube filtering
   - Filter questions by chapter/subject
   - Reset stats or question history

## File Structure

```
├── manifest.json            # Extension manifest (MV3)
├── background.js            # Service worker — state, alarms, blocking rules
├── popup.html / popup.js    # Popup — lock status and stats
├── options.html / options.js# Options — settings, chapter filter, reset
├── gate.html / gate.js      # Question gate — MCQ/integer solving page
├── youtube-content.js       # YouTube content script — overlay and filtering
├── data/questions.json      # 1000+ JEE questions (~17 MB)
├── rules/blocking_rules.json# DeclarativeNetRequest rules
├── lib/
│   ├── jeemath.js           # Custom LaTeX math renderer
│   └── jeemath.css          # Math renderer styles
└── icons/                   # Extension icons (16/48/128)
```

## Configuration

| Setting | Default | Description |
|---|---|---|
| Unlock time | 15 min | Browsing time earned per correct answer (1–20 min) |
| Blocking enabled | On | Master toggle for site blocking |
| YouTube filter | On | Enables intelligent YouTube content filtering |
| Chapter filter | All | Restrict questions to specific subjects/chapters |

## Technology

- Manifest V3 (service worker, `declarativeNetRequest`, Chrome Alarms API)
- Vanilla JavaScript — no frameworks or bundlers
- Custom LaTeX math renderer (`jeemath.js`) — no external math libraries
- Chrome Storage API for persistence

## Author

Rudra
