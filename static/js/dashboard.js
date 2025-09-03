// Minimal dashboard that calls the Django API in real time and renders charts with Chart.js

let state = {
  datasetId: null,
  charts: {},
};

async function api(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function fmtBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B","KB","MB","GB","TB"];
  const i = Math.floor(Math.log(bytes)/Math.log(k));
  return parseFloat((bytes/Math.pow(k,i)).toFixed(2))+" "+sizes[i];
}

function setKPI(id, value) {
  document.getElementById(id).textContent = value;
}

function ensureChart(ctxId, type, data, options={}) {
  if (state.charts[ctxId]) {
    state.charts[ctxId].data = data;
    state.charts[ctxId].options = options;
    state.charts[ctxId].update();
    return state.charts[ctxId];
  }
  const ctx = document.getElementById(ctxId).getContext("2d");
  const ch = new Chart(ctx, { type, data, options });
  state.charts[ctxId] = ch;
  return ch;
}

async function refreshAll() {
  if (!state.datasetId) return;
  const base = `/api/datasets/${state.datasetId}`;

  // Overview KPIs
  const ov = await api(`${base}/summary/`);
  setKPI("kpi-rows", ov.rows);
  setKPI("kpi-cols", ov.columns);
  setKPI("kpi-mem", fmtBytes(ov.memory_bytes));
  setKPI("kpi-dup", ov.duplicate_rows);
  setKPI("kpi-miss", `${ov.missing_total} (${ov.missing_pct.toFixed(2)}%)`);

  // Missing by column
  const miss = await api(`${base}/missing/`);
  const missLabels = miss.missing_by_column.map(d => d.column);
  const missCounts = miss.missing_by_column.map(d => d.missing);
  ensureChart("chart-missing", "bar", {
    labels: missLabels,
    datasets: [{ label: "Nulos por columna", data: missCounts }]
  }, { responsive: true, plugins: { legend: { display: false }}, scales: { x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 0 }}}});

  // Dtypes distribution (from dtypes list)
  const dtypes = await api(`${base}/dtypes/`);
  const inferredCounts = {};
  dtypes.dtypes.forEach(d => {
    const k = d.inferred || d.dtype;
    inferredCounts[k] = (inferredCounts[k] || 0) + 1;
  });
  ensureChart("chart-dtypes", "pie", {
    labels: Object.keys(inferredCounts),
    datasets: [{ label: "Tipos inferidos", data: Object.values(inferredCounts) }]
  });

  // Cardinality (nunique)
  const nu = await api(`${base}/nunique/`);
  ensureChart("chart-nunique", "bar", {
    labels: nu.nunique.map(d => d.column),
    datasets: [{ label: "Únicos por columna", data: nu.nunique.map(d => d.unique) }]
  }, { responsive: true, plugins: { legend: { display: false }}, scales: { x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 0 }}}});

  // Columns dropdown for histogram
  const cols = await api(`${base}/columns/`);
  const sel = document.getElementById("hist-col");
  sel.innerHTML = "";
  cols.columns.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c; opt.textContent = c;
    sel.appendChild(opt);
  });
  if (cols.columns.length) {
    sel.value = cols.columns[0];
    await drawHistogram(sel.value);
  }

  // Correlation top pairs (bar)
  const pairs = await api(`${base}/corr/`);
  ensureChart("chart-corr", "bar", {
    labels: pairs.pairs.map(p => `${p.a} ~ ${p.b}`),
    datasets: [{ label: "Correlación (abs)", data: pairs.pairs.map(p => Math.abs(p.corr)) }]
  }, { responsive: true, plugins: { legend: { display: false }}, scales: { y: { min: 0, max: 1 }}});

  // Head table
  const head = await api(`${base}/head/?n=7`);
  renderTable("preview-table", head.head);

  // Duplicates table
  const dups = await api(`${base}/duplicates/`);
  renderTable("dups-table", dups.duplicates_sample);
  setKPI("kpi-dup", dups.count);
}

async function drawHistogram(column) {
  const base = `/api/datasets/${state.datasetId}`;
  const res = await api(`${base}/histogram/?col=${encodeURIComponent(column)}`);
  if (res.type === "numeric") {
    const labels = [];
    for (let i = 0; i < res.edges.length - 1; i++) {
      labels.push(`[${res.edges[i].toFixed(2)}, ${res.edges[i+1].toFixed(2)})`);
    }
    ensureChart("chart-hist", "bar", { labels, datasets: [{ label: `Histograma de ${column}`, data: res.counts }] },
      { plugins: { legend: { display: false }}, scales: { x: { ticks: { autoSkip: true }}}});
  } else if (res.type === "categorical" || res.type === "datetime") {
    ensureChart("chart-hist", "bar", { labels: res.labels, datasets: [{ label: `Frecuencias de ${column}`, data: res.counts }] },
      { plugins: { legend: { display: false }}, scales: { x: { ticks: { autoSkip: false, maxRotation: 45 }}}});
  }
}

function renderTable(id, rows) {
  const el = document.getElementById(id);
  el.innerHTML = "";
  if (!rows || rows.length === 0) {
    el.textContent = "Sin datos.";
    return;
  }
  const cols = Object.keys(rows[0]);
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  cols.forEach(c => {
    const th = document.createElement("th"); th.textContent = c; trh.appendChild(th);
  });
  thead.appendChild(trh);
  const tbody = document.createElement("tbody");
  rows.forEach(r => {
    const tr = document.createElement("tr");
    cols.forEach(c => {
      const td = document.createElement("td"); td.textContent = r[c];
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  el.appendChild(thead); el.appendChild(tbody);
}

async function onUpload(e) {
  e.preventDefault();
  const form = document.getElementById("upload-form");
  const body = new FormData(form);
  const res = await fetch("/api/datasets/", { method: "POST", body });
  if (!res.ok) {
    alert(await res.text());
    return;
  }
  const data = await res.json();
  state.datasetId = data.id;
  await refreshAll();
}

async function init() {
  // load most recent dataset if exists
  const ds = await api("/api/datasets/");
  if (ds.datasets.length) {
    state.datasetId = ds.datasets[0].id;
  }
  document.getElementById("upload-form").addEventListener("submit", onUpload);
  document.getElementById("hist-col").addEventListener("change", (e) => drawHistogram(e.target.value));
  await refreshAll();
}

document.addEventListener("DOMContentLoaded", init);
