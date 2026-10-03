const statusEl = document.getElementById("status");
const powerToggle = document.getElementById("powerToggle");
const powerLabel = document.getElementById("powerLabel");
const importQrToggle = document.getElementById("importQrToggle");
const importQrLabel = document.getElementById("importQrLabel");
const importQrStatus = document.getElementById("importQrStatus");
const enableBypass = document.getElementById("enableBypass");
const enableCtrlBypass = document.getElementById("enableCtrlBypass");
const fieldNameInput = document.getElementById("fieldName");
const fieldValueInput = document.getElementById("fieldValue");
const fillButton = document.getElementById("fillButton");

init();

function setStatus(message, isError) {
  statusEl.textContent = message || "";
  statusEl.classList.toggle("error", Boolean(isError && message));
}

function paintPower(on) {
  document.body.classList.toggle("off", !on);
  if (powerToggle) powerToggle.checked = on;
  if (powerLabel) {
    powerLabel.textContent = on
      ? "ON — login → Test Request → save back"
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
    "qeManakImportQrEnabled",
    "qeManakImportQr",
    "manakQrImport",
  ]);
  // Default OFF — only explicit true means Manak auto-flow is active.
  paintPower(data.qeManakEnabled === true);
  const waiting = data.qeManakImportQr === true && data.qeManakImportQrEnabled !== true;
  const on = data.qeManakImportQrEnabled === true;
  paintImportQr(on, waiting);
  paintImportQrLast(data.manakQrImport || null);
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
      await chrome.storage.local.set({
        qeManakEnabled: true,
        qeManakArmed: true,
      });
    } else {
      // Hard idle: clear every Manak auto flag so downloads / navigation stay normal.
      await chrome.storage.local.set({
        qeManakEnabled: false,
        qeManakArmed: false,
        pendingFill: null,
        qeManakHomeReady: false,
        qeManakPortal: null,
        qeManakImportQr: false,
        qeManakImportQrEnabled: false,
        qeManakImportQrLanded: false,
        qeManakImportQrTabId: 0,
      });
      chrome.runtime.sendMessage({ type: "QE_MANAK_IDLE" }, () => {
        void chrome.runtime.lastError;
      });
    }
    paintPower(next);
    setStatus(
      next
        ? "ON — Generate Test Request from Consultancy Pro (login → fill → PDF → Sample Code)."
        : "OFF — Manak pages work normally (Test Report download etc.). Auto Test Request paused.",
      false,
    );
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

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.manakQrImport) {
      paintImportQrLast(changes.manakQrImport.newValue || null);
    }
    if (
      changes.qeManakEnabled ||
      changes.qeManakArmed ||
      changes.qeManakImportQrEnabled ||
      changes.qeManakImportQr
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

  fillButton.addEventListener("click", () => {
    const fieldName = fieldNameInput.value.trim();
    const value = fieldValueInput.value;
    if (!fieldName) {
      setStatus("Enter a field name.", true);
      return;
    }
    chrome.runtime.sendMessage({ type: "RUN_BULK_FILL", fieldName, value }, (response) => {
      if (chrome.runtime.lastError) {
        setStatus(chrome.runtime.lastError.message, true);
        return;
      }
      if (!response || response.ok === false) {
        setStatus(response?.error || "Failed to fill fields.", true);
        return;
      }
      setStatus(`Updated ${response.updatedCount} field(s).`, false);
    });
  });
}
