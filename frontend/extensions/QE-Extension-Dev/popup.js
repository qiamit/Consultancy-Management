const statusEl = document.getElementById("status");
const powerToggle = document.getElementById("powerToggle");
const powerLabel = document.getElementById("powerLabel");
const importQrToggle = document.getElementById("importQrToggle");
const importQrLabel = document.getElementById("importQrLabel");
const importQrStatus = document.getElementById("importQrStatus");
const newAppToggle = document.getElementById("newAppToggle");
const newAppLabel = document.getElementById("newAppLabel");
const newAppStatus = document.getElementById("newAppStatus");
const inclusionToggle = document.getElementById("inclusionToggle");
const inclusionLabel = document.getElementById("inclusionLabel");
const inclusionStatus = document.getElementById("inclusionStatus");
const renewalToggle = document.getElementById("renewalToggle");
const renewalStatus = document.getElementById("renewalStatus");
const enableBypass = document.getElementById("enableBypass");
const enableCtrlBypass = document.getElementById("enableCtrlBypass");

init();

function setStatus(message, isError) {
  statusEl.textContent = message || "";
  statusEl.classList.toggle("error", Boolean(isError && message));
}

/** A Test Request armed by Consultancy Pro for one sample (login-only / empty never counts). */
function hasTrSample(pending) {
  return Boolean(
    pending &&
      typeof pending === "object" &&
      pending.kind === "QE_MANAK_TR_V1" &&
      String(pending.sampleId || "").trim(),
  );
}

/** "IS 1234 · QR 123456789012" — which sample the armed Test Request is for. */
function describeTrSample(pending) {
  if (!hasTrSample(pending)) return "";
  const sample = pending.sample || {};
  const app = pending.application || {};
  const parts = [];
  if (app.isSearch) parts.push(`IS ${app.isSearch}`);
  const code = String(sample.sample_code || "").trim();
  const qr = String(sample.qr_code || "").trim();
  if (code) parts.push(`Sample ${code}`);
  else if (qr) parts.push(`QR ${qr}`);
  const variety = String(sample.grade_type_variety || sample.sample_description || "").trim();
  if (variety) parts.push(variety);
  return parts.join(" · ") || `Sample ${String(pending.sampleId).slice(0, 8)}`;
}

function paintPower(on, pending) {
  document.body.classList.toggle("off", !on);
  if (powerToggle) powerToggle.checked = on;
  if (powerLabel) {
    const armed = describeTrSample(pending);
    powerLabel.textContent = on
      ? `ON — Test Request${armed ? ` for ${armed}` : ""} → save back`
      : armed
        ? `OFF — armed sample: ${armed}`
        : "OFF — Manak site works normally (auto-ON only from 🧪)";
  }
}

function paintImportQr(on, waiting) {
  document.body.classList.toggle("import-qr-off", !on && !waiting);
  document.body.classList.toggle("import-qr-wait", Boolean(waiting));
  if (importQrToggle) {
    importQrToggle.checked = on;
    importQrToggle.disabled = Boolean(waiting);
  }
  if (importQrLabel) {
    if (waiting) {
      importQrLabel.textContent = "Waiting for Manak Login… then Not Used QR import";
    } else if (on) {
      importQrLabel.textContent = "ON — collecting 12-digit Not Used QR Codes";
    } else {
      importQrLabel.textContent = "OFF — Import QR idle (enables after Login)";
    }
  }
}

function paintNewApp(on, waiting, fill, log) {
  document.body.classList.toggle("new-app-off", !on && !waiting);
  document.body.classList.toggle("new-app-wait", Boolean(waiting));
  if (newAppToggle) {
    newAppToggle.checked = on || Boolean(waiting);
    // Turning ON needs a project from Manak Assist; the switch here only turns it OFF.
    newAppToggle.disabled = !on && !waiting;
  }
  if (newAppLabel) {
    const who = fill && fill.firmName ? ` — ${fill.firmName}` : "";
    newAppLabel.textContent = waiting
      ? `Waiting for Manak Login…${who}`
      : on
        ? `ON — filling licence steps${who}`
        : "OFF — starts from Manak Assist in Consultancy Pro";
  }
  if (newAppStatus) {
    newAppStatus.textContent =
      (on || waiting) && log && log.message ? `Last step: ${log.message}` : "";
  }
}

function paintInclusion(on, waiting, fill, log) {
  document.body.classList.toggle("inclusion-off", !on && !waiting);
  if (inclusionToggle) {
    inclusionToggle.checked = on || Boolean(waiting);
    // Turning ON needs a licence from Manak Assist; the switch here only turns it OFF.
    inclusionToggle.disabled = !on && !waiting;
  }
  if (inclusionLabel) {
    const who = fill && fill.firmName ? ` — ${fill.firmName}` : "";
    inclusionLabel.textContent = waiting
      ? `Waiting for Manak Login…${who}`
      : on
        ? `ON — filling Change in Scope (Inclusion)${who}`
        : "OFF — starts from Manak Assist on BIS New Inclusion";
  }
  if (inclusionStatus) {
    inclusionStatus.textContent = log && log.message ? `Inclusion: ${log.message}` : "";
  }
}

function paintRenewal(on, waiting, fill) {
  document.body.classList.toggle("renewal-off", !on && !waiting);
  if (renewalToggle) {
    renewalToggle.checked = on || Boolean(waiting);
    // Turning ON needs a licence from Manak Assist; the switch here only turns it OFF.
    renewalToggle.disabled = !on && !waiting;
  }
  if (renewalStatus) {
    const who = fill && fill.firmName ? ` — ${fill.firmName}` : "";
    renewalStatus.textContent = waiting
      ? `Renewal: waiting for Manak Login…${who}`
      : on
        ? `Renewal ON${who}`
        : "";
  }
}

function paintImportQrLast(result) {
  if (!importQrStatus) return;
  const codes = Array.isArray(result?.qr_codes) ? result.qr_codes.filter(Boolean) : [];
  if (!codes.length) {
    importQrStatus.textContent = "Last import: none yet. Only 12-digit Not Used Codes.";
    return;
  }
  const preview = codes.slice(0, 4).join(", ");
  const more = codes.length > 4 ? ` (+${codes.length - 4} more)` : "";
  importQrStatus.textContent = `Last import: ${codes.length} code(s) — ${preview}${more}`;
}

async function loadPower() {
  const data = await chrome.storage.local.get([
    "qeManakEnabled",
    "pendingFill",
    "qeManakImportQrEnabled",
    "qeManakImportQr",
    "manakQrImport",
    "qeManakNewApp",
    "qeManakNewAppEnabled",
    "newAppFill",
    "newAppLog",
    "qeManakInclusion",
    "qeManakInclusionEnabled",
    "inclusionFill",
    "inclusionLog",
    "qeManakRenewal",
    "qeManakRenewalEnabled",
    "renewalFill",
  ]);
  // Default OFF — only explicit true means Manak auto-flow is active.
  paintPower(data.qeManakEnabled === true && hasTrSample(data.pendingFill), data.pendingFill || null);
  const waiting = data.qeManakImportQr === true && data.qeManakImportQrEnabled !== true;
  const on = data.qeManakImportQrEnabled === true;
  paintImportQr(on, waiting);
  paintImportQrLast(data.manakQrImport || null);
  paintNewApp(
    data.qeManakNewAppEnabled === true,
    data.qeManakNewApp === true && data.qeManakNewAppEnabled !== true,
    data.newAppFill || null,
    data.newAppLog || null,
  );
  paintInclusion(
    data.qeManakInclusionEnabled === true,
    data.qeManakInclusion === true && data.qeManakInclusionEnabled !== true,
    data.inclusionFill || null,
    data.inclusionLog || null,
  );
  paintRenewal(
    data.qeManakRenewalEnabled === true,
    data.qeManakRenewal === true && data.qeManakRenewalEnabled !== true,
    data.renewalFill || null,
  );
}

function init() {
  void loadPower();

  chrome.runtime.sendMessage({ type: "GET_BYPASS_STATE" }, (response) => {
    if (chrome.runtime.lastError) {
      setStatus("Failed to load extension state.", true);
      return;
    }
    enableBypass.checked = response?.enabled !== false;
    enableCtrlBypass.checked = response?.ctrlKeyEnabled !== false;
  });

  powerToggle.addEventListener("change", async () => {
    const next = powerToggle.checked;
    if (next) {
      // Test Request runs only for a sample sent from Consultancy Pro — never armed empty
      // (an empty run would capture every later Manak PDF download).
      const { pendingFill } = await chrome.storage.local.get(["pendingFill"]);
      if (!hasTrSample(pendingFill)) {
        paintPower(false, null);
        setStatus("No Test Request sample is armed. Start Generate Test Request (🧪) on a sample in Consultancy Pro.", true);
        return;
      }
      await chrome.storage.local.set({
        qeManakEnabled: true,
        qeManakArmed: true,
      });
      paintPower(true, pendingFill);
      setStatus(`ON — Test Request for ${describeTrSample(pendingFill)} (login → fill → PDF → Sample Code).`, false);
      return;
    }
    // Hard idle: clear every Manak auto flag so downloads / navigation stay normal.
    const all = await chrome.storage.local.get(null);
    const pdfKeys = Object.keys(all || {}).filter((key) => /^manakPdf_\d+$/.test(key));
    if (pdfKeys.length) await chrome.storage.local.remove(pdfKeys);
    await chrome.storage.local.set({
      qeManakEnabled: false,
      qeManakArmed: false,
      pendingFill: null,
      qeManakTrTabId: 0,
      qeManakReturn: null,
      manakResult: null,
      manakPdfMeta: null,
      qeManakHomeReady: false,
      qeManakPortal: null,
      qeManakImportQr: false,
      qeManakImportQrEnabled: false,
      qeManakImportQrLanded: false,
      qeManakImportQrTabId: 0,
      qeManakNewApp: false,
      qeManakNewAppEnabled: false,
      newAppFill: null,
      newAppLog: null,
      qeManakInclusion: false,
      qeManakInclusionEnabled: false,
      inclusionFill: null,
      qeManakRenewal: false,
      qeManakRenewalEnabled: false,
      renewalFill: null,
      renewalStage: null,
    });
    chrome.runtime.sendMessage({ type: "QE_MANAK_IDLE" }, () => {
      void chrome.runtime.lastError;
    });
    paintPower(false, null);
    setStatus("OFF — Manak pages work normally (Test Report download etc.). Auto Test Request paused.", false);
  });

  importQrToggle.addEventListener("change", async () => {
    const next = importQrToggle.checked;
    if (next) {
      await chrome.storage.local.set({ qeManakImportQrEnabled: true });
    } else {
      // Turning Import OFF must also disarm — otherwise redirects / scrape keep running.
      await chrome.storage.local.set({
        qeManakImportQrEnabled: false,
        qeManakImportQr: false,
        qeManakImportQrLanded: false,
        qeManakImportQrTabId: 0,
        manakQrImport: null,
      });
      chrome.runtime.sendMessage({ type: "QE_MANAK_IDLE" }, () => {
        void chrome.runtime.lastError;
      });
    }
    paintImportQr(next, false);
    setStatus(
      next
        ? "Import QR ON — collecting Not Used codes when armed."
        : "Import QR OFF — Manak QR page works normally.",
      false,
    );
  });

  newAppToggle.addEventListener("change", async () => {
    if (newAppToggle.checked) return;
    await chrome.storage.local.set({
      qeManakNewApp: false,
      qeManakNewAppEnabled: false,
      newAppFill: null,
      newAppLog: null,
    });
    chrome.runtime.sendMessage({ type: "QE_MANAK_IDLE" }, () => {
      void chrome.runtime.lastError;
    });
    void loadPower();
    setStatus("New Application OFF — Manak pages work normally.", false);
  });

  inclusionToggle.addEventListener("change", async () => {
    if (inclusionToggle.checked) return;
    await chrome.storage.local.set({
      qeManakInclusion: false,
      qeManakInclusionEnabled: false,
      inclusionFill: null,
    });
    chrome.runtime.sendMessage({ type: "QE_MANAK_IDLE" }, () => {
      void chrome.runtime.lastError;
    });
    void loadPower();
    setStatus("Inclusion OFF — Manak pages work normally.", false);
  });

  renewalToggle.addEventListener("change", async () => {
    if (renewalToggle.checked) return;
    await chrome.storage.local.set({
      qeManakRenewal: false,
      qeManakRenewalEnabled: false,
      renewalFill: null,
      renewalStage: null,
    });
    chrome.runtime.sendMessage({ type: "QE_MANAK_IDLE" }, () => {
      void chrome.runtime.lastError;
    });
    void loadPower();
    setStatus("Renewal OFF — Manak pages work normally.", false);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.manakQrImport) {
      paintImportQrLast(changes.manakQrImport.newValue || null);
    }
    if (
      changes.qeManakEnabled ||
      changes.pendingFill ||
      changes.qeManakArmed ||
      changes.qeManakImportQrEnabled ||
      changes.qeManakImportQr ||
      changes.qeManakNewApp ||
      changes.qeManakNewAppEnabled ||
      changes.newAppLog ||
      changes.qeManakInclusion ||
      changes.qeManakInclusionEnabled ||
      changes.inclusionLog ||
      changes.qeManakRenewal ||
      changes.qeManakRenewalEnabled
    ) {
      void loadPower();
    }
  });

  enableBypass.addEventListener("change", () => {
    const enabled = enableBypass.checked;
    chrome.runtime.sendMessage({ type: "SET_BYPASS_STATE", enabled }, (response) => {
      if (chrome.runtime.lastError) {
        setStatus(`Failed to update: ${chrome.runtime.lastError.message}`, true);
        return;
      }
      if (response?.ok === false) {
        setStatus(`Failed to update: ${response.error}`, true);
        return;
      }
      setStatus(enabled ? "Copy / paste bypass enabled." : "Copy / paste bypass disabled.", false);
    });
  });

  enableCtrlBypass.addEventListener("change", () => {
    const enabled = enableCtrlBypass.checked;
    chrome.runtime.sendMessage({ type: "SET_CTRL_BYPASS_STATE", enabled }, (response) => {
      if (chrome.runtime.lastError) {
        setStatus(`Failed to update shortcuts: ${chrome.runtime.lastError.message}`, true);
        return;
      }
      if (response?.ok === false) {
        setStatus(`Failed to update: ${response.error}`, true);
        return;
      }
      setStatus(enabled ? "Shortcut bypass enabled." : "Shortcut bypass disabled.", false);
    });
  });
}
