(function (root) {
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
    solvePageCaptcha,
    checkManakCaptcha,
    silencePageAlerts,
  };
})(self);
