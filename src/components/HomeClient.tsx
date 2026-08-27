"use client";

import type L from "leaflet";
import {
  LocateFixed,
  MapPin,
  Megaphone,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapView, { type FlyTarget, type LatLng } from "./MapView";
import ReportFlow from "./ReportFlow";
import IncidentSheet from "./IncidentSheet";
import GpsNavigationOverlay from "./GpsNavigationOverlay";
import { getDeviceId } from "@/lib/device";
import { haversineMeters } from "@/lib/geo";
import {
  INCIDENT_META,
  REJECTION_THRESHOLD,
  type IncidentType,
  type ReportDTO,
} from "@/lib/incidents";
import { parseOSRMSteps, type NavRoute, type NavStep } from "@/lib/navigation";

const DEFAULT_CENTER: LatLng = { lat: -12.0464, lng: -77.0428 }; // Lima, Perú (Plaza Mayor / Centro Histórico)
const POLL_MS = 8000;

type Mode = "idle" | "pick" | "form";
type Toast = { msg: string; kind: "ok" | "info" | "warn" } | null;

export default function HomeClient() {
  const [deviceId, setDeviceId] = useState("");
  const [reports, setReports] = useState<ReportDTO[]>([]);
  const [userPos, setUserPos] = useState<LatLng | null>(null);
  const [userAccuracy, setUserAccuracy] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [draft, setDraft] = useState<LatLng | null>(null);
  const [sending, setSending] = useState(false);
  const [voting, setVoting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [routeCoords, setRouteCoords] = useState<[number, number][] | null>(null);
  const [gpsRoute, setGpsRoute] = useState<NavRoute | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [flyTarget, setFlyTarget] = useState<FlyTarget>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [, setTick] = useState(0); // refresca los contadores de expiración
  const mapRef = useRef<L.Map | null>(null);
  const locatedOnce = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reportsRef = useRef<ReportDTO[]>([]);
  reportsRef.current = reports;

  const showToast = useCallback((msg: string, kind: NonNullable<Toast>["kind"] = "info") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, kind });
    toastTimer.current = setTimeout(() => setToast(null), 3400);
  }, []);

  /* ------------ identidad anónima ------------ */
  useEffect(() => {
    setDeviceId(getDeviceId());
  }, []);

  /* ------------ carga de reportes ------------ */
  const fetchReports = useCallback(
    async (silent = true) => {
      const devId = deviceId || getDeviceId();
      if (!devId) return;
      try {
        const res = await fetch(`/api/reports?d=${encodeURIComponent(devId)}`, {
          headers: { "x-device-id": devId },
          cache: "no-store",
        });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { reports: ReportDTO[] };
        setReports(data.reports);
      } catch {
        if (!silent) showToast("No se pudieron cargar los incidentes", "warn");
      }
    },
    [deviceId, showToast]
  );

  useEffect(() => {
    fetchReports();
    const t = setInterval(() => fetchReports(), POLL_MS);
    return () => clearInterval(t);
  }, [fetchReports]);

  /* ------------ expiración local (1 hora por reporte) ------------ */
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setReports((prev) => {
        const alive = prev.filter((r) => new Date(r.expiresAt).getTime() > now);
        return alive.length === prev.length ? prev : alive;
      });
      setSelectedId((cur) => {
        if (!cur) return cur;
        const r = reportsRef.current.find((x) => x.id === cur);
        return r && new Date(r.expiresAt).getTime() <= now ? null : cur;
      });
      setTick((n) => n + 1);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  /* ------------ geolocalización ------------ */
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    let watchId: number | null = null;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserPos(p);
        setUserAccuracy(pos.coords.accuracy);
        if (!locatedOnce.current) {
          locatedOnce.current = true;
          setFlyTarget({ ...p, zoom: 16, ts: Date.now() });
        }
      },
      () => showToast("No pudimos obtener tu ubicación. Puedes mover el mapa manualmente.", "warn"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
    );

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setUserAccuracy(pos.coords.accuracy);
      },
      () => {},
      { enableHighAccuracy: false, maximumAge: 30000 }
    );

    return () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
    };
  }, [showToast]);

  const selected = useMemo(
    () => reports.find((r) => r.id === selectedId) ?? null,
    [reports, selectedId]
  );

  const activeNear = useMemo(() => {
    const actives = reports.filter(
      (r) => r.status === "ACTIVO" || r.status === "ESCALADO"
    );
    if (!userPos) return actives.length;
    return actives.filter(
      (r) => haversineMeters(userPos, { lat: r.lat, lng: r.lng }) <= 5000
    ).length;
  }, [reports, userPos]);

  /* ------------ flujo de reporte ------------ */
  const startReport = () => {
    setSelectedId(null);
    setRouteCoords(null);
    setGpsRoute(null);
    setDraft(userPos);
    setMode("pick");
  };

  const cancelReport = () => {
    setMode("idle");
    setDraft(null);
  };

  const submitReport = async (type: IncidentType, description: string) => {
    if (!draft) return;
    const devId = deviceId || getDeviceId();
    setSending(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-device-id": devId },
        body: JSON.stringify({
          type,
          description,
          lat: draft.lat,
          lng: draft.lng,
          deviceId: devId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Error al enviar");
      }
      const data = (await res.json()) as { report: ReportDTO };
      setReports((prev) => [data.report, ...prev]);
      setMode("idle");
      setDraft(null);
      setSelectedId(data.report.id);
      setFlyTarget({ lat: data.report.lat, lng: data.report.lng, zoom: 17, ts: Date.now() });
      showToast("Reporte enviado. Los vecinos cercanos ya pueden verlo.", "ok");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "No se pudo enviar el reporte", "warn");
    } finally {
      setSending(false);
    }
  };

  /* ------------ corroboración ------------ */
  const vote = async (kind: "CONFIRM" | "REJECT") => {
    if (!selectedId || voting) return;
    const devId = deviceId || getDeviceId();
    setVoting(true);
    try {
      const res = await fetch(`/api/reports/${selectedId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-device-id": devId },
        body: JSON.stringify({ kind, deviceId: devId }),
      });
      const data = await res.json();

      // El reporte se eliminó solo (3 "no veo nada") o ya no existe / expiró
      if (data?.deleted || data?.removed || data?.expired) {
        setReports((prev) => prev.filter((r) => r.id !== selectedId));
        setSelectedId(null);
        clearRoute();
        showToast(
          data?.deleted
            ? "3 vecinos no vieron nada: el reporte se eliminó automáticamente"
            : (data?.error ?? "Este reporte ya no está disponible"),
          data?.deleted ? "ok" : "info"
        );
        return;
      }

      if (!res.ok) throw new Error(data?.error ?? "No se pudo registrar");
      const updated = data.report as ReportDTO;
      setReports((prev) => prev.map((r) => (r.id === updated.id ? { ...updated, myVote: kind } : r)));
      if (data.alreadyVoted) {
        showToast("Ya habías registrado tu respuesta en este reporte", "info");
      } else if (kind === "CONFIRM" && updated.status === "ESCALADO") {
        showToast("¡Corroboración completa! El reporte fue ESCALADO a revisión.", "ok");
      } else if (kind === "REJECT") {
        const left = REJECTION_THRESHOLD - updated.rejections;
        showToast(
          left > 0
            ? `Respuesta registrada. ${left} ${left === 1 ? "voto más elimina" : "votos más eliminan"} el reporte.`
            : "Respuesta registrada.",
          "ok"
        );
      } else {
        showToast("Corroboración registrada. ¡Gracias!", "ok");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al corroborar", "warn");
    } finally {
      setVoting(false);
    }
  };

  /* ------------ Navegación GPS en vivo ------------ */
  const startGpsNavigation = async (profile: "foot" | "car" = "foot") => {
    if (!selected || !userPos || routeLoading) return;
    setRouteLoading(true);
    try {
      const osrmProfile = profile === "car" ? "car" : "foot";
      const url = `https://router.project-osrm.org/route/v1/${osrmProfile}/${userPos.lng},${userPos.lat};${selected.lng},${selected.lat}?overview=full&geometries=geojson&steps=true`;
      const res = await fetch(url);
      const data = await res.json();
      const rawRoute = data?.routes?.[0];
      if (!rawRoute) throw new Error("No se pudo calcular la ruta");

      const coords = (rawRoute.geometry.coordinates as [number, number][]).map(
        ([lng, lat]) => [lat, lng] as [number, number]
      );
      const label = INCIDENT_META[selected.type]?.label ?? "el incidente";
      const rawSteps = rawRoute.legs?.[0]?.steps ?? [];
      const steps = parseOSRMSteps(rawSteps, label);

      const navRoute: NavRoute = {
        profile,
        distanceMeters: Math.round(rawRoute.distance ?? 0),
        durationSec: Math.round(rawRoute.duration ?? 0),
        coords,
        steps,
        destinationLabel: label,
        destinationPos: { lat: selected.lat, lng: selected.lng },
      };

      setRouteCoords(coords);
      setGpsRoute(navRoute);
      showToast(`Navegación GPS hacia ${label} iniciada`, "ok");
    } catch {
      // Fallback: ruta en línea recta
      const d = haversineMeters(userPos, { lat: selected.lat, lng: selected.lng });
      const label = INCIDENT_META[selected.type]?.label ?? "el incidente";
      const straightCoords: [number, number][] = [
        [userPos.lat, userPos.lng],
        [selected.lat, selected.lng],
      ];
      const fallbackSteps: NavStep[] = [
        {
          index: 0,
          instruction: `Avanza en dirección a ${label}`,
          streetName: "",
          distanceMeters: Math.round(d),
          durationSec: Math.round((d / 1000) * 12 * 60),
          icon: "straight",
          lat: userPos.lat,
          lng: userPos.lng,
          maneuverType: "depart",
        },
        {
          index: 1,
          instruction: `Llegaste a tu destino (${label})`,
          streetName: "",
          distanceMeters: 0,
          durationSec: 0,
          icon: "arrive",
          lat: selected.lat,
          lng: selected.lng,
          maneuverType: "arrive",
        },
      ];

      setRouteCoords(straightCoords);
      setGpsRoute({
        profile,
        distanceMeters: Math.round(d),
        durationSec: Math.round((d / 1000) * 12 * 60),
        coords: straightCoords,
        steps: fallbackSteps,
        destinationLabel: label,
        destinationPos: { lat: selected.lat, lng: selected.lng },
      });
      showToast("Ruta en línea recta calculada", "info");
    } finally {
      setRouteLoading(false);
    }
  };

  const exitGpsNavigation = () => {
    setGpsRoute(null);
    setRouteCoords(null);
  };

  const clearRoute = () => {
    setRouteCoords(null);
    setGpsRoute(null);
  };

  const selectReport = (id: string) => {
    const r = reports.find((x) => x.id === id);
    setSelectedId(id);
    clearRoute();
    if (r) setFlyTarget({ lat: r.lat, lng: r.lng, zoom: Math.max(16, mapRef.current?.getZoom() ?? 16), ts: Date.now() });
  };

  const locate = () => {
    if (userPos) {
      setFlyTarget({ ...userPos, zoom: 17, ts: Date.now() });
    } else {
      navigator.geolocation?.getCurrentPosition(
        (pos) => {
          const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserPos(p);
          setFlyTarget({ ...p, zoom: 17, ts: Date.now() });
        },
        () => showToast("Activa el permiso de ubicación en tu navegador", "warn"),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  };

  return (
    <div className="fixed inset-0 h-dvh w-full overflow-hidden bg-[#07090d]">
      {/* MAPA */}
      <div className="absolute inset-0">
        <MapView
          center={DEFAULT_CENTER}
          zoom={14}
          reports={reports}
          userPos={userPos}
          userAccuracy={userAccuracy}
          picking={mode === "pick"}
          draft={draft}
          selectedId={selectedId}
          routeCoords={routeCoords}
          flyTarget={flyTarget}
          onPick={(p) => setDraft(p)}
          onSelectReport={selectReport}
          onMapReady={(m) => (mapRef.current = m)}
        />
      </div>

      {/* HEADER (oculto en modo GPS) */}
      {!gpsRoute && (
        <header className="pointer-events-none absolute inset-x-0 top-0 z-[1100] px-4 pt-4">
          <div className="vx-drop flex items-start justify-between gap-3">
            <div className="pointer-events-auto rounded-2xl border border-white/10 bg-[#0b0e14]/85 px-4 py-3 shadow-xl shadow-black/40 backdrop-blur-xl">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/15 text-red-400">
                  <ShieldCheck size={16} strokeWidth={2.5} />
                </span>
                <h1 className="text-[19px] font-black tracking-[0.14em] text-white">
                  VECXUS
                </h1>
              </div>
              <p className="mt-1 text-[9px] font-bold tracking-[0.3em] text-slate-500">
                REPORTA · CORROBORA · VERIFICA
              </p>
            </div>

            <div className="pointer-events-auto flex flex-col items-end gap-2">
              <button
                onClick={locate}
                aria-label="Mi ubicación"
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-[#0b0e14]/85 text-slate-200 shadow-xl shadow-black/40 backdrop-blur-xl transition hover:bg-white/10 active:scale-95"
              >
                <LocateFixed size={19} strokeWidth={2.3} />
              </button>
              <div className="rounded-xl border border-white/10 bg-[#0b0e14]/85 px-3 py-2 text-center shadow-xl shadow-black/40 backdrop-blur-xl">
                <div className="text-[15px] font-black leading-none text-red-400 tabular-nums">
                  {activeNear}
                </div>
                <div className="mt-0.5 text-[8.5px] font-bold tracking-[0.18em] text-slate-500">
                  {userPos ? "ACTIVOS CERCA" : "INCIDENTES"}
                </div>
              </div>
            </div>
          </div>
        </header>
      )}

      {/* BANNER MODO SELECCIÓN */}
      {mode === "pick" && (
        <div className="vx-drop absolute inset-x-4 top-24 z-[1100] mx-auto max-w-md">
          <div className="flex items-center gap-2.5 rounded-2xl border border-red-500/30 bg-[#1a0d10]/92 px-4 py-3 shadow-xl shadow-black/50 backdrop-blur-xl">
            <MapPin size={18} className="shrink-0 animate-bounce text-red-400" />
            <p className="text-[13.5px] font-bold leading-snug text-red-100">
              Toca el mapa para marcar dónde ocurre el incidente
            </p>
          </div>
        </div>
      )}

      {/* BOTÓN REPORTAR */}
      {mode === "idle" && !selected && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1100] px-5 pb-8">
          <div className="mx-auto max-w-sm">
            <button
              onClick={startReport}
              className="vx-glow-red vx-drop pointer-events-auto flex w-full items-center justify-center gap-3 rounded-[22px] bg-gradient-to-b from-red-500 to-red-700 py-5 text-[19px] font-black tracking-[0.12em] text-white transition hover:from-red-400 hover:to-red-600 active:scale-[.97]"
            >
              <Megaphone size={22} strokeWidth={2.5} />
              REPORTAR
            </button>
            <p className="mt-2.5 text-center text-[11px] font-semibold tracking-wide text-slate-500">
              Sin registro · Reporta en segundos
            </p>
          </div>
        </div>
      )}

      {/* BARRA MODO SELECCIÓN */}
      {mode === "pick" && (
        <div className="absolute inset-x-0 bottom-0 z-[1100] px-5 pb-8">
          <div className="vx-sheet mx-auto flex max-w-sm gap-2.5">
            <button
              onClick={cancelReport}
              className="flex h-14 items-center justify-center gap-2 rounded-2xl border border-white/12 bg-[#0b0e14]/90 px-5 text-[14px] font-bold text-slate-300 backdrop-blur-xl transition hover:bg-white/10 active:scale-[.97]"
            >
              <X size={17} />
              Cancelar
            </button>
            <button
              disabled={!draft}
              onClick={() => setMode("form")}
              className="vx-glow-red flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-red-500 to-red-700 text-[15px] font-extrabold tracking-wide text-white transition active:scale-[.97] disabled:opacity-40 disabled:shadow-none"
            >
              <MapPin size={18} strokeWidth={2.5} />
              Confirmar ubicación
            </button>
          </div>
        </div>
      )}

      {/* WIZARD DE REPORTE */}
      <ReportFlow
        open={mode === "form"}
        sending={sending}
        onSubmit={submitReport}
        onCancel={cancelReport}
      />

      {/* DETALLE DEL INCIDENTE */}
      {selected && mode === "idle" && !gpsRoute && (
        <IncidentSheet
          report={selected}
          userPos={userPos}
          voting={voting}
          routeLoading={routeLoading}
          onVote={vote}
          onStartGps={(profile) => startGpsNavigation(profile)}
          onClose={() => {
            setSelectedId(null);
            clearRoute();
          }}
        />
      )}

      {/* OVERLAY DE NAVEGACIÓN GPS EN VIVO */}
      {gpsRoute && (
        <GpsNavigationOverlay
          route={gpsRoute}
          userPos={userPos}
          onExit={exitGpsNavigation}
          onRecenter={() => {
            if (userPos) {
              setFlyTarget({ ...userPos, zoom: 17, ts: Date.now() });
            }
          }}
          onSelectStep={(step) => {
            if (step.lat && step.lng) {
              setFlyTarget({ lat: step.lat, lng: step.lng, zoom: 17, ts: Date.now() });
            }
          }}
          onChangeProfile={(profile) => startGpsNavigation(profile)}
        />
      )}

      {/* TOAST */}
      {toast && (
        <div className="pointer-events-none absolute inset-x-0 bottom-28 z-[1300] flex justify-center px-6">
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
    </div>
  );
}
