"use client";

import {
  ArrowLeft,
  Check,
  Loader2,
  MapPinCheck,
  Send,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  INCIDENT_META,
  INCIDENT_TYPES,
  type IncidentType,
} from "@/lib/incidents";
import { TYPE_ICONS } from "@/lib/icons";

export default function ReportFlow({
  open,
  sending,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  sending: boolean;
  onSubmit: (type: IncidentType, description: string) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [type, setType] = useState<IncidentType | null>(null);
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) {
      setStep(1);
      setType(null);
      setDescription("");
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-[1200] flex flex-col justify-end">
      <button
        aria-label="Cancelar"
        onClick={onCancel}
        className="vx-fade absolute inset-0 bg-black/55 backdrop-blur-[2px]"
      />
      <div className="vx-sheet relative rounded-t-[28px] border-t border-white/10 bg-[#0c0f16]/97 px-5 pb-7 pt-3 shadow-[0_-20px_60px_rgba(0,0,0,.7)] backdrop-blur-xl">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/15" />

        {/* Indicador de pasos */}
        <div className="mb-5 flex items-center gap-2 text-[11px] font-semibold tracking-wide">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <MapPinCheck size={14} /> UBICACIÓN
          </span>
          <span className="h-px flex-1 bg-white/10" />
          <span className={step === 1 ? "text-white" : "text-emerald-400"}>
            {step === 2 && <Check size={13} className="mr-1 inline" />}
            2 · TIPO
          </span>
          <span className="h-px flex-1 bg-white/10" />
          <span className={step === 2 ? "text-white" : "text-slate-500"}>
            3 · DETALLES
          </span>
        </div>

        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-white">
              {step === 1 ? "¿Qué está pasando?" : "Describe lo que ocurre"}
            </h2>
            <p className="mt-0.5 text-[13px] text-slate-400">
              {step === 1
                ? "Elige el tipo de incidente"
                : "Una descripción corta ayuda a tus vecinos"}
            </p>
          </div>
          <button
            onClick={onCancel}
            aria-label="Cerrar"
            className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <X size={17} />
          </button>
        </div>

        {step === 1 ? (
          <div className="grid grid-cols-2 gap-2.5">
            {INCIDENT_TYPES.map((t) => {
              const meta = INCIDENT_META[t];
              const Icon = TYPE_ICONS[t];
              const active = type === t;
              const wide = t === "SOSPECHOSO";
              return (
                <button
                  key={t}
                  onClick={() => {
                    setType(t);
                    setStep(2);
                  }}
                  onMouseEnter={() => setType(t)}
                  className={`flex items-center gap-3 rounded-2xl border px-4 py-4 text-left transition-all active:scale-[.98] ${
                    wide ? "col-span-2" : ""
                  } ${
                    active
                      ? "border-transparent text-white"
                      : "border-white/8 bg-white/[.03] text-slate-300 hover:bg-white/[.06]"
                  }`}
                  style={
                    active
                      ? { background: meta.soft, boxShadow: `inset 0 0 0 1.5px ${meta.color}` }
                      : undefined
                  }
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: meta.soft, color: meta.color }}
                  >
                    <Icon size={19} strokeWidth={2.4} />
                  </span>
                  <span className="text-[14px] font-bold leading-tight">
                    {meta.label}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div>
            <div
              className="mb-3 flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-bold"
              style={{
                background: INCIDENT_META[type ?? "OTRO"].soft,
                color: INCIDENT_META[type ?? "OTRO"].color,
              }}
            >
              {(() => {
                const Icon = TYPE_ICONS[type ?? "OTRO"];
                return <Icon size={15} strokeWidth={2.4} />;
              })()}
              {INCIDENT_META[type ?? "OTRO"].label.toUpperCase()}
              <button
                onClick={() => setStep(1)}
                className="ml-auto flex items-center gap-1 rounded-lg bg-black/30 px-2 py-1 text-[11px] font-semibold text-white/80 transition hover:bg-black/50"
              >
                <ArrowLeft size={12} /> Cambiar
              </button>
            </div>

            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 240))}
              rows={3}
              autoFocus
              placeholder="Ej.: Hay una pelea frente a la tienda, dos personas involucradas…"
              className="w-full resize-none rounded-2xl border border-white/10 bg-white/[.04] px-4 py-3.5 text-[15px] text-white placeholder:text-slate-500 focus:border-red-500/60 focus:outline-none focus:ring-2 focus:ring-red-500/25"
            />
            <div className="mt-1 text-right text-[11px] font-medium text-slate-500">
              {description.length}/240
            </div>

            <button
              disabled={sending}
              onClick={() => type && onSubmit(type, description.trim())}
              className="vx-glow-red mt-1 flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-b from-red-500 to-red-700 py-4.5 text-[16px] font-extrabold tracking-wide text-white transition active:scale-[.98] disabled:opacity-60"
              style={{ paddingTop: 17, paddingBottom: 17 }}
            >
              {sending ? (
                <Loader2 size={19} className="animate-spin" />
              ) : (
                <Send size={18} strokeWidth={2.5} />
              )}
              {sending ? "ENVIANDO…" : "ENVIAR REPORTE"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
