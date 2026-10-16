import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { EndpointAnalysis, RouteEndpoint, VERDICT_LABELS } from '../services/deliveryRouteService';

interface Props {
  analyses: EndpointAnalysis[];
  onSelect?: (id: string) => void;
}

// Stock points of the analysis on a map, coloured by verdict (can deliver, destination not covered, no route…).
const DeliveryMap: React.FC<Props> = ({ analyses, onSelect }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView([46.6, 2.4], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const points: L.LatLngExpression[] = [];
    // Stock points without stock first, so the others are drawn above them.
    [...analyses].sort((a, b) => (a.verdict === 'no-stock' ? 0 : 1) - (b.verdict === 'no-stock' ? 0 : 1)).forEach(a => {
      const c = (a.endpoint as RouteEndpoint).address?.coordinates;
      const lat = Number(c?.lat), lon = Number(c?.lon ?? c?.lng);
      if (!isFinite(lat) || !isFinite(lon) || (lat === 0 && lon === 0)) return;
      const v = VERDICT_LABELS[a.verdict];
      const marker = L.circleMarker([lat, lon], {
        radius: a.verdict === 'no-stock' ? 4 : 7,
        color: '#fff',
        weight: 1,
        fillColor: v.color,
        fillOpacity: a.verdict === 'no-stock' ? 0.5 : 0.95,
      });
      const name = (a.endpoint as RouteEndpoint).name || a.endpoint.id;
      marker.bindTooltip(`<b>${name}</b> (${a.endpoint.id})<br>Stock: ${a.quantity}<br><span style="color:${v.color}">${v.label}</span>`);
      if (onSelect) marker.on('click', () => onSelect(a.endpoint.id));
      marker.addTo(layer);
      if (a.verdict !== 'no-stock') points.push([lat, lon]);
    });
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 9 });
  }, [analyses, onSelect]);

  return <div ref={containerRef} className="w-full h-[420px] rounded-xl border border-gray-200 z-0" />;
};

export default DeliveryMap;
