/**
 * Runs in the page (MAIN world) so Manak cannot open the BIS Play Store app.
 */
(function () {
  const blocked =
    /play\.google\.com|apps\.apple\.com|com\.bis\.app|itunes\.apple\.com|market:\/\/|intent:\/\//i;

  function blockedUrl(url) {
    return blocked.test(String(url || ""));
  }

  /** Only steal PDFs while Consultancy Pro Test Request capture is armed. */
  function isTrCaptureActive() {
    return document.documentElement.getAttribute("data-qe-manak-capture") === "1";
  }

  /** Quiet page alerts without injecting inline scripts (Manak CSP blocks those). */
  function applyAlertSilence() {
    if (document.documentElement.getAttribute("data-qe-silence-alert") !== "1") return;
    if (window.__qeAlertQuiet) return;
    window.__qeAlertQuiet = true;
    if (!window.__qeNativeAlert) window.__qeNativeAlert = window.alert;
    try {
      window.alert = function () {};
    } catch {
      /* ignore */
    }
  }

  document.addEventListener("qe-silence-alert", applyAlertSilence, true);
  try {
    new MutationObserver(applyAlertSilence).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-qe-silence-alert"],
    });
  } catch {
    /* ignore */
  }
  applyAlertSilence();

  function isPdfLike(url) {
    const href = String(url || "");
    if (/testRequestGenerationForApplicant/i.test(href) && !/\.pdf/i.test(href)) return false;
    return /\.pdf($|\?)|generatePdf|printPdf|viewPdf|getPdf|downloadPdf|download.*pdf/i.test(href);
  }

  function rememberPdfUrl(url) {
    const href = String(url || "");
    if (!href || blockedUrl(href) || !isPdfLike(href)) return;
    document.documentElement.setAttribute("data-qe-pdf-url", href);
  }

  function bytesToBase64(buf) {
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function publishPdfBuffer(url, buf, name) {
    if (!isTrCaptureActive()) return;
    if (!buf || buf.byteLength < 80) return;
    const head = String.fromCharCode.apply(null, new Uint8Array(buf.slice(0, 5)));
    if (head !== "%PDF-") return;
    rememberPdfUrl(url);
    const base64 = bytesToBase64(buf);
    const fileName = name || String(url || "").split("/").pop() || "Test_Request.pdf";
    try {
      sessionStorage.setItem("qeManakPdfB64", base64);
      sessionStorage.setItem("qeManakPdfName", fileName);
      document.documentElement.setAttribute("data-qe-pdf-ready", String(Date.now()));
    } catch {
      /* quota */
    }
    try {
      window.postMessage(
        {
          type: "QE_PAGE_PDF",
          url: String(url || ""),
          name: fileName,
          base64,
        },
        "*",
      );
    } catch {
      /* ignore */
    }
  }

  async function fetchPdfToPage(url) {
    if (!isTrCaptureActive()) return;
    const href = String(url || "");
    if (!href || blockedUrl(href) || /^javascript:/i.test(href) || href === "#") return;
    try {
      const res = await fetch(href, { credentials: "include" });
      const buf = await res.arrayBuffer();
      publishPdfBuffer(res.url || href, buf, href.split("/").pop());
    } catch {
      /* ignore */
    }
  }

  async function fetchFormAsPdf(form, extra) {
    if (!isTrCaptureActive()) return false;
    if (!form) return false;
    const params = new URLSearchParams();
    Array.from(form.elements || []).forEach((el) => {
      if (!el || !el.name) return;
      const type = String(el.type || "").toLowerCase();
      if (type === "file") return;
      if ((type === "checkbox" || type === "radio") && !el.checked) return;
      if (type === "submit" || type === "button" || type === "image") return;
      params.append(el.name, el.value == null ? "" : String(el.value));
    });
    if (extra && typeof extra === "object") {
      Object.keys(extra).forEach((key) => params.set(key, extra[key]));
    }
    try {
      const action = form.getAttribute("action") || location.href;
      const res = await fetch(action, {
        method: "POST",
        body: params.toString(),
        credentials: "include",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/pdf,*/*",
        },
      });
      const buf = await res.arrayBuffer();
      const head = String.fromCharCode.apply(null, new Uint8Array(buf.slice(0, 5)));
      if (buf.byteLength < 80 || head !== "%PDF-") return false;
      publishPdfBuffer(res.url || location.href, buf, "Test_Request.pdf");
      return true;
    } catch {
      return false;
    }
  }

  function isDownloadPostback(target, arg) {
    return /download|pdf|printtestrequest|generatepdf|lnkbtn.*print|lnkbtn.*down/i.test(
      `${target || ""} ${arg || ""}`,
    );
  }

  function wrapDoPostBack() {
    if (typeof window.__doPostBack !== "function") return;
    if (window.__doPostBack.__qeWrapped) return;
    const orig = window.__doPostBack;
    function wrapped(target, arg) {
      if (isTrCaptureActive() && isDownloadPostback(target, arg)) {
        const form =
          document.getElementById("aspnetForm") ||
          document.querySelector("form[action]") ||
          document.forms[0];
        void fetchFormAsPdf(form, {
          __EVENTTARGET: String(target || ""),
          __EVENTARGUMENT: String(arg || ""),
        }).then((ok) => {
          if (!ok) orig.call(window, target, arg);
        });
        return;
      }
      return orig.call(this, target, arg);
    }
    wrapped.__qeWrapped = true;
    try {
      window.__doPostBack = wrapped;
    } catch {
      /* ignore */
    }
  }

  wrapDoPostBack();
  window.setInterval(wrapDoPostBack, 800);

  function findDownloadControl() {
    const nodes = Array.from(
      document.querySelectorAll("a, button, input[type='button'], input[type='submit']"),
    );
    return (
      nodes.find((el) => {
        const t = `${el.id || ""} ${el.name || ""} ${el.value || ""} ${el.textContent || ""} ${el.getAttribute("onclick") || ""}`.toLowerCase();
        return /download/.test(t) && /test request|pdf|print/.test(t);
      }) ||
      nodes.find((el) => /download test request|download pdf/i.test(el.textContent || el.value || ""))
    );
  }

  document.addEventListener("qe-manak-download-pdf", () => {
    if (!isTrCaptureActive()) return;
    const btn = findDownloadControl();
    const form =
      document.getElementById("aspnetForm") ||
      document.querySelector("form[action]") ||
      document.forms[0];
    if (!btn) return;
    const extra = {};
    if (btn.name) extra[btn.name] = btn.value || "Download";
    const onclick = btn.getAttribute("onclick") || "";
    const match = onclick.match(/__doPostBack\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]/);
    if (match) {
      extra.__EVENTTARGET = match[1];
      extra.__EVENTARGUMENT = match[2];
      void fetchFormAsPdf(form, extra);
      return;
    }
    const href = btn.href || btn.getAttribute("href") || "";
    if (href && !/^javascript:/i.test(href) && href !== "#") void fetchPdfToPage(href);
    else void fetchFormAsPdf(form, extra);
  });

  function lockOpen() {
    function safeOpen(url, name, specs) {
      if (blockedUrl(url)) return null;
      rememberPdfUrl(url);
      return window.__qeNativeOpen
        ? window.__qeNativeOpen.call(window, url, name, specs)
        : null;
    }
    if (!window.__qeNativeOpen) window.__qeNativeOpen = window.open;
    try {
      Object.defineProperty(window, "open", {
        configurable: true,
        writable: true,
        value: safeOpen,
      });
    } catch {
      window.open = safeOpen;
    }
  }

  lockOpen();
  window.setInterval(lockOpen, 1000);

  function hookNetworkPdf() {
    if (window.__qePdfNetHooked) return;
    window.__qePdfNetHooked = true;
    const rememberIfPdf = (url, type) => {
      const href = String(url || "");
      const ct = String(type || "");
      if (/pdf/i.test(ct) || isPdfLike(href)) rememberPdfUrl(href);
    };
    if (typeof window.fetch === "function") {
      const origFetch = window.fetch.bind(window);
      window.fetch = function (input, init) {
        const href = typeof input === "string" ? input : input && input.url;
        return origFetch(input, init).then((res) => {
          try {
            const ct = res && res.headers && res.headers.get("content-type");
            rememberIfPdf(res && res.url ? res.url : href, ct);
            if (
              isTrCaptureActive() &&
              (/pdf/i.test(String(ct || "")) || isPdfLike(res && res.url ? res.url : href))
            ) {
              res
                .clone()
                .arrayBuffer()
                .then((buf) => publishPdfBuffer(res.url || href, buf, String(href || "").split("/").pop()))
                .catch(() => {});
            }
          } catch {
            /* ignore */
          }
          return res;
        });
      };
    }
    const XHR = window.XMLHttpRequest;
    if (XHR && XHR.prototype) {
      const origOpen = XHR.prototype.open;
      const origSend = XHR.prototype.send;
      XHR.prototype.open = function (method, url, ...rest) {
        this.__qeUrl = url;
        return origOpen.call(this, method, url, ...rest);
      };
      XHR.prototype.send = function (...args) {
        this.addEventListener("load", function () {
          try {
            const ct = this.getResponseHeader("content-type");
            const href = this.responseURL || this.__qeUrl;
            rememberIfPdf(href, ct);
            if (isTrCaptureActive() && (/pdf/i.test(String(ct || "")) || isPdfLike(href))) {
              const buf = this.responseType === "arraybuffer" ? this.response : null;
              if (buf && buf.byteLength) publishPdfBuffer(href, buf, String(href || "").split("/").pop());
            }
          } catch {
            /* ignore */
          }
        });
        return origSend.apply(this, args);
      };
    }
  }
  hookNetworkPdf();

  function lockPrint() {
    if (!window.__qeNativePrint) window.__qeNativePrint = window.print;
    if (!isTrCaptureActive()) {
      try {
        Object.defineProperty(window, "print", {
          configurable: true,
          writable: true,
          value: window.__qeNativePrint,
        });
      } catch {
        window.print = window.__qeNativePrint;
      }
      return;
    }
    function silentPrint() {
      document.documentElement.setAttribute("data-qe-print-requested", "1");
      return false;
    }
    try {
      Object.defineProperty(window, "print", {
        configurable: true,
        writable: true,
        value: silentPrint,
      });
    } catch {
      window.print = silentPrint;
    }
  }

  lockPrint();
  window.setInterval(lockPrint, 1000);

  function isCaptchaRefreshNode(el) {
    if (!el || el.nodeType !== 1) return false;
    const blob = [
      el.id,
      el.className,
      el.alt,
      el.title,
      el.getAttribute && el.getAttribute("onclick"),
      el.getAttribute && el.getAttribute("href"),
      el.src,
      el.textContent,
    ]
      .join(" ")
      .toLowerCase();
    if (/refreshcaptcha|reloadcaptcha|refresh captcha|reload captcha|new captcha/.test(blob)) {
      return true;
    }
    return el.tagName === "IMG" && /captcha|kaptcha/.test(blob);
  }

  function isKnowFeesPage() {
    return /knowfees/i.test(location.pathname || "");
  }

  document.addEventListener(
    "click",
    (event) => {
      if (isKnowFeesPage()) return;
      const t = event.target;
      if (!t) return;
      if (isCaptchaRefreshNode(t) || (t.closest && isCaptchaRefreshNode(t.closest("a, button, img, span")))) {
        if (!event.isTrusted) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }
    },
    true,
  );

  document.addEventListener(
    "click",
    (event) => {
      const link = event.target && event.target.closest ? event.target.closest("a[href]") : null;
      if (!link) return;
      const href = link.href || link.getAttribute("href") || "";
      if (blockedUrl(href)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (!isTrCaptureActive()) return;
      rememberPdfUrl(href);
      const downloadAttr = link.getAttribute("download") || "";
      const label = String(link.textContent || link.title || "").toLowerCase();
      // Never hijack Test Report downloads — only Test Request PDFs.
      if (/test\s*report/.test(label) && !/test\s*request/.test(label)) return;
      const looksTrPdf =
        isPdfLike(href) ||
        /\.pdf/i.test(downloadAttr) ||
        (/download/.test(label) && /test request|pdf/.test(label));
      if (looksTrPdf && href && !/^javascript:/i.test(href) && href !== "#") {
        event.preventDefault();
        event.stopImmediatePropagation();
        void fetchPdfToPage(href);
      }
    },
    true,
  );

  function neutralizePlayLinks() {
    document
      .querySelectorAll(
        'a[href*="play.google.com"], a[href*="com.bis.app"], a[href*="apps.apple.com"], a[href*="market:"]',
      )
      .forEach((a) => {
        a.setAttribute("data-qe-blocked", a.getAttribute("href") || "");
        a.removeAttribute("href");
        a.setAttribute("target", "_self");
        a.onclick = function (event) {
          if (event) {
            event.preventDefault();
            event.stopPropagation();
          }
          return false;
        };
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", neutralizePlayLinks);
  } else {
    neutralizePlayLinks();
  }
  const obs = new MutationObserver(neutralizePlayLinks);
  obs.observe(document.documentElement, { childList: true, subtree: true });

  function parseParts(detail) {
    const day = Number(detail && detail.day);
    const month = Number(detail && detail.month);
    const year = Number(detail && detail.year);
    if (!day || !month || !year) return null;
    return { day, month, year, date: new Date(year, month - 1, day) };
  }

  function applyJqueryDate(el, parts, formats) {
    const $ = window.jQuery || window.$;
    if (!$ || !el) return false;
    const $el = $(el);
    try {
      if ($el.data("datepicker") || $el.hasClass("hasDatepicker")) {
        $el.datepicker("setDate", parts.date);
        $el.trigger("change").trigger("blur");
        return true;
      }
    } catch {
      /* ignore */
    }
    try {
      if ($el.data("DateTimePicker") && $el.data("DateTimePicker").date) {
        $el.data("DateTimePicker").date(parts.date);
        return true;
      }
    } catch {
      /* ignore */
    }
    try {
      if (typeof $el.datepicker === "function") {
        $el.datepicker("update", parts.date);
        $el.datepicker("setDate", parts.date);
        $el.val(formats[0] || "").trigger("change").trigger("input").trigger("blur");
        return Boolean($el.val());
      }
    } catch {
      /* ignore */
    }
    if (formats && formats.length) {
      $el.val(formats[0]).trigger("change").trigger("input").trigger("blur");
      return Boolean($el.val());
    }
    return false;
  }

  document.addEventListener("qe-manak-set-select", (event) => {
    const el = event.target;
    const value = String((event.detail && event.detail.value) || "").trim();
    const $ = window.jQuery || window.$;
    if (!el || !value || !$ || el.tagName !== "SELECT") return;
    const wanted = value.toLowerCase();
    const options = Array.from(el.options || []);
    const match = options.find((opt) => {
      const t = String(opt.textContent || "").trim().toLowerCase();
      const v = String(opt.value || "").trim().toLowerCase();
      if (!t || t.indexOf("select ") === 0) return false;
      return t === wanted || v === wanted || t.indexOf(wanted) >= 0 || wanted.indexOf(t) >= 0;
    });
    if (!match) return;
    if (el.multiple) $(el).val([match.value]).trigger("change");
    else $(el).val(match.value).trigger("change");
  });

  document.addEventListener("qe-manak-fill-date", (event) => {
    const el = event.target;
    const parts = parseParts(event.detail || {});
    if (!el || !parts) return;
    applyJqueryDate(el, parts, (event.detail && event.detail.formats) || []);
  });

  function isDigitsIn(blob, digits) {
    if (!digits) return false;
    return new RegExp("(?:^|[^0-9])" + digits + "(?:[^0-9]|$)").test(String(blob || ""));
  }

  document.addEventListener("qe-manak-pick-is", (event) => {
    const root = document.documentElement;
    const digits = String(
      (event.detail && event.detail.digits) || (root && root.getAttribute("data-qe-is-digits")) || "",
    );
    const year = String(
      (event.detail && event.detail.year) || (root && root.getAttribute("data-qe-is-year")) || "",
    );
    const items = Array.from(
      document.querySelectorAll("#mylist li.searchList, #results li.searchList, #standardResultsSet li, li.searchList"),
    );
    const match =
      items.find((li) => {
        const blob = String(li.id || "") + " " + String(li.textContent || "");
        if (!isDigitsIn(blob, digits)) return false;
        return !year || blob.indexOf(year) >= 0;
      }) ||
      items.find((li) => isDigitsIn(String(li.id || "") + " " + String(li.textContent || ""), digits)) ||
      null;
    if (!match) return;
    if (typeof window.setVal === "function") {
      window.setVal(match);
      return;
    }
    match.click();
  });

  function softLabKey(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\b(pvt\.?|private|ltd\.?|limited|llp|llc|inc|lab|laboratory|testing|solutions|and|&|co|c\/o)\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function labTokens(value) {
    return softLabKey(value).split(" ").filter((t) => t.length >= 4);
  }

  function labMatchScore(blob, wanted) {
    const a = softLabKey(blob);
    const b = softLabKey(wanted);
    if (!b) return 0;
    if (a === b) return 100;
    if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return 80;
    const tokens = labTokens(wanted);
    if (!tokens.length) return 0;
    const hits = tokens.filter((t) => a.indexOf(t) >= 0).length;
    return Math.round((hits / tokens.length) * 70);
  }

  function filterLabTable(query) {
    const q = String(query || "").trim();
    if (!q) return false;
    const filter = document.getElementById("filter");
    if (filter) {
      filter.value = q;
      filter.dispatchEvent(new Event("input", { bubbles: true }));
      filter.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "e" }));
    }
    const $ = window.jQuery || window.$;
    if ($ && $("#viewLab").length) {
      try {
        $("#filter").val(q).trigger("keyup").trigger("input").trigger("change");
      } catch {
        /* ignore */
      }
      try {
        const plugin = $("#viewLab").data("footable-filter");
        if (plugin && typeof plugin.filter === "function") plugin.filter(q);
      } catch {
        /* ignore */
      }
      try {
        $("#viewLab").trigger("footable_filter", { filter: q });
      } catch {
        /* ignore */
      }
    }
    return true;
  }

  function pickLabFromTable() {
    const root = document.documentElement;
    const wanted = String(root.getAttribute("data-qe-lab-name") || "");
    const query = String(root.getAttribute("data-qe-lab-filter") || "") || labTokens(wanted).slice(0, 2).join(" ");
    if (query) filterLabTable(query);
    const radios = Array.from(document.querySelectorAll("input[name='clickonlab']"));
    let best = null;
    let bestScore = 0;
    radios.forEach((el) => {
      const row = el.closest("tr");
      const nameCell = row && row.querySelector("[id='labnameval'], td:nth-child(3)");
      const blob = [(nameCell && nameCell.textContent) || "", (row && row.textContent) || "", el.value || ""].join(" ");
      let score = labMatchScore(blob, wanted);
      if (/osl/i.test(String(el.value || "")) && score > 0) score += 5;
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    });
    const match = wanted
      ? bestScore >= 40
        ? best
        : null
      : radios.find((el) => /osl/i.test(String(el.value || ""))) || radios[0];
    if (!match) return false;
    match.checked = true;
    match.click();
    if (typeof window.selectFinalLab === "function") {
      window.selectFinalLab();
    } else {
      const btn = document.getElementById("selectFinalLab");
      if (btn) btn.click();
    }
    return true;
  }

  document.addEventListener("qe-manak-filter-lab", () => {
    filterLabTable(document.documentElement.getAttribute("data-qe-lab-filter") || "");
  });

  document.addEventListener("qe-manak-pick-lab", () => {
    pickLabFromTable();
  });

  function setPageInput(el, value) {
    if (!el || !value) return;
    const $ = window.jQuery || window.$;
    if ($ && typeof $.fn.val === "function") {
      $(el).val(value).trigger("input").trigger("change").trigger("keyup").trigger("blur");
      return;
    }
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    try {
      el.setAttribute("value", value);
    } catch {
      /* ignore */
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function fillManakLoginFields(userId, password) {
    const id = String(userId || "").trim();
    const pwd = String(password || "").trim();
    const user =
      document.getElementById("InputEmail") ||
      document.querySelector("input[name='userId'][type='text']");
    const pass =
      document.getElementById("InputPassword") ||
      document.querySelector("input[name='passwd'][type='password']");
    if (user && id) setPageInput(user, id);
    if (pass && pwd) setPageInput(pass, pwd);
  }

  document.addEventListener("qe-manak-fill-login", (event) => {
    if (isKnowFeesPage()) return;
    const detail = (event && event.detail) || {};
    fillManakLoginFields(detail.userId, detail.password);
  });

  const captchaTextWatch = new MutationObserver(() => {
    const value = document.documentElement.getAttribute("data-qe-captcha-text") || "";
    if (!value || value === window.__qeCaptchaTextApplied) return;
    window.__qeCaptchaTextApplied = value;
    const input =
      document.getElementById("captcha0071") ||
      document.querySelector('input[id*="captcha" i], input[placeholder*="captcha" i]');
    if (input) setPageInput(input, value);
  });
  captchaTextWatch.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-qe-captcha-text"],
  });

  const labAttrWatch = new MutationObserver(() => {
    const root = document.documentElement;
    const query = root.getAttribute("data-qe-lab-filter") || "";
    const pick = root.getAttribute("data-qe-lab-pick") || "";
    if (query && query !== window.__qeLabFilterApplied) {
      window.__qeLabFilterApplied = query;
      filterLabTable(query);
    }
    if (pick && pick !== window.__qeLabPickApplied) {
      window.__qeLabPickApplied = pick;
      window.setTimeout(pickLabFromTable, 250);
    }
  });
  labAttrWatch.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-qe-lab-filter", "data-qe-lab-name", "data-qe-lab-pick"],
  });
})();
