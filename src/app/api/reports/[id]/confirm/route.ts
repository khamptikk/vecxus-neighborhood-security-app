import { db } from "@/db";
import { confirmations, reports } from "@/db/schema";
import { extractDeviceId } from "@/lib/device-server";
import {
  ESCALATION_THRESHOLD,
  REJECTION_THRESHOLD,
  REPORT_TTL_MS,
} from "@/lib/incidents";
import { expiresAtOf } from "@/lib/report-maintenance";
import { eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/reports/:id/confirm
 * Body: { kind: "CONFIRM" | "REJECT" }
 *
 * Reglas:
 * - Un dispositivo solo puede votar una vez por reporte.
 * - 3 confirmaciones  -> el reporte pasa a ESCALADO.
 * - 3 "NO VEO NADA"   -> el reporte se elimina automáticamente.
 * - Un reporte con más de 1 hora ya no admite votos.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const kind = String(b.kind ?? "").toUpperCase();
  if (kind !== "CONFIRM" && kind !== "REJECT") {
    return Response.json({ error: "Tipo de voto inválido" }, { status: 400 });
  }

  const deviceId = extractDeviceId(req, b.deviceId);
  if (!deviceId) {
    return Response.json({ error: "Dispositivo no identificado" }, { status: 400 });
  }

  const [existing] = await db.select().from(reports).where(eq(reports.id, id));
  if (!existing) {
    return Response.json(
      { error: "Este reporte ya no existe", removed: true },
      { status: 404 }
    );
  }

  // Vencido por tiempo (1 hora)
  if (Date.now() - existing.createdAt.getTime() > REPORT_TTL_MS) {
    return Response.json(
      { error: "Este reporte ya expiró", expired: true },
      { status: 410 }
    );
  }

  if (existing.status === "FALSA_ALARMA" || existing.status === "RESUELTO") {
    return Response.json(
      { error: "Este reporte ya fue cerrado por el administrador" },
      { status: 409 }
    );
  }

  const outcome = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(confirmations)
      .values({ reportId: id, deviceId, kind })
      .onConflictDoNothing({
        target: [confirmations.reportId, confirmations.deviceId],
      })
      .returning();

    if (inserted.length === 0) {
      return { already: true as const, deleted: false as const };
    }

    if (kind === "CONFIRM") {
      await tx
        .update(reports)
        .set({
          confirmations: sql`${reports.confirmations} + 1`,
          status: sql`CASE
            WHEN ${reports.status} = 'ACTIVO'
             AND ${reports.confirmations} + 1 >= ${ESCALATION_THRESHOLD}
            THEN 'ESCALADO'
            ELSE ${reports.status}
          END`,
          updatedAt: new Date(),
        })
        .where(eq(reports.id, id));
      return { already: false as const, deleted: false as const };
    }

    // REJECT: sumar y verificar si alcanza el umbral de eliminación
    const [updated] = await tx
      .update(reports)
      .set({
        rejections: sql`${reports.rejections} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(reports.id, id))
      .returning();

    if (updated && updated.rejections >= REJECTION_THRESHOLD) {
      // 3 vecinos dicen que no ven nada -> se elimina solo
      await tx.delete(reports).where(eq(reports.id, id));
      return { already: false as const, deleted: true as const };
    }

    return { already: false as const, deleted: false as const };
  });

  if (outcome.deleted) {
    return Response.json(
      {
        deleted: true,
        alreadyVoted: false,
        message: `${REJECTION_THRESHOLD} vecinos no vieron nada: el reporte se eliminó automáticamente`,
      },
      { status: 200 }
    );
  }

  const [fresh] = await db.select().from(reports).where(eq(reports.id, id));
  if (!fresh) {
    return Response.json({ deleted: true, alreadyVoted: outcome.already }, { status: 200 });
  }

  return Response.json(
    {
      alreadyVoted: outcome.already,
      deleted: false,
      report: {
        id: fresh.id,
        type: fresh.type,
        description: fresh.description,
        lat: fresh.lat,
        lng: fresh.lng,
        status: fresh.status,
        confirmations: fresh.confirmations,
        rejections: fresh.rejections,
        createdAt: fresh.createdAt.toISOString(),
        expiresAt: expiresAtOf(fresh.createdAt),
        myVote: kind,
      },
      threshold: ESCALATION_THRESHOLD,
      rejectionThreshold: REJECTION_THRESHOLD,
    },
    { status: outcome.already ? 200 : 201 }
  );
}
