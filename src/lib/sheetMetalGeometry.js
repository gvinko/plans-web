export function sheetMetalLayout(P, { width, bend, bendR }, mm) {
  const W = width * mm;
  const n = P.length;
  const lens = [];
  const us = [];
  for (let i = 0; i < n - 1; i += 1) {
    const L = Math.hypot(P[i + 1].x - P[i].x, P[i + 1].y - P[i].y);
    lens.push(L);
    us.push(L ? { x: (P[i + 1].x - P[i].x) / L, y: (P[i + 1].y - P[i].y) / L } : { x: 1, y: 0 });
  }
  const cut = new Array(n).fill(0);
  const bends = [];
  const k = Number(bendR) || 1;
  for (let i = 1; i < n - 1; i += 1) {
    if (lens[i - 1] < 1e-6 || lens[i] < 1e-6) continue;
    const u1 = us[i - 1];
    const u2 = us[i];
    const deg = (Math.acos(Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y))) * 180) / Math.PI;
    if (deg < 10) continue;
    const b = { i, v: P[i], u1, u2, deg, radius: false, requestedRadius: bend === "radius" ? k * W : null };
    if (bend === "radius" && deg < 170 && Math.min(k * W, lens[i - 1] / 2 / Math.tan(deg * Math.PI / 360), lens[i] / 2 / Math.tan(deg * Math.PI / 360)) > W / 2) {
      const tanH = Math.tan((deg * Math.PI) / 360);
      const tl = Math.min(k * W * tanH, lens[i - 1] / 2, lens[i] / 2);
      const R = tl / tanH;
      const cross = u1.x * u2.y - u1.y * u2.x;
      const nT = cross > 0 ? { x: -u1.y, y: u1.x } : { x: u1.y, y: -u1.x };
      const st = { x: P[i].x - u1.x * tl, y: P[i].y - u1.y * tl };
      const en = { x: P[i].x + u2.x * tl, y: P[i].y + u2.y * tl };
      Object.assign(b, { radius: true, R, tl, st, en, c: { x: st.x + nT.x * R, y: st.y + nT.y * R }, sweep: cross > 0 ? 1 : 0 });
      cut[i] = tl;
    } else {
      const tl = Math.min(W / 2, lens[i - 1] / 3, lens[i] / 3);
      Object.assign(b, { tl, st: { x: P[i].x - u1.x * tl, y: P[i].y - u1.y * tl }, en: { x: P[i].x + u2.x * tl, y: P[i].y + u2.y * tl } });
      cut[i] = tl;
    }
    bends.push(b);
  }
  let d = n ? `M${P[0].x},${P[0].y}` : '';
  for (let i = 1; i < n - 1; i += 1) {
    const b = bends.find((x) => x.i === i);
    d += b?.radius ? ` L${b.st.x},${b.st.y} A${b.R},${b.R} 0 0 ${b.sweep} ${b.en.x},${b.en.y}` : ` L${P[i].x},${P[i].y}`;
  }
  if (n > 1) d += ` L${P[n - 1].x},${P[n - 1].y}`;
  const segs = lens.map((L, i) => ({ a: P[i], u: us[i], from: cut[i], to: L - cut[i + 1] }));
  const length = segs.reduce((sum, g) => sum + Math.max(0, g.to - g.from), 0) + bends.reduce((sum, b) => sum + (b.radius ? b.R * b.deg * Math.PI / 180 : 2 * b.tl), 0);
  return { d, bends, segs, W, length };
}

