// Real unit sizes for the ducted systems in the Echo DOMESTIC costing sheet.
// Each entry: [pattern matched against the costing-sheet model name, indoor [H, W, D], outdoor [H, W, D], outdoor code (when the sheet name doesn't give it)].
// mm, H x W x D. Plan footprint = W x D. null = not published / not confirmed -> the app falls back to the series outline.
// Sources (Oct 2026): Fujitsu General AU product information pages, Daikin / Mitsubishi / ActronAir AU spec tables
// (manufacturer catalogues and Lawson Air / Mitsubishi Electric AU listings). Always check the spec sheet before fabricating.
// "~" in the note = inferred from the same chassis in the series, not stated for that exact model.

const F = {
  hs1: [400, 1050, 500], hs2: [425, 1250, 490], hs3: [360, 1400, 850],
  ms1: [240, 1000, 700], ms2: [240, 1400, 700],
  bhS700: [198, 700, 450], bhS900: [198, 900, 450], bhL700: [198, 700, 620], bhL900: [198, 900, 620],
  o18: [632, 799, 290], o12: [542, 799, 290], o24: [716, 820, 315], o30: [788, 940, 320], o45: [998, 940, 320], o60: [1418, 970, 370],
};
const D = {
  std1: [300, 1210, 900], std2: [360, 1520, 935], prem180: [470, 1200, 997], prem200: [470, 1400, 997], uf160: [400, 1505, 980],
  fba1: [245, 1000, 800], fba2: [245, 1400, 800],
  bh700: [200, 700, 450], bh900: [200, 900, 450], bh1100: [200, 1100, 450],
  oS: [595, 845, 300], oM: [990, 940, 320], oL: [1430, 940, 320], oF: [870, 1100, 460], oB25: [550, 675, 284], oB71: [695, 930, 350],
};
const M = {
  pead50: [250, 900, 732], pead71: [250, 1100, 732], pead125: [250, 1400, 732], pead140: [250, 1600, 732],
  gaa: [400, 1400, 634], haa: [380, 1405, 900], laa: [470, 1370, 1120],
  sez25: [200, 790, 700], sez50: [200, 990, 700], sez71: [200, 1190, 700],
  suz35: [550, 800, 285], suz50: [714, 800, 285], suz71: [880, 840, 330], zm71: [943, 950, 330], zm: [1338, 1050, 330],
};
const A = {
  lre71: [249, 1100, 774], lre100: [249, 1360, 774], lre125: [300, 1200, 874], lre140: [380, 1200, 625], lre170: [440, 1400, 858],
  lrc71: [673, 890, 342], lrc100: [810, 946, 410], urc: [1333, 952, 415],
  eva13: [412, 1090, 615], eva17: [435, 1420, 680], crs13: [997, 1020, 358], crs17: [1350, 1020, 358],
  evv210: [485, 1470, 695], crv210: [1025, 1685, 685],
};

export const UNIT_DIMS = [
  // ---- Fujitsu R32 high static (ARTH..KHTA / KHTB) ----
  [/ARTH24KHTA\b(?!-)/, F.hs1, F.o24, 'AOTH24KBTA'],
  [/ARTH30KHTA-HP/, F.hs1, F.o45, 'AOTH30KCTA'],
  [/ARTH36KHTA-HP/, F.hs1, F.o45, 'AOTH36KCTA'],
  [/ARTH(45|54)KHTA-HP/, F.hs2, F.o60, 'AOTH$1KCTA'],
  [/ARTH60KHTB/, F.hs3, F.o60, 'AOTH60KCTA ~'],
  [/ARTH36KHTA-3PH/, F.hs1, F.o30, 'AOTH36KRTA'],
  [/ARTH(45|54)KHTA-3PH/, F.hs2, F.o45, 'AOTH$1KRTA'],
  [/ARTH60KHTA-3PH/, F.hs2, null, 'AOTH60KRTA'],
  [/ARTH(65|72|90)KHTA-3PH/, F.hs3, F.o60, 'AOTH$1KRTA'],
  [/ARTH65KHTA/, F.hs3, null, ''],
  [/ARTH30KHTA/, F.hs1, F.o30, 'AOTH30KBTA'],
  [/ARTH36KHTA/, F.hs1, F.o30, 'AOTH36KBTA'],
  [/ARTH(45|54)KHTA/, F.hs2, F.o45, 'AOTH$1KBTA'],
  [/ARTH60KHTA/, F.hs2, F.o60, 'AOTH60KBTA'],
  // Mid static slimline (KMTAP)
  [/ARTH24KMTAP-HP/, F.ms1, null, 'AOTH24KCTA'],
  [/ARTH30KMTAP-HP/, F.ms2, F.o45, 'AOTH30KCTA ~'],
  [/ARTH18KMTAP/, F.ms1, F.o18, 'AOTH18KBTA'],
  [/ARTH24KMTAP/, F.ms1, F.o24, 'AOTH24KBTA'],
  [/ARTH30KMTAP/, F.ms2, F.o30, 'AOTH30KBTA'],
  [/ARTH36KMTAP/, F.ms2, F.o30, 'AOTH36KBTA ~'],
  [/ARTH45KMTAP/, F.ms2, F.o45, 'AOTH45KBTA'],
  [/ARTH54KMTAP/, F.ms2, F.o45, 'AOTH54KBTA ~'],
  // Bulkheads: KSLAP is the 450 mm deep one, KLLAP is 620 mm deep.
  [/ARTH(09|12)KSLAP/, F.bhS700, F.o12, 'AOTH$1KBTA'],
  [/ARTH18KSLAP/, F.bhS900, F.o18, 'AOTH18KBTA'],
  [/ARTH(09|12)KLLAP/, F.bhL700, F.o12, 'AOTH$1KBTA ~'],
  [/ARTH18KLLAP/, F.bhL900, F.o18, 'AOTH18KBTA'],
  // Old stock R410a
  [/ARTG3[06]LHTA/, F.hs1, null, ''],
  [/ARTG45LHTA\b(?!C)/, F.hs2, null, ''],
  [/ARTG65LHTA/, F.hs3, [1428, 1080, 480], 'AOTG65LRLA'],

  // ---- Daikin ----
  [/FDYAN(50|60|71)A/, D.std1, D.oS, 'RZA$1C2'],
  [/FDYAN(85|100)A/, D.std1, D.oM, 'RZA$1C2'],
  [/FDYAN(125|140|160)A/, D.std2, D.oL, 'RZA$1C2'],
  [/FDYA(71|85)A9/, D.std1, D.oM, 'RZAS$1C2'],
  [/FDYA100A9/, D.std1, D.oL, 'RZAS100C2'],
  [/FDYA(125|140|160)A9/, D.std2, D.oL, 'RZAS$1C2'],
  [/FDYA180A/, D.prem180, D.oL, 'RZAS180D ~'],
  [/FDYA200A/, D.prem200, D.oL, 'RZAS200DY1'],
  [/FDYUAN?71A/, D.std1, D.oM, ''],
  [/FDYUAN?125A/, D.std2, D.oL, ''],
  [/FDYUAN?160A/, D.uf160, D.oL, ''],
  [/FBA(50|60)BA-VC/, D.fba1, D.oS, 'RZAV$1C2'],
  [/FBA71B-VC/, D.fba1, D.oM, 'RZAV71C2'],
  [/FBA85B-VC/, D.fba2, D.oM, 'RZAV85C2'],
  [/FBA(100|125|140)B-VF/, D.fba2, D.oF, 'RZAV$1F2'],
  [/FBA71B-CC/, D.fba1, D.oS, 'RZAC71C2'],
  [/FBA85B-CC/, D.fba2, D.oM, 'RZAC85C2'],
  [/FDYBA25A/, D.bh700, D.oB25, 'RZAC25G2'],
  [/FDYBA35A/, D.bh900, D.oB25, 'RZAC35G2 ~'],
  [/FDYBA50A/, D.bh900, D.oS, 'RZAC50G2'],
  [/FDYBA60A/, D.bh1100, null, 'RZAC60G2'],
  [/FDYBA71A/, D.bh1100, D.oB71, 'RZAC71G2'],

  // ---- Mitsubishi Electric ----
  [/PEAD-M50/, M.pead50, M.suz50, 'SUZ-M50VAD'],
  [/PEAD-M71.*PUZ-ZM71/, M.pead71, M.zm71, ''],
  [/PEAD-M(60|71)/, M.pead71, M.suz71, 'SUZ-M$1VAD'],
  [/PEAD-M(100|125)/, M.pead125, M.zm, 'PUZ-ZM$1'],
  [/PEAD-M140/, M.pead140, M.zm, 'PUZ-ZM140'],
  [/PEA-M(100|125|140)Y?GAA/, M.gaa, M.zm, 'PUZ-ZM$1'],
  [/PEA-M(100|125|140|160)Y?HAA/, M.haa, M.zm, 'PUZ-ZM$1'],
  [/PEA-M(180|200|250)Y?LAA/, M.laa, null, 'PUZ-ZM$1YKA'],
  [/SEZ-M25/, M.sez25, M.suz35, 'SUZ-M25VAD'],
  [/SEZ-M35/, M.sez50, M.suz35, 'SUZ-M35VAD'],
  [/SEZ-M50/, M.sez50, M.suz50, 'SUZ-M50VAD'],
  [/SEZ-M(60|71)/, M.sez71, M.suz71, 'SUZ-M$1VAD'],

  // ---- ActronAir ----
  [/LR[EC]-?071/, A.lre71, A.lrc71, ''],
  [/LR[EC]-?100|URC-?100/, A.lre100, A.lrc100, ''],
  [/URC-?125|LRE-?125/, A.lre125, A.urc, ''],
  [/URC-?140|LRE-?140/, A.lre140, A.urc, ''],
  [/LR[EC]-?170/, A.lre170, A.urc, ''],
  [/CRS13A[ST]/, A.eva13, A.crs13, ''],
  [/CRS17A[ST]/, A.eva17, A.crs17, ''],
  [/CRV210T/, A.evv210, A.crv210, '~'],
  // Advance B (ActronAir Advance brochure, 2026). 19-25 sizes read from a shared table row ~
  [/EVV13BS/, A.eva13, [1110, 1365, 530], ''],
  [/EVV15BS/, [412, 1290, 615], [1110, 1365, 530], ''],
  [/EVV17BS/, A.eva17, [1110, 1365, 530], ''],
  [/EVV19BS/, [485, 1470, 645], [1343, 1641, 530], '~'],
  [/EVV2[25]BS/, [485, 1570, 695], [1343, 1641, 530], '~'],
  // Aires 15 shares the Advance 15 indoor chassis ~
  [/EVA15AS/, [412, 1290, 615], null, '~'],
];

// Dims for a costing-sheet model name: { indoor: {h,w,d}|null, outdoor: {h,w,d}|null, outdoorCode }.
export function unitDims(model) {
  const m = String(model || '');
  if (!m) return null;
  // First matching line wins (specific models are listed before their series).
  for (const [re, i, o, c] of UNIT_DIMS) {
    const hit = m.match(re);
    if (!hit) continue;
    const box = (v) => (v ? { h: v[0], w: v[1], d: v[2] } : null);
    return { indoor: box(i), outdoor: box(o), outdoorCode: (c || '').replace('$1', hit[1] || '').replace(/\s*~/, '') };
  }
  return null;
}
