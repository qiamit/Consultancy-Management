/**
 * QE Consultancy — Manak "Apply for new licence" fill (New Application section).
 *
 * Armed by Manak Assist in Consultancy Pro (background: qeManakNewApp → after captcha sign-in
 * qeManakNewAppEnabled). Payload: chrome.storage.local.newAppFill (kind QE_MANAK_NEWAPP_V1,
 * built by frontend/web/src/features/bis/projects/manakNewAppPayload.ts).
 *
 * On each licence step page it fills what it can find, uploads stored files, adds table rows,
 * and shows a panel listing what it filled and what it could not find. It never clicks
 * Next / Submit / Proceed to Payment / Pay — the user reviews and moves on.
 */
(function () {
  if (window.__qeNewAppLoaded) return;
  window.__qeNewAppLoaded = true;

  const NEVER_CLICK = /proceed\s*to\s*pay|pay\s*(fee|now)?$|make\s*payment|final\s*submit|^submit$|next|save\s*&\s*next|delete|remove/i;
  const ADD_LABEL = /^\s*(\+\s*)?add(\s*(more|details|row|new))?\s*\+?\s*$/i;

  const norm = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  const low = (v) => norm(v).toLowerCase();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ───────── steps ───────── */

  // Markers: field names seen on the portal (docs/manak-new-application-audit.md) + visible headings.
  const STEPS = [
    { id: "preview", title: "Preview", text: /proceed\s*to\s*payment/i },
    { id: "general", title: "1 · General Information", names: [/^sitBISSelect$/, /^productVarities0$/, /^standardNumberTemp$/], text: /scheme\s*of\s*inspection/i },
    { id: "management", title: "2 · Management", names: [/^topManagementPersonName0$/], text: /top\s*management/i },
    // Test Reports and Declaration also mention raw material / packaging, so they are checked first.
    { id: "test-reports", title: "6 · Test Reports", names: [/^testDelayReason$/, /^longDurationTestsFlag$/], text: /test\s*report\s*(is\s*)?complete/i },
    { id: "declaration", title: "7 · Declaration", names: [/^appSubmittingPersonName$/, /^isWeeklyOff$/], text: /person\s*submitting/i },
    { id: "manufacturing", title: "3 · Manufacturing", names: [/^rawMaterial0$/, /^docId909$/, /^isOutsource$/], text: /raw\s*material/i },
    { id: "packaging", title: "4 · Packaging / Brand", names: [/^markingMethod$/, /^packagingNature$/], text: /method\s*of\s*marking/i },
    { id: "testing", title: "5 · Testing", names: [/^isInhouseTesting$/], text: /in[\s-]*house\s*testing/i },
  ];

  function visible(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  }

  function fields(root) {
    return Array.from((root || document).querySelectorAll("input, select, textarea")).filter(
      (el) => el.type !== "hidden" && !el.disabled && !el.readOnly,
    );
  }

  function detectStep() {
    const all = Array.from(document.querySelectorAll("input, select, textarea, button, a"));
    const nameBlob = all.map((el) => `${el.name || ""} ${el.id || ""}`).join(" ");
    const hasName = (re) => all.some((el) => re.test(el.name || "") || re.test(el.id || ""));
    const pageText = document.body ? document.body.innerText || "" : "";
    if (STEPS[0].text.test(pageText) && !fields().some((el) => el.type !== "checkbox" && visible(el))) return STEPS[0];
    for (const step of STEPS.slice(1)) {
      if ((step.names || []).some((re) => hasName(re))) return step;
    }
    for (const step of STEPS.slice(1)) {
      if (step.text && step.text.test(pageText) && fields().length > 0) return step;
    }
    return null;
  }

  /* ───────── finding fields ───────── */

  function labelTextFor(el) {
    const parts = [];
    if (el.id) {
      const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lab) parts.push(lab.innerText);
    }
    const wrap = el.closest("label");
    if (wrap) parts.push(wrap.innerText);
    if (el.getAttribute("aria-label")) parts.push(el.getAttribute("aria-label"));
    if (el.placeholder) parts.push(el.placeholder);
    // Table layouts: header cell of the same column, or the cell to the left.
    const td = el.closest("td, th");
    if (td) {
      const tr = td.parentElement;
      const prev = td.previousElementSibling;
      if (prev && !prev.querySelector("input, select, textarea")) parts.push(prev.innerText);
      const table = td.closest("table");
      if (table && tr) {
        const idx = Array.from(tr.children).indexOf(td);
        const head = table.querySelector("thead tr") || table.querySelector("tr");
        if (head && head !== tr && head.children[idx]) parts.push(head.children[idx].innerText);
      }
    }
    // Bootstrap form-group layouts: the nearest preceding label in the same group.
    const group = el.closest(".form-group, .col-md-3, .col-md-4, .col-md-6, .col-sm-6, .col-lg-4, .col-lg-3");
    if (group) {
      const lab = group.querySelector("label");
      if (lab) parts.push(lab.innerText);
    }
    return low(parts.join(" | "));
  }

  function nameBlobOf(el) {
    return `${el.name || ""} ${el.id || ""}`;
  }

  /** Section root: the smallest container under a heading that holds form fields. */
  function sectionRoot(headingRe) {
    if (!headingRe) return document;
    const heads = Array.from(
      document.querySelectorAll("h1, h2, h3, h4, h5, h6, legend, .card-header, .panel-heading, .box-title, th, b, strong, span, div, p, label"),
    ).filter((el) => {
      const t = norm(el.innerText);
      return t.length > 0 && t.length < 90 && headingRe.test(t) && visible(el);
    });
    for (const h of heads) {
      let node = h;
      for (let i = 0; i < 7 && node; i += 1) {
        node = node.parentElement;
        if (node && fields(node).length > 0) return node;
      }
    }
    return null;
  }

  function findField(spec, root) {
    const scope = root || document;
    const list = fields(scope).filter((el) => (spec.type === "file" ? el.type === "file" : el.type !== "file"));
    for (const re of spec.names || []) {
      // Exact patterns (^…$) must match the name or the id on its own, not "name id" together.
      const hit = list.find((el) => !el.__qeUsed && (re.test(el.name || "") || re.test(el.id || "") || re.test(nameBlobOf(el))));
      if (hit) return hit;
    }
    for (const re of spec.labels || []) {
      const hit = list.find((el) => re.test(labelTextFor(el)) && !el.__qeUsed);
      if (hit) return hit;
    }
    return null;
  }

  /* ───────── setting values ───────── */

  function nudgePage(el) {
    el.setAttribute("data-qe-newapp-changed", "1");
    document.dispatchEvent(new CustomEvent("qe-newapp-jq-change"));
  }

  function setText(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function toPortalDate(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(value || "");
  }

  function pickOption(select, value) {
    const want = low(value);
    if (!want) return null;
    const opts = Array.from(select.options).filter((o) => o.value !== "" && !/^-*\s*select/i.test(o.text));
    return (
      opts.find((o) => low(o.text) === want || low(o.value) === want) ||
      opts.find((o) => low(o.text).startsWith(want)) ||
      opts.find((o) => low(o.text).includes(want)) ||
      opts.find((o) => want.includes(low(o.text)) && low(o.text).length > 2) ||
      null
    );
  }

  /** Returns "filled" | "same" | "no-option". */
  function setValue(el, raw) {
    const value = el.type === "date" ? String(raw) : /date/i.test(nameBlobOf(el)) ? toPortalDate(raw) : String(raw);
    if (el.tagName === "SELECT") {
      if (el.multiple) {
        const wants = String(raw).split(/\s*[,;/+]\s*/).filter(Boolean);
        const picks = wants.map((w) => pickOption(el, w)).filter(Boolean);
        if (!picks.length) return "no-option";
        const before = Array.from(el.selectedOptions).map((o) => o.value).join("#");
        Array.from(el.options).forEach((o) => {
          o.selected = picks.includes(o);
        });
        if (Array.from(el.selectedOptions).map((o) => o.value).join("#") === before) return "same";
      } else {
        const o = pickOption(el, value);
        if (!o) return "no-option";
        if (el.value === o.value) return "same";
        el.value = o.value;
      }
      el.dispatchEvent(new Event("change", { bubbles: true }));
      nudgePage(el);
      return "filled";
    }
    if (el.type === "radio") {
      const group = el.name ? document.querySelectorAll(`input[type=radio][name="${CSS.escape(el.name)}"]`) : [el];
      const want = low(value);
      const hit = Array.from(group).find((r) => low(r.value) === want || labelTextFor(r).includes(want));
      if (!hit) return "no-option";
      if (hit.checked) return "same";
      hit.click();
      return "filled";
    }
    if (el.type === "checkbox") {
      const on = /^(yes|true|1|on|i agree)$/i.test(value);
      if (el.checked === on) return "same";
      el.click();
      return "filled";
    }
    if (norm(el.value) === norm(value)) return "same";
    setText(el, value);
    nudgePage(el);
    return "filled";
  }

  /* ───────── files ───────── */

  function fetchFile(file) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "QE_NEWAPP_FETCH_FILE", url: file.url }, (res) => {
          if (chrome.runtime.lastError || !res || !res.ok) {
            resolve({ error: (res && res.error) || "Download failed" });
            return;
          }
          const bin = atob(res.base64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
          resolve({ file: new File([bytes], file.fileName || "document.pdf", { type: file.mime || res.mime || "" }) });
        });
      } catch (error) {
        resolve({ error: String(error && error.message ? error.message : error) });
      }
    });
  }

  async function setFile(input, file) {
    if (input.files && input.files.length > 0) return "same";
    const got = await fetchFile(file);
    if (!got.file) return `error: ${got.error}`;
    const dt = new DataTransfer();
    dt.items.add(got.file);
    input.files = dt.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    nudgePage(input);
    return "filled";
  }

  /* ───────── rows ───────── */

  function pageHasValue(text) {
    const t = low(text);
    if (!t || t.length < 3) return false;
    // Text already listed in a table (saved rows), not just typed into an input.
    return Array.from(document.querySelectorAll("table td")).some(
      (td) => !td.querySelector("input, select, textarea") && low(td.innerText) === t,
    );
  }

  function findAddButton(root, nameRe) {
    const scope = root || document;
    const btns = Array.from(scope.querySelectorAll("button, input[type=button], a.btn, a[onclick], span.btn"))
      .filter(visible)
      .filter((b) => !NEVER_CLICK.test(norm(b.innerText || b.value)));
    if (nameRe) {
      const byName = btns.find((b) => nameRe.test(`${b.id || ""} ${b.name || ""} ${b.getAttribute("onclick") || ""}`));
      if (byName) return byName;
    }
    return btns.find((b) => ADD_LABEL.test(norm(b.innerText || b.value))) || null;
  }

  /* ───────── step plans ───────── */

  const FILE_SLOTS = {
    "own-sit": { names: [/sitApplicantFileUpload/i], labels: [/own\s*sit|scheme\s*of\s*inspection/i] },
    statutory: { names: [/^statutoryPermissionsFile$/], labels: [] },
    "auth-letter": { names: [/^authLetterFlagFile$/], labels: [] },
    "outsource-controls": { names: [/^docId930$/], labels: [/controls\s*being\s*exercised/i] },
    hygiene: { names: [/^docId316$/], labels: [/hygien/i] },
    "process-flow": { names: [/^docId909$/], labels: [/process\s*flow/i] },
    "plant-layout": { names: [/^docId203$/], labels: [/layout/i] },
    machinery: { names: [/^docId908$/], labels: [/machinery/i] },
    equipment: { names: [/^docId305$/], labels: [/testing\s*equipment|equipment\s*list/i] },
    label: { names: [/^formLabelFile$/], labels: [/form\s*of\s*label/i] },
    brand: { names: [/brandFile/i], labels: [/brand/i] },
    variety: { names: [/productVarit.*file|productVaritiesFile/i], labels: [/supporting\s*doc/i] },
    "staff-education": { names: [/qualification.*(file|doc)|education/i], labels: [/qualification\s*(doc|certificate|file)|education/i] },
    "staff-photo": { names: [/photo/i], labels: [/photo/i] },
    consent: { names: [/consent/i], labels: [/consent/i] },
  };

  function scalar(key, value, names, labels, extra) {
    return { kind: "field", key, value, names, labels, ...(extra || {}) };
  }

  function planFor(stepId, d) {
    const g = d.general || {};
    const m = d.management || {};
    const mf = d.manufacturing || {};
    const pk = d.packaging || {};
    const t = d.testing || {};
    const dc = d.declaration || {};
    const plan = [];
    const files = (slot) => (d.files || []).filter((f) => f.slot === slot);

    if (stepId === "general") {
      plan.push(scalar("SIT accepted", g.sitAccept, [/sitBISSelect/i], [/scheme\s*of\s*inspection|sit/i]));
      // "No" (Own SIT) reveals sitApplicantFileUpload — the app sends its generated CMPF-311 PDF.
      if (g.sitAccept === "No") {
        files("own-sit").forEach((f) => plan.push({ kind: "file", key: "Own SIT document", slot: "own-sit", file: f }));
      }
      // Manak renders variety row 0 (productVarities0 / productVaritiesFile0); "+" (addproductVarities())
      // appends the next blank row, so add first, then fill row i.
      (g.varieties || []).forEach((v, i) =>
        plan.push({
          kind: "indexed",
          key: `Variety ${i + 1}`,
          index: i,
          add: /addproductVarities/i,
          cells: [{ key: "Variety", value: v.name, idPrefix: "productVarities" }],
          files: files("variety")
            .filter((f) => f.row === i)
            .map((f) => ({ ...f, idPrefix: "productVaritiesFile" })),
        }),
      );
    }

    if (stepId === "management") {
      // ManagementDetails: numbered rows (…0, …1); "+" = addtopManagement() / addtechnicalManagement().
      (m.topManagement || []).forEach((r, i) =>
        plan.push({
          kind: "indexed",
          key: `Top management ${i + 1}`,
          index: i,
          add: /addtopManagement/i,
          cells: [
            { key: "Name", value: r.name, idPrefix: "topManagementPersonName" },
            { key: "Designation", value: r.designation, idPrefix: "topManagementPersonDesignation" },
            { key: "Contact", value: r.mobile, idPrefix: "topManagementPersonContactNumber" },
            { key: "Email", value: r.email, idPrefix: "topManagementPersonEmailId" },
            { key: "DIN", value: r.din, idPrefix: "topManagementPersonDIN" },
          ],
        }),
      );
      const c = m.correspondence || {};
      plan.push(scalar("Correspondence address", c.addressType, [/^correspondenceCommunication$/], []));
      plan.push(scalar("Correspondence contact person", c.name, [/^correspondencePersonName$/], []));
      plan.push(scalar("Correspondence designation", c.designation, [/^correspondencePersonDesignation$/], []));
      plan.push(scalar("Correspondence email", c.email, [/^correspondencePersonEmailId$/], []));
      plan.push(scalar("Correspondence contact number", c.mobile, [/^correspondencePersonContactNumber$/], []));
      (m.technicalStaff || []).forEach((r, i) =>
        plan.push({
          kind: "indexed",
          key: `Technical person ${i + 1}`,
          index: i,
          add: /addtechnicalManagement/i,
          cells: [
            { key: "Name", value: r.name, idPrefix: "technicalManagementPersonName" },
            { key: "Designation", value: r.designation, idPrefix: "technicalManagementPersonDesignation" },
            { key: "Qualification", value: r.qualification, idPrefix: "technicalManagementQualification" },
            { key: "Experience (years)", value: String(r.experienceYears || "").replace(/[^\d.]/g, ""), idPrefix: "technicalManagementExperiance" },
          ],
          files: [
            ...files("staff-education").filter((f) => f.row === i).map((f) => ({ ...f, idPrefix: "technicalManagementQualificationDocumentFile" })),
            ...files("staff-photo").filter((f) => f.row === i).map((f) => ({ ...f, idPrefix: "technicalManagementPersonPhoto" })),
          ],
        }),
      );
    }

    if (stepId === "manufacturing") {
      // ManufacturingProcess: numbered rows; "+" = addrawMaterial() (alerts "Enter Raw Material"
      // unless the last row is filled, so fill row i before adding row i+1).
      (mf.rawMaterials || []).forEach((r, i) =>
        plan.push({
          kind: "indexed",
          key: `Raw material ${i + 1}`,
          index: i,
          add: /addrawMaterial/i,
          cells: [
            { key: "Raw material / grade", value: r.rawMaterial, idPrefix: "rawMaterial" },
            { key: "Supplier", value: r.supplierName, idPrefix: "nameSupplier" },
            { key: "Conformity", value: r.conformity, idPrefix: "conformityMaterial" },
            { key: "Batches / nature of package", value: r.batches, idPrefix: "naturePackage" },
            { key: "Records maintained", value: r.recordsMaintained, idPrefix: "recordMaintained" },
          ],
        }),
      );
      plan.push(scalar("Outsourcing", mf.outsourcing, [/^isOutsource$/], []));
      plan.push(scalar("Hygienic conditions", mf.hygiene, [/^isHyygenicCondition$/, /hygien/i], []));
      plan.push(scalar("Production unit", mf.productionUnit, [/^unit$/], []));
      plan.push(scalar("Production value", mf.productionValue, [/^productionValue$/], []));
      plan.push(scalar("Installed capacity", mf.installedCapacity, [/^presentCapacity$/], []));
      ["process-flow", "plant-layout", "machinery", "outsource-controls", "hygiene"].forEach((slot) =>
        files(slot).forEach((f) => plan.push({ kind: "file", key: f.label || slot, slot, file: f })),
      );
    }

    if (stepId === "packaging") {
      // PackagingDetails: fixed ids; brand rows numbered (brandName0 …), "+" = addBrandDetails().
      plan.push(scalar("Nature of packaging", pk.natureOfPackaging, [/^packagingNature$/], []));
      plan.push(scalar("Quantity per package", pk.quantityPerPackage, [/^packageQuantity$/], []));
      plan.push(scalar("Marking on article", pk.markingOnArticle, [/^markingArticle$/], []));
      plan.push(scalar("Method of marking", pk.methodOfMarking, [/^markingMethod$/], []));
      // "Any Other" reveals markingMethodOther (markingMethodChange()).
      if (pk.methodOfMarkingOther) plan.push(scalar("Other method of marking", pk.methodOfMarkingOther, [/^markingMethodOther$/], []));
      plan.push(scalar("Batch / code scheme", pk.batchNumbering, [/^batchCode$/], []));
      files("label").forEach((f) => plan.push({ kind: "file", key: "Form of label", slot: "label", file: f }));
      (pk.brands || []).forEach((b, i) =>
        plan.push({
          kind: "indexed",
          key: `Brand ${i + 1}`,
          index: i,
          add: /addBrandDetails/i,
          cells: [
            { key: "Brand name", value: b.brandName, idPrefix: "brandName" },
            { key: "Owned by", value: b.ownedBy, idPrefix: "brandOwned" },
            { key: "Registered", value: b.registeredStatus, idPrefix: "brandRegister" },
            { key: "Date of registration / introduction", value: b.registrationDate, idPrefix: "brandRegisterDate" },
          ],
          files: files("brand")
            .filter((f) => f.row === i)
            .map((f) => ({ ...f, idPrefix: "brandFile" })),
        }),
      );
      plan.push(scalar("I agree (undertaking)", "Yes", [/^agree$/], [], { type: "checkbox" }));
    }

    if (stepId === "testing") {
      // TestingInspection: isInhouseTesting (isInhouseTestingChange). docId305 equipment .xlsx always;
      // No → numbered sub-contract rows (clauseNumber#, testSubContract#, labSubContract# = BIS lab list,
      // consentLetterFile#), "+" = addTestingInspectionDetails().
      plan.push(scalar("In-house testing", t.inHouse, [/^isInhouseTesting$/], []));
      // docId305 (equipment .xlsx) is required in both cases ("Upload List of Testing Equipment").
      files("equipment").forEach((f) => plan.push({ kind: "file", key: "Testing equipment list", slot: "equipment", file: f }));
      if (t.inHouse !== "Yes") {
        (t.subcontracted || []).forEach((r, i) =>
          plan.push({
            kind: "indexed",
            key: `Sub-contracted test ${i + 1}`,
            index: i,
            add: /addTestingInspectionDetails/i,
            cells: [
              { key: "IS clause", value: r.clauseNo, idPrefix: "clauseNumber" },
              { key: "Test", value: r.testName, idPrefix: "testSubContract" },
              { key: "BIS recognised lab", value: r.laboratoryName, optionValue: r.laboratoryCode, idPrefix: "labSubContract" },
            ],
            files: files("consent")
              .filter((f) => f.row === i)
              .map((f) => ({ ...f, idPrefix: "consentLetterFile" })),
          }),
        );
      }
    }

    if (stepId === "test-reports") {
      // TestReport: one input row (productVarirtyDescription, qrCode by value, testReportComplete,
      // conformitySample) + #addDetails (addDetail()) appends it to the table. Lab report is pulled by QR.
      (d.testReports || []).forEach((r, i) =>
        plan.push({
          kind: "report-row",
          key: `Test report ${i + 1}`,
          qr: r.qrCode,
          cells: [
            { key: "Variety", value: r.variety, id: "productVarirtyDescription" },
            { key: "QR code", value: r.qrCode, optionValue: r.qrCode, id: "qrCode", wait: 2500 },
            { key: "Test report complete", value: r.complete, id: "testReportComplete" },
            { key: "Conformity of sample", value: r.conformity, id: "conformitySample" },
          ],
        }),
      );
      const o = d.testReportOptions || {};
      plan.push(scalar("Long duration tests", o.longDuration, [/^longDurationTestsFlag$/], []));
      plan.push(scalar("Raw material conformity", o.rawMaterialReports, [/^rawMaterialOption\dFlag$/], []));
    }

    if (stepId === "declaration") {
      plan.push(scalar("Name of person submitting", dc.name, [/^appSubmittingPersonName$/], []));
      plan.push(scalar("Designation of person submitting", dc.designation, [/^appSubmittingPersonDesignation$/], []));
      const days = dc.weeklyOffDays || [];
      plan.push(scalar("Weekly off", days.length ? "Yes" : "No", [/^isWeeklyOff$/], []));
      // isWeeklyOff = Yes reveals the weeklyOffDays multi-select (select2).
      if (days.length) plan.push(scalar("Weekly off days", days.join(", "), [/^weeklyOffDays$/], []));
      // Declaration answers from the app's Step 7; "Yes" reveals each upload field.
      plan.push(scalar("Statutory permissions", dc.statutoryPermissions || "No", [/^statutoryPermissionsFlag$/], []));
      files("statutory").forEach((f) => plan.push({ kind: "file", key: "Statutory permissions file", slot: "statutory", file: f }));
      plan.push(scalar("Other information", dc.otherInformation || "No", [/^otherInformationFlag$/], []));
      plan.push(scalar("Other request for consideration", dc.otherRequest || "No", [/^otherRequirementFlag$/], []));
      plan.push(scalar("Authorization letter", dc.authorizationLetter || "No", [/^authLetterFlag$/], []));
      files("auth-letter").forEach((f) => plan.push({ kind: "file", key: "Authorization letter", slot: "auth-letter", file: f }));
      [["other-info", "otherInformationFile"], ["other-request", "otherRequirementFile"]].forEach(([slot, prefix]) =>
        files(slot).forEach((f) =>
          plan.push({ kind: "indexed", key: `${f.label || slot}`, index: f.row || 0, add: /a^/, cells: [], files: [{ ...f, idPrefix: prefix }] }),
        ),
      );
      plan.push(scalar("I agree (undertaking)", "Yes", [/^agree$/], [], { type: "checkbox" }));
    }
    return plan;
  }

  /* ───────── running a step ───────── */

  async function runCells(cells, root, report, prefix) {
    for (const cell of cells) {
      if (!norm(cell.value)) {
        report.empty.push(`${prefix}${cell.key}`);
        continue;
      }
      const el = findField(cell, root);
      if (!el) {
        report.missing.push(`${prefix}${cell.key}`);
        continue;
      }
      el.__qeUsed = true;
      const res = setValue(el, cell.value);
      if (res === "filled") report.filled.push(`${prefix}${cell.key}`);
      else if (res === "no-option") report.missing.push(`${prefix}${cell.key} (no option "${cell.value}")`);
      // A select change can reveal dependent fields — let the page react.
      if (el.tagName === "SELECT" && res === "filled") await sleep(400);
    }
  }

  async function runFiles(list, root, report, prefix) {
    for (const f of list || []) {
      const slot = FILE_SLOTS[f.slot] || {};
      const input = findField({ type: "file", names: slot.names, labels: slot.labels }, root || document);
      const name = `${prefix}${f.label || f.slot} file`;
      if (!input) {
        report.missing.push(name);
        continue;
      }
      input.__qeUsed = true;
      const res = await setFile(input, f);
      if (res === "filled") report.filled.push(name);
      else if (res !== "same") report.missing.push(`${name} (${res})`);
    }
  }

  function alertCapture(on) {
    const root = document.documentElement;
    if (on) {
      root.removeAttribute("data-qe-newapp-alert-log");
      root.setAttribute("data-qe-newapp-alerts", "1");
    } else {
      root.removeAttribute("data-qe-newapp-alerts");
    }
    document.dispatchEvent(new CustomEvent("qe-newapp-alerts"));
  }

  async function runStep(step, data) {
    alertCapture(true);
    try {
      const report = await runStepInner(step, data);
      // Change handlers that validate uploads may alert a moment later.
      await sleep(1500);
      const log = document.documentElement.getAttribute("data-qe-newapp-alert-log") || "";
      report.portal = log ? log.split("\n").filter(Boolean) : [];
      return report;
    } finally {
      alertCapture(false);
    }
  }

  const selectByHandler = (re) =>
    Array.from(document.querySelectorAll("select")).find((el) => re.test(el.getAttribute("onchange") || ""));

  /**
   * New application (GeneralInfoForm without a draft): Do you know IS = Yes, type the IS digits,
   * Search (searchStandardNumber()), pick the IS (selectStandardNumberChange) and the procedure
   * option (standardOptionValueChange). A draft opened for edit already has these, so this is a no-op.
   */
  async function selectStandardAndOption(g, report) {
    const temp = document.getElementById("standardNumberTemp");
    if (!temp) return;
    const know = document.getElementById("knowStandardNumber");
    if (know) setValue(know, "Yes");
    let isSel = selectByHandler(/selectStandardNumberChange/);
    const chosen = (el) => el && el.selectedIndex > 0 && el.value && el.value !== "0";
    if (!chosen(isSel)) {
      if (!g.isDigits) {
        report.missing.push("Indian Standard (no IS number in Consultancy Pro)");
        return;
      }
      if (norm(temp.value) !== g.isDigits) setText(temp, g.isDigits);
      const search = Array.from(document.querySelectorAll("button, input[type=button]")).find((b) =>
        /searchStandardNumber/.test(b.getAttribute("onclick") || ""),
      );
      if (!search) {
        report.missing.push("Indian Standard: Search button");
        return;
      }
      search.click();
      for (let i = 0; i < 25; i += 1) {
        await sleep(400);
        isSel = selectByHandler(/selectStandardNumberChange/);
        if (isSel && isSel.options.length > 1) break;
      }
      if (!isSel || isSel.options.length < 2) {
        report.missing.push(`Indian Standard: IS ${g.isDigits} not found on Manak`);
        return;
      }
      const want = low(g.isLabel).replace(/\s+/g, "");
      const options = Array.from(isSel.options).slice(1);
      const opt = options.find((o) => low(o.text).replace(/\s+/g, "").startsWith(want)) || (options.length === 1 ? options[0] : null);
      if (!opt) {
        report.missing.push(`Indian Standard: choose ${g.isLabel} yourself`);
        return;
      }
      isSel.value = opt.value;
      isSel.dispatchEvent(new Event("change", { bubbles: true }));
      nudgePage(isSel);
      report.filled.push(`Indian Standard (${norm(opt.text).slice(0, 40)})`);
      await sleep(1500);
    }
    let optSel = selectByHandler(/standardOptionValueChange/);
    for (let i = 0; i < 10 && !(optSel && optSel.options.length > 1); i += 1) {
      await sleep(400);
      optSel = selectByHandler(/standardOptionValueChange/);
    }
    if (optSel && !chosen(optSel)) {
      if (setValue(optSel, g.procedureOption || "Option 2") === "no-option") report.missing.push(`Select Option: ${g.procedureOption}`);
      else report.filled.push(`Select Option (${g.procedureOption})`);
      await sleep(1500);
    }
  }

  async function runStepInner(step, data) {
    document.querySelectorAll("input, select, textarea").forEach((el) => {
      el.__qeUsed = false;
    });
    const report = { filled: [], missing: [], empty: [], skipped: [] };
    if (step.id === "general") await selectStandardAndOption(data.general || {}, report);
    const plan = planFor(step.id, data);
    for (const item of plan) {
      if (item.kind === "field") {
        await runCells([item], document, report, "");
      } else if (item.kind === "file") {
        await runFiles([{ ...item.file, slot: item.slot }], document, report, "");
      } else if (item.kind === "group") {
        const root = sectionRoot(item.section) || document;
        await runCells(item.cells, root, report, `${item.key}: `);
      } else if (item.kind === "report-row") {
        const prefix = `${item.key}: `;
        if (item.qr && pageHasValue(item.qr)) {
          report.skipped.push(`${item.key} (QR already added)`);
          continue;
        }
        let ok = true;
        for (const cell of item.cells) {
          const el = document.getElementById(cell.id);
          if (!norm(cell.value)) {
            report.empty.push(`${prefix}${cell.key}`);
            ok = false;
            continue;
          }
          if (!el) {
            report.missing.push(`${prefix}${cell.key}`);
            ok = false;
            continue;
          }
          let res;
          const byValue = cell.optionValue && Array.from(el.options || []).find((o) => o.value === cell.optionValue || norm(o.text) === cell.optionValue);
          if (byValue) {
            el.value = byValue.value;
            el.dispatchEvent(new Event("change", { bubbles: true }));
            nudgePage(el);
            res = "filled";
          } else {
            res = setValue(el, cell.value);
          }
          if (res === "no-option") {
            report.missing.push(`${prefix}${cell.key} (no option "${cell.value}")`);
            ok = false;
          } else report.filled.push(`${prefix}${cell.key}`);
          await sleep(cell.wait || 500);
        }
        const add = document.getElementById("addDetails");
        if (ok && add) {
          add.click();
          report.filled.push(`${prefix}Add clicked`);
          await sleep(2000);
        } else if (!ok) {
          report.missing.push(`${prefix}not added — complete the row in Consultancy Pro (conformity, QR)`);
        }
      } else if (item.kind === "indexed") {
        const i = item.index;
        const prefix = `${item.key}: `;
        if (item.cells.length && !document.getElementById(`${item.cells[0].idPrefix}${i}`)) {
          const add = Array.from(document.querySelectorAll("[onclick]")).find((e) => item.add.test(e.getAttribute("onclick") || ""));
          if (add) {
            add.click();
            await sleep(900);
          }
        }
        for (const cell of item.cells) {
          const el = document.getElementById(`${cell.idPrefix}${i}`);
          if (!norm(cell.value)) report.empty.push(`${prefix}${cell.key}`);
          else if (!el) report.missing.push(`${prefix}${cell.key}`);
          else if (cell.optionValue && el.tagName === "SELECT" && Array.from(el.options).some((o) => o.value === cell.optionValue)) {
            // Exact option by code (e.g. lab OSL code) — names are ambiguous on Manak.
            if (el.value !== cell.optionValue) {
              el.value = cell.optionValue;
              el.dispatchEvent(new Event("change", { bubbles: true }));
              nudgePage(el);
              report.filled.push(`${prefix}${cell.key}`);
            }
          } else {
            const res = setValue(el, cell.value);
            if (res === "filled") report.filled.push(`${prefix}${cell.key}`);
            else if (res === "no-option") report.missing.push(`${prefix}${cell.key} (no option "${cell.value}")`);
          }
        }
        for (const f of item.files || []) {
          const el = document.getElementById(`${f.idPrefix}${i}`);
          if (!el) {
            report.missing.push(`${prefix}${f.label || "file"}`);
            continue;
          }
          const res = await setFile(el, f);
          if (res === "filled") report.filled.push(`${prefix}${f.label || "file"}`);
          else if (res !== "same") report.missing.push(`${prefix}${f.label || "file"} (${res})`);
        }
      } else if (item.kind === "row") {
        if (item.id && pageHasValue(item.id)) {
          report.skipped.push(`${item.key} (already listed)`);
          continue;
        }
        const root = sectionRoot(item.section) || document;
        await runCells(item.cells, root, report, `${item.key}: `);
        await runFiles(item.files, root, report, `${item.key}: `);
        const add = findAddButton(root, item.add);
        if (add) {
          add.click();
          report.filled.push(`${item.key}: Add clicked`);
          await sleep(1200);
          document.querySelectorAll("input, select, textarea").forEach((el) => {
            el.__qeUsed = false;
          });
        } else {
          report.missing.push(`${item.key}: Add button`);
        }
      }
    }
    return report;
  }

  /* ───────── panel ───────── */

  let panelHost = null;

  function panel() {
    if (panelHost && panelHost.isConnected) return panelHost.shadowRoot;
    panelHost = document.createElement("div");
    panelHost.id = "qe-newapp-panel";
    panelHost.style.cssText = "position:fixed;right:14px;bottom:14px;z-index:2147483646;";
    const root = panelHost.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        .box{width:340px;max-height:60vh;overflow:auto;background:#fffaf0;border:2px solid #b45309;
          font:12px/1.4 system-ui,sans-serif;color:#1c1917;box-shadow:0 6px 24px rgba(0,0,0,.25)}
        .hd{background:#292524;color:#fcd34d;padding:6px 10px;font-weight:700;display:flex;justify-content:space-between;align-items:center}
        .bd{padding:8px 10px}
        .row{display:flex;gap:6px;margin-top:8px}
        button{font:600 12px system-ui;border:1px solid #92400e;background:#fff;color:#92400e;padding:4px 8px;cursor:pointer}
        button.pri{background:#b45309;color:#fff}
        ul{margin:4px 0 6px 16px;padding:0}
        .ok{color:#166534}.miss{color:#b91c1c}.mut{color:#57534e}
        .x{background:none;border:0;color:#fcd34d;font-size:16px;padding:0 4px}
      </style>
      <div class="box">
        <div class="hd"><span id="t">QE · New Application</span><button class="x" id="min" title="Hide">–</button></div>
        <div class="bd" id="b"></div>
      </div>`;
    root.getElementById("min").addEventListener("click", () => {
      const b = root.getElementById("b");
      b.style.display = b.style.display === "none" ? "" : "none";
    });
    (document.body || document.documentElement).appendChild(panelHost);
    return root;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }

  function renderPanel(data, step, report, busy) {
    const root = panel();
    root.getElementById("t").textContent = `QE · New Application${data.firmName ? ` · ${data.firmName}` : ""}`;
    const list = (items, cls) => (items.length ? `<ul class="${cls}">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "");
    let html = `<div class="mut">${esc(data.isNumber || "")}${data.applicationNumber ? ` · App ${esc(data.applicationNumber)}` : ""}</div>`;
    if (!step) {
      html += `<p>${report && report.note ? esc(report.note) : "Opening Draft Applications / Apply for new licence for this IS…"}</p>`;
    } else if (step.id === "preview") {
      html += `<p><b>Preview reached — New Application is now OFF.</b> Check every row and file on this page, then click <b>Proceed to Payment</b> yourself. The extension never pays or submits.</p>`;
    } else if (busy) {
      html += `<p><b>${esc(step.title)}</b> — filling…</p>`;
    } else if (report) {
      html += `<p><b>${esc(step.title)}</b> — ${report.filled.length} filled, ${report.missing.length} not found.</p>`;
      html += list(report.filled, "ok");
      if (report.portal && report.portal.length) html += `<div class="miss">Manak said:</div>${list(report.portal, "miss")}`;
      if (report.missing.length) html += `<div class="miss">Not found / needs you:</div>${list(report.missing, "miss")}`;
      if (report.skipped.length) html += `<div class="mut">Already on page:</div>${list(report.skipped, "mut")}`;
      if (report.empty.length) html += `<div class="mut">No data in Consultancy Pro:</div>${list(report.empty, "mut")}`;
      if (step.id === "manufacturing" || step.id === "testing" || step.id === "packaging") {
        const miss = (data.missingFiles || []).filter((f) => f.step === step.id);
        if (miss.length) html += `<div class="miss">Upload yourself (not stored as a file):</div>${list(miss.map((f) => f.label), "miss")}`;
      }
      html += report.advancing
        ? `<p class="ok"><b>Step complete — clicking Next…</b></p>`
        : `<p class="miss"><b>Stopped on this step.</b> Fix the items above, then click <b>Next</b> on the portal — the next step fills automatically.</p>`;
    }
    html += `<div class="row">${step && step.id !== "preview" ? '<button class="pri" id="again">Fill this step again</button>' : ""}<button id="copy" title="Copies this page's field names and labels (no values) to paste to Claude">Copy fields for Claude</button><button id="off">Turn OFF</button></div><div class="mut" id="copied"></div>`;
    root.getElementById("b").innerHTML = html;
    root.getElementById("copy").addEventListener("click", () => {
      const text = fieldDump(step);
      const done = (ok) => {
        root.getElementById("copied").textContent = ok
          ? "Copied — paste it to Claude."
          : "Could not copy — select the text below and copy it.";
      };
      navigator.clipboard.writeText(text).then(
        () => done(true),
        () => {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.cssText = "width:100%;height:120px;font:11px monospace";
          root.getElementById("copied").after(ta);
          ta.select();
          done(false);
        },
      );
    });
    const again = root.getElementById("again");
    if (again) again.addEventListener("click", () => void run(true));
    root.getElementById("off").addEventListener("click", () => {
      chrome.storage.local.set({ qeManakNewApp: false, qeManakNewAppEnabled: false, newAppFill: null, newAppLog: null });
      if (panelHost) panelHost.remove();
    });
  }

  /** Page structure for tuning the field map: names, ids, labels, options, buttons — never typed values. */
  function fieldDump(step) {
    const cut = (v, n) => norm(v).slice(0, n || 80);
    const out = {
      page: location.pathname,
      step: step ? step.id : "unknown",
      headings: Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, legend, .card-header, .panel-heading"))
        .filter(visible)
        .map((h) => cut(h.innerText, 60))
        .filter(Boolean)
        .slice(0, 40),
      fields: Array.from(document.querySelectorAll("input, select, textarea"))
        .filter((el) => el.type !== "hidden" && (visible(el) || el.type === "file"))
        .map((el) => {
          const f = { tag: el.tagName.toLowerCase(), type: el.type || "", name: el.name || "", id: el.id || "", label: cut(labelTextFor(el), 120) };
          if (el.tagName === "SELECT") f.options = Array.from(el.options).slice(0, 25).map((o) => cut(o.text, 50));
          if (el.type === "radio" || el.type === "checkbox") f.value = cut(el.value, 30);
          if (el.disabled || el.readOnly) f.locked = true;
          return f;
        })
        .slice(0, 250),
      buttons: Array.from(document.querySelectorAll("button, input[type=button], input[type=submit], a.btn"))
        .filter(visible)
        .map((b) => ({ text: cut(b.innerText || b.value, 40), id: b.id || "", onclick: cut(b.getAttribute("onclick") || "", 60) }))
        .filter((b) => b.text || b.id)
        .slice(0, 80),
    };
    return `QE-MANAK-FIELDS ${JSON.stringify(out)}`;
  }

  function signedIn() {
    if (/ebislogin/i.test(location.pathname)) return false;
    // After sign-in Manak's home is /MANAK/login too — a Logout link and no password box means signed in.
    const pass = document.querySelector("input[type='password']");
    const passVisible = pass && pass.getBoundingClientRect().width > 0;
    return Boolean(document.querySelector("a[href*='logout' i]")) && !passVisible;
  }

  /* ───────── main ───────── */

  let running = false;
  let finished = false;

  const NAV_KEY = "qeNewAppNavCount";

  function navBudget() {
    const n = Number(sessionStorage.getItem(NAV_KEY) || "0");
    if (n >= 6) return false;
    sessionStorage.setItem(NAV_KEY, String(n + 1));
    return true;
  }

  /** Edit (pencil) control in a draft row — never the delete (bin) icon. null when unsure. */
  function draftEditControl(row) {
    const blob = (el) =>
      [el.getAttribute("onclick"), el.getAttribute("href"), String(el.className || ""), el.title, el.getAttribute("alt"), el.getAttribute("src"), el.id]
        .filter(Boolean)
        .join(" ");
    const hits = Array.from(row.querySelectorAll("a, button, i, span, img")).filter((el) => {
      const b = blob(el);
      return /edit|pencil|update|modify/i.test(b) && !/delet|remov|trash|bin\b|cancel/i.test(b);
    });
    // Prefer the clickable wrapper (a / button) over an inner icon.
    const clickable = hits.find((el) => el.tagName === "A" || el.tagName === "BUTTON") || hits[0];
    return clickable || null;
  }

  /**
   * Signed in but not on a licence step: Draft list → open this IS's draft (edit), else
   * Product Certification → Apply for new licence. Returns a panel message.
   */
  function autoNavigate(data) {
    const path = location.pathname;
    const isKey = low((data.general && data.general.isLabel) || data.isNumber || "").replace(/\s+/g, "");
    if (/ApplicantPCSaveAsDraft/i.test(path)) {
      const rows = Array.from(document.querySelectorAll("table tbody tr")).filter((tr) =>
        low(tr.innerText).replace(/\s+/g, "").includes(isKey),
      );
      if (rows.length > 1) return "More than one draft for this IS — open the right one (edit) yourself.";
      if (rows.length === 1) {
        const edit = draftEditControl(rows[0]);
        if (!edit) return "Found the draft for this IS — click its edit (pencil) icon.";
        if (!navBudget()) return "Stopped automatic navigation — open the draft yourself.";
        edit.click();
        return "Opening the existing draft…";
      }
      sessionStorage.setItem("qeNewAppWantNew", "1");
      if (!navBudget()) return "Stopped automatic navigation — open Apply for new licence yourself.";
      location.href = "/MANAK/ApplicantPC";
      return "No draft for this IS — opening Apply for new licence…";
    }
    if (/ApplicantPC$/i.test(path) || /\/ApplicantPC\b/i.test(path)) {
      if (sessionStorage.getItem("qeNewAppWantNew") === "1") {
        const apply = Array.from(document.querySelectorAll("a")).find((a) => /apply\s*for\s*new\s*licen/i.test(a.innerText || ""));
        if (!apply) return "Click Apply for new licence.";
        if (!navBudget()) return "Stopped automatic navigation — click Apply for new licence yourself.";
        sessionStorage.removeItem("qeNewAppWantNew");
        apply.click();
        return "Opening Apply for new licence…";
      }
      if (!navBudget()) return "Stopped automatic navigation — open Draft Applications yourself.";
      location.href = "/MANAK/ApplicantPCSaveAsDraft";
      return "Checking Draft Applications for this IS…";
    }
    if (/\/login$|\/home|dashboard/i.test(path)) {
      if (!navBudget()) return "Stopped automatic navigation — open Product Certification yourself.";
      location.href = "/MANAK/ApplicantPC";
      return "Opening Product Certification…";
    }
    return "";
  }

  /** Click the step's Next and watch for a Manak validation message (page stays) or a new page. */
  function autoNext(data, step, report) {
    const next = document.getElementById("next") || document.getElementById("save");
    if (!next || !/nextfunction|submit/i.test(next.getAttribute("onclick") || "")) {
      report.missing.push("Next button");
      renderPanel(data, step, report, false);
      return;
    }
    alertCapture(true);
    renderPanel(data, step, { ...report, advancing: true }, false);
    next.click();
    // A successful Next navigates (this script is gone); still here = Manak refused.
    setTimeout(() => {
      const log = document.documentElement.getAttribute("data-qe-newapp-alert-log") || "";
      alertCapture(false);
      report.portal = log ? log.split("\n").filter(Boolean) : ["Manak did not move to the next step."];
      report.stopped = true;
      renderPanel(data, step, report, false);
    }, 15000);
  }

  async function finishAtPreview(data) {
    finished = true;
    renderPanel(data, { id: "preview", title: "Preview" }, null, false);
    // Done: switch New Application OFF and leave the application for review.
    await chrome.storage.local.set({
      qeManakNewApp: false,
      qeManakNewAppEnabled: false,
      newAppFill: null,
      newAppLog: { step: "preview", message: "Reached Preview — New Application turned OFF for review", at: Date.now() },
    });
    chrome.runtime.sendMessage({ type: "QE_MANAK_IDLE" }, () => void chrome.runtime.lastError);
  }

  async function run(force) {
    if (running || finished) return;
    if (/ebislogin/i.test(location.pathname)) return;
    // Test Request / QR / Test Sample pages belong to the other sections — never fill them here.
    if (/testRequest|QrCode|TestSample|knowfees/i.test(location.pathname)) {
      if (panelHost) panelHost.remove();
      return;
    }
    const store = await chrome.storage.local.get(["qeManakNewApp", "qeManakNewAppEnabled", "newAppFill"]);
    // Armed from Manak Assist while already signed in (no captcha round): any non-login Manak
    // page with a logged-in session means sign-in is done.
    if (store.qeManakNewApp === true && store.qeManakNewAppEnabled !== true && store.newAppFill && signedIn()) {
      await chrome.storage.local.set({ qeManakNewAppEnabled: true });
      store.qeManakNewAppEnabled = true;
    }
    if (store.qeManakNewAppEnabled !== true || !store.newAppFill) {
      if (panelHost) panelHost.remove();
      return;
    }
    const data = store.newAppFill;
    const step = detectStep();
    if (step && step.id === "preview") {
      await finishAtPreview(data);
      return;
    }
    if (!step) {
      const note = signedIn() ? autoNavigate(data) : "";
      renderPanel(data, null, note ? { note } : null, false);
      return;
    }
    sessionStorage.removeItem(NAV_KEY);
    const key = `qeNewAppDone|${location.pathname}|${step.id}`;
    if (!force && sessionStorage.getItem(key) === "1") {
      renderPanel(data, step, window.__qeNewAppLastReport || null, false);
      return;
    }
    running = true;
    renderPanel(data, step, null, true);
    try {
      const report = await runStep(step, data);
      window.__qeNewAppLastReport = report;
      sessionStorage.setItem(key, "1");
      chrome.storage.local.set({
        newAppLog: {
          step: step.id,
          message: `${step.title}: ${report.filled.length} filled, ${report.missing.length} not found`,
          missing: report.missing,
          at: Date.now(),
        },
      });
      // Clean step → Next automatically. Anything missing or a Manak message → stop for the user.
      if (!force && report.missing.length === 0 && !(report.portal && report.portal.length)) {
        autoNext(data, step, report);
      } else {
        report.stopped = true;
        renderPanel(data, step, report, false);
      }
    } finally {
      running = false;
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "QE_NEWAPP_REFRESH") void run(false);
    if (msg.type === "QE_MANAK_IDLE" && panelHost) panelHost.remove();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.qeManakNewAppEnabled || changes.newAppFill) void run(false);
  });

  // Steps render after page scripts; give them a moment.
  setTimeout(() => void run(false), 1500);
})();
