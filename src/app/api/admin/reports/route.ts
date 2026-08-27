import { db } from "@/db";
import { confirmations, reports } from "@/db/schema";
import { extractDeviceId } from "@/lib/device-server";
import { expireOldReports, expiresAtOf } from "@/lib/report-maintenance";
import { and, desc, eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/** GET /api/admin/reports — todos los reportes para el panel de administración */
export async function GET(req: NextRequest) {
  const deviceId = extractDeviceId(req);

  await expireOldReports();

  const rows = await db
    .select()
    .from(reports)
    .orderBy(desc(reports.createdAt))
    .limit(400);

  let votes: Record<string, string> = {};
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
    votes = Object.fromEntries(vrows.map((v) => [v.reportId, v.kind]));
  }

  return Response.json({
    reports: rows.map((r) => ({
      id: r.id,
      type: r.type,
      description: r.description,
      lat: r.lat,
      lng: r.lng,
      status: r.status,
      confirmations: r.confirmations,
      rejections: r.rejections,
      createdAt: r.createdAt.toISOString(),
      expiresAt: expiresAtOf(r.createdAt),
      updatedAt: r.updatedAt.toISOString(),
      myVote: votes[r.id] ?? null,
    })),
  });
}
