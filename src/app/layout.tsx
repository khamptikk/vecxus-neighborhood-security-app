import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "VECXUS — Seguridad Vecinal",
  description:
    "Reporta incidentes en tu zona en segundos. Sin cuentas, sin registro. Reporta. Corrobora. Verifica.",
};

export const viewport: Viewport = {
  themeColor: "#07090d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-[#07090d] text-slate-100 antialiased">{children}</body>
    </html>
  );
}
