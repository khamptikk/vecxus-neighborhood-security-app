"use client";

/**
 * ID anónimo por dispositivo (sin cuentas, sin registro).
 * A prueba de fallos: memoria → localStorage → sessionStorage → cookie.
 * La cookie además llega sola al servidor en cada petición.
 */
let memId = "";

const KEY = "vecxus_device_id";
const COOKIE = "vecxus_did";

function generate(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `dev-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  if (memId) return memId;

  let id = "";

  try {
    id = window.localStorage.getItem(KEY) ?? "";
  } catch {
    /* almacenamiento bloqueado */
  }
  if (!id) {
    try {
      id = window.sessionStorage.getItem(KEY) ?? "";
    } catch {
      /* ignorar */
    }
  }
  if (!id) {
    try {
      const m = document.cookie.match(/(?:^|;\s*)vecxus_did=([^;]+)/);
      id = m ? decodeURIComponent(m[1]) : "";
    } catch {
      /* ignorar */
    }
  }
  if (!id) id = generate();

  memId = id;

  // Persistencia de mejor esfuerzo (nunca lanzar)
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    /* ignorar */
  }
  try {
    window.sessionStorage.setItem(KEY, id);
  } catch {
    /* ignorar */
  }
  try {
    document.cookie = `${COOKIE}=${encodeURIComponent(id)}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    /* ignorar */
  }

  return id;
}
