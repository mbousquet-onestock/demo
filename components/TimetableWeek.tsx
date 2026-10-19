import React from 'react';
import { TimetableReport } from '../services/deliveryRouteService';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const TIMETABLE_STATUS: Record<TimetableReport['status'], { label: string; cls: string }> = {
  ok: { label: 'OK', cls: 'bg-emerald-100 text-emerald-700' },
  partial: { label: '< 5 days', cls: 'bg-amber-100 text-amber-700' },
  empty: { label: 'Empty', cls: 'bg-red-100 text-red-700' },
  'not-found': { label: 'Not found', cls: 'bg-red-100 text-red-700' },
  'not-set': { label: 'Not set', cls: 'bg-gray-100 text-gray-500' },
};

const hm = (sec: number) => `${Math.floor(sec / 3600)}h${String(Math.floor(sec / 60) % 60).padStart(2, '0')}`;

// One week of a timetable: 7 day cells, the open spans filled, times (start = end) as ticks.
const TimetableWeek: React.FC<{ report: TimetableReport; color?: string; width?: number }> = ({ report, color = '#002D72', width = 252 }) => {
  const dayW = width / 7;
  return (
    <svg width={width} height={22} className="block shrink-0">
      {DAYS.map((d, i) => (
        <g key={d} transform={`translate(${i * dayW},0)`}>
          <rect x={0.5} y={0.5} width={dayW - 1} height={12} rx={2} className="fill-gray-100" />
          {report.days[i].map((sp, k) => (
            sp.end === sp.start ? (
              <g key={k}>
                <rect x={(sp.start / 86400) * (dayW - 1) - 0.5} y={-0.5} width={2} height={14} fill="#D97706" />
                <title>{`${d} ${hm(sp.start)}`}</title>
              </g>
            ) : (
              <rect key={k} x={0.5 + (sp.start / 86400) * (dayW - 1)} y={0.5} width={Math.max(1, ((sp.end - sp.start) / 86400) * (dayW - 1))} height={12} rx={1} fill={color}>
                <title>{`${d} ${hm(sp.start)} – ${hm(sp.end)}`}</title>
              </rect>
            )
          ))}
          <text x={dayW / 2} y={21} textAnchor="middle" fontSize={7} className="fill-gray-400">{d}</text>
        </g>
      ))}
    </svg>
  );
};

export default TimetableWeek;
