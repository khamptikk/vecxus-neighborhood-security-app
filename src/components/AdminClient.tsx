"use client";

import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  Hourglass,
  Layers,
  Loader2,
  MapPin,
  RotateCcw,
  ShieldCheck,
  Siren,
  ThumbsUp,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FlyTarget, LatLng } from "./MapView";
import {
  ESCALATION_THRESHOLD,
  INCIDENT_META,
  STATUS_META,
  type ReportDTO,
  type ReportStatus,
} from "@/lib/incidents";
import { TYPE_ICONS } from "@/lib/icons";
import { formatDateTime, timeAgo, timeLeft } from "@/lib/geo";
import { getDeviceId } from "@/lib/device";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#0a0d12]">
      <Loader2 className="animate-spin text-slate-600" size={26} />
    </div>
  ),
});

const DEFAULT_CENTER: LatLng = { lat: -12.0464, lng: -77.0428 }; // Lima, Perú

const PRIORITY: ReportStatus[] = [
  "ESCALADO",
  "ACTIVO",
  "EN_ATENCION",
  "VERIFICADO",
  "FALSA_ALARMA",
  "RESUELTO",
  "EXPIRADO",
];

const ADMIN_ACTIONS: { status: ReportStatus; icon: typeof Ban; classes: string }[] = [
  {
    status: "EN_ATENCION",
    icon: Clock3,
    classes: "border-blue-400/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20",
  },
  {
    status: "VERIFICADO",
    icon: CheckCircle2,
    classes: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20",
  },
  {
    status: "FALSA_ALARMA",
    icon: Ban,
    classes: "border-slate-400/25 bg-slate-500/10 text-slate-300 hover:bg-slate-500/20",
  },
  {
    status: "RESUELTO",
    icon: ShieldCheck,
    classes: "border-slate-400/25 bg-slate-600/15 text-slate-200 hover:bg-slate-600/25",
  },
];

type Toast = { msg: string; kind: "ok" | "warn" | "info" } | null;

export default function AdminClient() {
  const [reports, setReports] = useState<ReportDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"TODOS" | ReportStatus>("TODOS");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flyTarget, setFlyTarget] = useState<FlyTarget>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, kind: NonNullable<Toast>["kind"] = "info") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, kind });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      const devId = getDeviceId();
      const res = await fetch(`/api/admin/reports?d=${encodeURIComponent(devId)}`, {
        headers: { "x-device-id": devId },
        cache: "no-store",
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { reports: ReportDTO[] };
      setReports(data.reports);
    } catch {
      showToast("Error al cargar los reportes", "warn");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 10000);
    return () => clearInterval(t);
  }, [fetchAll]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of reports) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [reports]);

  const visible = useMemo(() => {
    const filtered =
      filter === "TODOS" ? reports : reports.filter((r) => r.status === filter);
    return [...filtered].sort((a, b) => {
      const pa = PRIORITY.indexOf(a.status);
      const pb = PRIORITY.indexOf(b.status);
      if (pa !== pb) return pa - pb;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [reports, filter]);

  const changeStatus = async (id: string, status: ReportStatus) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Error");
      setReports((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, status, confirmations: data.report.confirmations }
            : r
        )
      );
      showToast(`Estado actualizado a ${STATUS_META[status].label}`, "ok");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo actualizar", "warn");
    } finally {
      setSavingId(null);
    }
  };

  const focusReport = (id: string, scroll = false) => {
    setSelectedId(id);
    const r = reports.find((x) => x.id === id);
    if (r) setFlyTarget({ lat: r.lat, lng: r.lng, zoom: 16, ts: Date.now() });
    if (scroll) {
      requestAnimationFrame(() => {
        cardRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  };

  const escalados = counts["ESCALADO"] ?? 0;

  return (
    <div className="flex min-h-dvh flex-col bg-[#07090d] lg:h-dvh lg:overflow-hidden">
      {/* HEADER */}
      <header className="flex items-center gap-3 border-b border-white/8 bg-[#0b0e14]/90 px-4 py-3 backdrop-blur-xl">
        <Link
          href="/"
          aria-label="Volver al mapa"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <ShieldCheck size={17} className="text-red-400" strokeWidth={2.5} />
            <h1 className="text-[17px] font-black tracking-[0.14em] text-white">
              VECXUS <span className="text-red-400">ADMIN</span>
            </h1>
          </div>
          <p className="text-[9.5px] font-bold tracking-[0.28em] text-slate-500">
            PANEL DE REVISIÓN DE INCIDENTES
          </p>
        </div>
        {escalados > 0 && (
          <div className="flex items-center gap-1.5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[12px] font-extrabold text-amber-300">
            <Siren size={14} />
            {escalados} POR REVISAR
          </div>
        )}
      </header>

      <main className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
        {/* MAPA */}
        <section className="relative h-[38dvh] shrink-0 lg:h-auto lg:flex-1">
          <MapView
            center={DEFAULT_CENTER}
            zoom={13}
            reports={visible}
            userPos={null}
            selectedId={selectedId}
            flyTarget={flyTarget}
            dimClosed
            onSelectReport={(id) => focusReport(id, true)}
          />
        </section>

        {/* LISTA */}
        <aside className="flex min-h-0 flex-col border-t border-white/8 lg:w-[440px] lg:border-l lg:border-t-0">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-2 px-4 pt-4">
            {(["ESCALADO", "ACTIVO", "EN_ATENCION", "VERIFICADO"] as const).map((st) => (
              <button
                key={st}
                onClick={() => setFilter(filter === st ? "TODOS" : st)}
                className={`rounded-xl border px-2 py-2.5 text-center transition ${
                  filter === st
                    ? "border-transparent"
                    : "border-white/8 bg-white/[.03] hover:bg-white/[.06]"
                }`}
                style={
                  filter === st
                    ? { background: STATUS_META[st].bg, boxShadow: `inset 0 0 0 1.5px ${STATUS_META[st].color}` }
                    : undefined
                }
              >
                <div
                  className="text-[19px] font-black leading-none tabular-nums"
                  style={{ color: STATUS_META[st].color }}
                >
                  {counts[st] ?? 0}
                </div>
                <div className="mt-1 text-[8px] font-extrabold tracking-[0.12em] text-slate-500">
                  {STATUS_META[st].label}
                </div>
              </button>
            ))}
          </div>

          {/* Filtro */}
          <div className="flex items-center gap-2 overflow-x-auto px-4 pb-1 pt-3">
            <Layers size={14} className="shrink-0 text-slate-500" />
            {(["TODOS", "ESCALADO", "ACTIVO", "EN_ATENCION", "VERIFICADO", "FALSA_ALARMA", "RESUELTO", "EXPIRADO"] as const).map(
              (f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-[10.5px] font-extrabold tracking-wide transition ${
                    filter === f
                      ? "border-red-400/50 bg-red-500/15 text-red-300"
                      : "border-white/10 bg-white/[.04] text-slate-400 hover:bg-white/[.08]"
                  }`}
                >
                  {f === "TODOS" ? "TODOS" : STATUS_META[f].label}
                </button>
              )
            )}
          </div>

          {/* Tarjetas */}
          <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3 lg:min-h-0">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-[13px] font-semibold">Cargando reportes…</span>
              </div>
            ) : visible.length === 0 ? (
              <div className="py-16 text-center text-[13px] font-semibold text-slate-500">
                No hay reportes con este filtro.
              </div>
            ) : (
              visible.map((r) => {
                const t = INCIDENT_META[r.type] ?? INCIDENT_META.OTRO;
                const s = STATUS_META[r.status] ?? STATUS_META.ACTIVO;
                const Icon = TYPE_ICONS[r.type] ?? TYPE_ICONS.OTRO;
                    const isClosed =
                      r.status === "FALSA_ALARMA" ||
                      r.status === "RESUELTO" ||
                      r.status === "EXPIRADO";
                const isSelected = selectedId === r.id;
                return (
                  <div
                    key={r.id}
                    ref={(el) => {
                      cardRefs.current[r.id] = el;
                    }}
                    onClick={() => focusReport(r.id)}
                    className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                      isSelected
                        ? "border-red-500/50 bg-red-500/[.06]"
                        : "border-white/8 bg-white/[.03] hover:border-white/15 hover:bg-white/[.05]"
                    } ${isClosed ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                        style={{ background: t.soft, color: t.color }}
                      >
                        <Icon size={18} strokeWidth={2.3} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[14.5px] font-extrabold text-white">
                            {t.label}
                          </span>
                          <span
                            className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-extrabold tracking-widest"
                            style={{ background: s.bg, color: s.color }}
                          >
                            {s.label}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[10.5px] font-semibold text-slate-500">
                          <span>{timeAgo(r.createdAt)}</span>
                          <span>·</span>
                          <span>{formatDateTime(r.createdAt)}</span>
                        </div>
                      </div>
                    </div>

                    <p className="mt-2.5 line-clamp-2 text-[13px] leading-snug text-slate-300">
                      {r.description || <span className="italic text-slate-500">Sin descripción</span>}
                    </p>

                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] font-bold text-slate-400">
                      <span className="flex items-center gap-1">
                        <MapPin size={12} className="text-slate-500" />
                        {r.lat.toFixed(5)}, {r.lng.toFixed(5)}
                      </span>
                      <span className="flex items-center gap-1 text-emerald-400/90">
                        <Eye size={12} />
                        {r.confirmations}/{ESCALATION_THRESHOLD}
                      </span>
                      {r.rejections > 0 && (
                        <span className="flex items-center gap-1 text-slate-500">
                          <EyeOff size={12} />
                          {r.rejections}/3
                        </span>
                      )}
                      {(r.status === "ACTIVO" || r.status === "ESCALADO") && (
                        <span className="flex items-center gap-1 text-orange-300/80">
                          <Hourglass size={11.5} />
                          {timeLeft(r.expiresAt).text}
                        </span>
                      )}
                    </div>

                    {/* Barra corroboración */}
                    <div className="mt-2.5 flex gap-1">
                      {Array.from({ length: ESCALATION_THRESHOLD }).map((_, i) => (
                        <div
                          key={i}
                          className="h-1.5 flex-1 rounded-full"
                          style={{
                            background:
                              i < Math.min(r.confirmations, ESCALATION_THRESHOLD)
                                ? "#fbbf24"
                                : "rgba(255,255,255,.08)",
                          }}
                        />
                      ))}
                    </div>

                    {/* Acciones admin */}
                    <div
                      className="mt-3 grid grid-cols-2 gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {ADMIN_ACTIONS.map(({ status, icon: AIcon, classes }) => {
                        const current = r.status === status;
                        return (
                          <button
                            key={status}
                            disabled={current || savingId === r.id}
                            onClick={() => changeStatus(r.id, status)}
                            className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-[11px] font-extrabold tracking-wide transition active:scale-[.97] disabled:cursor-default ${classes} ${
                              current ? "opacity-100 ring-1 ring-current" : ""
                            } disabled:opacity-40`}
                          >
                            {savingId === r.id ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <AIcon size={13.5} strokeWidth={2.5} />
                            )}
                            {current ? `✓ ${STATUS_META[status].label}` : STATUS_META[status].label}
                          </button>
                        );
                      })}
                      {isClosed && (
                        <button
                          disabled={savingId === r.id}
                          onClick={() => changeStatus(r.id, "ACTIVO")}
                          className="col-span-2 flex items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-white/[.05] py-2 text-[11px] font-extrabold tracking-wide text-slate-300 transition hover:bg-white/[.09] active:scale-[.97]"
                        >
                          <RotateCcw size={12.5} />
                          REABRIR COMO ACTIVO
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </main>

      {/* TOAST */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[2000] flex justify-center px-6">
          <div
            className={`vx-toast max-w-sm rounded-2xl border px-4 py-3 text-center text-[13px] font-bold shadow-2xl backdrop-blur-xl ${
              toast.kind === "ok"
                ? "border-emerald-400/30 bg-emerald-950/90 text-emerald-200"
                : toast.kind === "warn"
                  ? "border-amber-400/30 bg-amber-950/90 text-amber-200"
                  : "border-white/15 bg-[#11151d]/95 text-slate-200"
            }`}
          >
            {toast.msg}
          </div>
        </div>
      )}

      {/* marca */}
      <div className="pointer-events-none fixed right-3 top-3 z-[2000] hidden items-center gap-1 rounded-full bg-black/40 px-2.5 py-1 text-[9px] font-extrabold tracking-widest text-slate-500 lg:flex">
        <ThumbsUp size={10} />
        OpenStreetMap
      </div>
    </div>
  );
}
