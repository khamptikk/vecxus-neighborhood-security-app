import { db } from "@/db";
import { confirmations, reports } from "@/db/schema";
import { extractDeviceId } from "@/lib/device-server";
import {
  ESCALATION_THRESHOLD,
  INCIDENT_TYPES,
  REJECTION_THRESHOLD,
  REPORT_TTL_MS,
  type ReportDTO,
} from "@/lib/incidents";
import { expireOldReports, expiresAtOf } from "@/lib/report-maintenance";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function toDTO(
  r: typeof reports.$inferSelect,
  myVote: "CONFIRM" | "REJECT" | null
): ReportDTO {
  return {
    id: r.id,
    type: r.type as ReportDTO["type"],
    description: r.description,
    lat: r.lat,
    lng: r.lng,
    status: r.status as ReportDTO["status"],
    confirmations: r.confirmations,
    rejections: r.rejections,
    createdAt: r.createdAt.toISOString(),
    expiresAt: expiresAtOf(r.createdAt),
    myVote,
  };
}

/**
 * GET /api/reports
 * Devuelve solo los reportes vigentes: creados en la última hora y no cerrados.
 * Antes de responder marca como EXPIRADO todo lo que ya pasó de 1 hora.
 */
export async function GET(req: NextRequest) {
  const deviceId = extractDeviceId(req);

  await expireOldReports();

  const since = new Date(Date.now() - REPORT_TTL_MS);

  const rows = await db
    .select()
    .from(reports)
    .where(
      and(
        inArray(reports.status, ["ACTIVO", "ESCALADO", "EN_ATENCION", "VERIFICADO"]),
        gte(reports.createdAt, since)
      )
    )
    .orderBy(desc(reports.createdAt))
    .limit(300);

  let votes: Record<string, "CONFIRM" | "REJECT"> = {};
  if (deviceId && rows.length > 0) {
    const vrows = await db
      .select()
      .from(confirmations)
      .where(
        and(
          eq(confirmations.deviceId, deviceId),
          inArray(
            confirmations.reportId,
            rows.map((r) => r.id)
          )
        )
      );
    votes = Object.fromEntries(
      vrows.map((v) => [v.reportId, v.kind as "CONFIRM" | "REJECT"])
    );
  }

  return Response.json({
    reports: rows.map((r) => toDTO(r, votes[r.id] ?? null)),
    threshold: ESCALATION_THRESHOLD,
    rejectionThreshold: REJECTION_THRESHOLD,
    ttlMs: REPORT_TTL_MS,
  });
}

/** POST /api/reports — crear un reporte nuevo (vive 1 hora) */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const type = String(b.type ?? "").toUpperCase();
  const description = String(b.description ?? "").trim().slice(0, 240);
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  const deviceId = extractDeviceId(req, b.deviceId);

  if (!INCIDENT_TYPES.includes(type as never)) {
    return Response.json({ error: "Tipo de incidente inválido" }, { status: 400 });
  }
  if (!Number.isFinite(lat) || Math.abs(lat) > 90) {
    return Response.json({ error: "Latitud inválida" }, { status: 400 });
  }
  if (!Number.isFinite(lng) || Math.abs(lng) > 180) {
    return Response.json({ error: "Longitud inválida" }, { status: 400 });
  }

  const [created] = await db
    .insert(reports)
    .values({
      type,
      description,
      lat,
      lng,
      status: "ACTIVO",
      deviceId: deviceId || null,
    })
    .returning();

  return Response.json({ report: toDTO(created, null) }, { status: 201 });
}
