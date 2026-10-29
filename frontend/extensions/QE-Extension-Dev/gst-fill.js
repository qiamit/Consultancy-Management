/* GST portal "Search Taxpayer": puts the GSTIN sent from the app (Client Master → Verify GST) into the GSTIN box.
   It only types the GSTIN; the captcha and the Search button stay with the user. */
(() => {
  const KEY = "qeGstSearch";
  const MAX_AGE_MS = 3 * 60 * 1000;
  const GSTIN = /^[0-9]{2}[A-Z0-9]{13}$/;

  function fill(input, gstin) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, gstin);
    ["input", "change", "keyup", "blur"].forEach((type) => input.dispatchEvent(new Event(type, { bubbles: true })));
    input.focus();
  }

  try {
    chrome.storage.local.get(KEY, (data) => {
      const request = data && data[KEY];
      if (!request || !GSTIN.test(String(request.gstin || "")) || Date.now() - Number(request.at || 0) > MAX_AGE_MS) return;
      chrome.storage.local.remove(KEY);
      let tries = 0;
      const timer = setInterval(() => {
        const input = document.getElementById("for_gstin");
        if (input || ++tries > 40) clearInterval(timer);
        if (input && !input.value.trim()) fill(input, request.gstin);
      }, 250);
    });
  } catch {
    /* extension context invalidated after Reload */
  }
})();
