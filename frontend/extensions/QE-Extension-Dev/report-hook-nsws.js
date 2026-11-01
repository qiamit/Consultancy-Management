// MAIN world on Manak eLIMS report pages (nsws.manakonline.in/eLIMS/…). Only while report-fetch-nsws.js has armed it
// (html[data-qe-capture-report="1"]): the "View Test Report" action is caught before it becomes a popup / download.
// It may open a URL, submit a form into a blank popup, or build a blob — in each case the PDF bytes are fetched with
// the page's own session and posted to the content script (window.postMessage, same origin).
(function () {
  if (window.__qeNswsReportHook) return;
  window.__qeNswsReportHook = true;

  const armed = () => document.documentElement.dataset.qeCaptureReport === "1";
  let popup = null;

  function post(message) {
    window.postMessage({ source: "qe-nsws-report", ...message }, location.origin);
  }

  async function deliver(response, how) {
    const buf = await response.arrayBuffer();
    const head = String.fromCharCode.apply(null, new Uint8Array(buf.slice(0, 5)));
    if (buf.byteLength >= 80 && head === "%PDF-") {
      document.documentElement.dataset.qeCaptureReport = "done";
      post({ type: "pdf", buf, how });
      try {
        if (popup && !popup.closed) popup.close();
      } catch {
        /* ignore */
      }
      return true;
    }
    post({ type: "miss", how, contentType: String(response.headers ? response.headers.get("content-type") : "") });
    return false;
  }

  function fetchUrl(url, init, how) {
    return fetch(url, { credentials: "include", ...(init || {}) })
      .then((res) => deliver(res, how))
      .catch((err) => post({ type: "miss", how, error: String(err && err.message ? err.message : err) }));
  }

  /** A form's request as fetch arguments (POST body or GET query). */
  function formRequest(form, submitter) {
    const data = new FormData(form, submitter || undefined);
    const method = String(form.getAttribute("method") || "GET").toUpperCase();
    const action = new URL(form.getAttribute("action") || location.href, location.href);
    if (method === "GET") {
      for (const [k, v] of data.entries()) action.searchParams.append(k, typeof v === "string" ? v : "");
      return [action.toString(), { method: "GET" }];
    }
    return [action.toString(), { method: "POST", body: new URLSearchParams([...data.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""])) }];
  }

  // window.open(url): fetch it instead. A blank popup (used as a form target) is allowed but closed afterwards.
  const nativeOpen = window.open;
  window.open = function (url, name, specs) {
    if (armed()) {
      const href = String(url || "");
      if (href && href !== "about:blank") {
        void fetchUrl(new URL(href, location.href).toString(), null, "window.open");
        return null;
      }
      popup = nativeOpen.call(window, url, name, specs);
      // The page may then send the blank popup to the report URL (popup.location = …): follow it and fetch that.
      const started = Date.now();
      const watch = window.setInterval(() => {
        let href = "";
        try {
          href = popup && !popup.closed ? String(popup.location.href) : "";
        } catch {
          href = "";
        }
        if (href && href !== "about:blank") {
          window.clearInterval(watch);
          void fetchUrl(href, null, "popup.location");
        } else if (!armed() || Date.now() - started > 15000) {
          window.clearInterval(watch);
        }
      }, 200);
      return popup;
    }
    return nativeOpen.call(window, url, name, specs);
  };

  // form.submit() and normal submits: send the same request with fetch.
  const nativeSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function () {
    if (armed()) {
      const [url, init] = formRequest(this);
      void fetchUrl(url, init, "form.submit");
      return;
    }
    return nativeSubmit.call(this);
  };
  document.addEventListener(
    "submit",
    (event) => {
      if (!armed()) return;
      event.preventDefault();
      const [url, init] = formRequest(event.target, event.submitter);
      void fetchUrl(url, init, "submit");
    },
    true,
  );

  // A PDF built in the page (XHR / fetch → blob → download link).
  const nativeCreate = URL.createObjectURL;
  URL.createObjectURL = function (obj) {
    if (armed() && obj instanceof Blob) {
      void deliver(new Response(obj), "blob");
    }
    return nativeCreate.call(URL, obj);
  };
})();
