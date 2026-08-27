import { db } from "@/db";
import { reports } from "@/db/schema";
import { REPORT_TTL_MS } from "@/lib/incidents";
import { and, inArray, lt } from "drizzle-orm";

/**
 * Marca como EXPIRADO todo reporte comunitario con más de 1 hora de vida.
 * Los reportes que un administrador ya tomó (EN ATENCIÓN / VERIFICADO) no expiran.
 */
export async function expireOldReports(): Promise<void> {
  const cutoff = new Date(Date.now() - REPORT_TTL_MS);
  await db
    .update(reports)
    .set({ status: "EXPIRADO", updatedAt: new Date() })
    .where(
      and(
        inArray(reports.status, ["ACTIVO", "ESCALADO"]),
        lt(reports.createdAt, cutoff)
      )
    );
}

/** Fecha de expiración de un reporte (creación + TTL) */
export function expiresAtOf(createdAt: Date): string {
  return new Date(createdAt.getTime() + REPORT_TTL_MS).toISOString();
}
