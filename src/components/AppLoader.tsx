"use client";

import dynamic from "next/dynamic";

const HomeClient = dynamic(() => import("./HomeClient"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex h-dvh flex-col items-center justify-center gap-4 bg-[#07090d]">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/15">
        <span className="h-6 w-6 animate-ping rounded-full bg-red-500/70" />
      </div>
      <p className="text-[13px] font-black tracking-[0.25em] text-slate-400">
        VECXUS
      </p>
      <p className="text-[11px] font-semibold tracking-widest text-slate-600">
        CARGANDO MAPA…
      </p>
    </div>
  ),
});

export default function AppLoader() {
  return <HomeClient />;
}
