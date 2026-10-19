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
      if (onDone) onDone(null, new Error("QE Consultancy extension runtime is unavailable."));
      return;
    }
    let completed = false;
    const finish = (response, error) => {
      if (completed) return;
      completed = true;
      if (onDone) onDone(response, error || null);
    };
    try {
      const sent = chrome.runtime.sendMessage(message, (response) => {
        const lastError = chrome.runtime.lastError;
        finish(response, lastError ? new Error(lastError.message) : null);
      });
      if (sent && typeof sent.catch === "function") {
        sent.then((response) => finish(response, null)).catch((error) => {
          finish(null, error instanceof Error ? error : new Error(String(error)));
        });
      }
    } catch (error) {
      finish(null, error instanceof Error ? error : new Error(String(error)));
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
      window.postMessage({ type: "QE_MANAK_QR_IMPORT", result }, window.location.origin);
      window.dispatchEvent(new CustomEvent("qe-manak-qr-import", { detail: result }));
      return;
    }
    if (!result.sample_code && !result.pdfBase64) return;
    const key = resultKey(result);
    if (!force && key && key === lastPublishedKey) return;
    lastPublishedKey = key;
    window.postMessage({ type: "QE_MANAK_RESULT", result }, window.location.origin);
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
    if (event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "QE_MANAK_PULL_RESULT") {
      pullStoredResult(true);
      return;
    }
    if (data.type === "QE_IS_CODE_PING") {
      markPresent();
      let version = "";
      try {
        version = chrome.runtime.getManifest().version;
      } catch {
        /* orphaned after reload */
      }
      window.postMessage({ type: "QE_IS_CODE_PONG", version }, window.location.origin);
      sendRuntime({ type: "QE_IS_CODE_PING" });
      return;
    }
    if (data.type === "QE_IS_CODE_FETCH") {
      markPresent();
      window.postMessage({ type: "QE_IS_CODE_FETCH_ACK" }, window.location.origin);
      sendRuntime({ type: "QE_IS_CODE_FETCH", isNumber: data.isNumber || "" });
      return;
    }
    if (data.type === "QE_PRODUCT_MANUAL_SEARCH") {
      markPresent();
      const requestId = String(data.requestId || "");
      sendRuntime(
        { type: "QE_PRODUCT_MANUAL_SEARCH", requestId, isNumber: data.isNumber || "" },
        (response, error) => {
          window.postMessage(
            {
              type: "QE_PRODUCT_MANUAL_SEARCH_RESULT",
              requestId,
              ok: Boolean(response && response.ok && !error),
              message: error?.message || response?.message || "The Product Manual search could not be started.",
            },
            window.location.origin,
          );
        },
      );
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
        newApp: Boolean(data.newApp),
        inclusion: Boolean(data.inclusion),
        renewal: Boolean(data.renewal),
        qrCount: Number(data.qrCount) || 1,
        projectId: data.projectId || "",
        loginUrl: data.loginUrl || "",
        homeUrl: data.homeUrl || "",
        portalUserId: data.portalUserId || "",
        portalPassword: data.portalPassword || "",
      },
      (response, error) => {
        if (error || response?.ok === false || !response) {
          window.postMessage(
            {
              type: "QE_MANAK_OPEN_ERROR",
              error: error?.message || response?.message || "The extension could not open Manak Online.",
            },
            window.location.origin,
          );
          return;
        }
        window.postMessage(
          { type: "QE_MANAK_OPEN_ACK", message: response.message || "Manak Online opened." },
          window.location.origin,
        );
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
        if (msg.type === "QE_MANAK_QR_IMPORT_REJECTED") {
          window.postMessage(
            { type: "QE_MANAK_QR_IMPORT_REJECTED", message: msg.message || "QR import was rejected." },
            window.location.origin,
          );
        }
        if (msg.type === "QE_MANAK_PDF_CHUNK") {
          acceptPdfChunk(msg);
        }
        if (msg.type === "QE_IS_CODE_PROGRESS") {
          window.postMessage({ type: "QE_IS_CODE_PROGRESS", message: msg.message || "" }, window.location.origin);
        }
        if (msg.type === "QE_IS_CODE_FILL") {
          window.postMessage({ type: "QE_IS_CODE_FILL", payload: msg.payload || {} }, window.location.origin);
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
