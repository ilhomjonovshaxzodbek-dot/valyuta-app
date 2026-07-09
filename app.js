/* ==========================================================================
   VALYUTA APP — asosiy mantiq
   ========================================================================== */

const state = {
  rows: [
    { id: 1, code: "UZS" },
    { id: 2, code: "USD" },
  ],
  nextRowId: 3,
  activeRowId: 2,
  rawInput: "1",
  rates: {},        // { usd: 1, eur: 0.92, uzs: 12700, ... } — 1 USD ga nisbatan
  rateDate: null,
  editMode: false,
  pickerTargetRowId: null,
  historyTimer: null,
};

const CURR_BY_CODE = {};
CURRENCIES.forEach((c) => (CURR_BY_CODE[c.code] = c));

/* -------------------------- Yordamchi funksiyalar -------------------------- */

function parseInput(str) {
  const n = parseFloat(String(str).replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function formatNumber(value) {
  if (!isFinite(value)) return "0";
  const abs = Math.abs(value);
  let decimals = 2;
  if (abs === 0) decimals = 0;
  else if (abs < 1) decimals = 4;
  else if (abs >= 1000) decimals = 2;

  let fixed = value.toFixed(decimals);
  let [intPart, decPart] = fixed.split(".");
  const negative = intPart.startsWith("-");
  if (negative) intPart = intPart.slice(1);
  intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  let result = (negative ? "-" : "") + intPart;
  if (decPart && parseInt(decPart, 10) !== 0) result += "," + decPart.replace(/0+$/, "");
  return result;
}

function convert(amount, fromCode, toCode) {
  const from = state.rates[fromCode.toLowerCase()];
  const to = state.rates[toCode.toLowerCase()];
  if (!from || !to) return 0;
  return (amount / from) * to;
}

function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}

/* -------------------------- Kurslarni yuklash -------------------------- */

async function loadRates() {
  const sourceNote = document.getElementById("sourceNote");
  const headerDate = document.getElementById("headerDate");
  const headerDateSide = document.getElementById("headerDateSide");
  const endpoints = [
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
    "https://latest.currency-api.pages.dev/v1/currencies/usd.json",
  ];

  let loaded = false;
  for (const url of endpoints) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (data && data.usd) {
        state.rates = data.usd;
        state.rates.usd = 1;
        state.rateDate = data.date;
        loaded = true;
        break;
      }
    } catch (e) {
      /* keyingi manbaga o'tamiz */
    }
  }

  // CBU.uz rasmiy kursi bilan UZS ni aniqlashtirish (mavjud bo'lsa)
  try {
    const cbuRes = await fetch("https://cbu.uz/uz/arkhiv-kursov-valyut/json/all/");
    if (cbuRes.ok) {
      const cbuData = await cbuRes.json();
      const usdEntry = Array.isArray(cbuData) ? cbuData.find((c) => c.Ccy === "USD") : null;
      if (usdEntry) {
        const officialRate = parseFloat(usdEntry.Rate) / parseFloat(usdEntry.Nominal || 1);
        if (officialRate > 0) state.rates.uzs = officialRate;
      }
    }
  } catch (e) {
    /* CBU.uz manbasidan foydalanib bo'lmadi, davom etamiz */
  }

  if (loaded) {
    headerDate.textContent = "Real vaqt kursi";
    if (headerDateSide) headerDateSide.textContent = "Real vaqt kursi";
    sourceNote.textContent = `Valyuta kurslari — ${formatDisplayDate(state.rateDate)} holatiga`;
  } else {
    headerDate.textContent = "Ulanishda xatolik";
    if (headerDateSide) headerDateSide.textContent = "Ulanishda xatolik";
    sourceNote.textContent = "Kurslarni yuklab bo'lmadi. Internetni tekshiring va qayta urinib ko'ring.";
  }
  renderRows();
  refreshHistoryRateChart();
}

/* -------------------------- Valyuta qatorlari (Asosiy) -------------------------- */

const GRAD_COUNT = 6;

function renderRows() {
  const container = document.getElementById("currencyRows");
  container.className = "currency-rows" + (state.editMode ? " editable" : "");
  container.innerHTML = "";

  const activeRow = state.rows.find((r) => r.id === state.activeRowId) || state.rows[0];
  const inputAmount = parseInput(state.rawInput);

  state.rows.forEach((row, idx) => {
    const meta = CURR_BY_CODE[row.code] || { uz: row.code, country: "UN" };
    const isActive = row.id === state.activeRowId;
    const amount = isActive ? inputAmount : convert(inputAmount, activeRow.code, row.code);
    const displayValue = isActive ? state.rawInput.replace(".", ",") : formatNumber(amount);

    const el = document.createElement("div");
    el.className = `currency-row grad-${idx % GRAD_COUNT}`;
    el.dataset.rowId = row.id;
    el.innerHTML = `
      <button class="row-remove" data-remove="${row.id}">✕</button>
      <div class="row-left">
        <div class="row-flag">${getFlagEmoji(meta.country)}</div>
        <div>
          <button class="row-select-btn" data-select="${row.id}">${row.code} <span class="caret">▾</span></button>
          <div class="row-name-caption">${meta.uz}</div>
        </div>
      </div>
      <div class="row-right" data-activate="${row.id}">
        <div class="row-value">${displayValue}</div>
      </div>
    `;
    container.appendChild(el);
  });
}

function setActiveRow(rowId) {
  if (state.activeRowId === rowId) return;
  state.activeRowId = rowId;
  state.rawInput = "0";
  renderRows();
}

function handleKey(key) {
  if (key === "AC") {
    state.rawInput = "0";
  } else if (key === "BACK") {
    state.rawInput = state.rawInput.length > 1 ? state.rawInput.slice(0, -1) : "0";
  } else if (key === ",") {
    if (!state.rawInput.includes(",") && !state.rawInput.includes(".")) state.rawInput += ",";
  } else {
    // raqam
    if (state.rawInput === "0") state.rawInput = key;
    else if (state.rawInput.replace(/[,.]/g, "").length < 12) state.rawInput += key;
  }
  renderRows();
  queueHistorySave();
}

function queueHistorySave() {
  clearTimeout(state.historyTimer);
  state.historyTimer = setTimeout(() => {
    const amount = parseInput(state.rawInput);
    if (amount <= 0) return;
    const activeRow = state.rows.find((r) => r.id === state.activeRowId);
    const otherRow = state.rows.find((r) => r.id !== state.activeRowId);
    if (!activeRow || !otherRow) return;
    const result = convert(amount, activeRow.code, otherRow.code);
    if (!result) return;
    saveHistoryEntry({
      from: activeRow.code,
      to: otherRow.code,
      amount,
      result,
      time: Date.now(),
    });
  }, 1600);
}

function addRow() {
  const usedCodes = state.rows.map((r) => r.code);
  const next = CURRENCIES.find((c) => !usedCodes.includes(c.code)) || CURRENCIES[0];
  const newRow = { id: state.nextRowId++, code: next.code };
  state.rows.push(newRow);
  renderRows();
  openPicker(newRow.id);
}

function removeRow(rowId) {
  if (state.rows.length <= 2) return;
  state.rows = state.rows.filter((r) => r.id !== rowId);
  if (state.activeRowId === rowId) state.activeRowId = state.rows[0].id;
  renderRows();
}

/* -------------------------- Valyuta tanlash modal -------------------------- */

function openPicker(rowId) {
  state.pickerTargetRowId = rowId;
  document.getElementById("pickerOverlay").classList.add("open");
  document.getElementById("pickerSearch").value = "";
  document.getElementById("pickerSearch").focus();
  renderPickerList("");
}

function closePicker() {
  document.getElementById("pickerOverlay").classList.remove("open");
  state.pickerTargetRowId = null;
}

function renderPickerList(query) {
  const list = document.getElementById("pickerList");
  const q = query.trim().toLowerCase();
  const filtered = CURRENCIES.filter(
    (c) => c.code.toLowerCase().includes(q) || c.uz.toLowerCase().includes(q)
  );
  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state">Valyuta topilmadi. Boshqa nom yoki kod bilan qidiring.</div>`;
    return;
  }
  list.innerHTML = filtered
    .map(
      (c) => `
      <div class="modal-list-item" data-code="${c.code}">
        <div class="flag">${getFlagEmoji(c.country)}</div>
        <div class="names">
          <div class="uz-name">${c.uz}</div>
          <div class="code">${c.code}</div>
        </div>
      </div>`
    )
    .join("");
}

function selectCurrencyForRow(code) {
  const rowId = state.pickerTargetRowId;
  if (!rowId) return;
  const row = state.rows.find((r) => r.id === rowId);
  if (!row) return;
  const clash = state.rows.find((r) => r.code === code && r.id !== rowId);
  if (clash) clash.code = row.code; // ikkita qatorda bir xil valyuta bo'lmasligi uchun almashtiramiz
  row.code = code;
  closePicker();
  renderRows();
}

/* -------------------------- Tarix (History) -------------------------- */

const HISTORY_KEY = "valyuta_app_history_v1";

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveHistoryEntry(entry) {
  const list = loadHistory();
  const last = list[0];
  if (last && last.from === entry.from && last.to === entry.to && Math.abs(last.amount - entry.amount) < 0.0001) {
    return; // bir xil yozuvni takrorlamaymiz
  }
  list.unshift(entry);
  while (list.length > 60) list.pop();
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  if (document.getElementById("tab-tarix").classList.contains("active")) renderHistory();
}

function removeHistoryEntry(time) {
  const list = loadHistory().filter((e) => e.time !== time);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  renderHistory();
}

function clearHistory() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify([]));
  renderHistory();
}

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });
  return sameDay ? `Bugun, ${time}` : `${formatDisplayDate(todayStr(d))}, ${time}`;
}

function renderHistory() {
  const container = document.getElementById("historyList");
  const list = loadHistory();

  let chartHtml = `<div id="rateChartWrap"></div>`;

  if (list.length === 0) {
    container.innerHTML =
      chartHtml +
      `<div class="empty-state glass-card" style="margin-top:8px;">Hali hech qanday amal yo'q.<br>Asosiy bo'limda valyuta kiritsangiz, shu yerda saqlanadi.</div>`;
    refreshHistoryRateChart();
    return;
  }

  const itemsHtml = list
    .map(
      (e) => `
      <div class="history-item glass-card">
        <div class="h-left">
          <div class="h-pair">${formatNumber(e.amount)} ${e.from} → ${formatNumber(e.result)} ${e.to}</div>
          <div class="h-time">${formatTime(e.time)}</div>
        </div>
        <button class="h-remove" data-history-remove="${e.time}">✕</button>
      </div>`
    )
    .join("");

  container.innerHTML =
    chartHtml +
    `<div style="margin-top:14px;">${itemsHtml}</div>
     <button class="history-clear" id="clearHistoryBtn">Tarixni tozalash</button>`;

  refreshHistoryRateChart();

  document.getElementById("clearHistoryBtn").addEventListener("click", clearHistory);
  container.querySelectorAll("[data-history-remove]").forEach((btn) => {
    btn.addEventListener("click", () => removeHistoryEntry(Number(btn.dataset.historyRemove)));
  });
}

async function refreshHistoryRateChart() {
  const wrap = document.getElementById("rateChartWrap");
  if (!wrap) return;
  wrap.innerHTML = `<div class="glass-card" style="padding:18px;border-radius:18px;"><div class="rows-header" style="margin:0 0 10px;"><h2 style="margin:0;">1 USD → UZS (7 kun)</h2></div><div class="empty-state" style="padding:10px 0;">Yuklanmoqda...</div></div>`;

  try {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(todayStr(d));
    }
    const results = await Promise.allSettled(
      days.map((d) =>
        fetch(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${d}/v1/currencies/usd.json`).then((r) =>
          r.ok ? r.json() : Promise.reject()
        )
      )
    );
    const points = results
      .map((r, i) => (r.status === "fulfilled" && r.value.usd ? { date: days[i], value: r.value.usd.uzs } : null))
      .filter(Boolean);

    if (points.length < 2) {
      wrap.innerHTML = "";
      return;
    }
    wrap.innerHTML = buildSparklineCard(points);
  } catch (e) {
    wrap.innerHTML = "";
  }
}

function buildSparklineCard(points) {
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 280;
  const h = 70;
  const stepX = w / (points.length - 1);
  const coords = values.map((v, i) => {
    const x = i * stepX;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const first = values[0];
  const lastV = values[values.length - 1];
  const diff = lastV - first;
  const diffPct = first ? (diff / first) * 100 : 0;
  const diffColor = diff >= 0 ? "#38ef7d" : "#ff5858";
  const diffSign = diff >= 0 ? "+" : "";

  return `
    <div class="glass-card" style="padding:18px;border-radius:18px;">
      <div class="rows-header" style="margin:0 0 4px;">
        <h2 style="margin:0;">1 USD → UZS (7 kun)</h2>
      </div>
      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px;">
        <div style="font-family:'Sora',sans-serif;font-weight:700;font-size:20px;">${formatNumber(lastV)}</div>
        <div style="font-size:13px;font-weight:600;color:${diffColor};">${diffSign}${diffPct.toFixed(2)}%</div>
      </div>
      <svg viewBox="0 0 ${w} ${h}" width="100%" height="70" preserveAspectRatio="none">
        <polyline points="${coords.join(" ")}" fill="none" stroke="url(#g1)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <defs>
          <linearGradient id="g1" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#647dee"/>
            <stop offset="1" stop-color="#38ef7d"/>
          </linearGradient>
        </defs>
      </svg>
    </div>
  `;
}

/* ==========================================================================
   TARJIMA / O'LCHOV VOSITALARI ("Ko'proq" bo'limi)
   ========================================================================== */

const TOOLS = [
  { id: "calculator", icon: "🧮", label: "Kalkulyator" },
  { id: "uzunlik", icon: "📏", label: "Uzunlik", unitCategory: "uzunlik" },
  { id: "ogirlik", icon: "⚖️", label: "Og'irlik", unitCategory: "ogirlik" },
  { id: "suyuqlik", icon: "🧪", label: "Suyuqlik o'lchamlari", unitCategory: "suyuqlik" },
  { id: "vaqt", icon: "⏱️", label: "Vaqt o'lchash", unitCategory: "vaqt" },
  { id: "yol", icon: "🛣️", label: "Yo'l o'lchamlari", unitCategory: "yol" },
  { id: "harorat", icon: "🌡️", label: "Harorat" },
  { id: "maydon", icon: "🗺️", label: "Maydon", unitCategory: "maydon" },
  { id: "tezlik", icon: "🚀", label: "Tezlik", unitCategory: "tezlik" },
  { id: "yosh", icon: "🎂", label: "Yosh/sana" },
  { id: "foiz", icon: "📊", label: "Foiz kalkulyatori" },
  { id: "bmi", icon: "🧍", label: "BMI kalkulyatori" },
];

function renderToolsGrid() {
  const grid = document.getElementById("toolsGrid");
  grid.innerHTML = TOOLS.map(
    (t, i) => `
    <div class="tool-tile" data-tool="${t.id}" style="background:linear-gradient(135deg, ${gradPair(i)});">
      <div class="tool-icon">${t.icon}</div>
      <div class="tool-label">${t.label}</div>
    </div>`
  ).join("");

  grid.querySelectorAll("[data-tool]").forEach((tile) => {
    tile.addEventListener("click", () => openTool(tile.dataset.tool));
  });
}

function gradPair(i) {
  const pairs = [
    "rgba(17,153,142,0.35), rgba(56,239,125,0.15)",
    "rgba(127,83,172,0.35), rgba(100,125,238,0.15)",
    "rgba(33,147,176,0.35), rgba(109,213,237,0.15)",
    "rgba(248,87,166,0.35), rgba(255,88,88,0.15)",
    "rgba(247,151,30,0.35), rgba(255,210,0,0.15)",
    "rgba(10,207,254,0.35), rgba(73,90,255,0.15)",
  ];
  return pairs[i % pairs.length];
}

function openTool(toolId) {
  document.getElementById("toolsHome").style.display = "none";
  let view = document.getElementById(`tool-${toolId}`);
  if (!view) {
    view = document.createElement("div");
    view.className = "tool-view";
    view.id = `tool-${toolId}`;
    view.innerHTML = buildToolContent(toolId);
    document.getElementById("toolViews").appendChild(view);
    wireToolEvents(toolId, view);
  }
  document.querySelectorAll(".tool-view").forEach((v) => v.classList.remove("active"));
  view.classList.add("active");
}

function closeTool() {
  document.querySelectorAll(".tool-view").forEach((v) => v.classList.remove("active"));
  document.getElementById("toolsHome").style.display = "block";
}

function toolHeader(tool) {
  return `
    <div class="tool-back" data-tool-back>← Orqaga</div>
    <div class="tool-header">
      <div class="tool-icon-lg">${tool.icon}</div>
      <h2>${tool.label}</h2>
    </div>
  `;
}

function buildToolContent(toolId) {
  const tool = TOOLS.find((t) => t.id === toolId);
  if (tool.unitCategory) return toolHeader(tool) + buildUnitConverterHtml(tool.unitCategory);
  if (toolId === "calculator") return toolHeader(tool) + buildCalculatorHtml();
  if (toolId === "harorat") return toolHeader(tool) + buildTemperatureHtml();
  if (toolId === "yosh") return toolHeader(tool) + buildAgeHtml();
  if (toolId === "foiz") return toolHeader(tool) + buildPercentHtml();
  if (toolId === "bmi") return toolHeader(tool) + buildBmiHtml();
  return toolHeader(tool) + `<div class="empty-state">Tez kunda qo'shiladi.</div>`;
}

function wireToolEvents(toolId, view) {
  view.querySelector("[data-tool-back]").addEventListener("click", closeTool);
  const tool = TOOLS.find((t) => t.id === toolId);
  if (tool.unitCategory) wireUnitConverter(view, tool.unitCategory);
  else if (toolId === "calculator") wireCalculator(view);
  else if (toolId === "harorat") wireTemperature(view);
  else if (toolId === "yosh") wireAge(view);
  else if (toolId === "foiz") wirePercent(view);
  else if (toolId === "bmi") wireBmi(view);
}

/* ---------- Generik o'lchov birligi konvertori ---------- */

function buildUnitConverterHtml(categoryKey) {
  const cat = UNIT_CATEGORIES[categoryKey];
  const options = Object.entries(cat.units)
    .map(([key, u]) => `<option value="${key}">${u.label}</option>`)
    .join("");
  return `
    <div class="unit-row" style="background:linear-gradient(120deg, var(--purple-a), var(--purple-b));">
      <select class="u-from">${options}</select>
      <input type="text" inputmode="decimal" class="u-from-input" value="1">
    </div>
    <div class="unit-row" style="background:linear-gradient(120deg, var(--blue-a), var(--blue-b));">
      <select class="u-to">${options}</select>
      <input type="text" class="u-to-input" readonly>
    </div>
  `;
}

function wireUnitConverter(view, categoryKey) {
  const cat = UNIT_CATEGORIES[categoryKey];
  const fromSel = view.querySelector(".u-from");
  const toSel = view.querySelector(".u-to");
  const fromInput = view.querySelector(".u-from-input");
  const toInput = view.querySelector(".u-to-input");

  const keys = Object.keys(cat.units);
  toSel.value = keys[1] || keys[0];

  function recalc() {
    const val = parseInput(fromInput.value);
    const fromFactor = cat.units[fromSel.value].factor;
    const toFactor = cat.units[toSel.value].factor;
    const result = (val * fromFactor) / toFactor;
    toInput.value = formatNumber(result);
  }
  fromInput.addEventListener("input", recalc);
  fromSel.addEventListener("change", recalc);
  toSel.addEventListener("change", recalc);
  recalc();
}

/* ---------- Oddiy kalkulyator ---------- */

function buildCalculatorHtml() {
  return `
    <div class="calc-display" id="calcDisplay">0</div>
    <div class="calc-grid">
      <button class="calc-key op" data-c="C">C</button>
      <button class="calc-key op" data-c="±">±</button>
      <button class="calc-key op" data-c="%">%</button>
      <button class="calc-key op" data-c="÷">÷</button>

      <button class="calc-key" data-c="7">7</button>
      <button class="calc-key" data-c="8">8</button>
      <button class="calc-key" data-c="9">9</button>
      <button class="calc-key op" data-c="×">×</button>

      <button class="calc-key" data-c="4">4</button>
      <button class="calc-key" data-c="5">5</button>
      <button class="calc-key" data-c="6">6</button>
      <button class="calc-key op" data-c="−">−</button>

      <button class="calc-key" data-c="1">1</button>
      <button class="calc-key" data-c="2">2</button>
      <button class="calc-key" data-c="3">3</button>
      <button class="calc-key op" data-c="+">+</button>

      <button class="calc-key" data-c="0" style="grid-column: span 2;">0</button>
      <button class="calc-key" data-c=".">,</button>
      <button class="calc-key eq" data-c="=">=</button>
    </div>
  `;
}

function wireCalculator(view) {
  const display = view.querySelector("#calcDisplay");
  const calc = { display: "0", prev: null, operator: null, waiting: false };

  function render() {
    display.textContent = calc.display;
  }
  function apply(a, b, op) {
    switch (op) {
      case "+": return a + b;
      case "−": return a - b;
      case "×": return a * b;
      case "÷": return b === 0 ? NaN : a / b;
      default: return b;
    }
  }
  view.querySelectorAll("[data-c]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.c;
      if (key === "C") {
        Object.assign(calc, { display: "0", prev: null, operator: null, waiting: false });
      } else if (key === "±") {
        calc.display = String(parseFloat(calc.display) * -1);
      } else if (key === "%") {
        calc.display = String(parseFloat(calc.display) / 100);
      } else if (key === ".") {
        if (calc.waiting) { calc.display = "0,"; calc.waiting = false; }
        else if (!calc.display.includes(",")) calc.display += ",";
      } else if (["+", "−", "×", "÷"].includes(key)) {
        const current = parseFloat(calc.display.replace(",", "."));
        if (calc.operator && !calc.waiting) {
          calc.prev = apply(calc.prev, current, calc.operator);
          calc.display = String(calc.prev).replace(".", ",");
        } else {
          calc.prev = current;
        }
        calc.operator = key;
        calc.waiting = true;
      } else if (key === "=") {
        if (calc.operator != null) {
          const current = parseFloat(calc.display.replace(",", "."));
          const result = apply(calc.prev, current, calc.operator);
          calc.display = (isNaN(result) ? "Xato" : String(result)).replace(".", ",");
          calc.operator = null;
          calc.prev = null;
          calc.waiting = true;
        }
      } else {
        // raqam
        if (calc.waiting || calc.display === "0") { calc.display = key; calc.waiting = false; }
        else if (calc.display.replace(/[,\-]/g, "").length < 12) calc.display += key;
      }
      render();
    });
  });
}

/* ---------- Harorat ---------- */

function buildTemperatureHtml() {
  const opts = `
    <option value="C">Selsiy (°C)</option>
    <option value="F">Farengeyt (°F)</option>
    <option value="K">Kelvin (K)</option>`;
  return `
    <div class="unit-row" style="background:linear-gradient(120deg, var(--pink-a), var(--pink-b));">
      <select class="t-from">${opts}</select>
      <input type="text" inputmode="decimal" class="t-from-input" value="0">
    </div>
    <div class="unit-row" style="background:linear-gradient(120deg, var(--blue-a), var(--blue-b));">
      <select class="t-to">${opts}</select>
      <input type="text" class="t-to-input" readonly>
    </div>
  `;
}

function toCelsius(v, unit) {
  if (unit === "C") return v;
  if (unit === "F") return ((v - 32) * 5) / 9;
  return v - 273.15; // K
}
function fromCelsius(c, unit) {
  if (unit === "C") return c;
  if (unit === "F") return (c * 9) / 5 + 32;
  return c + 273.15; // K
}

function wireTemperature(view) {
  const fromSel = view.querySelector(".t-from");
  const toSel = view.querySelector(".t-to");
  const fromInput = view.querySelector(".t-from-input");
  const toInput = view.querySelector(".t-to-input");
  toSel.value = "F";

  function recalc() {
    const val = parseInput(fromInput.value);
    const result = fromCelsius(toCelsius(val, fromSel.value), toSel.value);
    toInput.value = formatNumber(result);
  }
  fromInput.addEventListener("input", recalc);
  fromSel.addEventListener("change", recalc);
  toSel.addEventListener("change", recalc);
  recalc();
}

/* ---------- Yosh / sana kalkulyatori ---------- */

function buildAgeHtml() {
  return `
    <div class="simple-field">
      <label>Tug'ilgan sana</label>
      <input type="date" id="ageBirth">
    </div>
    <div class="result-card" id="ageResult" style="background:linear-gradient(120deg, var(--purple-a), var(--blue-b));">
      <div class="result-value">—</div>
      <div class="result-label">Sanani tanlang</div>
    </div>
  `;
}

function wireAge(view) {
  const input = view.querySelector("#ageBirth");
  const resultCard = view.querySelector("#ageResult");
  input.addEventListener("change", () => {
    if (!input.value) return;
    const birth = new Date(input.value);
    const now = new Date();
    if (birth > now) {
      resultCard.querySelector(".result-value").textContent = "Noto'g'ri sana";
      resultCard.querySelector(".result-label").textContent = "Sana kelajakda bo'lishi mumkin emas";
      return;
    }
    let years = now.getFullYear() - birth.getFullYear();
    let months = now.getMonth() - birth.getMonth();
    let days = now.getDate() - birth.getDate();
    if (days < 0) {
      months -= 1;
      const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
      days += prevMonth;
    }
    if (months < 0) { years -= 1; months += 12; }
    const totalDays = Math.floor((now - birth) / (1000 * 60 * 60 * 24));
    resultCard.querySelector(".result-value").textContent = `${years} yosh, ${months} oy, ${days} kun`;
    resultCard.querySelector(".result-label").textContent = `Jami ${formatNumber(totalDays)} kun yashadingiz`;
  });
}

/* ---------- Foiz kalkulyatori ---------- */

function buildPercentHtml() {
  return `
    <div class="simple-field">
      <label>Hisoblash turi</label>
      <select id="pctMode">
        <option value="of">Sonning foizini topish (masalan: 250 dan 15%)</option>
        <option value="share">Necha foiz ekanini topish (masalan: 30 ning 120 dan necha %)</option>
        <option value="change">Foizli o'zgarishni topish (eskidan yangigacha)</option>
      </select>
    </div>
    <div class="simple-field"><label id="pctLabel1">Son</label><input type="text" inputmode="decimal" id="pctInput1" placeholder="0"></div>
    <div class="simple-field"><label id="pctLabel2">Foiz (%)</label><input type="text" inputmode="decimal" id="pctInput2" placeholder="0"></div>
    <div class="result-card" id="pctResult" style="background:linear-gradient(120deg, var(--green-a), var(--green-b));">
      <div class="result-value">—</div>
      <div class="result-label">Qiymatlarni kiriting</div>
    </div>
  `;
}

function wirePercent(view) {
  const mode = view.querySelector("#pctMode");
  const l1 = view.querySelector("#pctLabel1");
  const l2 = view.querySelector("#pctLabel2");
  const i1 = view.querySelector("#pctInput1");
  const i2 = view.querySelector("#pctInput2");
  const result = view.querySelector("#pctResult");

  const labels = {
    of: ["Son", "Foiz (%)"],
    share: ["Qism", "Butun son"],
    change: ["Eski qiymat", "Yangi qiymat"],
  };

  function updateLabels() {
    const [a, b] = labels[mode.value];
    l1.textContent = a;
    l2.textContent = b;
  }

  function recalc() {
    const a = parseInput(i1.value);
    const b = parseInput(i2.value);
    let value = "";
    let label = "";
    if (mode.value === "of") {
      value = formatNumber((a * b) / 100);
      label = `${formatNumber(a)} ning ${formatNumber(b)}% shuncha bo'ladi`;
    } else if (mode.value === "share") {
      if (b === 0) { value = "—"; label = "Butun son 0 bo'lmasligi kerak"; }
      else { value = formatNumber((a / b) * 100) + "%"; label = `${formatNumber(a)} soni ${formatNumber(b)} ning shuncha foizi`; }
    } else {
      if (a === 0) { value = "—"; label = "Eski qiymat 0 bo'lmasligi kerak"; }
      else {
        const diff = ((b - a) / a) * 100;
        value = (diff >= 0 ? "+" : "") + formatNumber(diff) + "%";
        label = diff >= 0 ? "O'sish" : "Kamayish";
      }
    }
    result.querySelector(".result-value").textContent = value;
    result.querySelector(".result-label").textContent = label;
  }

  mode.addEventListener("change", () => { updateLabels(); recalc(); });
  i1.addEventListener("input", recalc);
  i2.addEventListener("input", recalc);
  updateLabels();
}

/* ---------- BMI kalkulyatori ---------- */

function buildBmiHtml() {
  return `
    <div class="simple-field"><label>Bo'y (sm)</label><input type="text" inputmode="decimal" id="bmiHeight" placeholder="170"></div>
    <div class="simple-field"><label>Vazn (kg)</label><input type="text" inputmode="decimal" id="bmiWeight" placeholder="65"></div>
    <div class="result-card" id="bmiResult" style="background:linear-gradient(120deg, var(--amber-a), var(--amber-b));">
      <div class="result-value">—</div>
      <div class="result-label">Ma'lumotlarni kiriting</div>
    </div>
    <div class="bmi-scale">
      <div class="scale-row"><span>Kamvaznlik</span><span>&lt; 18.5</span></div>
      <div class="scale-row"><span>Normal vazn</span><span>18.5 – 24.9</span></div>
      <div class="scale-row"><span>Ortiqcha vazn</span><span>25 – 29.9</span></div>
      <div class="scale-row"><span>Semizlik</span><span>&ge; 30</span></div>
    </div>
  `;
}

function wireBmi(view) {
  const h = view.querySelector("#bmiHeight");
  const w = view.querySelector("#bmiWeight");
  const result = view.querySelector("#bmiResult");

  function recalc() {
    const heightM = parseInput(h.value) / 100;
    const weight = parseInput(w.value);
    if (heightM <= 0 || weight <= 0) {
      result.querySelector(".result-value").textContent = "—";
      result.querySelector(".result-label").textContent = "Ma'lumotlarni kiriting";
      return;
    }
    const bmi = weight / (heightM * heightM);
    let category = "Kamvaznlik";
    if (bmi >= 30) category = "Semizlik";
    else if (bmi >= 25) category = "Ortiqcha vazn";
    else if (bmi >= 18.5) category = "Normal vazn";
    result.querySelector(".result-value").textContent = bmi.toFixed(1);
    result.querySelector(".result-label").textContent = category;
  }
  h.addEventListener("input", recalc);
  w.addEventListener("input", recalc);
}

/* ==========================================================================
   TAB ALMASHTIRISH VA UMUMIY HODISALAR
   ========================================================================== */

function switchTab(tabName) {
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  document.getElementById(`tab-${tabName}`).classList.add("active");
  document.querySelectorAll(".nav-btn, .sidebar-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tabName));
  if (tabName === "tarix") renderHistory();
  if (tabName === "profil" && window.onProfilTabOpen) window.onProfilTabOpen();
}

function init() {
  renderRows();
  renderToolsGrid();
  loadRates();
  setInterval(loadRates, 10 * 60 * 1000); // 10 daqiqada bir marta yangilash

  document.getElementById("addRowBtn").addEventListener("click", addRow);

  document.getElementById("editRowsBtn").addEventListener("click", () => {
    state.editMode = !state.editMode;
    document.getElementById("editRowsBtn").style.color = state.editMode ? "var(--accent-orange)" : "";
    renderRows();
  });

  document.getElementById("currencyRows").addEventListener("click", (e) => {
    const removeBtn = e.target.closest("[data-remove]");
    const selectBtn = e.target.closest("[data-select]");
    const activateZone = e.target.closest("[data-activate]");
    if (removeBtn) { removeRow(Number(removeBtn.dataset.remove)); return; }
    if (selectBtn) { openPicker(Number(selectBtn.dataset.select)); return; }
    if (activateZone) { setActiveRow(Number(activateZone.dataset.activate)); return; }
  });

  document.getElementById("keypad").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-key]");
    if (btn) handleKey(btn.dataset.key);
  });

  document.getElementById("pickerCancel").addEventListener("click", closePicker);
  document.getElementById("pickerOverlay").addEventListener("click", (e) => {
    if (e.target.id === "pickerOverlay") closePicker();
  });
  document.getElementById("pickerSearch").addEventListener("input", (e) => renderPickerList(e.target.value));
  document.getElementById("pickerList").addEventListener("click", (e) => {
    const item = e.target.closest("[data-code]");
    if (item) selectCurrencyForRow(item.dataset.code);
  });

  document.querySelectorAll(".nav-btn, .sidebar-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

window.startMainApp = init;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {
      /* service worker ro'yxatdan o'tmasa ham sayt oddiy ishlashda davom etadi */
    });
  });
}
