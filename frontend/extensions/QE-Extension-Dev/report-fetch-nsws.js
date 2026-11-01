// Manak eLIMS "View Test Reports And Testing Charges" page (nsws.manakonline.in/eLIMS/viewGlobalTestReportDoc…),
// opened from View Test Report on Test Request Details during a Consultancy Pro Test Report fetch.
// Takes the PDF behind its "View Test Report" link and hands it to background.js. Does nothing without an armed
// fetch (qeManakReport.capture), so normal browsing of this page is untouched.
(function () {
  if (window.__qeNswsReport) return;
  window.__qeNswsReport = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function send(result) {
    try {
      chrome.runtime.sendMessage({ type: "QE_MANAK_REPORT_RESULT", result }, () => void chrome.runtime.lastError);
    } catch {
      /* extension reloaded */
    }
  }

  function banner(message) {
    let box = document.getElementById("qe-nsws-report-banner");
    if (!box) {
      box = document.createElement("div");
      box.id = "qe-nsws-report-banner";
      box.style.cssText =
        "position:fixed;top:12px;right:12px;z-index:2147483647;max-width:360px;padding:10px 14px;background:#78350f;color:#fff;font:600 13px/1.4 Arial,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.3)";
      document.documentElement.appendChild(box);
    }
    box.textContent = message;
  }

  function toBase64(buf) {
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }

  /** "View Test Report" links in the table, newest upload last (rows are listed oldest first). */
  function reportLinks() {
    return Array.from(document.querySelectorAll("a, button")).filter((el) =>
      /view\s*test\s*report/i.test(String(el.textContent || el.title || "")),
    );
  }

  function sampleCode() {
    const m = String(document.body ? document.body.innerText : "").match(/Testing Charges for:\s*([^\n]+)/i);
    return m ? m[1].trim() : "";
  }

  chrome.storage.local.get(["qeManakReport"], async (data) => {
    const job = data && data.qeManakReport;
    if (!job || !job.capture) return;
    if (Date.now() - Number(job.startedAt || 0) > 30 * 60 * 1000) return;
    banner("QE Consultancy: reading the Test Report for Consultancy Pro…");

    let links = [];
    for (let attempt = 0; attempt < 30 && !links.length; attempt += 1) {
      links = reportLinks();
      if (!links.length) await sleep(500);
    }
    if (!links.length) {
      banner("No Test Report file on this page yet.");
      send({ ok: false, message: "Manak Shows No Test Report File for This Sample Yet." });
      return;
    }
    const link = links[links.length - 1];
    const href = String(link.getAttribute("href") || "");
    const name = `Test_Report_${(sampleCode() || job.qrCode || "sample").replace(/[^\w.-]+/g, "_")}.pdf`;
    if (href && !/^javascript:|^#/i.test(href)) {
      try {
        const res = await fetch(new URL(href, location.href).toString(), { credentials: "include" });
        const buf = await res.arrayBuffer();
        const head = String.fromCharCode.apply(null, new Uint8Array(buf.slice(0, 5)));
        if (buf.byteLength >= 80 && head === "%PDF-") {
          banner("Test Report found — sending it to Consultancy Pro…");
          send({ ok: true, pdfName: name, pdfBase64: toBase64(buf) });
          return;
        }
      } catch {
        /* fall back to the click below */
      }
    }
    // The link opens / submits / builds the PDF in a popup: report-hook-nsws.js (page world) catches it and posts the
    // bytes here. A real download, if any, is still caught by background.js (job.capture is set).
    banner("Opening the Test Report for Consultancy Pro…");
    const got = new Promise((resolve) => {
      const onMessage = (event) => {
        const data = event.data;
        if (event.source !== window || !data || data.source !== "qe-nsws-report" || data.type !== "pdf") return;
        window.removeEventListener("message", onMessage);
        resolve(data.buf);
      };
      window.addEventListener("message", onMessage);
      window.setTimeout(() => {
        window.removeEventListener("message", onMessage);
        resolve(null);
      }, 25000);
    });
    document.documentElement.dataset.qeCaptureReport = "1";
    link.click();
    const buf = await got;
    if (buf) {
      banner("Test Report found — sending it to Consultancy Pro…");
      send({ ok: true, pdfName: name, pdfBase64: toBase64(buf) });
      return;
    }
    delete document.documentElement.dataset.qeCaptureReport;
    banner("Could not read the Test Report PDF here.");
    send({
      ok: false,
      message: "Manak Opened the Test Report but It Could Not Be Read. Download It From Manak and Upload It Here by Double-Click.",
    });
  });
})();
