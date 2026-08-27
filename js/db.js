import { REPORT_TTL_MS } from "./incidents.js";

const REPORTS_KEY = "vecxus_reports";
const CONFIRMATIONS_KEY = "vecxus_confirmations";

function loadReports() {
  try {
    return JSON.parse(localStorage.getItem(REPORTS_KEY) || "[]");
  } catch { return []; }
}

function saveReports(reports) {
  localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
}

function loadConfirmations() {
  try {
    return JSON.parse(localStorage.getItem(CONFIRMATIONS_KEY) || "[]");
  } catch { return []; }
}

function saveConfirmations(conf) {
  localStorage.setItem(CONFIRMATIONS_KEY, JSON.stringify(conf));
}

function generateId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `r-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function getReports(deviceId) {
  const now = Date.now();
  let reports = loadReports();

  // Auto-expire old reports (except admin-managed ones)
  reports = reports.map((r) => {
    const age = now - new Date(r.createdAt).getTime();
    if (age > REPORT_TTL_MS && (r.status === "ACTIVO" || r.status === "ESCALADO")) {
      return { ...r, status: "EXPIRADO", updatedAt: new Date().toISOString() };
    }
    return r;
  });
  saveReports(reports);

  // Filter: show active/escalated/attention/verified that aren't expired
  const alive = reports.filter((r) => {
    if (["ACTIVO", "ESCALADO", "EN_ATENCION", "VERIFICADO"].includes(r.status)) {
      return new Date(r.expiresAt).getTime() > now;
    }
    return ["ACTIVO", "ESCALADO", "EN_ATENCION", "VERIFICADO"].includes(r.status);
  });

  // Get user votes
  const votes = {};
  if (deviceId) {
    const allConf = loadConfirmations();
    for (const c of allConf) {
      if (c.deviceId === deviceId && alive.some((r) => r.id === c.reportId)) {
        votes[c.reportId] = c.kind;
      }
    }
  }

  return alive.map((r) => ({
    ...r,
    myVote: votes[r.id] ?? null,
  })).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getAllReports() {
  const now = Date.now();
  let reports = loadReports();

  reports = reports.map((r) => {
    const age = now - new Date(r.createdAt).getTime();
    if (age > REPORT_TTL_MS && (r.status === "ACTIVO" || r.status === "ESCALADO")) {
      return { ...r, status: "EXPIRADO", updatedAt: new Date().toISOString() };
    }
    return r;
  });
  saveReports(reports);

  return reports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function createReport({ type, description, lat, lng, deviceId }) {
  const reports = loadReports();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + REPORT_TTL_MS).toISOString();

  const report = {
    id: generateId(),
    type,
    description: (description || "").trim().slice(0, 240),
    lat,
    lng,
    status: "ACTIVO",
    confirmations: 0,
    rejections: 0,
    deviceId: deviceId || null,
    createdAt: now,
    updatedAt: now,
    expiresAt,
  };

  reports.push(report);
  saveReports(reports);
  return report;
}

export function confirmReport(reportId, kind, deviceId) {
  const reports = loadReports();
  const confs = loadConfirmations();

  const report = reports.find((r) => r.id === reportId);
  if (!report) return { error: "Reporte no encontrado", deleted: false };

  // Check TTL
  if (Date.now() - new Date(report.createdAt).getTime() > REPORT_TTL_MS) {
    return { error: "Este reporte ya expiro", expired: true };
  }

  if (report.status === "FALSA_ALARMA" || report.status === "RESUELTO") {
    return { error: "Este reporte ya fue cerrado por el administrador" };
  }

  // Check if already voted
  const existing = confs.find((c) => c.reportId === reportId && c.deviceId === deviceId);
  if (existing) {
    return { alreadyVoted: true, report };
  }

  // Add vote
  confs.push({
    id: generateId(),
    reportId,
    deviceId,
    kind,
    createdAt: new Date().toISOString(),
  });
  saveConfirmations(confs);

  if (kind === "CONFIRM") {
    report.confirmations += 1;
    if (report.status === "ACTIVO" && report.confirmations >= 3) {
      report.status = "ESCALADO";
    }
  } else {
    report.rejections += 1;
    if (report.rejections >= 3) {
      // Delete report
      const idx = reports.findIndex((r) => r.id === reportId);
      if (idx !== -1) reports.splice(idx, 1);
      saveReports(reports);
      return { deleted: true, alreadyVoted: false };
    }
  }

  report.updatedAt = new Date().toISOString();
  saveReports(reports);

  return { alreadyVoted: false, report };
}

export function updateReportStatus(reportId, status) {
  const reports = loadReports();
  const report = reports.find((r) => r.id === reportId);
  if (!report) return null;

  report.status = status;
  report.updatedAt = new Date().toISOString();
  saveReports(reports);
  return report;
}

export function expireOldReports() {
  const now = Date.now();
  const reports = loadReports();
  let changed = false;

  for (const r of reports) {
    if (
      (r.status === "ACTIVO" || r.status === "ESCALADO") &&
      now - new Date(r.createdAt).getTime() > REPORT_TTL_MS
    ) {
      r.status = "EXPIRADO";
      r.updatedAt = new Date().toISOString();
      changed = true;
    }
  }

  if (changed) saveReports(reports);
}
