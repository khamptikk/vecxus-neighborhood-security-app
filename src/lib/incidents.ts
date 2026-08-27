export const INCIDENT_TYPES = [
  "ROBO",
  "PELEA",
  "ACCIDENTE",
  "INCENDIO",
  "EMERGENCIA",
  "SOSPECHOSO",
  "OTRO",
] as const;

export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const INCIDENT_META: Record<
  IncidentType,
  { label: string; color: string; soft: string }
> = {
  ROBO: { label: "Robo", color: "#f97316", soft: "rgba(249,115,22,.14)" },
  PELEA: { label: "Pelea", color: "#ef4444", soft: "rgba(239,68,68,.14)" },
  ACCIDENTE: { label: "Accidente", color: "#f59e0b", soft: "rgba(245,158,11,.14)" },
  INCENDIO: { label: "Incendio", color: "#fb7185", soft: "rgba(251,113,133,.14)" },
  EMERGENCIA: { label: "Emergencia", color: "#a78bfa", soft: "rgba(167,139,250,.16)" },
  SOSPECHOSO: { label: "Persona sospechosa", color: "#22d3ee", soft: "rgba(34,211,238,.14)" },
  OTRO: { label: "Otro", color: "#94a3b8", soft: "rgba(148,163,184,.14)" },
};

export const REPORT_STATUSES = [
  "ACTIVO",
  "ESCALADO",
  "EN_ATENCION",
  "VERIFICADO",
  "FALSA_ALARMA",
  "RESUELTO",
  "EXPIRADO",
] as const;

export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const STATUS_META: Record<
  ReportStatus,
  { label: string; color: string; bg: string }
> = {
  ACTIVO: { label: "ACTIVO", color: "#f87171", bg: "rgba(248,113,113,.12)" },
  ESCALADO: { label: "ESCALADO", color: "#fbbf24", bg: "rgba(251,191,36,.12)" },
  EN_ATENCION: { label: "EN ATENCIÓN", color: "#60a5fa", bg: "rgba(96,165,250,.12)" },
  VERIFICADO: { label: "VERIFICADO", color: "#34d399", bg: "rgba(52,211,153,.12)" },
  FALSA_ALARMA: { label: "FALSA ALARMA", color: "#94a3b8", bg: "rgba(148,163,184,.12)" },
  RESUELTO: { label: "RESUELTO", color: "#64748b", bg: "rgba(100,116,139,.14)" },
  EXPIRADO: { label: "EXPIRADO", color: "#6b7280", bg: "rgba(107,114,128,.14)" },
};

/** Estados que un administrador puede asignar manualmente */
export const ADMIN_STATUSES: ReportStatus[] = [
  "EN_ATENCION",
  "VERIFICADO",
  "FALSA_ALARMA",
  "RESUELTO",
];

/** Umbral de corroboración comunitaria para escalar un reporte */
export const ESCALATION_THRESHOLD = 3;

/** Con 3 respuestas "NO VEO NADA" el reporte se elimina automáticamente */
export const REJECTION_THRESHOLD = 3;

/** Cada reporte vive 1 hora; después expira y deja de mostrarse en el mapa */
export const REPORT_TTL_MS = 60 * 60 * 1000;

export type ReportDTO = {
  id: string;
  type: IncidentType;
  description: string;
  lat: number;
  lng: number;
  status: ReportStatus;
  confirmations: number;
  rejections: number;
  createdAt: string;
  /** Momento en que el reporte deja de mostrarse (creación + 1 hora) */
  expiresAt: string;
  myVote: "CONFIRM" | "REJECT" | null;
};
