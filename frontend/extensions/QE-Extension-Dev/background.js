const STORAGE_KEY = "copyPasteBypassEnabled";
const STORAGE_KEY_CTRL = "ctrlKeyBypassEnabled";
const EBIS_LOGIN = "https://www.manakonline.in/MANAK/eBISLogin";
const HOME_URL = "https://www.manakonline.in/MANAK/login";
const GENERATE_QR_URL =
  "https://www.manakonline.in/MANAK/employeeQrCodeGeneration";
const TEST_REQUEST =
  "https://www.manakonline.in/MANAK/testRequestGenerationForApplicant";
const RESULT_KIND = "QE_MANAK_TR_RESULT_V1";
const QR_IMPORT_KIND = "QE_MANAK_QR_IMPORT_V1";
const PLAY_STORE = /play\.google\.com|apps\.apple\.com|com\.bis\.app|itunes\.apple\.com/i;
// Consultancy Pro tabs that may receive Manak results / PDFs (exact hostnames, checked before every send).
const APP_HOSTS_HTTPS = ["qengineering.in", "www.qengineering.in"];
const DEV_HOSTS = ["localhost", "127.0.0.1"];
// Manak PDF inbox (API gateway). Local dev: any localhost / 127.0.0.1 port.
const RETURN_ORIGINS = ["https://api.qengineering.in"];
const MANAK_HOSTS = ["manakonline.in", "www.manakonline.in"];
const PDF_CHUNK = 160000;

const hasDebugger = Boolean(chrome.debugger);
const hasDownloads = Boolean(chrome.downloads && chrome.downloads.onChanged);
const hasWebNavigation = Boolean(chrome.webNavigation);
let pendingDownloadCapture = null;
let isCodeFetchActive = false;
const MANUALS_API = "https://standardsadmin.bis.gov.in/review-service/getProductManualStandardsList";
const MANUALS_CDN = "https://bmqsdqljvwgm.compat.objectstorage.ap-mumbai-1.oraclecloud.com/";

function isPlayStoreUrl(url) {
  return PLAY_STORE.test(String(url || ""));
}

self.addEventListener("unhandledrejection", (event) => {
  const msg = String((event.reason && event.reason.message) || event.reason || "");
  if (
    /navigation rejected|not focused|could not establish connection|receiving end|no tab with id|frame was removed|debugger/i.test(
      msg,
    )
  ) {
    event.preventDefault();
  }
});

function settle(value) {
  if (value && typeof value.catch === "function") return value.catch(() => undefined);
  return Promise.resolve(value);
}

function closePlayStoreTab(tabId) {
  if (!tabId) return;
  void settle(chrome.tabs.remove(tabId)).catch(() => {});
}

function stripPasswordFromManakUrl(url) {
  const raw = String(url || "");
  if (!raw || !/manakonline\.in/i.test(raw)) return raw;
  try {
    const u = new URL(raw);
    u.searchParams.delete("passwd");
    u.searchParams.delete("password");
    return u.toString();
  } catch {
    return raw;
  }
}

function safeTabUpdate(tabId, props) {
  const next = props && props.url ? { ...props, url: stripPasswordFromManakUrl(props.url) } : props;
  return settle(chrome.tabs.update(tabId, next));
}

function safeTabCreate(props) {
  const next = props && props.url ? { ...props, url: stripPasswordFromManakUrl(props.url) } : props;
  return settle(chrome.tabs.create(next));
}

function createManakTab(url) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url: stripPasswordFromManakUrl(url), active: true }, (tab) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message || "Could not open Manak Online."));
      } else if (!tab || !tab.id) {
        reject(new Error("Manak Online tab was not created."));
      } else {
        resolve(tab);
      }
    });
  });
}

function activateManakTab(tabId, url) {
  return new Promise((resolve, reject) => {
    chrome.tabs.update(
      tabId,
      { active: true, ...(url ? { url: stripPasswordFromManakUrl(url) } : {}) },
      (tab) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message || "Could not open the Manak Online tab."));
        } else if (!tab || !tab.id) {
          reject(new Error("The Manak Online tab could not be activated."));
        } else {
          resolve(tab);
        }
      },
    );
  });
}

function safeSendTab(tabId, message) {
  return settle(chrome.tabs.sendMessage(tabId, message));
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get([STORAGE_KEY, STORAGE_KEY_CTRL]);
  const updates = {};
  if (typeof stored[STORAGE_KEY] !== "boolean") {
    updates[STORAGE_KEY] = true;
  }
  if (typeof stored[STORAGE_KEY_CTRL] !== "boolean") {
    updates[STORAGE_KEY_CTRL] = true;
  }
  if (Object.keys(updates).length) {
    await chrome.storage.sync.set(updates);
  }
  // Fresh install: Manak auto features stay OFF until Consultancy Pro / popup arms them.
  const local = await chrome.storage.local.get(["qeManakEnabled"]);
  if (typeof local.qeManakEnabled !== "boolean") {
    await chrome.storage.local.set({
      qeManakEnabled: false,
      qeManakArmed: false,
      qeManakImportQr: false,
      qeManakImportQrEnabled: false,
      qeManakNewApp: false,
      qeManakNewAppEnabled: false,
      qeManakInclusion: false,
      qeManakInclusionEnabled: false,
      qeManakRenewal: false,
      qeManakRenewalEnabled: false,
    });
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  if (isPlayStoreUrl(tab.pendingUrl || tab.url || "")) closePlayStoreTab(tab.id);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab.url || tab.pendingUrl || "";
  if (isPlayStoreUrl(url)) closePlayStoreTab(tabId);
  if (!/manakonline\.in/i.test(url)) return;
  if (/knowfees/i.test(url)) return;
  if (changeInfo.status !== "complete" && !/ebislogin/i.test(url)) return;

  // Login auto-fill + Import redirect ONLY while a Manak flow is armed.
  chrome.storage.local.get(
    [
      "qeManakEnabled",
      "qeManakArmed",
      "pendingFill",
      "qeManakImportQr",
      "qeManakImportQrEnabled",
      "qeManakImportQrLanded",
      "qeManakPortal",
      "qeManakNewApp",
      "qeManakInclusion",
      "qeManakRenewal",
    ],
    (data) => {
      const importArmed = data && data.qeManakImportQr === true;
      // Inclusion and Renewal stay armed across their pages like New Application.
      const newAppArmed =
        data && (data.qeManakNewApp === true || data.qeManakInclusion === true || data.qeManakRenewal === true);
      const trArmed =
        data &&
        data.qeManakEnabled === true &&
        data.qeManakArmed === true &&
        hasTrSample(data.pendingFill);
      if (!importArmed && !trArmed && !newAppArmed) return;

      // New Application stays armed through all 8 steps; re-fill login only on the eBIS login page.
      if (/ebislogin/i.test(url) || (changeInfo.status === "complete" && !(newAppArmed && !importArmed && !trArmed))) {
        const portal = (data && data.qeManakPortal) || {};
        const userId = lastPortal.userId || portal.userId || "";
        const password = lastPortal.password || "";
        if (userId || password) scheduleLoginFill(tabId, userId, password);
      }

      // Import QR: land on Generate QR once after login.
      if (changeInfo.status !== "complete" || !importArmed) return;
      if (/ebislogin/i.test(url)) return;
      if (/employeeQrCodeGeneration|generateqr|qrcodegeneration/i.test(url)) {
        if (data.qeManakImportQrLanded !== true) {
          void chrome.storage.local.set({ qeManakImportQrLanded: true });
        }
        return;
      }
      if (data.qeManakImportQrLanded === true) return;
      void chrome.storage.local.set({ qeManakImportQrLanded: true });
      void safeTabUpdate(tabId, { url: GENERATE_QR_URL });
    },
  );
  if (changeInfo.status === "complete" && !/ebislogin/i.test(url)) {
    void tabSession(tabId).then((session) => {
      if (session && session.loggedIn) clearRememberedPortal();
    });
  }
});

if (hasWebNavigation && chrome.webNavigation.onCreatedNavigationTarget) {
  chrome.webNavigation.onCreatedNavigationTarget.addListener((details) => {
    if (isPlayStoreUrl(details.url)) closePlayStoreTab(details.tabId);
  });
}

if (hasWebNavigation && chrome.webNavigation.onBeforeNavigate) {
  chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId !== 0) return;
    if (isPlayStoreUrl(details.url)) closePlayStoreTab(details.tabId);
  });
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

async function printTabToPdf(tabId) {
  if (!tabId || !hasDebugger) return "";
  const target = { tabId };
  try {
    await settle(chrome.debugger.detach(target));
  } catch {
    /* not attached */
  }
  try {
    await chrome.debugger.attach(target, "1.3");
    await new Promise((resolve) => setTimeout(resolve, 400));
    const printed = await chrome.debugger.sendCommand(target, "Page.printToPDF", {
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      paperWidth: 8.27,
      paperHeight: 11.69,
      marginTop: 0.35,
      marginBottom: 0.35,
      marginLeft: 0.35,
      marginRight: 0.35,
    });
    await settle(chrome.debugger.detach(target));
    return printed && printed.data ? printed.data : "";
  } catch {
    await settle(chrome.debugger.detach(target));
    return "";
  }
}

/** True for a Test Request payload armed by Consultancy Pro for one sample (login-only / {} never counts). */
function hasTrSample(pending) {
  return Boolean(
    pending &&
      typeof pending === "object" &&
      pending.kind === "QE_MANAK_TR_V1" &&
      String(pending.sampleId || "").trim(),
  );
}

function parseUrl(url) {
  try {
    return new URL(String(url || ""));
  } catch {
    return null;
  }
}

/** Consultancy Pro tab: exact app hostnames only (dev: localhost / 127.0.0.1 on any port). */
function isAppTabUrl(url) {
  const u = parseUrl(url);
  if (!u) return false;
  const host = u.hostname.toLowerCase();
  if (u.protocol === "https:" && APP_HOSTS_HTTPS.includes(host)) return true;
  return (u.protocol === "http:" || u.protocol === "https:") && DEV_HOSTS.includes(host);
}

/** Manak PDF inbox origin: https://api.qengineering.in, or localhost / 127.0.0.1 in dev. "" when not allowed. */
function allowedReturnUrl(value) {
  const u = parseUrl(String(value || "").trim());
  if (!u || u.username || u.password) return "";
  const host = u.hostname.toLowerCase();
  const devOk = (u.protocol === "http:" || u.protocol === "https:") && DEV_HOSTS.includes(host);
  if (!devOk && !RETURN_ORIGINS.includes(u.origin)) return "";
  return `${u.origin}${u.pathname}`.replace(/\/+$/, "");
}

/** Manak / FMCS login page on manakonline.in (https only). "" when not allowed. */
function allowedManakUrl(value) {
  const u = parseUrl(String(value || "").trim());
  if (!u || u.protocol !== "https:" || u.username || u.password) return "";
  return MANAK_HOSTS.includes(u.hostname.toLowerCase()) ? u.toString() : "";
}

function getTab(tabId) {
  return new Promise((resolve) => {
    if (!tabId) {
      resolve(null);
      return;
    }
    try {
      chrome.tabs.get(tabId, (tab) => {
        void chrome.runtime.lastError;
        resolve(tab || null);
      });
    } catch {
      resolve(null);
    }
  });
}

/** Re-checks the tab's current URL right before every send — tab ids get reused for other sites. */
async function sendToAppTab(tabId, message) {
  const tab = await getTab(Number(tabId) || 0);
  if (!tab || !tab.id || !isAppTabUrl(tab.url || "")) return false;
  await safeSendTab(tab.id, message);
  return true;
}

// bridge.js (content script on the app tab) posts the result and assembles the chunked PDF for the page.
function deliverResultToTab(tabId, result) {
  if (!tabId) return;
  const pdf = result.pdfBase64 || "";
  const light = { ...result, pdfBase64: "" };
  void sendToAppTab(tabId, { type: "QE_MANAK_RESULT", result: light });
  if (!pdf) return;
  const id = `manak-pdf-${result.sampleId || "x"}-${result.filledAt || Date.now()}`;
  const total = Math.ceil(pdf.length / PDF_CHUNK) || 1;
  const meta = {
    sampleId: result.sampleId || "",
    sample_code: result.sample_code || "",
    qr_code: result.qr_code || "",
    pdfName: result.pdfName || "Test_Request.pdf",
    filledAt: result.filledAt || Date.now(),
  };
  for (let i = 0; i < total; i += 1) {
    void sendToAppTab(tabId, {
      type: "QE_MANAK_PDF_CHUNK",
      id,
      index: i,
      total,
      chunk: pdf.slice(i * PDF_CHUNK, (i + 1) * PDF_CHUNK),
      meta,
    });
  }
}

function notifyAppTabs(result) {
  const seen = new Set();
  const send = (tabId) => {
    if (!tabId || seen.has(tabId)) return;
    seen.add(tabId);
    deliverResultToTab(tabId, result);
  };
  send(lastManakAppTabId || lastIsCodeAppTabId);
  chrome.tabs.query({}, (all) => {
    findAppTabIds(all).forEach(send);
  });
}

function deliverQrImportToTab(tabId, result) {
  if (!tabId || !result) return;
  // Bridge content script posts to the page once — do not also executeScript
  // postMessage or the app gets duplicate import events / toasts.
  void sendToAppTab(tabId, { type: "QE_MANAK_QR_IMPORT", result });
}

function notifyQrImportToApp(result, targetAppTabId) {
  const seen = new Set();
  const send = (tabId) => {
    if (!tabId || seen.has(tabId)) return;
    seen.add(tabId);
    deliverQrImportToTab(tabId, result);
  };
  send(targetAppTabId || lastManakAppTabId || lastIsCodeAppTabId);
  if (!targetAppTabId) {
    chrome.tabs.query({}, (all) => {
      findAppTabIds(all).forEach(send);
    });
  }
}

const STORE_CHUNK = 350000;
const UPLOADED_TOKENS_KEY = "qeManakUploadedTokens";
const inboxUploads = new Map();

function rememberManakReturn(payload) {
  const returnUrl = allowedReturnUrl(payload && payload.returnUrl);
  const returnToken = String((payload && payload.returnToken) || "").trim();
  if (!returnUrl || !returnToken) {
    chrome.storage.local.set({ qeManakReturn: null });
    return;
  }
  chrome.storage.local.set({
    qeManakReturn: {
      returnUrl,
      returnToken,
      sampleId: (payload && payload.sampleId) || "",
    },
  });
}

async function postInbox(url, body) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      let json = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      if (res.ok && (!json || json.ok !== false)) return json || { ok: true };
      lastError = new Error((json && json.error) || `HTTP ${res.status}`);
      // Wrong token / bad request will not get better on a retry.
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) break;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Manak PDF inbox unavailable.");
}

/** Upload the captured PDF to the app's inbox once per hand-off token (chunk → finish), with retries. */
async function uploadPdfToAppInbox(result) {
  if (!result || !result.pdfBase64) return;
  let stored = {};
  try {
    stored = await chrome.storage.local.get(["pendingFill", "qeManakReturn", UPLOADED_TOKENS_KEY]);
  } catch {
    return;
  }
  const pending = (stored && stored.pendingFill) || {};
  const ret = (stored && stored.qeManakReturn) || {};
  const returnUrl = allowedReturnUrl(pending.returnUrl || ret.returnUrl);
  const returnToken = String(pending.returnToken || ret.returnToken || "").trim();
  if (!returnUrl || !returnToken) return;
  const tokenSampleId = String(pending.sampleId || ret.sampleId || "").trim();
  // A PDF for another sample must never land in this token's inbox.
  if (result.sampleId && tokenSampleId && String(result.sampleId) !== tokenSampleId) return;
  const done = Array.isArray(stored[UPLOADED_TOKENS_KEY]) ? stored[UPLOADED_TOKENS_KEY] : [];
  if (done.includes(returnToken) || inboxUploads.has(returnToken)) return;
  const pdf = String(result.pdfBase64)
    .replace(/^data:application\/pdf;base64,/i, "")
    .replace(/\s+/g, "");
  if (!pdf) return;
  const endpoint = `${returnUrl}/api/osl/manak-pdf`;
  const job = (async () => {
    const chunkSize = 120000;
    const total = Math.ceil(pdf.length / chunkSize) || 1;
    for (let index = 0; index < total; index += 1) {
      await postInbox(endpoint, {
        action: "chunk",
        token: returnToken,
        index,
        total,
        chunk: pdf.slice(index * chunkSize, (index + 1) * chunkSize),
      });
    }
    await postInbox(endpoint, {
      action: "finish",
      token: returnToken,
      pdfName: result.pdfName || "Test_Request.pdf",
      sample_code: result.sample_code || "",
      sampleId: result.sampleId || tokenSampleId,
    });
    // Done: never reuse this token for a later capture.
    const latest = await chrome.storage.local.get([UPLOADED_TOKENS_KEY, "qeManakReturn"]);
    const list = Array.isArray(latest[UPLOADED_TOKENS_KEY]) ? latest[UPLOADED_TOKENS_KEY] : [];
    const updates = { [UPLOADED_TOKENS_KEY]: [...list.filter((t) => t !== returnToken), returnToken].slice(-20) };
    if (latest.qeManakReturn && latest.qeManakReturn.returnToken === returnToken) updates.qeManakReturn = null;
    await chrome.storage.local.set(updates);
  })();
  inboxUploads.set(returnToken, job);
  try {
    await job;
  } catch {
    /* app inbox unavailable after retries — the app still gets the PDF from the bridge / stored copy */
  } finally {
    inboxUploads.delete(returnToken);
  }
}

function storedPdfKeys(all) {
  return Object.keys(all || {}).filter((key) => /^manakPdf_\d+$/.test(key));
}

/** Drop the stored Test Request result + PDF chunks (after the app confirms attach, or a new flow starts). */
function clearStoredManakPdf() {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (all) => {
      void chrome.runtime.lastError;
      const keys = [...storedPdfKeys(all), "manakPdfMeta", "manakResult"];
      chrome.storage.local.remove(keys, () => {
        void chrome.runtime.lastError;
        resolve();
      });
    });
  });
}

function persistManakResult(result) {
  const pdf = result.pdfBase64 || "";
  const light = { ...result, pdfBase64: "" };
  if (!pdf) {
    // Sample Code only: keep a PDF already stored for the app (it is cleared once the app confirms attach).
    chrome.storage.local.set({ manakResult: light }, () => void chrome.runtime.lastError);
    return;
  }
  void uploadPdfToAppInbox({ ...result, pdfBase64: pdf });
  chrome.storage.local.get(null, (all) => {
    const stale = [...storedPdfKeys(all), "manakPdfMeta"];
    const writeChunks = () => {
      chrome.storage.local.set({ manakResult: light, manakPdfMeta: null }, () => {
        void chrome.runtime.lastError;
        const total = Math.ceil(pdf.length / STORE_CHUNK) || 1;
        let index = 0;
        const next = () => {
          if (index >= total) {
            chrome.storage.local.set(
              {
                manakPdfMeta: {
                  total,
                  pdfName: result.pdfName || "Test_Request.pdf",
                  sampleId: result.sampleId || "",
                  sample_code: result.sample_code || "",
                  qr_code: result.qr_code || "",
                  filledAt: result.filledAt || Date.now(),
                },
              },
              () => void chrome.runtime.lastError,
            );
            return;
          }
          const key = `manakPdf_${index}`;
          const chunk = pdf.slice(index * STORE_CHUNK, (index + 1) * STORE_CHUNK);
          index += 1;
          chrome.storage.local.set({ [key]: chunk }, () => {
            void chrome.runtime.lastError;
            next();
          });
        };
        next();
      });
    };
    chrome.storage.local.remove(stale, writeChunks);
  });
}

function storePdfResult(partial) {
  chrome.storage.local.get(["pendingFill", "manakResult"], (data) => {
    const pending = data && data.pendingFill;
    const prev = (data && data.manakResult) || {};
    const result = {
      kind: RESULT_KIND,
      sampleId: partial.sampleId || prev.sampleId || (pending && pending.sampleId) || "",
      sample_code: partial.sample_code || prev.sample_code || "",
      qr_code: partial.qr_code || prev.qr_code || (pending && pending.sample && pending.sample.qr_code) || "",
      filledAt: Date.now(),
      pdfName: partial.pdfName || prev.pdfName || "Test_Request.pdf",
      pdfBase64: partial.pdfBase64 || prev.pdfBase64 || "",
    };
    persistManakResult(result);
    notifyAppTabs(result);
  });
}

function askManakTabsForPdf(url, filename) {
  chrome.tabs.query({ url: ["https://www.manakonline.in/*", "https://manakonline.in/*"] }, (tabs) => {
    (tabs || []).forEach((tab) => {
      if (!tab.id) return;
      void safeSendTab(tab.id, {
        type: "QE_MANAK_FETCH_PDF",
        url: url || "",
        filename: (filename || "Test_Request.pdf").split(/[/\\]/).pop(),
      });
    });
  });
}

function cancelBrowserDownload(downloadId) {
  if (!hasDownloads || !downloadId) return;
  try {
    chrome.downloads.cancel(downloadId, () => {
      void chrome.runtime.lastError;
      chrome.downloads.erase({ id: downloadId }, () => {
        void chrome.runtime.lastError;
      });
    });
  } catch {
    /* ignore */
  }
}

function isManakPdfDownload(item) {
  const blob = `${item.url || ""} ${item.finalUrl || ""} ${item.filename || ""} ${item.mime || ""} ${item.referrer || ""}`;
  if (!/manakonline/i.test(blob)) return false;
  return /pdf/i.test(blob) || /\.pdf/i.test(item.filename || "");
}

async function isManakTrCaptureActive() {
  try {
    const data = await chrome.storage.local.get([
      "pendingFill",
      "qeManakEnabled",
      "qeManakArmed",
      "qeManakImportQr",
    ]);
    return (
      Boolean(data) &&
      data.qeManakEnabled === true &&
      data.qeManakArmed === true &&
      data.qeManakImportQr !== true &&
      hasTrSample(data.pendingFill)
    );
  } catch {
    return false;
  }
}

/** Tell every Manak tab to drop capture / import hooks immediately. */
async function broadcastManakIdle() {
  try {
    const tabs = await chrome.tabs.query({
      url: ["https://www.manakonline.in/*", "https://manakonline.in/*"],
    });
    await Promise.all(
      tabs
        .filter((tab) => typeof tab.id === "number")
        .map((tab) =>
          chrome.tabs.sendMessage(tab.id, { type: "QE_MANAK_IDLE" }).catch(() => null),
        ),
    );
  } catch {
    /* ignore */
  }
}

async function broadcastBypass(type, enabled) {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs
      .filter((tab) => typeof tab.id === "number")
      .map((tab) => chrome.tabs.sendMessage(tab.id, { type, enabled }).catch(() => null)),
  );
}

async function runBulkFillOnActiveTab(fieldName, value) {
  const tab = await getActiveTab();
  if (!tab || typeof tab.id !== "number") {
    return { ok: false, error: "No active tab found." };
  }
  if (!isScriptableTabUrl(tab.url)) {
    return {
      ok: false,
      error: "This page is restricted. Open a regular website tab and try again.",
    };
  }

  const payload = { type: "RUN_BULK_FILL", fieldName, value };
  try {
    return await chrome.tabs.sendMessage(tab.id, payload);
  } catch (_initialError) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ["content-bypass.js"],
      });
      return await chrome.tabs.sendMessage(tab.id, payload);
    } catch (error) {
      return {
        ok: false,
        error: "Could not connect to the page. Refresh the tab and try again. " + String(error),
      };
    }
  }
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

let lastOpenKey = "";
let lastOpenAt = 0;
let lastPortal = { userId: "", password: "" };
let portalForgetTimer = 0;
let lastIsCodeAppTabId = 0;
let lastManakAppTabId = 0;
const fillSentAt = new Map();
const incomingManakPdf = new Map();

function rememberAppTab(tabId, url) {
  const id = Number(tabId) || 0;
  if (!id || !isAppTabUrl(url)) return;
  lastManakAppTabId = id;
  lastIsCodeAppTabId = lastIsCodeAppTabId || id;
  chrome.storage.local.set({ lastManakAppTabId: id, lastIsCodeAppTabId: lastIsCodeAppTabId }, () => {
    void chrome.runtime.lastError;
  });
}

chrome.storage.local.get(["lastManakAppTabId", "lastIsCodeAppTabId"], (data) => {
  if (data && data.lastManakAppTabId) lastManakAppTabId = Number(data.lastManakAppTabId) || lastManakAppTabId;
  if (data && data.lastIsCodeAppTabId) lastIsCodeAppTabId = Number(data.lastIsCodeAppTabId) || lastIsCodeAppTabId;
});

function findAppTabIds(tabs) {
  return (tabs || [])
    .filter((tab) => tab && tab.id && isAppTabUrl(tab.url || ""))
    .map((tab) => tab.id);
}

/**
 * Storage for one Manak flow: every other section's flags / stage / payload are cleared, so a leftover
 * New Application, Inclusion, Renewal, Import QR or Test Request run never hijacks the next one.
 * section: "tr" | "import" | "newApp" | "inclusion" | "renewal" | "login".
 */
function armOnly(section, extra) {
  const state = {
    pendingFill: null,
    qeManakEnabled: false,
    qeManakArmed: true,
    qeManakHomeReady: false,
    qeManakTrTabId: 0,
    qeManakImportQr: false,
    qeManakImportQrEnabled: false,
    qeManakImportQrLanded: false,
    qeManakImportQrTabId: 0,
    qeManakImportAppTabId: 0,
    qeManakImportProjectId: "",
    qeManakImportPortalUserId: "",
    qeManakNewApp: false,
    qeManakNewAppEnabled: false,
    newAppFill: null,
    newAppLog: null,
    qeManakInclusion: false,
    qeManakInclusionEnabled: false,
    inclusionFill: null,
    inclusionLog: null,
    qeManakRenewal: false,
    qeManakRenewalEnabled: false,
    renewalFill: null,
    renewalLog: null,
    renewalStage: null,
  };
  if (section !== "tr") state.qeManakReturn = null;
  return { ...state, ...(extra || {}) };
}

function payloadWithoutPassword(payload) {
  if (!payload || typeof payload !== "object") return payload || null;
  const next = { ...payload };
  delete next.portalPassword;
  delete next.password;
  delete next.passwd;
  return next;
}

function clearRememberedPortal() {
  lastPortal = { userId: "", password: "" };
  fillSentAt.clear();
  if (portalForgetTimer) {
    clearTimeout(portalForgetTimer);
    portalForgetTimer = 0;
  }
}

function rememberPortal(userId, password) {
  lastPortal = {
    userId: String(userId || "").trim(),
    password: String(password || "").trim(),
  };
  if (portalForgetTimer) clearTimeout(portalForgetTimer);
  portalForgetTimer = setTimeout(() => {
    portalForgetTimer = 0;
    clearRememberedPortal();
  }, 120000);
}

function injectMainWorldLogin(tabId, userId, password) {
  if (!tabId || !chrome.scripting || !chrome.scripting.executeScript) return;
  void settle(
    chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: (id, pwd) => {
        document.dispatchEvent(
          new CustomEvent("qe-manak-fill-login", {
            bubbles: true,
            detail: { userId: id, password: pwd },
          }),
        );
        const $ = window.jQuery || window.$;
        const user = document.getElementById("InputEmail");
        const pass = document.getElementById("InputPassword");
        if ($ && user && id) $(user).val(id).trigger("input").trigger("change");
        if ($ && pass && pwd) $(pass).val(pwd).trigger("input").trigger("change");
      },
      args: [userId, password],
    }),
  );
}

function scheduleLoginFill(tabId, userId, password) {
  rememberPortal(userId, password);
  if (!tabId || (!userId && !password)) return;
  const key = `${tabId}|${userId}|${password}`;
  const now = Date.now();
  if (now - (fillSentAt.get(key) || 0) < 600) return;
  fillSentAt.set(key, now);
  const tryFill = () => {
    void safeSendTab(tabId, {
      type: "QE_MANAK_FILL_LOGIN",
      userId,
      password,
    });
    injectMainWorldLogin(tabId, userId, password);
  };
  // Fewer retries — content script fills idempotently; extra fills refresh captcha image.
  [500, 1400, 3200, 6000].forEach((ms) => setTimeout(tryFill, ms));
}

function isScriptableTabUrl(url) {
  if (!url) return false;
  return !(
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("brave://") ||
    url.startsWith("about:") ||
    url.startsWith("safari-web-extension://") ||
    url.startsWith("view-source:")
  );
}

function ebisLoginHref(userId) {
  const id = String(userId || "").trim();
  if (!id) return EBIS_LOGIN;
  try {
    const u = new URL(EBIS_LOGIN);
    u.searchParams.set("userId", id);
    return u.toString();
  } catch {
    return EBIS_LOGIN;
  }
}

function normalizePortalUserId(value) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}

function portalUserIdsMatch(expectedUserId, candidates) {
  const expected = normalizePortalUserId(expectedUserId);
  if (!expected) return false;
  return (Array.isArray(candidates) ? candidates : [candidates]).some(
    (candidate) => normalizePortalUserId(candidate) === expected,
  );
}

function queryManakTabs() {
  return new Promise((resolve) => {
    chrome.tabs.query({ url: ["https://www.manakonline.in/*", "https://manakonline.in/*"] }, (tabs) => {
      resolve(tabs || []);
    });
  });
}

function tabSession(tabId) {
  return safeSendTab(tabId, { type: "QE_MANAK_SESSION" }).then((res) => res || null);
}

function isManakApplicantLoginUrl(url) {
  // /MANAK/login is NOT eBIS login — do not treat it as a logged-in session.
  return /manakonline\.in\/MANAK\/login\/?($|\?|#)/i.test(String(url || ""));
}

async function findLoggedInManakTab() {
  // Only trust content-script confirmed sessions — never guess from URL.
  // A stale Manak tab (home/error) used to fake loggedIn and skip eBIS login fill.
  return findConfirmedLoggedInManakTab();
}

/** Import QR / login flows: only trust content-script confirmed sessions. */
async function findConfirmedLoggedInManakTab() {
  const tabs = await queryManakTabs();
  for (const tab of tabs) {
    if (!tab.id) continue;
    const url = String(tab.url || tab.pendingUrl || "");
    if (isManakApplicantLoginUrl(url) || /ebislogin/i.test(url)) continue;
    const session = await tabSession(tab.id);
    if (session && session.loggedIn) return { tab, session };
  }
  return null;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return;

  if (message.type === "QE_IS_CODE_PING" || message.type === "QE_MANAK_APP_HELLO") {
    if (sender && sender.tab && sender.tab.id) rememberAppTab(sender.tab.id, sender.tab.url);
    sendResponse({ ok: true, extension: "QE Consultancy" });
    return true;
  }

  if (message.type === "QE_MANAK_WHOAMI") {
    // content.js asks which tab it runs in, to act only in the tab tracked for this Test Request.
    sendResponse({ tabId: (sender && sender.tab && sender.tab.id) || 0 });
    return true;
  }

  if (message.type === "QE_MANAK_RESULT_ACK") {
    // The app attached the Test Request PDF: drop the stored copy so bridge.js stops re-posting it.
    if (!(sender && sender.tab && isAppTabUrl(sender.tab.url || ""))) {
      sendResponse({ ok: false });
      return true;
    }
    const ackSampleId = String(message.sampleId || "").trim();
    chrome.storage.local.get(["manakResult", "manakPdfMeta"], (data) => {
      void chrome.runtime.lastError;
      const storedIds = [data && data.manakResult, data && data.manakPdfMeta]
        .map((entry) => String((entry && entry.sampleId) || "").trim())
        .filter(Boolean);
      if (!ackSampleId || !storedIds.includes(ackSampleId)) {
        sendResponse({ ok: true, cleared: false });
        return;
      }
      void clearStoredManakPdf().then(() => sendResponse({ ok: true, cleared: true }));
    });
    return true;
  }

  if (message.type === "QE_PRODUCT_MANUAL_SEARCH") {
    const isNumber = String(message.isNumber || "").trim();
    if (!isNumber) {
      sendResponse({ ok: false, message: "Select an IS Number first." });
      return true;
    }
    void (async () => {
      const tab = await safeTabCreate({
        url: "https://standards.bis.gov.in/website/product-manuals",
        active: true,
      });
      if (!tab || !tab.id) throw new Error("Could not open the BIS Product Manuals page.");
      if (tab.status !== "complete") await waitTabComplete(tab.id, 45000);
      await new Promise((resolve) => setTimeout(resolve, 1800));
      await injectIsFetch(tab.id);
      let result = null;
      for (let attempt = 0; attempt < 24; attempt += 1) {
        result = await chrome.tabs
          .sendMessage(tab.id, { type: "QE_PRODUCT_MANUAL_SEARCH", isNumber })
          .catch(() => null);
        if (result && result.ok) break;
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      if (!result || !result.ok) {
        throw new Error(result?.message || "The Product Manuals search field was not found.");
      }
      sendResponse({ ok: true, message: `Searching Product Manuals for ${isNumber}.` });
    })().catch((error) => {
      sendResponse({ ok: false, message: String(error?.message || error) });
    });
    return true;
  }

  if (message.type === "QE_BSB_LOGIN_CLICK") {
    const tabId = sender.tab && sender.tab.id;
    if (!tabId || !chrome.scripting || !chrome.scripting.executeScript) {
      sendResponse({ ok: false });
      return true;
    }
    void chrome.scripting
      .executeScript({
        target: { tabId },
        world: "MAIN",
        func: (email, password, captcha) => {
          if (window.__qeBsbMainClicked) return { ok: true, skipped: true };
          const user = document.getElementById("T1_txtUser");
          const pass = document.getElementById("T1_txtPass");
          const cap = document.getElementById("T1_captcha");
          const salt = document.getElementById("T1_HDSalt");
          if (!user || !pass || !cap) return { ok: false, reason: "fields" };
          if (!salt || !String(salt.value || "").trim()) return { ok: false, reason: "salt" };
          user.value = String(email || "");
          pass.value = String(password || "");
          cap.value = String(captcha || "");
          const btn = document.getElementById("T1_btn_submit");
          if (!btn) return { ok: false, reason: "button" };
          window.__qeBsbMainClicked = true;
          btn.click();
          return { ok: true };
        },
        args: [String(message.email || ""), String(message.password || ""), String(message.captcha || "")],
      })
      .then((results) => {
        const out = results && results[0] && results[0].result;
        sendResponse(out || { ok: false });
      })
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === "QE_CAPTURE_NEXT_DOWNLOAD") {
    const tabId = sender.tab && sender.tab.id;
    if (pendingDownloadCapture && pendingDownloadCapture.timer) {
      clearTimeout(pendingDownloadCapture.timer);
    }
    pendingDownloadCapture = {
      tabId,
      wantedName: String(message.name || "document.pdf"),
      sendResponse,
      timer: setTimeout(() => {
        if (pendingDownloadCapture && pendingDownloadCapture.sendResponse === sendResponse) {
          pendingDownloadCapture.sendResponse({ ok: false });
          pendingDownloadCapture = null;
        }
      }, 25000),
    };
    return true;
  }

  if (message.type === "QE_IS_CODE_PORTAL_RESULT" && message.result) {
    notifyIsCodeApp(lastIsCodeAppTabId, "QE_IS_CODE_FILL", {
      payload: {
        fields: message.result.fields || {},
        files: message.result.files || [],
        notes: message.result.notes || [],
        partial: true,
        done: false,
      },
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "GET_BYPASS_STATE") {
    chrome.storage.sync
      .get([STORAGE_KEY, STORAGE_KEY_CTRL])
      .then((stored) => {
        sendResponse({
          enabled: stored[STORAGE_KEY] !== false,
          ctrlKeyEnabled: stored[STORAGE_KEY_CTRL] !== false,
        });
      })
      .catch(() => sendResponse({ enabled: true, ctrlKeyEnabled: true }));
    return true;
  }

  if (message.type === "SET_BYPASS_STATE") {
    const enabled = Boolean(message.enabled);
    chrome.storage.sync
      .set({ [STORAGE_KEY]: enabled })
      .then(async () => {
        await broadcastBypass("BYPASS_STATE_CHANGED", enabled);
        sendResponse({ ok: true, enabled });
      })
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "SET_CTRL_BYPASS_STATE") {
    const enabled = Boolean(message.enabled);
    chrome.storage.sync
      .set({ [STORAGE_KEY_CTRL]: enabled })
      .then(async () => {
        await broadcastBypass("CTRL_BYPASS_STATE_CHANGED", enabled);
        sendResponse({ ok: true, enabled });
      })
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "RUN_BULK_FILL") {
    runBulkFillOnActiveTab(message.fieldName, message.value)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "QE_MANAK_OPEN_LOGIN") {
    safeTabCreate({ url: EBIS_LOGIN });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "QE_MANAK_OPEN_TR") {
    const senderTab = sender && sender.tab;
    if (senderTab && senderTab.id) {
      // Only Consultancy Pro (qengineering.in / local dev) may start a Manak flow.
      if (!isAppTabUrl(senderTab.url || "")) {
        sendResponse({ ok: false, message: "Manak flows can only be started from Consultancy Pro." });
        return true;
      }
      rememberAppTab(senderTab.id, senderTab.url);
    } else {
      chrome.tabs.query({}, (tabs) => {
        const appTab = (tabs || []).find((tab) => tab && tab.id && isAppTabUrl(tab.url || ""));
        if (appTab) rememberAppTab(appTab.id, appTab.url);
      });
    }
    const payload = message.payload || null;
    const portalUserId = String(message.portalUserId || payload?.portalUserId || "").trim();
    const portalPassword = String(message.portalPassword || payload?.portalPassword || "").trim();
    const importQr = Boolean(message.importQr);
    const trRun = !importQr && !message.newApp && !message.inclusion && !message.renewal && !message.loginOnly;
    if (trRun) {
      // Test Request needs one sample from the app, and the PDF goes back only to the app's own API.
      if (!hasTrSample(payload)) {
        sendResponse({ ok: false, message: "No Test Request sample was sent. Start Generate Test Request from Consultancy Pro again." });
        return true;
      }
      if (payload.returnUrl && !allowedReturnUrl(payload.returnUrl)) {
        sendResponse({ ok: false, message: "The PDF return address is not Consultancy Pro's API — Test Request not started." });
        return true;
      }
    }
    rememberPortal(portalUserId, portalPassword);
    const importAppTabId = Number(senderTab && senderTab.id) || lastManakAppTabId || 0;
    const importProjectId = String(message.projectId || "").trim();
    const qrCount = Math.max(1, Math.min(5, Number(message.qrCount) || 1));
    const openKey = [
      message.newApp
        ? "new-app"
        : message.inclusion
          ? "inclusion"
          : message.renewal
            ? "renewal"
            : message.loginOnly
              ? "login"
              : importQr
                ? "import-qr"
                : "tr",
      message.newApp || message.inclusion || message.renewal ? String(message.projectId || "") : "",
      portalUserId,
      (payload && payload.sampleId) || "",
      importQr ? String(qrCount) : "",
    ].join("|");
    const now = Date.now();
    if (openKey === lastOpenKey && now - lastOpenAt < 2500) {
      sendResponse({ ok: true, message: "Already opening Manak." });
      return true;
    }
    lastOpenKey = openKey;
    lastOpenAt = now;
    // Import QR must always use eBIS login — never /MANAK/login.
    const ebisLoginUrl = ebisLoginHref(portalUserId);
    // The app may send the FMCS login (foreign manufacturers); only manakonline.in pages are opened.
    const loginUrl = importQr ? ebisLoginUrl : allowedManakUrl(message.loginUrl) || ebisLoginUrl;
    const portal = { qeManakPortal: { userId: portalUserId } };
    void (async () => {
      if (importQr) {
        try {
          // Import QR is independent of Manak Test Request Auto power.
          // Section enables after Login; never create Test Request.
          await clearStoredManakPdf();
          await chrome.storage.local.set(
            armOnly("import", {
              manakQrImport: null,
              qeManakImportQr: true,
              qeManakImportQrEnabled: false,
              qeManakImportQrLanded: false,
              qeManakQrCount: qrCount,
              qeManakImportQrTabId: 0,
              qeManakImportAppTabId: importAppTabId,
              qeManakImportProjectId: importProjectId,
              qeManakImportPortalUserId: portalUserId,
              ...portal,
            }),
          );
          const reused = await findConfirmedLoggedInManakTab();
          if (reused && reused.tab.id) {
            if (
              !normalizePortalUserId(portalUserId) ||
              !portalUserIdsMatch(
                portalUserId,
                reused.session.userIds?.length ? reused.session.userIds : [reused.session.userId],
              )
            ) {
              await chrome.storage.local.set({
                qeManakImportQr: false,
                qeManakImportQrEnabled: false,
                qeManakImportQrLanded: false,
                qeManakImportQrTabId: 0,
                qeManakImportAppTabId: 0,
                qeManakImportProjectId: "",
                qeManakImportPortalUserId: "",
              });
              clearRememberedPortal();
              sendResponse({
                ok: false,
                message:
                  "The signed-in Manak account does not match this firm's saved account. Sign out of Manak, then retry the import.",
              });
              return;
            }
            clearRememberedPortal();
            await chrome.storage.local.set({
              qeManakImportQrEnabled: true,
              qeManakImportQrLanded: true,
              qeManakImportQrTabId: reused.tab.id,
              pendingFill: null,
            });
            await activateManakTab(reused.tab.id, GENERATE_QR_URL);
            sendResponse({
              ok: true,
              message: "Already logged in. Import QR enabled — opening Not Used QR Codes…",
            });
            return;
          }
          const created = await createManakTab(ebisLoginUrl);
          await chrome.storage.local.set({ qeManakImportQrTabId: created.id });
          scheduleLoginFill(created.id, portalUserId, portalPassword);
          sendResponse({
            ok: true,
            message:
              "Import QR armed. Opening eBIS login — captcha + Login, then Not Used QR import.",
          });
          return;
        } catch (error) {
          lastOpenKey = "";
          sendResponse({
            ok: false,
            message: error instanceof Error ? error.message : "Could not open Manak Online.",
          });
          return;
        }
      }
      if (message.inclusion) {
        // Manak Assist on BIS New Inclusion: login, then the Inclusion section opens this licence's
        // Change in Scope (Inclusion) form and fills it. Test Request / Import QR / New Application stay OFF.
        await clearStoredManakPdf();
        await chrome.storage.local.set(
          armOnly("inclusion", {
            qeManakInclusion: true,
            // Section switches ON once a signed-in Manak page is seen (inclusion-fill.js).
            qeManakInclusionEnabled: false,
            inclusionFill: payloadWithoutPassword(payload),
            ...portal,
          }),
        );
        const reused = await findConfirmedLoggedInManakTab();
        if (reused && reused.tab.id) {
          clearRememberedPortal();
          await chrome.storage.local.set({ qeManakInclusionEnabled: true });
          await safeTabUpdate(reused.tab.id, { active: true });
          void settle(chrome.windows.update(reused.tab.windowId, { focused: true }));
          void safeSendTab(reused.tab.id, { type: "QE_INCLUSION_REFRESH" });
          sendResponse({ ok: true, message: "Already logged in. Inclusion ON — opening the licence's Change in Scope (Inclusion)." });
          return;
        }
        const created = await safeTabCreate({ url: loginUrl, active: true });
        if (created && created.id) scheduleLoginFill(created.id, portalUserId, portalPassword);
        sendResponse({
          ok: true,
          message: "Opening Manak in a new tab. User ID / Password are filled — type the captcha.",
        });
        return;
      }
      if (message.renewal) {
        // Manak Assist on BIS License Renewals: login, then the Renewal section (renewal-fill.js) opens this
        // licence's Apply for Renewal and adds the production returns. Test Request / Import QR /
        // New Application / Inclusion stay OFF.
        await clearStoredManakPdf();
        await chrome.storage.local.set(
          armOnly("renewal", {
            qeManakRenewal: true,
            // Switches ON after captcha sign-in (content.js).
            qeManakRenewalEnabled: false,
            renewalFill: payloadWithoutPassword(payload),
            ...portal,
          }),
        );
        const reused = await findConfirmedLoggedInManakTab();
        if (reused && reused.tab.id) {
          clearRememberedPortal();
          await chrome.storage.local.set({ qeManakRenewalEnabled: true });
          await safeTabUpdate(reused.tab.id, { active: true });
          void settle(chrome.windows.update(reused.tab.windowId, { focused: true }));
          void safeSendTab(reused.tab.id, { type: "QE_RENEWAL_REFRESH" });
          sendResponse({ ok: true, message: "Already logged in. Renewal ON — opening this licence's Apply for Renewal." });
          return;
        }
        const created = await safeTabCreate({ url: loginUrl, active: true });
        if (created && created.id) scheduleLoginFill(created.id, portalUserId, portalPassword);
        sendResponse({
          ok: true,
          message: "Opening Manak in a new tab. User ID / Password are filled — type the captcha.",
        });
        return;
      }
      if (message.newApp) {
        // Manak Assist: login in a new tab, then the New Application section fills the
        // licence application for this project. Test Request / Import QR stay OFF.
        await clearStoredManakPdf();
        await chrome.storage.local.set(
          armOnly("newApp", {
            qeManakNewApp: true,
            // Section switches ON after captcha sign-in (content.js).
            qeManakNewAppEnabled: false,
            newAppFill: payloadWithoutPassword(payload),
            ...portal,
          }),
        );
        const reused = await findConfirmedLoggedInManakTab();
        if (reused && reused.tab.id) {
          clearRememberedPortal();
          await chrome.storage.local.set({ qeManakNewAppEnabled: true });
          await safeTabUpdate(reused.tab.id, { active: true });
          void settle(chrome.windows.update(reused.tab.windowId, { focused: true }));
          void safeSendTab(reused.tab.id, { type: "QE_NEWAPP_REFRESH" });
          sendResponse({
            ok: true,
            message: "Already logged in. New Application ON — open Apply for new licence or the draft.",
          });
          return;
        }
        const created = await safeTabCreate({ url: loginUrl, active: true });
        if (created && created.id) scheduleLoginFill(created.id, portalUserId, portalPassword);
        sendResponse({
          ok: true,
          message: "Opening Manak in a new tab. User ID / Password are filled — type the captcha.",
        });
        return;
      }
      if (message.loginOnly) {
        // Sign-in only (e.g. FMCS): every section stays OFF — no Test Request without a sample.
        await chrome.storage.local.set(armOnly("login", portal));
        const created = await safeTabCreate({ url: loginUrl });
        if (created && created.id) {
          scheduleLoginFill(created.id, portalUserId, portalPassword);
        }
        sendResponse({
          ok: true,
          message: "Opening Manak login. User ID / Password will be filled. Type captcha only.",
        });
        return;
      }
      // Generate Test Request from app — always re-enable Auto flow (even if last run turned it OFF).
      // Ack right away (the app waits a few seconds); the tab work below can take longer.
      await clearStoredManakPdf();
      await chrome.storage.local.set(
        armOnly("tr", {
          pendingFill: payloadWithoutPassword(payload),
          qeManakEnabled: true,
          ...portal,
        }),
      );
      rememberManakReturn(payload);
      sendResponse({
        ok: true,
        message: "Manak Test Request ON. Opening Manak — User ID / Password are filled; type the captcha (10s wait).",
      });
      // Use confirmed session only (same as Import QR) so User ID / captcha wait are not skipped.
      const reused = await findConfirmedLoggedInManakTab();
      if (reused && reused.tab.id) {
        clearRememberedPortal();
        await chrome.storage.local.set({ qeManakHomeReady: true, qeManakTrTabId: reused.tab.id });
        if (reused.session && reused.session.onTr) {
          await safeTabUpdate(reused.tab.id, { active: true });
          await safeSendTab(reused.tab.id, { type: "QE_MANAK_FILL", payload });
        } else {
          await safeTabUpdate(reused.tab.id, { active: true, url: TEST_REQUEST });
        }
        return;
      }
      // Prefer eBIS login URL with portal query params so content can fill even if message is late.
      const created = await safeTabCreate({ url: ebisLoginUrl });
      if (created && created.id) {
        await chrome.storage.local.set({ qeManakTrTabId: created.id });
        scheduleLoginFill(created.id, portalUserId, portalPassword);
      }
    })();
    return true;
  }

  if ((message.type === "QE_MANAK_PDF" || message.type === "QE_MANAK_RESULT") && message.result) {
    storePdfResult(message.result);
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "QE_MANAK_QR_IMPORT" && message.result) {
    const senderTabId = sender && sender.tab ? Number(sender.tab.id) || 0 : 0;
    chrome.storage.local.get(
      [
        "qeManakImportQrTabId",
        "qeManakImportAppTabId",
        "qeManakImportProjectId",
        "qeManakImportPortalUserId",
      ],
      (stored) => {
        const readError = chrome.runtime.lastError;
        if (readError) {
          sendResponse({ ok: false, message: readError.message || "Could not verify the QR import session." });
          return;
        }
        const tracked = Number((stored && stored.qeManakImportQrTabId) || 0) || 0;
        const targetAppTabId = Number((stored && stored.qeManakImportAppTabId) || 0) || 0;
        const projectId = String((stored && stored.qeManakImportProjectId) || "").trim();
        const expectedPortalUserId = normalizePortalUserId(stored && stored.qeManakImportPortalUserId);
        const actualPortalUserIds = Array.isArray(message.result.portalUserIds)
          ? message.result.portalUserIds
          : [message.result.portalUserId];
        if (
          !tracked ||
          senderTabId !== tracked ||
          !expectedPortalUserId ||
          !portalUserIdsMatch(expectedPortalUserId, actualPortalUserIds)
        ) {
          const reason =
            !tracked || senderTabId !== tracked
              ? "QR import rejected: these codes came from a Manak tab that is not linked to the active project import."
              : "QR import rejected: the signed-in Manak account does not match this firm's saved account.";
          if (targetAppTabId) {
            void sendToAppTab(targetAppTabId, { type: "QE_MANAK_QR_IMPORT_REJECTED", message: reason });
          }
          sendResponse({ ok: false, message: reason });
          return;
        }
        const result = { ...message.result, autoSave: true, projectId };
        chrome.storage.local.set({
          manakQrImport: result,
          qeManakImportQr: false,
          qeManakImportQrEnabled: false,
          qeManakImportQrLanded: false,
          qeManakImportQrTabId: 0,
          qeManakImportAppTabId: 0,
          qeManakImportProjectId: "",
          qeManakImportPortalUserId: "",
          pendingFill: null,
        }, () => {
          const writeError = chrome.runtime.lastError;
          if (writeError) {
            sendResponse({ ok: false, message: writeError.message || "Could not hand off the imported QR codes." });
            return;
          }
          notifyQrImportToApp(result, targetAppTabId);
          const closeIds = new Set([senderTabId, tracked].filter(Boolean));
          if (message.closeTab || message.finishImport) {
            closeIds.forEach((id) => {
              void settle(chrome.tabs.remove(id)).catch(() => {});
            });
          }
          sendResponse({ ok: true, message: `Returned ${result.qr_codes.length} QR code(s) to Consultancy Pro.` });
        });
      },
    );
    return true;
  }

  if (message.type === "QE_NEWAPP_FETCH_FILE") {
    // Content scripts on Manak cannot read our storage (CORS); fetch here.
    // Only URLs listed in the armed New Application payload are allowed.
    void (async () => {
      try {
        const url = String(message.url || "");
        const store = await chrome.storage.local.get(["newAppFill", "inclusionFill", "renewalFill"]);
        const files = [
          ...((store.newAppFill && store.newAppFill.files) || []),
          ...((store.inclusionFill && store.inclusionFill.files) || []),
          ...((store.renewalFill && store.renewalFill.files) || []),
        ];
        if (!url || !files.some((f) => f && f.url === url)) {
          sendResponse({ ok: false, error: "File is not part of this application." });
          return;
        }
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Download failed (${res.status}). Re-open Manak Assist to refresh links.`);
        const buf = new Uint8Array(await res.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i += 0x8000) {
          bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        }
        sendResponse({ ok: true, base64: btoa(bin), mime: res.headers.get("content-type") || "" });
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : "Download failed." });
      }
    })();
    return true;
  }

  if (message.type === "QE_MANAK_IDLE") {
    clearRememberedPortal();
    void broadcastManakIdle();
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "QE_MANAK_FINISH_TR") {
    const senderTabId = sender && sender.tab ? Number(sender.tab.id) || 0 : 0;
    void chrome.storage.local.set({
      pendingFill: null,
      qeManakArmed: false,
      qeManakEnabled: false,
      qeManakHomeReady: false,
      qeManakImportQr: false,
      qeManakTrTabId: 0,
    });
    void broadcastManakIdle();
    if (message.closeTab && senderTabId) {
      void settle(chrome.tabs.remove(senderTabId)).catch(() => {});
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "QE_MANAK_PDF_START") {
    incomingManakPdf.set(message.id, {
      meta: message.meta || {},
      parts: [],
      total: Number(message.total) || 0,
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "QE_MANAK_PDF_PART") {
    const entry = incomingManakPdf.get(message.id);
    if (entry) {
      entry.parts[Number(message.index) || 0] = message.chunk || "";
      const have = entry.parts.filter((part) => typeof part === "string").length;
      if (entry.total && have >= entry.total) {
        incomingManakPdf.delete(message.id);
        storePdfResult({
          ...entry.meta,
          pdfBase64: entry.parts.join(""),
        });
      }
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "QE_IS_CODE_FETCH") {
    const appTabId =
      sender && sender.tab && sender.tab.id && isAppTabUrl(sender.tab.url || "") ? sender.tab.id : 0;
    lastIsCodeAppTabId = appTabId || lastIsCodeAppTabId;
    const isNumber = String(message.isNumber || "").trim();
    const sites = Array.isArray(message.sites) ? message.sites : null;
    void runIsCodeFetch(appTabId, isNumber, sites)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "QE_MANAK_PRINT_PDF") {
    const tabId = sender && sender.tab && sender.tab.id;
    const meta = message.result || {};
    void printTabToPdf(tabId)
      .then((base64) => {
        if (base64) {
          storePdfResult({
            sampleId: meta.sampleId,
            sample_code: meta.sample_code,
            qr_code: meta.qr_code,
            pdfName: meta.pdfName || "Test_Request.pdf",
            pdfBase64: base64,
          });
        }
        sendResponse({
          ok: Boolean(base64),
          base64,
          name: meta.pdfName || "Test_Request.pdf",
        });
      })
      .catch(() => sendResponse({ ok: false, base64: "" }));
    return true;
  }
});

function notifyIsCodeApp(tabId, type, extra) {
  if (!tabId) return;
  void sendToAppTab(tabId, { type, ...(extra || {}) });
}

function waitTabComplete(tabId, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs || 40000);
    function onUpdated(id, info) {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timer);
        finish();
      }
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || tab?.status === "complete") {
        clearTimeout(timer);
        finish();
      }
    });
  });
}

async function injectIsFetch(tabId) {
  if (!chrome.scripting || !chrome.scripting.executeScript) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["captcha-assist.js", "is-code-fetch.js"],
    });
  } catch {
    /* page may already have the scripts */
  }
}

async function runPortalJob(appTabId, url, site, isNumber, creds) {
  if (site === "manuals") {
    notifyIsCodeApp(appTabId, "QE_IS_CODE_PROGRESS", {
      message: "Product Manual: reading the PDF in the extension (no computer download)…",
    });
    return fetchProductManualInBackground(isNumber);
  }
  notifyIsCodeApp(appTabId, "QE_IS_CODE_PROGRESS", {
    message: `Opening ${site}…`,
  });
  const needsCaptcha = site === "knowfees" || site === "bsbedge";
  const tab = await safeTabCreate({ url, active: true });
  if (!tab || !tab.id) return { fields: {}, files: [], notes: [`Could not open ${site}.`] };
  let res = null;
  try {
    await waitTabComplete(tab.id, 45000);
    await new Promise((r) => setTimeout(r, 2200));
    if (needsCaptcha && chrome.scripting && chrome.scripting.executeScript) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: "MAIN",
          func: () => {
            window.alert = function () {};
          },
        });
      } catch {
        /* Safari / older engines */
      }
    }
    for (let hop = 0; hop < 4; hop += 1) {
      res = null;
      for (let attempt = 0; attempt < 10 && !res; attempt += 1) {
        if (attempt === 2 || attempt === 6) await injectIsFetch(tab.id);
        res = await chrome.tabs.sendMessage(tab.id, {
          type: "QE_IS_CODE_RUN",
          site,
          isNumber,
          creds: creds || {},
        }).catch(() => null);
        if (!res) await new Promise((r) => setTimeout(r, 600));
      }
      const nextUrl = res && res.result && res.result.navigate;
      if (!nextUrl) break;
      notifyIsCodeApp(appTabId, "QE_IS_CODE_PROGRESS", {
        message: "Opening standard details…",
      });
      await safeTabUpdate(tab.id, { url: nextUrl });
      await waitTabComplete(tab.id, 45000);
      await new Promise((r) => setTimeout(r, 2200));
    }
    if (res && res.result) return res.result;
    if (res && res.error) return { fields: {}, files: [], notes: [`${site}: ${res.error}`] };
    return {
      fields: {},
      files: [],
      notes: [`${site}: no response. Reload QE Consultancy ${chrome.runtime.getManifest().version}.`],
    };
  } finally {
    const keep = Boolean(res && res.result && res.result.keepTab) || (needsCaptcha && !(res && res.result));
    if (!keep) void settle(chrome.tabs.remove(tab.id));
  }
}

function parseIsDoc(isNumber) {
  const match = String(isNumber || "").match(/(?:IS[\s/]*)?(\d{2,5})(?:\s*[:()\-]\s*(\d{4}))?/i);
  return {
    doc: match ? match[1] : String(isNumber || "").replace(/\D/g, ""),
    year: match && match[2] ? match[2] : "",
    display: match ? `IS ${match[1]}` : String(isNumber || "").trim(),
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

async function extractPmFromPdfBytes(bytes) {
  try {
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
          /* next */
        }
      }
      match = re.exec(raw);
    }
    const inflated = chunks.join("\n");
    const literals = [];
    const litRe = /\((?:\\.|[^\\)])+\)/g;
    let lit = litRe.exec(inflated);
    while (lit) {
      literals.push(lit[0].slice(1, -1).replace(/\\n/g, " ").replace(/\\(.)/g, "$1"));
      lit = litRe.exec(inflated);
    }
    return parseProductManualNumber(`${literals.join("")} ${inflated}`);
  } catch {
    return "";
  }
}

async function fetchProductManualInBackground(isNumber) {
  const is = parseIsDoc(isNumber);
  try {
    const res = await fetch(MANUALS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ searchTerm: is.doc }),
    });
    if (!res.ok) {
      return { fields: { is_number: is.display }, files: [], notes: ["Product Manual: list request failed."] };
    }
    const json = await res.json();
    const rows = Array.isArray(json && json.data) ? json.data : [];
    const exact = rows.find((row) =>
      new RegExp(`^IS\\s*${is.doc}(?:\\s*[:].*)?$`, "i").test(String(row.standardNumber || "").trim()),
    );
    const row = exact || rows.find((item) => new RegExp(`(?:^|\\s)IS\\s*${is.doc}(?!\\d)`, "i").test(item.standardNumber || ""));
    if (!row || !row.filename) {
      return { fields: { is_number: is.display }, files: [], notes: ["Product Manual: matching file not found."] };
    }
    const url = /^https?:/i.test(row.filename)
      ? row.filename
      : `${MANUALS_CDN}${String(row.filename).replace(/^\/+/, "")}`;
    const pdfRes = await fetch(url);
    if (!pdfRes.ok) {
      return { fields: { is_number: is.display }, files: [], notes: ["Product Manual: file fetch failed."] };
    }
    const buf = await pdfRes.arrayBuffer();
    if (buf.byteLength < 80) {
      return { fields: { is_number: is.display }, files: [], notes: ["Product Manual: empty file."] };
    }
    const bytes = new Uint8Array(buf);
    const pm = await extractPmFromPdfBytes(bytes);
    return {
      fields: {
        is_number: is.display,
        ...(pm ? { product_manual_number: pm } : {}),
      },
      files: [
        {
          name: `IS_${is.doc}_Product_Manual.pdf`,
          mime: "application/pdf",
          base64: arrayBufferToBase64(buf),
        },
      ],
      notes: pm
        ? [`Product Manual attached. PM Number ${pm} filled.`]
        : ["Product Manual attached to IS Code Related Files."],
    };
  } catch (error) {
    return {
      fields: { is_number: parseIsDoc(isNumber).display },
      files: [],
      notes: [`Product Manual: ${String(error && error.message ? error.message : error)}`],
    };
  }
}

function limsUrl(isNumber) {
  const match = String(isNumber || "").match(/(?:IS[\s/]*)?(\d{2,5})(?:\s*[:()\-]\s*(\d{4}))?/i);
  const doc = match ? match[1] : String(isNumber || "").replace(/\D/g, "");
  const year = match && match[2] ? match[2] : "";
  const q = new URL("https://lims.bis.gov.in/home/search_is_number/");
  q.searchParams.set("lab__lab_name__icontains", "");
  q.searchParams.set("is_number__doc_no", doc);
  q.searchParams.set("is_number__part", "");
  q.searchParams.set("is_number__section", "");
  q.searchParams.set("is_number__year", year);
  q.searchParams.set("is_title", "");
  return q.toString();
}

async function findConsultancyAppTabId() {
  const last = await getTab(lastIsCodeAppTabId);
  if (last && last.id && isAppTabUrl(last.url || "")) return last.id;
  try {
    const tabs = await chrome.tabs.query({});
    const hit = tabs.find((tab) => tab && tab.id && isAppTabUrl(tab.url || ""));
    return hit && hit.id ? hit.id : null;
  } catch {
    return null;
  }
}

async function runIsCodeFetch(appTabId, isNumber, onlySites) {
  if (!appTabId) appTabId = await findConsultancyAppTabId();
  lastIsCodeAppTabId = appTabId || lastIsCodeAppTabId;
  if (!isNumber) {
    notifyIsCodeApp(appTabId, "QE_IS_CODE_FILL", {
      payload: { notes: ["Type an IS Number first."] },
    });
    return;
  }
  const stored = await chrome.storage.local.get(["qeBsbedgeEmail", "qeBsbedgePassword"]);
  const creds = {
    email: String(stored.qeBsbedgeEmail || "").trim(),
    password: String(stored.qeBsbedgePassword || ""),
  };
  const merged = { fields: { is_number: parseIsDoc(isNumber).display }, files: [], notes: [] };
  const doc = parseIsDoc(isNumber).doc;
  const jobs = [
    [null, "manuals"],
    [
      `https://standards.bis.gov.in/website/know-your-standards?searchTerm=${encodeURIComponent(doc || isNumber)}`,
      "details",
    ],
    [limsUrl(isNumber), "lims"],
    ["https://www.manakonline.in/MANAK/knowfees", "knowfees"],
    ["https://standardsbis.bsbedge.com/BIS_Login", "bsbedge"],
  ].filter(([, site]) => !onlySites || onlySites.includes(site));
  isCodeFetchActive = true;
  try {
    for (const [url, site] of jobs) {
      notifyIsCodeApp(appTabId, "QE_IS_CODE_PROGRESS", {
        message:
          site === "manuals"
            ? "1/5 Product Manual: attaching the PDF and PM Number…"
            : site === "details"
              ? "2/5 Know Your Standards: revision year, reaffirmation, amendment, aspect, title…"
              : site === "lims"
                ? "3/5 LIMS: highest testing charges…"
                : site === "knowfees"
                  ? "4/5 Know Fees: type the captcha. Unit and marking fees follow."
                  : "5/5 BSB Edge: login first, then search, then the standard PDF.",
      });
      const part = await runPortalJob(appTabId, url, site, isNumber, creds);
      await new Promise((r) => setTimeout(r, 800));
      Object.assign(merged.fields, part.fields || {});
      merged.files.push(...(part.files || []));
      merged.notes.push(...(part.notes || []));
      notifyIsCodeApp(appTabId, "QE_IS_CODE_FILL", {
        payload: {
          fields: { ...merged.fields },
          files: part.files || [],
          notes: part.notes || [],
          partial: true,
          done: false,
        },
      });
    }
    notifyIsCodeApp(appTabId, "QE_IS_CODE_FILL", {
      payload: { fields: merged.fields, notes: merged.notes, done: true },
    });
  } finally {
    isCodeFetchActive = false;
  }
}

if (hasDownloads) {
  chrome.downloads.onCreated.addListener((item) => {
    const blob = `${item.url || ""} ${item.finalUrl || ""} ${item.filename || ""}`;
    if (isManakPdfDownload(item)) {
      void isManakTrCaptureActive().then((active) => {
        if (!active) return;
        askManakTabsForPdf(item.url || item.finalUrl || "", item.filename || "");
      });
      return;
    }
    if (!isCodeFetchActive) return;
    if (!/bsbedge|standards\.bis\.gov|product.manual|oraclecloud|bis\.gov\.in|manakonline/i.test(blob)) {
      return;
    }
    cancelBrowserDownload(item.id);
  });
  chrome.downloads.onChanged.addListener((delta) => {
    if (!delta.state || delta.state.current !== "complete") return;
    chrome.downloads.search({ id: delta.id }, async (items) => {
      const item = items && items[0];
      if (!item) return;
      const blob = `${item.url} ${item.finalUrl || ""} ${item.referrer || ""} ${item.filename || ""} ${item.mime || ""}`;
      if (pendingDownloadCapture && /pdf/i.test(blob)) {
        const wantedTab = pendingDownloadCapture.tabId;
        const sameTab = !wantedTab || item.tabId === wantedTab || /bsbedge|bis\.gov/i.test(blob);
        if (sameTab) {
          try {
            const res = await fetch(item.finalUrl || item.url, { credentials: "include" });
            const buf = await res.arrayBuffer();
            if (buf.byteLength >= 80) {
              const reply = pendingDownloadCapture.sendResponse;
              const wantedName =
                pendingDownloadCapture.wantedName ||
                (item.filename || "document.pdf").split(/[/\\]/).pop();
              clearTimeout(pendingDownloadCapture.timer);
              pendingDownloadCapture = null;
              reply({
                ok: true,
                name: wantedName,
                mime: item.mime || "application/pdf",
                base64: arrayBufferToBase64(buf),
              });
              try {
                await chrome.downloads.removeFile(item.id);
              } catch {
                /* ignore */
              }
              try {
                await chrome.downloads.erase({ id: item.id });
              } catch {
                /* ignore */
              }
              return;
            }
          } catch {
            /* fall through to Manak watcher */
          }
        }
      }
      if (!isManakPdfDownload(item)) return;
      // Manual Manak downloads (Test Report etc.) must stay intact when TR capture is OFF.
      if (!(await isManakTrCaptureActive())) return;
      askManakTabsForPdf(item.url || item.finalUrl || "", item.filename || "");
      let captured = false;
      try {
        const res = await fetch(item.finalUrl || item.url, { credentials: "include" });
        const buf = await res.arrayBuffer();
        const head = String.fromCharCode.apply(null, new Uint8Array(buf.slice(0, 5)));
        if (buf.byteLength >= 80 && head === "%PDF-") {
          storePdfResult({
            pdfName: (item.filename || "Test_Request.pdf").split(/[/\\]/).pop(),
            pdfBase64: arrayBufferToBase64(buf),
          });
          captured = true;
        }
      } catch {
        /* page-side capture is the fallback */
      }
      if (!captured) return;
      try {
        await chrome.downloads.removeFile(item.id);
      } catch {
        /* ignore */
      }
      try {
        await chrome.downloads.erase({ id: item.id });
      } catch {
        /* ignore */
      }
    });
  });
}
