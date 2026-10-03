const STORAGE_KEY = "copyPasteBypassEnabled";
const STORAGE_KEY_CTRL = "ctrlKeyBypassEnabled";
let bypassEnabled = true;
let ctrlKeyBypassEnabled = true;

const BLOCK_EVENTS = ["copy", "cut", "paste", "contextmenu", "beforeinput"];

const EDITABLE_SELECTOR = [
  "input:not([type='hidden']):not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='']",
  "[contenteditable='true']"
].join(",");

const INLINE_HANDLER_ATTRS = [
  "oncopy",
  "oncut",
  "onpaste",
  "oncontextmenu",
  "onbeforeinput",
  "ondrop",
  "onkeydown",
  "onkeypress"
];

init();

function init() {
  chrome.storage.sync
    .get([STORAGE_KEY, STORAGE_KEY_CTRL])
    .then((stored) => {
      bypassEnabled = stored[STORAGE_KEY] !== false;
      ctrlKeyBypassEnabled = stored[STORAGE_KEY_CTRL] !== false;
    })
    .catch(() => {
      bypassEnabled = true;
      ctrlKeyBypassEnabled = true;
    });

  installBypassListeners();
  relaxExistingEditableFields();
  observeDynamicFields();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string") {
      return;
    }

    if (message.type === "BYPASS_STATE_CHANGED") {
      bypassEnabled = Boolean(message.enabled);
      sendResponse({ ok: true, enabled: bypassEnabled });
      return;
    }

    if (message.type === "CTRL_BYPASS_STATE_CHANGED") {
      ctrlKeyBypassEnabled = Boolean(message.enabled);
      sendResponse({ ok: true, enabled: ctrlKeyBypassEnabled });
      return;
    }

    if (message.type === "RUN_BULK_FILL") {
      const result = runBulkFill(message.fieldName, message.value);
      sendResponse(result);
    }
  });
}

function installBypassListeners() {
  BLOCK_EVENTS.forEach((eventName) => {
    document.addEventListener(
      eventName,
      (event) => {
        if (!bypassEnabled) {
          return;
        }
        const target = event.target;
        if (!isEditableElement(target)) {
          return;
        }

        event.stopImmediatePropagation();
      },
      true
    );
  });

  document.addEventListener(
    "keydown",
    (event) => {
      if (!ctrlKeyBypassEnabled) {
        return;
      }
      const target = event.target;
      if (!isEditableElement(target)) {
        return;
      }
      const key = String(event.key || "").toLowerCase();
      const withModifier = event.ctrlKey || event.metaKey;
      if (!withModifier) {
        return;
      }
      if (key === "v" || key === "c" || key === "x" || key === "a") {
        event.stopImmediatePropagation();
      }
    },
    true
  );
}

function observeDynamicFields() {
  const observer = new MutationObserver((mutations) => {
    if (!bypassEnabled) {
      return;
    }
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) {
          return;
        }
        if (isEditableElement(node)) {
          relaxEditableElement(node);
        }
        node.querySelectorAll?.(EDITABLE_SELECTOR).forEach((el) => {
          if (el instanceof HTMLElement) {
            relaxEditableElement(el);
          }
        });
      });
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

function relaxExistingEditableFields() {
  document.querySelectorAll(EDITABLE_SELECTOR).forEach((el) => {
    if (el instanceof HTMLElement) {
      relaxEditableElement(el);
    }
  });
}

function relaxEditableElement(element) {
  INLINE_HANDLER_ATTRS.forEach((attr) => element.removeAttribute(attr));
  element.removeAttribute("data-disable-paste");
  element.removeAttribute("data-disable-copy");
}

function isEditableElement(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.matches(EDITABLE_SELECTOR) ||
    target.closest(EDITABLE_SELECTOR) instanceof HTMLElement
  );
}

function runBulkFill(fieldName, value) {
  const normalizedFieldName = normalize(fieldName);
  if (!normalizedFieldName) {
    return { ok: false, error: "Field name is required." };
  }

  const fields = getEditableFields();
  let updatedCount = 0;

  fields.forEach((field) => {
    if (!matchesField(field, normalizedFieldName)) {
      return;
    }
    setFieldValue(field, value);
    updatedCount += 1;
  });

  return { ok: true, updatedCount };
}

function getEditableFields() {
  const nodes = Array.from(document.querySelectorAll(EDITABLE_SELECTOR));
  return nodes.filter((node) => node instanceof HTMLElement);
}

function matchesField(element, normalizedFieldName) {
  const possibleNames = new Set();

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    possibleNames.add(normalize(element.name));
    possibleNames.add(normalize(element.id));
    possibleNames.add(normalize(element.placeholder));
  }

  if (element instanceof HTMLElement) {
    possibleNames.add(normalize(element.getAttribute("aria-label")));
  }

  getLabelTexts(element).forEach((text) => possibleNames.add(normalize(text)));

  for (const candidate of possibleNames) {
    if (!candidate) {
      continue;
    }
    if (candidate === normalizedFieldName || candidate.includes(normalizedFieldName)) {
      return true;
    }
  }

  return false;
}

function getLabelTexts(element) {
  const labels = [];
  if (!(element instanceof HTMLElement)) {
    return labels;
  }

  if (
    (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) &&
    element.labels
  ) {
    element.labels.forEach((label) => labels.push(label.textContent || ""));
  }

  const parentLabel = element.closest("label");
  if (parentLabel) {
    labels.push(parentLabel.textContent || "");
  }

  if ((element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && element.id) {
    const explicit = document.querySelectorAll(`label[for="${cssEscape(element.id)}"]`);
    explicit.forEach((label) => labels.push(label.textContent || ""));
  }

  return labels;
}

function setFieldValue(element, value) {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const valueSetter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(element),
      "value"
    )?.set;
    if (valueSetter) {
      valueSetter.call(element, value);
    } else {
      element.value = value;
    }
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  if (element.isContentEditable) {
    element.textContent = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function cssEscape(value) {
  if (window.CSS?.escape) {
    return window.CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}
