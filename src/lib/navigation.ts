export type NavManeuverIcon =
  | "straight"
  | "left"
  | "right"
  | "slight_left"
  | "slight_right"
  | "sharp_left"
  | "sharp_right"
  | "uturn"
  | "roundabout"
  | "depart"
  | "arrive";

export type NavStep = {
  index: number;
  instruction: string;
  streetName: string;
  distanceMeters: number;
  durationSec: number;
  icon: NavManeuverIcon;
  lat: number;
  lng: number;
  maneuverType: string;
  modifier?: string;
};

export type NavRoute = {
  profile: "foot" | "car";
  distanceMeters: number;
  durationSec: number;
  coords: [number, number][]; // [lat, lng]
  steps: NavStep[];
  destinationLabel: string;
  destinationPos: { lat: number; lng: number };
};

/** Mapea el tipo de maniobra y modificador de OSRM a un icono de flecha */
export function getManeuverIcon(type?: string, modifier?: string): NavManeuverIcon {
  const t = (type ?? "").toLowerCase();
  const m = (modifier ?? "").toLowerCase();

  if (t === "arrive") return "arrive";
  if (t === "depart") return "depart";
  if (t === "roundabout" || t === "rotary") return "roundabout";

  if (m === "uturn") return "uturn";
  if (m === "sharp right") return "sharp_right";
  if (m === "sharp left") return "sharp_left";
  if (m === "slight right") return "slight_right";
  if (m === "slight left") return "slight_left";
  if (m === "right") return "right";
  if (m === "left") return "left";
  if (m === "straight") return "straight";

  if (t === "turn" && m.includes("right")) return "right";
  if (t === "turn" && m.includes("left")) return "left";
  if (t === "fork" && m.includes("right")) return "slight_right";
  if (t === "fork" && m.includes("left")) return "slight_left";

  return "straight";
}

/** Genera una instrucción clara y concisa en español */
export function formatManeuverInstruction(
  type?: string,
  modifier?: string,
  name?: string,
  destinationLabel = "el incidente"
): string {
  const t = (type ?? "").toLowerCase();
  const m = (modifier ?? "").toLowerCase();
  const street = name && name.trim() && name !== "vía sin nombre" ? name.trim() : "";

  if (t === "arrive") {
    return `Llegaste a tu destino (${destinationLabel})`;
  }

  if (t === "depart") {
    return street ? `Inicia la marcha por ${street}` : "Inicia la marcha hacia el destino";
  }

  if (t === "roundabout" || t === "rotary") {
    return street ? `En la rotonda toma la salida hacia ${street}` : "En la rotonda toma la salida adecuada";
  }

  if (m === "uturn") {
    return street ? `Da vuelta en U en ${street}` : "Da vuelta en U";
  }

  if (m === "sharp right") {
    return street ? `Gira pronunciado a la derecha en ${street}` : "Gira pronunciado a la derecha";
  }
  if (m === "sharp left") {
    return street ? `Gira pronunciado a la izquierda en ${street}` : "Gira pronunciado a la izquierda";
  }

  if (m === "slight right") {
    return street ? `Toma la bifurcación a la derecha hacia ${street}` : "Mantente a la derecha";
  }
  if (m === "slight left") {
    return street ? `Toma la bifurcación a la izquierda hacia ${street}` : "Mantente a la izquierda";
  }

  if (m === "right" || (t === "turn" && m.includes("right"))) {
    return street ? `Gira a la derecha en ${street}` : "Gira a la derecha";
  }

  if (m === "left" || (t === "turn" && m.includes("left"))) {
    return street ? `Gira a la izquierda en ${street}` : "Gira a la izquierda";
  }

  if (m === "straight" || t === "continue" || t === "new name") {
    return street ? `Continúa recto por ${street}` : "Continúa todo recto";
  }

  if (t === "merge") {
    return street ? `Incorpórate a ${street}` : "Incorpórate a la vía";
  }

  if (t === "end of road") {
    return street ? `Al final de la calle gira hacia ${street}` : "Llegaste al final de la vía";
  }

  return street ? `Sigue por ${street}` : "Sigue la ruta en el mapa";
}

/** Convierte los pasos crudos de OSRM al formato estructurado NavStep[] */
export function parseOSRMSteps(
  rawSteps: Array<{
    name?: string;
    distance?: number;
    duration?: number;
    maneuver?: {
      type?: string;
      modifier?: string;
      location?: [number, number]; // [lng, lat]
    };
  }>,
  destinationLabel = "el incidente"
): NavStep[] {
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) return [];

  return rawSteps.map((step, idx) => {
    const maneuver = step.maneuver ?? {};
    const [lng = 0, lat = 0] = maneuver.location ?? [];
    const icon = getManeuverIcon(maneuver.type, maneuver.modifier);
    const streetName = step.name && step.name.trim() ? step.name.trim() : "";
    const instruction = formatManeuverInstruction(
      maneuver.type,
      maneuver.modifier,
      streetName,
      destinationLabel
    );

    return {
      index: idx,
      instruction,
      streetName,
      distanceMeters: Math.round(step.distance ?? 0),
      durationSec: Math.round(step.duration ?? 0),
      icon,
      lat,
      lng,
      maneuverType: maneuver.type ?? "",
      modifier: maneuver.modifier,
    };
  });
}

/** Formato legible de distancia: "En 40 m", "En 350 m", "En 1.2 km" */
export function formatNavDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return "0 m";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Formato legible de tiempo: "1 min", "8 min", "1 h 15 min" */
export function formatNavDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "1 min";
  const min = Math.round(seconds / 60);
  if (min < 1) return "Menos de 1 min";
  if (min < 60) return `${min} min`;
  const hrs = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hrs} h ${remMin} min` : `${hrs} h`;
}

/** Hora estimada de llegada (ETA): "14:35" */
export function formatETA(seconds: number): string {
  const target = new Date(Date.now() + Math.max(0, seconds) * 1000);
  return target.toLocaleTimeString("es", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Links para abrir en aplicaciones externas de navegación */
export function getGoogleMapsUrl(
  destination: { lat: number; lng: number },
  origin?: { lat: number; lng: number } | null,
  profile: "foot" | "car" = "foot"
): string {
  const mode = profile === "car" ? "driving" : "walking";
  if (origin) {
    return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&travelmode=${mode}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${destination.lat},${destination.lng}`;
}

export function getWazeUrl(destination: { lat: number; lng: number }): string {
  return `https://waze.com/ul?ll=${destination.lat},${destination.lng}&navigate=yes`;
}
