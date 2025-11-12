// Dashboard simplificado que muestra solo lo esencial para limpieza de datos
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
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function setKPI(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function ensureChart(ctxId, type, data, options = {}) {
  // destruir gráfica previa
  if (state.charts[ctxId]) {
    state.charts[ctxId].destroy();
  }
  const ctx = document.getElementById(ctxId);
  if (!ctx) return;

  const chart = new Chart(ctx, {
    type,
    data,
    options: Object.assign(
      {
        responsive: true,
        aspectRatio: 2,
        plugins: { legend: { display: false } },
        layout: { padding: 4 },
      },
      options
    ),
  });

  state.charts[ctxId] = chart;
  return chart;
}

async function refreshAll() {
  if (!state.datasetId) return;
  const base = `/api/datasets/${state.datasetId}`;

  // === 1️⃣ KPIs ===
  const ov = await api(`${base}/summary/`);
  setKPI("kpi-rows", ov.rows);
  setKPI("kpi-cols", ov.columns);
  setKPI("kpi-mem", fmtBytes(ov.memory_bytes));
  setKPI("kpi-dup", ov.duplicate_rows);
  setKPI("kpi-miss", `${ov.missing_total} (${ov.missing_pct.toFixed(2)}%)`);

  // === 2️⃣ Nulos por columna (solo columnas con nulos) ===
  const miss = await api(`${base}/missing/`);
  const missFiltered = miss.missing_by_column
    .filter((d) => d.missing > 0)
    .sort((a, b) => b.missing - a.missing);

  ensureChart(
    "chart-missing",
    "bar",
    {
      labels: missFiltered.map((d) => d.column),
      datasets: [
        {
          label: "Nulos",
          data: missFiltered.map((d) => d.missing),
          backgroundColor: "#93c5fd",
          borderRadius: 3,
          barThickness: missFiltered.length > 10 ? 10 : 20,
        },
      ],
    },
    {
      scales: {
        x: {
          ticks: {
            autoSkip: false,
            maxRotation: 25,
            font: { size: 10 },
          },
          title: { display: true, text: "Columnas con valores nulos" },
        },
        y: {
          beginAtZero: true,
          ticks: { font: { size: 10 } },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.parsed.y.toLocaleString()} nulos`,
          },
        },
      },
    }
  );

  // === 3️⃣ Cardinalidad (% valores únicos, top 15, barras horizontales compactas) ===
  const nu = await api(`${base}/nunique/`);
  const cardData = nu.nunique
    .map((d) => ({
      column: d.column,
      pctUnique: (d.unique / ov.rows) * 100,
    }))
    .sort((a, b) => b.pctUnique - a.pctUnique)
    .slice(0, 15);

  ensureChart(
    "chart-nunique",
    "bar",
    {
      labels: cardData.map((d) => d.column),
      datasets: [
        {
          label: "% únicos",
          data: cardData.map((d) => d.pctUnique),
          backgroundColor: cardData.map((d) =>
            d.pctUnique === 100
              ? "#f87171"
              : d.pctUnique > 95
              ? "#fbbf24"
              : d.pctUnique < 2
              ? "#a3e635"
              : "#60a5fa"
          ),
          borderRadius: 3,
          barThickness: 12,
        },
      ],
    },
    {
      indexAxis: "y",
      scales: {
        x: {
          max: 100,
          ticks: { callback: (v) => v + "%", font: { size: 10 } },
          grid: { display: true },
        },
        y: {
          ticks: { font: { size: 10 }, autoSkip: false },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => ctx.parsed.x.toFixed(2) + "% únicos",
          },
        },
      },
    }
  );

  // === 4️⃣ Dropdown de columnas para histograma ===
  const cols = await api(`${base}/columns/`);
  const sel = document.getElementById("hist-col");
  sel.innerHTML = "";
  cols.columns.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  });
  const chartHist = document.getElementById("chart-hist");
  if (cols.columns.length) {
    chartHist.classList.remove("hidden");
    sel.value = cols.columns[0];
    await drawHistogram(sel.value);
  } else {
    chartHist.classList.add("hidden");
  }

  // === 5️⃣ Duplicados ===
  const dups = await api(`${base}/duplicates/`);
  renderTable("dups-table", dups.duplicates_sample);
  setKPI("kpi-dup", dups.count);
}

// === 6️⃣ Histograma dinámico ===
async function drawHistogram(column) {
  const base = `/api/datasets/${state.datasetId}`;
  const res = await api(`${base}/histogram/?col=${encodeURIComponent(column)}`);
  const ctxId = "chart-hist";

  if (res.type === "numeric") {
    const labels = [];
    for (let i = 0; i < res.edges.length - 1; i++) {
      labels.push(`[${res.edges[i].toFixed(2)}, ${res.edges[i + 1].toFixed(2)})`);
    }
    ensureChart(
      ctxId,
      "bar",
      {
        labels,
        datasets: [
          {
            label: `Distribución de ${column}`,
            data: res.counts,
            backgroundColor: "#93c5fd",
          },
        ],
      },
      {
        aspectRatio: 2.5,
        plugins: { legend: { display: false } },
        scales: { x: { ticks: { autoSkip: true, font: { size: 10 } } } },
      }
    );
  } else if (["categorical", "datetime"].includes(res.type)) {
    ensureChart(
      ctxId,
      "bar",
      {
        labels: res.labels,
        datasets: [
          {
            label: `Frecuencias de ${column}`,
            data: res.counts,
            backgroundColor: "#93c5fd",
          },
        ],
      },
      {
        aspectRatio: 2.5,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { autoSkip: false, maxRotation: 40, font: { size: 10 } } },
        },
      }
    );
  }
}

// === 7️⃣ Render de tablas ===
function renderTable(id, rows) {
  const el = document.getElementById(id);
  el.innerHTML = "";
  if (!rows || rows.length === 0) {
    el.innerHTML =
      "<tr><td class='text-center text-slate-500 p-2'>Sin datos</td></tr>";
    return;
  }

  const cols = Object.keys(rows[0]);
  let html = "<thead><tr>";
  cols.forEach((c) => {
    html += `<th class='border bg-slate-100 p-1 text-xs'>${c}</th>`;
  });
  html += "</tr></thead><tbody>";

  rows.forEach((r) => {
    html += "<tr>";
    cols.forEach((c) => {
      html += `<td class='border p-1 text-xs truncate max-w-[150px]'>${r[c]}</td>`;
    });
    html += "</tr>";
  });
  html += "</tbody>";
  el.innerHTML = html;
}

// === 8️⃣ Upload handler ===
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

// === 9️⃣ Init ===
async function init() {
  try {
    const ds = await api("/api/datasets/");
    if (ds.datasets.length) state.datasetId = ds.datasets[0].id;
  } catch (e) {
    console.warn("Sin datasets previos");
  }

  document
    .getElementById("upload-form")
    .addEventListener("submit", onUpload);
  document
    .getElementById("hist-col")
    .addEventListener("change", (e) => drawHistogram(e.target.value));
  await refreshAll();
}

document.addEventListener("DOMContentLoaded", init);
