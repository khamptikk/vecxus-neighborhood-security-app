import { db } from "@/db";
import { reports } from "@/db/schema";
import { REPORT_STATUSES } from "@/lib/incidents";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/admin/reports/:id — cambiar el estado de un reporte */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const status = String((body as Record<string, unknown>).status ?? "").toUpperCase();
  if (!REPORT_STATUSES.includes(status as never)) {
    return Response.json({ error: "Estado inválido" }, { status: 400 });
  }

  const [existing] = await db.select().from(reports).where(eq(reports.id, id));
  if (!existing) {
    return Response.json({ error: "Reporte no encontrado" }, { status: 404 });
  }

  const [updated] = await db
    .update(reports)
    .set({ status, updatedAt: new Date() })
    .where(eq(reports.id, id))
    .returning();

  return Response.json({
    report: {
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}
