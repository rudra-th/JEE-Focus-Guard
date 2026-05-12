/**
 * JEE Focus Guard — Minimal Math Renderer
 * Handles the LaTeX patterns actually used in JEE questions.
 * No external dependencies. ~5 KB.
 */
(function (global) {
  "use strict";

  // ── Greek letters ──────────────────────────────────────────
  const GREEK = {
    alpha:"α", beta:"β", gamma:"γ", delta:"δ", epsilon:"ε", zeta:"ζ",
    eta:"η", theta:"θ", iota:"ι", kappa:"κ", lambda:"λ", mu:"μ",
    nu:"ν", xi:"ξ", pi:"π", rho:"ρ", sigma:"σ", tau:"τ",
    upsilon:"υ", phi:"φ", chi:"χ", psi:"ψ", omega:"ω",
    Gamma:"Γ", Delta:"Δ", Theta:"Θ", Lambda:"Λ", Xi:"Ξ", Pi:"Π",
    Sigma:"Σ", Upsilon:"Υ", Phi:"Φ", Psi:"Ψ", Omega:"Ω",
    // Aliases
    varepsilon:"ε", varphi:"φ", vartheta:"ϑ"
  };

  // ── Named symbols ──────────────────────────────────────────
  const SYMBOLS = {
    // Operators
    times:"×", cdot:"·", div:"÷", pm:"±", mp:"∓",
    leq:"≤", geq:"≥", neq:"≠", approx:"≈", equiv:"≡",
    sim:"∼", propto:"∝", infty:"∞",
    // Arrows
    rightarrow:"→", leftarrow:"←", Rightarrow:"⇒", Leftarrow:"⇐",
    leftrightarrow:"↔", Leftrightarrow:"⟺", implies:"⟹",
    to:"→",
    // Sets / logic
    in:"∈", notin:"∉", subset:"⊂", subseteq:"⊆", cup:"∪", cap:"∩",
    emptyset:"∅", forall:"∀", exists:"∃", neg:"¬", land:"∧", lor:"∨",
    // Misc math — NOTE: int/sum/prod/sqrt intentionally omitted here;
    // they are handled by dedicated branches below (mlim-op / sqrt handler).
    partial:"∂", nabla:"∇",
    ldots:"…", cdots:"⋯", vdots:"⋮", ddots:"⋱",
    because:"∵", therefore:"∴",
    angle:"∠", perp:"⊥", parallel:"∥",
    // Text spacing — quad/qquad also have dedicated handlers below but SYMBOLS catches them fine
    quad:" ", qquad:"  ",
    // Silent no-ops for bracket-sizing commands
    left:"", right:"", bigg:"", big:"", Big:"", Bigg:"",
    displaystyle:"", textstyle:"", scriptstyle:"",
    // NOTE: text/mathrm/mathbf/mathit/mathbb/boldsymbol are handled by the dedicated
    // text branch above and intentionally NOT listed here to avoid shadowing.
    // NOTE: vec/hat/bar/tilde/dot/ddot/overline/underline/widehat/widetilde are handled
    // by the decorator branch above and intentionally NOT listed here.
  };

  // ── Tokeniser ──────────────────────────────────────────────
  function tokenise(src) {
    const tokens = [];
    let i = 0;
    while (i < src.length) {
      if (src[i] === "\\") {
        // command
        let j = i + 1;
        if (j < src.length && /[a-zA-Z]/.test(src[j])) {
          while (j < src.length && /[a-zA-Z]/.test(src[j])) j++;
          tokens.push({ type:"cmd", val:src.slice(i+1, j) });
        } else {
          tokens.push({ type:"char", val:src[j] || "\\" });
          j++;
        }
        i = j;
      } else {
        tokens.push({ type:"char", val:src[i] });
        i++;
      }
    }
    return tokens;
  }

  function normalizeLatex(src) {
    let out = String(src || "")
      .replace(/\\,/g, " ")
      .replace(/\\left\s*/g, "")
      .replace(/\\right\s*/g, "");

    for (let i = 0; i < 4; i++) {
      out = out.replace(/\{\{([\s\S]*?)\}\s+\\over\s+([^{}\\]+)\}/g, "\\frac{$1}{$2}");
      out = out.replace(/\{([^{}\\]+)\s+\\over\s+\{([\s\S]*?)\}\}/g, "\\frac{$1}{$2}");
      out = out.replace(/\{([^{}]+)\s+\\over\s+([^{}]+)\}/g, "\\frac{$1}{$2}");
      out = out.replace(/\{\{([^{}]+)\}\s+\\over\s+\{([^{}]+)\}\}/g, "\\frac{$1}{$2}");
      out = out.replace(/\{\{([^{}]+)\}\s+\\over\s+([^{}]+)\}/g, "\\frac{$1}{$2}");
    }

    // Fix 1: Handle bare top-level \over (no enclosing braces), e.g. "a \over b"
    // Wrap entire expression around \over into \frac{...}{...}
    if (/\\over\b/.test(out)) {
      out = out.replace(/([^{}]+?)\s*\\over\s*([^{}]+)/g, "\\frac{$1}{$2}");
    }

    return out;
  }

  // ── Recursive parser ───────────────────────────────────────
  // Returns HTML string. pos is advanced by reference via array[0].
  function parseGroup(tokens, pos, stopAt) {
    let html = "";
    while (pos[0] < tokens.length) {
      const tok = tokens[pos[0]];
      if (stopAt && tok.type === "char" && stopAt.includes(tok.val)) break;
      pos[0]++;
      html += parseToken(tok, tokens, pos);
    }
    return html;
  }

  function readArg(tokens, pos) {
    while (pos[0] < tokens.length && isWhitespaceToken(tokens[pos[0]])) pos[0]++;
    if (pos[0] >= tokens.length) return "";
    const next = tokens[pos[0]];
    if (next.type === "char" && next.val === "{") {
      pos[0]++; // consume {
      const inner = parseGroup(tokens, pos, ["}"]);
      if (pos[0] < tokens.length && tokens[pos[0]].val === "}") pos[0]++; // consume }
      return inner;
    }
    // Single token arg
    pos[0]++;
    return parseToken(next, tokens, pos);
  }

  function isWhitespaceToken(tok) {
    return tok.type === "char" && /^[\t\n\r ]$/.test(tok.val);
  }

  function parseToken(tok, tokens, pos) {
    if (tok.type === "char") {
      switch (tok.val) {
        case "{": {
          const inner = parseGroup(tokens, pos, ["}"]);
          if (pos[0] < tokens.length && tokens[pos[0]].val === "}") pos[0]++;
          return `<span class="mg">${inner}</span>`;
        }
        case "}": return ""; // stray
        case "^": {
          const exp = readArg(tokens, pos);
          return `<sup class="msup">${exp}</sup>`;
        }
        case "_": {
          const sub = readArg(tokens, pos);
          return `<sub class="msub">${sub}</sub>`;
        }
        case "&": return "<td class='mtd'>";
        case "~": return "&nbsp;";
        case "\\": return "<br>";
        case "\n": return "<br>";
        case "\r": return "";
        default: return escHtml(tok.val);
      }
    }

    // It's a command
    const cmd = tok.val;

    // Greek letters
    if (GREEK[cmd]) return `<span class="mg">${GREEK[cmd]}</span>`;

    // ── Fractions ──
    if (cmd === "frac" || cmd === "dfrac" || cmd === "tfrac") {
      const num = readArg(tokens, pos);
      const den = readArg(tokens, pos);
      return `<span class="mfrac"><span class="mnum">${num}</span><span class="mden">${den}</span></span>`;
    }

    // ── \over safety net ──
    // normalizeLatex converts all \over patterns to \frac before parsing, so this
    // branch should never be reached in normal usage. If it is, consume the denominator
    // and render a plain "num÷den" rather than injecting malformed HTML.
    if (cmd === "over") {
      const den = parseGroup(tokens, pos, ["}", "&"]);
      return `<span class="msym">÷</span>${den}`;
    }

    // ── Square root ──
    if (cmd === "sqrt") {
      // optional [] index
      let idx = "";
      if (pos[0] < tokens.length && tokens[pos[0]].type === "char" && tokens[pos[0]].val === "[") {
        pos[0]++; // consume [
        idx = parseGroup(tokens, pos, ["]"]);
        if (pos[0] < tokens.length && tokens[pos[0]].val === "]") pos[0]++;
      }
      const inner = readArg(tokens, pos);
      if (idx) return `<span class="msqrt"><sup class="msqrt-idx">${idx}</sup>√<span class="msqrt-body">${inner}</span></span>`;
      return `<span class="msqrt">√<span class="msqrt-body">${inner}</span></span>`;
    }

    // ── Text / mathrm / mathbf — pass content through ──
    if (["text","mathrm","mathbf","mathit","mathbb","boldsymbol",
         "mbox","textbf","textit"].includes(cmd)) {
      // next arg is literal text, render as-is
      if (pos[0] < tokens.length && tokens[pos[0]].type === "char" && tokens[pos[0]].val === "{") {
        pos[0]++;
        // for \text, render verbatim (spaces matter)
        let raw = "";
        let depth = 1;
        while (pos[0] < tokens.length) {
          const t = tokens[pos[0]]; pos[0]++;
          if (t.type === "char" && t.val === "{") { depth++; raw += "{"; }
          else if (t.type === "char" && t.val === "}") { depth--; if (!depth) break; raw += "}"; }
          else raw += t.val;
        }
        return `<span class="mtext">${escHtml(raw)}</span>`;
      }
      return "";
    }

    // ── Decorators that wrap one arg ──
    if (["vec","hat","bar","tilde","dot","ddot","overline","underline","widehat","widetilde","acute","grave",
         "overrightarrow", "overleftarrow", "overleftrightarrow"].includes(cmd)) {
      const accents = {vec:"⃗", hat:"̂", bar:"̄", tilde:"̃", dot:"̇", ddot:"̈",
                       overline:"̄", underline:"̲", widehat:"̂", widetilde:"̃", acute:"́", grave:"̀",
                       overrightarrow:"⃗", overleftarrow:"⃖", overleftrightarrow:"⃡"};
      const inner = readArg(tokens, pos);
      return `<span class="mdecor">${inner}${accents[cmd]||""}</span>`;
    }

    // ── Limits / log-like ──
    if (["lim","sin","cos","tan","cot","sec","csc","arcsin","arccos","arctan",
         "sinh","cosh","tanh","log","ln","exp","max","min","sup","inf",
         "det","deg","mod","gcd","lcm"].includes(cmd)) {
      return `<span class="mop">${cmd}</span>`;
    }

    // ── Environments ──
    if (cmd === "begin") {
      const envName = readArg(tokens, pos);
      return parseEnv(envName, tokens, pos);
    }
    if (cmd === "end") {
      readArg(tokens, pos); // consume env name
      return ""; // handled by parseEnv
    }

    // ── Cases ──
    if (cmd === "cases") return parseCases(tokens, pos);

    // ── Line break ──
    if (cmd === "\\" || cmd === "\\\\") return "<br>";
    if (cmd === "newline") return "<br>";

    // ── Spacing ──
    if (["," , ";" , "!" , ":" , ">"].includes(cmd)) return "<span class='msp'>\u200A</span>";
    if (cmd === "quad") return "&ensp;";
    if (cmd === "qquad") return "&emsp;";

    // ── Named symbols ──
    if (SYMBOLS[cmd] !== undefined) {
      const s = SYMBOLS[cmd];
      return s ? `<span class="msym">${s}</span>` : "";
    }

    // ── Integrals / sums with limits ──
    if (["int","iint","iiint","oint","sum","prod","coprod","bigcup","bigcap","bigoplus"].includes(cmd)) {
      const syms = {int:"∫",iint:"∬",iiint:"∭",oint:"∮",sum:"∑",prod:"∏",
                    coprod:"∐",bigcup:"⋃",bigcap:"⋂",bigoplus:"⊕"};
      return `<span class="mlim-op">${syms[cmd]||cmd}</span>`;
    }

    // ── Brackets ──
    const brackets = {langle:"⟨",rangle:"⟩",lfloor:"⌊",rfloor:"⌋",lceil:"⌈",rceil:"⌉",
                       lbrace:"{",rbrace:"}",vert:"|",Vert:"‖"};
    if (brackets[cmd]) return `<span class="mbr">${brackets[cmd]}</span>`;

    // ── Fallback: just show the command name ──
    return `<span class="mcmd">${escHtml(cmd)}</span>`;
  }

  function parseEnv(envName, tokens, pos) {
    if (["matrix", "pmatrix", "bmatrix", "vmatrix", "Vmatrix", "cases",
         "array", "aligned", "alignedat", "align", "align*", "gathered", "gather"].includes(envName)) {
      const wrap = { pmatrix:["(", ")"], bmatrix:["[","]"], vmatrix:["|","|"], Vmatrix:["‖","‖"] };
      const wrapChars = wrap[envName] || ["",""];
      const tableClass = /align|gather/.test(envName) ? "mmatrix malign" : "mmatrix";
      let html = `<span class="menv">`;
      if (wrapChars[0]) html += `<span class="mbr">${wrapChars[0]}</span>`;
      html += `<table class="${tableClass}">`;
      // parse rows until \end
      let row = `<tr><td class='mtd'>`;
      while (pos[0] < tokens.length) {
        const t = tokens[pos[0]];
        if (t.type === "cmd" && t.val === "end") { pos[0]++; readArg(tokens, pos); break; }
        if ((t.type === "cmd" || t.type === "char") && t.val === "\\") { row += `</td></tr><tr><td class='mtd'>`; pos[0]++; continue; }
        if (t.type === "char" && t.val === "&")  { row += `</td><td class='mtd'>`; pos[0]++; continue; }
        pos[0]++;
        row += parseToken(t, tokens, pos);
      }
      html += row + `</td></tr></table>`;
      if (wrapChars[1]) html += `<span class="mbr">${wrapChars[1]}</span>`;
      html += `</span>`;
      return html;
    }
    // Unknown env: just parse contents
    let html = "";
    while (pos[0] < tokens.length) {
      const t = tokens[pos[0]];
      if (t.type === "cmd" && t.val === "end") { pos[0]++; readArg(tokens, pos); break; }
      pos[0]++;
      html += parseToken(t, tokens, pos);
    }
    return html;
  }

  function parseCases(tokens, pos) {
    // \cases{...} — render as two-column table
    return parseEnv("cases", tokens, pos);
  }

  // ── Main render ────────────────────────────────────────────
  function renderMath(latex, display) {
    const tokens = tokenise(normalizeLatex(latex));
    const pos = [0];
    let html = parseGroup(tokens, pos, []);
    const cls = display ? "math-display" : "math-inline";
    return `<span class="${cls}">${html}</span>`;
  }

  // ── Text + math parser ─────────────────────────────────────
  // Finds $...$ \(...\) $$...$$ \[...\] delimiters in text nodes
  function renderMathInElement(element) {
    if (!element) return;
    walkAndRender(element);
  }

  function walkAndRender(node) {
    if (node.nodeType === 3) {
      // Text node — scan for math
      const result = processText(node.textContent);
      if (result.changed) {
        const span = document.createElement("span");
        span.innerHTML = result.html;
        node.parentNode.replaceChild(span, node);
      }
      return;
    }
    if (node.nodeType === 1) {
      // Skip script/style
      if (/^(SCRIPT|STYLE|TEXTAREA)$/.test(node.tagName)) return;
      // Work on a copy of childNodes (replaceChild mutates it)
      [...node.childNodes].forEach(walkAndRender);
    }
  }

  function processText(text) {
    // Delimiters in priority order
    let result = "";
    let i = 0;
    let changed = false;

    while (i < text.length) {
      if (text.startsWith("$$", i) && !readDelimited(text, i, "$$", "$$", true)) {
        result += "$$";
        i += 2;
        continue;
      }
      if (text.startsWith("\\[", i) && !readDelimited(text, i, "\\[", "\\]", true)) {
        result += "\\[";
        i += 2;
        continue;
      }
      if (text.startsWith("\\(", i) && !readDelimited(text, i, "\\(", "\\)", false)) {
        result += "\\(";
        i += 2;
        continue;
      }

      const match = findDelimiter(text, i);
      if (match) {
        result += renderMath(match.content, match.display);
        i = match.end;
        changed = true;
        continue;
      }

      result += escHtml(text[i]);
      i++;
    }
    return { html: result, changed };
  }

  function findDelimiter(text, i) {
    if (text.startsWith("$$", i)) return readDelimited(text, i, "$$", "$$", true);
    if (text.startsWith("\\[", i)) return readDelimited(text, i, "\\[", "\\]", true);
    if (text.startsWith("\\(", i)) return readDelimited(text, i, "\\(", "\\)", false);
    if (text[i] === "$" && text[i + 1] !== "$") return readDelimited(text, i, "$", "$", false);
    return null;
  }

  function readDelimited(text, i, open, close, display) {
    const start = i + open.length;
    const end = text.indexOf(close, start);
    if (end === -1) return null;
    return {
      content: text.slice(start, end),
      display,
      end: end + close.length
    };
  }

  function escHtml(s) {
    return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  // ── Expose globally ────────────────────────────────────────
  global.JEEMath = { renderMathInElement, renderMath };

})(window);
