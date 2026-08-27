"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { memo, useEffect, useMemo, useRef } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import {
  ESCALATION_THRESHOLD,
  INCIDENT_META,
  STATUS_META,
  type ReportDTO,
} from "@/lib/incidents";
import { typeIconSvg } from "@/lib/icons";

export type LatLng = { lat: number; lng: number };
export type FlyTarget = { lat: number; lng: number; zoom?: number; ts: number } | null;

const OSM_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

/* ---------------- Puentes imperativos ---------------- */

function ClickBridge({ onClick }: { onClick?: (p: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onClick?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function ReadyBridge({ onReady }: { onReady?: (map: L.Map) => void }) {
  const map = useMap();
  const cb = useRef(onReady);
  cb.current = onReady;
  useEffect(() => {
    cb.current?.(map);
  }, [map]);
  return null;
}

function FlyBridge({ target }: { target: FlyTarget }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    map.flyTo([target.lat, target.lng], target.zoom ?? Math.max(map.getZoom(), 16), {
      duration: 0.9,
    });
  }, [target, map]);
  return null;
}

function RouteBoundsBridge({ coords }: { coords?: [number, number][] | null }) {
  const map = useMap();
  useEffect(() => {
    if (!coords || coords.length < 2) return;
    try {
      const bounds = L.latLngBounds(coords.map((c) => L.latLng(c[0], c[1])));
      map.fitBounds(bounds, {
        paddingTopLeft: [60, 120],
        paddingBottomRight: [60, 220],
        maxZoom: 17,
        animate: true,
      });
    } catch {
      // ignorar si las coordenadas son inválidas
    }
  }, [coords, map]);
  return null;
}

/* ---------------- Iconos ---------------- */

const userIcon = L.divIcon({
  className: "",
  html: `<div class="vx-user-wrap"><span class="vx-user-pulse"></span><span class="vx-user-dot"></span></div>`,
  iconSize: [44, 44],
  iconAnchor: [22, 22],
});

const draftIcon = L.divIcon({
  className: "",
  html: `<div class="vx-draft-pin"></div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 32],
});

function buildReportIcon(report: ReportDTO, selected: boolean, dim: boolean): L.DivIcon {
  const t = INCIDENT_META[report.type] ?? INCIDENT_META.OTRO;
  const s = STATUS_META[report.status] ?? STATUS_META.ACTIVO;
  const pulsing = report.status === "ACTIVO" || report.status === "ESCALADO";
  const html = `
    <div class="vx-pin ${selected ? "vx-pin-selected" : ""} ${dim ? "vx-pin-dim" : ""}">
      ${pulsing ? `<span class="vx-pin-pulse" style="background:${s.color}"></span>` : ""}
      <div class="vx-pin-body" style="background:${t.color};border-color:${s.color};--arrow:${s.color}">
        ${typeIconSvg(report.type)}
      </div>
      <span class="vx-pin-count" style="border-color:${s.color};color:${s.color}">${report.confirmations}/${ESCALATION_THRESHOLD}</span>
    </div>`;
  return L.divIcon({
    className: "",
    html,
    iconSize: [44, 52],
    iconAnchor: [22, 43],
  });
}

/* ---------------- Marcador de reporte ---------------- */

const ReportMarker = memo(function ReportMarker({
  report,
  selected,
  dim,
  onSelect,
}: {
  report: ReportDTO;
  selected: boolean;
  dim: boolean;
  onSelect?: (id: string) => void;
}) {
  const icon = useMemo(
    () => buildReportIcon(report, selected, dim),
    [report, selected, dim]
  );
  return (
    <Marker
      position={[report.lat, report.lng]}
      icon={icon}
      zIndexOffset={selected ? 1000 : report.status === "ESCALADO" ? 500 : 0}
      eventHandlers={{ click: () => onSelect?.(report.id) }}
    />
  );
});

/* ---------------- Mapa ---------------- */

export default function MapView({
  center,
  zoom = 15,
  reports,
  userPos,
  userAccuracy,
  picking = false,
  draft = null,
  selectedId = null,
  routeCoords = null,
  flyTarget = null,
  dimClosed = false,
  onPick,
  onSelectReport,
  onMapReady,
}: {
  center: LatLng;
  zoom?: number;
  reports: ReportDTO[];
  userPos: LatLng | null;
  userAccuracy?: number | null;
  picking?: boolean;
  draft?: LatLng | null;
  selectedId?: string | null;
  routeCoords?: [number, number][] | null;
  flyTarget?: FlyTarget;
  dimClosed?: boolean;
  onPick?: (p: LatLng) => void;
  onSelectReport?: (id: string) => void;
  onMapReady?: (map: L.Map) => void;
}) {
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={zoom}
      minZoom={3}
      maxZoom={19}
      zoomControl={false}
      className="vx-dark-tiles h-full w-full"
      style={{ background: "#0a0d12" }}
    >
      <TileLayer url={OSM_URL} attribution={OSM_ATTR} maxZoom={19} />
      <ZoomControl position="bottomright" />

      <ReadyBridge onReady={onMapReady} />
      <ClickBridge onClick={picking ? onPick : undefined} />
      <FlyBridge target={flyTarget} />
      <RouteBoundsBridge coords={routeCoords} />

      {/* Ubicación del usuario ("Tú") */}
      {userPos && (
        <>
          {userAccuracy != null && userAccuracy > 25 && (
            <Circle
              center={[userPos.lat, userPos.lng]}
              radius={Math.min(userAccuracy, 400)}
              pathOptions={{
                color: "#3b82f6",
                weight: 1,
                opacity: 0.35,
                fillColor: "#3b82f6",
                fillOpacity: 0.08,
              }}
            />
          )}
          <Marker
            position={[userPos.lat, userPos.lng]}
            icon={userIcon}
            zIndexOffset={2000}
            interactive={false}
          />
        </>
      )}

      {/* Ruta GPS hacia el incidente */}
      {routeCoords && routeCoords.length > 1 && (
        <>
          {/* Sombra / borde oscuro de la ruta */}
          <Polyline
            positions={routeCoords}
            pathOptions={{ color: "#022c22", weight: 11, opacity: 0.9, lineCap: "round", lineJoin: "round" }}
          />
          {/* Línea central brillante estilo GPS */}
          <Polyline
            positions={routeCoords}
            pathOptions={{ color: "#10b981", weight: 6, opacity: 0.95, lineCap: "round", lineJoin: "round" }}
          />
          {/* Núcleo de luz interior */}
          <Polyline
            positions={routeCoords}
            pathOptions={{ color: "#6ee7b7", weight: 2.5, opacity: 0.9, lineCap: "round", lineJoin: "round" }}
          />
        </>
      )}

      {/* Incidentes */}
      {reports.map((r) => (
        <ReportMarker
          key={r.id}
          report={r}
          selected={selectedId === r.id}
          dim={
            dimClosed &&
            (r.status === "FALSA_ALARMA" || r.status === "RESUELTO")
          }
          onSelect={picking ? undefined : onSelectReport}
        />
      ))}

      {/* Pin borrador al seleccionar ubicación */}
      {draft && (
        <Marker
          position={[draft.lat, draft.lng]}
          icon={draftIcon}
          draggable
          zIndexOffset={1500}
          eventHandlers={{
            dragend: (e) => {
              const m = e.target as L.Marker;
              const p = m.getLatLng();
              onPick?.({ lat: p.lat, lng: p.lng });
            },
          }}
        />
      )}
    </MapContainer>
  );
}
