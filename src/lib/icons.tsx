import {
  CarFront,
  Flag,
  Flame,
  Grab,
  ScanEye,
  Siren,
  Swords,
  type LucideIcon,
} from "lucide-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { IncidentType } from "./incidents";

export const TYPE_ICONS: Record<IncidentType, LucideIcon> = {
  ROBO: Grab,
  PELEA: Swords,
  ACCIDENTE: CarFront,
  INCENDIO: Flame,
  EMERGENCIA: Siren,
  SOSPECHOSO: ScanEye,
  OTRO: Flag,
};

/** SVG string del icono de un tipo de incidente (para pines HTML de Leaflet) */
export function typeIconSvg(
  type: IncidentType,
  size = 17,
  color = "#fff"
): string {
  return renderToStaticMarkup(
    createElement(TYPE_ICONS[type] ?? Flag, {
      size,
      color,
      strokeWidth: 2.5,
    })
  );
}
