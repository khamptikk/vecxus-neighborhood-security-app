"use client";

import {
  Car,
  Check,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  Footprints,
  Hourglass,
  Info,
  Loader2,
  Navigation,
  Navigation2,
  Trash2,
  X,
} from "lucide-react";
import {
  ESCALATION_THRESHOLD,
  INCIDENT_META,
  REJECTION_THRESHOLD,
  STATUS_META,
  type ReportDTO,
} from "@/lib/incidents";
import {
  formatDateTime,
  formatDistance,
  haversineMeters,
  timeAgo,
  timeLeft,
} from "@/lib/geo";
import { TYPE_ICONS } from "@/lib/icons";
import { getGoogleMapsUrl } from "@/lib/navigation";
import type { LatLng } from "./MapView";

export default function IncidentSheet({
  report,
  userPos,
  voting,
  routeLoading,
  onVote,
  onStartGps,
  onClose,
}: {
  report: ReportDTO;
  userPos: LatLng | null;
  voting: boolean;
  routeLoading: boolean;
  onVote: (kind: "CONFIRM" | "REJECT") => void;
  onStartGps: (profile: "foot" | "car") => void;
  onClose: () => void;
}) {
  const t = INCIDENT_META[report.type] ?? INCIDENT_META.OTRO;
  const s = STATUS_META[report.status] ?? STATUS_META.ACTIVO;
  const Icon = TYPE_ICONS[report.type] ?? TYPE_ICONS.OTRO;
  const distance = userPos
    ? haversineMeters(userPos, { lat: report.lat, lng: report.lng })
    : null;
  const conf = Math.min(report.confirmations, ESCALATION_THRESHOLD);
  const left = timeLeft(report.expiresAt);
  const rejectsLeft = Math.max(0, REJECTION_THRESHOLD - report.rejections);

  return (
    <div className="absolute inset-0 z-[1200] flex flex-col justify-end">
      <button
        aria-label="Cerrar"
        onClick={onClose}
        className="vx-fade absolute inset-0 bg-black/45"
      />
      <div className="vx-sheet relative max-h-[82dvh] overflow-y-auto rounded-t-[28px] border-t border-white/10 bg-[#0c0f16]/97 px-5 pb-8 pt-3 shadow-[0_-20px_60px_rgba(0,0,0,.7)] backdrop-blur-xl">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/15" />

        {/* Encabezado */}
        <div className="flex items-start gap-3.5">
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
            style={{ background: t.soft, color: t.color, boxShadow: `inset 0 0 0 1.5px ${t.color}55` }}
          >
            <Icon size={26} strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-[22px] font-extrabold tracking-tight text-white">
                {t.label}
              </h2>
            </div>
            <span
              className="mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-extrabold tracking-widest"
              style={{ background: s.bg, color: s.color }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <X size={17} />
          </button>
        </div>

        {/* Descripción */}
        <p className="mt-4 text-[15px] leading-relaxed text-slate-300">
          {report.description || (
            <span className="italic text-slate-500">Sin descripción.</span>
          )}
        </p>

        {/* Meta */}
        <div className="mt-3 flex flex-wrap gap-2 text-[11.5px] font-semibold text-slate-400">
          <span className="flex items-center gap-1.5 rounded-full bg-white/[.05] px-2.5 py-1.5">
            <Clock size={12.5} />
            {timeAgo(report.createdAt)} · {formatDateTime(report.createdAt)}
          </span>
          {distance != null && (
            <span className="flex items-center gap-1.5 rounded-full bg-white/[.05] px-2.5 py-1.5">
              <Navigation size={12.5} />
              {formatDistance(distance)}
            </span>
          )}
          <span
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5"
            style={{
              background: left.urgent ? "rgba(251,146,60,.14)" : "rgba(255,255,255,.05)",
              color: left.urgent ? "#fdba74" : undefined,
            }}
          >
            <Hourglass size={12.5} />
            Expira en {left.text}
          </span>
        </div>

        {/* Barra de vida del reporte (1 hora) */}
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/[.06]">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${Math.max(0, Math.min(100, (left.ms / 3600000) * 100))}%`,
              background: left.urgent ? "#fb923c" : "#475569",
            }}
          />
        </div>

        {/* Corroboración */}
        <div className="mt-5 rounded-2xl border border-white/8 bg-white/[.03] p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[12px] font-extrabold tracking-widest text-slate-400">
              CORROBORACIÓN VECINAL
            </h3>
            <span
              className="text-[13px] font-extrabold tabular-nums"
              style={{ color: conf >= ESCALATION_THRESHOLD ? "#fbbf24" : "#e2e8f0" }}
            >
              {conf}/{ESCALATION_THRESHOLD}
            </span>
          </div>

          <div className="mt-2.5 flex gap-1.5">
            {Array.from({ length: ESCALATION_THRESHOLD }).map((_, i) => (
              <div
                key={i}
                className="h-2.5 flex-1 rounded-full transition-all duration-500"
                style={{
                  background:
                    i < conf
                      ? conf >= ESCALATION_THRESHOLD
                        ? "#fbbf24"
                        : t.color
                      : "rgba(255,255,255,.08)",
                  boxShadow: i < conf ? `0 0 12px ${conf >= ESCALATION_THRESHOLD ? "#fbbf24" : t.color}66` : undefined,
                }}
              />
            ))}
          </div>

          <p className="mt-2.5 text-[12.5px] leading-snug text-slate-400">
            {report.confirmations === 0
              ? "Aún nadie corrobora este reporte."
              : report.confirmations === 1
                ? "1 vecino está viendo este incidente."
                : `${report.confirmations} vecinos están viendo este incidente.`}
            {report.rejections > 0 && (
              <span className="text-slate-500">
                {" "}
                · {report.rejections}{" "}
                {report.rejections === 1 ? "dice" : "dicen"} que no ven nada
              </span>
            )}
          </p>

          {report.status === "ESCALADO" && (
            <div className="mt-3 flex gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-[12px] leading-snug text-amber-200/90">
              <Info size={15} className="mt-0.5 shrink-0 text-amber-300" />
              <span>
                <b>Escalado a revisión.</b> {ESCALATION_THRESHOLD} confirmaciones
                vecinas no constituyen una verificación oficial: significan que el
                incidente tiene suficiente corroboración comunitaria para ser
                revisado.
              </span>
            </div>
          )}

          {/* Votar */}
          {report.myVote ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/[.06] px-3.5 py-3 text-[13px] font-bold text-slate-200">
              {report.myVote === "CONFIRM" ? (
                <>
                  <Eye size={16} className="text-emerald-400" />
                  Tu respuesta: estás viendo el incidente
                </>
              ) : (
                <>
                  <EyeOff size={16} className="text-slate-400" />
                  Tu respuesta: no ves nada
                </>
              )}
              <Check size={15} className="ml-auto text-slate-500" />
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-2">
              <button
                disabled={voting}
                onClick={() => onVote("CONFIRM")}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-700 py-3.5 text-[14px] font-extrabold tracking-wide text-white shadow-lg shadow-emerald-900/40 transition active:scale-[.98] disabled:opacity-50"
              >
                {voting ? <Loader2 size={17} className="animate-spin" /> : <Eye size={17} strokeWidth={2.5} />}
                ESTOY VIENDO EL INCIDENTE
              </button>
              <button
                disabled={voting}
                onClick={() => onVote("REJECT")}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[.05] py-3 text-[13px] font-bold tracking-wide text-slate-300 transition hover:bg-white/[.09] active:scale-[.98] disabled:opacity-50"
              >
                <EyeOff size={15.5} />
                NO VEO NADA
              </button>
              {report.rejections > 0 && (
                <p className="flex items-center justify-center gap-1.5 text-[11.5px] font-semibold text-slate-500">
                  <Trash2 size={12} />
                  {report.rejections}/{REJECTION_THRESHOLD} dicen que no ven nada ·{" "}
                  {rejectsLeft === 1
                    ? "1 voto más y se elimina"
                    : `${rejectsLeft} votos más y se elimina`}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Navegación GPS hacia el incidente */}
        <div className="mt-4 space-y-2">
          <div className="flex gap-2">
            <button
              disabled={!userPos || routeLoading}
              onClick={() => onStartGps("foot")}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-emerald-400/35 bg-gradient-to-b from-emerald-500 to-emerald-700 py-4 text-[14.5px] font-black tracking-wide text-white shadow-lg shadow-emerald-950/60 transition active:scale-[0.98] disabled:opacity-40"
            >
              {routeLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Navigation2 size={18} strokeWidth={2.8} className="fill-white" />
              )}
              {userPos ? "CÓMO LLEGAR (GPS A PIE)" : "ACTIVA TU UBICACIÓN PARA GPS"}
            </button>

            <button
              disabled={!userPos || routeLoading}
              onClick={() => onStartGps("car")}
              aria-label="Cómo llegar en auto"
              title="Cómo llegar en auto"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.05] text-slate-200 transition hover:bg-white/10 active:scale-[0.98] disabled:opacity-40"
            >
              <Car size={20} />
            </button>

            <a
              href={getGoogleMapsUrl({ lat: report.lat, lng: report.lng }, userPos, "foot")}
              target="_blank"
              rel="noreferrer"
              aria-label="Abrir en Google Maps"
              title="Abrir en Google Maps"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.05] text-slate-200 transition hover:bg-white/10 active:scale-[0.98]"
            >
              <ExternalLink size={19} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
