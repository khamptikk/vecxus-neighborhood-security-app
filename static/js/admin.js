import { INCIDENT_TYPES, INCIDENT_META, STATUS_META, ESCALATION_THRESHOLD, REJECTION_THRESHOLD, REPORT_TTL_MS } from "./incidents.js";
import { createIconSVG, TYPE_ICONS } from "./icons.js";
import { timeAgo, timeLeft, formatDateTime } from "./geo.js";
import { getDeviceId } from "./device.js";
import { getAllReports, updateReportStatus, expireOldReports } from "./db.js";

const DEFAULT_CENTER = { lat: -12.0464, lng: -77.0428 };

const PRIORITY = ["ESCALADO", "ACTIVO", "EN_ATENCION", "VERIFICADO", "FALSA_ALARMA", "RESUELTO", "EXPIRADO"];

let map, selectedId = null, flyTarget = null;
let reports = [];
let filter = "TODOS";
let deviceId = "";
let toastTimer = null;

document.addEventListener("DOMContentLoaded", () => {
  deviceId = getDeviceId();
  initMap();
  loadReports();
  startPolling();
  setupUI();
});

// ==================== Map ====================
function initMap() {
  map = L.map("admin-map", {
    center: [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng],
    zoom: 13,
    minZoom: 3,
    maxZoom: 19,
    zoomControl: false,
  });

  L.control.zoom({ position: "bottomright" }).addTo(map);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);
}

function flyTo(lat, lng, zoom) {
  map.flyTo([lat, lng], zoom ?? 16, { duration: 0.9 });
}

// ==================== Markers ====================
let reportMarkers = {};

function buildReportIcon(report, selected, dim) {
  const t = INCIDENT_META[report.type] ?? INCIDENT_META.OTRO;
  const s = STATUS_META[report.status] ?? STATUS_META.ACTIVO;
  const pulsing = report.status === "ACTIVO" || report.status === "ESCALADO";
  const iconName = TYPE_ICONS[report.type] ?? "flag";
  const iconSvg = createIconSVG(iconName);

  const html = `
    <div class="vx-pin ${selected ? "vx-pin-selected" : ""} ${dim ? "vx-pin-dim" : ""}">
      ${pulsing ? `<span class="vx-pin-pulse" style="background:${s.color}"></span>` : ""}
      <div class="vx-pin-body" style="background:${t.color};border-color:${s.color};--arrow:${s.color}">
        ${iconSvg}
      </div>
      <span class="vx-pin-count" style="border-color:${s.color};color:${s.color}">${report.confirmations}/${ESCALATION_THRESHOLD}</span>
    </div>`;

  return L.divIcon({ className: "", html, iconSize: [44, 52], iconAnchor: [22, 43] });
}

function updateMarkers() {
  for (const id of Object.keys(reportMarkers)) {
    if (!reports.find((r) => r.id === id)) {
      map.removeLayer(reportMarkers[id]);
      delete reportMarkers[id];
    }
  }

  for (const r of reports) {
    const selected = r.id === selectedId;
    const dim = r.status === "FALSA_ALARMA" || r.status === "RESUELTO";
    const icon = buildReportIcon(r, selected, dim);
    if (reportMarkers[r.id]) {
      reportMarkers[r.id].setIcon(icon);
    } else {
      const marker = L.marker([r.lat, r.lng], {
        icon,
        zIndexOffset: selected ? 1000 : r.status === "ESCALADO" ? 500 : 0,
      }).addTo(map);
      marker.on("click", () => focusReport(r.id));
      reportMarkers[r.id] = marker;
    }
  }
}

// ==================== Reports ====================
function loadReports() {
  expireOldReports();
  reports = getAllReports();
  updateMarkers();
  renderCardList();
  renderStats();
}

function startPolling() {
  setInterval(loadReports, 10000);
}

function focusReport(id, scroll = false) {
  selectedId = id;
  const r = reports.find((x) => x.id === id);
  if (r) {
    flyTo(r.lat, r.lng, 16);
  }
  updateMarkers();
  renderCardList();

  if (scroll) {
    requestAnimationFrame(() => {
      document.getElementById(`card-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }
}

function changeStatus(id, status) {
  const report = updateReportStatus(id, status);
  if (report) {
    reports = getAllReports();
    updateMarkers();
    renderCardList();
    renderStats();
    showToast(`Estado actualizado a ${STATUS_META[status].label}`, "ok");
  }
}

// ==================== Filter ====================
function setFilter(f) {
  filter = f;
  updateMarkers();
  renderCardList();
  renderStats();
  renderFilterButtons();
}

function getVisible() {
  let filtered = filter === "TODOS" ? reports : reports.filter((r) => r.status === filter);
  return [...filtered].sort((a, b) => {
    const pa = PRIORITY.indexOf(a.status);
    const pb = PRIORITY.indexOf(b.status);
    if (pa !== pb) return pa - pb;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

// ==================== Render ====================
function renderStats() {
  const counts = {};
  for (const r of reports) counts[r.status] = (counts[r.status] ?? 0) + 1;

  const statsEl = document.getElementById("admin-stats");
  statsEl.innerHTML = ["ESCALADO", "ACTIVO", "EN_ATENCION", "VERIFICADO"].map((st) => {
    const meta = STATUS_META[st];
    return `
      <button data-filter="${st}" class="stat-btn rounded-xl border px-2 py-2.5 text-center transition ${filter === st ? "border-transparent" : "border-white/8 bg-white/[.03] hover:bg-white/[.06]"}" ${filter === st ? `style="background:${meta.bg};box-shadow:inset 0 0 0 1.5px ${meta.color}"` : ""}>
        <div class="text-[19px] font-black leading-none tabular-nums" style="color:${meta.color}">${counts[st] ?? 0}</div>
        <div class="mt-1 text-[8px] font-extrabold tracking-[0.12em] text-slate-500">${meta.label}</div>
      </button>
    `;
  }).join("");

  statsEl.querySelectorAll(".stat-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setFilter(btn.dataset.filter === filter ? "TODOS" : btn.dataset.filter);
    });
  });

  // Escalados count
  const escalados = counts["ESCALADO"] ?? 0;
  const badge = document.getElementById("escalados-badge");
  if (escalados > 0) {
    badge.style.display = "flex";
    badge.innerHTML = `${createIconSVG("siren", 14)} ${escalados} POR REVISAR`;
  } else {
    badge.style.display = "none";
  }
}

function renderFilterButtons() {
  const el = document.getElementById("admin-filters");
  const filters = ["TODOS", "ESCALADO", "ACTIVO", "EN_ATENCION", "VERIFICADO", "FALSA_ALARMA", "RESUELTO", "EXPIRADO"];
  el.innerHTML = `${createIconSVG("layers", 14, "#64748b")}` + filters.map((f) => `
    <button data-filter="${f}" class="filter-btn shrink-0 rounded-full border px-3 py-1.5 text-[10.5px] font-extrabold tracking-wide transition ${filter === f ? "border-red-400/50 bg-red-500/15 text-red-300" : "border-white/10 bg-white/[.04] text-slate-400 hover:bg-white/[.08]"}">
      ${f === "TODOS" ? "TODOS" : STATUS_META[f].label}
    </button>
  `).join("");

  el.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => setFilter(btn.dataset.filter));
  });
}

function renderCardList() {
  const container = document.getElementById("admin-cards");
  const visible = getVisible();

  if (visible.length === 0) {
    container.innerHTML = `<div class="py-16 text-center text-[13px] font-semibold text-slate-500">No hay reportes con este filtro.</div>`;
    return;
  }

  container.innerHTML = visible.map((r) => {
    const t = INCIDENT_META[r.type] ?? INCIDENT_META.OTRO;
    const s = STATUS_META[r.status] ?? STATUS_META.ACTIVO;
    const iconName = TYPE_ICONS[r.type] ?? "flag";
    const isClosed = r.status === "FALSA_ALARMA" || r.status === "RESUELTO" || r.status === "EXPIRADO";
    const isSelected = selectedId === r.id;
    const conf = Math.min(r.confirmations, ESCALATION_THRESHOLD);

    return `
      <div id="card-${r.id}" class="card-item cursor-pointer rounded-2xl border p-4 transition-all ${isSelected ? "border-red-500/50 bg-red-500/[.06]" : "border-white/8 bg-white/[.03] hover:border-white/15 hover:bg-white/[.05]"} ${isClosed ? "opacity-60" : ""}">
        <div class="flex items-center gap-3">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style="background:${t.soft};color:${t.color}">
            ${createIconSVG(iconName, 18, t.color, 2.3)}
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="truncate text-[14.5px] font-extrabold text-white">${t.label}</span>
              <span class="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-extrabold tracking-widest" style="background:${s.bg};color:${s.color}">${s.label}</span>
            </div>
            <div class="mt-0.5 flex items-center gap-2 text-[10.5px] font-semibold text-slate-500">
              <span>${timeAgo(r.createdAt)}</span>
              <span>·</span>
              <span>${formatDateTime(r.createdAt)}</span>
            </div>
          </div>
        </div>
        <p class="mt-2.5 line-clamp-2 text-[13px] leading-snug text-slate-300">
          ${r.description || '<span class="italic text-slate-500">Sin descripción</span>'}
        </p>
        <div class="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] font-bold text-slate-400">
          <span class="flex items-center gap-1">
            ${createIconSVG("mapPin", 12, "#64748b")}
            ${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}
          </span>
          <span class="flex items-center gap-1 text-emerald-400/90">
            ${createIconSVG("eye", 12)}
            ${r.confirmations}/${ESCALATION_THRESHOLD}
          </span>
          ${r.rejections > 0 ? `<span class="flex items-center gap-1 text-slate-500">${createIconSVG("eyeOff", 12)} ${r.rejections}/3</span>` : ""}
          ${(r.status === "ACTIVO" || r.status === "ESCALADO") ? `<span class="flex items-center gap-1 text-orange-300/80">${createIconSVG("hourglass", 11.5)} ${timeLeft(r.expiresAt).text}</span>` : ""}
        </div>
        <div class="mt-2.5 flex gap-1">
          ${Array.from({ length: ESCALATION_THRESHOLD }).map((_, i) => `
            <div class="h-1.5 flex-1 rounded-full" style="background:${i < conf ? "#fbbf24" : "rgba(255,255,255,.08)"}"></div>
          `).join("")}
        </div>
        <div class="mt-3 grid grid-cols-2 gap-2 admin-actions">
          ${[
            { status: "EN_ATENCION", icon: "clock3", classes: "border-blue-400/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20" },
            { status: "VERIFICADO", icon: "checkCircle2", classes: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20" },
            { status: "FALSA_ALARMA", icon: "ban", classes: "border-slate-400/25 bg-slate-500/10 text-slate-300 hover:bg-slate-500/20" },
            { status: "RESUELTO", icon: "shieldCheck", classes: "border-slate-400/25 bg-slate-600/15 text-slate-200 hover:bg-slate-600/25" },
          ].map(({ status, icon, classes }) => {
            const current = r.status === status;
            return `
              <button data-id="${r.id}" data-status="${status}" class="admin-action-btn flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-[11px] font-extrabold tracking-wide transition active:scale-[.97] disabled:cursor-default ${classes} ${current ? "opacity-100 ring-1 ring-current" : ""} ${current ? "disabled:opacity-40" : ""}" ${current ? "disabled" : ""}>
                ${createIconSVG(icon, 13.5, "currentColor", 2.5)}
                ${current ? `✓ ${STATUS_META[status].label}` : STATUS_META[status].label}
              </button>
            `;
          }).join("")}
          ${isClosed ? `
            <button data-id="${r.id}" data-status="ACTIVO" class="admin-action-btn col-span-2 flex items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-white/[.05] py-2 text-[11px] font-extrabold tracking-wide text-slate-300 transition hover:bg-white/[.09] active:scale-[.97]">
              ${createIconSVG("rotateCcw", 12.5)} REABRIR COMO ACTIVO
            </button>
          ` : ""}
        </div>
      </div>
    `;
  }).join("");

  // Event listeners
  container.querySelectorAll(".card-item").forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.id.replace("card-", "");
      focusReport(id);
    });
  });

  container.querySelectorAll(".admin-action-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      changeStatus(btn.dataset.id, btn.dataset.status);
    });
  });
}

// ==================== UI ====================
function setupUI() {
  renderFilterButtons();
  renderStats();
  renderCardList();
}

// ==================== Toast ====================
function showToast(msg, kind = "info") {
  if (toastTimer) clearTimeout(toastTimer);
  const el = document.getElementById("admin-toast");
  el.className = `vx-toast max-w-sm rounded-2xl border px-4 py-3 text-center text-[13px] font-bold shadow-2xl backdrop-blur-xl ${
    kind === "ok"
      ? "border-emerald-400/30 bg-emerald-950/90 text-emerald-200"
      : kind === "warn"
        ? "border-amber-400/30 bg-amber-950/90 text-amber-200"
        : "border-white/15 bg-[#11151d]/95 text-slate-200"
  }`;
  el.textContent = msg;
  el.style.display = "block";
  toastTimer = setTimeout(() => { el.style.display = "none"; }, 3200);
}
