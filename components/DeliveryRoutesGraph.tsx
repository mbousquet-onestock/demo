import React, { useMemo, useState } from 'react';
import { DeliveryRoute, Zone, carrierLabel, transitLabel, transitIssue } from '../services/deliveryRouteService';

interface Props {
  routes: DeliveryRoute[];
  zones: Zone[];
  // Stock points matching each zone (shown on the nodes).
  endpointCounts?: Map<string, number>;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  // Routes to highlight (article analysis); the others are dimmed.
  highlight?: Set<string> | null;
}

const PALETTE = ['#002D72', '#059669', '#D97706', '#7C3AED', '#DC2626', '#0891B2', '#DB2777', '#65A30D', '#9333EA', '#EA580C'];
const ROW = 34;
const NODE_W = 210;
const WIDTH = 860;

// Origin zones (left) → destination zones (right), one curve per delivery route, one colour per carrier.
const DeliveryRoutesGraph: React.FC<Props> = ({ routes, zones, endpointCounts, selectedId, onSelect, highlight }) => {
  const [hover, setHover] = useState<string | null>(null);
  const zoneName = (id?: string) => {
    const z = zones.find(x => x.id === id);
    return z?.name && z.name !== id ? `${z.name} (${id})` : id || '—';
  };
  const { origins, destinations, colors } = useMemo(() => {
    const origins = [...new Set(routes.map(r => r.origin_zone_id || '—'))].sort();
    const destinations = [...new Set(routes.map(r => r.destination_zone_id || '—'))].sort();
    const carriers = [...new Set(routes.map(carrierLabel))].sort();
    const colors = new Map(carriers.map((c, i) => [c, PALETTE[i % PALETTE.length]]));
    return { origins, destinations, colors };
  }, [routes]);

  if (routes.length === 0) return <p className="p-8 text-center text-sm text-gray-400">No delivery route.</p>;

  const height = Math.max(origins.length, destinations.length) * ROW + 40;
  const y = (list: string[], id: string) => 30 + list.indexOf(id) * ROW + (height - 40 - list.length * ROW) / 2;
  const active = hover || selectedId;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {[...colors.entries()].map(([c, color]) => (
          <span key={c} className="flex items-center gap-1.5 text-[11px] text-gray-600">
            <span className="w-3 h-1.5 rounded" style={{ background: color }} />{c}
          </span>
        ))}
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${WIDTH} ${height}`} width="100%" className="block" style={{ minWidth: 560 }}>
          <text x={0} y={14} className="fill-gray-400" fontSize={10} fontWeight={700}>ORIGIN ZONES</text>
          <text x={WIDTH} y={14} textAnchor="end" className="fill-gray-400" fontSize={10} fontWeight={700}>DESTINATION ZONES</text>
          {routes.map(r => {
            const o = r.origin_zone_id || '—', d = r.destination_zone_id || '—';
            const y1 = y(origins, o) + 12, y2 = y(destinations, d) + 12;
            const x1 = NODE_W, x2 = WIDTH - NODE_W;
            const color = colors.get(carrierLabel(r))!;
            const dim = (highlight && !highlight.has(r.id)) || (active && active !== r.id);
            const isActive = active === r.id || (highlight?.has(r.id) ?? false);
            return (
              <path
                key={r.id}
                d={`M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`}
                fill="none"
                stroke={color}
                strokeWidth={isActive ? 3 : 1.6}
                strokeOpacity={dim ? 0.12 : 0.85}
                strokeDasharray={transitIssue(r) ? '6 4' : undefined}
                className="cursor-pointer"
                onMouseEnter={() => setHover(r.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSelect?.(selectedId === r.id ? null : r.id)}
              >
                <title>{`${r.id}\n${zoneName(o)} → ${zoneName(d)}\n${carrierLabel(r)} · transit ${transitLabel(r) || 'not set'}${transitIssue(r) ? `\n⚠ ${transitIssue(r)}` : ''}`}</title>
              </path>
            );
          })}
          {origins.map(id => (
            <g key={`o-${id}`} transform={`translate(0,${y(origins, id)})`}>
              <rect width={NODE_W} height={24} rx={6} className="fill-blue-50 stroke-blue-200" />
              <text x={8} y={16} fontSize={11} className="fill-gray-800">{zoneName(id).slice(0, 28)}</text>
              {endpointCounts && <text x={NODE_W - 6} y={16} fontSize={10} textAnchor="end" className="fill-gray-400">{endpointCounts.get(id) ?? 0} pts</text>}
            </g>
          ))}
          {destinations.map(id => (
            <g key={`d-${id}`} transform={`translate(${WIDTH - NODE_W},${y(destinations, id)})`}>
              <rect width={NODE_W} height={24} rx={6} className="fill-emerald-50 stroke-emerald-200" />
              <text x={8} y={16} fontSize={11} className="fill-gray-800">{zoneName(id).slice(0, 30)}</text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
};

export default DeliveryRoutesGraph;
