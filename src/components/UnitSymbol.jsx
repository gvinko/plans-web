// Plan-view (top-down) drawings of ducted indoor units and outdoor condensers,
// in the style of Daikin / Fujitsu installation-manual outline drawings.
// Drawn in millimetres so the symbol matches the unit's real footprint.
// Unrotated orientation: return air at the rear (top edge), supply air at the
// front (bottom edge); for condensers the fan discharges out the front.
// Bold fills + a white halo keep them readable on top of busy plan linework.

const S = { vectorEffect: 'non-scaling-stroke' };

const INDOOR = { fill: '#dbeafe', edge: '#1d4ed8', line: '#1e3a8a', ra: '#fecaca', raEdge: '#b91c1c', sa: '#16a34a' };
const OUTDOOR = { body: '#1f2937', accent: '#f97316', guard: '#ffffff' };

function arrow(x, y1, y2, head) {
  return `M${x},${y1} L${x},${y2} M${x - head},${y2 - head} L${x},${y2} L${x + head},${y2 - head}`;
}

export function IndoorUnitPlan({ w, d }) {
  const fans = w >= 1300 ? 3 : w >= 850 ? 2 : 1;
  const fanR = Math.min(d * 0.16, w / (fans * 2.8));
  const lug = Math.max(40, w * 0.045);
  const hatch = [];
  const fx0 = w * 0.05;
  const fx1 = w * 0.95;
  const fy0 = d * 0.06;
  const fy1 = d * 0.26;
  const step = Math.max(60, w / 18);
  for (let x = fx0 + step / 2; x + (fy1 - fy0) * 0.6 < fx1; x += step) {
    hatch.push(<line key={x} x1={x} y1={fy1} x2={x + (fy1 - fy0) * 0.6} y2={fy0} style={S} />);
  }
  const head = Math.min(w, d) * 0.035;
  const textSize = Math.max(50, Math.min(d * 0.1, w * 0.06));
  return (
    <svg viewBox={`0 0 ${w} ${d}`} width="100%" height="100%" preserveAspectRatio="none" overflow="visible">
      <rect x={-lug} y={-d * 0.02} width={w + lug * 2} height={d * 1.04} fill="none" stroke="#ffffff" strokeWidth={8} strokeOpacity={0.95} style={S} />
      <g fill="none" stroke={INDOOR.line} strokeWidth={1.6} strokeLinejoin="round">
        {[d * 0.1, d * 0.78].map((y) => (
          <g key={y}>
            <rect x={-lug} y={y} width={lug} height={d * 0.12} fill={INDOOR.fill} style={S} />
            <rect x={w} y={y} width={lug} height={d * 0.12} fill={INDOOR.fill} style={S} />
          </g>
        ))}
        <rect x={0} y={0} width={w} height={d} fill={INDOOR.fill} stroke={INDOOR.edge} strokeWidth={2.6} style={S} />
        <rect x={fx0} y={fy0} width={fx1 - fx0} height={fy1 - fy0} fill={INDOOR.ra} stroke={INDOOR.raEdge} strokeWidth={1.6} style={S} />
        <g stroke={INDOOR.raEdge} strokeWidth={1} opacity={0.8}>{hatch}</g>
        {Array.from({ length: fans }, (_, i) => {
          const cx = w * 0.18 + ((w * 0.72) / fans) * (i + 0.5);
          return (
            <g key={i}>
              <circle cx={cx} cy={d * 0.58} r={fanR} fill="#ffffff" style={S} />
              <circle cx={cx} cy={d * 0.58} r={fanR * 0.45} fill={INDOOR.edge} fillOpacity={0.25} style={S} />
            </g>
          );
        })}
        <rect x={w * 0.02} y={d * 0.36} width={w * 0.11} height={d * 0.42} fill={INDOOR.edge} fillOpacity={0.35} style={S} />
        <circle cx={w * 0.93} cy={d * 0.8} r={Math.min(w, d) * 0.03} fill="#ffffff" style={S} />
        <line x1={0} y1={d * 0.34} x2={-lug * 1.4} y2={d * 0.34} strokeWidth={2} style={S} />
        <line x1={0} y1={d * 0.42} x2={-lug * 1.4} y2={d * 0.42} strokeWidth={2} style={S} />
        <rect x={w * 0.07} y={d * 0.92} width={w * 0.86} height={d * 0.08} fill={INDOOR.sa} fillOpacity={0.55} stroke={INDOOR.sa} strokeWidth={1.6} style={S} />
        {[0.25, 0.5, 0.75].map((f) => (
          <path key={f} d={arrow(w * f, d * 1.02, d * 1.16, head)} stroke={INDOOR.sa} strokeWidth={2} style={S} />
        ))}
      </g>
      <g fontSize={textSize} fontFamily="inherit" fontWeight="700" textAnchor="middle">
        <text x={w / 2} y={fy1 + textSize * 1.05} fill={INDOOR.raEdge}>R/A</text>
        <text x={w / 2} y={d * 0.9} fill={INDOOR.sa}>S/A</text>
      </g>
    </svg>
  );
}

// ActronAir two-piece fan coil: the fan section draws return air in at the rear
// and pushes it on to the coil section, which supplies air out the front.
export function FanSectionPlan({ w, d }) {
  const fanR = Math.min(d * 0.3, w * 0.16);
  const textSize = Math.max(50, Math.min(d * 0.2, w * 0.07));
  return (
    <svg viewBox={`0 0 ${w} ${d}`} width="100%" height="100%" preserveAspectRatio="none" overflow="visible">
      <rect x={-w * 0.01} y={-d * 0.03} width={w * 1.02} height={d * 1.06} fill="none" stroke="#ffffff" strokeWidth={8} style={S} />
      <rect x={0} y={0} width={w} height={d} fill="#e0e7ff" stroke={INDOOR.edge} strokeWidth={2.6} style={S} />
      <rect x={w * 0.05} y={d * 0.04} width={w * 0.9} height={d * 0.14} fill={INDOOR.ra} stroke={INDOOR.raEdge} strokeWidth={1.6} style={S} />
      {[0.3, 0.7].map((f) => (
        <g key={f} fill="none" stroke={INDOOR.line}>
          <circle cx={w * f} cy={d * 0.58} r={fanR} fill="#ffffff" strokeWidth={1.6} style={S} />
          <circle cx={w * f} cy={d * 0.58} r={fanR * 0.45} fill={INDOOR.edge} fillOpacity={0.25} strokeWidth={1.2} style={S} />
        </g>
      ))}
      <text x={w / 2} y={d * 0.64} fontSize={textSize} fontWeight="700" textAnchor="middle" fill={INDOOR.line}>FAN</text>
    </svg>
  );
}

export function CoilSectionPlan({ w, d }) {
  const fins = [];
  const step = Math.max(45, w / 26);
  for (let x = w * 0.06; x < w * 0.94; x += step) fins.push(<line key={x} x1={x} y1={d * 0.22} x2={x} y2={d * 0.74} style={S} />);
  const textSize = Math.max(50, Math.min(d * 0.2, w * 0.07));
  const head = Math.min(w, d) * 0.05;
  return (
    <svg viewBox={`0 0 ${w} ${d}`} width="100%" height="100%" preserveAspectRatio="none" overflow="visible">
      <rect x={-w * 0.01} y={-d * 0.03} width={w * 1.02} height={d * 1.06} fill="none" stroke="#ffffff" strokeWidth={8} style={S} />
      <rect x={0} y={0} width={w} height={d} fill={INDOOR.fill} stroke={INDOOR.edge} strokeWidth={2.6} style={S} />
      <g stroke="#2563eb" strokeWidth={1} opacity={0.7}>{fins}</g>
      <rect x={w * 0.07} y={d * 0.86} width={w * 0.86} height={d * 0.14} fill={INDOOR.sa} fillOpacity={0.55} stroke={INDOOR.sa} strokeWidth={1.6} style={S} />
      {[0.25, 0.5, 0.75].map((f) => (
        <path key={f} d={arrow(w * f, d * 1.02, d * 1.2, head)} fill="none" stroke={INDOOR.sa} strokeWidth={2} style={S} />
      ))}
      <line x1={0} y1={d * 0.3} x2={-w * 0.05} y2={d * 0.3} stroke={INDOOR.line} strokeWidth={2} style={S} />
      <line x1={0} y1={d * 0.46} x2={-w * 0.05} y2={d * 0.46} stroke={INDOOR.line} strokeWidth={2} style={S} />
      <text x={w / 2} y={d * 0.58} fontSize={textSize} fontWeight="700" textAnchor="middle" fill={INDOOR.line} stroke="#ffffff" strokeWidth={3} paintOrder="stroke" style={S}>COIL</text>
    </svg>
  );
}

export function OutdoorUnitPlan({ w, d, fans = 1 }) {
  const fanR = Math.min(d * 0.36, (w * 0.7) / (fans * 2.2));
  const head = Math.min(w, d) * 0.08;
  const guardX0 = w * 0.04;
  const guardX1 = w * 0.76;
  const bars = [];
  for (let x = guardX0 + 30; x < guardX1; x += Math.max(35, w / 30)) {
    bars.push(<line key={x} x1={x} y1={d * 0.87} x2={x} y2={d * 0.96} style={S} />);
  }
  return (
    <svg viewBox={`0 0 ${w} ${d}`} width="100%" height="100%" preserveAspectRatio="none" overflow="visible">
      {/* white halo + orange ring so the condenser jumps off the plan */}
      <rect x={-w * 0.01} y={-d * 0.03} width={w * 1.02} height={d * 1.06} fill="none" stroke="#ffffff" strokeWidth={10} style={S} />
      {/* mounting feet */}
      <rect x={w * 0.08} y={-d * 0.08} width={w * 0.07} height={d * 1.16} fill={OUTDOOR.accent} stroke={OUTDOOR.body} strokeWidth={1.5} style={S} />
      <rect x={w * 0.85} y={-d * 0.08} width={w * 0.07} height={d * 1.16} fill={OUTDOOR.accent} stroke={OUTDOOR.body} strokeWidth={1.5} style={S} />
      {/* casing */}
      <rect x={0} y={0} width={w} height={d} fill={OUTDOOR.body} stroke={OUTDOOR.accent} strokeWidth={3.5} style={S} />
      {/* fan(s): guard rings + hub */}
      {Array.from({ length: fans }, (_, i) => {
        const cx = guardX0 + ((guardX1 - guardX0) / fans) * (i + 0.5);
        return (
          <g key={i} fill="none" stroke={OUTDOOR.guard}>
            <circle cx={cx} cy={d * 0.47} r={fanR} strokeWidth={2} style={S} />
            <circle cx={cx} cy={d * 0.47} r={fanR * 0.66} strokeWidth={1.2} style={S} />
            <circle cx={cx} cy={d * 0.47} r={fanR * 0.33} strokeWidth={1.2} style={S} />
            <line x1={cx - fanR} y1={d * 0.47} x2={cx + fanR} y2={d * 0.47} strokeWidth={1.2} style={S} />
            <line x1={cx} y1={d * 0.47 - fanR} x2={cx} y2={d * 0.47 + fanR} strokeWidth={1.2} style={S} />
            <circle cx={cx} cy={d * 0.47} r={fanR * 0.12} fill={OUTDOOR.guard} style={S} />
          </g>
        );
      })}
      {/* front fan guard */}
      <rect x={guardX0} y={d * 0.86} width={guardX1 - guardX0} height={d * 0.11} fill="none" stroke={OUTDOOR.guard} strokeWidth={1.5} style={S} />
      <g stroke={OUTDOOR.guard} strokeWidth={1}>{bars}</g>
      {/* service valve cover + pipe connections */}
      <rect x={w * 0.8} y={d * 0.16} width={w * 0.16} height={d * 0.62} fill={OUTDOOR.accent} stroke={OUTDOOR.guard} strokeWidth={1.2} style={S} />
      <line x1={w} y1={d * 0.38} x2={w + w * 0.07} y2={d * 0.38} stroke={OUTDOOR.body} strokeWidth={3} style={S} />
      <line x1={w} y1={d * 0.52} x2={w + w * 0.07} y2={d * 0.52} stroke={OUTDOOR.body} strokeWidth={3} style={S} />
      {/* discharge direction */}
      <path d={arrow((guardX0 + guardX1) / 2, d * 1.05, d * 1.38, head)} fill="none" stroke={OUTDOOR.accent} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" style={S} />
    </svg>
  );
}
