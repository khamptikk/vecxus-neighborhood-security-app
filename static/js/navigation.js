import { haversineMeters } from "./geo.js";

export function getManeuverIcon(type, modifier) {
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

export function formatManeuverInstruction(type, modifier, name, destinationLabel = "el incidente") {
  const t = (type ?? "").toLowerCase();
  const m = (modifier ?? "").toLowerCase();
  const street = name && name.trim() && name !== "via sin nombre" ? name.trim() : "";
  if (t === "arrive") return `Llegaste a tu destino (${destinationLabel})`;
  if (t === "depart") return street ? `Inicia la marcha por ${street}` : "Inicia la marcha hacia el destino";
  if (t === "roundabout" || t === "rotary") return street ? `En la rotonda toma la salida hacia ${street}` : "En la rotonda toma la salida adecuada";
  if (m === "uturn") return street ? `Da vuelta en U en ${street}` : "Da vuelta en U";
  if (m === "sharp right") return street ? `Gira pronunciado a la derecha en ${street}` : "Gira pronunciado a la derecha";
  if (m === "sharp left") return street ? `Gira pronunciado a la izquierda en ${street}` : "Gira pronunciado a la izquierda";
  if (m === "slight right") return street ? `Toma la bifurcacion a la derecha hacia ${street}` : "Mantente a la derecha";
  if (m === "slight left") return street ? `Toma la bifurcacion a la izquierda hacia ${street}` : "Mantente a la izquierda";
  if (m === "right" || (t === "turn" && m.includes("right"))) return street ? `Gira a la derecha en ${street}` : "Gira a la derecha";
  if (m === "left" || (t === "turn" && m.includes("left"))) return street ? `Gira a la izquierda en ${street}` : "Gira a la izquierda";
  if (m === "straight" || t === "continue" || t === "new name") return street ? `Continua recto por ${street}` : "Continua todo recto";
  if (t === "merge") return street ? `Incorporate a ${street}` : "Incorporate a la via";
  if (t === "end of road") return street ? `Al final de la calle gira hacia ${street}` : "Llegaste al final de la via";
  return street ? `Sigue por ${street}` : "Sigue la ruta en el mapa";
}

export function parseOSRMSteps(rawSteps, destinationLabel = "el incidente") {
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) return [];
  return rawSteps.map((step, idx) => {
    const maneuver = step.maneuver ?? {};
    const [lng = 0, lat = 0] = maneuver.location ?? [];
    const icon = getManeuverIcon(maneuver.type, maneuver.modifier);
    const streetName = step.name && step.name.trim() ? step.name.trim() : "";
    const instruction = formatManeuverInstruction(maneuver.type, maneuver.modifier, streetName, destinationLabel);
    return {
      index: idx, instruction, streetName,
      distanceMeters: Math.round(step.distance ?? 0),
      durationSec: Math.round(step.duration ?? 0),
      icon, lat, lng,
      maneuverType: maneuver.type ?? "",
      modifier: maneuver.modifier,
    };
  });
}

export function formatNavDistance(meters) {
  if (!Number.isFinite(meters) || meters <= 0) return "0 m";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatNavDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "1 min";
  const min = Math.round(seconds / 60);
  if (min < 1) return "Menos de 1 min";
  if (min < 60) return `${min} min`;
  const hrs = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hrs} h ${remMin} min` : `${hrs} h`;
}

export function formatETA(seconds) {
  const target = new Date(Date.now() + Math.max(0, seconds) * 1000);
  return target.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

export function getGoogleMapsUrl(destination, origin, profile = "foot") {
  const mode = profile === "car" ? "driving" : "walking";
  if (origin) {
    return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&travelmode=${mode}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${destination.lat},${destination.lng}`;
}

export function getWazeUrl(destination) {
  return `https://waze.com/ul?ll=${destination.lat},${destination.lng}&navigate=yes`;
}
