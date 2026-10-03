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
const APP_TAB_URLS = [
  "http://localhost/*",
  "http://localhost:*/*",
  "http://127.0.0.1/*",
  "http://127.0.0.1:*/*",
  "http://localhost:3000/*",
  "https://qengineering.in/*",
  "https://www.qengineering.in/*",
  "https://*.qengineering.in/*",
  "https://*.up.railway.app/*",
  "https://*.railway.app/*",
  "https://consultancy-production-9720.up.railway.app/*",
  "https://frontend-production-ede6b.up.railway.app/*",
];
const APP_HOST_RE =
  /localhost|127\.0\.0\.1|qengineering\.in|railway\.app|consultancy-production|frontend-production/i;
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

function safeTabUpdate(tabId, props) {
  return settle(chrome.tabs.update(tabId, props));
}

function safeTabCreate(props) {
  return settle(chrome.tabs.create(props));
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
    ],
    (data) => {
      const importArmed = data && data.qeManakImportQr === true;
      const trArmed =
        data &&
        data.qeManakEnabled === true &&
        data.qeManakArmed === true &&
        Boolean(data.pendingFill);
      if (!importArmed && !trArmed) return;

      if (/ebislogin/i.test(url) || changeInfo.status === "complete") {
        const portal = (data && data.qeManakPortal) || {};
        const userId = lastPortal.userId || portal.userId || "";
        const password = lastPortal.password || portal.password || "";
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

async function injectPdfViaScript(tabId, result) {
  if (!tabId || !result.pdfBase64 || !chrome.scripting || !chrome.scripting.executeScript) return;
  const pdf = result.pdfBase64;
  const chunk = 80000;
  const total = Math.ceil(pdf.length / chunk) || 1;
  const injectId = `inj-${result.sampleId || "x"}-${result.filledAt || Date.now()}`;
  const meta = {
    kind: RESULT_KIND,
    sampleId: result.sampleId || "",
    sample_code: result.sample_code || "",
    qr_code: result.qr_code || "",
    pdfName: result.pdfName || "Test_Request.pdf",
    filledAt: result.filledAt || Date.now(),
  };
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (id, count, info) => {
        window.__qePdfInject = { id, total: count, meta: info, parts: [] };
      },
      args: [injectId, total, meta],
    });
    for (let i = 0; i < total; i += 1) {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (id, index, part) => {
          if (!window.__qePdfInject || window.__qePdfInject.id !== id) return;
          window.__qePdfInject.parts[index] = part;
        },
        args: [injectId, i, pdf.slice(i * chunk, (i + 1) * chunk)],
      });
    }
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (id) => {
        const bag = window.__qePdfInject;
        if (!bag || bag.id !== id) return;
        if (bag.parts.filter((part) => typeof part === "string").length !== bag.total) return;
        const payload = { ...bag.meta, pdfBase64: bag.parts.join("") };
        window.__qePdfInject = null;
        window.postMessage({ type: "QE_MANAK_RESULT", result: payload }, "*");
        window.dispatchEvent(new CustomEvent("qe-manak-sample-result", { detail: payload }));
      },
      args: [injectId],
    });
  } catch {
    /* tab may have closed */
  }
}

function deliverResultToTab(tabId, result) {
  if (!tabId) return;
  const pdf = result.pdfBase64 || "";
  const light = { ...result, pdfBase64: "" };
  void safeSendTab(tabId, { type: "QE_MANAK_RESULT", result: light });
  injectLightResult(tabId, light);
  if (!pdf) return;
  void injectPdfViaScript(tabId, result);
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
    void safeSendTab(tabId, {
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
  void safeSendTab(tabId, { type: "QE_MANAK_QR_IMPORT", result });
  if (!chrome.scripting || !chrome.scripting.executeScript) return;
  void settle(
    chrome.scripting.executeScript({
      target: { tabId },
      func: (payload) => {
        try {
          window.postMessage({ type: "QE_MANAK_QR_IMPORT", result: payload }, "*");
          window.dispatchEvent(new CustomEvent("qe-manak-qr-import", { detail: payload }));
        } catch {
          /* ignore */
        }
      },
      args: [result],
    }),
  );
}

function notifyQrImportToApp(result) {
  const seen = new Set();
  const send = (tabId) => {
    if (!tabId || seen.has(tabId)) return;
    seen.add(tabId);
    deliverQrImportToTab(tabId, result);
  };
  send(lastManakAppTabId || lastIsCodeAppTabId);
  chrome.tabs.query({}, (all) => {
    findAppTabIds(all).forEach(send);
  });
}

const STORE_CHUNK = 350000;

function rememberManakReturn(payload) {
  const returnUrl = String((payload && payload.returnUrl) || "").trim().replace(/\/$/, "");
  const returnToken = String((payload && payload.returnToken) || "").trim();
  if (!returnUrl || !returnToken) return;
  chrome.storage.local.set({
    qeManakReturn: {
      returnUrl,
      returnToken,
      sampleId: (payload && payload.sampleId) || "",
    },
  });
}

async function uploadPdfToAppInbox(result) {
  if (!result || !result.pdfBase64) return;
  let stored = {};
  try {
    stored = await chrome.storage.local.get(["pendingFill", "qeManakReturn"]);
  } catch {
    return;
  }
  const pending = (stored && stored.pendingFill) || {};
  const ret = (stored && stored.qeManakReturn) || {};
  const returnUrl = String(pending.returnUrl || ret.returnUrl || "").replace(/\/$/, "");
  const returnToken = String(pending.returnToken || ret.returnToken || "").trim();
  if (!returnUrl || !returnToken) return;
  const pdf = String(result.pdfBase64)
    .replace(/^data:application\/pdf;base64,/i, "")
    .replace(/\s+/g, "");
  if (!pdf) return;
  const chunkSize = 120000;
  const total = Math.ceil(pdf.length / chunkSize) || 1;
  try {
    for (let index = 0; index < total; index += 1) {
      const res = await fetch(`${returnUrl}/api/osl/manak-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "chunk",
          token: returnToken,
          index,
          total,
          chunk: pdf.slice(index * chunkSize, (index + 1) * chunkSize),
        }),
      });
      if (!res.ok) return;
    }
    await fetch(`${returnUrl}/api/osl/manak-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "finish",
        token: returnToken,
        pdfName: result.pdfName || "Test_Request.pdf",
        sample_code: result.sample_code || "",
        sampleId: result.sampleId || pending.sampleId || ret.sampleId || "",
      }),
    });
  } catch {
    /* app inbox unavailable */
  }
}

function persistManakResult(result) {
  const pdf = result.pdfBase64 || "";
  const light = { ...result, pdfBase64: "" };
  chrome.storage.local.get(null, (all) => {
    const stale = Object.keys(all || {}).filter((key) => /^manakPdf_\d+$/.test(key) || key === "manakPdfMeta");
    const writeChunks = () => {
      chrome.storage.local.set({ manakResult: light, manakPdfMeta: null }, () => {
        void chrome.runtime.lastError;
        if (!pdf) return;
        void uploadPdfToAppInbox({ ...result, pdfBase64: pdf });
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
    if (stale.length) chrome.storage.local.remove(stale, writeChunks);
    else writeChunks();
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
      Boolean(data.pendingFill)
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
let lastIsCodeAppTabId = 0;
let lastManakAppTabId = 0;
const fillSentAt = new Map();
const incomingManakPdf = new Map();

function rememberAppTab(tabId) {
  const id = Number(tabId) || 0;
  if (!id) return;
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

function isAppTabUrl(url) {
  return APP_HOST_RE.test(String(url || ""));
}

function findAppTabIds(tabs) {
  return (tabs || [])
    .filter((tab) => tab && tab.id && isAppTabUrl(tab.url || ""))
    .map((tab) => tab.id);
}

function injectLightResult(tabId, result) {
  if (!tabId || !chrome.scripting || !chrome.scripting.executeScript) return;
  const light = {
    kind: result.kind || RESULT_KIND,
    sampleId: result.sampleId || "",
    sample_code: result.sample_code || "",
    qr_code: result.qr_code || "",
    filledAt: result.filledAt || Date.now(),
    pdfName: result.pdfName || "",
    pdfBase64: "",
  };
  void settle(
    chrome.scripting.executeScript({
      target: { tabId },
      func: (payload) => {
        try {
          window.postMessage({ type: "QE_MANAK_RESULT", result: payload }, "*");
          window.dispatchEvent(new CustomEvent("qe-manak-sample-result", { detail: payload }));
        } catch {
          /* ignore */
        }
      },
      args: [light],
    }),
  );
}

function clearRememberedPortal() {
  lastPortal = { userId: "", password: "" };
}

function rememberPortal(userId, password) {
  lastPortal = {
    userId: String(userId || "").trim(),
    password: String(password || "").trim(),
  };
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
  [400, 900, 1600, 2800, 4500, 7000].forEach((ms) => setTimeout(tryFill, ms));
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

function ebisLoginHref(userId, password) {
  const id = String(userId || "").trim();
  const pwd = String(password || "").trim();
  if (!id && !pwd) return EBIS_LOGIN;
  try {
    const u = new URL(EBIS_LOGIN);
    if (id) u.searchParams.set("userId", id);
    if (pwd) u.searchParams.set("passwd", pwd);
    return u.toString();
  } catch {
    return EBIS_LOGIN;
  }
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
  const tabs = await queryManakTabs();
  let any = null;
  let pathGuess = null;
  for (const tab of tabs) {
    if (!tab.id) continue;
    const url = String(tab.url || tab.pendingUrl || "");
    const session = await tabSession(tab.id);
    if (session && session.loggedIn) {
      if (!any) any = { tab, session };
      continue;
    }
    // Guess only for real applicant pages — never /MANAK/login or eBISLogin.
    if (
      !pathGuess &&
      /manakonline\.in/i.test(url) &&
      !/ebislogin/i.test(url) &&
      !isManakApplicantLoginUrl(url)
    ) {
      pathGuess = {
        tab,
        session: {
          loggedIn: true,
          onTr: /testRequestGenerationForApplicant/i.test(url),
        },
      };
    }
  }
  return any || pathGuess;
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
    if (sender && sender.tab && sender.tab.id) rememberAppTab(sender.tab.id);
    sendResponse({ ok: true, extension: "QE Consultancy" });
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

  if (message.type === "QE_CAPTCHA_AI") {
    void (async () => {
      notifyIsCodeApp(lastIsCodeAppTabId, "QE_IS_CODE_PROGRESS", {
        message: "Grok / QE Assistant is reading the security image…",
      });
      const tabs = await chrome.tabs.query({ url: APP_TAB_URLS });
      const ordered = [
        ...tabs.filter((tab) => tab.id === lastIsCodeAppTabId),
        ...tabs.filter((tab) => tab.id !== lastIsCodeAppTabId),
      ];
      const requestId = message.requestId || `cap-${Date.now()}`;
      if (ordered.length === 0) {
        notifyIsCodeApp(lastIsCodeAppTabId, "QE_IS_CODE_PROGRESS", {
          message: "Open the Consultancy dashboard tab so Grok can read the security image.",
        });
        sendResponse({ text: "" });
        return;
      }
      for (const tab of ordered) {
        if (!tab.id) continue;
        const res = await chrome.tabs
          .sendMessage(tab.id, {
            type: "QE_CAPTCHA_AI",
            image: message.image || "",
            requestId,
          })
          .catch(() => null);
        if (res && res.text) {
          sendResponse({ text: String(res.text) });
          return;
        }
      }
      sendResponse({ text: "" });
    })();
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
    if (sender && sender.tab && sender.tab.id) {
      rememberAppTab(sender.tab.id);
    } else {
      chrome.tabs.query({}, (tabs) => {
        const appId = findAppTabIds(tabs)[0];
        if (appId) rememberAppTab(appId);
      });
    }
    const payload = message.payload || null;
    rememberManakReturn(payload);
    const portalUserId = String(message.portalUserId || payload?.portalUserId || "").trim();
    const portalPassword = String(message.portalPassword || payload?.portalPassword || "").trim();
    rememberPortal(portalUserId, portalPassword);
    const importQr = Boolean(message.importQr);
    const qrCount = Math.max(1, Math.min(50, Number(message.qrCount) || 1));
    const openKey = [
      message.loginOnly ? "login" : importQr ? "import-qr" : "tr",
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
    const ebisLoginUrl = ebisLoginHref(portalUserId, portalPassword);
    const loginUrl = importQr
      ? ebisLoginUrl
      : typeof message.loginUrl === "string" && message.loginUrl.trim()
        ? message.loginUrl.trim()
        : ebisLoginUrl;
    void (async () => {
      if (importQr) {
        // Import QR is independent of Manak Test Request Auto power.
        // Section enables after Login; never create Test Request.
        await chrome.storage.local.set({
          pendingFill: null,
          manakQrImport: null,
          qeManakImportQr: true,
          qeManakImportQrEnabled: false,
          qeManakImportQrLanded: false,
          qeManakQrCount: qrCount,
          qeManakArmed: true,
          qeManakHomeReady: false,
          qeManakImportQrTabId: 0,
          qeManakPortal: {
            userId: portalUserId,
            password: portalPassword,
          },
        });
        const reused = await findConfirmedLoggedInManakTab();
        if (reused && reused.tab.id) {
          await chrome.storage.local.set({
            qeManakImportQrEnabled: true,
            qeManakImportQrLanded: true,
            qeManakImportQrTabId: reused.tab.id,
            pendingFill: null,
          });
          await safeTabUpdate(reused.tab.id, { active: true, url: GENERATE_QR_URL });
          sendResponse({
            ok: true,
            message: "Already logged in. Import QR enabled — opening Not Used QR Codes…",
          });
          return;
        }
        const created = await safeTabCreate({ url: ebisLoginUrl });
        if (created && created.id) {
          await chrome.storage.local.set({ qeManakImportQrTabId: created.id });
          scheduleLoginFill(created.id, portalUserId, portalPassword);
        }
        sendResponse({
          ok: true,
          message:
            "Import QR armed. Opening eBIS login — captcha + Login, then Not Used QR import.",
        });
        return;
      }
      if (message.loginOnly) {
        // App-started login always turns Manak Test Request Auto flow ON.
        await chrome.storage.local.set({
          pendingFill: null,
          qeManakImportQr: false,
          qeManakEnabled: true,
          qeManakArmed: true,
          qeManakHomeReady: false,
          qeManakPortal: {
            userId: portalUserId,
            password: portalPassword,
          },
        });
        const created = await safeTabCreate({ url: loginUrl });
        if (created && created.id) {
          scheduleLoginFill(created.id, portalUserId, portalPassword);
        }
        sendResponse({
          ok: true,
          message: "Opening eBIS login. User ID / Password will be filled. Type captcha only.",
        });
        return;
      }
      // Generate Test Request from app — always re-enable Auto flow (even if last run turned it OFF).
      const reused = await findLoggedInManakTab();
      await chrome.storage.local.set({
        pendingFill: payload,
        manakResult: null,
        qeManakImportQr: false,
        qeManakEnabled: true,
        qeManakArmed: true,
        qeManakHomeReady: Boolean(reused),
        qeManakPortal: {
          userId: portalUserId,
          password: portalPassword,
        },
      });
      if (reused && reused.tab.id) {
        if (reused.session && reused.session.onTr) {
          await safeTabUpdate(reused.tab.id, { active: true });
          await safeSendTab(reused.tab.id, { type: "QE_MANAK_FILL", payload });
        } else {
          await safeTabUpdate(reused.tab.id, { active: true, url: TEST_REQUEST });
        }
        sendResponse({
          ok: true,
          message: "Manak Test Request ON. Already logged in — opening Test Request.",
        });
        return;
      }
      const created = await safeTabCreate({ url: loginUrl });
      if (created && created.id) {
        scheduleLoginFill(created.id, portalUserId, portalPassword);
      }
      sendResponse({
        ok: true,
        message:
          "Manak Test Request ON. Opening eBIS login — type captcha, then Test Request fills automatically.",
      });
    })();
    return true;
  }

  if ((message.type === "QE_MANAK_PDF" || message.type === "QE_MANAK_RESULT") && message.result) {
    storePdfResult(message.result);
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "QE_MANAK_QR_IMPORT" && message.result) {
    const result = { ...message.result, autoSave: true };
    const senderTabId = sender && sender.tab ? Number(sender.tab.id) || 0 : 0;
    chrome.storage.local.get(["qeManakImportQrTabId"], (stored) => {
      const tracked = Number((stored && stored.qeManakImportQrTabId) || 0) || 0;
      chrome.storage.local.set({
        manakQrImport: result,
        qeManakImportQr: false,
        qeManakImportQrEnabled: false,
        qeManakImportQrLanded: false,
        qeManakImportQrTabId: 0,
        pendingFill: null,
      });
      notifyQrImportToApp(result);
      const closeIds = new Set([senderTabId, tracked].filter(Boolean));
      if (message.closeTab || message.finishImport) {
        closeIds.forEach((id) => {
          void settle(chrome.tabs.remove(id)).catch(() => {});
        });
      }
    });
    sendResponse({ ok: true });
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
    const appTabId = sender && sender.tab && sender.tab.id;
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
  void safeSendTab(tabId, { type, ...(extra || {}) });
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
    return { fields: {}, files: [], notes: [`${site}: no response. Reload QE Consultancy 2.2.7.`] };
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
  if (lastIsCodeAppTabId) return lastIsCodeAppTabId;
  try {
    const tabs = await chrome.tabs.query({});
    const hit = tabs.find((tab) =>
      /localhost:\d+|qengineering\.in|consultancy-production|frontend-production|railway\.app/i.test(tab.url || ""),
    );
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
