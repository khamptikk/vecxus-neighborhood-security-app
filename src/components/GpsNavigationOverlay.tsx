"use client";

import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Car,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  CornerUpLeft,
  CornerUpRight,
  ExternalLink,
  Footprints,
  LocateFixed,
  MapPin,
  RotateCw,
  Undo2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  formatETA,
  formatNavDistance,
  formatNavDuration,
  getGoogleMapsUrl,
  getWazeUrl,
  type NavManeuverIcon,
  type NavRoute,
  type NavStep,
} from "@/lib/navigation";
import { haversineMeters } from "@/lib/geo";

function StepIcon({ icon, size = 24 }: { icon: NavManeuverIcon; size?: number }) {
  switch (icon) {
    case "right":
      return <CornerUpRight size={size} strokeWidth={2.8} />;
    case "left":
      return <CornerUpLeft size={size} strokeWidth={2.8} />;
    case "slight_right":
      return <ArrowRight size={size} strokeWidth={2.8} className="-rotate-45" />;
    case "slight_left":
      return <ArrowLeft size={size} strokeWidth={2.8} className="rotate-45" />;
    case "sharp_right":
      return <CornerUpRight size={size} strokeWidth={3.2} />;
    case "sharp_left":
      return <CornerUpLeft size={size} strokeWidth={3.2} />;
    case "uturn":
      return <Undo2 size={size} strokeWidth={2.8} />;
    case "roundabout":
      return <RotateCw size={size} strokeWidth={2.8} />;
    case "arrive":
      return <CheckCircle2 size={size} strokeWidth={2.8} />;
    case "depart":
    case "straight":
    default:
      return <ArrowUp size={size} strokeWidth={2.8} />;
  }
}

export default function GpsNavigationOverlay({
  route,
  userPos,
  onExit,
  onRecenter,
  onSelectStep,
  onChangeProfile,
}: {
  route: NavRoute;
  userPos: { lat: number; lng: number } | null;
  onExit: () => void;
  onRecenter: () => void;
  onSelectStep?: (step: NavStep) => void;
  onChangeProfile: (profile: "foot" | "car") => void;
}) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [appsMenuOpen, setAppsMenuOpen] = useState(false);

  const steps = route.steps;
  const currentStep = steps[currentStepIndex] ?? steps[0];

  // Distancia en tiempo real hasta el próximo paso o destino
  const distanceToNextMeters = useMemo(() => {
    if (!userPos || !currentStep) return currentStep?.distanceMeters ?? 0;
    if (currentStep.lat && currentStep.lng) {
      return Math.round(haversineMeters(userPos, { lat: currentStep.lat, lng: currentStep.lng }));
    }
    return currentStep.distanceMeters;
  }, [userPos, currentStep]);

  // Distancia total restante hasta el destino
  const totalDistanceRemaining = useMemo(() => {
    if (!userPos) return route.distanceMeters;
    return Math.round(haversineMeters(userPos, route.destinationPos));
  }, [userPos, route.destinationPos, route.distanceMeters]);

  // Detectar si el usuario ya llegó al destino (< 25 metros)
  const hasArrived = totalDistanceRemaining <= 25;

  // Actualizar paso actual si el usuario se acerca a la siguiente maniobra (< 20m)
  useEffect(() => {
    if (!userPos || steps.length === 0) return;
    const nextIdx = currentStepIndex + 1;
    if (nextIdx < steps.length) {
      const nextStep = steps[nextIdx];
      if (nextStep.lat && nextStep.lng) {
        const d = haversineMeters(userPos, { lat: nextStep.lat, lng: nextStep.lng });
        if (d < 22) {
          setCurrentStepIndex(nextIdx);
        }
      }
    }
  }, [userPos, steps, currentStepIndex]);

  const googleMapsUrl = getGoogleMapsUrl(route.destinationPos, userPos, route.profile);
  const wazeUrl = getWazeUrl(route.destinationPos);

  return (
    <div className="pointer-events-none fixed inset-0 z-[1250] flex flex-col justify-between">
      {/* ================= BANNER SUPERIOR GPS ================= */}
      <div className="pointer-events-auto px-3.5 pt-3">
        <div className="vx-drop mx-auto max-w-lg overflow-hidden rounded-3xl border border-emerald-400/30 bg-gradient-to-b from-[#09231b]/95 to-[#0b141a]/95 shadow-[0_16px_40px_rgba(0,0,0,0.85)] backdrop-blur-2xl">
          {/* Maniobra actual */}
          <div className="flex items-center gap-3.5 p-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-black shadow-[0_0_24px_rgba(16,185,129,0.55)]">
              <StepIcon icon={currentStep?.icon ?? "straight"} size={32} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-black uppercase tracking-wider text-emerald-400">
                  {hasArrived ? "DESTINO ALCANZADO" : `EN ${formatNavDistance(distanceToNextMeters)}`}
                </span>
                <span className="h-1 w-1 rounded-full bg-emerald-400/60" />
                <span className="text-[11px] font-bold text-slate-400">
                  {route.profile === "foot" ? "A pie" : "En auto"}
                </span>
              </div>
              <h2 className="mt-0.5 truncate text-[17px] font-black tracking-tight text-white">
                {hasArrived ? `¡Llegaste a ${route.destinationLabel}!` : currentStep?.instruction}
              </h2>
            </div>

            <button
              onClick={() => setStepsOpen(!stepsOpen)}
              aria-label="Ver todos los pasos"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10"
            >
              {stepsOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
          </div>

          {/* Lista expandible de pasos (Turn-by-turn) */}
          {stepsOpen && (
            <div className="max-h-64 overflow-y-auto border-t border-white/10 bg-black/40 px-3 py-2">
              <div className="mb-1.5 flex items-center justify-between px-2 text-[10.5px] font-extrabold tracking-widest text-slate-400">
                <span>TODAS LAS INDICACIONES ({steps.length})</span>
                <span>DISTANCIA</span>
              </div>
              <div className="space-y-1">
                {steps.map((step, idx) => {
                  const isCurrent = idx === currentStepIndex;
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setCurrentStepIndex(idx);
                        onSelectStep?.(step);
                      }}
                      className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition ${
                        isCurrent
                          ? "bg-emerald-500/20 text-white shadow-sm ring-1 ring-emerald-400/40"
                          : "text-slate-300 hover:bg-white/5"
                      }`}
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                          isCurrent ? "bg-emerald-500 text-black font-bold" : "bg-white/10 text-slate-300"
                        }`}
                      >
                        <StepIcon icon={step.icon} size={15} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold">
                        {step.instruction}
                      </span>
                      <span className="shrink-0 text-[11.5px] font-semibold tabular-nums text-slate-400">
                        {formatNavDistance(step.distanceMeters)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================= BARRA INFERIOR GPS ================= */}
      <div className="pointer-events-auto px-3.5 pb-5">
        <div className="vx-drop mx-auto max-w-lg space-y-2.5">
          {/* Menú de apps externas (opcional) */}
          {appsMenuOpen && (
            <div className="flex gap-2 rounded-2xl border border-white/10 bg-[#0c1017]/95 p-2 backdrop-blur-xl">
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noreferrer"
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600/20 py-2.5 text-[12px] font-extrabold text-blue-200 ring-1 ring-blue-400/30 hover:bg-blue-600/30"
              >
                <ExternalLink size={14} /> Google Maps
              </a>
              <a
                href={wazeUrl}
                target="_blank"
                rel="noreferrer"
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-cyan-600/20 py-2.5 text-[12px] font-extrabold text-cyan-200 ring-1 ring-cyan-400/30 hover:bg-cyan-600/30"
              >
                <ExternalLink size={14} /> Waze
              </a>
              <button
                onClick={() => setAppsMenuOpen(false)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 text-slate-400 hover:text-white"
              >
                <X size={15} />
              </button>
            </div>
          )}

          {/* Panel principal de navegación */}
          <div className="rounded-3xl border border-white/10 bg-[#0c1017]/95 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.9)] backdrop-blur-2xl">
            <div className="flex items-center justify-between gap-3">
              {/* Tiempo estimado grande */}
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[28px] font-black leading-none text-emerald-400 tabular-nums">
                    {formatNavDuration(route.durationSec)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[12px] font-bold text-slate-400">
                  <span className="tabular-nums">{formatNavDistance(totalDistanceRemaining)}</span>
                  <span>·</span>
                  <span className="text-slate-300">Llegada {formatETA(route.durationSec)}</span>
                </div>
              </div>

              {/* Botón de centrado + Selector de app externa */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={onRecenter}
                  aria-label="Centrar en mi ubicación"
                  className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10 active:scale-95"
                >
                  <LocateFixed size={20} strokeWidth={2.4} />
                </button>

                <button
                  onClick={() => setAppsMenuOpen(!appsMenuOpen)}
                  aria-label="Abrir en otras apps"
                  className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10 active:scale-95"
                >
                  <ExternalLink size={19} />
                </button>
              </div>
            </div>

            {/* Selector de modo (Pie / Auto) + Botón SALIR */}
            <div className="mt-3.5 flex items-center gap-2">
              {/* Toggle de transporte */}
              <div className="flex rounded-2xl border border-white/10 bg-black/40 p-1">
                <button
                  onClick={() => onChangeProfile("foot")}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-extrabold transition ${
                    route.profile === "foot"
                      ? "bg-emerald-500 text-black shadow-md"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Footprints size={15} /> A pie
                </button>
                <button
                  onClick={() => onChangeProfile("car")}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-extrabold transition ${
                    route.profile === "car"
                      ? "bg-emerald-500 text-black shadow-md"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Car size={15} /> Auto
                </button>
              </div>

              {/* Botón Salir de Navegación */}
              <button
                onClick={onExit}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-red-500/30 bg-red-600/20 py-3 text-[14px] font-black tracking-wide text-red-200 transition hover:bg-red-600/30 active:scale-[0.98]"
              >
                <X size={17} strokeWidth={2.6} />
                SALIR DE NAVEGACIÓN
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
