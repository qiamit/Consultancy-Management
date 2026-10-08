(function () {
  if (/knowfees/i.test(location.pathname || "")) return;

  window.addEventListener("unhandledrejection", (event) => {
    const msg = String((event.reason && event.reason.message) || event.reason || "");
    if (/not focused|clipboard|could not establish connection|receiving end|navigation rejected/i.test(msg)) {
      event.preventDefault();
    }
  });

  const KIND = "QE_MANAK_TR_V1";
  const RESULT_KIND = "QE_MANAK_TR_RESULT_V1";
  const TR_URL =
    "https://www.manakonline.in/MANAK/testRequestGenerationForApplicant";
  const HOME_URL = "https://www.manakonline.in/MANAK/login";
  const map = typeof QE_MANAK_FIELD_MAP === "object" ? QE_MANAK_FIELD_MAP : { fields: [] };

  function text(value) {
    return String(value ?? "").trim();
  }

  function normalize(value) {
    return text(value).toLowerCase().replace(/\s+/g, " ");
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  /** Tell MAIN-world page-hook when Test Request PDF capture may intercept downloads. */
  function setTrCaptureFlag(on) {
    try {
      if (on) document.documentElement.setAttribute("data-qe-manak-capture", "1");
      else document.documentElement.removeAttribute("data-qe-manak-capture");
    } catch {
      /* ignore */
    }
  }

  function syncTrCaptureFlagFromStorage(data) {
    const on =
      Boolean(data) &&
      data.qeManakEnabled === true &&
      data.qeManakArmed === true &&
      data.qeManakImportQr !== true &&
      Boolean(data.pendingFill);
    setTrCaptureFlag(on);
    return on;
  }

  function refreshTrCaptureFlag() {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        ["pendingFill", "qeManakEnabled", "qeManakArmed", "qeManakImportQr"],
        (data) => resolve(syncTrCaptureFlagFromStorage(data || {})),
      );
    });
  }

  function finishTestRequestAndClose(payload) {
    if (window.__qeManakFinished) return;
    window.__qeManakFinished = true;
    setTrCaptureFlag(false);
    try {
      chrome.storage.local.set({
        pendingFill: null,
        qeManakArmed: false,
        qeManakEnabled: false,
        qeManakHomeReady: false,
      });
    } catch {
      /* ignore */
    }
    showBanner("Test Request saved. Disabling Manak auto-flow and closing tab…", true);
    try {
      chrome.runtime.sendMessage({
        type: "QE_MANAK_FINISH_TR",
        closeTab: true,
        sampleId: text(payload && payload.sampleId),
      });
    } catch {
      /* ignore */
    }
  }

  function lookup(payload, key) {
    const parts = String(key).split(".");
    let cur = payload;
    for (const part of parts) {
      if (!cur || typeof cur !== "object") return "";
      cur = cur[part];
    }
    return text(cur);
  }

  function parsePayload(raw) {
    const source = text(raw);
    const start = source.indexOf("{");
    const end = source.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      const parsed = JSON.parse(source.slice(start, end + 1));
      if (!parsed || parsed.kind !== KIND) return null;
      if (!parsed.application || !parsed.sample) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function isSkipField(el) {
    const blob = [
      el.id,
      el.name,
      el.placeholder,
      el.getAttribute("aria-label"),
      el.getAttribute("autocomplete"),
    ]
      .map(normalize)
      .join(" ");
    return (map.skipField || []).some((re) => re.test(blob));
  }

  function isBlockedUrl(url) {
    const href = text(url);
    if (!href) return false;
    return (map.neverOpen || []).some((re) => re.test(href));
  }

  function isNeverClick(el) {
    const blob = [
      el.textContent,
      el.value,
      el.getAttribute("aria-label"),
      el.getAttribute("title"),
      el.getAttribute("onclick"),
      el.getAttribute("href"),
      el.getAttribute("src"),
      el.id,
      el.className,
    ]
      .map(normalize)
      .join(" ");
    if ((map.neverClick || []).some((re) => re.test(blob))) return true;
    if (/captcha|kaptcha/.test(blob) && /refresh|reload|new|change/.test(blob)) return true;
    if (el.tagName === "IMG" && /captcha|kaptcha/.test(blob)) return true;
    return isBlockedUrl(el.href || el.getAttribute("href") || "");
  }

  function writeInput(el, value) {
    const proto =
      el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
  }

  const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  function parseDateParts(value) {
    const raw = text(value);
    if (!raw) return null;
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const dmyNum = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    const dmyMon = raw.match(/^(\d{1,2})[\/\-.]([A-Za-z]{3})[\/\-.](\d{4})$/);
    let year = 0;
    let month = 0;
    let day = 0;
    if (iso) {
      year = Number(iso[1]);
      month = Number(iso[2]);
      day = Number(iso[3]);
    } else if (dmyMon) {
      year = Number(dmyMon[3]);
      day = Number(dmyMon[1]);
      const idx = MONTHS_SHORT.findIndex((m) => m.toLowerCase() === dmyMon[2].toLowerCase());
      month = idx + 1;
    } else if (dmyNum) {
      day = Number(dmyNum[1]);
      month = Number(dmyNum[2]);
      year = Number(dmyNum[3]);
    }
    if (!year || !month || !day) return null;
    return { day, month, year };
  }

  function dateFormats(value) {
    const parts = parseDateParts(value);
    const raw = text(value);
    if (!parts) return raw ? [raw] : [];
    const day = String(parts.day).padStart(2, "0");
    const month = String(parts.month).padStart(2, "0");
    const mon = MONTHS_SHORT[parts.month - 1] || "";
    const year = String(parts.year);
    return [
      `${day}-${month}-${year}`,
      `${day}/${month}/${year}`,
      `${day}-${mon}-${year}`,
      `${day}/${mon}/${year}`,
      `${year}-${month}-${day}`,
      raw,
    ].filter(Boolean);
  }

  function visibleCalendar() {
    return Array.from(
      document.querySelectorAll(
        ".ui-datepicker, .datepicker-dropdown, .datepicker, .bootstrap-datetimepicker-widget",
      ),
    ).find((el) => el.offsetParent !== null && !/display:\s*none/i.test(el.getAttribute("style") || ""));
  }

  function parseCalendarTitle(title) {
    const raw = normalize(title);
    const year = Number((raw.match(/\b(19|20)\d{2}\b/) || [])[0] || 0);
    const monthIdx = MONTHS_SHORT.findIndex((m) => raw.includes(m.toLowerCase()));
    const long = [
      "january","february","march","april","may","june",
      "july","august","september","october","november","december",
    ].findIndex((m) => raw.includes(m));
    const month = (monthIdx >= 0 ? monthIdx : long) + 1;
    return { month, year };
  }

  async function pickDateFromCalendar(el, parts) {
    if (!el || !parts) return false;
    el.focus();
    el.click();
    const wrap = el.closest(".input-group, .form-group, td, div") || el.parentElement;
    const trigger = wrap
      ? wrap.querySelector(
          ".ui-datepicker-trigger, .glyphicon-calendar, .fa-calendar, .input-group-addon, [class*='calendar' i]",
        )
      : null;
    if (trigger) trigger.click();
    await sleep(250);
    let cal = visibleCalendar();
    if (!cal) {
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      await sleep(250);
      cal = visibleCalendar();
    }
    if (!cal) return false;

    for (let i = 0; i < 30; i += 1) {
      const title = cal.querySelector(".ui-datepicker-title, .datepicker-switch, .picker-switch");
      const shown = parseCalendarTitle(title ? title.textContent : "");
      if (shown.year === parts.year && shown.month === parts.month) break;
      const ahead = shown.year * 12 + shown.month > parts.year * 12 + parts.month;
      const btn = cal.querySelector(
        ahead
          ? ".ui-datepicker-prev, .prev, [data-action='previous']"
          : ".ui-datepicker-next, .next, [data-action='next']",
      );
      if (!btn) break;
      btn.click();
      await sleep(70);
    }

    const dayCell = Array.from(cal.querySelectorAll("td a, td.day, .day")).find((node) => {
      const cls = `${node.className} ${(node.parentElement && node.parentElement.className) || ""}`;
      if (/old|new|disabled|off|other-month/i.test(cls)) return false;
      return Number(text(node.textContent)) === parts.day;
    });
    if (!dayCell) return false;
    dayCell.click();
    await sleep(120);
    return Boolean(text(el.value));
  }

  async function fillDateField(el, value) {
    const parts = parseDateParts(value);
    const formats = dateFormats(value);
    if (parts) {
      el.dispatchEvent(
        new CustomEvent("qe-manak-fill-date", {
          bubbles: true,
          detail: { formats, day: parts.day, month: parts.month, year: parts.year },
        }),
      );
    }
    for (const fmt of formats) {
      setNativeValue(el, fmt);
      if (text(el.value)) break;
    }
    if (text(el.value) && parts && parseDateParts(el.value) && parseDateParts(el.value).day === parts.day) {
      return true;
    }
    return pickDateFromCalendar(el, parts);
  }

  function setNativeValue(el, value) {
    if (el.tagName === "SELECT") {
      const wanted = normalize(value);
      const options = Array.from(el.options || []);
      const match = options.find((opt) => {
        const label = normalize(opt.textContent);
        const val = normalize(opt.value);
        if (/no lab selected|select lab|choose lab/.test(label)) return false;
        return label === wanted || val === wanted || label.includes(wanted) || wanted.includes(label);
      });
      if (match) el.value = match.value;
      else el.value = value;
    } else if (el.type === "date") {
      const iso = dateFormats(value).find((item) => /^\d{4}-\d{2}-\d{2}$/.test(item));
      writeInput(el, iso || value);
    } else {
      writeInput(el, value);
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    try {
      el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
    } catch {
      /* ignore */
    }
  }

  function fillControl(el, key, value) {
    if (key === "sample.date_of_manufacturing" || key === "sample.payment_date") {
      void fillDateField(el, value);
      return;
    }
    // Manak "Enter the IS Number" rejects revision year — type digits only (e.g. 10748).
    if (key === "application.isSearch") {
      setNativeValue(el, isDigits(value) || text(value));
      return;
    }
    setNativeValue(el, value);
  }

  function labelForControl(el) {
    if (el.id) {
      const byFor = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (byFor) return normalize(byFor.textContent);
    }
    const wrap = el.closest("label, tr, td, th, .form-group, .form-row, li, div");
    if (wrap) {
      const label = wrap.querySelector("label, th, .control-label, .form-label");
      if (label) return normalize(label.textContent);
      return normalize(wrap.textContent).slice(0, 80);
    }
    return normalize(el.getAttribute("aria-label") || el.placeholder || "");
  }

  function isGhostControl(el) {
    const cls = String(el.className || "");
    const id = String(el.id || "");
    return (
      /select2-input|select2-focusser|select2-offscreen/i.test(cls) ||
      /^s2id_autogen/i.test(id) ||
      /^(probDesc|problemType|file|selectAllOng)$/i.test(id)
    );
  }

  function findBySelectors(selectors) {
    for (const sel of selectors || []) {
      try {
        const el = document.querySelector(sel);
        if (el && !isSkipField(el) && !isGhostControl(el)) return el;
      } catch {
        /* ignore invalid selector */
      }
    }
    return null;
  }

  function findByLabels(labels) {
    const wanted = (labels || []).map(normalize).filter(Boolean);
    if (!wanted.length) return null;
    const controls = Array.from(
      document.querySelectorAll("input, textarea, select"),
    ).filter((el) => {
      const type = String(el.type || "").toLowerCase();
      if (["hidden", "submit", "button", "image", "file", "password"].includes(type)) return false;
      if (isGhostControl(el) || isSkipField(el)) return false;
      if (el.readOnly && !/datepicker/i.test(String(el.className || ""))) return false;
      return true;
    });
    let best = null;
    let bestScore = 0;
    for (const el of controls) {
      const lab = labelForControl(el);
      let score = 0;
      for (const w of wanted) {
        if (lab === w) score = Math.max(score, 3);
        else if (lab.startsWith(w) || w.startsWith(lab)) score = Math.max(score, 2);
      }
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return bestScore >= 2 ? best : null;
  }

  function clickableCandidates() {
    return Array.from(
      document.querySelectorAll("a, button, [role='button'], input[type='button'], td, span, div"),
    ).filter((el) => {
      if (!el || isNeverClick(el)) return false;
      const t = normalize(el.textContent || el.value || "");
      return t.length > 0 && t.length < 80;
    });
  }

  function clickByLabels(labels) {
    const wanted = (labels || []).map(normalize);
    const nodes = clickableCandidates();
    const match = nodes.find((el) => {
      const t = normalize(el.textContent || el.value || "");
      return wanted.some((w) => t === w || t.includes(w));
    });
    if (!match) return false;
    match.click();
    return true;
  }

  function clickSearch() {
    const nav = map.navigation && map.navigation.searchIs;
    const el = findBySelectors((nav && nav.selectors) || []);
    if (el && !isNeverClick(el)) {
      el.click();
      return true;
    }
    return clickByLabels((nav && nav.labels) || ["search"]);
  }

  function isDigits(value) {
    const nums = normalize(value).replace(/^is\s*/, "").match(/\d{3,7}/g) || [];
    const notYear = nums.filter((n) => !/^(19|20)\d{2}$/.test(n));
    return (notYear.sort((a, b) => b.length - a.length)[0] || nums[0] || "");
  }

  function textHasIsNumber(blob, digits) {
    if (!digits) return false;
    return new RegExp(`(?:^|[^0-9])${digits}(?:[^0-9]|$)`).test(blob);
  }

  function isListItems() {
    const nav = map.navigation && map.navigation.selectIs;
    const fromMap = Array.from(
      document.querySelectorAll((nav && nav.selectors ? nav.selectors.join(", ") : "") || "#mylist li"),
    );
    const extra = Array.from(
      document.querySelectorAll("#mylist li.searchList, #results li.searchList, #standardResultsSet li, li.searchList"),
    );
    return [...new Set(fromMap.concat(extra))];
  }

  function selectIsResult(isNumber, preferredYear) {
    const digits = isDigits(isNumber);
    const year =
      text(preferredYear) ||
      (normalize(isNumber).match(/\b(19|20)\d{2}\b/) || [])[0] ||
      "";
    if (!digits) return false;

    document.documentElement.setAttribute("data-qe-is-digits", digits);
    document.documentElement.setAttribute("data-qe-is-year", year);
    document.dispatchEvent(
      new CustomEvent("qe-manak-pick-is", {
        bubbles: true,
        detail: { digits, year },
      }),
    );

    const items = isListItems();
    // Prefer digits-only match first; year is only a tie-breaker (never typed into search).
    const byDigits = items.filter((node) => {
      const blob = normalize((node.id || "") + " " + (node.textContent || ""));
      return textHasIsNumber(blob, digits);
    });
    const match =
      (year && byDigits.find((node) => normalize(node.textContent || "").includes(year))) ||
      byDigits[0] ||
      null;
    if (match && !isNeverClick(match)) {
      match.click();
      return true;
    }

    const scopes = Array.from(
      document.querySelectorAll(
        "#results, #mylist, #standardResultsSet, table, .modal, .ui-dialog, [class*='search' i], [class*='dropdown-content' i]",
      ),
    );
    for (const scope of scopes) {
      if (!textHasIsNumber(normalize(scope.textContent), digits)) continue;
      const rows = Array.from(scope.querySelectorAll("tr, li")).filter((node) =>
        textHasIsNumber(normalize((node.id || "") + " " + (node.textContent || "")), digits),
      );
      const row =
        (year && rows.find((node) => normalize(node.textContent).includes(year))) || rows[0];
      if (row) {
        const pick = row.querySelector(
          "input[type='radio'], input[type='checkbox'], button, input[type='button']",
        );
        if (pick && !isNeverClick(pick)) pick.click();
        else if (!isNeverClick(row)) row.click();
        return true;
      }
    }
    return false;
  }

  function pageShowsSelectedIs(isNumber) {
    const digits = isDigits(isNumber);
    if (!digits) return false;
    const standard = document.getElementById("StandardNumber");
    if (standard && isDigits(standard.value) === digits) return true;
    const field =
      findBySelectors((map.fields || []).find((item) => item.key === "application.isSearch")?.selectors || []) ||
      document.getElementById("org");
    const raw = field ? text(field.value) : "";
    return Boolean(digits && /\[\d{4}\]/.test(raw) && isDigits(raw) === digits);
  }

  function showBanner(message, ok, sticky) {
    let box = document.getElementById("qe-manak-tr-banner");
    if (!box) {
      box = document.createElement("div");
      box.id = "qe-manak-tr-banner";
      box.style.cssText =
        "position:fixed;z-index:2147483647;top:12px;right:12px;max-width:360px;padding:10px 12px;border-radius:10px;font:12px/1.4 Segoe UI,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25)";
      document.documentElement.appendChild(box);
    }
    box.style.background = ok ? "#065f46" : "#7f1d1d";
    box.style.color = "#fff";
    box.textContent = message;
    if (box._qeHide) window.clearTimeout(box._qeHide);
    if (!sticky) {
      box._qeHide = window.setTimeout(() => {
        if (box.parentNode) box.remove();
      }, 8000);
    }
  }

  function fillPayload(payload, keys) {
    if (!payload) {
      return { ok: false, filled: 0, message: "No QE_MANAK_TR_V1 payload." };
    }
    if (!/testRequestGenerationForApplicant/i.test(location.pathname)) {
      return { ok: false, filled: 0, message: "Not on Generate Test Request page." };
    }

    const allow = keys ? new Set(keys) : null;
    const used = new Set();
    let filled = 0;
    const missing = [];
    for (const field of map.fields || []) {
      if (allow && !allow.has(field.key)) continue;
      const value = lookup(payload, field.key);
      if (!value) continue;
      const el = findBySelectors(field.selectors) || findByLabels(field.labels);
      if (!el || used.has(el)) {
        missing.push(field.key);
        continue;
      }
      if (el.readOnly && !/datepicker/i.test(String(el.className || ""))) continue;
      used.add(el);
      fillControl(el, field.key, value);
      if (el.tagName === "SELECT") {
        el.dispatchEvent(
          new CustomEvent("qe-manak-set-select", {
            bubbles: true,
            detail: { value },
          }),
        );
      }
      filled += 1;
    }

    const message =
      filled > 0
        ? `Filled ${filled} field(s). Captcha / Submit stay manual.`
        : "No matching Test Request fields on this page yet.";
    return { ok: filled > 0, filled, missing, message };
  }

  function softLabKey(value) {
    return normalize(value)
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
    if (a.includes(b) || b.includes(a)) return 80;
    const tokens = labTokens(wanted);
    if (!tokens.length) return 0;
    const hits = tokens.filter((t) => a.includes(t)).length;
    return Math.round((hits / tokens.length) * 70);
  }

  function labFilterQuery(labName) {
    return labTokens(labName).slice(0, 2).join(" ");
  }

  function findMatchingLabRadio(labName) {
    const wanted = text(labName);
    const radios = Array.from(document.querySelectorAll("input[name='clickonlab']"));
    let best = null;
    let bestScore = 0;
    radios.forEach((el) => {
      const row = el.closest("tr");
      const nameCell = row && row.querySelector("[id='labnameval'], td:nth-child(3)");
      const blob = [(nameCell && nameCell.textContent) || "", (row && row.textContent) || "", el.value || ""].join(" ");
      if (/no lab selected|suggested lab/.test(normalize(blob))) return;
      let score = labMatchScore(blob, wanted);
      if (/osl/i.test(String(el.value || "")) && score > 0) score += 5;
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    });
    if (wanted) return bestScore >= 40 ? best : null;
    return radios.find((el) => /osl/i.test(String(el.value || ""))) || radios[0] || null;
  }

  function applyLabFilter(labName) {
    const query = labFilterQuery(labName) || normalize(labName).slice(0, 12);
    document.documentElement.setAttribute("data-qe-lab-name", text(labName));
    document.documentElement.setAttribute("data-qe-lab-filter", query);
    document.dispatchEvent(new Event("qe-manak-filter-lab", { bubbles: true }));
    return query;
  }

  function requestLabPick(labName) {
    const token = `${text(labName)}:${Date.now()}`;
    document.documentElement.setAttribute("data-qe-lab-name", text(labName));
    document.documentElement.setAttribute("data-qe-lab-filter", labFilterQuery(labName) || normalize(labName).slice(0, 12));
    document.documentElement.setAttribute("data-qe-lab-pick", token);
    document.dispatchEvent(new Event("qe-manak-pick-lab", { bubbles: true }));
    const confirm = document.getElementById("selectFinalLab");
    if (confirm && !isNeverClick(confirm) && document.querySelector("input[name='clickonlab']:checked")) {
      confirm.click();
    }
  }

  function clickSuggestedLab(labName) {
    applyLabFilter(labName);
    const match = findMatchingLabRadio(labName);
    if (!match) return false;
    requestLabPick(labName);
    return true;
  }

  function labIsSelected(labName) {
    const el = document.getElementById("lab_name");
    if (!el || el.tagName !== "SELECT") return false;
    const opted = el.options[el.selectedIndex];
    const label = (opted && opted.textContent) || "";
    const val = text(el.value);
    if (!val || val === "0" || /select lab name|no lab selected/.test(normalize(label))) return false;
    if (!text(labName)) return true;
    return labMatchScore(label + " " + val, labName) >= 40;
  }

  async function pickLaboratory(payload) {
    const labName = lookup(payload, "sample.laboratory_name") || lookup(payload, "sample.destination_lab");
    if (labIsSelected(labName)) return true;

    const sug = findBySelectors((map.navigation && map.navigation.suggestedLab && map.navigation.suggestedLab.selectors) || []);
    if (sug) sug.click();

    const check =
      findBySelectors((map.navigation && map.navigation.checkLab && map.navigation.checkLab.selectors) || []) ||
      Array.from(document.querySelectorAll("button, input[type='button']")).find((el) =>
        /check lab availability/i.test(el.textContent || el.value || ""),
      );
    if (check && !isNeverClick(check)) check.click();

    let picked = false;
    for (let i = 0; i < 24 && !labIsSelected(labName); i += 1) {
      await sleep(700);
      const tableReady = Boolean(
        document.getElementById("filter") && document.querySelector("input[name='clickonlab']"),
      );
      if (tableReady) {
        applyLabFilter(labName);
        await sleep(450);
        picked = clickSuggestedLab(labName) || picked;
        if (picked) {
          for (let w = 0; w < 12 && !labIsSelected(labName); w += 1) await sleep(400);
          break;
        }
      } else if (i === 3 || i === 8) {
        const again = document.getElementById("suglab");
        if (again) again.click();
      }
    }
    if (!labIsSelected(labName) && labName) {
      showBanner(`Could not match laboratory “${labName}” in Check Lab Availability.`, false, true);
    }
    return labIsSelected(labName);
  }

  function isVisibleEl(el) {
    if (!el) return false;
    const st = window.getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) {
      return false;
    }
    const box = el.getBoundingClientRect();
    return box.width > 2 && box.height > 2;
  }

  function hasLogoutLink() {
    return Boolean(document.querySelector("a[href*='logout' i]"));
  }

  function isLoggedInSession() {
    return Boolean(loggedInPortalUser() || hasLogoutLink());
  }

  function isKnowFeesPage() {
    return /knowfees/i.test(location.pathname);
  }

  function isLoginPage() {
    if (isKnowFeesPage()) return false;
    if (isLoggedInSession()) return false;
    if (/ebislogin/i.test(location.pathname)) return true;
    const pass = document.querySelector("#InputPassword, input[name='passwd'], input[type='password']");
    return Boolean(pass && isVisibleEl(pass));
  }

  function isHomePage() {
    if (isTrPage() || isTestRequestListPage() || isViewOrPrintPage()) return false;
    if (/ebislogin/i.test(location.pathname)) return false;
    if (isLoginPage()) return false;
    if (isLoggedInSession()) return true;
    return /\/manak\/login\/?$/.test(location.pathname.toLowerCase());
  }

  function loggedInPortalUser() {
    const labels = Array.from(document.querySelectorAll(".profile-username")).map((el) =>
      text(el.textContent),
    );
    for (const line of labels) {
      const match = line.match(/user\s*name\s*:\s*([A-Za-z0-9._-]+)/i);
      if (match) return match[1];
    }
    const body = document.body ? document.body.innerText || "" : "";
    const match = body.match(/UserName:\s*([A-Za-z0-9._-]+)/i);
    return match ? match[1] : "";
  }

  function payloadWithoutPassword(payload) {
    if (!payload || typeof payload !== "object") return payload || null;
    const next = { ...payload };
    delete next.portalPassword;
    delete next.password;
    delete next.passwd;
    return next;
  }

  function loginCredentialsFromUrl() {
    try {
      const u = new URL(location.href);
      return {
        userId: text(u.searchParams.get("userId") || u.searchParams.get("username")),
        password: "",
      };
    } catch {
      return { userId: "", password: "" };
    }
  }

  function fillLoginControl(el, value) {
    if (!el || !text(value)) return;
    writeInput(el, text(value));
    try {
      el.setAttribute("value", text(value));
    } catch {
      /* ignore */
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    try {
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text(value), inputType: "insertText" }));
    } catch {
      /* ignore */
    }
  }

  function findLoginUserField() {
    const byId = document.getElementById("InputEmail");
    if (byId && isVisibleEl(byId) && !isSkipField(byId)) return byId;
    return (
      Array.from(document.querySelectorAll("input[type='text'], input[type='email']")).find((el) => {
        if (!isVisibleEl(el) || isSkipField(el)) return false;
        const blob = [el.id, el.name, el.placeholder, el.getAttribute("autocomplete"), el.getAttribute("aria-label")]
          .map(normalize)
          .join(" ");
        if (/captcha|kaptcha|otp|search/.test(blob)) return false;
        return el.name === "userId" || /user|email|login|userid/.test(blob);
      }) || null
    );
  }

  function findLoginPasswordField() {
    const byId = document.getElementById("InputPassword");
    if (byId && isVisibleEl(byId)) return byId;
    return (
      Array.from(document.querySelectorAll("input[type='password']")).find(
        (el) => isVisibleEl(el) && !/otp|captcha/i.test(el.name || el.id || ""),
      ) || null
    );
  }

  function loginFillStatus(userId, password) {
    const fromUrl = loginCredentialsFromUrl();
    const id = text(userId) || fromUrl.userId;
    const pwd = text(password) || fromUrl.password;
    const user = findLoginUserField();
    const pass = findLoginPasswordField();
    return {
      id,
      pwd,
      userOk: Boolean(user && id && text(user.value) === id),
      passOk: Boolean(pass && pwd && text(pass.value).length > 0),
    };
  }

  function fillLoginFields(userId, password) {
    const fromUrl = loginCredentialsFromUrl();
    const id = text(userId) || fromUrl.userId;
    const pwd = text(password) || fromUrl.password;
    const user = findLoginUserField();
    const pass = findLoginPasswordField();
    // Avoid re-writing fields that are already correct — Manak often refreshes captcha on input events.
    const userNeeds = Boolean(user && id && text(user.value) !== id);
    const passNeeds = Boolean(pass && pwd && text(pass.value) !== pwd);
    if (userNeeds) fillLoginControl(user, id);
    if (passNeeds) fillLoginControl(pass, pwd);
    if (userNeeds || passNeeds) {
      document.dispatchEvent(
        new CustomEvent("qe-manak-fill-login", {
          bubbles: true,
          detail: { userId: id, password: pwd },
        }),
      );
    }
    const status = loginFillStatus(id, pwd);
    if (id || pwd) {
      showBanner(
        status.userOk && status.passOk
          ? "User ID and password filled. Type captcha only."
          : !pwd
            ? "User ID filled. No portal password on this record."
            : !id
              ? "Password filled. No portal User ID on this record."
              : status.userOk
                ? "User ID filled. Password field is waiting."
                : "Could not find login fields yet. Retrying…",
        status.userOk || status.passOk,
        true,
      );
    }
    return status;
  }


  function readArmedState() {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        ["qeManakArmed", "qeManakHomeReady", "qeManakPortal", "qeManakEnabled"],
        (data) => resolve(data || {}),
      );
    });
  }

  function hasIndianStandardField() {
    return Boolean(
      document.querySelector("#isNumber, #isNo, #is_number, input[name='isNumber'], input[name='isNo']") ||
        findByLabels(["indian standard", "is number", "iss"]),
    );
  }

  function isTrPage() {
    return /testRequestGenerationForApplicant/i.test(location.pathname);
  }

  function fillSessionKey(payload) {
    return `qeManakFilled:${text(payload.sampleId)}:${payload.copiedAt || ""}`;
  }

  function markQrSubmitted() {
    sessionStorage.setItem("qeManakQrSubmitted", "1");
    sessionStorage.setItem("qeManakNeedList", "1");
  }

  function watchQrSubmitClicks() {
    if (window.__qeManakQrSubmitWatch) return;
    window.__qeManakQrSubmitWatch = true;
    document.addEventListener(
      "click",
      (event) => {
        const el =
          event.target && event.target.closest
            ? event.target.closest("a, button, input, [role='button']")
            : null;
        if (!el || isNeverClick(el)) return;
        const t = normalize(el.textContent || el.value || el.title || el.getAttribute("aria-label") || "");
        if (!(t === "submit" || t === "save" || t.includes("submit qr") || t.includes("submit code"))) {
          return;
        }
        const wrap = el.closest("form, .panel, .box, table, tr, div") || document.body;
        if (wrap && wrap.querySelector("#qrcodeNumber, input[name='qrcodeNumber'], input[id*='qr' i]")) {
          markQrSubmitted();
        }
      },
      true,
    );
  }

  function fillQrIfPresent(payload) {
    const qr = lookup(payload, "sample.qr_code");
    if (!qr) return false;
    const field = (map.fields || []).find((item) => item.key === "sample.qr_code");
    const el = findBySelectors((field && field.selectors) || []) || findByLabels((field && field.labels) || []);
    if (!el) return false;
    if (text(el.value) === qr) {
      sessionStorage.setItem("qeManakQrFilled", "1");
      return false;
    }
    setNativeValue(el, qr);
    sessionStorage.setItem("qeManakQrFilled", "1");
    showBanner("QR Code filled.", true);
    return true;
  }

  function isPayLike(el) {
    const blob = normalize(el.textContent || el.value || el.getAttribute("aria-label") || "");
    return /pay\b|proceed to payment|otp/.test(blob);
  }

  function captchaInputs() {
    const named = Array.from(document.querySelectorAll("input, textarea")).filter((el) => {
      const type = String(el.type || "text").toLowerCase();
      if (["hidden", "password", "submit", "button", "checkbox", "radio", "file"].includes(type)) {
        return false;
      }
      const blob = [el.id, el.name, el.placeholder, el.getAttribute("aria-label"), el.className]
        .map(normalize)
        .join(" ");
      return /captcha|kaptcha|sec(?:urity)?\s*code|verif/.test(blob);
    });
    if (named.length) return named;
    const imgs = Array.from(
      document.querySelectorAll("img[src*='captcha' i], img[id*='captcha' i], img[alt*='captcha' i]"),
    );
    const nearby = [];
    imgs.forEach((img) => {
      const wrap = img.closest("tr, td, li, .form-group, .form-row, div") || img.parentElement;
      if (!wrap) return;
      wrap.querySelectorAll("input[type='text'], input:not([type])").forEach((el) => nearby.push(el));
    });
    return nearby;
  }

  function pageHasCaptcha() {
    if (captchaInputs().length > 0) return true;
    if (document.querySelector("img[src*='captcha' i], img[id*='captcha' i], img[alt*='captcha' i]")) {
      return true;
    }
    return /enter captcha|type the captcha|security code/i.test(document.body.innerText || "");
  }

  function userFilledCaptcha() {
    return captchaInputs().some((el) => text(el.value).length >= 4);
  }

  function clickWhitelist(labels) {
    const wanted = (labels || []).map(normalize).filter(Boolean);
    const nodes = Array.from(
      document.querySelectorAll("a, button, [role='button'], input[type='button'], input[type='submit']"),
    ).filter((el) => !isPayLike(el) && !isNeverClick(el));
    const score = (el) => {
      const t = normalize(el.textContent || el.value || el.getAttribute("aria-label") || "");
      if (wanted.some((w) => t === w)) return 2;
      if (wanted.some((w) => t.startsWith(w))) return 1;
      return 0;
    };
    const match = nodes
      .map((el) => ({ el, n: score(el) }))
      .filter((item) => item.n > 0)
      .sort((a, b) => b.n - a.n)[0];
    if (!match) return false;
    match.el.click();
    return true;
  }

  function afterCaptchaMap() {
    return map.afterCaptcha || {};
  }

  function clickContinueAfterCaptcha() {
    if (isLoginPage()) {
      return clickWhitelist(afterCaptchaMap().loginLabels || ["sign in", "login"]);
    }
    const generated = clickWhitelist(
      afterCaptchaMap().generateLabels || ["generate test request", "submit"],
    );
    if (generated) return true;
    return clickWhitelist(afterCaptchaMap().confirmLabels || ["confirm"]);
  }

  function clickDownloadTestRequest() {
    return clickWhitelist(
      afterCaptchaMap().downloadLabels || ["download test request", "download pdf", "download"],
    );
  }

  function arrayBufferToBase64(buf) {
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
      try {
        const sent = chrome.runtime.sendMessage(message, (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(res);
        });
        if (sent && typeof sent.catch === "function") sent.catch(reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  async function sendPdfToApp(payload, base64, name) {
    const raw = String(base64 || "").replace(/^data:application\/pdf;base64,/i, "").replace(/\s+/g, "");
    if (!raw || window.__qeManakPdfSent) return;
    window.__qeManakPdfSending = true;
    const meta = {
      sampleId: text(payload.sampleId),
      sample_code: cleanSampleCode(readSampleCodeFromPage() || lookup(payload, "sample.sample_code")),
      qr_code: lookup(payload, "sample.qr_code"),
      pdfName: name || `Test_Request_${text(payload.sampleId) || "sample"}.pdf`,
    };
    const id = `pdf-${meta.sampleId || "x"}-${Date.now()}`;
    const chunk = 120000;
    const total = Math.ceil(raw.length / chunk) || 1;
    try {
      await sendRuntimeMessage({ type: "QE_MANAK_PDF_START", id, total, meta });
      for (let i = 0; i < total; i += 1) {
        await sendRuntimeMessage({
          type: "QE_MANAK_PDF_PART",
          id,
          index: i,
          total,
          chunk: raw.slice(i * chunk, (i + 1) * chunk),
        });
      }
      window.__qeManakPdfSent = true;
      showBanner("Test Request PDF sent to Consultancy Pro for attach.", true);
      window.setTimeout(() => {
        const code =
          cleanSampleCode(readSampleCodeFromPage() || meta.sample_code) || meta.sample_code;
        if (code) publishResult(payload, code);
        if (text(payload.sampleId) || code) finishTestRequestAndClose(payload);
      }, 1400);
    } catch {
      window.__qeManakPdfSending = false;
      showBanner("PDF send failed. Retrying capture…", false);
    }
  }

  async function capturePdfFromUrl(payload, url) {
    if (!url || window.__qeManakPdfSent) return false;
    try {
      const res = await fetch(url, { credentials: "include" });
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      const buf = await res.arrayBuffer();
      if (buf.byteLength < 80) return false;
      const head = String.fromCharCode.apply(null, new Uint8Array(buf.slice(0, 5)));
      if (!/pdf/i.test(ct) && !/\.pdf/i.test(url) && head !== "%PDF-") return false;
      await sendPdfToApp(payload, arrayBufferToBase64(buf), url.split("/").pop() || "");
      return true;
    } catch {
      return false;
    }
  }

  function findPdfUrlOnPage() {
    const hooked = document.documentElement.getAttribute("data-qe-pdf-url") || "";
    if (hooked && !isBlockedUrl(hooked)) return hooked;
    const anchors = Array.from(document.querySelectorAll("a[href], embed[src], iframe[src], object[data]"));
    for (const el of anchors) {
      const href = text(el.href || el.src || el.getAttribute("data") || "");
      if (!href || isBlockedUrl(href)) continue;
      if (/pdf|generatePdf|printPdf|viewPdf|downloadPdf/i.test(href)) return href;
    }
    return "";
  }

  function startPdfWatch(payload) {
    watchStoredPagePdf(payload);
    if (window.__qeManakPdfWatch) return;
    window.__qeManakPdfWatch = true;
    const origOpen = window.open;
    window.open = function (url, ...rest) {
      const href = String(url || "");
      if (isBlockedUrl(href)) {
        showBanner("Blocked BIS Play Store / app link.", false);
        return null;
      }
      if (href && /\.pdf($|\?)/i.test(href)) void capturePdfFromUrl(payload, href);
      return origOpen.call(window, url, ...rest);
    };
    const tick = () => {
      if (window.__qeManakPdfSent) return;
      const hooked = document.documentElement.getAttribute("data-qe-pdf-url") || "";
      if (hooked) void capturePdfFromUrl(payload, hooked);
      if (/\.pdf($|\?)/i.test(location.href) || document.contentType === "application/pdf") {
        void capturePdfFromUrl(payload, location.href);
        return;
      }
      const found = findPdfUrlOnPage();
      if (found) void capturePdfFromUrl(payload, found);
    };
    tick();
    const timer = window.setInterval(tick, 2000);
    window.setTimeout(() => window.clearInterval(timer), 15 * 60 * 1000);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.type !== "QE_PAGE_PDF" || !data.base64) return;
    chrome.storage.local.get(["pendingFill"], (store) => {
      const payload = (store && store.pendingFill) || {};
      void sendPdfToApp(payload, data.base64, data.name || "");
    });
  });

  function watchStoredPagePdf(payload) {
    if (window.__qePagePdfWatch) return;
    window.__qePagePdfWatch = true;
    const tick = () => {
      if (window.__qeManakPdfSent || window.__qeManakPdfSending) return;
      let b64 = "";
      let name = "Test_Request.pdf";
      try {
        b64 = sessionStorage.getItem("qeManakPdfB64") || "";
        name = sessionStorage.getItem("qeManakPdfName") || name;
      } catch {
        /* ignore */
      }
      if (!b64) return;
      void sendPdfToApp(payload || {}, b64, name);
    };
    tick();
    window.setInterval(tick, 1200);
  }

  function startCaptchaContinue(payload, mode) {
    const nextMode = mode || "login";
    // Import QR must be able to take over a stale login/TR captcha watch.
    // Never restart the same mode — that re-highlights captcha and causes blink.
    if (window.__qeManakCaptchaWatch) {
      if (
        nextMode === "import-qr" &&
        window.__qeManakCaptchaMode &&
        window.__qeManakCaptchaMode !== "import-qr"
      ) {
        window.__qeManakCaptchaWatch = false;
        window.__qeManakSubmitted = false;
        if (window.__qeManakCaptchaTimer) {
          window.clearInterval(window.__qeManakCaptchaTimer);
          window.__qeManakCaptchaTimer = 0;
        }
      } else {
        return;
      }
    }
    window.__qeManakCaptchaWatch = true;
    window.__qeManakCaptchaMode = nextMode;
    const importQrMode = nextMode === "import-qr";
    // "login" here means eBIS Sign In only — Import QR must NOT fall into TR navigation.
    const loginMode = nextMode === "login" || (!importQrMode && isLoginPage());
    const needsCaptcha = pageHasCaptcha() || importQrMode || loginMode;

    if (!loginMode && !needsCaptcha) {
      fillQrIfPresent(payload);
      showBanner(
        "Form filled. Click Submit. After QR fills, click Submit again (twice if asked). PDF attaches in Consultancy Pro.",
        true,
        true,
      );
      startPdfWatch(payload);
      return;
    }

    let typedByUser = false;
    let firstTypedAt = 0;
    let debounce = 0;
    const CAPTCHA_HOLD_MS = 10000;

    const tryContinue = async () => {
      if (window.__qeManakSubmitted) return;
      if (!typedByUser || !userFilledCaptcha()) return;
      // Enforce 10s hold from first key even if a short debounce path races in.
      if (firstTypedAt && Date.now() - firstTypedAt < CAPTCHA_HOLD_MS) return;
      window.__qeManakSubmitted = true;
      if (window.__qeManakCaptchaTimer) window.clearInterval(window.__qeManakCaptchaTimer);
      if (debounce) window.clearTimeout(debounce);
      // Login / Import QR: auto-click Sign In after captcha.
      // Test Request: never auto-click Submit — user clicks Submit (then again after QR).
      if (importQrMode || loginMode) {
        const clicked = clickContinueAfterCaptcha();
        showBanner(
          clicked
            ? importQrMode
              ? "Captcha accepted. Opening Generate QR Codes…"
              : "Captcha accepted. Opening Home…"
            : "Captcha filled. Click Sign In / Submit if the page is waiting.",
          clicked,
        );
        if (importQrMode) {
          chrome.storage.local.set({
            qeManakImportQrEnabled: true,
            qeManakImportQrLanded: true,
            pendingFill: null,
            qeManakImportQr: true,
            // Keep Test Request Auto OFF for Import QR flow.
            qeManakEnabled: false,
          });
          const qrUrl =
            (map && map.generateQrUrl) ||
            "https://www.manakonline.in/MANAK/employeeQrCodeGeneration";
          window.setTimeout(() => {
            if (/employeeQrCodeGeneration|generateqr|qrcodegeneration/i.test(location.pathname || "")) {
              return;
            }
            if (isLoginPage() && !isLoggedInSession()) return;
            if (sessionStorage.getItem("qeManakOpenedQr") === "1") return;
            sessionStorage.setItem("qeManakOpenedQr", "1");
            location.href = qrUrl;
          }, 1600);
          return;
        }
        // Belt-and-suspenders: if Import QR armed mid-flight, never open Test Request.
        chrome.storage.local.get(["qeManakImportQr"], (store) => {
          if (store && store.qeManakImportQr === true) {
            chrome.storage.local.set({
              qeManakImportQrEnabled: true,
              qeManakImportQrLanded: true,
              pendingFill: null,
              qeManakEnabled: false,
            });
            const qrUrl =
              (map && map.generateQrUrl) ||
              "https://www.manakonline.in/MANAK/employeeQrCodeGeneration";
            window.setTimeout(() => {
              if (/employeeQrCodeGeneration|generateqr|qrcodegeneration/i.test(location.pathname || "")) {
                return;
              }
              if (isLoginPage() && !isLoggedInSession()) return;
              if (sessionStorage.getItem("qeManakOpenedQr") === "1") return;
              sessionStorage.setItem("qeManakOpenedQr", "1");
              location.href = qrUrl;
            }, 1600);
            return;
          }
          chrome.storage.local.set({
            qeManakEnabled: true,
            qeManakArmed: true,
            qeManakHomeReady: true,
            qeManakImportQr: false,
            pendingFill: payloadWithoutPassword(payload),
          });
          setTrCaptureFlag(Boolean(payload && payload.sampleId));
          const trUrl = (map && map.testRequestUrl) || TR_URL;
          window.setTimeout(() => {
            if (isLoginPage() && !isLoggedInSession()) return;
            if (isTrPage()) {
              void runWorkflow(payload, { force: true });
              return;
            }
            sessionStorage.setItem("qeManakHomeReady", "1");
            sessionStorage.setItem("qeManakOpenedTr", "1");
            location.href = trUrl;
          }, 1800);
        });
        return;
      }
      fillQrIfPresent(payload);
      startPdfWatch(payload);
      showBanner(
        "Captcha accepted. Click Submit. After QR fills, click Submit again (twice if asked). PDF attaches in Consultancy Pro.",
        true,
        true,
      );
    };

    function markCaptchaTyped() {
      typedByUser = true;
      if (!firstTypedAt) firstTypedAt = Date.now();
    }

    function holdSecondsLeft() {
      if (!firstTypedAt) return Math.ceil(CAPTCHA_HOLD_MS / 1000);
      return Math.max(0, Math.ceil((CAPTCHA_HOLD_MS - (Date.now() - firstTypedAt)) / 1000));
    }

    function bindInputs() {
      captchaInputs().forEach((el) => {
        if (el.dataset.qeCaptchaBound === "1") return;
        el.dataset.qeCaptchaBound = "1";
        const onType = (event) => {
          markCaptchaTyped();
          // Never continue on Enter / short debounce — 10s hold is owned by solvePageCaptcha
          // (or the hold poll below when assist is missing).
          if (event && event.key === "Enter") {
            try {
              event.preventDefault();
              event.stopPropagation();
            } catch {
              /* ignore */
            }
          }
          const left = holdSecondsLeft();
          if (left > 0 && userFilledCaptcha()) {
            showBanner(
              `Captcha typing started. Next step in ${left}s…`,
              true,
              true,
            );
          }
        };
        el.addEventListener("input", onType, true);
        el.addEventListener("keyup", onType, true);
        el.addEventListener("keydown", onType, true);
        el.addEventListener("paste", () => window.setTimeout(onType, 0), true);
      });
    }

    bindInputs();
    const obs = new MutationObserver(() => bindInputs());
    if (document.body) obs.observe(document.body, { childList: true, subtree: true });

    const loginUser = document.getElementById("InputEmail");
    const loginPass = document.getElementById("InputPassword");
    const loginFilled =
      (importQrMode || loginMode) &&
      text(loginUser && loginUser.value) &&
      text(loginPass && loginPass.value);
    showBanner(
      importQrMode
        ? loginFilled
          ? "Import QR: User ID and password filled. Type captcha — waits 10 seconds from your first key."
          : "Import QR: Type captcha — waits 10 seconds from your first key."
        : loginMode
          ? loginFilled
            ? "User ID and password filled. Type captcha — waits 10 seconds from your first key."
            : "Type captcha — waits 10 seconds from your first key."
          : "Type captcha if shown — waits 10 seconds from your first key.",
      true,
      true,
    );

    void (async () => {
      const assist = self.qeCaptchaAssist;
      if (assist && typeof assist.solvePageCaptcha === "function") {
        const solved = await assist.solvePageCaptcha({
          minChars: 4,
          holdMs: CAPTCHA_HOLD_MS,
          fallbackMs: 300000,
        });
        if (!solved) return;
        markCaptchaTyped();
        // Hold already satisfied inside solvePageCaptcha.
        firstTypedAt = Date.now() - CAPTCHA_HOLD_MS;
        void tryContinue();
        return;
      }
      // Fallback without captcha-assist: poll until 10s hold after first key.
      const started = Date.now();
      let lastLeft = -1;
      while (Date.now() - started < 300000) {
        if (window.__qeManakSubmitted) return;
        bindInputs();
        if (typedByUser && userFilledCaptcha() && firstTypedAt) {
          const left = holdSecondsLeft();
          if (left !== lastLeft) {
            lastLeft = left;
            showBanner(
              left > 0
                ? `Captcha typing started. Next step in ${left}s…`
                : "Captcha time done. Continuing…",
              true,
              true,
            );
          }
          if (left <= 0) {
            void tryContinue();
            return;
          }
        }
        await sleep(250);
      }
    })();

    window.__qeManakCaptchaTimer = window.setInterval(() => {
      bindInputs();
    }, 800);

    window.setTimeout(() => obs.disconnect(), 30 * 60 * 1000);
  }

  function cleanSampleCode(value) {
    return text(value)
      .replace(/\s+/g, "")
      .replace(/(?:QRCODE|QR)$/i, "");
  }

  function isValidSampleCode(value, qr) {
    const v = cleanSampleCode(value);
    if (!v || v.length < 4 || v.length > 48) return false;
    if (/\s/.test(v)) return false;
    if (/^QR/i.test(v)) return false;
    if (/laboratory|laboratories|gravitas|limited|private|hyderabad|kolkata|jaipur/i.test(v)) {
      return false;
    }
    if (!/^[A-Z0-9][A-Z0-9/._-]+$/i.test(v)) return false;
    if (qr && normalize(v) === normalize(qr)) return false;
    return true;
  }

  function readSampleCodeFromPage() {
    if (
      isTrPage() &&
      !isTestRequestListPage() &&
      !isViewOrPrintPage() &&
      !pageLooksLikePostQrSubmit()
    ) {
      return "";
    }
    const qr = "";
    const field = (map.fields || []).find((item) => item.key === "sample.sample_code");
    const el =
      findBySelectors((field && field.selectors) || []) ||
      findByLabels((field && field.labels) || []);
    if (el && isValidSampleCode(el.value || el.textContent, qr)) {
      return cleanSampleCode(el.value || el.textContent);
    }

    const labeled = Array.from(document.querySelectorAll("td, th, label, span, b, strong, p, h3, h4"))
      .filter((node) => {
        const raw = node.textContent || "";
        if (raw.length >= 80) return false;
        if (!/sample\s*code|test\s*request\s*(no|number|code)/i.test(raw)) return false;
        if (/sample\s*code/i.test(raw) && /qr\s*code/i.test(raw) && raw.length > 24) return false;
        return true;
      })
      .sort((a, b) => (a.textContent || "").length - (b.textContent || "").length)[0];
    if (labeled) {
      const fromSelf = (labeled.textContent || "").match(
        /sample\s*code\s*[:.\-]?\s*([A-Z0-9][A-Z0-9/._-]{3,40}?)(?=\s*(?:QR\b|$))/i,
      );
      if (fromSelf && isValidSampleCode(fromSelf[1], qr)) return cleanSampleCode(fromSelf[1]);
      const sib = labeled.nextElementSibling;
      const fromSib = sib ? text(sib.value || sib.textContent) : "";
      if (isValidSampleCode(fromSib, qr)) return cleanSampleCode(fromSib);
    }

    const body = document.body ? document.body.innerText || "" : "";
    const patterns = [
      /sample\s*code\s*[:.\-]?\s*([A-Z0-9][A-Z0-9/._-]{3,40}?)(?=\s*(?:QR\b|QR\s*CODE|$|[^A-Z0-9/._-]))/i,
      /test\s*request\s*(?:no|number|code)\s*[:.\-]?\s*([A-Z0-9][A-Z0-9/._-]{3,40}?)(?=\s*(?:QR\b|$|[^A-Z0-9/._-]))/i,
      /generated\s+(?:sample\s*code|tr\s*no)\s*[:.\-]?\s*([A-Z0-9/._-]{4,40}?)(?=\s*(?:QR\b|$|[^A-Z0-9/._-]))/i,
    ];
    for (const re of patterns) {
      const match = body.match(re);
      if (match && isValidSampleCode(match[1], qr)) return cleanSampleCode(match[1]);
    }
    return "";
  }

  function publishResult(payload, sampleCode) {
    const code = cleanSampleCode(sampleCode);
    if (!isValidSampleCode(code, lookup(payload, "sample.qr_code"))) return;
    if (!code || window.__qeManakCaptured === code) return;
    window.__qeManakCaptured = code;
    const result = {
      kind: RESULT_KIND,
      sampleId: text(payload.sampleId),
      sample_code: code,
      qr_code: lookup(payload, "sample.qr_code"),
      filledAt: Date.now(),
    };
    try {
      const sent = chrome.runtime.sendMessage({ type: "QE_MANAK_RESULT", result });
      if (sent && typeof sent.catch === "function") sent.catch(() => {});
    } catch {
      /* ignore */
    }
    showBanner(`Sample Code ${code} sent back to Consultancy Pro.`, true);
    window.setTimeout(() => {
      if (!window.__qeManakPdfSent && isViewOrPrintPage()) requestSilentPdf(payload);
    }, 800);
  }

  function startWatchers(payload) {
    if (window.__qeManakWatch) return;
    window.__qeManakWatch = true;

    const tick = () => {
      fillQrIfPresent(payload);
      const hooked = document.documentElement.getAttribute("data-qe-pdf-url") || "";
      if (hooked) void capturePdfFromUrl(payload, hooked);
      if (isTestRequestListPage() || isViewOrPrintPage() || pageLooksLikePostQrSubmit()) {
        const code = readSampleCodeFromPage();
        if (code) publishResult(payload, code);
      }
    };

    tick();
    const timer = window.setInterval(tick, 1500);
    const obs = new MutationObserver(() => tick());
    if (document.body) obs.observe(document.body, { childList: true, subtree: true });
    watchQrSubmitClicks();
    startListAndPrintFlow(payload);
    window.setTimeout(() => {
      window.clearInterval(timer);
      obs.disconnect();
      window.__qeManakWatch = false;
    }, 15 * 60 * 1000);
  }

  function isListButtonText(value) {
    const t = normalize(value);
    return /test\s*requests?\s*list/.test(t) && !/generate/.test(t);
  }

  function findTestRequestsListButton() {
    const mapped = ((map.navigation && map.navigation.testRequestList && map.navigation.testRequestList.labels) || []).map(
      normalize,
    );
    const nodes = Array.from(
      document.querySelectorAll(
        "a, button, input[type='button'], input[type='submit'], [role='button'], span, td",
      ),
    );
    const matches = nodes.filter((el) => {
      if (!el || isNeverClick(el)) return false;
      const visible = normalize(el.value || el.textContent || el.title || el.getAttribute("aria-label") || "");
      if (visible.length > 80) return false;
      if (isListButtonText(visible)) return true;
      if (mapped.some((label) => label && (visible === label || visible.includes(label)))) return true;
      const extra = [el.getAttribute("onclick"), el.getAttribute("href"), el.id]
        .map(normalize)
        .join(" ");
      return /testrequestlist|viewtestrequestlist|test.?requests?.?list/.test(extra);
    });
    if (!matches.length) return null;
    matches.sort((a, b) => {
      const aLen = normalize(a.value || a.textContent || "").length;
      const bLen = normalize(b.value || b.textContent || "").length;
      return aLen - bLen;
    });
    return (
      matches.find((el) => !el.closest("nav, .navbar, header, #mini-nav, .navbar-nav")) ||
      matches[0]
    );
  }

  function isTestRequestListPage() {
    const path = location.pathname.toLowerCase();
    if (/testrequestlist|viewapplicanttestrequestlist|trlist/i.test(path)) return true;
    if (/viewapplicanttestrequest(\?|$)/i.test(location.pathname + location.search)) return false;
    const heading = normalize(
      (document.querySelector("fieldset legend, h1, h2, h3, .page-header") || {}).textContent || "",
    );
    if (/test\s*request\s*details/.test(heading) && document.querySelector("table")) return true;
    const tables = Array.from(document.querySelectorAll("table"));
    return tables.some((table) => {
      const head = normalize(table.innerText || "").slice(0, 500);
      return (
        /sample\s*code/.test(head) &&
        /qr\s*code/.test(head) &&
        /view\s*test\s*request/.test(head)
      );
    });
  }

  function isViewOrPrintPage() {
    if (isTestRequestListPage()) return false;
    const path = (location.pathname + location.search).toLowerCase();
    if (/viewapplicanttestrequest(\?|$)/i.test(path)) return true;
    if (/printtestrequest|printapplicanttestrequest|testrequestdetail/i.test(path)) return true;
    return clickableCandidates().some((el) => {
      const t = normalize(el.textContent || el.value || "");
      return t === "print" || t === "print test request" || t === "download pdf";
    });
  }

  function pageLooksLikePostQrSubmit() {
    if (isTestRequestListPage() || isViewOrPrintPage()) return true;
    const t = normalize(document.body ? document.body.innerText : "");
    return /successfully|sent to the lab|test request generated|test request has been|qr code submitted|submitted successfully/i.test(
      t,
    );
  }

  function clickTestRequestList() {
    const match = findTestRequestsListButton();
    if (!match) return false;
    match.click();
    return true;
  }

  function headerIndex(table, re) {
    const head = table.querySelector("thead tr") || table.querySelector("tr");
    if (!head) return -1;
    const cells = Array.from(head.querySelectorAll("th, td"));
    return cells.findIndex((cell) => re.test(normalize(cell.textContent || "")));
  }

  function filterListByQr(qr) {
    const q = text(qr);
    if (!q) return;
    const filter = document.querySelector(
      "input[type='search'], input#filter, input[placeholder*='search' i], .footable input[type='text']",
    );
    if (!filter) return;
    if (text(filter.value) === q) return;
    setNativeValue(filter, q);
    filter.dispatchEvent(new Event("keyup", { bubbles: true }));
  }

  function findViewLink(row) {
    const nodes = Array.from(row.querySelectorAll("a, button, input, span"));
    return (
      nodes.find((el) => {
        const href = String(el.getAttribute("href") || el.href || "");
        return /viewapplicanttestrequest/i.test(href) && !/list/i.test(href);
      }) ||
      nodes.find((el) => {
        const t = normalize(el.textContent || el.value || el.title || el.getAttribute("aria-label") || "");
        return /^(view|viewable)$/.test(t) || t === "view test request";
      }) ||
      null
    );
  }

  function findListRow(payload) {
    const qr = lookup(payload, "sample.qr_code");
    if (qr) filterListByQr(qr);
    const tables = Array.from(document.querySelectorAll("table"));
    for (const table of tables) {
      const qrIdx = headerIndex(table, /qr\s*code/);
      const codeIdx = headerIndex(table, /sample\s*code/);
      const rows = Array.from(table.querySelectorAll("tbody tr, tr")).filter((row) =>
        row.querySelector("td"),
      );
      const byQr = qr
        ? rows.find((row) => {
            const cells = Array.from(row.querySelectorAll("td"));
            const blob = normalize(row.textContent || "");
            const qrCell = qrIdx >= 0 ? normalize(cells[qrIdx] && cells[qrIdx].textContent) : "";
            return blob.includes(normalize(qr)) || (qrCell && qrCell.includes(normalize(qr)));
          })
        : null;
      if (byQr) return { row: byQr, table, codeIdx, qr };
      const withView = rows.find((row) => Boolean(findViewLink(row)));
      if (withView) return { row: withView, table, codeIdx, qr };
    }
    return null;
  }

  function sampleCodeFromListRow(found) {
    if (!found) return "";
    const cells = Array.from(found.row.querySelectorAll("td"));
    if (found.codeIdx >= 0 && cells[found.codeIdx]) {
      const value = cleanSampleCode(cells[found.codeIdx].textContent);
      if (isValidSampleCode(value, found.qr)) return value;
    }
    for (const cell of cells) {
      const value = cleanSampleCode(cell.textContent);
      if (isValidSampleCode(value, found.qr)) return value;
    }
    return readSampleCodeFromPage();
  }

  function clickViewOnRow(row) {
    const view = findViewLink(row);
    if (!view) return false;
    const href = view.getAttribute("href") || view.href || "";
    if (href && /viewapplicanttestrequest/i.test(href) && !/^javascript:/i.test(href)) {
      try {
        const next = new URL(href, location.href);
        sessionStorage.setItem("qeManakViewClicked", "1");
        location.href = next.toString();
        return true;
      } catch {
        /* fall through */
      }
    }
    view.click();
    return true;
  }

  function requestSilentPdf(payload) {
    if (window.__qeManakPdfSent || window.__qeManakPdfAsked) return;
    window.__qeManakPdfAsked = true;
    const sampleCode = readSampleCodeFromPage() || lookup(payload, "sample.sample_code");
    const name = `Test_Request_${sampleCode || text(payload.sampleId) || "sample"}.pdf`.replace(
      /[^\w.\-]+/g,
      "_",
    );
    startPdfWatch(payload);
    watchStoredPagePdf(payload);
    showBanner("Capturing Test Request PDF for Consultancy Pro…", true);
    document.dispatchEvent(new CustomEvent("qe-manak-download-pdf", { bubbles: true }));
    window.setTimeout(() => {
      if (!window.__qeManakPdfSent) clickDownloadTestRequest();
    }, 400);

    const retry = window.setInterval(() => {
      if (window.__qeManakPdfSent) {
        window.clearInterval(retry);
        return;
      }
      document.dispatchEvent(new CustomEvent("qe-manak-download-pdf", { bubbles: true }));
      clickDownloadTestRequest();
    }, 7000);

    window.setTimeout(() => {
      if (window.__qeManakPdfSent) {
        window.clearInterval(retry);
        return;
      }
      const asked = chrome.runtime.sendMessage({
        type: "QE_MANAK_PRINT_PDF",
        result: {
          sampleId: text(payload.sampleId),
          sample_code: sampleCode,
          qr_code: lookup(payload, "sample.qr_code"),
          pdfName: name,
        },
      });
      Promise.resolve(asked)
        .then((res) => {
          if (res && res.base64) {
            window.clearInterval(retry);
            void sendPdfToApp(payload, res.base64, res.name || name);
          }
        })
        .catch(() => {});
    }, 5000);

    window.setTimeout(() => window.clearInterval(retry), 2 * 60 * 1000);
  }

  async function handleListPage(payload) {
    const found = findListRow(payload);
    if (!found) {
      showBanner("Test Request list is open. Matching the sample row…", true);
      return false;
    }
    const code = sampleCodeFromListRow(found);
    if (code) publishResult(payload, code);
    const clickedAt = Number(sessionStorage.getItem("qeManakViewClickedAt") || 0);
    if (sessionStorage.getItem("qeManakViewClicked") === "1" && Date.now() - clickedAt < 4000) {
      return true;
    }
    if (clickViewOnRow(found.row)) {
      sessionStorage.setItem("qeManakViewClicked", "1");
      sessionStorage.setItem("qeManakViewClickedAt", String(Date.now()));
      showBanner("Opening View Test Request for PDF…", true);
      return true;
    }
    return Boolean(code);
  }

  async function handleViewPrint(payload) {
    startPdfWatch(payload);
    const code = readSampleCodeFromPage();
    if (code) publishResult(payload, code);
    if (window.__qeManakPdfSent) return true;
    const pdfUrl =
      document.documentElement.getAttribute("data-qe-pdf-url") || findPdfUrlOnPage();
    if (pdfUrl) {
      await capturePdfFromUrl(payload, pdfUrl);
      if (window.__qeManakPdfSent) return true;
    }
    requestSilentPdf(payload);
    return true;
  }

  function startListAndPrintFlow(payload) {
    if (window.__qeManakListFlow) return;
    window.__qeManakListFlow = true;

    const tick = async () => {
      if (window.__qeManakPdfSent && window.__qeManakCaptured) return;
      if (isLoginPage()) return;

      if (isViewOrPrintPage()) {
        await handleViewPrint(payload);
        return;
      }

      if (isTestRequestListPage()) {
        await handleListPage(payload);
        return;
      }

      const listBtn = findTestRequestsListButton();
      const inNav = listBtn && listBtn.closest("nav, .navbar, header, #mini-nav, .navbar-nav");
      const qrDone =
        sessionStorage.getItem("qeManakQrSubmitted") === "1" ||
        sessionStorage.getItem("qeManakNeedList") === "1" ||
        pageLooksLikePostQrSubmit();
      const ready = qrDone || (listBtn && !inNav && sessionStorage.getItem("qeManakQrFilled") === "1");
      if (!ready || !listBtn) return;
      if (inNav && !qrDone) return;
      const clickedAt = Number(sessionStorage.getItem("qeManakListClickedAt") || 0);
      if (sessionStorage.getItem("qeManakListClicked") === "1") {
        if (Date.now() - clickedAt < 4000) return;
        sessionStorage.removeItem("qeManakListClicked");
      }
      if (clickTestRequestList()) {
        sessionStorage.setItem("qeManakNeedList", "1");
        sessionStorage.setItem("qeManakListClicked", "1");
        sessionStorage.setItem("qeManakListClickedAt", String(Date.now()));
        showBanner("Opening Test Requests List for Sample Code…", true);
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), 1200);
    window.setTimeout(() => window.clearInterval(timer), 15 * 60 * 1000);
  }

  async function fillAndSearch(payload) {
    const isSearch = lookup(payload, "application.isSearch");
    const isNumber = lookup(payload, "application.isNumber") || isSearch;
    const isYear = lookup(payload, "application.isYear");
    const searchDigits = isDigits(isSearch || isNumber);
    let selected = pageShowsSelectedIs(isNumber || searchDigits);
    let first = { filled: 0 };
    if (!selected && (searchDigits || isSearch || isNumber)) {
      // Ensure payload search value is digits-only before typing into #org.
      if (payload && payload.application && searchDigits) {
        payload.application.isSearch = searchDigits;
      }
      first = fillPayload(payload, ["application.isSearch"]);
      await sleep(300);
      clickSearch();
      for (let i = 0; i < 14 && !selected; i += 1) {
        await sleep(500);
        selected = pageShowsSelectedIs(isNumber || searchDigits);
        if (!selected && isListItems().length) {
          selectIsResult(isNumber || searchDigits, isYear);
        }
      }
      await sleep(600);
      selected = pageShowsSelectedIs(isNumber || searchDigits);
    }
    const rest = fillPayload(payload);
    const dateField = (map.fields || []).find((item) => item.key === "sample.date_of_manufacturing");
    const dateEl =
      findBySelectors((dateField && dateField.selectors) || []) ||
      findByLabels((dateField && dateField.labels) || []);
    if (dateEl && lookup(payload, "sample.date_of_manufacturing")) {
      await fillDateField(dateEl, lookup(payload, "sample.date_of_manufacturing"));
    }
    if (selected || pageShowsSelectedIs(isNumber || searchDigits)) {
      await sleep(400);
      await pickLaboratory(payload);
    }
    const filled = (first.filled || 0) + (rest.filled || 0);
    showBanner(
      filled > 0
        ? selected
          ? `IS ${searchDigits || ""} selected. Filled ${filled} field(s). Click Submit when ready — QR fills next; Submit again after QR.`
          : `Filled ${filled} field(s). Check Indian Standard select if needed.`
        : rest.message,
      filled > 0 && selected,
      true,
    );
    return { ok: filled > 0, filled, selected };
  }

  function isExtensionOn() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["qeManakEnabled"], (data) => {
        resolve(Boolean(data && data.qeManakEnabled === true));
      });
    });
  }

  async function runWorkflow(payload, options) {
    if (isKnowFeesPage()) {
      return { ok: false, message: "Know Fees has no Manak login. Only captcha + IS digits." };
    }
    const force = Boolean(options && options.force);
    if (!(await isExtensionOn())) {
      return { ok: false, message: "Extension is OFF." };
    }
    if (!payload) return { ok: false, message: "No QE_MANAK_TR_V1 payload." };

    const state = await readArmedState();
    if (!force && state.qeManakArmed !== true) {
      return { ok: false, message: "Extension auto-work is not armed." };
    }

    chrome.storage.local.set({
      pendingFill: payloadWithoutPassword(payload),
      qeManakArmed: true,
      qeManakEnabled: true,
      qeManakImportQr: false,
    });
    setTrCaptureFlag(true);
    const portal = state.qeManakPortal || {};
    const wantedUser = text(portal.userId || payload.portalUserId);
    const wantedPassword = text(payload.portalPassword);

    if (isLoggedInSession() && isLoginPage() === false && !isTrPage()) {
      chrome.storage.local.set({ qeManakHomeReady: true });
    }

    if (isLoginPage()) {
      if (isLoggedInSession()) {
        chrome.storage.local.set({ qeManakHomeReady: true });
        sessionStorage.setItem("qeManakHomeReady", "1");
        sessionStorage.setItem("qeManakOpenedTr", "1");
        location.href = map.testRequestUrl || TR_URL;
        return { ok: true, message: "Already logged in. Opening Test Request." };
      }
      fillLoginFields(wantedUser, wantedPassword);
      [400, 1200, 2500].forEach((ms) => {
        window.setTimeout(() => fillLoginFields(wantedUser, wantedPassword), ms);
      });
      startCaptchaContinue(payload, "login");
      return { ok: true, message: "Waiting for login captcha. Page will not refresh." };
    }

    const filledKey = fillSessionKey(payload);
    const alreadyFilled = sessionStorage.getItem(filledKey) === "1";
    const openedTr = sessionStorage.getItem("qeManakOpenedTr") === "1";

    if (isTestRequestListPage() || isViewOrPrintPage()) {
      startWatchers(payload);
      startPdfWatch(payload);
      showBanner(
        isTestRequestListPage()
          ? "List opened. Clicking View Test Request…"
          : "View Test Request opened. Downloading PDF…",
        true,
      );
      return { ok: true, message: "Finishing Sample Code / PDF." };
    }

    if (isHomePage() || (!isTrPage() && loggedInPortalUser())) {
      if (openedTr || alreadyFilled) {
        startWatchers(payload);
        startPdfWatch(payload);
        showBanner("Watching this page for Sample Code and Test Request PDF.", true);
        return { ok: true, message: "Watching for Sample Code / PDF." };
      }
      chrome.storage.local.set({ qeManakHomeReady: true });
      sessionStorage.setItem("qeManakHomeReady", "1");
      sessionStorage.setItem("qeManakOpenedTr", "1");
      showBanner("Already logged in. Opening Test Request…", true);
      location.href = map.testRequestUrl || TR_URL;
      return { ok: true, message: "Home reached. Opening Test Request." };
    }

    if (!isTrPage()) {
      if (openedTr || alreadyFilled) {
        startWatchers(payload);
        startPdfWatch(payload);
        return { ok: true, message: "Watching for Sample Code / PDF." };
      }
      location.href = map.homeUrl || HOME_URL;
      return { ok: true, message: "Opening Manak Home first." };
    }

    const homeReady =
      state.qeManakHomeReady === true || sessionStorage.getItem("qeManakHomeReady") === "1";
    if (!homeReady) {
      location.href = map.homeUrl || HOME_URL;
      return { ok: true, message: "Opening Home before Test Request fill." };
    }

    if (alreadyFilled) {
      startWatchers(payload);
      startPdfWatch(payload);
      startCaptchaContinue(payload, "tr");
      return { ok: true, message: "Already filled. Waiting for captcha / Submit." };
    }

    await sleep(400);
    const result = await fillAndSearch(payload);
    if (result.selected || result.filled > 0) {
      sessionStorage.setItem(filledKey, "1");
    }
    startWatchers(payload);
    startPdfWatch(payload);
    startCaptchaContinue(payload, "tr");
    return result;
  }

  function navigate(kind) {
    if (kind === "generateTestRequest") {
      location.href = map.testRequestUrl || TR_URL;
      return { ok: true, message: "Opening Test Request page." };
    }
    const nav = (map.navigation && map.navigation[kind]) || null;
    if (!nav) return { ok: false, message: "Unknown navigation." };
    const ok = clickByLabels(nav.labels);
    return {
      ok,
      message: ok ? `Opened ${kind}.` : `Could not find “${nav.labels[0]}” on this page.`,
    };
  }

  function generateQrPageUrl() {
    return (
      map.generateQrUrl ||
      "https://www.manakonline.in/MANAK/employeeQrCodeGeneration"
    );
  }

  function isGenerateQrPage() {
    const path = normalize(location.pathname || "");
    const blob = normalize(document.body ? document.body.innerText.slice(0, 2500) : "");
    if (/employeeqrcodegeneration|generateqr|generate.?qr|qrcodegeneration/i.test(path)) {
      return true;
    }
    if (document.getElementById("flagChange") && document.getElementById("generate")) {
      return true;
    }
    return /generate qr code|generate new code|not used codes|available codes|available qr/i.test(
      blob,
    );
  }

  /** Import QR: only 12-digit Manak QR numbers (e.g. 100001399254). */
  function isLikelyQrCodeValue(value) {
    return /^\d{12}$/.test(text(value).replace(/\s+/g, ""));
  }

  function scrapeQrCodesFromPage() {
    const found = new Set();
    const add = (value) => {
      const v = text(value).replace(/\s+/g, "");
      if (isLikelyQrCodeValue(v)) found.add(v);
    };
    const addFromText = (raw) => {
      const t = text(raw || "").replace(/\s+/g, " ");
      (t.match(/\b\d{12}\b/g) || []).forEach(add);
    };
    // Not Used / Available Codes list — prefer visible 12-digit codes.
    document
      .querySelectorAll(
        'input[name="chk"], input[name="chk[]"], input[id^="numId"], input[name^="numId"], input[id*="numId" i]',
      )
      .forEach((el) => {
        if (!el) return;
        add(el.value);
        const row = el.closest("tr, li, label, div, td") || el.parentElement;
        if (row) addFromText(row.textContent || "");
      });
    document
      .querySelectorAll(
        "#qrcodeNumber, input[name='qrcodeNumber'], input[id*='qr' i], input[name*='qr' i], td, th, label, span",
      )
      .forEach((el) => {
        if (!el) return;
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") add(el.value);
        addFromText(el.textContent || "");
      });
    const available =
      document.querySelector("#availableCodes, .availableCodes, #AvailableCodes") ||
      document.body;
    if (available) addFromText(available.innerText || available.textContent || "");
    return Array.from(found);
  }

  function setFlagChangeMode(mode) {
    const wantGenerate = mode === "generate";
    const flag = wantGenerate ? "1" : "2";
    // Manak does NOT postback via select change alone — changeFlag() navigates:
    //   /MANAK/employeeQrCodeGeneration?flag=1|2
    const sel =
      document.getElementById("flagChange") ||
      document.querySelector("select#flagChange, select[name='flagChange']");
    if (sel) {
      const hit = Array.from(sel.options || []).find((opt) => String(opt.value) === flag);
      if (hit && String(sel.value) !== flag) sel.value = flag;
    }
    const hidden = document.getElementById("flag");
    if (hidden) hidden.value = flag;
    return true;
  }

  function navigateQrFlag(flag) {
    const f = String(flag) === "1" ? "1" : "2";
    if (typeof window.changeFlag === "function") {
      const sel =
        document.getElementById("flagChange") ||
        document.querySelector("select#flagChange, select[name='flagChange']");
      if (sel) sel.value = f;
      try {
        window.changeFlag();
        return true;
      } catch {
        /* fall through */
      }
    }
    location.href = "/MANAK/employeeQrCodeGeneration?flag=" + f;
    return true;
  }

  function qrPageFlag() {
    try {
      const fromUrl = new URL(location.href).searchParams.get("flag");
      if (fromUrl === "1" || fromUrl === "2") return fromUrl;
    } catch {
      /* ignore */
    }
    const hidden = document.getElementById("flag");
    if (hidden && (hidden.value === "1" || hidden.value === "2")) return String(hidden.value);
    const sel =
      document.getElementById("flagChange") ||
      document.querySelector("select#flagChange, select[name='flagChange']");
    if (sel && (sel.value === "1" || sel.value === "2")) return String(sel.value);
    return "";
  }

  function isQrGenerateMode() {
    return qrPageFlag() === "1";
  }

  function selectGenerateNewCode() {
    return setFlagChangeMode("generate");
  }

  function isFlagChangeNotUsed(sel) {
    if (!sel || !sel.options) return false;
    if (String(sel.value) === "2") return true;
    const label = normalize(
      (sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].textContent) ||
        sel.value ||
        "",
    );
    return /not used codes|unused|available/i.test(label);
  }

  function selectNotUsedCodes() {
    const sel =
      document.getElementById("flagChange") ||
      document.querySelector("select#flagChange, select[name='flagChange']");
    // Already showing Not Used — never re-fire change (ASP.NET postback flicker).
    if (isFlagChangeNotUsed(sel) || qrPageFlag() === "2") {
      sessionStorage.setItem("qeManakImportNotUsedSelected", "1");
      return true;
    }
    // Navigate to Not Used page (Manak changeFlag).
    sessionStorage.setItem("qeManakImportNotUsedSelected", "1");
    sessionStorage.setItem("qeManakImportNotUsedPending", "1");
    navigateQrFlag("2");
    return true;
  }

  function pageHasNoUnusedQrRecords() {
    const t = normalize(document.body ? document.body.innerText.slice(0, 4000) : "");
    return /no records found/.test(t) && !scrapeQrCodesFromPage().length;
  }

  function startImportQrCodeWatch(wantedCount) {
    if (window.__qeManakImportWatch) return;
    window.__qeManakImportWatch = true;
    const max = Math.max(1, Math.min(50, Number(wantedCount) || 50));
    const tryPublish = () => {
      if (window.__qeManakImportPublished) return true;
      const codes = scrapeQrCodesFromPage();
      if (!codes.length) return false;
      window.__qeManakImportPublished = true;
      void publishImportedQrCodes(codes.slice(0, max));
      return true;
    };
    if (tryPublish()) return;
    const obs = new MutationObserver(() => {
      if (tryPublish()) obs.disconnect();
    });
    if (document.body) obs.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(() => {
      if (tryPublish()) {
        window.clearInterval(timer);
        obs.disconnect();
      }
    }, 1500);
    window.setTimeout(() => {
      window.clearInterval(timer);
      obs.disconnect();
    }, 10 * 60 * 1000);
  }

  function setQrCodeCount(count) {
    // Manak UI "Number of Copies" is #duplicateCount (max 5). #codeCount is often hidden.
    const n = Math.max(1, Math.min(5, Number(count) || 1));
    const inputs = [
      document.getElementById("duplicateCount"),
      document.querySelector("input#duplicateCount, input[name='duplicateCount']"),
      document.getElementById("codeCount"),
      document.querySelector(
        "input#codeCount, input[name='codeCount'], input[placeholder*='Count' i]",
      ),
    ].filter(Boolean);
    let ok = false;
    inputs.forEach((input) => {
      input.focus();
      input.value = String(n);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      ok = true;
    });
    const $ = window.jQuery || window.$;
    if ($ && ok) {
      try {
        $("#duplicateCount, #codeCount").val(String(n)).trigger("change");
      } catch {
        /* ignore */
      }
    }
    return ok;
  }

  /** Click the Generate button (transferChecked(1)), not Print (transferChecked(2)). */
  function clickGenerateNewQrButton() {
    const buttons = Array.from(
      document.querySelectorAll("button#generate, button[onclick*='transferChecked']"),
    );
    const generateBtn =
      buttons.find((b) => /transferChecked\s*\(\s*1\s*\)/.test(b.getAttribute("onclick") || "")) ||
      buttons.find((b) => /^generate$/i.test(text(b.textContent || b.value || ""))) ||
      null;
    if (generateBtn && typeof generateBtn.click === "function") {
      generateBtn.click();
      return true;
    }
    if (typeof window.transferChecked === "function") {
      try {
        window.transferChecked(1);
        return true;
      } catch {
        /* ignore */
      }
    }
    return clickByLabels(["generate"]) || false;
  }

  function clickGenerateQrButton() {
    // Prefer Generate (flag 1); fall back to legacy Print click only on Not Used print flow.
    if (isQrGenerateMode()) return clickGenerateNewQrButton();
    const byId = document.getElementById("generate");
    if (byId && typeof byId.click === "function") {
      byId.click();
      return true;
    }
    if (typeof window.transferChecked === "function") {
      try {
        window.transferChecked(2);
        return true;
      } catch {
        /* ignore */
      }
    }
    return (
      clickByLabels([
        "print",
        "generate",
        "generate qr code",
        "generate qr",
        "generate new code",
      ]) || false
    );
  }

  /**
   * On Generate New Code page (?flag=1): set Number of Copies and click Generate.
   * Manak allows max 5 copies per click.
   */
  async function submitGenerateNewQrCodes(wantedCount) {
    if (sessionStorage.getItem("qeManakImportGenerateClicked") === "1") {
      return false;
    }
    const copies = Math.max(1, Math.min(5, Number(wantedCount) || 1));
    sessionStorage.setItem("qeManakImportGenerateClicked", "1");
    showBanner(`Generating ${copies} new QR code(s)…`, true);
    setQrCodeCount(copies);
    await sleep(500);
    const clicked = clickGenerateNewQrButton();
    if (!clicked) {
      sessionStorage.removeItem("qeManakImportGenerateClicked");
      showBanner(
        "Could not click Generate — enter Number of Copies and click Generate on Manak.",
        false,
      );
      return false;
    }
    startImportQrCodeWatch(copies);
    // After generate, Manak often lands codes under Not Used — follow up once.
    window.setTimeout(() => {
      if (window.__qeManakImportPublished) return;
      sessionStorage.setItem("qeManakImportAfterGenerate", "1");
      navigateQrFlag("2");
    }, 5000);
    return true;
  }

  /**
   * When Not Used list is empty — navigate to Generate New Code (?flag=1).
   * Do NOT try to click Generate on the Not Used page (page navigates away first).
   */
  function openGenerateNewCodePage(wantedCount) {
    if (sessionStorage.getItem("qeManakImportGenerateTried") === "1") {
      return false;
    }
    sessionStorage.setItem("qeManakImportGenerateTried", "1");
    sessionStorage.setItem("qeManakImportNeedGenerate", "1");
    sessionStorage.setItem(
      "qeManakImportWantedCount",
      String(Math.max(1, Math.min(5, Number(wantedCount) || 1))),
    );
    sessionStorage.removeItem("qeManakImportGenerateClicked");
    sessionStorage.removeItem("qeManakImportNotUsedSelected");
    sessionStorage.removeItem("qeManakImportNotUsedPending");
    showBanner("No unused QR codes — opening Generate New Code…", true);
    navigateQrFlag("1");
    return true;
  }

  async function publishImportedQrCodes(codes) {
    const qr_codes = Array.from(
      new Set((codes || []).map((c) => text(c).replace(/\s+/g, "")).filter(isLikelyQrCodeValue)),
    );
    if (!qr_codes.length) return false;
    const result = {
      kind: "QE_MANAK_QR_IMPORT_V1",
      qr_codes,
      filledAt: Date.now(),
      autoSave: true,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(result));
    } catch {
      /* ignore */
    }
    try {
      chrome.runtime.sendMessage({
        type: "QE_MANAK_QR_IMPORT",
        result,
        closeTab: true,
        finishImport: true,
      });
    } catch {
      /* ignore */
    }
    showBanner(`Imported ${qr_codes.length} QR code(s). Closing tab…`, true);
    return true;
  }

  async function runImportQrWorkflow() {
    // Import QR is independent of Manak Test Request Auto-flow power.
    if (window.__qeManakImportPublished) {
      return { ok: true, message: "Import QR already published." };
    }
    const state = await new Promise((resolve) => {
      chrome.storage.local.get(
        [
          "qeManakImportQr",
          "qeManakImportQrEnabled",
          "qeManakQrCount",
          "qeManakPortal",
          "qeManakArmed",
        ],
        (data) => resolve(data || {}),
      );
    });
    if (state.qeManakImportQr !== true) {
      return { ok: false, message: "Import QR is not armed." };
    }
    // Never start a Test Request during Import QR.
    chrome.storage.local.set({ pendingFill: null, qeManakEnabled: false });
    // Do not reset an already-running Import QR captcha watch (causes blink / lost typing).
    const captchaAlreadyImport =
      window.__qeManakCaptchaWatch && window.__qeManakCaptchaMode === "import-qr";
    if (!captchaAlreadyImport) {
      window.__qeManakCaptchaWatch = false;
      window.__qeManakSubmitted = false;
      window.__qeManakCaptchaMode = "";
      if (window.__qeManakCaptchaTimer) {
        window.clearInterval(window.__qeManakCaptchaTimer);
        window.__qeManakCaptchaTimer = 0;
      }
    }
    const wantedCount = Math.max(1, Math.min(50, Number(state.qeManakQrCount) || 1));
    const portal = state.qeManakPortal || {};
    const qrUrl = generateQrPageUrl();
    const sectionOn = state.qeManakImportQrEnabled === true;
    const onQrPath = /employeeQrCodeGeneration|generateqr|qrcodegeneration/i.test(
      location.pathname || "",
    );

    // If we landed on /MANAK/login by mistake, bounce to real eBIS login.
    if (/\/manak\/login\/?$/i.test(location.pathname) && !isLoggedInSession()) {
      const ebis =
        (map && map.loginUrl) || "https://www.manakonline.in/MANAK/eBISLogin";
      const u = new URL(ebis);
      if (portal.userId) u.searchParams.set("userId", portal.userId);
      location.href = u.toString();
      return { ok: true, message: "Redirecting to eBIS login…" };
    }

    if (isLoginPage()) {
      if (isLoggedInSession()) {
        // Enable Import, but do not mark Landed until Generate QR page —
        // background still needs one redirect chance if content nav fails.
        chrome.storage.local.set({
          qeManakHomeReady: true,
          qeManakImportQrEnabled: true,
          pendingFill: null,
          qeManakEnabled: false,
        });
        if (!onQrPath && sessionStorage.getItem("qeManakOpenedQr") !== "1") {
          sessionStorage.setItem("qeManakOpenedQr", "1");
          location.href = qrUrl;
        }
        return { ok: true, message: "Logged in. Import QR enabled — opening Generate QR." };
      }
      fillLoginFields(portal.userId, "");
      [400, 1200, 2500].forEach((ms) => {
        window.setTimeout(() => fillLoginFields(portal.userId, ""), ms);
      });
      if (!captchaAlreadyImport) {
        startCaptchaContinue({}, "import-qr");
      }
      showBanner(
        "Import QR: eBIS login — User ID & password filled. Type captcha — then Generate QR Codes.",
        true,
        true,
      );
      return { ok: true, message: "Waiting for eBIS login captcha." };
    }

    if (isGenerateQrPage() || onQrPath) {
      if (!sectionOn) {
        chrome.storage.local.set({
          qeManakImportQrEnabled: true,
          qeManakImportQrLanded: true,
          pendingFill: null,
        });
      } else {
        chrome.storage.local.set({ qeManakImportQrLanded: true });
      }

      const copies = Math.max(
        1,
        Math.min(
          5,
          Number(sessionStorage.getItem("qeManakImportWantedCount")) || wantedCount || 1,
        ),
      );

      // ── Generate New Code page (?flag=1) ────────────────────────────────
      // Live Manak: dropdown → Generate New Code, Number of Copies → Generate.
      if (isQrGenerateMode() || sessionStorage.getItem("qeManakImportNeedGenerate") === "1") {
        sessionStorage.removeItem("qeManakImportNeedGenerate");
        showBanner("Generate New Code — setting count and clicking Generate…", true);
        const started = await submitGenerateNewQrCodes(copies);
        if (started) {
          return { ok: true, message: "Generating new QR codes…" };
        }
        // Already clicked once this session — wait / scrape.
        const genCodes = scrapeQrCodesFromPage();
        if (genCodes.length > 0) {
          window.__qeManakImportPublished = true;
          await publishImportedQrCodes(genCodes.slice(0, copies));
          return { ok: true, message: "QR codes imported after generate." };
        }
        startImportQrCodeWatch(copies);
        return { ok: true, message: "Waiting for generated QR codes…" };
      }

      // ── Not Used Codes page (?flag=2) ───────────────────────────────────
      if (sessionStorage.getItem("qeManakImportNotUsedPending") === "1") {
        sessionStorage.removeItem("qeManakImportNotUsedPending");
      }

      // After a successful Generate, we navigate back here to copy codes.
      if (sessionStorage.getItem("qeManakImportAfterGenerate") === "1") {
        sessionStorage.removeItem("qeManakImportAfterGenerate");
        await sleep(800);
        const afterCodes = scrapeQrCodesFromPage();
        if (afterCodes.length > 0) {
          window.__qeManakImportPublished = true;
          await publishImportedQrCodes(afterCodes.slice(0, copies));
          return { ok: true, message: "QR codes imported after generate." };
        }
        showBanner("Waiting for newly generated codes on Not Used list…", true);
        startImportQrCodeWatch(copies);
        return { ok: true, message: "Watching Not Used list after generate." };
      }

      showBanner("Collecting Available / Not Used 12-digit QR Codes…", true);
      // Stay on Not Used if already there — do NOT navigate away before scrape.
      if (qrPageFlag() !== "2") {
        const switched = selectNotUsedCodes();
        if (switched && sessionStorage.getItem("qeManakImportNotUsedPending") === "1") {
          showBanner("Opening Not Used Codes list…", true);
          return { ok: true, message: "Selecting Not Used Codes…" };
        }
      }

      await sleep(1000);
      const codes = scrapeQrCodesFromPage();
      if (codes.length > 0) {
        window.__qeManakImportPublished = true;
        await publishImportedQrCodes(
          codes.slice(0, Math.max(copies, Math.min(50, codes.length))),
        );
        return { ok: true, message: "QR codes imported." };
      }

      // Empty / all used → open Generate New Code page (flag=1), then Generate.
      if (pageHasNoUnusedQrRecords() || codes.length === 0) {
        const opened = openGenerateNewCodePage(copies);
        if (opened) {
          return {
            ok: true,
            message: "No unused codes — opening Generate New Code…",
          };
        }
      }

      showBanner(
        "Waiting for 12-digit QR codes (Not Used or newly generated)…",
        true,
      );
      startImportQrCodeWatch(Math.max(copies, 50));
      return { ok: true, message: "Watching Generate QR page." };
    }

    // After successful login (Home / session) — enable once, open QR page once.
    if (isHomePage() || isLoggedInSession()) {
      chrome.storage.local.set({
        qeManakImportQrEnabled: true,
        pendingFill: null,
      });
      if (sessionStorage.getItem("qeManakOpenedQr") === "1" || onQrPath) {
        showBanner("Import QR enabled. Collecting codes…", true);
        return { ok: true, message: "Import QR enabled — already opening QR page." };
      }
      sessionStorage.setItem("qeManakOpenedQr", "1");
      showBanner("Import QR enabled. Opening Not Used QR Codes…", true);
      location.href = qrUrl;
      return { ok: true, message: "Navigating to Generate QR…" };
    }

    return { ok: true, message: "Import QR armed — complete login first." };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "QE_MANAK_IDLE") {
      setTrCaptureFlag(false);
      window.__qeManakImportPublished = true;
      window.__qeManakImportWatch = false;
      try {
        document.documentElement.removeAttribute("data-qe-silence-alert");
      } catch {
        /* ignore */
      }
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === "QE_MANAK_FILL_LOGIN") {
      fillLoginFields(msg.userId, msg.password);
      [300, 900, 1800, 3200].forEach((ms) => {
        window.setTimeout(() => fillLoginFields(msg.userId, msg.password), ms);
      });
      // Ensure captcha 10s-wait starts once. Never restart (blink) if already watching.
      // Import QR must use import-qr mode — "login" mode navigates to Test Request after captcha.
      if (isLoginPage()) {
        chrome.storage.local.get(["pendingFill", "qeManakImportQr"], (store) => {
          const importArmed = store && store.qeManakImportQr === true;
          const mode = importArmed ? "import-qr" : "login";
          if (
            window.__qeManakCaptchaWatch &&
            window.__qeManakCaptchaMode === mode
          ) {
            return;
          }
          startCaptchaContinue((store && store.pendingFill) || {}, mode);
        });
      }
      sendResponse({ ok: true, message: "Login fields filled." });
      return true;
    }

    if (msg.type === "QE_MANAK_FILL") {
      const payload = msg.payload || parsePayload(msg.raw);
      void runWorkflow(payload, { force: true }).then((result) => {
        sendResponse(result || { ok: false, message: "Fill failed." });
      });
      return true;
    }

    if (msg.type === "QE_MANAK_FETCH_PDF") {
      const pending = msg.payload;
      void (async () => {
        const store = await new Promise((resolve) => {
          chrome.storage.local.get(["pendingFill"], (data) => resolve(data || {}));
        });
        const payload = pending || store.pendingFill || {};
        const url = msg.url || document.documentElement.getAttribute("data-qe-pdf-url") || findPdfUrlOnPage();
        if (url) await capturePdfFromUrl(payload, url);
        else startPdfWatch(payload);
        sendResponse({ ok: true });
      })();
      return true;
    }

    if (msg.type === "QE_MANAK_SESSION") {
      sendResponse({
        loggedIn: isLoggedInSession() && !isLoginPage(),
        userId: loggedInPortalUser(),
        onLogin: isLoginPage(),
        onHome: isHomePage(),
        onTr: isTrPage(),
      });
      return true;
    }

    if (msg.type === "QE_MANAK_NAV") {
      const result = navigate(msg.kind);
      showBanner(result.message, result.ok);
      sendResponse(result);
      return true;
    }
  });

  document.addEventListener(
    "click",
    (event) => {
      const link = event.target && event.target.closest ? event.target.closest("a[href]") : null;
      if (link && isBlockedUrl(link.href)) {
        event.preventDefault();
        event.stopPropagation();
        showBanner("Blocked BIS Play Store / app link.", false);
      }
    },
    true,
  );

  function applyStoredPortal(portal) {
    if (!isLoginPage()) return;
    const next = portal || {};
    fillLoginFields(next.userId, next.password);
  }

  chrome.storage.local.get(
    [
      "pendingFill",
      "qeManakEnabled",
      "qeManakArmed",
      "qeManakPortal",
      "qeManakImportQr",
      "qeManakImportQrEnabled",
      "qeManakQrCount",
    ],
    (data) => {
      if (isKnowFeesPage()) return;
      syncTrCaptureFlagFromStorage(data || {});
      const importArmed = data?.qeManakImportQr === true;
      const trActive =
        data?.qeManakEnabled === true &&
        data?.qeManakArmed === true &&
        Boolean(data?.pendingFill);
      // Only auto-fill login when a flow is actively armed — never when both are OFF.
      if (isLoginPage() && (importArmed || trActive)) {
        const portal = data.qeManakPortal || {};
        applyStoredPortal(portal);
        [400, 1200, 2500, 4500].forEach((ms) => {
          window.setTimeout(() => applyStoredPortal(portal), ms);
        });
      }
      if (importArmed) {
        // Import QR armed — never run Test Request fill on this session.
        setTrCaptureFlag(false);
        void runImportQrWorkflow();
        return;
      }
      if (!trActive) {
        setTrCaptureFlag(false);
        return;
      }
      void runWorkflow(data.pendingFill);
    },
  );

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (
        changes.qeManakEnabled?.newValue === false ||
        changes.qeManakImportQr?.newValue === false ||
        changes.qeManakImportQrEnabled?.newValue === false
      ) {
        setTrCaptureFlag(false);
        window.__qeManakImportPublished = true;
        window.__qeManakImportWatch = false;
      }
      if (changes.qeManakPortal && changes.qeManakPortal.newValue) {
        applyStoredPortal(changes.qeManakPortal.newValue || {});
      }
      if (
        changes.pendingFill ||
        changes.qeManakEnabled ||
        changes.qeManakArmed ||
        changes.qeManakImportQr
      ) {
        void refreshTrCaptureFlag();
      }
      // App armed a new Test Request after this tab already loaded — re-run workflow
      // (login fill + captcha wait) instead of only flipping the capture flag.
      // Never steal the session while Import QR is armed.
      if (changes.pendingFill && changes.pendingFill.newValue) {
        chrome.storage.local.get(["qeManakImportQr"], (store) => {
          if (store && store.qeManakImportQr === true) return;
          window.__qeManakCaptchaWatch = false;
          window.__qeManakSubmitted = false;
          void runWorkflow(changes.pendingFill.newValue, { force: true });
        });
      }
      // App re-armed Import QR, or Import section turned ON after login.
      if (changes.qeManakImportQr?.newValue === true) {
        try {
          sessionStorage.removeItem("qeManakOpenedQr");
          sessionStorage.removeItem("qeManakImportNotUsedSelected");
          sessionStorage.removeItem("qeManakImportNotUsedPending");
        } catch {
          /* ignore */
        }
        window.__qeManakImportPublished = false;
        window.__qeManakImportWatch = false;
        void runImportQrWorkflow();
      } else if (changes.qeManakImportQrEnabled?.newValue === true) {
        window.__qeManakImportPublished = false;
        void runImportQrWorkflow();
      }
    });
  } catch {
    /* ignore */
  }

})();
