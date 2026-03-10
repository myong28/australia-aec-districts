(function () {
  const bundle = window.AEC_ANALYSIS_DATA;
  const years = [...new Set(bundle.rows.map((row) => row.year))].sort();

  const state = {
    year: years[years.length - 1],
    sortKey: "representative_rank",
    sortDir: "asc",
    hoveredDistrict: null,
  };

  const yearControls = document.getElementById("year-controls");
  const mapSvg = document.getElementById("map-svg");
  const mapSubtitle = document.getElementById("map-subtitle");
  const tooltip = document.getElementById("map-tooltip");
  const selectionName = document.getElementById("selection-name");
  const selectionRank = document.getElementById("selection-rank");
  const statsGrid = document.getElementById("district-stats");
  const tableBody = document.getElementById("district-table-body");
  const summaryBlock = document.getElementById("top-bottom-summary");
  const limitationsList = document.getElementById("limitations");

  function fmt(value, digits = 1) {
    if (value === null || value === undefined) {
      return "Unavailable";
    }
    if (typeof value === "number") {
      return value.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
    }
    return String(value);
  }

  function fmtInt(value) {
    if (value === null || value === undefined) {
      return "Unavailable";
    }
    return Number(value).toLocaleString();
  }

  function metricColor(index) {
    const t = Math.max(0, Math.min(1, index / 100));
    const stops = [
      [47, 124, 89],
      [217, 191, 96],
      [180, 72, 54],
    ];
    const scaled = t * (stops.length - 1);
    const i = Math.floor(scaled);
    const frac = scaled - i;
    const a = stops[i];
    const b = stops[Math.min(i + 1, stops.length - 1)];
    const mix = a.map((channel, idx) => Math.round(channel + (b[idx] - channel) * frac));
    return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
  }

  function yearRows() {
    return bundle.rows.filter((row) => row.year === state.year);
  }

  function findDistrict(name) {
    return yearRows().find((row) => row.district === name) || null;
  }

  function yearBounds(rows) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
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
    return { minX, minY, maxX, maxY };
  }

  function transformFactory(bounds) {
    const width = 1100;
    const height = 760;
    const pad = 28;
    const scale = Math.min(
      (width - pad * 2) / (bounds.maxX - bounds.minX),
      (height - pad * 2) / (bounds.maxY - bounds.minY)
    );
    const xOffset = (width - (bounds.maxX - bounds.minX) * scale) / 2;
    const yOffset = (height - (bounds.maxY - bounds.minY) * scale) / 2;
    return function project(point) {
      const [x, y] = point;
      return [xOffset + (x - bounds.minX) * scale, height - (yOffset + (y - bounds.minY) * scale)];
    };
  }

  function pathData(rings, project) {
    return rings
      .map((ring) =>
        ring
          .map((point, index) => {
            const [x, y] = project(point);
            return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" ") + " Z"
      )
      .join(" ");
  }

  function renderYearControls() {
    yearControls.innerHTML = "";
    years.forEach((year) => {
      const button = document.createElement("button");
      button.textContent = year;
      button.className = year === state.year ? "active" : "";
      button.addEventListener("click", () => {
        state.year = year;
        state.hoveredDistrict = null;
        render();
      });
      yearControls.appendChild(button);
    });
  }

  function renderSummary() {
    const summary = bundle.summary.years[state.year];
    mapSubtitle.textContent = `${summary.district_count} districts. Mean representative score ${summary.mean_representative_score}.`;
    summaryBlock.innerHTML = "";

    const cards = [
      { title: "Most representative", rows: summary.most_representative },
      { title: "Most irregular", rows: summary.most_irregular },
    ];
    cards.forEach((card) => {
      const article = document.createElement("article");
      const heading = document.createElement("h3");
      heading.textContent = card.title;
      const list = document.createElement("ol");
      card.rows.slice(0, 5).forEach((row) => {
        const item = document.createElement("li");
        item.textContent = `${row.district} (${fmt(row.representative_score)} rep / ${fmt(row.gerrymander_index)} irr.)`;
        list.appendChild(item);
      });
      article.appendChild(heading);
      article.appendChild(list);
      summaryBlock.appendChild(article);
    });

    limitationsList.innerHTML = "";
    bundle.summary.limitations.forEach((line) => {
      const item = document.createElement("li");
      item.textContent = line;
      limitationsList.appendChild(item);
    });
  }

  function renderStats(row) {
    if (!row) {
      selectionName.textContent = "Hover a district";
      selectionRank.textContent = "";
      statsGrid.innerHTML = '<div><dt>Status</dt><dd>Hover a district or row</dd></div>';
      return;
    }

    selectionName.textContent = `${row.district}, ${row.state || "Unknown"}`;
    selectionRank.textContent = `Rank ${row.representative_rank} of ${yearRows().length}`;
    const fields = [
      ["Representative score", fmt(row.representative_score)],
      ["Irregularity index", fmt(row.gerrymander_index)],
      ["Polsby-Popper", fmt(row.polsby_popper, 4)],
      ["Reock", fmt(row.reock, 4)],
      ["Convex hull ratio", fmt(row.convex_hull_ratio, 4)],
      ["Components", fmtInt(row.components)],
      ["Area sq km", fmt(row.computed_area_sqkm, 1)],
      ["Perimeter km", fmt(row.perimeter_km, 1)],
      ["CCDs", fmtInt(row.num_ccds)],
      ["Actual population", fmtInt(row.population_actual)],
      ["Projected population", fmtInt(row.population_projected)],
      ["Total population", fmtInt(row.population_total)],
    ];
    statsGrid.innerHTML = "";
    fields.forEach(([label, value]) => {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = `<dt>${label}</dt><dd>${value}</dd>`;
      statsGrid.appendChild(wrapper);
    });
  }

  function setHoveredDistrict(name) {
    state.hoveredDistrict = name;
    const row = name ? findDistrict(name) : null;
    renderStats(row);
    [...mapSvg.querySelectorAll(".district")].forEach((path) => {
      const active = path.dataset.district === name;
      path.classList.toggle("active", active);
      path.classList.toggle("inactive", Boolean(name) && !active);
    });
    [...tableBody.querySelectorAll("tr")].forEach((tr) => {
      tr.classList.toggle("active", tr.dataset.district === name);
    });
  }

  function renderMap() {
    const rows = yearRows();
    const bounds = yearBounds(rows);
    const project = transformFactory(bounds);

    mapSvg.innerHTML = "";
    rows.forEach((row) => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathData(row.rings, project));
      path.setAttribute("fill", metricColor(row.gerrymander_index));
      path.setAttribute("class", "district");
      path.dataset.district = row.district;
      path.addEventListener("mouseenter", (event) => {
        const district = row.district;
        setHoveredDistrict(district);
        tooltip.classList.remove("hidden");
        tooltip.innerHTML = `<strong>${row.district}, ${row.state || "Unknown"}</strong>
          Rank ${row.representative_rank} of ${rows.length}<br>
          Representative score: ${fmt(row.representative_score)}<br>
          Irregularity index: ${fmt(row.gerrymander_index)}<br>
          Polsby-Popper: ${fmt(row.polsby_popper, 4)}`;
        moveTooltip(event);
      });
      path.addEventListener("mousemove", moveTooltip);
      path.addEventListener("mouseleave", () => {
        tooltip.classList.add("hidden");
        setHoveredDistrict(null);
      });
      mapSvg.appendChild(path);
    });
  }

  function moveTooltip(event) {
    const bounds = mapSvg.getBoundingClientRect();
    tooltip.style.left = `${event.clientX - bounds.left}px`;
    tooltip.style.top = `${event.clientY - bounds.top}px`;
  }

  function sortedRows() {
    const rows = [...yearRows()];
    const direction = state.sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const av = a[state.sortKey];
      const bv = b[state.sortKey];
      if (av === bv) {
        return a.district.localeCompare(b.district);
      }
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "string") {
        return av.localeCompare(bv) * direction;
      }
      return (av - bv) * direction;
    });
    return rows;
  }

  function renderTable() {
    tableBody.innerHTML = "";
    sortedRows().forEach((row) => {
      const tr = document.createElement("tr");
      tr.dataset.district = row.district;
      const cells = [
        row.representative_rank,
        row.district,
        row.state || "Unknown",
        fmt(row.representative_score),
        fmt(row.gerrymander_index),
        fmt(row.polsby_popper, 4),
        fmt(row.reock, 4),
        fmt(row.convex_hull_ratio, 4),
        fmtInt(row.components),
        fmtInt(row.population_actual),
        fmtInt(row.population_projected),
        fmtInt(row.population_total),
        fmt(row.computed_area_sqkm, 1),
        fmt(row.perimeter_km, 1),
        fmtInt(row.num_ccds),
      ];
      cells.forEach((value) => {
        const td = document.createElement("td");
        td.textContent = value;
        if (value === "Unavailable") td.className = "empty";
        tr.appendChild(td);
      });
      tr.addEventListener("mouseenter", () => setHoveredDistrict(row.district));
      tr.addEventListener("mouseleave", () => setHoveredDistrict(null));
      tableBody.appendChild(tr);
    });
  }

  function bindSorting() {
    document.querySelectorAll("th[data-key]").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.key;
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        } else {
          state.sortKey = key;
          state.sortDir = key === "district" || key === "state" ? "asc" : "desc";
          if (key === "representative_rank") {
            state.sortDir = "asc";
          }
        }
        renderTable();
      });
    });
  }

  function render() {
    renderYearControls();
    renderSummary();
    renderMap();
    renderTable();
    renderStats(null);
  }

  bindSorting();
  render();
})();
