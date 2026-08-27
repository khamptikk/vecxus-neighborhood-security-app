const KEY = "vecxus_device_id";
const COOKIE = "vecxus_did";
let memId = "";

function generate() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `dev-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function getDeviceId() {
  if (typeof window === "undefined") return "";
  if (memId) return memId;

  let id = "";
  try { id = window.localStorage.getItem(KEY) ?? ""; } catch { /* */ }
  if (!id) { try { id = window.sessionStorage.getItem(KEY) ?? ""; } catch { /* */ } }
  if (!id) {
    try {
      const m = document.cookie.match(/(?:^|;\s*)vecxus_did=([^;]+)/);
      id = m ? decodeURIComponent(m[1]) : "";
    } catch { /* */ }
  }
  if (!id) id = generate();
  memId = id;

  try { window.localStorage.setItem(KEY, id); } catch { /* */ }
  try { window.sessionStorage.setItem(KEY, id); } catch { /* */ }
  try { document.cookie = `${COOKIE}=${encodeURIComponent(id)}; path=/; max-age=31536000; SameSite=Lax`; } catch { /* */ }

  return id;
}
