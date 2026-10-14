import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { StockPointDraft, StockPointPushResult } from '../types';

interface StockPointsMapProps {
  endpoints: StockPointDraft[];
  results?: Record<string, StockPointPushResult>;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}

const typeColor = (ep: StockPointDraft) => {
  const type = (ep.classification?.endpoint_type?.[0] || '').toLowerCase();
  if (type.includes('warehouse')) return '#7C3AED';
  if (type.includes('dark') || type.includes('drive')) return '#D97706';
  if (type.includes('locker')) return '#0891B2';
  return '#002D72';
};

// OpenStreetMap view of the stock points (coordinates from address.coordinates).
const StockPointsMap: React.FC<StockPointsMapProps> = ({ endpoints, results, selectedId, onSelect }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView([46.6, 2.4], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const points: L.LatLngExpression[] = [];
    endpoints.forEach(ep => {
      const lat = Number(ep.address?.coordinates?.lat);
      const lon = Number(ep.address?.coordinates?.lon);
      if (!isFinite(lat) || !isFinite(lon) || (lat === 0 && lon === 0)) return;
      const result = results?.[ep.id];
      const selected = ep.id === selectedId;
      const marker = L.circleMarker([lat, lon], {
        radius: selected ? 10 : 7,
        color: result ? (result.ok ? '#059669' : '#DC2626') : '#ffffff',
        weight: result || selected ? 3 : 2,
        fillColor: typeColor(ep),
        fillOpacity: 0.9,
      });
      const city = [ep.address?.zip_code, ep.address?.city].filter(Boolean).join(' ');
      marker.bindTooltip(`<b>${ep.name}</b><br/>${ep.id}${city ? `<br/>${city}` : ''}`);
      if (onSelect) marker.on('click', () => onSelect(ep.id));
      marker.addTo(layer);
      points.push([lat, lon]);
    });
    if (points.length > 0) map.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 12 });
  }, [endpoints, results, selectedId, onSelect]);

  return <div ref={containerRef} className="w-full h-80 rounded-xl border border-gray-200 z-0" />;
};

export default StockPointsMap;
