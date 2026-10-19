/**
 * QE Consultancy — Manak "Application for Renewal of Licence" fill (Renewal section).
 *
 * Armed by Manak Assist on BIS License Renewals in Consultancy Pro (background: qeManakRenewal → once a
 * signed-in Manak page is seen, qeManakRenewalEnabled). Payload: chrome.storage.local.renewalFill
 * (kind QE_MANAK_RENEWAL_V1, built by frontend/web/src/features/bis/renewals/renewalPayload.ts).
 *
 * Flow: Licences → View (Granted Licenses) → this CM/L's "Apply for Renewal" → the renewal letter → Next →
 * Production Return Details: each month of the saved renewal sheet through "Add Return" (one month per page
 * load; months already on Manak are skipped). It never clicks Next on the Production Return page, the
 * Report of Performance or the payment — it turns OFF and leaves the application for review.
 */
(function () {
  if (window.__qeRenewalLoaded) return;
  window.__qeRenewalLoaded = true;

  const norm = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  const low = (v) => norm(v).toLowerCase();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $id = (id) => document.getElementById(id);
  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

  function visible(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  }

  function signedIn() {
    if (/ebislogin/i.test(location.pathname)) return false;
    const pass = document.querySelector("input[type='password']");
    const passVisible = pass && pass.getBoundingClientRect().width > 0;
    return Boolean(document.querySelector("a[href*='logout' i]")) && !passVisible;
  }

  /** "21-Jul-2025", "21-07-2025", "2025-07-21" or "21/07/2025" → "2025-07-21" ("" if not a date). */
  function isoDate(text) {
    const t = norm(text);
    let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    m = t.match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[A-Za-z]*[-/ ](\d{4})$/);
    if (m) {
      const month = MONTHS.indexOf(m[2].toLowerCase());
      return month < 0 ? "" : `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
    m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return "";
  }

  const periodLabel = (r) => `${r.from} to ${r.to}`;

  /* ───────── values ───────── */

  function setText(el, value) {
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("keyup", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setSelect(el, value) {
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.setAttribute("data-qe-newapp-changed", "1");
    document.dispatchEvent(new CustomEvent("qe-newapp-jq-change"));
  }

  /** Manak's alert() calls are recorded by page-hook.js while capture is on (they would block the page). */
  function alertCapture(on) {
    const root = document.documentElement;
    if (on) {
      root.removeAttribute("data-qe-newapp-alert-log");
      root.setAttribute("data-qe-newapp-alerts", "1");
    } else {
      root.removeAttribute("data-qe-newapp-alerts");
    }
    document.dispatchEvent(new CustomEvent("qe-newapp-alerts"));
  }
  const alertLog = () => (document.documentElement.getAttribute("data-qe-newapp-alert-log") || "").split("\n").filter(Boolean);

  function openSwal() {
    const box = Array.from(document.querySelectorAll(".sweet-alert, .swal-modal, .swal2-popup")).find(visible);
    if (!box) return null;
    const title = norm((box.querySelector("h2, .swal-title, .swal2-title") || {}).innerText);
    const text = norm((box.querySelector("p, .swal-text, .swal2-html-container") || {}).innerText);
    return { box, title, text };
  }

  async function waitSwal(ms) {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      const s = openSwal();
      if (s && (s.title || s.text)) return s;
      await sleep(250);
    }
    return null;
  }

  function closeSwal(s) {
    const ok = s.box.querySelector("button.confirm, .swal-button--confirm, .swal2-confirm, button");
    if (ok) ok.click();
  }

  /* ───────── panel ───────── */

  let panelHost = null;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }

  function panel() {
    if (panelHost && panelHost.isConnected) return panelHost.shadowRoot;
    panelHost = document.createElement("div");
    panelHost.id = "qe-renewal-panel";
    panelHost.style.cssText = "position:fixed;right:14px;bottom:14px;z-index:2147483646;";
    const root = panelHost.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        .box{width:340px;max-height:60vh;overflow:auto;background:#fffaf0;border:2px solid #b45309;
          font:12px/1.4 system-ui,sans-serif;color:#1c1917;box-shadow:0 6px 24px rgba(0,0,0,.25)}
        .hd{background:#292524;color:#fcd34d;padding:6px 10px;font-weight:700;display:flex;justify-content:space-between;align-items:center}
        .bd{padding:8px 10px}
        .row{display:flex;gap:6px;margin-top:8px}
        button{font:600 12px system-ui;border:1px solid #92400e;background:#fff;color:#92400e;padding:4px 8px;cursor:pointer}
        button.pri{background:#b45309;color:#fff}
        ul{margin:4px 0 6px 16px;padding:0}
        .ok{color:#166534}.miss{color:#b91c1c}.mut{color:#57534e}
        .x{background:none;border:0;color:#fcd34d;font-size:16px;padding:0 4px}
      </style>
      <div class="box">
        <div class="hd"><span id="t">QE · Renewal</span><button class="x" id="min" title="Hide">–</button></div>
        <div class="bd" id="b"></div>
      </div>`;
    root.getElementById("min").addEventListener("click", () => {
      const b = root.getElementById("b");
      b.style.display = b.style.display === "none" ? "" : "none";
    });
    (document.body || document.documentElement).appendChild(panelHost);
    return root;
  }

  function renderPanel(data, note, report, done) {
    const root = panel();
    root.getElementById("t").textContent = `QE · Renewal${data.firmName ? ` · ${data.firmName}` : ""}`;
    const list = (items, cls) => (items && items.length ? `<ul class="${cls}">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "");
    const months = Array.isArray(data.returns) ? data.returns.length : 0;
    let html = `<div class="mut">CM/L ${esc(data.cmlNo || "—")} · valid till ${esc(data.validityDate || "—")} · ${months} month${months === 1 ? "" : "s"} in the renewal sheet</div>`;
    if (note) html += `<p>${esc(note)}</p>`;
    if (report) {
      html += list(report.filled, "ok");
      if (report.portal.length) html += `<div class="miss">Manak said:</div>${list(report.portal, "miss")}`;
      if (report.missing.length) html += `<div class="miss">Needs you:</div>${list(report.missing, "miss")}`;
      if (report.skipped.length) html += `<div class="mut">Already on Manak:</div>${list(report.skipped, "mut")}`;
    }
    if (done) {
      html += `<p><b>Renewal is now OFF.</b> Check the returns in the table, add the Consignee details, then click <b>Next</b> for the Report of Performance and the payment yourself. The extension never submits or pays.</p>`;
    }
    html += `<div class="row">${done ? "" : '<button class="pri" id="again">Fill again</button>'}<button id="off">Turn OFF</button></div>`;
    root.getElementById("b").innerHTML = html;
    const again = root.getElementById("again");
    if (again) again.addEventListener("click", () => safeRun(true));
    root.getElementById("off").addEventListener("click", () => {
      void turnOff(null);
      if (panelHost) panelHost.remove();
    });
  }

  function turnOff(log) {
    return chrome.storage.local.set({
      qeManakRenewal: false,
      qeManakRenewalEnabled: false,
      renewalFill: null,
      renewalLog: log,
    });
  }

  /* ───────── navigation ───────── */

  const NAV_KEY = "qeRenewalNavCount";

  function navBudget() {
    const n = Number(sessionStorage.getItem(NAV_KEY) || "0");
    if (n >= 8) return false;
    sessionStorage.setItem(NAV_KEY, String(n + 1));
    return true;
  }

  const digitsOnPage = () => norm(document.body.innerText).replace(/\D+/g, " ").split(" ");
  const onReturns = () => Boolean($id("todate") && $id("save") && $id("quantity10"));

  async function licenceRow(cml) {
    const find = () => Array.from(document.querySelectorAll("table tbody tr")).find((tr) => norm(tr.innerText).replace(/\D+/g, " ").split(" ").includes(cml));
    let row = find();
    if (row) return row;
    const search = Array.from(document.querySelectorAll("input[type=search], .dataTables_filter input")).find(visible);
    if (search) {
      setText(search, cml);
      await sleep(900);
      row = find();
    }
    return row || null;
  }

  /** Licences → View link on the Product Certification home (its href is encoded, so match the block text). */
  function licencesViewLink() {
    const byHref = Array.from(document.querySelectorAll("a")).find((a) => /applicantGrantedLicense/i.test(a.getAttribute("href") || ""));
    if (byHref) return byHref;
    return Array.from(document.querySelectorAll("a")).find((a) => {
      if (low(a.innerText) !== "view") return false;
      const block = a.closest("div, tr, li");
      return block && /\blicences?\b/i.test(block.innerText || "") && !/applications|draft|qr|receipt|refund/i.test(block.innerText || "");
    });
  }

  async function autoNavigate(data) {
    const path = location.pathname;
    if (/applicantGrantedLicense/i.test(path)) {
      const row = await licenceRow(data.cmlNo);
      if (!row) return `CM/L ${data.cmlNo} is not in Granted Licenses for this login.`;
      const link = Array.from(row.querySelectorAll("a")).find((a) => /apply\s*for\s*renewal/i.test(a.innerText || "") || /ProceedForRenewal/i.test(a.getAttribute("onclick") || ""));
      if (!link) return `"Apply for Renewal" is not shown for CM/L ${data.cmlNo} — Manak shows it only in the last 3 months before validity (and not for expired licences).`;
      if (!navBudget()) return 'Stopped automatic navigation — click "Apply for Renewal" yourself.';
      link.click();
      return "Opening Apply for Renewal…";
    }
    if (/lr_application/i.test(path)) {
      if (!digitsOnPage().includes(data.cmlNo)) return `This renewal letter is not for CM/L ${data.cmlNo} — nothing done.`;
      const next = Array.from(document.querySelectorAll("#application_frm a, #application_frm button, a, button")).find((b) => low(b.innerText) === "next" && visible(b));
      if (!next) return 'Click "Next" on the renewal letter.';
      if (!navBudget()) return 'Stopped automatic navigation — click "Next" yourself.';
      next.click();
      return "Opening Production Return Details…";
    }
    if (/testRequest|QrCode|TestSample|knowfees|XLIUpload|varietyInclusion/i.test(path)) return "";
    const view = licencesViewLink();
    if (view) {
      if (!navBudget()) return "Stopped automatic navigation — open Licences → View yourself.";
      view.removeAttribute("target");
      view.click();
      return "Opening Granted Licenses…";
    }
    if (!/ApplicantPC$/i.test(path)) {
      if (!navBudget()) return "Stopped automatic navigation — open Product Certification yourself.";
      location.href = "/MANAK/ApplicantPC";
      return "Opening Product Certification…";
    }
    return 'Open Licences → View, then this licence\'s "Apply for Renewal".';
  }

  /* ───────── Production Return Details ───────── */

  const ALREADY_FILED = /not allowed to file return for same month/i;

  /** Show every row of the returns DataTables ("Show N entries" → All), so filed months past page 1 count too. */
  async function showAllEntries() {
    let changed = false;
    for (const select of document.querySelectorAll(".dataTables_length select, select[name$='_length']")) {
      const all = Array.from(select.options).find((o) => o.value === "-1" || /^all$/i.test(norm(o.text)));
      if (all && select.value !== all.value) {
        select.value = all.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        changed = true;
      }
    }
    if (changed) await sleep(600);
  }

  /**
   * Periods already filed, from every returns table on the page — the Advance Marking Fee table and
   * "Previous Years Production Return". DataTables may draw the header in a separate table from the rows
   * (scrolling layout), so headers are read from the table or its .dataTables_wrapper.
   */
  function filedPeriods() {
    const out = new Set();
    for (const table of document.querySelectorAll("table")) {
      const rows = Array.from(table.querySelectorAll("tbody tr")).filter((tr) => tr.cells.length > 2);
      if (!rows.length) continue;
      const wrapper = table.closest(".dataTables_wrapper") || table;
      const head = Array.from(wrapper.querySelectorAll("thead tr:last-child th, thead tr:last-child td"))
        .slice(0, rows[0].cells.length)
        .map((th) => low(th.innerText).replace(/[^a-z ]/g, "").trim());
      let fromIdx = head.findIndex((h) => h === "from date" || h === "from");
      let toIdx = head.findIndex((h) => h === "to date" || h === "to");
      for (const tr of rows) {
        const cells = Array.from(tr.cells).map((c) => norm(c.innerText));
        if (fromIdx < 0 || toIdx < 0) {
          // No usable header: take the first two date cells of the row.
          const dates = cells.map(isoDate).filter(Boolean);
          if (dates.length >= 2 && dates[0] <= dates[1]) out.add(`${dates[0]}|${dates[1]}`);
          continue;
        }
        const from = isoDate(cells[fromIdx]);
        const to = isoDate(cells[toIdx]);
        if (from && to) out.add(`${from}|${to}`);
      }
    }
    return out;
  }

  /**
   * Manak's own list of months still to file ("Please fill the production return for the period: 01-Jul-2026
   * To 20-Jul-2026, …"), when the page carries it. Null when there is no such message.
   */
  function pendingFromManak() {
    const text = norm(document.body.innerText + " " + Array.from(document.querySelectorAll(".sweet-alert p, .swal-text, .swal2-html-container, .lead")).map((e) => e.textContent).join(" "));
    const at = text.search(/please fill the production return for the period\s*:/i);
    if (at < 0) return null;
    const list = text.slice(at).replace(/^[^:]*:/, "").split(/if you have nil production/i)[0];
    const out = new Set();
    for (const m of list.matchAll(/(\d{1,2}-[A-Za-z]{3}-\d{4})\s+to\s+(\d{1,2}-[A-Za-z]{3}-\d{4})/gi)) {
      const from = isoDate(m[1]);
      const to = isoDate(m[2]);
      if (from && to) out.add(`${from}|${to}`);
    }
    return out.size ? out : null;
  }

  /** The #todate option for a period ("21-Jul-2025  To  31-Jul-2025"). */
  function periodOption(select, r) {
    return Array.from(select.options).find((o) => {
      const parts = norm(o.text).split(/\s+to\s+/i);
      return parts.length === 2 && isoDate(parts[0]) === r.from && isoDate(parts[1]) === r.to;
    });
  }

  const num = (v) => {
    const n = Number(String(v == null ? "" : v).replace(/[₹,\s]/g, ""));
    return Number.isFinite(n) ? n : NaN;
  };
  const fmt = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

  /** One month through "Add Return". "added" reloads the page (Manak re-renders the table). */
  async function addReturn(data, r, report) {
    const select = $id("todate");
    const option = periodOption(select, r);
    if (!option) {
      report.missing.push(`${periodLabel(r)}: this period is not in Manak's list — check the renewal sheet period.`);
      return "skip";
    }
    const brand = $id("brandPR01");
    if (brand) {
      const wanted = low(data.brand || "");
      const options = Array.from(brand.options).filter((o) => o.value && !/^select/i.test(o.text));
      const pick = (wanted && options.find((o) => low(o.text) === wanted)) || options.find((o) => low(o.text) !== "other");
      if (!pick) {
        report.missing.push('Brand: only "Other" is listed — choose it and enter the brand, then Fill again.');
        return "stop";
      }
      if (brand.value !== pick.value) setSelect(brand, pick.value);
    }
    setSelect(select, option.value);
    await sleep(300);
    const qty = num(r.productionQty);
    const covered = num(r.coveredQty);
    if (!Number.isFinite(qty) || !Number.isFinite(covered)) {
      report.missing.push(`${periodLabel(r)}: production or covered quantity missing in the renewal sheet.`);
      return "stop";
    }
    alertCapture(true);
    try {
      setText($id("quantity10"), fmt(qty));
      setText($id("valueP1"), fmt(num(r.productionValue) || 0));
      await sleep(200);
      setText($id("prodMarked10"), fmt(covered));
      setText($id("valueCA1"), fmt(num(r.coveredValue) || 0));
      await sleep(400);
      const before = alertLog();
      if (before.length) {
        report.portal.push(`${periodLabel(r)}: ${before.join(" / ")}`);
        return "stop";
      }
      $id("save").click();
      const s = await waitSwal(6000);
      const after = alertLog();
      if (after.some((a) => ALREADY_FILED.test(a))) return "filed";
      if (after.length) {
        report.portal.push(`${periodLabel(r)}: ${after.join(" / ")}`);
        return "stop";
      }
      if (s) {
        const message = `${s.title} ${s.text}`.trim();
        if (ALREADY_FILED.test(message)) {
          closeSwal(s);
          return "filed";
        }
        if (/error|not allowed|invalid|kindly|cancel/i.test(message)) {
          report.portal.push(`${periodLabel(r)}: ${message}`);
          closeSwal(s);
          return "stop";
        }
        closeSwal(s);
      }
      return "added";
    } finally {
      alertCapture(false);
    }
  }

  // Months added on this page load (in case Manak updates the table without reloading).
  const addedHere = new Set();

  async function fillReturns(data, report) {
    const rows = (Array.isArray(data.returns) ? data.returns : []).filter((r) => r && r.from && r.to);
    if (!rows.length) {
      report.missing.push("No production rows in the renewal sheet — fill the Renewal Sheet in Consultancy Pro first.");
      return "done";
    }
    await showAllEntries();
    const filed = filedPeriods();
    const pending = pendingFromManak();
    for (const r of rows) {
      const key = `${r.from}|${r.to}`;
      // Manak's "still to file" list wins when present; otherwise the filed-returns tables decide.
      const onManak = pending ? !pending.has(key) : filed.has(key);
      if (onManak || addedHere.has(key)) {
        report.skipped.push(periodLabel(r));
        continue;
      }
      const result = await addReturn(data, r, report);
      if (result === "filed") {
        // Manak already has this month (not in the tables we could read): count it as filed and go on.
        addedHere.add(key);
        report.skipped.push(`${periodLabel(r)} (Manak: already filed)`);
        await sleep(400);
        continue;
      }
      if (result === "added") {
        addedHere.add(`${r.from}|${r.to}`);
        report.filled.push(`${periodLabel(r)} — added`);
        await chrome.storage.local.set({ renewalLog: { message: `Added return ${periodLabel(r)}`, at: Date.now() } });
        return "reload";
      }
      if (result === "stop") return "stop";
    }
    return "done";
  }

  /* ───────── run ───────── */

  let running = false;
  let finished = false;

  const alive = () => {
    try {
      return Boolean(chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  };

  function safeRun(force) {
    if (!alive()) return;
    run(force).catch((error) => {
      if (!/context invalidated/i.test(String(error && error.message))) console.warn("QE:", error);
    });
  }

  async function run() {
    if (running || finished) return;
    if (/ebislogin/i.test(location.pathname)) return;
    const store = await chrome.storage.local.get(["qeManakRenewal", "qeManakRenewalEnabled", "renewalFill"]);
    if (store.qeManakRenewal === true && store.qeManakRenewalEnabled !== true && store.renewalFill && signedIn()) {
      await chrome.storage.local.set({ qeManakRenewalEnabled: true });
      store.qeManakRenewalEnabled = true;
    }
    if (store.qeManakRenewalEnabled !== true || !store.renewalFill) {
      if (panelHost) panelHost.remove();
      return;
    }
    const data = store.renewalFill;
    if (!onReturns()) {
      const note = signedIn() ? await autoNavigate(data) : "";
      if (note) renderPanel(data, note, null, false);
      return;
    }
    sessionStorage.removeItem(NAV_KEY);
    if (!digitsOnPage().includes(data.cmlNo)) {
      renderPanel(data, `This Production Return is not for CM/L ${data.cmlNo} — nothing filled.`, null, false);
      return;
    }
    running = true;
    const report = { filled: [], missing: [], skipped: [], portal: [] };
    renderPanel(data, "Adding production returns…", null, false);
    try {
      const result = await fillReturns(data, report);
      if (result === "reload") {
        renderPanel(data, "Return added — Manak reloads the page; continuing with the next month…", report, false);
        // If Manak did not reload the page, carry on here.
        setTimeout(() => safeRun(false), 5000);
        return;
      }
      if (result === "stop") {
        renderPanel(data, "Stopped — see below. Fix it, then Fill again.", report, false);
        return;
      }
      finished = true;
      const added = (await chrome.storage.local.get("renewalLog")).renewalLog;
      await turnOff({ message: `Production returns done (${report.skipped.length} on Manak)`, missing: report.missing, at: Date.now(), last: added || null });
      renderPanel(data, report.missing.length ? "Returns done — some items need you." : "All months are on Manak.", report, true);
      chrome.runtime.sendMessage({ type: "QE_MANAK_IDLE" }, () => void chrome.runtime.lastError);
    } finally {
      running = false;
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "QE_RENEWAL_REFRESH") safeRun(false);
    if (msg.type === "QE_MANAK_IDLE" && panelHost && !finished) panelHost.remove();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.qeManakRenewalEnabled || changes.renewalFill) safeRun(false);
  });

  setTimeout(() => safeRun(false), 1500);
})();
