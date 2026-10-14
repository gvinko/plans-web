// Drafting-standard HVAC plan symbols. Plain SVG so they read the way a
// mechanical contractor's plan draws them. `stretch` fills a rectangular
// footprint (grilles, plenums) instead of staying square.

function spigotRects(n, y) {
  return Array.from({ length: n }, (_, i) => {
    const cx = (24 * (i + 0.5)) / n;
    return <rect key={i} x={cx - 2.5} y={y} width="5" height="6" />;
  });
}

export default function HvacSymbol({ type, size = 22, className = '', stretch = false, spigots }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    preserveAspectRatio: stretch ? 'none' : 'xMidYMid meet',
    className,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };

  switch (type) {
    case 'supply':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
          <line x1="12" y1="3" x2="12" y2="8.3" />
          <line x1="12" y1="15.7" x2="12" y2="21" />
          <line x1="3" y1="12" x2="8.3" y2="12" />
          <line x1="15.7" y1="12" x2="21" y2="12" />
        </svg>
      );

    case 'return':
      return (
        <svg {...common}>
          <rect x="1" y="1" width="22" height="22" rx="0.8" />
          <rect x="3" y="3" width="18" height="18" />
          <line x1="3" y1="7.5" x2="21" y2="7.5" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="16.5" x2="21" y2="16.5" />
          <line x1="7.5" y1="3" x2="7.5" y2="21" />
          <line x1="12" y1="3" x2="12" y2="21" />
          <line x1="16.5" y1="3" x2="16.5" y2="21" />
        </svg>
      );

    case 'wallgrille':
      return (
        <svg {...common}>
          <rect x="1" y="2" width="22" height="20" rx="0.8" />
          <line x1="3" y1="8" x2="21" y2="8" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="16" x2="21" y2="16" />
        </svg>
      );

    case 'floorgrille':
      return (
        <svg {...common}>
          <rect x="1" y="2" width="22" height="20" rx="0.8" />
          <line x1="5.5" y1="5" x2="5.5" y2="19" />
          <line x1="9.8" y1="5" x2="9.8" y2="19" />
          <line x1="14.2" y1="5" x2="14.2" y2="19" />
          <line x1="18.5" y1="5" x2="18.5" y2="19" />
        </svg>
      );

    case 'bto':
      return (
        <svg {...common}>
          <rect x="7" y="7" width="10" height="10" rx="1" />
          <rect x="2" y="9.5" width="5" height="5" />
          <rect x="17" y="9.5" width="5" height="5" />
          <rect x="9.5" y="17" width="5" height="5" />
        </svg>
      );

    case 'dbto':
      return (
        <svg {...common}>
          <rect x="7" y="7" width="10" height="10" rx="1" />
          <rect x="2" y="9.5" width="5" height="5" />
          <rect x="17" y="9.5" width="5" height="5" />
          <rect x="9.5" y="17" width="5" height="5" />
          <rect x="9.5" y="2" width="5" height="5" />
        </svg>
      );

    case 'zone':
      return (
        <svg {...common}>
          <circle cx="11" cy="13" r="7.5" />
          <line x1="6" y1="18" x2="16" y2="8" strokeWidth="1.8" />
          <rect x="16.5" y="2.5" width="5.5" height="4.5" rx="0.6" fill="currentColor" stroke="none" />
          <line x1="16" y1="8" x2="18" y2="6.5" />
        </svg>
      );

    case 'reducer':
      return (
        <svg {...common}>
          <path d="M1 3 H8 L16 8 H23 V16 H16 L8 21 H1 Z" />
        </svg>
      );

    case 'cushion':
      return (
        <svg {...common}>
          <rect x="2" y="2" width="20" height="20" rx="1.2" />
          <line x1="2" y1="2" x2="22" y2="22" strokeWidth="0.9" />
          <line x1="22" y1="2" x2="2" y2="22" strokeWidth="0.9" />
        </svg>
      );

    case 'saplenum':
      return (
        <svg {...common}>
          <rect x="1" y="1" width="22" height="15" rx="0.8" />
          {spigotRects(spigots ?? 3, 16)}
          <path d="M12 4 V12 M9.5 9.5 L12 12 L14.5 9.5" />
        </svg>
      );

    case 'ductplate':
      return (
        <svg {...common}>
          <rect x="1" y="1" width="22" height="12" rx="0.5" />
          <line x1="1" y1="4" x2="23" y2="4" />
          {spigotRects(spigots ?? 2, 13)}
        </svg>
      );

    case 'raplenum':
      return (
        <svg {...common}>
          <rect x="1" y="8" width="22" height="15" rx="0.8" />
          {spigotRects(spigots ?? 2, 2)}
          <path d="M12 20 V12 M9.5 14.5 L12 12 L14.5 14.5" />
        </svg>
      );

    case 'controller':
      return (
        <svg {...common}>
          <rect x="5" y="2.5" width="14" height="19" rx="2" />
          <rect x="8" y="5.5" width="8" height="6" rx="0.6" />
          <circle cx="9.5" cy="16" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="14.5" cy="16" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      );

    case 'condpump':
      return (
        <svg {...common}>
          <rect x="2" y="5" width="20" height="14" rx="2" fill="#e0f2fe" />
          <path d="M12 8 C10 11 9 12.5 9 14 a3 3 0 0 0 6 0 c0 -1.5 -1 -3 -3 -6 Z" fill="#0284c7" stroke="none" />
        </svg>
      );

    case 'drainpoint':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" fill="#e0f2fe" />
          <line x1="6" y1="9" x2="18" y2="9" />
          <line x1="5" y1="12" x2="19" y2="12" />
          <line x1="6" y1="15" x2="18" y2="15" />
        </svg>
      );

    case 'isolator':
      return (
        <svg {...common}>
          <rect x="4" y="3" width="16" height="18" rx="2" fill="#fef3c7" />
          <circle cx="12" cy="12" r="4" />
          <line x1="12" y1="12" x2="15" y2="9" strokeWidth="2.4" />
        </svg>
      );

    case 'switchboard':
      return (
        <svg {...common} preserveAspectRatio="none">
          <rect x="1" y="3" width="22" height="18" rx="1" fill="#e5e7eb" />
          <path d="M13 6 L9 13 H12.5 L11 18 L15.5 10.5 H12 Z" fill="#b91c1c" stroke="#b91c1c" strokeWidth="1" />
        </svg>
      );

    case 'splitindoor':
      return (
        <svg {...common}>
          <rect x="1" y="2" width="22" height="13" rx="3" fill="#dbeafe" />
          <line x1="3.5" y1="11" x2="20.5" y2="11" />
          <line x1="3.5" y1="13.3" x2="20.5" y2="13.3" />
          <path d="M7 16.5 V21.5 M5.6 20.1 L7 21.5 L8.4 20.1 M12 16.5 V21.5 M10.6 20.1 L12 21.5 L13.4 20.1 M17 16.5 V21.5 M15.6 20.1 L17 21.5 L18.4 20.1" />
        </svg>
      );

    case 'sensor':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="4" />
          <path d="M12 6.5 V13.5" strokeWidth="2.4" />
          <circle cx="12" cy="16" r="2.6" fill="currentColor" />
        </svg>
      );

    case 'zonearea':
      return (
        <svg {...common}>
          <rect x="2" y="4" width="20" height="16" rx="1.5" strokeDasharray="3 2" fill="currentColor" fillOpacity="0.2" />
        </svg>
      );

    case 'transformer':
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="12" rx="1.2" />
          <path d="M6.5 12 q1.5 -3 3 0 t3 0 t3 0 t2 0" />
        </svg>
      );

    case 'indoor':
      return (
        <svg {...common}>
          <rect x="1.5" y="5" width="21" height="13" rx="1" />
          <rect x="3" y="6.5" width="18" height="3" />
          <circle cx="8" cy="13.5" r="2.2" />
          <circle cx="16" cy="13.5" r="2.2" />
          <path d="M12 18 V21.5 M10.5 20 L12 21.5 L13.5 20" />
        </svg>
      );

    case 'outdoor':
      return (
        <svg {...common}>
          <rect x="2" y="6" width="20" height="10" rx="1" />
          <circle cx="10" cy="11" r="3.8" strokeDasharray="2 1.5" />
          <rect x="17" y="7.5" width="3.5" height="7" />
          <path d="M10 16.5 V21.5 M8.5 20 L10 21.5 L11.5 20" />
        </svg>
      );

    // ---- Commercial ventilation ----
    case 'exhfan':
      return (
        <svg {...common}>
          <rect x="1" y="5" width="22" height="14" rx="1" />
          <circle cx="12" cy="12" r="5.2" />
          <path d="M12 12 L12 7.4 Q14.6 9 12 12 M12 12 L16 14.3 Q13.3 15.6 12 12 M12 12 L8 14.3 Q8.4 11.2 12 12" fill="currentColor" strokeWidth="1" />
        </svg>
      );

    case 'roofcowl':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="5.5" />
          <path d="M12 2 V6.5 M12 17.5 V22 M2 12 H6.5 M17.5 12 H22" strokeWidth="1.4" />
        </svg>
      );

    case 'jetfan':
      return (
        <svg {...common}>
          <rect x="1" y="6" width="22" height="12" rx="5" />
          <circle cx="8" cy="12" r="3.4" />
          <path d="M13 12 H21 M18 9 L21 12 L18 15" />
        </svg>
      );

    case 'eggcrate':
      return (
        <svg {...common}>
          <rect x="1" y="1" width="22" height="22" rx="0.8" />
          {[5, 9, 13, 17].map((v) => (
            <g key={v} strokeWidth="1">
              <line x1={v + 1} y1="3" x2={v + 1} y2="21" />
              <line x1="3" y1={v + 1} x2="21" y2={v + 1} />
            </g>
          ))}
        </svg>
      );

    case 'sqdiff':
      return (
        <svg {...common}>
          <rect x="1" y="1" width="22" height="22" rx="0.8" />
          <rect x="7" y="7" width="10" height="10" />
          <path d="M1 1 L7 7 M23 1 L17 7 M1 23 L7 17 M23 23 L17 17" />
        </svg>
      );

    case 'linearslot':
      return (
        <svg {...common}>
          <rect x="1" y="5" width="22" height="14" rx="0.8" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <line x1="3" y1="14" x2="21" y2="14" />
        </svg>
      );

    case 'louvre':
      return (
        <svg {...common}>
          <rect x="1" y="1" width="22" height="22" rx="0.8" />
          <path d="M3 8 L21 5 M3 13 L21 10 M3 18 L21 15 M3 22 L21 20" strokeWidth="1.4" />
        </svg>
      );

    case 'transfer':
      return (
        <svg {...common}>
          <rect x="1" y="4" width="22" height="16" rx="0.8" />
          <path d="M6 9 L9 12 L6 15 M11 9 L14 12 L11 15 M16 9 L19 12 L16 15" />
        </svg>
      );

    case 'doorgrille':
      return (
        <svg {...common}>
          <rect x="1" y="5" width="22" height="14" rx="0.8" />
          <path d="M3 9 L12 11 L21 9 M3 13 L12 15 L21 13" strokeWidth="1.4" />
        </svg>
      );

    case 'makeup':
      return (
        <svg {...common}>
          <path d="M12 22 V4 M6 10 L12 3 L18 10" strokeWidth="2.6" />
          <path d="M4 21 H8 M16 21 H20" strokeWidth="1.4" />
        </svg>
      );

    case 'accesspanel':
      return (
        <svg {...common}>
          <rect x="1" y="1" width="22" height="22" />
          <rect x="4" y="4" width="16" height="16" strokeDasharray="2.5 2" strokeWidth="1.2" />
          <path d="M4 20 L20 4" strokeWidth="1.2" />
        </svg>
      );

    case 'spigot':
      return (
        <svg {...common}>
          <rect x="1" y="3" width="22" height="6" />
          <path d="M5 9 V21 H19 V9" />
          <line x1="8" y1="15" x2="16" y2="15" strokeWidth="1.2" />
        </svg>
      );

    case 'vcd':
      return (
        <svg {...common}>
          <rect x="1" y="4" width="22" height="16" />
          <line x1="7" y1="18" x2="17" y2="6" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
        </svg>
      );

    case 'firedamper':
      return (
        <svg {...common}>
          <rect x="1" y="4" width="22" height="16" />
          <line x1="1" y1="20" x2="23" y2="4" />
          <path d="M1 4 L10 4 L1 11 Z" fill="#dc2626" stroke="#dc2626" strokeWidth="1" />
        </svg>
      );

    case 'motdamper':
      return (
        <svg {...common}>
          <rect x="1" y="4" width="22" height="16" />
          <line x1="4" y1="18" x2="14" y2="6" />
          <circle cx="18.5" cy="12" r="3.3" strokeWidth="1.4" />
          <path d="M17 13.5 V10.5 L18.5 12 L20 10.5 V13.5" strokeWidth="1" />
        </svg>
      );

    case 'backdraft':
      return (
        <svg {...common}>
          <rect x="1" y="4" width="22" height="16" />
          <path d="M5 6 L9 10 M11 6 L15 10 M17 6 L21 10" />
          <path d="M5 6 H21" strokeWidth="1" />
        </svg>
      );

    case 'flexconn':
      // Flexible canvas connection: short gap with zig-zag fabric.
      return (
        <svg {...common}>
          <line x1="1" y1="2" x2="1" y2="22" />
          <line x1="23" y1="2" x2="23" y2="22" />
          <path d="M1 2 L5 4 L9 2 L13 4 L17 2 L21 4 L23 2 M1 22 L5 20 L9 22 L13 20 L17 22 L21 20 L23 22" strokeWidth="1.2" />
          <path d="M4 7 L8 17 M10 7 L14 17 M16 7 L20 17" strokeWidth="1" />
        </svg>
      );

    case 'rafilterbox':
      // R/A filter box: casing, access panel line, pleated media and hatch.
      return (
        <svg {...common}>
          <rect x="1" y="1" width="22" height="22" />
          <rect x="3" y="3" width="18" height="15" strokeWidth="1" strokeDasharray="2 1.5" />
          <path d="M3 10.5 L5 7 L7 14 L9 7 L11 14 L13 7 L15 14 L17 7 L19 14 L21 10.5" strokeWidth="1.1" />
          <path d="M3 18 L6 3 M9 18 L12 3 M15 18 L18 3" strokeWidth="0.6" />
          {spigots ? spigotRects(spigots, 18) : <rect x="7" y="19" width="10" height="4" fill="currentColor" stroke="none" />}
        </svg>
      );

    case 'attenuator':
      return (
        <svg {...common}>
          <rect x="1" y="5" width="22" height="14" />
          <path d="M3 7 L5 9 L7 7 L9 9 L11 7 L13 9 L15 7 L17 9 L19 7 L21 9 M3 17 L5 15 L7 17 L9 15 L11 17 L13 15 L15 17 L17 15 L19 17 L21 15" strokeWidth="1" />
        </svg>
      );

    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
  }
}
