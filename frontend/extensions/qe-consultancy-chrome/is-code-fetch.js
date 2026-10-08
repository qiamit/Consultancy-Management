(function () {
  if (window.__qeIsCodeFetchInstalled) return;
  window.__qeIsCodeFetchInstalled = true;
  const assist = self.qeCaptchaAssist || {};
  const sleep = assist.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const setNativeValue =
    assist.setNativeValue ||
    function (el, value) {
      if (!el) return;
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };

  const MANUALS_API =
    "https://standardsadmin.bis.gov.in/review-service/getProductManualStandardsList";
  const MANUALS_CDN =
    "https://bmqsdqljvwgm.compat.objectstorage.ap-mumbai-1.oraclecloud.com/";

  function parseIs(raw) {
    const text = String(raw || "").trim();
    const match = text.match(/(?:IS[\s/]*)?(\d{2,5})(?:\s*[:()\-]\s*(\d{4}))?/i);
    const doc = match ? match[1] : text.replace(/\D/g, "");
    const year = match && match[2] ? match[2] : "";
    return {
      raw: text,
      doc,
      year,
      display: doc ? `IS ${doc}` : text,
      query: doc ? (year ? `IS ${doc}:${year}` : `IS ${doc}`) : text,
    };
  }

  function matchesIs(text, doc) {
    return new RegExp(`(?:^|\\s)IS\\s*${doc}(?!\\d)`, "i").test(String(text || ""));
  }

  function parseMoney(text) {
    const match = String(text || "")
      .replace(/,/g, "")
      .match(/(\d+(?:\.\d+)?)/);
    return match ? match[1] : "";
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const out = String(reader.result || "");
        resolve(out.includes(",") ? out.split(",")[1] : out);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function fetchAsFile(url, name) {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error("download failed");
    const blob = await res.blob();
    if (blob.size < 80) throw new Error("empty file");
    return {
      name: name || (url.split("/").pop() || "document.pdf").split("?")[0],
      mime: blob.type || "application/pdf",
      base64: await blobToBase64(blob),
    };
  }

  function parseProductManualNumber(text) {
    const compact = String(text || "").replace(/\s+/g, " ");
    const match = compact.match(
      /PM\s*\/\s*IS\s*\d{2,5}(?:\s*\([^)]+\))?(?:\s*\/\s*[A-Za-z0-9.-]+){0,5}/i,
    );
    if (!match) return "";
    return match[0]
      .replace(/\s*\/\s*/g, "/")
      .replace(/\s+/g, " ")
      .replace(/PM\/IS/i, "PM/IS")
      .trim();
  }

  async function inflatePdfText(base64) {
    const bin = atob(String(base64 || "").replace(/^data:[^;]+;base64,/, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    const raw = new TextDecoder("latin1").decode(bytes);
    const chunks = [raw];
    const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match = re.exec(raw);
    while (match) {
      let payload = match[1];
      if (payload.startsWith("\r\n")) payload = payload.slice(2);
      else if (payload.startsWith("\n")) payload = payload.slice(1);
      const u8 = new Uint8Array(payload.length);
      for (let i = 0; i < payload.length; i += 1) u8[i] = payload.charCodeAt(i);
      for (const format of ["deflate", "deflate-raw"]) {
        try {
          const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream(format));
          const dec = new Uint8Array(await new Response(stream).arrayBuffer());
          chunks.push(new TextDecoder("latin1").decode(dec));
          break;
        } catch {
          /* next decoder */
        }
      }
      match = re.exec(raw);
    }
    return chunks.join("\n");
  }

  function pdfLiteralStrings(text) {
    const out = [];
    const re = /\((?:\\.|[^\\)])+\)/g;
    let match = re.exec(text);
    while (match) {
      out.push(match[0].slice(1, -1).replace(/\\n/g, " ").replace(/\\(.)/g, "$1"));
      match = re.exec(text);
    }
    return out.join("");
  }

  async function extractProductManualNumber(base64) {
    try {
      const inflated = await inflatePdfText(base64);
      return parseProductManualNumber(`${pdfLiteralStrings(inflated)} ${inflated}`);
    } catch {
      return "";
    }
  }

  function clickAndCaptureDownload(el, name) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (file) => {
        if (done) return;
        done = true;
        resolve(file || null);
      };
      try {
        chrome.runtime.sendMessage({ type: "QE_CAPTURE_NEXT_DOWNLOAD", name }, (res) => {
          void chrome.runtime.lastError;
          if (res && res.base64) {
            finish({
              name: res.name || name,
              mime: res.mime || "application/pdf",
              base64: res.base64,
            });
            return;
          }
          finish(null);
        });
      } catch {
        finish(null);
        return;
      }
      window.setTimeout(() => {
        try {
          el.click();
        } catch {
          finish(null);
        }
      }, 80);
    });
  }

  async function fetchHtml(url) {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error("page fetch failed");
    return new DOMParser().parseFromString(await res.text(), "text/html");
  }

  function scrapeLimsDoc(doc, is) {
    let best = 0;
    let title = "";
    let year = is.year;
    const table = doc.querySelector("table");
    if (table) {
      [...table.querySelectorAll(":scope > tbody > tr, :scope > tr")].forEach((tr) => {
        const cells = [...tr.children].map((td) => td.innerText.trim());
        if (cells.length < 7 || !/^\d+$/.test(cells[0] || "")) return;
        const chargeText = String(cells[6] || "").split(/View breakup/i)[0];
        const charge = Number(parseMoney(chargeText));
        if (charge > best) {
          best = charge;
          title = cells[4] || title;
          const yearMatch = String(cells[3] || "").match(/\((\d{4})\)/);
          if (yearMatch) year = yearMatch[1];
        }
      });
    }
    const next = [...doc.querySelectorAll("a")].find((a) => /^Next$/i.test((a.textContent || "").trim()));
    return { best, title, year, nextHref: next && next.href ? next.href : "" };
  }

  async function runLims(is) {
    if (!/lims\.bis\.gov\.in/i.test(location.hostname)) {
      return { fields: {}, notes: ["Not on LIMS."] };
    }
    for (let i = 0; i < 20 && !document.querySelector("table tr td"); i += 1) {
      await sleep(400);
    }
    let best = 0;
    let title = "";
    let year = is.year;
    let url = location.href;
    for (let page = 0; page < 40; page += 1) {
      const doc = page === 0 ? document : await fetchHtml(url);
      const part = scrapeLimsDoc(doc, is);
      if (part.best > best) {
        best = part.best;
        title = part.title || title;
        year = part.year || year;
      }
      if (!part.nextHref || part.nextHref === url) break;
      url = part.nextHref;
    }
    const fields = { is_number: is.display };
    if (best) fields.testing_charges = String(best);
    if (title) fields.is_code_title = title.replace(/\s+/g, " ").trim();
    if (year) fields.revision_year = year;
    return {
      fields,
      notes: best
        ? [`LIMS: highest testing charge ₹${best}.`]
        : ["LIMS: no testing charge found."],
    };
  }

  function findKnowFeesRow(is) {
    return [...document.querySelectorAll("table tr")].find((tr) => {
      const text = tr.innerText || "";
      return matchesIs(text, is.doc) && /[0-9]{3,}/.test(text);
    });
  }

  function pickKnowFeesItem(is) {
    const items = [...document.querySelectorAll("#mylist li, #standardResultsSet li")];
    const exact = items.find((li) => new RegExp(`^IS\\s*${is.doc}\\[`, "i").test(li.id || ""));
    return exact || items.find((li) => matchesIs(li.id || li.textContent || "", is.doc)) || null;
  }

  async function runKnowFees(is) {
    if (!/manakonline\.in/i.test(location.hostname) || !/knowfees/i.test(location.pathname)) {
      return { fields: {}, notes: ["Not on Know Fees."] };
    }
    if (assist.silencePageAlerts) assist.silencePageAlerts();
    const byIs = document.getElementById("searchByIS");
    if (byIs && !byIs.checked) byIs.click();
    const org = document.getElementById("org");
    setNativeValue(org, is.doc);

    const typed = assist.solvePageCaptcha
      ? await assist.solvePageCaptcha({
          minChars: 5,
          fallbackMs: 300000,
        })
      : "";
    if (!typed) {
      return {
        fields: {},
        keepTab: true,
        notes: ["Know Fees: type the captcha on that tab. Search starts after you finish."],
      };
    }

    const cap = document.getElementById("captcha0071") || (assist.captchaInput && assist.captchaInput());
    setNativeValue(cap, typed);
    try {
      document.documentElement.setAttribute("data-qe-captcha-text", typed);
    } catch {
      /* ignore */
    }
    await sleep(400);
    const search = document.getElementById("searchP");
    if (search) search.click();

    let item = null;
    for (let wait = 0; wait < 40 && !item; wait += 1) {
      await sleep(400);
      item = pickKnowFeesItem(is);
    }
    if (item) item.click();

    let fields = scrapeKnowFeesFields(is);
    for (let wait = 0; wait < 30 && !fields.mmf_large_scale; wait += 1) {
      await sleep(400);
      fields = scrapeKnowFeesFields(is);
    }
    const result = !fields.mmf_large_scale && !fields.slab_1_rate
      ? {
          fields,
          keepTab: true,
          notes: [
            "Know Fees: captcha accepted but the fee table was not read. Keep this tab open and retry the icon if the table is visible.",
          ],
        }
      : {
          fields,
          notes: ["Know Fees: marking fee and slab rates filled."],
        };
    try {
      chrome.runtime.sendMessage({ type: "QE_IS_CODE_PORTAL_RESULT", site: "knowfees", result });
    } catch {
      /* original fetch channel may have closed */
    }
    return result;
  }

  function scrapeKnowFeesFields(is) {
    const row =
      document.querySelector("#IsDetailsBody tr") ||
      findKnowFeesRow(is) ||
      [...document.querySelectorAll("table tr")].find((tr) => {
        const cells = [...tr.children];
        return cells.length >= 8 && matchesIs(tr.innerText || "", is.doc);
      }) ||
      null;
    if (!row) return {};
    const cells = [...row.children].map((td) => (td.innerText || "").replace(/\s+/g, " ").trim());
    const moneyCells = cells.map((cell) => parseMoney(cell));
    const firstMoney = moneyCells.findIndex((cell) => cell && Number(cell) > 0);
    return {
      is_code_title: cells[1] && !/^\d+(\.\d+)?$/.test(cells[1]) ? cells[1] : "",
      mmf_large_scale: cells[2] ? parseMoney(cells[2]) : firstMoney >= 0 ? moneyCells[firstMoney] : "",
      mmf_medium_scale: parseMoney(cells[3]),
      mmf_small_scale: parseMoney(cells[4]),
      mmf_micro_scale: parseMoney(cells[5]),
      unit_of_is: cells[6] || "",
      slab_1_quantity: cells[7] || "",
      slab_1_rate: parseMoney(cells[8]),
      slab_2_quantity: cells[9] || "",
      slab_2_rate: parseMoney(cells[10]),
      slab_3_quantity: cells[11] || "",
      slab_3_rate: parseMoney(cells[12]),
    };
  }

  function manualNumberFromText(text) {
    const match = String(text || "").match(/\bPM[-\s]?[A-Z0-9/.-]+\b/i);
    return match ? match[0] : "";
  }

  function pickManualRow(rows, is) {
    const exact = rows.find((row) => {
      const num = String(row.standardNumber || "");
      return new RegExp(`^IS\\s*${is.doc}(?:\\s*[:].*)?$`, "i").test(num.trim());
    });
    if (exact) return exact;
    return rows.find((row) => matchesIs(row.standardNumber || "", is.doc)) || null;
  }

  async function runManuals(is) {
    const files = [];
    try {
      const res = await fetch(MANUALS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ searchTerm: is.doc }),
      });
      if (res.ok) {
        const json = await res.json();
        const rows = Array.isArray(json && json.data) ? json.data : [];
        const row = pickManualRow(rows, is);
        if (row && row.filename) {
          const url = /^https?:/i.test(row.filename)
            ? row.filename
            : `${MANUALS_CDN}${String(row.filename).replace(/^\/+/, "")}`;
          const manual = await fetchAsFile(url, `IS_${is.doc}_Product_Manual.pdf`);
          files.push(manual);
          const yearMatch = String(row.standardNumber || "").match(/(\d{4})/);
          const pm =
            (await extractProductManualNumber(manual.base64)) ||
            manualNumberFromText(`${row.remarks || ""} ${row.filename || ""} ${row.standardNumber || ""}`);
          return {
            fields: {
              ...(pm ? { product_manual_number: pm } : {}),
              is_code_title: row.standardName || "",
              ...(yearMatch && !is.year ? { revision_year: yearMatch[1] } : {}),
            },
            files,
            notes: pm
              ? [`Product Manual attached. PM Number ${pm} filled.`]
              : ["Product Manual attached to IS Code Related Files."],
          };
        }
      }
    } catch {
      /* fall back to the public table */
    }

    if (!/standards\.bis\.gov\.in/i.test(location.hostname)) {
      return { fields: {}, files, notes: ["Product Manual: matching file not found."] };
    }
    const box = document.getElementById("product-manual-search");
    if (box) {
      setNativeValue(box, is.doc);
      const searchBtn = document.querySelector('button[aria-label*="Search product manuals" i]');
      if (searchBtn) searchBtn.click();
      else box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await sleep(1600);
    }
    const row = [...document.querySelectorAll("tr")].find((tr) => matchesIs(tr.innerText || "", is.doc));
    const download = row
      ? [...row.querySelectorAll("a")].find((a) =>
          /download product manual/i.test(a.textContent || a.getAttribute("aria-label") || ""),
        )
      : null;
    if (download && download.href && !download.href.startsWith("javascript")) {
      try {
        const manual = await fetchAsFile(download.href, `IS_${is.doc}_Product_Manual.pdf`);
        files.push(manual);
        const pm = await extractProductManualNumber(manual.base64);
        return {
          fields: pm ? { product_manual_number: pm } : {},
          files,
          notes: pm
            ? [`Product Manual attached. PM Number ${pm} filled.`]
            : ["Product Manual attached to IS Code Related Files."],
        };
      } catch {
        /* keep going without a browser download */
      }
    }
    return {
      fields: {},
      files,
      notes: files.length
        ? ["Product Manual attached to IS Code Related Files."]
        : ["Product Manual: matching file not found."],
    };
  }

  function bsbEmailField() {
    return (
      document.getElementById("T1_txtUser") ||
      document.getElementById("ctl00_ContentPlaceHolder1_T1_txtUser") ||
      document.querySelector('input[placeholder*="registered email" i]')
    );
  }

  function bsbPasswordField() {
    return (
      document.getElementById("T1_txtPass") ||
      document.getElementById("ctl00_ContentPlaceHolder1_T1_txtPass") ||
      document.querySelector('input[type="password"]')
    );
  }

  function bsbCaptchaField() {
    return (
      document.getElementById("T1_captcha") ||
      document.getElementById("ctl00_ContentPlaceHolder1_T1_captcha") ||
      (assist.captchaInput ? assist.captchaInput() : null)
    );
  }

  function bsbSignIn() {
    return (
      document.getElementById("T1_btn_submit") ||
      document.getElementById("ctl00_ContentPlaceHolder1_T1_btn_submit")
    );
  }

  function guardBsbSignIn() {
    if (window.__qeBsbGuardOn) return;
    window.__qeBsbGuardOn = true;
    window.__qeBsbAllowSubmit = false;
    const block = (event) => {
      if (window.__qeBsbAllowSubmit) return;
      const target = event.target;
      const onSignIn = Boolean(target && target.closest && target.closest("#T1_btn_submit"));
      if (event.type === "keypress" && event.key === "Enter") {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (event.type === "click" && onSignIn) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    document.addEventListener("keypress", block, true);
    document.addEventListener("click", block, true);
  }

  function bsbNoticeText() {
    const el = document.getElementById("T1_lblnotice");
    return String((el && (el.innerText || el.textContent)) || "").replace(/\s+/g, " ").trim();
  }

  function fillBsbCredentials(creds) {
    const email = bsbEmailField();
    const password = bsbPasswordField();
    if (email) setNativeValue(email, creds.email);
    if (password) setNativeValue(password, creds.password);
  }

  function writeBsbCaptcha(text) {
    const cap = bsbCaptchaField();
    if (!cap) return;
    try {
      const proto = HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      if (desc && desc.set) desc.set.call(cap, text);
      else cap.value = text;
    } catch {
      cap.value = text;
    }
    cap.dispatchEvent(new Event("input", { bubbles: true }));
    cap.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function markBsbSubmitted() {
    window.__qeBsbSubmitOnce = true;
    try {
      sessionStorage.setItem("qeBsbSubmitDone", "1");
    } catch {
      /* ignore */
    }
  }

  function alreadySubmittedBsb() {
    if (window.__qeBsbSubmitOnce) return true;
    try {
      return sessionStorage.getItem("qeBsbSubmitDone") === "1";
    } catch {
      return false;
    }
  }

  function submitBsbLoginOnce(creds, captchaText) {
    if (alreadySubmittedBsb()) return Promise.resolve(false);
    markBsbSubmitted();
    window.__qeBsbAllowSubmit = true;
    fillBsbCredentials(creds);
    writeBsbCaptcha(captchaText);
    return new Promise((resolve) => {
      const finish = (ok) => {
        window.__qeBsbAllowSubmit = false;
        resolve(Boolean(ok));
      };
      try {
        chrome.runtime.sendMessage(
          {
            type: "QE_BSB_LOGIN_CLICK",
            email: creds.email,
            password: creds.password,
            captcha: captchaText,
          },
          (res) => finish(res && res.ok),
        );
      } catch {
        const btn = document.getElementById("T1_btn_submit");
        if (btn) btn.click();
        finish(true);
      }
    });
  }

  async function fetchBsbSessionLoggedIn() {
    const urls = [
      "https://standardsbis.bsbedge.com/",
      "https://standardsbis.bsbedge.com/BIS_SearchStandard.aspx?id=0",
    ];
    for (const url of urls) {
      try {
        const res = await fetch(url, { credentials: "include", cache: "no-store" });
        const html = await res.text();
        if (/Log\s*Out|Sign\s*Out|lnkbtnLogout|Logout/i.test(html)) return true;
        if (/My Account|My Downloads|Welcome/i.test(html) && !/T1_txtUser|LoginPop/i.test(html)) {
          return true;
        }
      } catch {
        /* try the next URL */
      }
    }
    return false;
  }

  function isBsbLoginForm() {
    return Boolean(bsbEmailField() && bsbPasswordField());
  }

  function findBsbCard(is) {
    return [...document.querySelectorAll(".div_abc_main")].find((card) => {
      const line = (card.innerText || "").replace(/\s+/g, " ");
      return new RegExp(`IS\\s*${is.doc}\\s*:`, "i").test(line);
    }) || null;
  }

  function fieldsFromBsbCard(card, is) {
    const line = (card.innerText || "").replace(/\s+/g, " ");
    const year = (line.match(/IS\s*\d+\s*:\s*(\d{4})/i) || [])[1] || "";
    const reaff = (line.match(/Reaffirmed Year\s*:\s*(\d{4})/i) || [])[1] || "";
    const amd = (line.match(/No\.\s*of\s*Amendments\s*:\s*(\d+)/i) || [])[1] || "";
    const title = (line.match(/\)\s+(.+?)\s+Technical Committee/i) || [])[1] || "";
    const fields = {};
    if (year) fields.revision_year = year;
    if (reaff) fields.reaffirmation_year = reaff;
    if (amd) fields.amendment_number = amd.padStart(2, "0");
    if (title) fields.is_code_title = title.trim();
    fields.is_number = is.display;
    return fields;
  }

  async function loginBsbDownload(creds) {
    if (!bsbEmailField() || !bsbPasswordField()) {
      return { ok: false, keepTab: false, notes: ["BSB Edge: download login form not found on this page."] };
    }
    if (!creds.email || !creds.password) {
      return {
        ok: false,
        keepTab: true,
        notes: ["BSB Edge: save Email and Password in the QE Consultancy popup. Login is only for standard download."],
      };
    }
    guardBsbSignIn();
    if (alreadySubmittedBsb() || (await fetchBsbSessionLoggedIn())) {
      return { ok: true, keepTab: false, notes: ["BSB Edge: session is already signed in."] };
    }
    fillBsbCredentials(creds);
    const captcha = bsbCaptchaField();
    if (assist.prepareManualCaptcha) assist.prepareManualCaptcha(captcha);
    else if (captcha) captcha.value = "";
    const typed = assist.solvePageCaptcha
      ? await assist.solvePageCaptcha({ minChars: 5, holdMs: 10000, fallbackMs: 300000 })
      : "";
    if (!typed) {
      return {
        ok: false,
        keepTab: true,
        notes: ["BSB Edge: type the captcha. Sign In waits 10 seconds from your first key."],
      };
    }
    await submitBsbLoginOnce(creds, typed);
    await sleep(1800);
    for (let i = 0; i < 10; i += 1) {
      if (await fetchBsbSessionLoggedIn()) {
        return { ok: true, keepTab: false, notes: ["BSB Edge: signed in. Continuing to search."] };
      }
      if (!isBsbLoginForm()) {
        return { ok: true, keepTab: false, notes: ["BSB Edge: download login completed."] };
      }
      await sleep(400);
    }
    const notice = bsbNoticeText();
    if (/invalid|wrong|incorrect/i.test(notice) && (await fetchBsbSessionLoggedIn())) {
      return {
        ok: true,
        keepTab: false,
        notes: ["BSB Edge: signed in. The login popup error can be ignored."],
      };
    }
    return {
      ok: true,
      keepTab: false,
      notes: [
        "BSB Edge: Sign In was sent once. Opening search with the new session. Ignore Invalid username if another tab is already logged in.",
      ],
    };
  }

  function bsbSearchUrl(is) {
    return `https://standardsbis.bsbedge.com/BIS_SearchStandard.aspx?Standard_Number=${encodeURIComponent(is.query)}&id=0`;
  }

  function isBsbLoggedIn() {
    if (isBsbLoginForm()) return false;
    const body = document.body ? document.body.innerText || "" : "";
    return /log\s*out|sign\s*out|my account|welcome/i.test(body);
  }

  async function goBsbSearch(is) {
    if (/SearchStandard/i.test(location.pathname) && findBsbCard(is)) return;
    location.href = bsbSearchUrl(is);
    for (let i = 0; i < 20 && !findBsbCard(is); i += 1) await sleep(300);
    await sleep(800);
  }

  function aspEventTarget(el) {
    if (!el) return "";
    const named = el.getAttribute("name") || "";
    if (named) return named;
    const id = el.id || "";
    if (!id) return "";
    return id.replace(/_/g, "$");
  }

  async function blobIfPdf(res, name) {
    if (!res || !res.ok) return null;
    const blob = await res.blob();
    if (blob.size < 80) return null;
    const head = await blob.slice(0, 5).text();
    const ct = String(res.headers.get("content-type") || "");
    if (head !== "%PDF-" && !/pdf/i.test(ct)) return null;
    return {
      name,
      mime: "application/pdf",
      base64: await blobToBase64(blob),
    };
  }

  async function postbackDownload(eventTarget, name) {
    const form = document.querySelector("form");
    if (!form || !eventTarget) return null;
    const fd = new FormData(form);
    fd.set("__EVENTTARGET", eventTarget);
    fd.set("__EVENTARGUMENT", "");
    try {
      const res = await fetch(form.getAttribute("action") || location.href, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      return blobIfPdf(res, name);
    } catch {
      return null;
    }
  }

  async function fetchHrefQuiet(href, name) {
    if (!href || href.startsWith("javascript") || /LoginPop|login/i.test(href)) return null;
    try {
      const res = await fetch(href, { credentials: "include" });
      return blobIfPdf(res, name);
    } catch {
      return null;
    }
  }

  async function captureBsbAmendments(is) {
    const files = [];
    const links = [...document.querySelectorAll("a")].filter((el) => {
      const text = `${el.id || ""} ${el.textContent || ""} ${el.title || ""} ${el.href || ""}`;
      if (/login to download|LoginPop/i.test(text)) return false;
      return /download|amendment|pdf/i.test(text);
    });
    let fallback = links.length;
    for (const link of links.slice(0, 12)) {
      const fromText = ((link.textContent || "").match(/(\d+)/) || [])[1];
      const n = String(fromText || fallback).padStart(2, "0");
      const name = `IS_${is.doc}_Amendment_${n}.pdf`;
      const hrefFile = await fetchHrefQuiet(link.href || "", name);
      const file = hrefFile || (await postbackDownload(aspEventTarget(link), name));
      if (file) files.push(file);
      fallback -= 1;
    }
    return files;
  }

  async function captureBsbStandard(is, card) {
    const scope = card || document;
    const download =
      [...scope.querySelectorAll("a")].find((el) => {
        const text = `${el.id || ""} ${el.textContent || ""} ${el.title || ""} ${el.href || ""}`;
        return /download pdf|download standard|lnkbtnDownload/i.test(text);
      }) ||
      document.getElementById("ctl00_ContentPlaceHolder1_T1_lnkbtnDownloadPdf") ||
      document.getElementById("ctl00_ContentPlaceHolder1_T1_lnkbtnDownload");
    const name = `IS_${is.doc}_Standard.pdf`;
    if (download) {
      const fromHref = await fetchHrefQuiet(download.href || "", name);
      if (fromHref) return [fromHref];
      const fromPost = await postbackDownload(aspEventTarget(download), name);
      if (fromPost) return [fromPost];
    }
    const fallback = await postbackDownload(
      "ctl00$ContentPlaceHolder1$T1$lnkbtnDownloadPdf",
      name,
    );
    return fallback ? [fallback] : [];
  }

  async function runBsbedge(is, creds) {
    if (!/bsbedge\.com/i.test(location.hostname)) {
      return { fields: {}, files: [], notes: ["Not on BSB Edge."] };
    }

    if (isBsbLoginForm()) {
      const logged = await loginBsbDownload(creds);
      if (!logged.ok) return { fields: {}, files: [], keepTab: logged.keepTab, notes: logged.notes };
      return {
        fields: { is_number: is.display },
        files: [],
        navigate: bsbSearchUrl(is),
        notes: ["BSB Edge: logged in. Searching the IS number…"],
      };
    }

    await goBsbSearch(is);

    let card = findBsbCard(is);
    const fields = card ? fieldsFromBsbCard(card, is) : {};
    if (!isBsbLoggedIn() && isBsbLoginForm()) {
      const logged = await loginBsbDownload(creds);
      if (!logged.ok) return { fields, files: [], keepTab: logged.keepTab, notes: logged.notes };
      await goBsbSearch(is);
      card = findBsbCard(is);
    }

    const files = [];
    files.push(...(await captureBsbStandard(is, card || findBsbCard(is))));

    const amdCount = Number(fields.amendment_number || 0);
    if (amdCount > 0) {
      const amdLink = [...(card || findBsbCard(is) || document).querySelectorAll("a")].find((a) =>
        /Amendments\.aspx/i.test(a.href || ""),
      );
      const amdUrl =
        (amdLink && amdLink.href) ||
        `https://standardsbis.bsbedge.com/BIS_Amendments.aspx?parentid=${is.doc}&stdno=${encodeURIComponent(is.query)}`;
      try {
        const amdDoc = await fetchHtml(amdUrl);
        const links = [...amdDoc.querySelectorAll("a")].filter((el) => {
          const text = `${el.id || ""} ${el.textContent || ""} ${el.href || ""}`;
          if (/login to download|LoginPop/i.test(text)) return false;
          return /download|amendment|pdf/i.test(text);
        });
        let fallback = links.length;
        for (const link of links.slice(0, 12)) {
          const fromText = ((link.textContent || "").match(/(\d+)/) || [])[1];
          const n = String(fromText || fallback).padStart(2, "0");
          const href = link.getAttribute("href") || "";
          const abs = href ? new URL(href, amdUrl).toString() : "";
          const file = await fetchHrefQuiet(abs, `IS_${is.doc}_Amendment_${n}.pdf`);
          if (file) files.push(file);
          fallback -= 1;
        }
      } catch {
        /* amendments stay empty; main standard still uploads */
      }
    }

    const hasStandard = files.some((f) => /_Standard\.pdf$/i.test(f.name));
    const amdFiles = files.filter((f) => /_Amendment_/i.test(f.name)).length;
    return {
      fields,
      files,
      notes: hasStandard
        ? [
            amdFiles
              ? `BSB Edge: main standard plus ${amdFiles} amendment(s) captured in memory for merge.`
              : "BSB Edge: main standard captured. Amendment count is 0.",
          ]
        : ["BSB Edge: standard PDF was not captured after login and search."],
    };
  }

  function mapAspect(raw) {
    const text = String(raw || "").toLowerCase().replace(/\s+/g, " ");
    if (/test method|methods? of tests?/.test(text)) return "Test Method";
    if (/code of practice/.test(text)) return "Code of Practice";
    if (/specification/.test(text)) return "Specification";
    return text ? "Others" : "";
  }

  function afterLabel(body, label) {
    const re = new RegExp(
      String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*:?\\s*\\n+\\s*([^\\n]+)",
      "i",
    );
    const match = String(body || "").match(re);
    return match ? match[1].replace(/\s+/g, " ").trim() : "";
  }

  function scrapeStandardDetails(is) {
    const body = document.body ? document.body.innerText || "" : "";
    const fields = { is_number: is.display };
    const heading = [...document.querySelectorAll("h1, h2, h3")].find((h) =>
      /IS\s*\d+/i.test(h.textContent || ""),
    );
    const headingText = heading ? (heading.textContent || "").replace(/\s+/g, " ").trim() : "";
    const year =
      (headingText.match(/:(\d{4})/) || body.match(/IS\s*\d+\s*:\s*(\d{4})/) || [])[1] || is.year;
    if (year) fields.revision_year = year;

    let title = "";
    const reviewedBlock = body.match(/Reviewed\s*In\s*:\s*\d{4}\s+([^\n]{6,240})/i);
    if (reviewedBlock) {
      const line = reviewedBlock[1].replace(/\s+/g, " ").trim();
      if (!/voluntary|mandatory|department:|technical committee|indian standard|click to/i.test(line)) {
        title = line;
      }
    }
    if (!title && heading) {
      let node = heading.nextElementSibling;
      for (let i = 0; i < 10 && node; i += 1, node = node.nextElementSibling) {
        const line = (node.innerText || "").replace(/\s+/g, " ").trim();
        if (!line || /reviewed in/i.test(line)) continue;
        if (/voluntary|mandatory|department:|technical committee|indian standard|click to/i.test(line)) {
          continue;
        }
        if (line.length > 6 && line.length < 300) {
          title = line.split("\n")[0].trim();
          break;
        }
      }
    }
    if (title) fields.is_code_title = title;

    const reaffirm =
      (afterLabel(body, "Reaffirmation Year").match(/(\d{4})/) ||
        body.match(/Reaffirmation Year\s*:?\s*[A-Za-z,]*\s*(\d{4})/i) ||
        body.match(/Reviewed\s*In\s*:\s*(\d{4})/i) ||
        [])[1] || "";
    if (reaffirm) fields.reaffirmation_year = reaffirm;

    const amdTab = [...document.querySelectorAll('[role="tab"], a, button')].find((el) =>
      /Amendment\s*\(\s*\d+\s*\)/i.test((el.textContent || "").trim()),
    );
    let amd = afterLabel(body, "Number of Amendments").replace(/\D/g, "");
    if (!amd && amdTab) amd = ((amdTab.textContent || "").match(/\((\d+)\)/) || [])[1] || "";
    if (amd) fields.amendment_number = String(amd).padStart(2, "0");

    const aspect = mapAspect(afterLabel(body, "Type of Standard"));
    if (aspect) fields.aspect_of_is = aspect;

    return fields;
  }

  function findStandardDetailsHref(is) {
    return (
      [...document.querySelectorAll('a[href*="standard-details"]')].find((a) =>
        matchesIs(a.textContent || a.getAttribute("href") || "", is.doc),
      ) || null
    );
  }

  async function runStandardDetails(is) {
    if (!/standards\.bis\.gov\.in/i.test(location.hostname)) {
      return { fields: {}, notes: ["Not on Know Your Standards."] };
    }

    if (/know-your-standards/i.test(location.pathname)) {
      const box = document.querySelector(
        'input[placeholder*="Search Indian Standards" i], input[type="search"]',
      );
      if (box && !String(box.value || "").includes(is.doc)) {
        setNativeValue(box, is.doc);
        const searchBtn = [...document.querySelectorAll("button")].find((btn) =>
          /^Search$/i.test((btn.textContent || "").trim()),
        );
        if (searchBtn) searchBtn.click();
      }
      let link = findStandardDetailsHref(is);
      for (let wait = 0; wait < 30 && !link; wait += 1) {
        await sleep(400);
        link = findStandardDetailsHref(is);
      }
      if (!link || !link.href) {
        return { fields: {}, notes: ["Know Your Standards: matching IS was not listed."] };
      }
      return { fields: {}, navigate: link.href, notes: [] };
    }

    if (!/standard-details/i.test(location.pathname)) {
      return { fields: {}, notes: ["Not on Standard Details."] };
    }

    for (let wait = 0; wait < 35; wait += 1) {
      const body = document.body ? document.body.innerText || "" : "";
      if (/Reaffirmation Year|Type of Standard|Reviewed In/i.test(body)) break;
      await sleep(400);
    }
    const fields = scrapeStandardDetails(is);
    const got = [fields.is_code_title, fields.reaffirmation_year, fields.amendment_number, fields.aspect_of_is].filter(
      Boolean,
    );
    return {
      fields,
      notes: got.length
        ? ["Know Your Standards: title, reaffirmation year, amendment, and aspect filled."]
        : ["Know Your Standards: details page opened but extra fields were empty."],
    };
  }

  async function runJob(message) {
    const is = parseIs(message.isNumber);
    const creds = message.creds || {};
    const site = String(message.site || "");
    if (site === "lims") return runLims(is);
    if (site === "details") return runStandardDetails(is);
    if (site === "knowfees") return runKnowFees(is);
    if (site === "manuals") return runManuals(is);
    if (site === "bsbedge") return runBsbedge(is, creds);
    return { fields: {}, notes: ["Unknown portal."] };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "QE_IS_CODE_RUN") return;
    runJob(message)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  });
})();
