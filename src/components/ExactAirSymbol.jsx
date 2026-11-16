import { EAR, earIsMotor, earOuts, earPortMm, earPorts, EAR_OPEN } from '@/lib/exactAir';

// Plan symbol for an Advantage Air Exact Air Regulator: body, one spigot per
// connection drawn at its picked size, a damper line and a motor block per zone.
const INSET = { earbig: [89, 117], earmini: [25, 45], earclip: [50, 0] };

export default function ExactAirSymbol({ type, spec = {}, w, d, zoneColor, className = '' }) {
  const [ix, iy] = INSET[type] || [40, 40];
  const ne = { vectorEffect: 'non-scaling-stroke' };
  const outs = earOuts(type, spec);
  const damperOf = (id) => (type === 'earclip' ? (id === 'e' ? outs[0].damper : null) : outs.find((o) => `o${o.i}` === id)?.damper || null);
  return (
    <svg viewBox={`0 0 ${w} ${d}`} preserveAspectRatio="none" className={`size-full ${className}`} fill="none" stroke="currentColor" strokeWidth="1.5">
      {earPorts(type, spec).map((p) => {
        const mm = (earPortMm(type, spec, p.id) || 250) * 0.7;
        const cx = p.fx * w;
        const cy = p.fy * d;
        const vert = p.dir === 'n' || p.dir === 's';
        const len = vert ? iy || 40 : ix || 40;
        const x = vert ? cx - mm / 2 : p.dir === 'w' ? 0 : w - len;
        const y = vert ? (p.dir === 'n' ? 0 : d - len) : cy - mm / 2;
        const damper = damperOf(p.id);
        const tone = earIsMotor(damper) ? zoneColor?.(damper) || 'currentColor' : null;
        const m = Math.min(70, mm * 0.35);
        return (
          <g key={p.id}>
            <rect x={x} y={y} width={vert ? mm : len} height={vert ? len : mm} fill="#fff" {...ne} />
            {damper && damper !== EAR_OPEN && (vert
              ? <line x1={x} y1={y + len / 2} x2={x + mm} y2={y + len / 2} {...ne} />
              : <line x1={x + len / 2} y1={y} x2={x + len / 2} y2={y + mm} {...ne} />)}
            {tone && <rect x={vert ? cx - m / 2 : (p.dir === 'w' ? ix + 12 : w - ix - 12 - m)} y={vert ? (p.dir === 'n' ? iy + 12 : d - iy - 12 - m) : cy - m / 2} width={m} height={m} fill={tone} stroke="none" />}
          </g>
        );
      })}
      <rect x={ix} y={iy} width={w - ix * 2} height={d - iy * 2} rx={type === 'earbig' ? 60 : 20} {...ne} />
      {type !== 'earclip' && <text x={w / 2} y={d / 2} textAnchor="middle" dominantBaseline="central" fontSize={Math.min(w, d) * 0.13} fill="currentColor" stroke="none" fontWeight="700">{EAR[type].code}</text>}
    </svg>
  );
}
