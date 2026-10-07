(function () {
  if (/manakonline\.in$/i.test(location.hostname)) return;

  function markPresent() {
    try {
      document.documentElement.dataset.qeConsultancy = "1";
      window.__QE_CONSULTANCY__ = true;
    } catch {
      /* ignore */
    }
  }
  markPresent();

  function runtimeOk() {
    try {
      return Boolean(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function storageOk() {
    try {
      return Boolean(runtimeOk() && chrome.storage && chrome.storage.local);
    } catch {
      return false;
    }
  }

  function sendRuntime(message, onDone) {
    if (!runtimeOk()) {
      if (onDone) onDone();
      return;
    }
    try {
      const sent = chrome.runtime.sendMessage(message, () => {
        void chrome.runtime.lastError;
        if (onDone) onDone();
      });
      if (sent && typeof sent.catch === "function") {
        sent.catch(() => {
          if (onDone) onDone();
        });
      }
    } catch {
      if (onDone) onDone();
    }
  }

  let lastPublishedKey = "";
  const pdfChunks = new Map();

  function resultKey(result) {
    if (!result) return "";
    return [
      result.sampleId || "",
      result.sample_code || "",
      result.qr_code || "",
      result.pdfName || "",
      String((result.pdfBase64 || "").length),
      String(result.filledAt || ""),
    ].join("|");
  }

  function publish(result, force) {
    if (!result) return;
    if (result.kind === "QE_MANAK_QR_IMPORT_V1") {
      const codes = Array.isArray(result.qr_codes) ? result.qr_codes : [];
      if (!codes.length) return;
      const key = `qr|${codes.join(",")}|${result.filledAt || ""}`;
      if (!force && key && key === lastPublishedKey) return;
      lastPublishedKey = key;
      window.postMessage({ type: "QE_MANAK_QR_IMPORT", result }, "*");
      window.dispatchEvent(new CustomEvent("qe-manak-qr-import", { detail: result }));
      return;
    }
    if (!result.sample_code && !result.pdfBase64) return;
    const key = resultKey(result);
    if (!force && key && key === lastPublishedKey) return;
    lastPublishedKey = key;
    window.postMessage({ type: "QE_MANAK_RESULT", result }, "*");
    window.dispatchEvent(new CustomEvent("qe-manak-sample-result", { detail: result }));
  }

  function acceptPdfChunk(msg) {
    if (!msg || !msg.id || typeof msg.chunk !== "string") return;
    let entry = pdfChunks.get(msg.id);
    if (!entry) {
      entry = { parts: [], total: Number(msg.total) || 0, meta: msg.meta || {} };
      pdfChunks.set(msg.id, entry);
    }
    entry.parts[Number(msg.index) || 0] = msg.chunk;
    const have = entry.parts.filter((part) => typeof part === "string").length;
    if (!entry.total || have < entry.total) return;
    const pdfBase64 = entry.parts.join("");
    pdfChunks.delete(msg.id);
    publish(
      {
        kind: "QE_MANAK_TR_RESULT_V1",
        sampleId: entry.meta.sampleId || "",
        sample_code: entry.meta.sample_code || "",
        qr_code: entry.meta.qr_code || "",
        pdfName: entry.meta.pdfName || "Test_Request.pdf",
        filledAt: entry.meta.filledAt || Date.now(),
        pdfBase64,
      },
      true,
    );
  }

  function pullStoredResult(force) {
    if (!storageOk()) return;
    try {
      chrome.storage.local.get(null, (data) => {
        void chrome.runtime.lastError;
        const light = data && data.manakResult;
        const meta = data && data.manakPdfMeta;
        if (meta && Number(meta.total) > 0) {
          const parts = [];
          for (let i = 0; i < Number(meta.total); i += 1) {
            const chunk = data[`manakPdf_${i}`];
            if (typeof chunk !== "string") {
              if (light) publish(light, force);
              return;
            }
            parts.push(chunk);
          }
          publish(
            {
              kind: "QE_MANAK_TR_RESULT_V1",
              sampleId: (light && light.sampleId) || meta.sampleId || "",
              sample_code: (light && light.sample_code) || meta.sample_code || "",
              qr_code: (light && light.qr_code) || meta.qr_code || "",
              pdfName: meta.pdfName || "Test_Request.pdf",
              filledAt: (light && light.filledAt) || meta.filledAt || Date.now(),
              pdfBase64: parts.join(""),
            },
            true,
          );
          return;
        }
        if (data && data.manakQrImport) publish(data.manakQrImport, force);
        if (light) publish(light, force);
      });
    } catch {
      /* extension context invalidated after Reload */
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "QE_MANAK_PULL_RESULT") {
      pullStoredResult(true);
      return;
    }
    if (data.type === "QE_IS_CODE_PING") {
      markPresent();
      window.postMessage({ type: "QE_IS_CODE_PONG" }, "*");
      sendRuntime({ type: "QE_IS_CODE_PING" });
      return;
    }
    if (data.type === "QE_IS_CODE_FETCH") {
      markPresent();
      window.postMessage({ type: "QE_IS_CODE_FETCH_ACK" }, "*");
      sendRuntime({ type: "QE_IS_CODE_FETCH", isNumber: data.isNumber || "" });
      return;
    }
    if (data.type !== "QE_MANAK_OPEN") return;
    // Always forward to background — ACK-only debounce skipped the login payload.
    window.__qeManakOpenSent = Date.now();
    sendRuntime(
      {
        type: "QE_MANAK_OPEN_TR",
        payload: data.payload,
        loginOnly: Boolean(data.loginOnly),
        importQr: Boolean(data.importQr),
        qrCount: Number(data.qrCount) || 1,
        loginUrl: data.loginUrl || "",
        homeUrl: data.homeUrl || "",
        portalUserId: data.portalUserId || "",
        portalPassword: data.portalPassword || "",
      },
      () => {
        window.postMessage({ type: "QE_MANAK_OPEN_ACK" }, "*");
      },
    );
  });

  if (runtimeOk()) {
    sendRuntime({ type: "QE_MANAK_APP_HELLO" });
    sendRuntime({ type: "QE_IS_CODE_PING" });
    try {
      chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (!msg || typeof msg !== "object") return;
        if ((msg.type === "QE_MANAK_RESULT" || msg.type === "QE_MANAK_PDF") && msg.result) {
          publish(msg.result, true);
        }
        if (msg.type === "QE_MANAK_QR_IMPORT" && msg.result) {
          publish(msg.result, false);
        }
        if (msg.type === "QE_MANAK_PDF_CHUNK") {
          acceptPdfChunk(msg);
        }
        if (msg.type === "QE_IS_CODE_PROGRESS") {
          window.postMessage({ type: "QE_IS_CODE_PROGRESS", message: msg.message || "" }, "*");
        }
        if (msg.type === "QE_IS_CODE_FILL") {
          window.postMessage({ type: "QE_IS_CODE_FILL", payload: msg.payload || {} }, "*");
        }
        if (msg.type === "QE_CAPTCHA_AI") {
          const requestId = msg.requestId || `cap-${Date.now()}`;
          const timer = window.setTimeout(() => {
            window.removeEventListener("message", onAiResult);
            sendResponse({ text: "" });
          }, 25000);
          function onAiResult(event) {
            if (event.source !== window) return;
            if (!event.data || event.data.type !== "QE_CAPTCHA_AI_RESULT") return;
            if (event.data.requestId && event.data.requestId !== requestId) return;
            window.clearTimeout(timer);
            window.removeEventListener("message", onAiResult);
            sendResponse({ text: String(event.data.text || "") });
          }
          window.addEventListener("message", onAiResult);
          window.postMessage({ type: "QE_CAPTCHA_AI", image: msg.image || "", requestId }, "*");
          return true;
        }
      });
    } catch {
      /* ignore */
    }
  }

  if (!storageOk()) return;

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (!storageOk()) return;
      if (area !== "local") return;
      if (changes.manakResult || changes.manakPdfMeta || changes.manakPdf_0) {
        pullStoredResult(true);
      }
    });
  } catch {
    /* extension context invalidated after Reload */
  }

  pullStoredResult(true);
  window.addEventListener("focus", () => pullStoredResult(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") pullStoredResult(true);
  });
  [800, 2500, 6000, 12000, 20000].forEach((ms) => {
    window.setTimeout(() => pullStoredResult(true), ms);
  });
})();
