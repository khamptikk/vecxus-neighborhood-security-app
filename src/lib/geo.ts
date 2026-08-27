/** Distancia Haversine en metros entre dos coordenadas */
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return "—";
  if (meters < 1000) return `a ${Math.round(meters)} m de ti`;
  return `a ${(meters / 1000).toFixed(1)} km de ti`;
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "justo ahora";
  if (min < 60) return `hace ${min} min`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days} d`;
}

/** Minutos/segundos restantes hasta la expiración, en texto corto */
export function timeLeft(iso: string): { text: string; ms: number; urgent: boolean } {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { text: "expirado", ms: 0, urgent: true };
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 1) {
    const sec = Math.max(1, Math.floor(ms / 1000));
    return { text: `${sec} s`, ms, urgent: true };
  }
  if (totalMin < 60) return { text: `${totalMin} min`, ms, urgent: totalMin <= 10 };
  return { text: "60 min", ms, urgent: false };
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
