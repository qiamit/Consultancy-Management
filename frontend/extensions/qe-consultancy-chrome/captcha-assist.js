(function (root) {
  const FONTS = [
    "italic 28px Arial",
    "italic 30px Tahoma",
    "oblique 28px Verdana",
    "italic 26px Georgia",
    "italic 28px 'Times New Roman'",
    "28px Arial",
    "bold 26px 'Courier New'",
  ];
  const CHARSET = "abcdefghijklmnopqrstuvwxyz0123456789";
  const CHARSET_MIXED = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijklmnopqrstuvwxyz0123456789";
  const TW = 16;
  const TH = 24;
  let templates = null;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function setNativeValue(el, value, options) {
    if (!el) return;
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    if (options && options.asCaptcha) {
      try {
        document.documentElement.setAttribute("data-qe-captcha-text", String(value));
      } catch {
        /* isolated world can still set attributes */
      }
    }
  }

  function fieldBlob(el) {
    if (!el) return "";
    return [el.id, el.name, el.placeholder, el.getAttribute("aria-label") || "", el.className]
      .join(" ")
      .toLowerCase();
  }

  function isExcludedField(el) {
    if (!el || el.disabled || el.type === "hidden" || el.type === "password" || el.type === "email") {
      return true;
    }
    const blob = fieldBlob(el);
    if (/captcha|kaptcha|security code|sec-code|txtcaptcha/.test(blob)) return false;
    return /email|password|passwd|userid|username|user id|txtuser|txtpass|org|keyword|standard|search|phone|mobile/.test(
      blob,
    );
  }

  function captchaInput() {
    const named = [...document.querySelectorAll("input")].find((el) => {
      const blob = fieldBlob(el);
      return (
        !isExcludedField(el) &&
        /captcha|kaptcha|security code|sec-code|txtcaptcha/.test(blob)
      );
    });
    if (named) return named;
    const img = captchaImage();
    if (!img) return null;
    const wrap = img.closest("tr, td, li, .form-group, .form-row, div") || img.parentElement;
    const nearby = wrap
      ? [...wrap.querySelectorAll("input[type='text'], input:not([type])")].find((el) => !isExcludedField(el))
      : null;
    return nearby || document.getElementById("captcha0071") || document.getElementById("T1_captcha");
  }

  function captchaImage() {
    const imgs = Array.from(document.querySelectorAll("img"));
    const scored = imgs
      .map((img) => {
        const src = String(img.src || "");
        const blob = `${img.id} ${img.alt} ${img.className} ${img.title} ${src}`.toLowerCase();
        if (/logo|iconnect|favicon|cdac|product\.png|bis logo/.test(blob)) return { img, n: -1 };
        if (/reload\.png|refresh\.png/.test(blob) && !/captcha/.test(blob)) return { img, n: -1 };
        const w = img.naturalWidth || img.width || 0;
        const h = img.naturalHeight || img.height || 0;
        if (w < 48 || h < 16 || w > 520 || h > 180) return { img, n: -1 };
        let n = 0;
        if (/captcha|kaptcha|security code|sec-code|imgcaptcha/.test(blob)) n += 6;
        if (/Handler\.ashx/i.test(src)) n += 5;
        if (src.startsWith("data:image")) n += 5;
        if (w >= 80 && w <= 240 && h >= 24 && h <= 90) n += 3;
        if (document.getElementById("captcha0071") && src.startsWith("data:image")) n += 4;
        return { img, n };
      })
      .filter((row) => row.n > 0)
      .sort((a, b) => b.n - a.n);
    return scored[0] ? scored[0].img : null;
  }

  function manakContextPath() {
    const href = document.baseURI || document.URL || location.href;
    const afterHost = href.indexOf("/", href.indexOf("//") + 2);
    const afterFirst = href.indexOf("/", afterHost + 1);
    return afterFirst > 0 ? href.slice(0, afterFirst) : `${location.origin}/MANAK`;
  }

  async function checkManakCaptcha(text) {
    const cap = String(text || "").replace(/\s+/g, "");
    const token = (document.getElementById("csrf") || {}).value || "";
    if (!cap || !token) return false;
    try {
      const res = await fetch(
        `${manakContextPath()}/CheckCaptcha?cap=${encodeURIComponent(cap)}&token=${encodeURIComponent(token)}`,
        { credentials: "include" },
      );
      const json = await res.json();
      return Boolean(json && json[0] && String(json[0].captchaFlag) === "1");
    } catch {
      return false;
    }
  }

  function silencePageAlerts() {
    // Do not inject inline <script> — Manak CSP blocks it.
    // page-hook.js (MAIN world) patches window.alert when this flag is set.
    try {
      document.documentElement.setAttribute("data-qe-silence-alert", "1");
      document.dispatchEvent(new CustomEvent("qe-silence-alert", { bubbles: true }));
    } catch {
      /* ignore */
    }
  }

  function refreshCaptcha() {
    const reload = document.getElementById("reloadCaptcha");
    if (reload) {
      reload.click();
      return true;
    }
    const nodes = Array.from(document.querySelectorAll("img, a, button, span, i"));
    const btn = nodes.find((el) => {
      const blob = [
        el.id,
        el.className,
        el.alt,
        el.title,
        el.getAttribute("onclick") || "",
        el.getAttribute("href") || "",
        el.src || "",
      ]
        .join(" ")
        .toLowerCase();
      return (
        (/reload|refresh|new captcha|change captcha/.test(blob) &&
          /captcha|kaptcha|security|reload\.png/.test(blob)) ||
        /reloadcaptcha|refreshcaptcha/.test(blob)
      );
    });
    if (btn) {
      (btn.closest("a, button") || btn).click();
      return true;
    }
    const reloadImg = document.querySelector('img[src*="reload"], img[src*="refresh"]');
    if (reloadImg) {
      (reloadImg.closest("a, button") || reloadImg).click();
      return true;
    }
    return false;
  }

  function showManualBanner(message) {
    let el = document.getElementById("qe-captcha-wait-banner");
    if (!el && document.body) {
      el = document.createElement("div");
      el.id = "qe-captcha-wait-banner";
      el.setAttribute("role", "status");
      el.style.cssText =
        "position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#0f766e;color:#fff;padding:10px 14px;font:15px/1.4 sans-serif;text-align:center;";
      document.body.appendChild(el);
    }
    if (el) el.textContent = message;
  }

  function highlightCaptcha(input, options) {
    if (!input) return;
    // Apply once — re-applying outline/background on every poll makes the box blink.
    if (input.getAttribute("data-qe-captcha-hl") === "1") {
      if (options && options.focus === false) return;
    } else {
      input.setAttribute("data-qe-captcha-hl", "1");
      input.style.outline = "3px solid #0f766e";
      input.style.background = "#ecfdf5";
    }
    if (options && options.focus === false) return;
    try {
      input.scrollIntoView({ block: "center", behavior: "smooth" });
    } catch {
      /* ignore */
    }
  }

  function looksLikeStolenLogin(text) {
    const typed = String(text || "").replace(/\s+/g, "");
    if (!typed) return false;
    if (/@/.test(typed)) return true;
    const email = document.getElementById("T1_txtUser") || document.getElementById("InputEmail");
    const pass = document.getElementById("T1_txtPass") || document.getElementById("InputPassword");
    const emailVal = String((email && email.value) || "").replace(/\s+/g, "");
    const passVal = String((pass && pass.value) || "").replace(/\s+/g, "");
    return Boolean((emailVal && typed === emailVal) || (passVal && typed === passVal));
  }

  function looksLikeOrgPrefill(text) {
    const org = document.getElementById("org");
    const orgVal = String((org && org.value) || "").replace(/\s+/g, "");
    const typed = String(text || "").replace(/\s+/g, "");
    return Boolean(orgVal && typed && typed === orgVal);
  }

  function shouldRejectCaptchaValue(text, userTyped) {
    if (looksLikeStolenLogin(text)) return true;
    if (!userTyped && looksLikeOrgPrefill(text)) return true;
    if (!userTyped && String(text || "").replace(/\s+/g, "").length > 16) return true;
    return false;
  }

  function isAutofillInput(event) {
    const type = String((event && event.inputType) || "");
    return /auto|replacement|autofill|insertfromautofill|insertreplacementtext/i.test(type);
  }

  function prepareManualCaptcha(input) {
    if (!input) return;
    // Idempotent — re-running clears user typing and looks like a blink.
    if (input.getAttribute("data-qe-captcha-prepared") === "1") return;
    input.setAttribute("data-qe-captcha-prepared", "1");
    try {
      const proto = HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      if (desc && desc.set) desc.set.call(input, "");
      else input.value = "";
    } catch {
      input.value = "";
    }
    input.setAttribute("autocomplete", "off");
    input.setAttribute("autocorrect", "off");
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("spellcheck", "false");
    input.setAttribute("data-lpignore", "true");
    input.setAttribute("data-1p-ignore", "true");
    input.setAttribute("data-form-type", "other");
    input.setAttribute("readonly", "readonly");
    const unlock = () => {
      input.removeAttribute("readonly");
    };
    input.addEventListener("pointerdown", unlock, true);
    input.addEventListener("keydown", unlock, true);
    input.addEventListener("focus", (event) => {
      if (!event.isTrusted) return;
      window.setTimeout(() => {
        if (document.activeElement === input) unlock();
      }, 0);
    });
  }

  function preferredCaptchaBox() {
    return (
      document.getElementById("captcha0071") ||
      document.getElementById("T1_captcha") ||
      document.getElementById("ctl00_ContentPlaceHolder1_T1_captcha") ||
      captchaInput()
    );
  }

  function pingAlive() {
    try {
      chrome.runtime.sendMessage({ type: "QE_IS_CODE_PING" }, () => {
        void chrome.runtime.lastError;
      });
    } catch {
      /* service worker may be asleep */
    }
  }

  async function waitForCaptchaTyped(timeoutMs, minChars, options) {
    const need = minChars || 5;
    const holdMs = options && options.holdMs != null ? options.holdMs : 10000;
    const first = preferredCaptchaBox();
    prepareManualCaptcha(first);
    highlightCaptcha(first, { focus: false });
    showManualBanner("Click the green captcha box and type it. Next step waits 10 seconds from your first key.");
    let userTyped = false;
    let firstTypedAt = 0;
    function markTyped() {
      userTyped = true;
      if (!firstTypedAt) firstTypedAt = Date.now();
    }
    function boxValue(box) {
      return String((box && box.value) || "").replace(/\s+/g, "");
    }
    function clearAutofill(box) {
      if (!box) return;
      try {
        const proto = HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, "value");
        if (desc && desc.set) desc.set.call(box, "");
        else box.value = "";
      } catch {
        box.value = "";
      }
    }
    function onKey(event) {
      const box = preferredCaptchaBox();
      if (!box || !event.isTrusted) return;
      if (event.target !== box && !(box.contains && box.contains(event.target))) return;
      if (event.key === "Tab" || event.key === "Shift") return;
      markTyped();
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    function onInput(event) {
      const box = preferredCaptchaBox();
      if (!box) return;
      if (event.target !== box && !(box.contains && box.contains(event.target))) return;
      const typed = boxValue(box);
      if (!event.isTrusted || isAutofillInput(event) || shouldRejectCaptchaValue(typed, userTyped)) {
        clearAutofill(box);
        return;
      }
      markTyped();
    }
    function onPaste(event) {
      const box = preferredCaptchaBox();
      if (!box || !event.isTrusted) return;
      if (event.target !== box) return;
      markTyped();
    }
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("input", onInput, true);
    window.addEventListener("paste", onPaste, true);
    const started = Date.now();
    let pingAt = 0;
    let lastBannerLeft = -1;
    let highlightedOnce = false;
    try {
      while (Date.now() - started < (timeoutMs || 300000)) {
        const box = preferredCaptchaBox();
        if (!highlightedOnce) {
          highlightCaptcha(box, { focus: false });
          highlightedOnce = true;
        }
        const typed = boxValue(box);
        if (shouldRejectCaptchaValue(typed, userTyped)) {
          clearAutofill(box);
        }
        if (Date.now() - pingAt > 8000) {
          pingAt = Date.now();
          pingAlive();
        }
        if (firstTypedAt) {
          const left = Math.max(0, Math.ceil((holdMs - (Date.now() - firstTypedAt)) / 1000));
          if (left !== lastBannerLeft) {
            lastBannerLeft = left;
            showManualBanner(
              left > 0
                ? `Captcha typing started. Next step in ${left}s…`
                : "Captcha time done. Continuing…",
            );
          }
        }
        if (
          userTyped &&
          firstTypedAt &&
          typed &&
          typed.length >= need &&
          !shouldRejectCaptchaValue(typed, true) &&
          Date.now() - firstTypedAt >= holdMs
        ) {
          return typed;
        }
        await sleep(200);
      }
      const last = boxValue(preferredCaptchaBox());
      return userTyped && last.length >= need && !shouldRejectCaptchaValue(last, true) ? last : "";
    } finally {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("input", onInput, true);
      window.removeEventListener("paste", onPaste, true);
    }
  }

  function clickIf(selectorOrEl) {
    const el =
      typeof selectorOrEl === "string" ? document.querySelector(selectorOrEl) : selectorOrEl;
    if (el && typeof el.click === "function") el.click();
    return Boolean(el);
  }

  async function ensureImage(img) {
    if (!img) return;
    if (img.complete && (img.naturalWidth || img.width)) return;
    if (typeof img.decode === "function") {
      try {
        await img.decode();
        return;
      } catch {
        /* fall through */
      }
    }
    await sleep(250);
  }

  function otsu(gray) {
    const hist = new Array(256).fill(0);
    for (let i = 0; i < gray.length; i += 1) hist[gray[i]] += 1;
    const total = gray.length;
    let sum = 0;
    for (let t = 0; t < 256; t += 1) sum += t * hist[t];
    let sumB = 0;
    let wB = 0;
    let max = 0;
    let thresh = 128;
    for (let t = 0; t < 256; t += 1) {
      wB += hist[t];
      if (!wB) continue;
      const wF = total - wB;
      if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > max) {
        max = between;
        thresh = t;
      }
    }
    return thresh;
  }

  function canvasGray(canvas) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const gray = new Uint8Array(width * height);
    for (let i = 0; i < gray.length; i += 1) {
      const o = i * 4;
      gray[i] = (data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114) | 0;
    }
    return { gray, width, height };
  }

  function toBinary(gray, width, height, threshold, invert) {
    const bin = new Uint8Array(gray.length);
    for (let i = 0; i < gray.length; i += 1) {
      const ink = invert ? gray[i] > threshold : gray[i] < threshold;
      bin[i] = ink ? 1 : 0;
    }
    // drop isolated specks
    const clean = new Uint8Array(bin.length);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const i = y * width + x;
        if (!bin[i]) continue;
        const n =
          bin[i - 1] +
          bin[i + 1] +
          bin[i - width] +
          bin[i + width] +
          bin[i - width - 1] +
          bin[i - width + 1] +
          bin[i + width - 1] +
          bin[i + width + 1];
        if (n >= 2) clean[i] = 1;
      }
    }
    return clean;
  }

  function scaleImage(img, scale) {
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(8, Math.round(srcW * scale));
    canvas.height = Math.max(8, Math.round(srcH * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function blueInkBinary(canvas) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const bin = new Uint8Array(width * height);
    for (let i = 0; i < bin.length; i += 1) {
      const o = i * 4;
      const r = data[o];
      const g = data[o + 1];
      const b = data[o + 2];
      bin[i] = b > 120 && b > r + 18 && b > g + 8 ? 1 : 0;
    }
    return { bin, width, height };
  }

  function columnInk(bin, width, height) {
    const cols = new Uint16Array(width);
    for (let x = 0; x < width; x += 1) {
      let n = 0;
      for (let y = 0; y < height; y += 1) n += bin[y * width + x];
      cols[x] = n;
    }
    return cols;
  }

  function segmentBoxes(bin, width, height) {
    const cols = columnInk(bin, width, height);
    const minInk = Math.max(2, Math.floor(height * 0.08));
    const boxes = [];
    let x = 0;
    while (x < width) {
      while (x < width && cols[x] < minInk) x += 1;
      if (x >= width) break;
      const x0 = x;
      while (x < width && cols[x] >= minInk) x += 1;
      const x1 = x;
      if (x1 - x0 < 3) continue;
      let y0 = height;
      let y1 = 0;
      for (let yy = 0; yy < height; yy += 1) {
        for (let xx = x0; xx < x1; xx += 1) {
          if (bin[yy * width + xx]) {
            if (yy < y0) y0 = yy;
            if (yy > y1) y1 = yy;
          }
        }
      }
      if (y1 <= y0) continue;
      boxes.push({ x0, x1, y0, y1: y1 + 1 });
    }
    if (boxes.length >= 3 && boxes.length <= 8) {
      if (boxes.length < 6) return splitWideBoxes(bin, width, height, boxes, 6);
      return boxes;
    }
    const guesses = [6, 5];
    for (const count of guesses) {
      const slice = Math.floor(width / count);
      if (slice < 8) continue;
      const fallback = [];
      for (let i = 0; i < count; i += 1) {
        fallback.push({
          x0: i * slice,
          x1: i === count - 1 ? width : (i + 1) * slice,
          y0: 0,
          y1: height,
        });
      }
      if (boxes.length < 3) return fallback;
    }
    return boxes;
  }

  function splitWideBoxes(bin, width, height, boxes, target) {
    const out = boxes.slice();
    while (out.length < target && out.length) {
      let widest = 0;
      for (let i = 1; i < out.length; i += 1) {
        if (out[i].x1 - out[i].x0 > out[widest].x1 - out[widest].x0) widest = i;
      }
      const box = out[widest];
      const mid = Math.floor((box.x0 + box.x1) / 2);
      if (box.x1 - box.x0 < 14) break;
      out.splice(widest, 1, { ...box, x1: mid }, { ...box, x0: mid });
    }
    return out;
  }

  function normalizeBox(bin, width, height, box) {
    const out = new Uint8Array(TW * TH);
    const bw = Math.max(1, box.x1 - box.x0);
    const bh = Math.max(1, box.y1 - box.y0);
    for (let y = 0; y < TH; y += 1) {
      for (let x = 0; x < TW; x += 1) {
        const sx = box.x0 + Math.floor((x * bw) / TW);
        const sy = box.y0 + Math.floor((y * bh) / TH);
        out[y * TW + x] = bin[sy * width + sx] || 0;
      }
    }
    return out;
  }

  function renderTemplates(charset) {
    const key = charset || CHARSET;
    if (templates && templates._key === key) return templates;
    templates = [];
    templates._key = key;
    const canvas = document.createElement("canvas");
    canvas.width = TW;
    canvas.height = TH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    key.split("").forEach((ch) => {
      FONTS.forEach((font) => {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, TW, TH);
        ctx.fillStyle = "#000";
        ctx.font = font;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(ch, TW / 2, TH / 2 + 1);
        const { data } = ctx.getImageData(0, 0, TW, TH);
        const bits = new Uint8Array(TW * TH);
        for (let i = 0; i < bits.length; i += 1) bits[i] = data[i * 4] < 140 ? 1 : 0;
        templates.push({ ch, bits });
      });
    });
    return templates;
  }

  function scoreBits(a, b) {
    let same = 0;
    let ink = 0;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] === b[i]) same += 1;
      if (a[i] || b[i]) ink += 1;
    }
    const agree = same / a.length;
    const jaccard = ink ? sameInk(a, b) / ink : 0;
    return agree * 0.45 + jaccard * 0.55;
  }

  function sameInk(a, b) {
    let n = 0;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] && b[i]) n += 1;
    }
    return n;
  }

  function matchChar(bits, charset) {
    const bank = renderTemplates(charset);
    let best = { ch: "", score: 0 };
    for (let i = 0; i < bank.length; i += 1) {
      const s = scoreBits(bits, bank[i].bits);
      if (s > best.score) best = { ch: bank[i].ch, score: s };
    }
    return best;
  }

  function recognizeBinary(bin, width, height, charset) {
    const boxes = segmentBoxes(bin, width, height);
    if (!boxes.length) return "";
    let text = "";
    let weak = 0;
    boxes.forEach((box) => {
      const bits = normalizeBox(bin, width, height, box);
      const hit = matchChar(bits, charset);
      if (hit.score < 0.48) weak += 1;
      text += hit.ch;
    });
    if (weak > Math.ceil(boxes.length / 2)) return "";
    return text.replace(/[^A-Za-z0-9]/g, "");
  }

  function looksLikeGarbage(text) {
    if (!text || text.length < 4) return true;
    if (/^(.)\1+$/.test(text)) return true;
    if (/^[A-Z]+$/.test(text) && text.length >= 4) return true;
    return false;
  }

  async function recognizeImage(img, options) {
    await ensureImage(img);
    const opts = options || {};
    const charset = opts.charset || CHARSET;
    const variants = [];
    const scales = [2.4, 3.2, 4];
    scales.forEach((scale) => {
      const canvas = scaleImage(img, scale);
      if (opts.ink !== "gray") {
        const blue = blueInkBinary(canvas);
        blue.bin._w = blue.width;
        blue.bin._h = blue.height;
        variants.push(blue.bin);
      }
      if (opts.ink === "blue") return;
      const { gray, width, height } = canvasGray(canvas);
      const t = otsu(gray);
      const inversions = opts.allowInvert === false ? [false] : [false, true];
      inversions.forEach((invert) => {
        [t, Math.max(40, t - 18), Math.min(210, t + 18)].forEach((th) => {
          const bin = toBinary(gray, width, height, th, invert);
          bin._w = width;
          bin._h = height;
          variants.push(bin);
        });
      });
    });
    const seen = new Map();
    variants.forEach((bin) => {
      const text = recognizeBinary(bin, bin._w, bin._h, charset);
      if (text.length < 4 || looksLikeGarbage(text)) return;
      seen.set(text, (seen.get(text) || 0) + 1);
    });
    let best = "";
    let votes = 0;
    seen.forEach((n, text) => {
      if (n > votes || (n === votes && text.length > best.length)) {
        best = text;
        votes = n;
      }
    });
    return best;
  }

  function captchaToDataUrl(img) {
    try {
      const canvas = scaleImage(img, 2.4);
      return canvas.toDataURL("image/png");
    } catch {
      return "";
    }
  }

  async function askAppAiCaptcha(img) {
    const image = captchaToDataUrl(img);
    if (!image) return "";
    try {
      const res = await chrome.runtime.sendMessage({ type: "QE_CAPTCHA_AI", image });
      return String((res && res.text) || "").replace(/\s+/g, "");
    } catch {
      return "";
    }
  }

  async function acceptCaptcha(input, text, verify, minChars) {
    const clean = String(text || "").replace(/\s+/g, "");
    if (clean.length < 4) return "";
    setNativeValue(input, clean);
    if (!verify) return clean.length >= minChars ? clean : "";
    if (await verify(clean)) return clean;
    return "";
  }

  async function solvePageCaptcha(options) {
    // One in-flight wait per page — overlapping calls restart highlight/banner and blink.
    if (window.__qeCaptchaSolvePromise) return window.__qeCaptchaSolvePromise;
    const opts = options || {};
    const minChars = opts.minChars || 5;
    silencePageAlerts();
    await sleep(300);
    highlightCaptcha(preferredCaptchaBox(), { focus: false });
    window.__qeCaptchaSolvePromise = waitForCaptchaTyped(opts.fallbackMs || 300000, minChars, {
      holdMs: opts.holdMs != null ? opts.holdMs : 10000,
    }).finally(() => {
      window.__qeCaptchaSolvePromise = null;
    });
    return window.__qeCaptchaSolvePromise;
  }

  root.qeCaptchaAssist = {
    sleep,
    setNativeValue,
    captchaInput,
    captchaImage,
    refreshCaptcha,
    prepareManualCaptcha,
    waitForCaptchaTyped,
    clickIf,
    recognizeImage,
    solvePageCaptcha,
    checkManakCaptcha,
    silencePageAlerts,
    CHARSET,
    CHARSET_MIXED,
  };
})(self);
