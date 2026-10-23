/**
 * QE Consultancy — Manak "Application For Change in Scope (Inclusion)" fill (Inclusion section).
 *
 * Armed by Manak Assist on BIS New Inclusion in Consultancy Pro (background: qeManakInclusion → once a
 * signed-in Manak page is seen, qeManakInclusionEnabled). Payload: chrome.storage.local.inclusionFill
 * (kind QE_MANAK_INCLUSION_V1, built by frontend/web/src/features/bis/projects/inclusionPayload.ts).
 *
 * Flow: Granted Licenses → this CM/L's "Apply for Change In Scope (Inclusion)" → "Apply for Change in
 * Scope (Inclusion)" → the form: each variety through "Add Variety" (Drafted Variety table), then the
 * Declaration by the Licensee answers and files. It never clicks "Submit and Process Payment" — it turns
 * OFF and leaves the form for review.
 */
(function () {
  if (window.__qeInclusionLoaded) return;
  window.__qeInclusionLoaded = true;

  const norm = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  const low = (v) => norm(v).toLowerCase();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $id = (id) => document.getElementById(id);

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

  /* ───────── values (page jQuery / select2 updated through page-hook.js) ───────── */

  function nudge(el) {
    el.setAttribute("data-qe-newapp-changed", "1");
    document.dispatchEvent(new CustomEvent("qe-newapp-jq-change"));
  }

  function setText(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("keyup", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setSelect(el, value) {
    if (el.value === value) return;
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    nudge(el);
  }

  /** Manak's own alert() calls (file checks) are recorded by page-hook.js while capture is on. */
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

  /* ───────── files ───────── */

  function fetchFile(file) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "QE_NEWAPP_FETCH_FILE", url: file.url }, (res) => {
          if (chrome.runtime.lastError || !res || !res.ok) {
            resolve({ error: (res && res.error) || "Download failed" });
            return;
          }
          const bin = atob(res.base64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
          resolve({ file: new File([bytes], file.fileName || "document", { type: file.mime || res.mime || "" }) });
        });
      } catch (error) {
        resolve({ error: String(error && error.message ? error.message : error) });
      }
    });
  }

  async function setFile(input, file) {
    if (input.files && input.files.length > 0) return "same";
    const got = await fetchFile(file);
    if (!got.file) return `error: ${got.error}`;
    const dt = new DataTransfer();
    dt.items.add(got.file);
    input.files = dt.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return "filled";
  }

  /* ───────── sweet alert (Add Variety replies) ───────── */

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

  function panel() {
    if (panelHost && panelHost.isConnected) return panelHost.shadowRoot;
    panelHost = document.createElement("div");
    panelHost.id = "qe-inclusion-panel";
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
        <div class="hd"><span id="t">QE · Inclusion</span><button class="x" id="min" title="Hide">–</button></div>
        <div class="bd" id="b"></div>
      </div>`;
    root.getElementById("min").addEventListener("click", () => {
      const b = root.getElementById("b");
      b.style.display = b.style.display === "none" ? "" : "none";
    });
    (document.body || document.documentElement).appendChild(panelHost);
    return root;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }

  function renderPanel(data, note, report, done) {
    const root = panel();
    root.getElementById("t").textContent = `QE · Inclusion${data.firmName ? ` · ${data.firmName}` : ""}`;
    const list = (items, cls) => (items && items.length ? `<ul class="${cls}">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "");
    let html = `<div class="mut">CM/L ${esc(data.cmlNo || "—")}${data.isNumber ? ` · ${esc(/^IS\b/i.test(data.isNumber) ? data.isNumber : `IS ${data.isNumber}`)}` : ""} · ${data.varieties.length} variet${data.varieties.length === 1 ? "y" : "ies"}</div>`;
    if (note) html += `<p>${esc(note)}</p>`;
    if (report) {
      html += list(report.filled, "ok");
      if (report.portal.length) html += `<div class="miss">Manak said:</div>${list(report.portal, "miss")}`;
      if (report.missing.length) html += `<div class="miss">Needs you:</div>${list(report.missing, "miss")}`;
      if (report.skipped.length) html += `<div class="mut">Already on Manak:</div>${list(report.skipped, "mut")}`;
    }
    if (done) {
      html += `<p><b>Inclusion is now OFF.</b> Check the Drafted Variety table, the Declaration answers and the files, then click <b>Submit and Process Payment</b> yourself. The extension never submits or pays.</p>`;
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
      qeManakInclusion: false,
      qeManakInclusionEnabled: false,
      inclusionFill: null,
      inclusionLog: log,
    });
  }

  /* ───────── navigation ───────── */

  const NAV_KEY = "qeInclusionNavCount";

  function navBudget() {
    const n = Number(sessionStorage.getItem(NAV_KEY) || "0");
    if (n >= 8) return false;
    sessionStorage.setItem(NAV_KEY, String(n + 1));
    return true;
  }

  const onForm = () => Boolean($id("varietyTextArea") && $id("addVarietyButton"));

  /** Granted Licenses row for this CM/L (the list is a searchable DataTable). */
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

  /** Signed in, not on the form: Granted Licenses → Inclusion history → Apply. Returns a panel note. */
  async function autoNavigate(data) {
    const path = location.pathname;
    if (/applicantGrantedLicense/i.test(path)) {
      const row = await licenceRow(data.cmlNo);
      if (!row) return `CM/L ${data.cmlNo} is not in Granted Licenses for this login — open its "Apply for Change In Scope (Inclusion)" yourself.`;
      const link = Array.from(row.querySelectorAll("a")).find((a) => /ListAllInclusion/i.test(a.getAttribute("href") || "") || /change\s*in\s*scope\s*\(\s*inclusion/i.test(a.innerText || ""));
      if (!link) return 'Click "Apply for Change In Scope (Inclusion)" in this licence row.';
      if (!navBudget()) return "Stopped automatic navigation — open the inclusion yourself.";
      link.removeAttribute("target");
      link.click();
      return "Opening Change in Scope (Inclusion) for this licence…";
    }
    if (/ListAllInclusion/i.test(path)) {
      if (!norm(document.body.innerText).replace(/\D+/g, " ").split(" ").includes(data.cmlNo)) {
        return `This page is not for CM/L ${data.cmlNo} — go back to Granted Licenses.`;
      }
      const apply = Array.from(document.querySelectorAll("a, button")).find((a) => /varietyInclusionForm/i.test(a.getAttribute("href") || "") || /^apply\s*for\s*change\s*in\s*scope/i.test(norm(a.innerText)));
      if (!apply) return 'Click "Apply for Change in Scope (Inclusion)".';
      if (!navBudget()) return "Stopped automatic navigation — click Apply for Change in Scope (Inclusion) yourself.";
      apply.removeAttribute("target");
      apply.click();
      return "Opening the inclusion form…";
    }
    if (/testRequest|QrCode|TestSample|knowfees|ApplicantPCSaveAsDraft/i.test(path)) return "";
    // Home / Product Certification → Granted Licenses (a plain GET to that page is refused; use its link).
    const granted = Array.from(document.querySelectorAll("a")).find((a) => /applicantGrantedLicense/i.test(a.getAttribute("href") || ""));
    if (granted) {
      if (!navBudget()) return "Stopped automatic navigation — open Licences → View yourself.";
      granted.removeAttribute("target");
      granted.click();
      return "Opening Granted Licenses…";
    }
    if (!/ApplicantPC$/i.test(path)) {
      if (!navBudget()) return "Stopped automatic navigation — open Product Certification yourself.";
      location.href = "/MANAK/ApplicantPC";
      return "Opening Product Certification…";
    }
    return 'Open Licences → View, then this licence\'s "Apply for Change In Scope (Inclusion)".';
  }

  /* ───────── the form ───────── */

  function draftedTexts() {
    const table = $id("draftedTable");
    if (!table) return [];
    return Array.from(table.querySelectorAll("tbody tr"))
      .map((tr) => low(tr.innerText))
      .filter((t) => t && !/no data available/.test(t));
  }

  const alnum = (v) => low(v).replace(/[^a-z0-9]+/g, "");

  /**
   * A drafted row matches when it has the variety text and every QR code of this row — the same variety can be
   * included several times on different QR codes, so the variety alone is not enough.
   */
  function isDrafted(rows, v) {
    const name = alnum(v.variety).slice(0, 60);
    return rows.some((row) => {
      const text = alnum(row);
      if (!text.includes(name)) return false;
      // Drafted Variety shows no inclusion type: a row without a test report is one with no QR code.
      return v.inclusionType === "0" ? !/\d{12}/.test(row) : v.qrCodes.every((code) => text.includes(code));
    });
  }

  async function addVarieties(data, report) {
    for (let i = 0; i < data.varieties.length; i += 1) {
      const label = `Variety ${i + 1}`;
      const qr = $id("qrCode");
      // Manak lists a sample's QR code only after its test report is on the portal. A code that is not listed yet
      // goes in as "Without Test Report" (said in the panel), so the inclusion can still be drafted.
      const listed = (code) => Boolean(qr) && Array.from(qr.options).some((o) => o.value === code || norm(o.text) === code);
      let v = data.varieties[i];
      let fallback = "";
      if (v.inclusionType !== "0") {
        const missing = v.qrCodes.filter((code) => !listed(code));
        if (!v.qrCodes.length || missing.length) {
          fallback = v.qrCodes.length
            ? `QR ${missing.join(", ")} not on Manak yet (report not uploaded) — added Without Test Report`
            : "no sample QR code in Consultancy Pro — added Without Test Report";
          v = { ...v, inclusionType: "0", qrCodes: [] };
        }
      }
      if (isDrafted(draftedTexts(), v)) {
        report.skipped.push(`${label} already drafted${v.qrCodes.length ? ` (QR ${v.qrCodes.join(", ")})` : " (Without Test Report)"}`);
        continue;
      }
      const type = $id("inclusionType");
      const remark = $id("inclusionRemark");
      const text = $id("varietyTextArea");
      if (!type || !text) {
        report.missing.push("Inclusion form fields");
        return false;
      }
      setSelect(type, v.inclusionType === "0" ? "0" : "1");
      await sleep(700);
      if (v.inclusionType !== "0") {
        for (let t = 0; t < 12 && qr.disabled; t += 1) await sleep(250);
        const picks = v.qrCodes.map((code) => Array.from(qr.options).find((o) => o.value === code || norm(o.text) === code)).filter(Boolean);
        Array.from(qr.options).forEach((o) => {
          o.selected = picks.includes(o);
        });
        qr.dispatchEvent(new Event("change", { bubbles: true }));
        nudge(qr);
        await sleep(300);
      }
      if (remark) setText(remark, v.delayReason || "");
      setText(text, v.variety);
      await sleep(200);
      const add = $id("addVarietyButton");
      if (!add || !/add\s*variety/i.test(add.value || add.innerText || "")) {
        report.missing.push("Add Variety button");
        return false;
      }
      add.click();
      const reply = await waitSwal(20000);
      if (!reply) {
        report.portal.push(`${label}: no reply from Manak after Add Variety`);
        return false;
      }
      closeSwal(reply);
      const said = norm(`${reply.title} ${reply.text}`);
      if (!/added\s*successfully|data\s*saved/i.test(said)) {
        report.portal.push(`${label}: ${said}`);
        return false;
      }
      report.filled.push(`${label} added (${fallback || (v.inclusionType === "0" ? "Without Test Report" : `QR ${v.qrCodes.join(", ")}`)})`);
      // The Drafted Variety table refreshes after the reply.
      await sleep(1800);
    }
    return true;
  }

  async function declaration(data, report) {
    const pairs = [
      { yes: "addFacRequired", no: "addFacNotRequired", required: data.machineryRequired, input: "manufacturingFacDoc", slot: "machinery", label: "Additional machinery" },
      { yes: "testFacRequired", no: "testFacNotRequired", required: data.equipmentRequired, input: "testingFacDoc", slot: "equipment", label: "Additional testing equipment" },
    ];
    alertCapture(true);
    try {
      for (const p of pairs) {
        const radio = $id(p.required ? p.yes : p.no);
        if (!radio) {
          report.missing.push(`${p.label}: Yes / No`);
          continue;
        }
        if (!radio.checked) radio.click();
        await sleep(400);
        report.filled.push(`${p.label}: ${p.required ? "Yes" : "No"}`);
        if (!p.required) continue;
        const file = (data.files || []).find((f) => f.slot === p.slot);
        const input = $id(p.input);
        if (!file) report.missing.push(`${p.label}: no list from Consultancy Pro — mark the added rows there`);
        else if (!input) report.missing.push(`${p.label}: upload field`);
        else {
          const r = await setFile(input, file);
          if (r === "filled") report.filled.push(`${file.label} uploaded`);
          else if (r !== "same") report.missing.push(`${file.label}: ${r}`);
        }
      }
      const other = (data.files || []).find((f) => f.slot === "other");
      const otherInput = $id("anyOtherDoc");
      if (other && otherInput) {
        const r = await setFile(otherInput, other);
        if (r === "filled") report.filled.push(`${other.label} uploaded (request letter + documents)`);
        else if (r !== "same") report.missing.push(`${other.label}: ${r}`);
      } else if (other) {
        report.missing.push("Any Other Document upload field");
      }
      await sleep(600);
    } finally {
      report.portal.push(...alertLog());
      alertCapture(false);
    }
  }

  /* ───────── main ───────── */

  let running = false;
  let finished = false;

  /**
   * After the extension is reloaded, scripts left in already-open tabs lose their connection ("Extension context
   * invalidated"); they stop quietly instead of throwing. Refreshing the tab loads the new script.
   */
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

  async function run(force) {
    if (running || finished) return;
    if (/ebislogin/i.test(location.pathname)) return;
    const store = await chrome.storage.local.get(["qeManakInclusion", "qeManakInclusionEnabled", "inclusionFill"]);
    if (store.qeManakInclusion === true && store.qeManakInclusionEnabled !== true && store.inclusionFill && signedIn()) {
      await chrome.storage.local.set({ qeManakInclusionEnabled: true });
      store.qeManakInclusionEnabled = true;
    }
    if (store.qeManakInclusionEnabled !== true || !store.inclusionFill) {
      if (panelHost) panelHost.remove();
      return;
    }
    const data = store.inclusionFill;
    if (!onForm()) {
      const note = signedIn() ? await autoNavigate(data) : "";
      if (note) renderPanel(data, note, null, false);
      return;
    }
    sessionStorage.removeItem(NAV_KEY);
    const licence = norm(document.body.innerText).replace(/\D+/g, " ").split(" ");
    if (!licence.includes(data.cmlNo)) {
      renderPanel(data, `This inclusion form is not for CM/L ${data.cmlNo} — nothing filled.`, null, false);
      return;
    }
    running = true;
    const report = { filled: [], missing: [], skipped: [], portal: [] };
    renderPanel(data, "Adding varieties…", null, false);
    try {
      const added = await addVarieties(data, report);
      if (!added || report.portal.length) {
        renderPanel(data, "Stopped — see below. Fix it, then Fill again.", report, false);
        return;
      }
      // The Declaration section is shown by the page only once varieties are drafted: reload once to get it.
      const decl = $id("addFacRequired");
      const reloadKey = `qeIncReload|${data.cmlNo}`;
      if ((!decl || !visible(decl)) && draftedTexts().length && sessionStorage.getItem(reloadKey) !== "1") {
        sessionStorage.setItem(reloadKey, "1");
        renderPanel(data, "Varieties drafted — reloading to open the Declaration section…", report, false);
        await sleep(800);
        location.reload();
        return;
      }
      sessionStorage.removeItem(reloadKey);
      if (!decl || !visible(decl)) {
        report.missing.push('Declaration section (shows after varieties are drafted) — reload the page and click "Fill again"');
        renderPanel(data, "Varieties done.", report, false);
        return;
      }
      await declaration(data, report);
      finished = true;
      await turnOff({ message: `Inclusion filled: ${report.filled.length} done, ${report.missing.length} need you`, missing: report.missing, at: Date.now() });
      renderPanel(data, report.missing.length || report.portal.length ? "Filled — some items need you." : "All filled.", report, true);
      chrome.runtime.sendMessage({ type: "QE_MANAK_IDLE" }, () => void chrome.runtime.lastError);
    } finally {
      running = false;
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "QE_INCLUSION_REFRESH") safeRun(false);
    if (msg.type === "QE_MANAK_IDLE" && panelHost && !finished) panelHost.remove();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.qeManakInclusionEnabled || changes.inclusionFill) safeRun(false);
  });

  setTimeout(() => safeRun(false), 1500);
})();
