import { INCIDENT_TYPES, INCIDENT_META, STATUS_META, ESCALATION_THRESHOLD, REJECTION_THRESHOLD, REPORT_TTL_MS } from "./incidents.js";
import { createIconSVG, TYPE_ICONS } from "./icons.js";
import { haversineMeters, formatDistance, timeAgo, timeLeft, formatDateTime } from "./geo.js";
import { getDeviceId } from "./device.js";
import { getReports, createReport, confirmReport, expireOldReports } from "./db.js";
import { parseOSRMSteps, formatNavDistance, formatNavDuration, formatETA, getGoogleMapsUrl, getWazeUrl, haversineMeters as haversine } from "./navigation.js";

const DEFAULT_CENTER = { lat: -12.0464, lng: -77.0428 };
const POLL_MS = 5000;

let map, userMarker, accuracyCircle, draftMarker, routeLine;
let reports = [];
let userPos = null;
let mode = "idle";
let draft = null;
let selectedId = null;
let deviceId = "";
let gpsRoute = null;
let routeCoords = null;
let toastTimer = null;

// ==================== Init ====================
document.addEventListener("DOMContentLoaded", () => {
  deviceId = getDeviceId();
  initMap();
  loadReports();
  startPolling();
  startExpirationCheck();
  requestGeolocation();
  setupUI();
});

// ==================== Map ====================
function initMap() {
  map = L.map("map", {
    center: [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng],
    zoom: 14,
    minZoom: 3,
    maxZoom: 19,
    zoomControl: false,
    attributionControl: true,
  });

  L.control.zoom({ position: "bottomright" }).addTo(map);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  map.on("click", (e) => {
    if (mode === "pick") {
      draft = { lat: e.latlng.lat, lng: e.latlng.lng };
      updateDraftPin();
    }
  });
}

function flyTo(lat, lng, zoom) {
  map.flyTo([lat, lng], zoom ?? Math.max(map.getZoom(), 16), { duration: 0.9 });
}

function updateDraftPin() {
  if (draftMarker) {
    map.removeLayer(draftMarker);
  }
  if (!draft) return;

  const icon = L.divIcon({
    className: "",
    html: '<div class="vx-draft-pin"></div>',
    iconSize: [36, 36],
    iconAnchor: [18, 32],
  });

  draftMarker = L.marker([draft.lat, draft.lng], { icon, draggable: true, zIndexOffset: 1500 }).addTo(map);
  draftMarker.on("dragend", (e) => {
    const p = e.target.getLatLng();
    draft = { lat: p.lat, lng: p.lng };
  });
}

function clearDraftPin() {
  if (draftMarker) {
    map.removeLayer(draftMarker);
    draftMarker = null;
  }
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

  return L.divIcon({
    className: "",
    html,
    iconSize: [44, 52],
    iconAnchor: [22, 43],
  });
}

function updateMarkers() {
  // Remove old markers
  for (const id of Object.keys(reportMarkers)) {
    if (!reports.find((r) => r.id === id)) {
      map.removeLayer(reportMarkers[id]);
      delete reportMarkers[id];
    }
  }

  // Add/update markers
  for (const r of reports) {
    const selected = r.id === selectedId;
    const icon = buildReportIcon(r, selected, false);
    if (reportMarkers[r.id]) {
      reportMarkers[r.id].setIcon(icon);
    } else {
      const marker = L.marker([r.lat, r.lng], {
        icon,
        zIndexOffset: selected ? 1000 : r.status === "ESCALADO" ? 500 : 0,
      }).addTo(map);
      marker.on("click", () => selectReport(r.id));
      reportMarkers[r.id] = marker;
    }
  }
}

// ==================== Route Line ====================
function drawRoute(coords) {
  clearRoute();
  if (!coords || coords.length < 2) return;

  routeLine = L.layerGroup().addTo(map);

  // Dark border
  L.polyline(coords, { color: "#022c22", weight: 11, opacity: 0.9, lineCap: "round", lineJoin: "round" }).addTo(routeLine);
  // Green center
  L.polyline(coords, { color: "#10b981", weight: 6, opacity: 0.95, lineCap: "round", lineJoin: "round" }).addTo(routeLine);
  // Light core
  L.polyline(coords, { color: "#6ee7b7", weight: 2.5, opacity: 0.9, lineCap: "round", lineJoin: "round" }).addTo(routeLine);

  // Fit bounds
  try {
    const bounds = L.latLngBounds(coords.map((c) => L.latLng(c[0], c[1])));
    map.fitBounds(bounds, {
      paddingTopLeft: [60, 120],
      paddingBottomRight: [60, 220],
      maxZoom: 17,
      animate: true,
    });
  } catch { /* */ }
}

function clearRoute() {
  if (routeLine) {
    map.removeLayer(routeLine);
    routeLine = null;
  }
  routeCoords = null;
}

// ==================== User Location ====================
function requestGeolocation() {
  if (!("geolocation" in navigator)) return;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      userPos = p;
      updateUserMarker(p, pos.coords.accuracy);
      flyTo(p.lat, p.lng, 16);
    },
    () => showToast("No pudimos obtener tu ubicación. Puedes mover el mapa manualmente.", "warn"),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
  );

  navigator.geolocation.watchPosition(
    (pos) => {
      userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      updateUserMarker(userPos, pos.coords.accuracy);
    },
    () => {},
    { enableHighAccuracy: false, maximumAge: 30000 }
  );
}

function updateUserMarker(pos, accuracy) {
  if (userMarker) {
    userMarker.setLatLng([pos.lat, pos.lng]);
  } else {
    const icon = L.divIcon({
      className: "",
      html: '<div class="vx-user-wrap"><span class="vx-user-pulse"></span><span class="vx-user-dot"></span></div>',
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });
    userMarker = L.marker([pos.lat, pos.lng], { icon, zIndexOffset: 2000, interactive: false }).addTo(map);
  }

  if (accuracy && accuracy > 25) {
    if (accuracyCircle) {
      accuracyCircle.setLatLng([pos.lat, pos.lng]).setRadius(Math.min(accuracy, 400));
    } else {
      accuracyCircle = L.circle([pos.lat, pos.lng], {
        radius: Math.min(accuracy, 400),
        color: "#3b82f6",
        weight: 1,
        opacity: 0.35,
        fillColor: "#3b82f6",
        fillOpacity: 0.08,
      }).addTo(map);
    }
  }
}

// ==================== Reports ====================
function loadReports() {
  reports = getReports(deviceId);
  expireOldReports();
  reports = getReports(deviceId);
  updateMarkers();
  updateActiveCount();
}

function startPolling() {
  setInterval(loadReports, POLL_MS);
}

function startExpirationCheck() {
  setInterval(() => {
    const now = Date.now();
    reports = reports.filter((r) => new Date(r.expiresAt).getTime() > now);
    if (selectedId && !reports.find((r) => r.id === selectedId)) {
      selectedId = null;
      closeIncidentSheet();
    }
    updateMarkers();
  }, 1000);
}

function updateActiveCount() {
  const actives = reports.filter((r) => r.status === "ACTIVO" || r.status === "ESCALADO");
  let count = actives.length;
  if (userPos) {
    count = actives.filter((r) => haversineMeters(userPos, { lat: r.lat, lng: r.lng }) <= 5000).length;
  }
  const el = document.getElementById("active-count");
  if (el) el.textContent = count;
  const label = document.getElementById("active-label");
  if (label) label.textContent = userPos ? "ACTIVOS CERCA" : "INCIDENTES";
}

// ==================== Report Flow ====================
function startReport() {
  selectedId = null;
  clearRoute();
  gpsRoute = null;
  draft = userPos ? { ...userPos } : null;
  mode = "pick";
  updateDraftPin();
  updateUI();
}

function cancelReport() {
  mode = "idle";
  draft = null;
  clearDraftPin();
  updateUI();
}

function submitReport(type, description) {
  if (!draft) return;

  const report = createReport({
    type,
    description,
    lat: draft.lat,
    lng: draft.lng,
    deviceId,
  });

  reports.unshift(report);
  mode = "idle";
  draft = null;
  clearDraftPin();
  selectedId = report.id;
  updateMarkers();
  flyTo(report.lat, report.lng, 17);
  updateUI();
  showIncidentSheet(report);
  showToast("Reporte enviado. Los vecinos cercanos ya pueden verlo.", "ok");
}

// ==================== Voting ====================
function vote(kind) {
  if (!selectedId) return;
  const result = confirmReport(selectedId, kind, deviceId);

  if (result.deleted) {
    reports = reports.filter((r) => r.id !== selectedId);
    selectedId = null;
    clearRoute();
    closeIncidentSheet();
    updateMarkers();
    showToast("3 vecinos no vieron nada: el reporte se eliminó automáticamente", "ok");
    return;
  }

  if (result.error) {
    if (result.expired || result.deleted) {
      reports = reports.filter((r) => r.id !== selectedId);
      selectedId = null;
      closeIncidentSheet();
      updateMarkers();
    }
    showToast(result.error, "warn");
    return;
  }

  // Update local state
  const idx = reports.findIndex((r) => r.id === selectedId);
  if (idx !== -1) {
    reports[idx] = { ...result.report, myVote: kind };
  }

  updateMarkers();

  if (result.alreadyVoted) {
    showToast("Ya habías registrado tu respuesta en este reporte", "info");
  } else if (kind === "CONFIRM" && result.report.status === "ESCALADO") {
    showToast("¡Corroboración completa! El reporte fue ESCALADO a revisión.", "ok");
  } else if (kind === "REJECT") {
    const left = REJECTION_THRESHOLD - result.report.rejections;
    showToast(
      left > 0
        ? `Respuesta registrada. ${left} ${left === 1 ? "voto más elimina" : "votos más eliminan"} el reporte.`
        : "Respuesta registrada.",
      "ok"
    );
  } else {
    showToast("Corroboración registrada. ¡Gracias!", "ok");
  }

  // Refresh sheet
  const fresh = reports.find((r) => r.id === selectedId);
  if (fresh) showIncidentSheet(fresh);
}

// ==================== GPS Navigation ====================
async function startGpsNavigation(profile = "foot") {
  const r = reports.find((x) => x.id === selectedId);
  if (!r || !userPos) return;

  try {
    const osrmProfile = profile === "car" ? "car" : "foot";
    const url = `https://router.project-osrm.org/route/v1/${osrmProfile}/${userPos.lng},${userPos.lat};${r.lng},${r.lat}?overview=full&geometries=geojson&steps=true`;
    const res = await fetch(url);
    const data = await res.json();
    const rawRoute = data?.routes?.[0];
    if (!rawRoute) throw new Error("No se pudo calcular la ruta");

    const coords = rawRoute.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    const label = INCIDENT_META[r.type]?.label ?? "el incidente";
    const rawSteps = rawRoute.legs?.[0]?.steps ?? [];
    const steps = parseOSRMSteps(rawSteps, label);

    gpsRoute = {
      profile,
      distanceMeters: Math.round(rawRoute.distance ?? 0),
      durationSec: Math.round(rawRoute.duration ?? 0),
      coords,
      steps,
      destinationLabel: label,
      destinationPos: { lat: r.lat, lng: r.lng },
    };

    routeCoords = coords;
    drawRoute(coords);
    closeIncidentSheet();
    showGpsOverlay();
    showToast(`Navegación GPS hacia ${label} iniciada`, "ok");
  } catch {
    // Fallback: straight line
    const d = haversineMeters(userPos, { lat: r.lat, lng: r.lng });
    const label = INCIDENT_META[r.type]?.label ?? "el incidente";
    const straightCoords = [
      [userPos.lat, userPos.lng],
      [r.lat, r.lng],
    ];

    gpsRoute = {
      profile,
      distanceMeters: Math.round(d),
      durationSec: Math.round((d / 1000) * 12 * 60),
      coords: straightCoords,
      steps: [
        { index: 0, instruction: `Avanza en dirección a ${label}`, streetName: "", distanceMeters: Math.round(d), durationSec: Math.round((d / 1000) * 12 * 60), icon: "straight", lat: userPos.lat, lng: userPos.lng, maneuverType: "depart" },
        { index: 1, instruction: `Llegaste a tu destino (${label})`, streetName: "", distanceMeters: 0, durationSec: 0, icon: "arrive", lat: r.lat, lng: r.lng, maneuverType: "arrive" },
      ],
      destinationLabel: label,
      destinationPos: { lat: r.lat, lng: r.lng },
    };

    routeCoords = straightCoords;
    drawRoute(straightCoords);
    closeIncidentSheet();
    showGpsOverlay();
    showToast("Ruta en línea recta calculada", "info");
  }
}

function exitGpsNavigation() {
  gpsRoute = null;
  clearRoute();
  hideGpsOverlay();
}

// ==================== Selection ====================
function selectReport(id) {
  if (mode !== "idle") return;
  selectedId = id;
  clearRoute();
  gpsRoute = null;
  hideGpsOverlay();
  const r = reports.find((x) => x.id === id);
  if (r) {
    flyTo(r.lat, r.lng, Math.max(16, map.getZoom()));
    showIncidentSheet(r);
  }
  updateMarkers();
}

// ==================== Toast ====================
function showToast(msg, kind = "info") {
  if (toastTimer) clearTimeout(toastTimer);
  const el = document.getElementById("toast");
  el.className = `vx-toast max-w-sm rounded-2xl border px-4 py-3 text-center text-[13px] font-bold shadow-2xl backdrop-blur-xl ${
    kind === "ok"
      ? "border-emerald-400/30 bg-emerald-950/90 text-emerald-200"
      : kind === "warn"
        ? "border-amber-400/30 bg-amber-950/90 text-amber-200"
        : "border-white/15 bg-[#11151d]/95 text-slate-200"
  }`;
  el.textContent = msg;
  el.style.display = "block";
  toastTimer = setTimeout(() => { el.style.display = "none"; }, 3400);
}

// ==================== UI Updates ====================
function updateUI() {
  // Show/hide elements based on mode
  const reportBtn = document.getElementById("report-btn");
  const pickBanner = document.getElementById("pick-banner");
  const pickBar = document.getElementById("pick-bar");
  const header = document.getElementById("main-header");

  reportBtn.style.display = mode === "idle" && !selectedId ? "block" : "none";
  pickBanner.style.display = mode === "pick" ? "block" : "none";
  pickBar.style.display = mode === "pick" ? "flex" : "none";
  header.style.display = mode === "idle" ? "block" : "none";
}

function setupUI() {
  // Report button
  document.getElementById("start-report-btn").addEventListener("click", startReport);

  // Pick mode buttons
  document.getElementById("cancel-pick-btn").addEventListener("click", cancelReport);
  document.getElementById("confirm-pick-btn").addEventListener("click", () => {
    if (draft) {
      mode = "form";
      updateUI();
      showReportForm();
    }
  });

  // Locate button
  document.getElementById("locate-btn").addEventListener("click", () => {
    if (userPos) {
      flyTo(userPos.lat, userPos.lng, 17);
    } else {
      navigator.geolocation?.getCurrentPosition(
        (pos) => {
          userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          flyTo(userPos.lat, userPos.lng, 17);
        },
        () => showToast("Activa el permiso de ubicación en tu navegador", "warn"),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  });

  updateUI();
}

// ==================== Report Form ====================
function showReportForm() {
  const overlay = document.getElementById("report-form-overlay");
  overlay.style.display = "flex";

  let step = 1;
  let selectedType = null;
  let description = "";

  const content = overlay.querySelector(".form-content");

  function render() {
    if (step === 1) {
      content.innerHTML = `
        <div class="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/15"></div>
        <div class="mb-5 flex items-center gap-2 text-[11px] font-semibold tracking-wide">
          <span class="flex items-center gap-1.5 text-emerald-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 20H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3"/><path d="m9 12 2 2 4-4"/><circle cx="15.5" cy="10.5" r=".5" fill="currentColor"/></svg>
            UBICACIÓN
          </span>
          <span class="h-px flex-1 bg-white/10"></span>
          <span class="text-white">2 · TIPO</span>
          <span class="h-px flex-1 bg-white/10"></span>
          <span class="text-slate-500">3 · DETALLES</span>
        </div>
        <div class="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 class="text-xl font-extrabold tracking-tight text-white">¿Qué está pasando?</h2>
            <p class="mt-0.5 text-[13px] text-slate-400">Elige el tipo de incidente</p>
          </div>
          <button id="form-close-btn" class="rounded-full border border-white/10 bg-white/5 p-2 text-slate-400 transition hover:bg-white/10 hover:text-white">
            ${createIconSVG("x", 17)}
          </button>
        </div>
        <div class="grid grid-cols-2 gap-2.5">
          ${INCIDENT_TYPES.map((t) => {
            const meta = INCIDENT_META[t];
            const iconName = TYPE_ICONS[t];
            const wide = t === "SOSPECHOSO";
            return `
              <button data-type="${t}" class="type-btn flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[.03] px-4 py-4 text-left text-slate-300 transition-all hover:bg-white/[.06] active:scale-[.98] ${wide ? "col-span-2" : ""}">
                <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style="background:${meta.soft};color:${meta.color}">
                  ${createIconSVG(iconName, 19, meta.color, 2.4)}
                </span>
                <span class="text-[14px] font-bold leading-tight">${meta.label}</span>
              </button>
            `;
          }).join("")}
        </div>
      `;

      content.querySelectorAll(".type-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          selectedType = btn.dataset.type;
          step = 2;
          render();
        });
      });

      document.getElementById("form-close-btn")?.addEventListener("click", () => {
        overlay.style.display = "none";
        cancelReport();
      });

    } else {
      const meta = INCIDENT_META[selectedType] ?? INCIDENT_META.OTRO;
      const iconName = TYPE_ICONS[selectedType] ?? "flag";
      content.innerHTML = `
        <div class="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/15"></div>
        <div class="mb-5 flex items-center gap-2 text-[11px] font-semibold tracking-wide">
          <span class="flex items-center gap-1.5 text-emerald-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 20H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3"/><path d="m9 12 2 2 4-4"/><circle cx="15.5" cy="10.5" r=".5" fill="currentColor"/></svg>
            UBICACIÓN
          </span>
          <span class="h-px flex-1 bg-white/10"></span>
          <span class="flex items-center gap-1 text-emerald-400">
            ${createIconSVG("check", 13)} 2 · TIPO
          </span>
          <span class="h-px flex-1 bg-white/10"></span>
          <span class="text-white">3 · DETALLES</span>
        </div>
        <div class="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 class="text-xl font-extrabold tracking-tight text-white">Describe lo que ocurre</h2>
            <p class="mt-0.5 text-[13px] text-slate-400">Una descripción corta ayuda a tus vecinos</p>
          </div>
          <button id="form-close-btn2" class="rounded-full border border-white/10 bg-white/5 p-2 text-slate-400 transition hover:bg-white/10 hover:text-white">
            ${createIconSVG("x", 17)}
          </button>
        </div>
        <div>
          <div class="mb-3 flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-bold" style="background:${meta.soft};color:${meta.color}">
            ${createIconSVG(iconName, 15, meta.color, 2.4)}
            ${meta.label.toUpperCase()}
            <button id="change-type-btn" class="ml-auto flex items-center gap-1 rounded-lg bg-black/30 px-2 py-1 text-[11px] font-semibold text-white/80 transition hover:bg-black/50">
              ${createIconSVG("arrowLeft", 12)} Cambiar
            </button>
          </div>
          <textarea id="report-desc" rows="3" maxlength="240" placeholder="Ej.: Hay una pelea frente a la tienda, dos personas involucradas…" class="w-full resize-none rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3.5 text-[15px] text-white placeholder:text-slate-500 focus:border-red-500/60 focus:outline-none focus:ring-2 focus:ring-red-500/25"></textarea>
          <div class="mt-1 text-right text-[11px] font-medium text-slate-500"><span id="char-count">0</span>/240</div>
          <button id="submit-report-btn" class="vx-glow-red mt-1 flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-b from-red-500 to-red-700 py-4 text-[16px] font-extrabold tracking-wide text-white transition active:scale-[.98]">
            ${createIconSVG("send", 18, "#fff", 2.5)}
            ENVIAR REPORTE
          </button>
        </div>
      `;

      const desc = document.getElementById("report-desc");
      desc.addEventListener("input", () => {
        description = desc.value.slice(0, 240);
        document.getElementById("char-count").textContent = description.length;
      });
      desc.focus();

      document.getElementById("change-type-btn").addEventListener("click", () => {
        step = 1;
        render();
      });

      document.getElementById("form-close-btn2")?.addEventListener("click", () => {
        overlay.style.display = "none";
        cancelReport();
      });

      document.getElementById("submit-report-btn").addEventListener("click", () => {
        if (selectedType && description.trim()) {
          overlay.style.display = "none";
          submitReport(selectedType, description.trim());
        }
      });
    }
  }

  render();
}

// ==================== Incident Sheet ====================
function showIncidentSheet(report) {
  const overlay = document.getElementById("incident-sheet-overlay");
  const content = document.getElementById("incident-sheet-content");

  const t = INCIDENT_META[report.type] ?? INCIDENT_META.OTRO;
  const s = STATUS_META[report.status] ?? STATUS_META.ACTIVO;
  const iconName = TYPE_ICONS[report.type] ?? "flag";
  const distance = userPos ? haversineMeters(userPos, { lat: report.lat, lng: report.lng }) : null;
  const conf = Math.min(report.confirmations, ESCALATION_THRESHOLD);
  const left = timeLeft(report.expiresAt);
  const rejectsLeft = Math.max(0, REJECTION_THRESHOLD - report.rejections);
  const myVote = report.myVote;

  content.innerHTML = `
    <div class="vx-sheet relative max-h-[82dvh] overflow-y-auto rounded-t-[28px] border-t border-white/10 bg-[#0c0f16]/97 px-5 pb-8 pt-3 shadow-[0_-20px_60px_rgba(0,0,0,.7)] backdrop-blur-xl">
      <div class="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/15"></div>
      <div class="flex items-start gap-3.5">
        <span class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl" style="background:${t.soft};color:${t.color};box-shadow:inset 0 0 0 1.5px ${t.color}55">
          ${createIconSVG(iconName, 26, t.color, 2.2)}
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <h2 class="truncate text-[22px] font-extrabold tracking-tight text-white">${t.label}</h2>
          </div>
          <span class="mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-extrabold tracking-widest" style="background:${s.bg};color:${s.color}">
            <span class="h-1.5 w-1.5 rounded-full" style="background:${s.color}"></span>
            ${s.label}
          </span>
        </div>
        <button id="sheet-close-btn" class="rounded-full border border-white/10 bg-white/5 p-2 text-slate-400 transition hover:bg-white/10 hover:text-white">
          ${createIconSVG("x", 17)}
        </button>
      </div>

      <p class="mt-4 text-[15px] leading-relaxed text-slate-300">
        ${report.description || '<span class="italic text-slate-500">Sin descripción.</span>'}
      </p>

      <div class="mt-3 flex flex-wrap gap-2 text-[11.5px] font-semibold text-slate-400">
        <span class="flex items-center gap-1.5 rounded-full bg-white/[.05] px-2.5 py-1.5">
          ${createIconSVG("clock", 12.5)}
          ${timeAgo(report.createdAt)} · ${formatDateTime(report.createdAt)}
        </span>
        ${distance != null ? `
        <span class="flex items-center gap-1.5 rounded-full bg-white/[.05] px-2.5 py-1.5">
          ${createIconSVG("navigation", 12.5)}
          ${formatDistance(distance)}
        </span>` : ""}
        <span class="flex items-center gap-1.5 rounded-full px-2.5 py-1.5" style="background:${left.urgent ? "rgba(251,146,60,.14)" : "rgba(255,255,255,.05)"};color:${left.urgent ? "#fdba74" : ""}">
          ${createIconSVG("hourglass", 12.5)}
          Expira en ${left.text}
        </span>
      </div>

      <div class="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/[.06]">
        <div class="h-full rounded-full transition-all duration-1000" style="width:${Math.max(0, Math.min(100, (left.ms / 3600000) * 100))}%;background:${left.urgent ? "#fb923c" : "#475569"}"></div>
      </div>

      <div class="mt-5 rounded-2xl border border-white/8 bg-white/[.03] p-4">
        <div class="flex items-center justify-between">
          <h3 class="text-[12px] font-extrabold tracking-widest text-slate-400">CORROBORACIÓN VECINAL</h3>
          <span class="text-[13px] font-extrabold tabular-nums" style="color:${conf >= ESCALATION_THRESHOLD ? "#fbbf24" : "#e2e8f0"}">
            ${conf}/${ESCALATION_THRESHOLD}
          </span>
        </div>
        <div class="mt-2.5 flex gap-1.5">
          ${Array.from({ length: ESCALATION_THRESHOLD }).map((_, i) => `
            <div class="h-2.5 flex-1 rounded-full transition-all duration-500" style="background:${
              i < conf ? (conf >= ESCALATION_THRESHOLD ? "#fbbf24" : t.color) : "rgba(255,255,255,.08)"
            };${i < conf ? `box-shadow:0 0 12px ${conf >= ESCALATION_THRESHOLD ? "#fbbf24" : t.color}66` : ""}"></div>
          `).join("")}
        </div>
        <p class="mt-2.5 text-[12.5px] leading-snug text-slate-400">
          ${report.confirmations === 0
            ? "Aún nadie corrobora este reporte."
            : report.confirmations === 1
              ? "1 vecino está viendo este incidente."
              : `${report.confirmations} vecinos están viendo este incidente.`}
          ${report.rejections > 0 ? `<span class="text-slate-500"> · ${report.rejections} ${report.rejections === 1 ? "dice" : "dicen"} que no ven nada</span>` : ""}
        </p>
        ${report.status === "ESCALADO" ? `
        <div class="mt-3 flex gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-[12px] leading-snug text-amber-200/90">
          ${createIconSVG("info", 15, "#fcd34d", 2.5)}
          <span><b>Escalado a revisión.</b> ${ESCALATION_THRESHOLD} confirmaciones vecinas no constituyen una verificación oficial: significan que el incidente tiene suficiente corroboración comunitaria para ser revisado.</span>
        </div>` : ""}
        ${myVote ? `
        <div class="mt-3 flex items-center gap-2 rounded-xl bg-white/[.06] px-3.5 py-3 text-[13px] font-bold text-slate-200">
          ${myVote === "CONFIRM"
            ? `${createIconSVG("eye", 16, "#34d399")} Tu respuesta: estás viendo el incidente`
            : `${createIconSVG("eyeOff", 16, "#94a3b8")} Tu respuesta: no ves nada`}
          ${createIconSVG("check", 15, "#64748b")}
        </div>` : `
        <div class="mt-3 grid grid-cols-1 gap-2">
          <button id="vote-confirm-btn" class="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-700 py-3.5 text-[14px] font-extrabold tracking-wide text-white shadow-lg shadow-emerald-900/40 transition active:scale-[.98]">
            ${createIconSVG("eye", 17, "#fff", 2.5)}
            ESTOY VIENDO EL INCIDENTE
          </button>
          <button id="vote-reject-btn" class="flex w-full items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[.05] py-3 text-[13px] font-bold tracking-wide text-slate-300 transition hover:bg-white/[.09] active:scale-[.98]">
            ${createIconSVG("eyeOff", 15.5)}
            NO VEO NADA
          </button>
          ${report.rejections > 0 ? `
          <p class="flex items-center justify-center gap-1.5 text-[11.5px] font-semibold text-slate-500">
            ${createIconSVG("trash", 12)}
            ${report.rejections}/${REJECTION_THRESHOLD} dicen que no ven nada · ${rejectsLeft === 1 ? "1 voto más y se elimina" : `${rejectsLeft} votos más y se elimina`}
          </p>` : ""}
        </div>`}
      </div>

      <div class="mt-4 space-y-2">
        <div class="flex gap-2">
          <button id="gps-foot-btn" class="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-emerald-400/35 bg-gradient-to-b from-emerald-500 to-emerald-700 py-4 text-[14.5px] font-black tracking-wide text-white shadow-lg shadow-emerald-950/60 transition active:scale-[0.98] ${!userPos ? "opacity-40" : ""}">
            ${createIconSVG("navigation2", 18, "#fff", 2.8)}
            ${userPos ? "CÓMO LLEGAR (GPS A PIE)" : "ACTIVA TU UBICACIÓN PARA GPS"}
          </button>
          <button id="gps-car-btn" class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.05] text-slate-200 transition hover:bg-white/10 active:scale-[0.98] ${!userPos ? "opacity-40" : ""}">
            ${createIconSVG("car", 20)}
          </button>
          <a href="${getGoogleMapsUrl({ lat: report.lat, lng: report.lng }, userPos, "foot")}" target="_blank" rel="noreferrer" class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.05] text-slate-200 transition hover:bg-white/10 active:scale-[0.98]">
            ${createIconSVG("externalLink", 19)}
          </a>
        </div>
      </div>
    </div>
  `;

  overlay.style.display = "flex";

  document.getElementById("sheet-close-btn").addEventListener("click", () => {
    selectedId = null;
    clearRoute();
    closeIncidentSheet();
    updateMarkers();
  });

  document.getElementById("incident-sheet-overlay").addEventListener("click", (e) => {
    if (e.target === overlay) {
      selectedId = null;
      clearRoute();
      closeIncidentSheet();
      updateMarkers();
    }
  });

  document.getElementById("vote-confirm-btn")?.addEventListener("click", () => vote("CONFIRM"));
  document.getElementById("vote-reject-btn")?.addEventListener("click", () => vote("REJECT"));
  document.getElementById("gps-foot-btn")?.addEventListener("click", () => startGpsNavigation("foot"));
  document.getElementById("gps-car-btn")?.addEventListener("click", () => startGpsNavigation("car"));
}

function closeIncidentSheet() {
  document.getElementById("incident-sheet-overlay").style.display = "none";
}

// ==================== GPS Overlay ====================
let gpsStepIndex = 0;

function showGpsOverlay() {
  const overlay = document.getElementById("gps-overlay");
  overlay.style.display = "flex";
  gpsStepIndex = 0;
  renderGpsOverlay();
}

function hideGpsOverlay() {
  document.getElementById("gps-overlay").style.display = "none";
}

function renderGpsOverlay() {
  if (!gpsRoute) return;
  const overlay = document.getElementById("gps-overlay");

  const step = gpsRoute.steps[gpsStepIndex] ?? gpsRoute.steps[0];
  const totalDist = userPos ? Math.round(haversine(userPos, gpsRoute.destinationPos)) : gpsRoute.distanceMeters;
  const hasArrived = totalDist <= 25;

  overlay.innerHTML = `
    <div class="pointer-events-none fixed inset-0 z-[1250] flex flex-col justify-between">
      <div class="pointer-events-auto px-3.5 pt-3">
        <div class="vx-drop mx-auto max-w-lg overflow-hidden rounded-3xl border border-emerald-400/30 bg-gradient-to-b from-[#09231b]/95 to-[#0b141a]/95 shadow-[0_16px_40px_rgba(0,0,0,0.85)] backdrop-blur-2xl">
          <div class="flex items-center gap-3.5 p-4">
            <div class="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-black shadow-[0_0_24px_rgba(16,185,129,0.55)]">
              ${createIconSVG(step?.icon ?? "straight", 32, "#000", 2.8)}
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="text-[12px] font-black uppercase tracking-wider text-emerald-400">
                  ${hasArrived ? "DESTINO ALCANZADO" : `EN ${formatNavDistance(totalDist)}`}
                </span>
                <span class="h-1 w-1 rounded-full bg-emerald-400/60"></span>
                <span class="text-[11px] font-bold text-slate-400">${gpsRoute.profile === "foot" ? "A pie" : "En auto"}</span>
              </div>
              <h2 class="mt-0.5 truncate text-[17px] font-black tracking-tight text-white">
                ${hasArrived ? `¡Llegaste a ${gpsRoute.destinationLabel}!` : step?.instruction}
              </h2>
            </div>
            <button id="gps-expand-btn" class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10">
              ${createIconSVG("chevronDown", 18)}
            </button>
          </div>
          <div id="gps-steps-list" style="display:none" class="max-h-64 overflow-y-auto border-t border-white/10 bg-black/40 px-3 py-2">
            <div class="mb-1.5 flex items-center justify-between px-2 text-[10.5px] font-extrabold tracking-widest text-slate-400">
              <span>TODAS LAS INDICACIONES (${gpsRoute.steps.length})</span>
              <span>DISTANCIA</span>
            </div>
            <div class="space-y-1">
              ${gpsRoute.steps.map((s, idx) => `
                <button data-step="${idx}" class="gps-step-btn flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition ${idx === gpsStepIndex ? "bg-emerald-500/20 text-white shadow-sm ring-1 ring-emerald-400/40" : "text-slate-300 hover:bg-white/5"}">
                  <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${idx === gpsStepIndex ? "bg-emerald-500 text-black font-bold" : "bg-white/10 text-slate-300"}">
                    ${createIconSVG(s.icon, 15)}
                  </span>
                  <span class="min-w-0 flex-1 truncate text-[12.5px] font-bold">${s.instruction}</span>
                  <span class="shrink-0 text-[11.5px] font-semibold tabular-nums text-slate-400">${formatNavDistance(s.distanceMeters)}</span>
                </button>
              `).join("")}
            </div>
          </div>
        </div>
      </div>

      <div class="pointer-events-auto px-3.5 pb-5">
        <div class="vx-drop mx-auto max-w-lg space-y-2.5">
          <div id="gps-apps-menu" style="display:none" class="flex gap-2 rounded-2xl border border-white/10 bg-[#0c1017]/95 p-2 backdrop-blur-xl">
            <a href="${getGoogleMapsUrl(gpsRoute.destinationPos, userPos, gpsRoute.profile)}" target="_blank" rel="noreferrer" class="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600/20 py-2.5 text-[12px] font-extrabold text-blue-200 ring-1 ring-blue-400/30 hover:bg-blue-600/30">
              ${createIconSVG("externalLink", 14)} Google Maps
            </a>
            <a href="${getWazeUrl(gpsRoute.destinationPos)}" target="_blank" rel="noreferrer" class="flex flex-1 items-center justify-center gap-2 rounded-xl bg-cyan-600/20 py-2.5 text-[12px] font-extrabold text-cyan-200 ring-1 ring-cyan-400/30 hover:bg-cyan-600/30">
              ${createIconSVG("externalLink", 14)} Waze
            </a>
            <button id="gps-close-apps" class="rounded-xl border border-white/10 bg-white/5 px-3 text-slate-400 hover:text-white">
              ${createIconSVG("x", 15)}
            </button>
          </div>

          <div class="rounded-3xl border border-white/10 bg-[#0c1017]/95 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.9)] backdrop-blur-2xl">
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="flex items-baseline gap-1.5">
                  <span class="text-[28px] font-black leading-none text-emerald-400 tabular-nums">${formatNavDuration(gpsRoute.durationSec)}</span>
                </div>
                <div class="mt-1 flex items-center gap-2 text-[12px] font-bold text-slate-400">
                  <span class="tabular-nums">${formatNavDistance(totalDist)}</span>
                  <span>·</span>
                  <span class="text-slate-300">Llegada ${formatETA(gpsRoute.durationSec)}</span>
                </div>
              </div>
              <div class="flex items-center gap-1.5">
                <button id="gps-recenter-btn" class="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10 active:scale-95">
                  ${createIconSVG("locateFixed", 20, "#e2e8f0", 2.4)}
                </button>
                <button id="gps-apps-btn" class="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10 active:scale-95">
                  ${createIconSVG("externalLink", 19)}
                </button>
              </div>
            </div>

            <div class="mt-3.5 flex items-center gap-2">
              <div class="flex rounded-2xl border border-white/10 bg-black/40 p-1">
                <button id="gps-foot-btn2" class="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-extrabold transition ${gpsRoute.profile === "foot" ? "bg-emerald-500 text-black shadow-md" : "text-slate-400 hover:text-white"}">
                  ${createIconSVG("eye", 15)} A pie
                </button>
                <button id="gps-car-btn2" class="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-extrabold transition ${gpsRoute.profile === "car" ? "bg-emerald-500 text-black shadow-md" : "text-slate-400 hover:text-white"}">
                  ${createIconSVG("car", 15)} Auto
                </button>
              </div>
              <button id="gps-exit-btn" class="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-red-500/30 bg-red-600/20 py-3 text-[14px] font-black tracking-wide text-red-200 transition hover:bg-red-600/30 active:scale-[0.98]">
                ${createIconSVG("x", 17, "#fecaca", 2.6)}
                SALIR DE NAVEGACIÓN
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Event listeners
  let stepsExpanded = false;
  document.getElementById("gps-expand-btn").addEventListener("click", () => {
    stepsExpanded = !stepsExpanded;
    document.getElementById("gps-steps-list").style.display = stepsExpanded ? "block" : "none";
  });

  document.querySelectorAll(".gps-step-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      gpsStepIndex = parseInt(btn.dataset.step);
      const s = gpsRoute.steps[gpsStepIndex];
      if (s?.lat && s?.lng) flyTo(s.lat, s.lng, 17);
      renderGpsOverlay();
    });
  });

  document.getElementById("gps-recenter-btn").addEventListener("click", () => {
    if (userPos) flyTo(userPos.lat, userPos.lng, 17);
  });

  document.getElementById("gps-apps-btn").addEventListener("click", () => {
    const menu = document.getElementById("gps-apps-menu");
    menu.style.display = menu.style.display === "none" ? "flex" : "none";
  });

  document.getElementById("gps-close-apps")?.addEventListener("click", () => {
    document.getElementById("gps-apps-menu").style.display = "none";
  });

  document.getElementById("gps-foot-btn2").addEventListener("click", () => {
    gpsRoute.profile = "foot";
    startGpsNavigation("foot");
  });

  document.getElementById("gps-car-btn2").addEventListener("click", () => {
    gpsRoute.profile = "car";
    startGpsNavigation("car");
  });

  document.getElementById("gps-exit-btn").addEventListener("click", exitGpsNavigation);

  // Auto-update step based on proximity
  if (userPos && gpsRoute.steps.length > 0) {
    const nextIdx = gpsStepIndex + 1;
    if (nextIdx < gpsRoute.steps.length) {
      const nextStep = gpsRoute.steps[nextIdx];
      if (nextStep.lat && nextStep.lng) {
        const d = haversine(userPos, { lat: nextStep.lat, lng: nextStep.lng });
        if (d < 22) {
          gpsStepIndex = nextIdx;
          renderGpsOverlay();
        }
      }
    }
  }
}
