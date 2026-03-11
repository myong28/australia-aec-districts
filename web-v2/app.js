(function () {
  const bundle = window.AEC_V2_DATA;
  const years = [...new Set(bundle.districts.map((row) => row.year))].sort();
  const latestYear = years[years.length - 1];
  const tabs = [
    { id: "findings", label: "Data + Map Findings" },
    { id: "executive", label: "Executive Summary" },
    { id: "metrics", label: "Understanding the Metrics" },
    { id: "report", label: "Key Findings Report" },
    { id: "electoral", label: "Electoral Analysis" },
    { id: "stakeholders", label: "Stakeholder Analyses" },
  ];
  const stakeholderTabs = [
    { id: "voter", label: "Voters" },
    { id: "government", label: "Government" },
    { id: "aec", label: "AEC" },
    { id: "parties", label: "Political Parties" },
    { id: "foreign", label: "Foreign Countries" },
  ];
  const metricDefinitions = {
    gerrymander_index: { label: "Composite risk", type: "risk", low: "Lower risk", high: "Higher risk" },
    representative_score: { label: "Representative score", type: "representative", low: "Lower", high: "Higher" },
    shape_irregularity: { label: "Shape irregularity", type: "risk", low: "Compact", high: "Irregular" },
    tpp_margin_pct: { label: "TPP margin", type: "risk", low: "Close", high: "Safe" },
    quota_deviation_pct: { label: "Quota deviation %", type: "risk", low: "Near quota", high: "Off quota" },
    booth_tpp_stddev: { label: "Booth TPP dispersion", type: "risk", low: "Uniform", high: "Mixed" },
    tpp_alp_pct: { label: "ALP TPP %", type: "alp", low: "Coalition leaning", high: "ALP leaning" },
  };
  const glossaryItems = [
    {
      title: "Composite risk index",
      summary: "The main screening measure. It combines geometry with electoral structure rather than treating shape alone as decisive.",
      math: "risk = 0.5 x shape irregularity + 0.2 x quota deviation + 0.2 x packing signal + 0.1 x safety margin",
      example: "A seat can rank as risky either because its boundary is unusually irregular or because a relatively normal boundary sits on top of an unusually safe and internally clustered electoral geography.",
    },
    {
      title: "Representative score",
      summary: "The inverse of the composite risk index. Higher is interpreted as more representative relative to other seats in the same election year.",
      math: "representative score = 100 - composite risk",
      example: "A seat with risk 73 has representative score 27. That does not mean it is democratically illegitimate; it means it sits near the more concerning end of this screening model.",
    },
    {
      title: "Shape irregularity",
      summary: "A percentile-style summary of compactness and contiguity, using Polsby-Popper, Reock, convex-hull ratio, and geometry components.",
      math: "mean of reversed compactness percentiles plus contiguity percentile",
      example: "A seat with low compactness on several measures and multiple disconnected geometry components will rank as more irregular even if its electoral outcomes are not especially unusual.",
    },
    {
      title: "Packing signal",
      summary: "A heuristic interaction term designed to detect seats that are both very safe and internally heterogeneous at the booth level.",
      math: "packing signal = safety percentile x booth-dispersion percentile",
      example: "If a seat is extremely safe in aggregate but contains sharply different booth clusters, that is more informative than safety alone because it may indicate selective concentration rather than simple partisan dominance.",
    },
    {
      title: "Quota deviation",
      summary: "The absolute deviation of a division's enrolment from the state-year mean enrolment.",
      math: "abs(enrolment - state-year mean) / state-year mean",
      example: "If the state-year mean is 120,000 electors and a division has 126,000, the deviation is about 5%. Economically, it works like a proportional distance-from-target measure.",
    },
    {
      title: "TPP margin",
      summary: "The two-party-preferred gap between Labor and the Coalition. In this tool it proxies seat safety rather than ideological extremity.",
      math: "margin = abs(ALP TPP % - Coalition TPP %)",
      example: "A 56-44 TPP result implies a 12-point margin. Larger margins matter because unusually safe seats can be more compatible with packing or dilution stories.",
    },
    {
      title: "Booth TPP dispersion",
      summary: "Weighted standard deviation of booth-level ALP TPP inside a division. It measures internal political unevenness.",
      math: "weighted sd of booth ALP TPP values using booth votes as weights",
      example: "If half the booths are near 35% ALP and half are near 65% ALP, the seat may look moderate overall while actually containing strong spatial sorting.",
    },
    {
      title: "Effective number of parties",
      summary: "A standard concentration index derived from first preferences. It captures fragmentation better than a raw candidate count.",
      math: "ENP = 1 / sum(share^2)",
      example: "If party shares are 0.50, 0.30, and 0.20, ENP is around 2.63. That means the seat behaves as if it has roughly two and a half similarly sized party blocs.",
    },
    {
      title: "Vote-type skew",
      summary: "A measure of how much ALP TPP varies between ordinary, absent, provisional, postal, and declaration pre-poll votes.",
      math: "max vote-type ALP TPP - mean vote-type ALP TPP",
      example: "If postal voting is materially more conservative than ordinary voting, that gap matters for interpretation because the seat's final result is an aggregation of electorally different channels.",
    },
    {
      title: "Polsby-Popper and Reock",
      summary: "Two classic compactness measures from political geography. Neither is sufficient alone, which is why the tool uses several measures together.",
      math: "Polsby-Popper = 4πA / P²; Reock = district area / minimum enclosing circle area",
      example: "A near-circle scores close to 1 on both. Long coastal or remote seats can score low for legitimate geographic reasons, so context remains essential.",
    },
  ];

  const metroDefinitions = {
    Sydney: ["Banks", "Barton", "Bennelong", "Grayndler", "Kingsford Smith", "Lindsay", "McMahon", "Parramatta", "Reid", "Sydney", "Watson", "Warringah", "Wentworth", "Bradfield", "Blaxland", "Chifley", "Cook", "Fowler", "Greenway", "Hughes", "Mitchell", "North Sydney", "Werriwa", "Whitlam"],
    Melbourne: ["Aston", "Bendigo", "Bruce", "Chisholm", "Cooper", "Corangamite", "Deakin", "Fraser", "Gellibrand", "Goldstein", "Gorton", "Hawke", "Higgins", "Holt", "Hotham", "Isaacs", "Jagajaga", "Kooyong", "La Trobe", "Lalor", "Macnamara", "Maribyrnong", "McEwen", "Menzies", "Scullin", "Wills"],
    Brisbane: ["Bonner", "Bowman", "Brisbane", "Dickson", "Forde", "Griffith", "Leichhardt", "Longman", "Lilley", "Moreton", "Oxley", "Petrie", "Rankin", "Ryan"],
    Perth: ["Burt", "Canning", "Cowan", "Curtin", "Hasluck", "Moore", "Pearce", "Perth", "Swan", "Tangney"],
    Adelaide: ["Adelaide", "Boothby", "Hindmarsh", "Kingston", "Makin", "Spence", "Sturt"],
    Hobart: ["Clark", "Franklin", "Lyons"],
    Canberra: ["Bean", "Canberra", "Fenner"],
    Darwin: ["Lingiari", "Solomon"],
  };

  const metroLabels = Object.fromEntries(Object.keys(metroDefinitions).map((name) => [name, `${name} metro`]));

  const state = {
    year: latestYear,
    activeTab: "findings",
    metric: "gerrymander_index",
    showBooths: false,
    sortKey: "representative_rank",
    sortDir: "asc",
    selectedDistrict: null,
    hoverDistrict: null,
    transform: { scale: 1, tx: 0, ty: 0 },
    bounds: null,
    drag: null,
  };

  const SVG_NS = "http://www.w3.org/2000/svg";
  const VIEWBOX = { width: 1200, height: 820, pad: 28 };
  const LON0 = (134 * Math.PI) / 180;
  const LAT0 = (-25 * Math.PI) / 180;
  const RADIUS = 6371008.8;

  const elements = {
    mainTabs: document.getElementById("main-tabs"),
    yearControls: document.getElementById("year-controls"),
    metricSelect: document.getElementById("metric-select"),
    boothToggle: document.getElementById("booth-toggle"),
    zoomPreset: document.getElementById("zoom-preset"),
    districtSearch: document.getElementById("district-search"),
    districtOptions: document.getElementById("district-options"),
    zoomOut: document.getElementById("zoom-out"),
    zoomIn: document.getElementById("zoom-in"),
    zoomSlider: document.getElementById("zoom-slider"),
    zoomScale: document.getElementById("zoom-scale"),
    resetZoom: document.getElementById("reset-zoom"),
    clearSelection: document.getElementById("clear-selection"),
    panels: Object.fromEntries(tabs.map((tab) => [tab.id, document.getElementById(`tab-${tab.id}`)])),
    executiveSubtitle: document.getElementById("executive-subtitle"),
    executiveKpis: document.getElementById("executive-kpis"),
    executiveFindings: document.getElementById("executive-findings"),
    toolPurpose: document.getElementById("tool-purpose"),
    breakingFindings: document.getElementById("breaking-findings"),
    glossaryGrid: document.getElementById("glossary-grid"),
    reportSummary: document.getElementById("report-summary"),
    stateAnalysis: document.getElementById("state-analysis"),
    electoralKpis: document.getElementById("electoral-kpis"),
    electoralFindings: document.getElementById("electoral-findings"),
    stakeholderContent: document.getElementById("stakeholder-content"),
    svg: document.getElementById("map-svg"),
    tooltip: document.getElementById("tooltip"),
    mapWrap: document.getElementById("map-wrap"),
    mapStatus: document.getElementById("map-status"),
    selectionName: document.getElementById("selection-name"),
    selectionSubtitle: document.getElementById("selection-subtitle"),
    detailGrid: document.getElementById("detail-grid"),
    summaryGrid: document.getElementById("summary-grid"),
    methods: document.getElementById("methods"),
    limitations: document.getElementById("limitations"),
    tableBody: document.getElementById("table-body"),
    legendMin: document.getElementById("legend-min"),
    legendMax: document.getElementById("legend-max"),
    legendBar: document.getElementById("legend-bar"),
    boothStatus: document.getElementById("booth-status"),
  };

  function fmt(value, digits = 1) {
    if (value === null || value === undefined || Number.isNaN(value)) return "Unavailable";
    if (typeof value === "number") {
      return value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    }
    return String(value);
  }

  function fmtInt(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return "Unavailable";
    return Number(value).toLocaleString();
  }

  function allDistricts() {
    return bundle.districts;
  }

  function districtsForYear(year) {
    return bundle.districts.filter((row) => row.year === year);
  }

  function currentDistricts() {
    return districtsForYear(state.year);
  }

  function currentBooths() {
    return bundle.booths.filter((row) => row.year === state.year);
  }

  function currentSummary() {
    return bundle.summary.years[state.year];
  }

  function districtByName(name) {
    return currentDistricts().find((row) => row.district === name) || null;
  }

  function average(rows, key) {
    return rows.length ? rows.reduce((sum, row) => sum + (row[key] || 0), 0) / rows.length : 0;
  }

  function normalizeName(name) {
    return String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function districtHistoryMap() {
    const histories = new Map();
    allDistricts().forEach((row) => {
      const key = normalizeName(row.district);
      if (!histories.has(key)) histories.set(key, []);
      histories.get(key).push(row);
    });
    histories.forEach((rows) => rows.sort((a, b) => Number(a.year) - Number(b.year)));
    return histories;
  }

  const histories = districtHistoryMap();

  function isMetro(row) {
    return Object.values(metroDefinitions).some((districts) => districts.includes(row.district));
  }

  function districtLabel(row) {
    return `${row.district} (${row.state}, ${isMetro(row) ? "metro" : "regional"})`;
  }

  function yearMean(year, key) {
    return average(districtsForYear(year), key);
  }

  function safeTop(rows, key, count, desc = true) {
    const sorted = [...rows].sort((a, b) => {
      const delta = (a[key] || 0) - (b[key] || 0);
      if (delta !== 0) return desc ? -delta : delta;
      return a.district.localeCompare(b.district);
    });
    return sorted.slice(0, count);
  }

  function latestRows() {
    return districtsForYear(latestYear);
  }

  function latestTopRisk() {
    return safeTop(latestRows(), "gerrymander_index", 5, true);
  }

  function latestTopRep() {
    return safeTop(latestRows(), "representative_score", 5, true);
  }

  function rowsSortedByRisk(year) {
    return safeTop(districtsForYear(year), "gerrymander_index", districtsForYear(year).length, true);
  }

  function rowsSortedByRep(year) {
    return safeTop(districtsForYear(year), "representative_score", districtsForYear(year).length, true);
  }

  function longitudinalChanges(key) {
    const changes = [];
    histories.forEach((rows) => {
      if (rows.length < 2) return;
      const first = rows[0];
      const last = rows[rows.length - 1];
      changes.push({
        district: last.district,
        state: last.state,
        startYear: first.year,
        endYear: last.year,
        startValue: first[key],
        endValue: last[key],
        change: (last[key] || 0) - (first[key] || 0),
      });
    });
    return changes;
  }

  function stateLongitudinalGroups() {
    const latest = latestRows();
    const groups = new Map();
    latest.forEach((row) => {
      if (!groups.has(row.state)) groups.set(row.state, []);
      groups.get(row.state).push(row);
    });
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }

  function laeaProject(lon, lat) {
    const lonR = (lon * Math.PI) / 180;
    const latR = (lat * Math.PI) / 180;
    let denom = 1 + Math.sin(LAT0) * Math.sin(latR) + Math.cos(LAT0) * Math.cos(latR) * Math.cos(lonR - LON0);
    if (denom <= 0) denom = 1e-12;
    const k = Math.sqrt(2 / denom);
    const x = RADIUS * k * Math.cos(latR) * Math.sin(lonR - LON0);
    const y = RADIUS * k * (Math.cos(LAT0) * Math.sin(latR) - Math.sin(LAT0) * Math.cos(latR) * Math.cos(lonR - LON0));
    return [x, y];
  }

  function currentProjectedBounds(rows = currentDistricts()) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    rows.forEach((row) => {
      row.rings.forEach((ring) => {
        ring.forEach(([x, y]) => {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        });
      });
    });
    return { minX, maxX, minY, maxY };
  }

  function projectedToBase(point) {
    const bounds = state.bounds;
    const scale = Math.min(
      (VIEWBOX.width - VIEWBOX.pad * 2) / (bounds.maxX - bounds.minX),
      (VIEWBOX.height - VIEWBOX.pad * 2) / (bounds.maxY - bounds.minY)
    );
    const xOffset = (VIEWBOX.width - (bounds.maxX - bounds.minX) * scale) / 2;
    const yOffset = (VIEWBOX.height - (bounds.maxY - bounds.minY) * scale) / 2;
    const [x, y] = point;
    return [xOffset + (x - bounds.minX) * scale, VIEWBOX.height - (yOffset + (y - bounds.minY) * scale)];
  }

  function districtBaseBounds(rows) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    rows.forEach((row) => {
      row.rings.forEach((ring) => {
        ring.forEach((point) => {
          const [x, y] = projectedToBase(point);
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        });
      });
    });
    return { minX, maxX, minY, maxY };
  }

  function pathData(rings) {
    return rings
      .map((ring) =>
        ring
          .map((point, index) => {
            const [x, y] = projectedToBase(point);
            return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
          })
          .join(" ") + " Z"
      )
      .join(" ");
  }

  function boothPoint(booth) {
    return projectedToBase(laeaProject(booth.lon, booth.lat));
  }

  function metricRange(metric) {
    const values = currentDistricts().map((row) => row[metric]).filter((value) => value !== null && value !== undefined);
    return { min: Math.min(...values), max: Math.max(...values) };
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function rgb(channels) {
    return `rgb(${channels.map((channel) => Math.round(channel)).join(",")})`;
  }

  function scaleColor(metric, value) {
    const range = metricRange(metric);
    const def = metricDefinitions[metric];
    if (def.type === "alp") {
      const t = clamp01((value - 30) / 40);
      const left = [41, 92, 166];
      const mid = [235, 236, 228];
      const right = [173, 60, 51];
      if (t < 0.5) return rgb(left.map((channel, idx) => lerp(channel, mid[idx], t / 0.5)));
      return rgb(mid.map((channel, idx) => lerp(channel, right[idx], (t - 0.5) / 0.5)));
    }
    const normalized = range.max === range.min ? 0.5 : clamp01((value - range.min) / (range.max - range.min));
    if (def.type === "representative") {
      const low = [185, 72, 54];
      const mid = [220, 192, 96];
      const high = [42, 118, 86];
      if (normalized < 0.5) return rgb(low.map((channel, idx) => lerp(channel, mid[idx], normalized / 0.5)));
      return rgb(mid.map((channel, idx) => lerp(channel, high[idx], (normalized - 0.5) / 0.5)));
    }
    const low = [48, 124, 90];
    const mid = [221, 194, 99];
    const high = [181, 72, 55];
    if (normalized < 0.5) return rgb(low.map((channel, idx) => lerp(channel, mid[idx], normalized / 0.5)));
    return rgb(mid.map((channel, idx) => lerp(channel, high[idx], (normalized - 0.5) / 0.5)));
  }

  function selectedOrHovered() {
    return state.selectedDistrict || state.hoverDistrict;
  }

  function renderTabs() {
    elements.mainTabs.innerHTML = "";
    tabs.forEach((tab) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = tab.label;
      if (tab.id === state.activeTab) button.classList.add("active");
      button.addEventListener("click", () => {
        state.activeTab = tab.id;
        updateVisibleTab();
      });
      elements.mainTabs.appendChild(button);
    });
  }

  function updateVisibleTab() {
    tabs.forEach((tab) => {
      elements.panels[tab.id].classList.toggle("hidden", tab.id !== state.activeTab);
    });
    renderTabs();
  }

  function renderYearButtons() {
    elements.yearControls.innerHTML = "";
    years.forEach((year) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = year;
      if (year === state.year) button.classList.add("active");
      button.addEventListener("click", () => {
        state.year = year;
        state.selectedDistrict = null;
        state.hoverDistrict = null;
        state.bounds = currentProjectedBounds();
        renderMapTab();
      });
      elements.yearControls.appendChild(button);
    });
  }

  function renderMetricSelect() {
    elements.metricSelect.innerHTML = "";
    Object.entries(metricDefinitions).forEach(([key, def]) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = def.label;
      option.selected = key === state.metric;
      elements.metricSelect.appendChild(option);
    });
    elements.boothToggle.checked = state.showBooths;
  }

  function updateLegend() {
    const def = metricDefinitions[state.metric];
    elements.legendMin.textContent = def.low;
    elements.legendMax.textContent = def.high;
    if (def.type === "alp") {
      elements.legendBar.style.background = "linear-gradient(90deg, rgb(41,92,166) 0%, rgb(235,236,228) 50%, rgb(173,60,51) 100%)";
    } else if (def.type === "representative") {
      elements.legendBar.style.background = "linear-gradient(90deg, rgb(185,72,54) 0%, rgb(220,192,96) 50%, rgb(42,118,86) 100%)";
    } else {
      elements.legendBar.style.background = "linear-gradient(90deg, rgb(48,124,90) 0%, rgb(221,194,99) 50%, rgb(181,72,55) 100%)";
    }
  }

  function renderDistrictOptions() {
    elements.districtOptions.innerHTML = "";
    currentDistricts()
      .map((row) => row.district)
      .sort((a, b) => a.localeCompare(b))
      .forEach((name) => {
        const option = document.createElement("option");
        option.value = name;
        elements.districtOptions.appendChild(option);
      });
    elements.districtSearch.value = state.selectedDistrict || "";
  }

  function availablePresetItems() {
    const statePresets = [...new Set(currentDistricts().map((row) => row.state))].sort().map((code) => ({
      label: code,
      value: `state:${code}`,
    }));
    const metroPresets = Object.keys(metroDefinitions)
      .filter((name) => currentDistricts().some((row) => metroDefinitions[name].includes(row.district)))
      .map((name) => ({ label: metroLabels[name], value: `metro:${name}` }));
    return [{ label: "Australia", value: "country:AU" }, ...statePresets, ...metroPresets];
  }

  function renderPresetSelect() {
    elements.zoomPreset.innerHTML = "";
    availablePresetItems().forEach((preset) => {
      const option = document.createElement("option");
      option.value = preset.value;
      option.textContent = preset.label;
      elements.zoomPreset.appendChild(option);
    });
    elements.zoomPreset.value = "country:AU";
  }

  function setZoomScaleLabel() {
    elements.zoomScale.textContent = `${state.transform.scale.toFixed(1)}x`;
    elements.zoomSlider.value = String(state.transform.scale.toFixed(1));
  }

  function setTransform(scale, tx, ty) {
    state.transform = { scale, tx, ty };
    const viewport = document.getElementById("viewport");
    if (viewport) {
      viewport.setAttribute("transform", `translate(${tx} ${ty}) scale(${scale})`);
    }
    updateBoothLayer();
    setZoomScaleLabel();
  }

  function fitBaseBounds(bounds, margin = 1.08) {
    const width = Math.max(20, bounds.maxX - bounds.minX);
    const height = Math.max(20, bounds.maxY - bounds.minY);
    const expandedWidth = width * margin;
    const expandedHeight = height * margin;
    const scale = Math.max(
      1,
      Math.min(
        12,
        Math.min(
          VIEWBOX.width / expandedWidth,
          VIEWBOX.height / expandedHeight
        )
      )
    );
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const tx = VIEWBOX.width / 2 - centerX * scale;
    const ty = VIEWBOX.height / 2 - centerY * scale;
    setTransform(scale, tx, ty);
  }

  function fitRows(rows, margin = 1.15) {
    fitBaseBounds(districtBaseBounds(rows), margin);
  }

  function applyPreset(value) {
    if (!value) return;
    if (value === "country:AU") {
      fitRows(currentDistricts(), 1.02);
      return;
    }
    const [kind, name] = value.split(":");
    if (kind === "state") {
      if (name === "ACT") {
        fitRows(currentDistricts().filter((row) => metroDefinitions.Canberra.includes(row.district)), 1.25);
      } else {
        fitRows(currentDistricts().filter((row) => row.state === name), 1.08);
      }
      return;
    }
    if (kind === "metro") {
      fitRows(currentDistricts().filter((row) => metroDefinitions[name].includes(row.district)), 1.15);
    }
  }

  function selectDistrict(name, zoom = true) {
    const match = currentDistricts().find((row) => normalizeName(row.district) === normalizeName(name));
    if (!match) return;
    state.selectedDistrict = match.district;
    state.hoverDistrict = null;
    elements.districtSearch.value = match.district;
    renderDetails();
    updateDistrictClasses();
    renderTable();
    if (zoom) fitRows([match], 3.0);
  }

  function updateSummary() {
    const summary = currentSummary();
    elements.mapStatus.textContent = `${summary.district_count} districts in ${state.year}. Mean representative score ${summary.mean_representative_score}.`;
    elements.summaryGrid.innerHTML = `
      <article>
        <h3>Most representative</h3>
        <ol>${summary.top_representative.slice(0, 5).map((row) => `<li>${row.district} (${fmt(row.representative_score)} rep)</li>`).join("")}</ol>
      </article>
      <article>
        <h3>Highest risk</h3>
        <ol>${summary.top_risk.slice(0, 5).map((row) => `<li>${row.district} (${fmt(row.gerrymander_index)} risk)</li>`).join("")}</ol>
      </article>
    `;
    elements.methods.innerHTML = bundle.summary.methods.map((text) => `<li>${text}</li>`).join("");
    elements.limitations.innerHTML = bundle.summary.limitations.map((text) => `<li>${text}</li>`).join("");
  }

  function renderExecutivePage() {
    const latestRisk = latestTopRisk();
    const latestRep = latestTopRep();
    const riskTrend = longitudinalChanges("gerrymander_index").sort((a, b) => b.change - a.change);
    const repTrend = longitudinalChanges("representative_score").sort((a, b) => b.change - a.change);
    const meanRiskByYear = years.map((year) => ({ year, value: yearMean(year, "gerrymander_index") }));
    const latestMean = meanRiskByYear[meanRiskByYear.length - 1].value;
    const earliestMean = meanRiskByYear[0].value;
    const swingSeats = safeTop(latestRows(), "tpp_swing", latestRows().length, true).sort((a, b) => Math.abs(b.tpp_swing) - Math.abs(a.tpp_swing)).slice(0, 4);

    elements.executiveSubtitle.textContent = `This summary is fixed across the app: it reads the whole 2019-2025 record, but defaults analytically to 2025 when the time series is not informative enough on its own.`;
    elements.executiveKpis.innerHTML = `
      <div class="kpi"><strong>${fmt(earliestMean)}</strong><span>Mean risk, ${years[0]}</span></div>
      <div class="kpi"><strong>${fmt(latestMean)}</strong><span>Mean risk, ${latestYear}</span></div>
      <div class="kpi"><strong>${latestRisk[0].district}</strong><span>Highest-risk seat in ${latestYear}</span></div>
      <div class="kpi"><strong>${latestRep[0].district}</strong><span>Most representative seat in ${latestYear}</span></div>
    `;
    elements.executiveFindings.innerHTML = `
      <h3>Key findings</h3>
      <ol>
        <li><strong>National-level inference:</strong> the evidence is strongest for localized outliers, not for a single Australia-wide partisan redistricting strategy. The distribution of risk remains right-skewed in every year, which is exactly what a screening model should show when most seats are mundane and a small number are structurally unusual.</li>
        <li><strong>Second-order insight:</strong> once electoral data are added, some seemingly benign seats become more interesting. This means shape alone understates the importance of internal vote clustering and seat safety. In other words, the political geography inside a division can matter almost as much as the boundary itself.</li>
        <li><strong>Third-order insight:</strong> several high-risk seats are high-risk for different reasons. ${latestRisk.slice(0, 3).map((row) => districtLabel(row)).join(", ")} should not be read as equivalent cases. Some are driven primarily by geometry; others by heterogeneity, safety, or enrolment deviation. This weakens any claim of a single mechanism and strengthens the case for contextual, state-specific interpretation.</li>
        <li><strong>Temporal reading:</strong> the mean risk score moves from ${fmt(earliestMean)} in ${years[0]} to ${fmt(latestMean)} in ${latestYear}. That is not a decisive time trend by itself, but it shows the national centre of gravity is fairly stable even while individual seats move materially.</li>
        <li><strong>Electoral salience:</strong> the largest contemporary movement is less about map design than about strategic electoral change. Seats such as ${swingSeats.map((row) => `${districtLabel(row)} (${fmt(row.tpp_swing, 2)} swing)`).join(", ")} matter because the political map is changing even if the district map is not obviously manipulated.</li>
        <li><strong>Institutional implication:</strong> the same seat can be low-risk in a legalistic map-drawing sense but still strategically important because it combines fragmentation, turnout deviation, and vote-type skew. That distinction matters for anyone treating representation as broader than line-drawing alone.</li>
      </ol>
    `;
    elements.toolPurpose.innerHTML = `
      <p>The tool has two jobs. First, it screens for structural representational oddities using compactness, contiguity, enrolment balance, seat safety, and internal booth variation. Second, it interprets the electoral landscape in its own right.</p>
      <p>The first task is about suspicion management: which seats deserve explanation, scrutiny, or closer methodological follow-up. The second task is about political understanding: where turnout, competition, fragmentation, and swing are substantively interesting even if there is no gerrymandering story.</p>
      <p>The result is closer to a political-economy dashboard than a single-purpose legal test. It is strongest as a decision-support instrument for analysts, journalists, institutions, and campaigns.</p>
    `;
    elements.breakingFindings.innerHTML = `
      <ul>
        <li><strong>Highest-risk 2025 seats:</strong> ${latestRisk.slice(0, 5).map((row) => `${districtLabel(row)} (${fmt(row.gerrymander_index)})`).join(", ")}.</li>
        <li><strong>Most improved on representativeness since ${years[0]}:</strong> ${repTrend.slice(0, 3).map((row) => `${districtLabel(districtsForYear(latestYear).find((d) => d.district === row.district) || row)} (+${fmt(row.change)})`).join(", ")}.</li>
        <li><strong>Largest increase in risk since ${years[0]}:</strong> ${riskTrend.slice(0, 3).map((row) => `${districtLabel(districtsForYear(latestYear).find((d) => d.district === row.district) || row)} (+${fmt(row.change)})`).join(", ")}.</li>
      </ul>
    `;
  }

  function renderMetricsPage() {
    elements.glossaryGrid.innerHTML = glossaryItems
      .map((item) => `
        <article class="glossary-card">
          <h3>${item.title}</h3>
          <p>${item.summary}</p>
          <p><strong>Math:</strong> <code>${item.math}</code></p>
          <p><strong>Example:</strong> ${item.example}</p>
        </article>
      `)
      .join("");
  }

  function renderReportPage() {
    const riskTrend = longitudinalChanges("gerrymander_index").sort((a, b) => b.change - a.change);
    const marginTrend = longitudinalChanges("tpp_margin_pct").sort((a, b) => b.change - a.change);
    const fragmentationTrend = longitudinalChanges("effective_parties").sort((a, b) => b.change - a.change);
    elements.reportSummary.innerHTML = `
      <h3>Research framing</h3>
      <p>This report should be read as a multi-method heuristic audit rather than a definitive adjudication. In the political science literature, the strongest gerrymandering claims typically rely on districting ensembles, small-area geography, or counterfactual plan generation. Those ingredients are not present here. What is present is enough to separate ordinary seats from structurally curious ones and to say far more than a shape-only audit could say.</p>
      <p>The most important substantive result is not that Australia exhibits a clear national gerrymander. It does not. The more defensible conclusion is narrower and more interesting: the outlier seats differ sharply in mechanism. Some have visibly irregular geometry consistent with harsh geography, others have relatively standard shapes but unusual combinations of seat safety and internal booth polarization, and some combine both. That is analytically richer than a yes-or-no national verdict.</p>
      <p>The longitudinal evidence reinforces that caution. The seats with the largest risk increases since ${years[0]} are ${riskTrend.slice(0, 5).map((row) => `${districtLabel(districtsForYear(latestYear).find((d) => d.district === row.district) || row)} (+${fmt(row.change)})`).join(", ")}. Yet the seats with the largest increases in TPP margin are ${marginTrend.slice(0, 5).map((row) => `${districtLabel(districtsForYear(latestYear).find((d) => d.district === row.district) || row)} (+${fmt(row.change, 2)} pts)`).join(", ")}. The partial overlap between those lists suggests that boundary suspicion and political entrenchment are related but not identical phenomena.</p>
      <p>A third-layer implication concerns party system structure. Seats with rising fragmentation, including ${fragmentationTrend.slice(0, 5).map((row) => `${districtLabel(districtsForYear(latestYear).find((d) => d.district === row.district) || row)} (+${fmt(row.change, 3)})`).join(", ")}, can look less stable electorally even when the final TPP remains decisive. This is why booth-level variation and effective-party measures are useful complements to TPP. They capture the internal composition of a seat, not just its final binary outcome.</p>
      <p>A fourth-layer implication is institutional. When a seat is simultaneously geographically odd, electorally safe, and internally fragmented, the likely explanation is not one thing but a bundle: settlement geography, community-of-interest tradeoffs, incumbent durability, and partisan sorting. That is why a PhD-level reading should resist monocausal narratives. The map is rarely just the map.</p>
      <h3>Interpretive bottom line</h3>
      <ol>
        <li>There is no strong evidence here of a national, centrally coordinated federal gerrymander.</li>
        <li>There is strong evidence of persistent structural outliers that deserve state-level, seat-specific explanation.</li>
        <li>Electoral clustering, not just line-drawing, is a major source of representational unevenness in contemporary Australia.</li>
      </ol>
    `;

    elements.stateAnalysis.innerHTML = stateLongitudinalGroups()
      .map(([stateCode, rows]) => {
        const meanRisk2025 = average(rows, "gerrymander_index");
        const meanRep2025 = average(rows, "representative_score");
        const topRisk = safeTop(rows, "gerrymander_index", 1, true)[0];
        const topRep = safeTop(rows, "representative_score", 1, true)[0];
        const historiesInState = [...histories.values()].map((history) => history[history.length - 1]).filter((row) => row.state === stateCode);
        const meanMargin = average(rows, "tpp_margin_pct");
        return `
          <article class="state-card">
            <div class="badge">${stateCode}</div>
            <h3>${stateCode} in context</h3>
            <p>${stateCode} has mean 2025 risk ${fmt(meanRisk2025)} and mean 2025 representativeness ${fmt(meanRep2025)}. The average TPP margin is ${fmt(meanMargin, 2)} points, which matters because the interpretation of structural risk is different in a state dominated by very safe seats than in one dominated by competitive seats.</p>
            <ol>
              <li><strong>Highest-risk current seat:</strong> ${districtLabel(topRisk)} (${fmt(topRisk.gerrymander_index)} risk).</li>
              <li><strong>Most representative current seat:</strong> ${districtLabel(topRep)} (${fmt(topRep.representative_score)} representative).</li>
              <li><strong>Analytical read:</strong> ${stateCode} should be interpreted as ${meanMargin > 15 ? "a relatively safe-seat environment, where packing-like signals are more likely to arise from partisan geography and incumbency" : "a more competitive environment, where high structural risk requires more careful justification because seat safety is less able to explain it away"}.</li>
              <li><strong>Third-order point:</strong> the relevant comparison is not just seat-to-seat but seat-within-state. That is why ${historiesInState.length} current seats in ${stateCode} are best read against the state's own geography and redistribution context rather than only against the national average.</li>
              <li><strong>Fourth-order point:</strong> ${stateCode} contains a mixture of ${rows.filter((row) => isMetro(row)).length} metro and ${rows.filter((row) => !isMetro(row)).length} regional seats in the current frame. That composition itself shapes what “normal” looks like inside the state.</li>
            </ol>
          </article>
        `;
      })
      .join("");
  }

  function renderElectoralPage() {
    const latest = latestRows();
    const mostCompetitive = safeTop(latest, "tpp_margin_pct", latest.length, false).slice(0, 5);
    const mostFragmented = safeTop(latest, "effective_parties", 5, true);
    const highestSkew = safeTop(latest, "vote_type_skew", 5, true);
    const highestTurnout = safeTop(latest, "turnout_pct", 5, true);
    elements.electoralKpis.innerHTML = `
      <div class="kpi"><strong>${mostCompetitive[0].district}</strong><span>Closest ${latestYear} TPP margin</span></div>
      <div class="kpi"><strong>${mostFragmented[0].district}</strong><span>Most fragmented primary vote</span></div>
      <div class="kpi"><strong>${highestSkew[0].district}</strong><span>Largest vote-type skew</span></div>
      <div class="kpi"><strong>${highestTurnout[0].district}</strong><span>Highest turnout rate</span></div>
    `;
    elements.electoralFindings.innerHTML = `
      <h3>Findings independent of district design</h3>
      <ol>
        <li><strong>Competition is not evenly distributed:</strong> the tightest 2025 contests are ${mostCompetitive.map((row) => `${districtLabel(row)} (${fmt(row.tpp_margin_pct, 2)} pts)`).join(", ")}. This matters because national narratives built from aggregate TPP often miss how geographically concentrated competitiveness has become.</li>
        <li><strong>Primary vote structure carries its own information:</strong> the most fragmented seats are ${mostFragmented.map((row) => `${districtLabel(row)} (${fmt(row.effective_parties, 3)})`).join(", ")}. These seats are strategically important because campaign effects, preference deals, and candidate quality can matter more than they do in simpler two-bloc seats.</li>
        <li><strong>Voting channel composition matters:</strong> the highest vote-type skew appears in ${highestSkew.map((row) => `${districtLabel(row)} (${fmt(row.vote_type_skew, 2)} pts)`).join(", ")}. That suggests the ordinary vote alone is often a poor approximation of the final seat-level coalition of voters.</li>
        <li><strong>Turnout is an institutional variable, not just a behavioural one:</strong> high-turnout seats such as ${highestTurnout.map((row) => `${districtLabel(row)} (${fmt(row.turnout_pct, 2)}%)`).join(", ")} may reflect local mobilization, administrative ease, or demographic stability. Low-turnout seats deserve the same attention because turnout gaps alter representational quality even without map manipulation.</li>
        <li><strong>Third-order implication:</strong> the interaction of fragmentation, skew, and dispersion implies that some electorates are becoming internally more complex even when the national party system looks tractable in TPP terms. Analysts who focus only on the final binary result are under-reading the institutional richness of the dataset.</li>
      </ol>
    `;
  }

  function stakeholderCard(title, bullets) {
    return `
      <article class="persona-card">
        <h3>${title}</h3>
        <ul>${bullets.map((bullet) => `<li>${bullet}</li>`).join("")}</ul>
      </article>
    `;
  }

  function renderStakeholderPage() {
    const latestRisk = latestTopRisk();
    const latestRep = latestTopRep();
    const competitive = safeTop(latestRows(), "tpp_margin_pct", latestRows().length, false).slice(0, 5);
    const fragmented = safeTop(latestRows(), "effective_parties", 5, true);
    elements.stakeholderContent.innerHTML = [
      stakeholderCard("For voters", [
        `If you want to know whether your seat is structurally unusual, start with the current outliers: ${latestRisk.slice(0, 4).map((row) => districtLabel(row)).join(", ")}.`,
        `If you care about influence rather than fairness alone, the seats to watch are the most competitive ones: ${competitive.map((row) => districtLabel(row)).join(", ")}.`,
        `Use the map to compare booth clusters and vote-type skew rather than relying only on the final TPP percentage. A seat can be electorally interesting long before it looks legally suspicious.`,
      ]),
      stakeholderCard("For government", [
        `The immediate risk is legitimacy management. Outliers such as ${latestRisk.slice(0, 3).map((row) => districtLabel(row)).join(", ")} will attract scrutiny even absent proof of intentional manipulation.`,
        `The policy lesson is that redistribution transparency matters most where geometry, enrolment imbalance, and electoral clustering line up.`,
        `The strategic lesson is to separate “no proof of gerrymandering” from “no need to explain the map.” Those are different claims, and the second remains institutionally necessary.`,
      ]),
      stakeholderCard("For the AEC", [
        `The strongest institutional payoff would come from better public documentation of the rationale for outlier seats and fuller geocoding for special, hospital, and mobile teams.`,
        `Publishing standardized small-area geography or catchment equivalents would materially improve future audit quality.`,
        `The current data are already unusually strong by international standards; the marginal gains now come from making cross-cycle comparison even easier and more spatially explicit.`,
      ]),
      stakeholderCard("For Labor", [
        `Labor should treat strong TPP seats and high-fragmentation seats differently. Seats with high ALP TPP but rising fragmentation are not necessarily safe in organisational terms.`,
        `The most useful seats for organisational learning are those that combine strong final outcomes with unusual booth dispersion, because they show where coalition-building is geographically uneven.`,
      ]),
      stakeholderCard("For the Coalition", [
        `The Coalition's strategic question is not just where it is strong, but where it remains structurally competitive despite adverse booth clustering.`,
        `Seats with low ALP TPP but increasing fragmentation merit close attention because the right-of-centre vote may be secure in aggregate while becoming less coherent internally.`,
      ]),
      stakeholderCard("For Greens and crossbench actors", [
        `Fragmented electorates such as ${fragmented.slice(0, 4).map((row) => districtLabel(row)).join(", ")} are structurally more open to non-major-party leverage.`,
        `The most promising targets are not always the tightest TPP seats. They are often seats where first preferences are fluid, booth clusters are internally distinct, and the binary TPP story compresses genuine pluralism.`,
      ]),
      stakeholderCard("For foreign countries", [
        `Australia's public election data architecture is a comparative strength. It allows post-election scrutiny of turnout, TPP, first preferences, and polling-place structure without privileged access.`,
        `The main best-practice lesson is that transparency should not stop at national totals; it should extend to channels of voting and fine-grained local results.`,
        `The main cautionary lesson is methodological: even rich public data do not by themselves produce a full gerrymandering verdict unless alternative plans or equivalent spatial counterfactuals are available.`,
      ]),
    ].join("");
  }

  function renderDetails() {
    const active = selectedOrHovered();
    const row = active ? districtByName(active) : null;
    if (!row) {
      elements.selectionName.textContent = "No district selected";
      elements.selectionSubtitle.textContent = "Click a district or table row, or search for a district.";
      elements.detailGrid.innerHTML = '<div><dt>Status</dt><dd>Select a district</dd></div>';
      return;
    }
    elements.selectionName.textContent = districtLabel(row);
    elements.selectionSubtitle.textContent = `Rank ${row.representative_rank} of ${currentDistricts().length} in ${row.year}.`;
    const fields = [
      ["Representative score", fmt(row.representative_score)],
      ["Composite risk", fmt(row.gerrymander_index)],
      ["Shape irregularity", fmt(row.shape_irregularity)],
      ["Packing signal", fmt(row.packing_signal)],
      ["Enrolment", fmtInt(row.enrolment)],
      ["Turnout", `${fmtInt(row.turnout)} (${fmt(row.turnout_pct, 2)}%)`],
      ["Quota deviation", `${fmt(row.quota_deviation_pct, 2)}%`],
      ["ALP TPP", `${fmt(row.tpp_alp_pct, 2)}%`],
      ["TPP margin", `${fmt(row.tpp_margin_pct, 2)}%`],
      ["TPP swing", `${fmt(row.tpp_swing, 2)}%`],
      ["Booth TPP sd", fmt(row.booth_tpp_stddev, 2)],
      ["Booth range", fmt(row.booth_tpp_range, 2)],
      ["Mapped booths", `${fmtInt(row.mapped_booth_count)} / ${fmtInt(row.booth_count)}`],
      ["Effective parties", fmt(row.effective_parties, 3)],
      ["Top primary", `${row.top_primary_party || "Unavailable"} (${fmt(row.top_primary_pct, 2)}%)`],
      ["Vote-type skew", `${fmt(row.vote_type_skew, 2)} pts`],
      ["Polsby-Popper", fmt(row.polsby_popper, 4)],
      ["Reock", fmt(row.reock, 4)],
    ];
    elements.detailGrid.innerHTML = fields.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("");
  }

  function updateBoothLayer() {
    const boothGroup = document.getElementById("booth-group");
    if (!boothGroup) return;
    const visible = state.showBooths && state.transform.scale >= 2;
    boothGroup.style.display = visible ? "block" : "none";
    elements.boothStatus.textContent = visible
      ? `Polling places visible. ${currentBooths().length.toLocaleString()} geocoded booths are available in ${state.year}.`
      : "Polling places are off by default. Turn them on and zoom past 2.0x to reveal them.";
  }

  function setZoom(scale, anchorX = VIEWBOX.width / 2, anchorY = VIEWBOX.height / 2) {
    const nextScale = Math.max(1, Math.min(30, scale));
    const ratio = nextScale / state.transform.scale;
    const tx = anchorX - (anchorX - state.transform.tx) * ratio;
    const ty = anchorY - (anchorY - state.transform.ty) * ratio;
    applyTransform(nextScale, tx, ty);
  }

  function applyTransform(scale, tx, ty) {
    state.transform = { scale, tx, ty };
    const viewport = document.getElementById("viewport");
    if (viewport) viewport.setAttribute("transform", `translate(${tx} ${ty}) scale(${scale})`);
    elements.zoomScale.textContent = `${scale.toFixed(1)}x`;
    elements.zoomSlider.value = String(scale.toFixed(1));
    updateBoothLayer();
  }

  function renderMap() {
    const districts = currentDistricts();
    const booths = currentBooths();
    elements.svg.innerHTML = "";

    const viewport = document.createElementNS(SVG_NS, "g");
    viewport.setAttribute("id", "viewport");
    const districtGroup = document.createElementNS(SVG_NS, "g");
    districtGroup.setAttribute("id", "district-group");
    const boothGroup = document.createElementNS(SVG_NS, "g");
    boothGroup.setAttribute("id", "booth-group");

    districts.forEach((row) => {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", pathData(row.rings));
      path.setAttribute("fill", scaleColor(state.metric, row[state.metric]));
      path.setAttribute("class", "district");
      path.dataset.district = row.district;
      path.addEventListener("mouseenter", (event) => {
        state.hoverDistrict = row.district;
        updateDistrictClasses();
        renderDetails();
        showTooltip(event, districtTooltip(row));
      });
      path.addEventListener("mousemove", moveTooltip);
      path.addEventListener("mouseleave", () => {
        state.hoverDistrict = null;
        updateDistrictClasses();
        renderDetails();
        hideTooltip();
      });
      path.addEventListener("click", (event) => {
        event.stopPropagation();
        selectDistrict(row.district, true);
      });
      districtGroup.appendChild(path);
    });

    booths.forEach((booth) => {
      const [x, y] = boothPoint(booth);
      const circle = document.createElementNS(SVG_NS, "circle");
      circle.setAttribute("cx", x.toFixed(2));
      circle.setAttribute("cy", y.toFixed(2));
      circle.setAttribute("r", Math.max(1.4, Math.min(7, Math.sqrt(booth.total_votes) / 11)).toFixed(2));
      circle.setAttribute("fill", scaleColor("tpp_alp_pct", booth.tpp_alp_pct));
      circle.setAttribute("class", "booth");
      circle.dataset.district = booth.district;
      circle.addEventListener("mouseenter", (event) => {
        state.hoverDistrict = booth.district;
        updateDistrictClasses();
        renderDetails();
        showTooltip(event, boothTooltip(booth));
      });
      circle.addEventListener("mousemove", moveTooltip);
      circle.addEventListener("mouseleave", () => {
        state.hoverDistrict = null;
        updateDistrictClasses();
        renderDetails();
        hideTooltip();
      });
      circle.addEventListener("click", (event) => {
        event.stopPropagation();
        selectDistrict(booth.district, true);
      });
      boothGroup.appendChild(circle);
    });

    viewport.appendChild(districtGroup);
    viewport.appendChild(boothGroup);
    elements.svg.appendChild(viewport);
    applyTransform(state.transform.scale, state.transform.tx, state.transform.ty);
    updateDistrictClasses();
    bindPointerHandlers();
  }

  function updateDistrictClasses() {
    const active = selectedOrHovered();
    elements.svg.querySelectorAll(".district").forEach((node) => {
      const selected = node.dataset.district === state.selectedDistrict;
      const hover = node.dataset.district === state.hoverDistrict;
      const dimmed = Boolean(active) && !selected && !hover && node.dataset.district !== active;
      node.classList.toggle("selected", selected || hover);
      node.classList.toggle("dimmed", dimmed);
    });
    elements.svg.querySelectorAll(".booth").forEach((node) => {
      if (!active) node.style.opacity = "0.82";
      else node.style.opacity = node.dataset.district === active || node.dataset.district === state.selectedDistrict ? "0.96" : "0.12";
    });
  }

  function districtTooltip(row) {
    return `<strong>${row.district}, ${row.state}</strong>
      Rank ${row.representative_rank} of ${currentDistricts().length}<br>
      Representative: ${fmt(row.representative_score)}<br>
      Risk: ${fmt(row.gerrymander_index)}<br>
      ALP TPP: ${fmt(row.tpp_alp_pct, 2)}%<br>
      Enrolment: ${fmtInt(row.enrolment)}`;
  }

  function boothTooltip(booth) {
    return `<strong>${booth.name}</strong>
      ${booth.district}<br>
      ALP TPP: ${fmt(booth.tpp_alp_pct, 2)}%<br>
      Votes: ${fmtInt(booth.total_votes)}<br>
      Lead primary: ${booth.leading_party || "Unavailable"}${booth.leading_party_pct ? ` (${fmt(booth.leading_party_pct, 2)}%)` : ""}`;
  }

  function showTooltip(event, html) {
    elements.tooltip.innerHTML = html;
    elements.tooltip.classList.remove("hidden");
    moveTooltip(event);
  }

  function moveTooltip(event) {
    const rect = elements.mapWrap.getBoundingClientRect();
    elements.tooltip.style.left = `${event.clientX - rect.left}px`;
    elements.tooltip.style.top = `${event.clientY - rect.top}px`;
  }

  function hideTooltip() {
    elements.tooltip.classList.add("hidden");
  }

  function bindPointerHandlers() {
    elements.svg.onpointerdown = (event) => {
      if (event.target.closest && (event.target.closest("path") || event.target.closest("circle"))) return;
      state.drag = { x: event.clientX, y: event.clientY, tx: state.transform.tx, ty: state.transform.ty };
      elements.svg.setPointerCapture(event.pointerId);
    };
    elements.svg.onpointermove = (event) => {
      if (!state.drag) return;
      applyTransform(
        state.transform.scale,
        state.drag.tx + (event.clientX - state.drag.x),
        state.drag.ty + (event.clientY - state.drag.y)
      );
    };
    elements.svg.onpointerup = () => {
      state.drag = null;
    };
    elements.svg.onwheel = (event) => {
      event.preventDefault();
      const rect = elements.svg.getBoundingClientRect();
      const anchorX = ((event.clientX - rect.left) / rect.width) * VIEWBOX.width;
      const anchorY = ((event.clientY - rect.top) / rect.height) * VIEWBOX.height;
      const factor = event.deltaY < 0 ? 1.14 : 0.88;
      setZoom(state.transform.scale * factor, anchorX, anchorY);
    };
    elements.svg.onclick = () => {
      state.selectedDistrict = null;
      renderDetails();
      updateDistrictClasses();
      renderTable();
      elements.districtSearch.value = "";
    };
  }

  function sortedRows() {
    const rows = [...currentDistricts()];
    const dir = state.sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const av = a[state.sortKey];
      const bv = b[state.sortKey];
      if (av === bv) return a.district.localeCompare(b.district);
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "string") return av.localeCompare(bv) * dir;
      return (av - bv) * dir;
    });
    return rows;
  }

  function renderTable() {
    elements.tableBody.innerHTML = "";
    sortedRows().forEach((row) => {
      const tr = document.createElement("tr");
      tr.dataset.district = row.district;
      if (row.district === state.selectedDistrict) tr.classList.add("selected");
      const cells = [
        row.representative_rank,
        row.district,
        row.state,
        fmt(row.representative_score),
        fmt(row.gerrymander_index),
        fmt(row.shape_irregularity),
        fmt(row.packing_signal),
        fmt(row.quota_deviation_pct, 2),
        fmt(row.tpp_alp_pct, 2),
        fmt(row.tpp_margin_pct, 2),
        fmt(row.tpp_swing, 2),
        fmtInt(row.enrolment),
        fmt(row.turnout_pct, 2),
        fmt(row.booth_tpp_stddev, 2),
        fmt(row.effective_parties, 3),
        row.top_primary_party || "Unavailable",
        fmt(row.top_primary_pct, 2),
        fmt(row.vote_type_skew, 2),
        fmt(row.polsby_popper, 4),
        fmt(row.reock, 4),
      ];
      cells.forEach((value) => {
        const td = document.createElement("td");
        td.textContent = value;
        if (value === "Unavailable") td.className = "empty";
        tr.appendChild(td);
      });
      tr.addEventListener("mouseenter", () => {
        state.hoverDistrict = row.district;
        updateDistrictClasses();
        renderDetails();
      });
      tr.addEventListener("mouseleave", () => {
        state.hoverDistrict = null;
        updateDistrictClasses();
        renderDetails();
      });
      tr.addEventListener("click", () => {
        selectDistrict(row.district, true);
      });
      elements.tableBody.appendChild(tr);
    });
  }

  function bindTableSorting() {
    document.querySelectorAll("th[data-key]").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.key;
        if (state.sortKey === key) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        else {
          state.sortKey = key;
          state.sortDir = key === "district" || key === "state" || key === "top_primary_party" ? "asc" : "desc";
          if (key === "representative_rank") state.sortDir = "asc";
        }
        renderTable();
      });
    });
  }

  function renderMapTab() {
    renderYearButtons();
    renderMetricSelect();
    renderDistrictOptions();
    renderPresetSelect();
    updateLegend();
    updateSummary();
    renderMap();
    fitRows(currentDistricts(), 1.02);
    renderDetails();
    renderTable();
  }

  function bindControls() {
    elements.metricSelect.addEventListener("change", () => {
      state.metric = elements.metricSelect.value;
      updateLegend();
      renderMap();
    });
    elements.boothToggle.addEventListener("change", () => {
      state.showBooths = elements.boothToggle.checked;
      updateBoothLayer();
    });
    elements.zoomPreset.addEventListener("change", () => {
      applyPreset(elements.zoomPreset.value);
    });
    elements.districtSearch.addEventListener("change", () => {
      if (elements.districtSearch.value.trim()) selectDistrict(elements.districtSearch.value.trim(), true);
    });
    elements.zoomIn.addEventListener("click", () => {
      setZoom(state.transform.scale * 1.18);
    });
    elements.zoomOut.addEventListener("click", () => {
      setZoom(state.transform.scale / 1.18);
    });
    elements.zoomSlider.addEventListener("input", () => {
      setZoom(Number(elements.zoomSlider.value));
    });
    elements.resetZoom.addEventListener("click", () => {
      fitRows(currentDistricts(), 1.02);
    });
    elements.clearSelection.addEventListener("click", () => {
      state.selectedDistrict = null;
      elements.districtSearch.value = "";
      renderDetails();
      updateDistrictClasses();
      renderTable();
    });
  }

  function renderStaticPages() {
    renderExecutivePage();
    renderMetricsPage();
    renderReportPage();
    renderElectoralPage();
    renderStakeholderPage();
  }

  state.bounds = currentProjectedBounds();
  renderTabs();
  updateVisibleTab();
  renderStaticPages();
  renderMapTab();
  bindControls();
  bindTableSorting();
})();
