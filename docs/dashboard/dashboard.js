// Renders docs/dashboard/data.json. A classic script on purpose: browsers refuse module scripts on file://.
// The functions below are pure (data in, plain objects or DOM nodes out) and are exported on
// globalThis.EvergreenDashboard so tests can run them in Node. Data is only ever written with createTextNode or
// setAttribute on values this file checked; data is never parsed as markup.
(function (root) {
  "use strict";

  const SCHEMA = "evergreen.dashboard-data.v1";
  const BLOB_URL = "https://github.com/arminazimi/evergreen/blob/main/";
  const PUBLISHED_URL = "https://arminazimi.github.io/evergreen/dashboard/";
  const NOT_MEASURED = "not measured";
  const LEVEL_RANK = { experimental: 0, beta: 1, stable: 2 };
  const STALE_AFTER_DAYS = 14;

  const COLUMNS = [
    "level",
    "earnedLevel",
    "precision",
    "recall",
    "truePositives",
    "falsePositives",
    "falseNegatives",
    "repositoriesWithFindings",
    "expectedFindings",
    "zeroFindingRepositories",
  ];
  const EVIDENCE_COLUMNS = ["repositoriesWithFindings", "expectedFindings", "zeroFindingRepositories"];

  const isKey = (value) => typeof value === "string" && /^[A-Za-z][A-Za-z0-9]*$/.test(value);
  const isRepositoryPath = (value) =>
    typeof value === "string" &&
    /^[A-Za-z0-9._\-/]+$/.test(value) &&
    value.split("/").every((part) => part !== "" && part !== "." && part !== "..");

  /** A GitHub blob URL on main for a repository path, or null when the path is not a plain repository path. */
  function sourceUrl(path) {
    return isRepositoryPath(path) ? BLOB_URL + path : null;
  }

  /** The id of a definition on this page, or null for anything that is not a plain metric key. */
  function definitionAnchor(key) {
    return isKey(key) ? "def-" + key : null;
  }

  const isSafeHref = (href) =>
    typeof href === "string" && (href.startsWith(BLOB_URL) || href === PUBLISHED_URL || /^#def-[A-Za-z][A-Za-z0-9]*$/.test(href));

  /** A ratio as four decimals, or "not measured" for null, a missing value, or anything that is not a finite number. */
  function formatRatio(value) {
    return typeof value === "number" && Number.isFinite(value) ? value.toFixed(4) : NOT_MEASURED;
  }

  /** A count as a whole number, or "not measured" for null or anything that is not a non-negative integer. */
  function formatCount(value) {
    return Number.isInteger(value) && value >= 0 ? String(value) : NOT_MEASURED;
  }

  const formatMilliseconds = (value) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? value + " ms" : NOT_MEASURED;

  const daysText = (days) => days + (days === 1 ? " day" : " days");

  /** The run age recorded in data.json, or null when it is missing or not a whole number of days. */
  function runAgeDays(run) {
    const age = run && typeof run === "object" ? run.runAgeDays : undefined;
    return Number.isInteger(age) && age >= 0 ? age : null;
  }

  /** Whether the recorded age is past the 14-day limit. The data file decides, never the visitor's clock. */
  function isStale(run) {
    const age = runAgeDays(run);
    return age !== null && age > STALE_AFTER_DAYS;
  }

  /** Days from the run date to the visitor's calendar day, or null when either date cannot be read. */
  function visitorAgeDays(run, now) {
    if (!run || typeof run.date !== "string" || !now || typeof now.getTime !== "function" || !Number.isFinite(now.getTime())) {
      return null;
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(run.date);
    if (!match) return null;
    const runTime = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (new Date(runTime).toISOString().slice(0, 10) !== run.date) return null;
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((today - runTime) / 86_400_000);
    return days >= 0 ? days : null;
  }

  /** Everything the run section says about age: the data file's age, and the visitor's clock as extra text only. */
  function runStatus(data, now) {
    const run = data && typeof data.run === "object" ? data.run : null;
    const ageDays = runAgeDays(run);
    return {
      stale: ageDays !== null && ageDays > STALE_AFTER_DAYS,
      ageDays,
      runDate: run && typeof run.date === "string" ? run.date : null,
      referenceDay: data && typeof data.referenceDay === "string" ? data.referenceDay : null,
      visitorAgeDays: visitorAgeDays(run, now),
      staleAfterDays: STALE_AFTER_DAYS,
    };
  }

  /** True when the configured level is higher than the level the counted evidence earns. Unknown levels are never "above". */
  function isAboveEvidence(level, earnedLevel) {
    return (
      Object.hasOwn(LEVEL_RANK, level) && Object.hasOwn(LEVEL_RANK, earnedLevel) && LEVEL_RANK[level] > LEVEL_RANK[earnedLevel]
    );
  }

  const ABOVE_EVIDENCE_NOTE = "above the counted evidence, kept by decision 0013";

  /** Why the data cannot be shown, or null when it has the shape this page reads. */
  function validateData(data) {
    if (data === null || typeof data !== "object") return "data.json is not an object.";
    if (data.schemaVersion !== SCHEMA) return "data.json has schemaVersion " + JSON.stringify(data.schemaVersion) + ", this page reads " + SCHEMA + ".";
    if (!Array.isArray(data.detectors)) return "data.json has no detectors list.";
    if (data.definitions === null || typeof data.definitions !== "object") return "data.json has no definitions.";
    if (!Array.isArray(data.limitations)) return "data.json has no limitations list.";
    return null;
  }

  const textOf = (value) => (typeof value === "string" ? value : value === undefined || value === null ? "" : String(value));

  /** The run metadata as label/value pairs. Missing values read "not measured". */
  function runFacts(run) {
    if (run === null || typeof run !== "object") return [];
    const timing = run.timing && typeof run.timing === "object" ? run.timing : {};
    return [
      { label: "Run date", value: textOf(run.date) || NOT_MEASURED },
      { label: "Commit", value: textOf(run.commit) || NOT_MEASURED },
      { label: "Repositories", value: formatCount(run.repositories) },
      { label: "Findings", value: formatCount(run.findings) },
      { label: "Run age", value: runAgeDays(run) === null ? NOT_MEASURED : daysText(runAgeDays(run)), definition: "runAge" },
      { label: "Median scan time", value: formatMilliseconds(timing.medianScanMs) },
      { label: "p95 scan time", value: formatMilliseconds(timing.p95ScanMs) },
    ];
  }

  /** One table row: the detector id and a cell per column, each with its text and an optional note and note link. */
  function rowModel(detector, sources) {
    const run = detector.run && typeof detector.run === "object" ? detector.run : null;
    const evidence = detector.evidence && typeof detector.evidence === "object" ? detector.evidence : {};
    const floor = detector.precisionFloor && typeof detector.precisionFloor === "object" ? detector.precisionFloor : null;
    const cells = COLUMNS.map((key) => {
      const cell = { key, text: NOT_MEASURED };
      if (key === "level") {
        cell.text = textOf(detector.level) || NOT_MEASURED;
        if (isAboveEvidence(detector.level, detector.earnedLevel)) {
          cell.note = ABOVE_EVIDENCE_NOTE;
          cell.noteHref = sourceUrl(sources && sources.decision);
          cell.flag = "above-evidence";
        }
      } else if (key === "earnedLevel") {
        cell.text = textOf(detector.earnedLevel) || NOT_MEASURED;
      } else if (key === "precision") {
        cell.text = formatRatio(run && run.precision);
        if (floor && typeof floor.value === "number") {
          cell.note = "floor " + floor.value + (floor.enforced ? ", enforced" : ", not enforced");
          cell.noteHref = "#" + definitionAnchor("precisionFloor");
        }
      } else if (key === "recall") {
        cell.text = formatRatio(run && run.recall);
      } else if (EVIDENCE_COLUMNS.includes(key)) {
        cell.text = formatCount(evidence[key]);
      } else {
        cell.text = formatCount(run && run[key]);
      }
      return cell;
    });
    return { id: textOf(detector.id), cells };
  }

  function element(doc, tag, attributes, children) {
    const node = doc.createElement(tag);
    for (const name of Object.keys(attributes || {})) node.setAttribute(name, attributes[name]);
    for (const child of children || []) node.appendChild(typeof child === "string" ? doc.createTextNode(child) : child);
    return node;
  }

  /** A link when the href is one this page builds, plain text otherwise. */
  function link(doc, text, href, label) {
    if (!isSafeHref(href)) return element(doc, "span", {}, [text]);
    const attributes = { href };
    if (label) attributes["aria-label"] = label;
    return element(doc, "a", attributes, [text]);
  }

  function definitionOf(data, key) {
    const definition = data.definitions[key];
    return definition && typeof definition === "object" ? definition : null;
  }

  function headerCell(doc, data, key) {
    const definition = definitionOf(data, key);
    const label = (definition && textOf(definition.label)) || key;
    const parts = [element(doc, "span", { class: "metric" }, [label])];
    if (definition) {
      const anchor = definitionAnchor(key);
      const links = [];
      if (anchor) links.push(link(doc, "definition", "#" + anchor, "Definition of " + label));
      const source = sourceUrl(definition.source);
      if (source) links.push(link(doc, "source", source, "Source file of " + label + ": " + textOf(definition.source)));
      const items = [];
      links.forEach((item, index) => {
        if (index > 0) items.push(" ");
        items.push(item);
      });
      parts.push(element(doc, "span", { class: "metric-links" }, items));
    }
    return element(doc, "th", { scope: "col" }, parts);
  }

  /** The per-detector table. */
  function buildTable(doc, data) {
    const head = element(doc, "tr", {}, [
      element(doc, "th", { scope: "col" }, ["Detector"]),
      ...COLUMNS.map((key) => headerCell(doc, data, key)),
    ]);
    const body = data.detectors.map((detector) => {
      const model = rowModel(detector, data.sources);
      const cells = model.cells.map((cell) => {
        const children = [cell.text];
        if (cell.note) children.push(element(doc, "span", { class: "note" }, [link(doc, cell.note, cell.noteHref)]));
        const attributes = { "data-metric": cell.key };
        if (cell.text === NOT_MEASURED) attributes.class = "not-measured";
        else if (cell.flag) attributes.class = cell.flag;
        return element(doc, "td", attributes, children);
      });
      return element(doc, "tr", {}, [element(doc, "th", { scope: "row" }, [model.id]), ...cells]);
    });
    return element(doc, "table", {}, [
      element(doc, "caption", {}, [
        "Results of the last full corpus run, per detector. Level is the configured promise; earned level is what the counted corpus evidence supports.",
      ]),
      element(doc, "thead", {}, [head]),
      element(doc, "tbody", {}, body),
    ]);
  }

  /** What each level needs, from data.evidenceMinimums, so the earned level can be checked by hand. */
  function buildMinimums(doc, data) {
    const minimums = data.evidenceMinimums && typeof data.evidenceMinimums === "object" ? data.evidenceMinimums : {};
    const levels = Object.keys(minimums).filter((level) => Object.hasOwn(LEVEL_RANK, level));
    const head = element(doc, "tr", {}, [
      element(doc, "th", { scope: "col" }, ["Level"]),
      ...EVIDENCE_COLUMNS.map((key) => headerCell(doc, data, key)),
    ]);
    const body = levels.map((level) =>
      element(doc, "tr", {}, [
        element(doc, "th", { scope: "row" }, [level]),
        ...EVIDENCE_COLUMNS.map((key) => element(doc, "td", {}, ["at least " + formatCount(minimums[level] && minimums[level][key])])),
      ]),
    );
    return element(doc, "table", {}, [
      element(doc, "caption", {}, ["Evidence the corpus must show for a detector to earn a level (decision 0013). Earned level counts evidence only."]),
      element(doc, "thead", {}, [head]),
      element(doc, "tbody", {}, body),
    ]);
  }

  const timeElement = (doc, day) => element(doc, "time", { datetime: day }, [day]);

  /**
   * The run metadata, the stale badge when the recorded age is past the limit, the day the data was computed on,
   * and, when the visitor's clock disagrees, a note saying so. Only data.json decides whether the run is stale.
   */
  function buildRun(doc, data, now) {
    const facts = runFacts(data.run);
    if (facts.length === 0) {
      return element(doc, "p", {}, ["No full run is recorded in benchmarks/thresholds.json, so no numbers are shown."]);
    }
    const status = runStatus(data, now || new Date());
    const items = [];
    for (const fact of facts) {
      const label = [fact.label];
      const anchor = fact.definition ? definitionAnchor(fact.definition) : null;
      if (anchor) label.push(" ", link(doc, "definition", "#" + anchor, "Definition of " + fact.label));
      items.push(element(doc, "dt", {}, label));
      items.push(element(doc, "dd", fact.value === NOT_MEASURED ? { class: "not-measured" } : {}, [fact.value]));
    }
    const parts = [element(doc, "dl", { class: "facts" }, items)];
    if (status.stale && status.runDate) {
      parts.push(
        element(doc, "p", { class: "run-badge" }, [
          element(doc, "strong", { class: "badge" }, ["stale"]),
          " Last full run ",
          timeElement(doc, status.runDate),
          ", " + daysText(status.ageDays) + " old.",
        ]),
      );
    }
    if (status.referenceDay) {
      parts.push(element(doc, "p", { class: "computed-on" }, ["Computed on ", timeElement(doc, status.referenceDay), "."]));
    }
    if (status.visitorAgeDays !== null && status.visitorAgeDays !== status.ageDays) {
      parts.push(
        element(doc, "p", { class: "visitor-clock" }, [
          "Your device's clock reads the run as " +
            daysText(status.visitorAgeDays) +
            " old; the data file records " +
            (status.ageDays === null ? "no age" : daysText(status.ageDays)) +
            ". The data file, not your clock, decides whether the run is marked stale.",
        ]),
      );
    }
    return element(doc, "div", { class: "run" }, parts);
  }

  /** Every definition, with an id the table links to, how it is computed, and its source file. */
  function buildDefinitions(doc, data) {
    const children = [];
    for (const key of Object.keys(data.definitions)) {
      const anchor = definitionAnchor(key);
      const definition = definitionOf(data, key);
      if (!anchor || !definition) continue;
      const source = sourceUrl(definition.source);
      children.push(element(doc, "dt", { id: anchor }, [textOf(definition.label) || key]));
      children.push(
        element(doc, "dd", {}, [
          element(doc, "p", {}, [textOf(definition.meaning)]),
          element(doc, "p", {}, [element(doc, "strong", {}, ["How it is computed: "]), textOf(definition.computation)]),
          element(doc, "p", {}, [element(doc, "strong", {}, ["Source: "]), link(doc, textOf(definition.source), source)]),
        ]),
      );
    }
    return element(doc, "dl", { class: "definitions" }, children);
  }

  function buildLimitations(doc, data) {
    return data.limitations.map((text) => element(doc, "li", {}, [textOf(text)]));
  }

  function replaceContents(target, nodes) {
    while (target.firstChild) target.removeChild(target.firstChild);
    for (const node of nodes) target.appendChild(node);
  }

  const LOAD_FAILURE =
    "Serve this folder (for example `python3 -m http.server` in docs/dashboard) or open the published page. Browsers block a page opened from disk from reading data.json.";

  function start(doc, fetchImpl) {
    const status = doc.getElementById("status");
    const show = (nodes) => {
      status.removeAttribute("hidden");
      replaceContents(status, nodes.map((node) => (typeof node === "string" ? doc.createTextNode(node) : node)));
    };
    const dataSections = doc.getElementById("data-sections");
    const fail = (reason) => {
      if (dataSections) dataSections.setAttribute("hidden", "");
      show([
        element(doc, "strong", {}, ["The numbers could not be loaded. "]),
        LOAD_FAILURE + " ",
        link(doc, "Open the published page.", PUBLISHED_URL),
        " (" + textOf(reason) + ")",
      ]);
    };
    show(["Loading the committed data…"]);
    return (fetchImpl || root.fetch)
      .call(root, "data.json", { cache: "no-cache" })
      .then((response) => {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then((data) => {
        const problem = validateData(data);
        if (problem) throw new Error(problem);
        replaceContents(doc.getElementById("run"), [buildRun(doc, data)]);
        replaceContents(doc.getElementById("detectors-table"), [buildTable(doc, data)]);
        replaceContents(doc.getElementById("minimums-table"), [buildMinimums(doc, data)]);
        replaceContents(doc.getElementById("definitions-list"), [buildDefinitions(doc, data)]);
        replaceContents(doc.getElementById("limitations-list"), buildLimitations(doc, data));
        replaceContents(status, []);
        status.setAttribute("hidden", "");
      })
      .catch((error) => fail(error && error.message ? error.message : "unknown error"));
  }

  const api = {
    SCHEMA,
    BLOB_URL,
    NOT_MEASURED,
    ABOVE_EVIDENCE_NOTE,
    COLUMNS,
    sourceUrl,
    definitionAnchor,
    formatRatio,
    formatCount,
    isAboveEvidence,
    runAgeDays,
    isStale,
    visitorAgeDays,
    runStatus,
    STALE_AFTER_DAYS,
    validateData,
    runFacts,
    rowModel,
    buildTable,
    buildMinimums,
    buildRun,
    buildDefinitions,
    buildLimitations,
    start,
  };
  root.EvergreenDashboard = api;

  if (typeof root.document !== "undefined" && typeof root.fetch === "function") start(root.document);
})(globalThis);
