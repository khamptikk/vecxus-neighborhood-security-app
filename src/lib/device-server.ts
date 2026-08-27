import { NextRequest } from "next/server";

/**
 * Extrae el ID anónimo del dispositivo aceptando varias vías redundantes:
 * 1) cuerpo JSON (deviceId)  2) header x-device-id
 * 3) query ?d=               4) cookie vecxus_did
 */
export function extractDeviceId(req: NextRequest, bodyDeviceId?: unknown): string {
  if (typeof bodyDeviceId === "string" && bodyDeviceId.trim()) {
    return bodyDeviceId.trim().slice(0, 80);
  }
  const header = req.headers.get("x-device-id");
  if (header && header.trim()) return header.trim().slice(0, 80);

  const query = req.nextUrl.searchParams.get("d");
  if (query && query.trim()) return query.trim().slice(0, 80);

  const cookie = req.cookies.get("vecxus_did")?.value ?? "";
  if (cookie) {
    try {
      return decodeURIComponent(cookie).slice(0, 80);
    } catch {
      return cookie.slice(0, 80);
    }
  }
  return "";
}
