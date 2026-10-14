/* Logica di calcolo del Diet Plan, portata 1:1 da public/diet-app/index.html
   (Diet//Plan v2.1). Tutte le formule sono invariate rispetto all'originale,
   tranne un cambiamento comportamentale deliberato segnalato con "FIX" qui sotto. */

export type Sex = '' | 'male' | 'female';
export type Goal = '' | 'cut' | 'bulk' | 'reverse_diet' | 'skinny_fat' | 'maintenance';
export type ApproachKey = 'conservative' | 'moderate' | 'aggressive';
export type TdeeMethod = 'media' | 'muller' | 'aragon';
export type ReverseTargetBand = 'normale' | 'sopra';
export type ProteinPresetKey = 'standard' | 'high' | 'very_high' | 'custom';

export interface ActivePlan {
  calories: number;
  maintenance: number;
  deficitKcal: number;
  deficitPct: number | null;
  proteinG: number;
  carbsG: number;
  fatsG: number;
  lbm: number | null;
}

export interface PianoBase {
  sex: Sex;
  age: number; // derivato da birthDate (vedi computeAge) — non più inserito a mano
  birthDate: string; // YYYY-MM-DD
  height: number;
  weight: string;
  bodyFat: string;
  goal: Goal;
  measuredMaintenance: string;
  lifestyleFactor: number;
  exerciseFactor: number;
  proteinPerKgLBM: number;
  carbPercentOfRemaining: number;
  approachKey: ApproachKey;
  tdeeMethod: TdeeMethod;
  measureWaist: string;
  // Pliche cutanee (mm) per la stima Jackson-Pollock: 3 siti = pettorale/addome
  // (standard uomo) o tricipite/sovrailiaca (standard donna, o "fianchi" per
  // un uomo con preferJp3Hip); 7 siti (computeJP7BodyFat, autoselezionato
  // quando tutti compilati) = tutti e 7 insieme. Coscia comune a ogni set.
  measureChest: string;
  measureAbdomen: string;
  measureTricep: string;
  measureSuprailiac: string;
  measureThigh: string;
  measureSubscapular: string;
  measureMidaxillary: string;
  /** Uomo con distribuzione ginoide del grasso: preferisci il set "fianchi"
   *  (tricipite+sovrailiaca) al set standard (petto+addome) per il 3 punti,
   *  quando entrambi sono compilati. Nessun effetto sul 7 punti. */
  preferJp3Hip: boolean;
  sfPhase: number;
  sfDeficitPct: number;
  sfTargetBF: number;
  savedAt: string;
  reverseTargetBand: ReverseTargetBand;
  reverseProteinPreset: ProteinPresetKey;
  reverseTargetCpk: number | null;
  activePlan?: ActivePlan;
  cutLossRate: number;
  cutTargetBF: number;
  refeedEnabled: boolean;
  refeedDays: number;
  refeedSurplus: number;
  dietBreakEnabled: boolean;
  dbDeficitWeeks: number;
  dbBreakWeeks: number;
  dbCurrentCycleWeek: number;
  /** Bulk (e SF fase 3): surplus sul mantenimento, 5–10%. */
  bulkSurplusPct: number;
  /** Criteri di fine bulk, entrambi opzionali ('' = disattivato), al primo raggiunto si ferma. */
  bulkMaxBF: string;
  bulkTargetWeight: string;
  /** Durata consigliata del Mantenimento prima di proporre Cut o Bulk. */
  maintenanceWeeks: number;
  /** ISO di inizio della fase corrente; delimita lo storico che i check guardano. */
  phaseStartedAt: string;
  /** Mantenimento di riferimento della fase (kcal), impostato da buildTransition; null → stima a formula. */
  phaseMaintenanceKcal: number | null;
}

export interface DietCheckEntry {
  date: string;
  weeksPassed: number;
  isBaseline?: boolean;
  weeklyAvgWeight: string;
  checkBodyFat: string;
  weeklyMeasureWaist: string;
  /** Circonferenze opzionali, in cm — puramente informative, non entrano nei calcoli. */
  weeklyMeasureHips?: string;
  weeklyMeasureChest?: string;
  weeklyMeasureArm?: string;
  weeklyMeasureThigh?: string;
  /** Attività a piedi della settimana (cap.8 Reverse Dieting Guide — step-count
   *  method, proxy di NEAT + cardio intenzionale). Puramente informativo, non
   *  entra nei calcoli: numero libero (km o passi, a scelta) + unità scelta. */
  weeklyWalkAmount?: string;
  weeklyWalkUnit?: 'km' | 'passi';
  weeklySkinfoldChest: string;
  weeklySkinfoldAbdomen: string;
  weeklySkinfoldTricep: string;
  weeklySkinfoldSuprailiac: string;
  weeklySkinfoldThigh: string;
  /** Opzionali: compilate insieme alle altre 5 pliche abilitano il 7 punti. */
  weeklySkinfoldSubscapular?: string;
  weeklySkinfoldMidaxillary?: string;
  dayWeights: string[];
  currentCalories: number | null;
  goal: Goal;
  approachKey: ApproachKey;
  reverseTargetBand: ReverseTargetBand;
  sfPhase: number;
  sfTargetBF?: number;
  sfDeficitPct?: number;
  cutLossRate: number;
  cutTargetBF: number;
  dbCurrentCycleWeek: number;
  subjEnergy: number;
  subjHunger: number;
  subjMood: number;
  subjSleep: number;
  subjStrength: number;
}

/* ── Costanti ─────────────────────────────────────────────────────────── */

export const APPROACHES: Record<ApproachKey, { label: string; startOffset: number; weeklyAllowedGainPct: number; calIncreasePct: [number, number] }> = {
  conservative: { label: 'Conservativo', startOffset: 0.00, weeklyAllowedGainPct: 0.002, calIncreasePct: [0.01, 0.03] },
  moderate:     { label: 'Moderato',     startOffset: 0.10, weeklyAllowedGainPct: 0.005, calIncreasePct: [0.03, 0.06] },
  aggressive:   { label: 'Aggressivo',   startOffset: 0.20, weeklyAllowedGainPct: 0.008, calIncreasePct: [0.06, 0.09] },
};

export const REVERSE_TARGETS: Record<ReverseTargetBand, { label: string }> = {
  normale: { label: 'Normale' },
  sopra: { label: 'Sopra normale' },
};

export const PROTEIN_PRESETS: Record<Exclude<ProteinPresetKey, 'custom'>, { label: string; value: number }> = {
  standard: { label: 'Standard', value: 1.8 },
  high: { label: 'Alto', value: 2.2 },
  very_high: { label: 'Molto alto', value: 2.8 },
};

export const SF_PHASES: Record<number, { label: string; sub: string; dur: string; obj: string }> = {
  1: { label: 'Fase 1 — Cut', sub: 'Ricondizionamento e Definizione', dur: '12–16 settimane',
       obj: 'Bruciare grasso ostinato, migliorare sensibilità insulinica, proteggere la massa magra.' },
  2: { label: 'Fase 2 — Reverse', sub: 'Stabilizzazione Metabolica', dur: '4–8 settimane',
       obj: 'Ripristinare il metabolismo, stabilizzare il peso, ribilanciare leptina e ormoni.' },
  3: { label: 'Fase 3 — Clean Bulk', sub: 'Costruzione Controllata', dur: 'Ciclica, a lungo termine',
       obj: 'Costruire massa muscolare minimizzando il grasso. Focus su sovraccarico progressivo.' },
};

/* ── Utils ────────────────────────────────────────────────────────────── */

export const round = (n: number | null | undefined, d = 0): number | null => {
  if (typeof n !== 'number' || isNaN(n)) return null;
  return Math.round(n * Math.pow(10, d)) / Math.pow(10, d);
};

export const toNum = (v: unknown): number | null => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
};

/** Età in anni compiuti a `todayStr`, calcolata da una data di nascita YYYY-MM-DD. */
export function computeAge(birthDate: string, todayStr: string): number | null {
  const bMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate ?? '');
  const tMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(todayStr ?? '');
  if (!bMatch || !tMatch) return null;
  const [, by, bm, bd] = bMatch.map(Number);
  const [, ty, tm, td] = tMatch.map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age--;
  return age >= 0 ? age : null;
}

export const normalizeBodyFatPercent = (v: unknown): number | null => {
  const bf = toNum(v);
  if (bf === null) return null;
  return bf > 0 && bf < 1 ? bf * 100 : bf;
};

export const normalizeBodyFatInput = (v: unknown): string => {
  const bf = normalizeBodyFatPercent(v);
  return bf === null ? '' : String(round(bf, 2));
};

export const computeAF = (pb: PianoBase): number =>
  Math.round((Number(pb.lifestyleFactor) + Number(pb.exerciseFactor)) * 100) / 100;

export const isSF = (pb: PianoBase): boolean => pb.goal === 'skinny_fat';
export const isReverse = (pb: PianoBase): boolean => pb.goal === 'reverse_diet';
export const isCut = (pb: PianoBase): boolean => pb.goal === 'cut';
export const isBulk = (pb: PianoBase): boolean => pb.goal === 'bulk';
export const isMaintenance = (pb: PianoBase): boolean => pb.goal === 'maintenance';

/** Mantenimento di riferimento della fase: quello fissato dalla transizione, altrimenti la stima. */
export const getMaintenanceRef = (pb: PianoBase): number =>
  pb.phaseMaintenanceKcal != null && pb.phaseMaintenanceKcal > 0 ? pb.phaseMaintenanceKcal : estimateMaintenance(pb).maintenance;

/* ── Fasi ─────────────────────────────────────────────────────────────────
   Il ciclo Cut → Reverse → Bulk → Mantenimento può ripassare più volte per lo
   stesso obiettivo: i check settimanali guardano solo le entry della fase in
   corso, altrimenti il peso della fase precedente diventerebbe la "settimana
   scorsa" della nuova. `storico` è ordinato dal più recente al meno recente. */

function leadingBlock(goal: Goal, storico: DietCheckEntry[]): DietCheckEntry[] {
  const out: DietCheckEntry[] = [];
  for (const e of storico) { if (e.goal !== goal) break; out.push(e); }
  return out;
}

export function getPhaseStorico(pb: PianoBase, storico: DietCheckEntry[]): DietCheckEntry[] {
  if (!pb.phaseStartedAt) return leadingBlock(pb.goal, storico);
  const t0 = new Date(pb.phaseStartedAt).getTime();
  return storico.filter(e => e.goal === pb.goal && new Date(e.date).getTime() >= t0);
}

/** Kcal correnti da caricare: l'ultima entry della fase in corso (mai quella di un altro obiettivo). */
export function currentKcalForPhase(pb: PianoBase, storico: DietCheckEntry[]): number | null {
  const e = getPhaseStorico(pb, storico)[0];
  return e ? toNum(e.currentCalories) : null;
}

/** Piano da dati salvati (caricamento, ripristino da backup): default dei campi aggiunti dopo il salvataggio e inizio fase ricavato dallo storico. */
export function hydratePianoBase(raw: Partial<PianoBase> | null | undefined, storico: DietCheckEntry[]): PianoBase {
  const pb: PianoBase = { ...defaultPianoBase(), ...(raw || {}) };
  pb.phaseStartedAt = resolvePhaseStart(pb, storico);
  return pb;
}

export function resolvePhaseStart(pb: PianoBase, storico: DietCheckEntry[]): string {
  if (pb.phaseStartedAt) return pb.phaseStartedAt;
  const block = leadingBlock(pb.goal, storico);
  return block.length ? block[block.length - 1].date : '';
}

/* ── Tabella LBM di mantenimento (guida sez.9) ───────────────────────────
   4 fasce in base ad Activity Factor (soglia 1.5) ed età (soglia 40 anni),
   ciascuna con range kcal/kg LBM per sotto/normale/sopra normale. */

export interface LBMTable {
  af: string;
  age: string;
  sotto: [number, number];
  normale: [number, number];
  sopra: [number, number];
}

export function getLBMTable(pb: PianoBase): LBMTable {
  const AF = computeAF(pb);
  const aN = toNum(pb.age) ?? 30;
  const highAF = AF >= 1.5, over40 = aN > 40;
  if (!highAF && !over40) return { af: '< 1.5', age: '18–40', sotto: [25, 35], normale: [35, 45], sopra: [45, 55] };
  if (!highAF && over40)  return { af: '< 1.5', age: '40–60', sotto: [22, 32], normale: [32, 42], sopra: [42, 52] };
  if (highAF && !over40)  return { af: '≥ 1.5', age: '18–40', sotto: [28, 38], normale: [38, 48], sopra: [48, 58] };
  return                         { af: '≥ 1.5', age: '40–60', sotto: [25, 35], normale: [35, 45], sopra: [45, 55] };
}

export function getLBMRange(pb: PianoBase, table: LBMTable, band: 'sotto' | 'normale' | 'sopra'): { min: number | null; max: number | null } {
  const lbm = computeLBM(pb);
  if (!lbm) return { min: null, max: null };
  return { min: Math.round(table[band][0] * lbm), max: Math.round(table[band][1] * lbm) };
}

export type LBMBand = 'molto_basso' | 'sotto' | 'normale' | 'sopra' | 'molto_alto';

export function getCurrentBand(table: LBMTable, cpk: number | null): LBMBand | null {
  if (cpk === null) return null;
  if (cpk < table.sotto[0]) return 'molto_basso';
  if (cpk < table.normale[0]) return 'sotto';
  if (cpk <= table.normale[1]) return 'normale';
  if (cpk <= table.sopra[1]) return 'sopra';
  return 'molto_alto';
}

/* ── BMR / TDEE ───────────────────────────────────────────────────────── */

export const aragonBMR = (lbm: number | null): number | null => (lbm && !isNaN(lbm) ? 25.3 * lbm : null);

export const mullerBMR = (ffm: number | null, fm: number | null, aN: number | null, sexV: number): number | null => {
  if (ffm == null || fm == null || aN == null || isNaN(ffm) || isNaN(fm) || isNaN(aN)) return null;
  return 13.587 * ffm + 9.613 * fm - 3.351 * aN + 674 + 198 * sexV;
};

export const mifflinBMR = (sexV: Sex, w: number | null, h: number | null, a: number | null): number | null => {
  if (!sexV || !w || !h || !a) return null;
  return sexV === 'male' ? 10 * w + 6.25 * h - 5 * a + 5 : 10 * w + 6.25 * h - 5 * a - 161;
};

export interface FormulaTDEE {
  tdee: number;
  method: string | null;
  estimates: { tdeeAragon?: number; tdeeMuller?: number; tdeeMifflin?: number };
  AF: number;
  lbm: number | null;
}

export function computeFormulaTDEE(pb: PianoBase): FormulaTDEE {
  const wN = toNum(pb.weight), hN = toNum(pb.height), aN = toNum(pb.age), bfN = normalizeBodyFatPercent(pb.bodyFat);
  const AF = computeAF(pb), sexV = pb.sex === 'male' ? 1 : 0;
  if (!wN || !hN || !aN || !bfN) return { tdee: 0, method: null, estimates: {}, AF, lbm: null };
  const lbm = wN * (1 - bfN / 100), fm = wN * (bfN / 100);
  const est: FormulaTDEE['estimates'] = {};
  const bmrA = aragonBMR(lbm), bmrM = mullerBMR(lbm, fm, aN, sexV);
  if (bmrA != null) est.tdeeAragon = Math.round(bmrA * AF);
  if (bmrM != null && !isNaN(bmrM)) est.tdeeMuller = Math.round(bmrM * AF);
  let tdee = 0, method: string | null = null;
  if (pb.tdeeMethod === 'muller' && est.tdeeMuller) { tdee = est.tdeeMuller; method = 'Müller'; }
  else if (pb.tdeeMethod === 'aragon' && est.tdeeAragon) { tdee = est.tdeeAragon; method = 'Aragon'; }
  else if (pb.tdeeMethod === 'media' && est.tdeeAragon && est.tdeeMuller) { tdee = Math.round((est.tdeeAragon + est.tdeeMuller) / 2); method = 'Media (A+M)'; }
  else {
    const b = mifflinBMR(pb.sex, wN, hN, aN);
    if (b != null) { tdee = Math.round(b * AF); method = 'Mifflin (fallback)'; est.tdeeMifflin = tdee; }
  }
  return { tdee, method, estimates: est, AF, lbm };
}

export interface Maintenance {
  method: string;
  maintenance: number;
  AF: number;
  estimates: FormulaTDEE['estimates'];
  lbm: number | null;
}

export function estimateMaintenance(pb: PianoBase): Maintenance {
  const mN = toNum(pb.measuredMaintenance);
  if (mN && mN > 0) return { method: 'misurato', maintenance: Math.round(mN), AF: computeAF(pb), estimates: { measured: Math.round(mN) } as never, lbm: computeLBM(pb) };
  const f = computeFormulaTDEE(pb);
  return { method: f.method || 'formula', maintenance: Math.round(f.tdee || 0), AF: f.AF, estimates: f.estimates, lbm: f.lbm };
}

export function computeLBM(pb: PianoBase): number | null {
  const wN = toNum(pb.weight), bfN = normalizeBodyFatPercent(pb.bodyFat);
  return wN && bfN && bfN > 0 ? wN * (1 - bfN / 100) : null;
}

/* ── Jackson-Pollock 3 pliche ─────────────────────────────────────────
   Siti diversi per sesso: uomo = pettorale+addome+coscia, donna =
   tricipite+sovrailiaca+coscia (coscia comune a entrambi i protocolli).
   Densità corporea (Jackson & Pollock 1978/1985) → BF% via equazione di Siri. */

export interface JP3Sites { chest?: string; abdomen?: string; tricep?: string; suprailiac?: string; thigh?: string }

// Densità corporea per un dato set di 3 pliche — separata dalla scelta di
// QUALE set usare (vedi computeJP3BodyFat sotto), perché quella scelta non
// dipende solo dal sesso anagrafico: un uomo con distribuzione ginoide del
// grasso (fianchi) può scegliere deliberatamente l'equazione validata sulle
// donne (tricipite+sovrailiaca+coscia) come approssimazione più realistica
// della sua composizione corporea rispetto allo standard petto+addome+coscia.
function jp3Density(protocol: 'std' | 'hip', age: number, sum: number): number {
  return protocol === 'std'
    ? 1.10938 - 0.0008267 * sum + 0.0000016 * sum * sum - 0.0002574 * age
    : 1.0994921 - 0.0009929 * sum + 0.0000023 * sum * sum - 0.0001392 * age;
}

/** `preferHip`: se sia il set standard (petto+addome) sia quello fianchi
 *  (tricipite+sovrailiaca) sono compilati, usa il set fianchi invece dello
 *  standard. Per le donne il set fianchi resta l'unico usato, come sempre. */
export function computeJP3BodyFat(sex: Sex, age: number, sites: JP3Sites, preferHip?: boolean): number | null {
  const aN = toNum(age);
  const thigh = toNum(sites.thigh);
  if (!aN || aN <= 0 || thigh == null) return null;
  const chest = toNum(sites.chest), abdomen = toNum(sites.abdomen);
  const tricep = toNum(sites.tricep), suprailiac = toNum(sites.suprailiac);
  const hasStd = chest != null && abdomen != null;
  const hasHip = tricep != null && suprailiac != null;

  let protocol: 'std' | 'hip' | null = null, sum = 0;
  if (sex === 'female') {
    if (!hasHip) return null;
    protocol = 'hip'; sum = tricep! + suprailiac! + thigh;
  } else if (sex === 'male') {
    if (preferHip && hasHip) { protocol = 'hip'; sum = tricep! + suprailiac! + thigh; }
    else if (hasStd) { protocol = 'std'; sum = chest! + abdomen! + thigh; }
    else if (hasHip) { protocol = 'hip'; sum = tricep! + suprailiac! + thigh; }
    else return null;
  } else return null;

  const bd = jp3Density(protocol, aN, sum);
  if (!bd || bd <= 0) return null;
  return round((495 / bd) - 450, 1);
}

/** Quale set di pliche ha effettivamente usato l'ultima chiamata a
 *  computeJP3BodyFat con questi stessi argomenti — solo per mostrarlo in UI. */
export function jp3ProtocolUsed(sex: Sex, sites: JP3Sites, preferHip?: boolean): 'std' | 'hip' | null {
  const hasStd = toNum(sites.chest) != null && toNum(sites.abdomen) != null;
  const hasHip = toNum(sites.tricep) != null && toNum(sites.suprailiac) != null && toNum(sites.thigh) != null;
  if (sex === 'female') return hasHip ? 'hip' : null;
  if (sex === 'male') {
    if (preferHip && hasHip) return 'hip';
    if (hasStd && toNum(sites.thigh) != null) return 'std';
    if (hasHip) return 'hip';
  }
  return null;
}

export interface JP7Sites extends JP3Sites { subscapular?: string; midaxillary?: string }

/* 7 siti (Jackson & Pollock 1978): petto, addome, coscia, tricipite,
   sovrailiaca, sottoscapolare, ascellare (midaxillary) — stessa equazione di
   densità/Siri del 3 punti, coefficienti diversi. Include sempre la
   sovrailiaca: a differenza del 3 punti standard maschile (che non la usa
   affatto), qui il grasso sui fianchi pesa comunque nel risultato anche senza
   dover scegliere il set "fianchi" del 3 punti. */
export function computeJP7BodyFat(sex: Sex, age: number, sites: JP7Sites): number | null {
  const aN = toNum(age);
  const chest = toNum(sites.chest), abdomen = toNum(sites.abdomen), thigh = toNum(sites.thigh);
  const tricep = toNum(sites.tricep), suprailiac = toNum(sites.suprailiac);
  const subscapular = toNum(sites.subscapular), midaxillary = toNum(sites.midaxillary);
  if (!aN || aN <= 0) return null;
  if (sex !== 'male' && sex !== 'female') return null;
  if ([chest, abdomen, thigh, tricep, suprailiac, subscapular, midaxillary].some(v => v == null)) return null;
  const sum = chest! + abdomen! + thigh! + tricep! + suprailiac! + subscapular! + midaxillary!;
  const bd = sex === 'female'
    ? 1.097 - 0.00046971 * sum + 0.00000056 * sum * sum - 0.00012828 * aN
    : 1.112 - 0.00043499 * sum + 0.00000055 * sum * sum - 0.00028826 * aN;
  if (!bd || bd <= 0) return null;
  return round((495 / bd) - 450, 1);
}

export interface SkinfoldBFResult { bf: number | null; protocol: '7pt' | '3pt_std' | '3pt_hip' | null }

/** Sceglie automaticamente la stima migliore disponibile: 7 punti se tutti e
 *  7 i siti sono compilati, altrimenti il 3 punti (con preferHip a scegliere
 *  quale set usare se sono compilati entrambi). */
export function computeBodyFatSkinfold(sex: Sex, age: number, sites: JP7Sites, preferHip?: boolean): SkinfoldBFResult {
  const jp7 = computeJP7BodyFat(sex, age, sites);
  if (jp7 != null) return { bf: jp7, protocol: '7pt' };
  const jp3 = computeJP3BodyFat(sex, age, sites, preferHip);
  if (jp3 == null) return { bf: null, protocol: null };
  const used = jp3ProtocolUsed(sex, sites, preferHip);
  return { bf: jp3, protocol: used === 'hip' ? '3pt_hip' : '3pt_std' };
}

/* "Current" getters — preferiscono l'ultimo check settimanale (form vivo)
   rispetto al baseline immutabile, che resta l'ancora di partenza per le
   barre di progresso. */

export function getCurrentBF(pb: PianoBase, checkBodyFat: string): number | null {
  const checkBF = normalizeBodyFatPercent(checkBodyFat);
  if (checkBF != null && checkBF > 0) return checkBF;
  return normalizeBodyFatPercent(pb.bodyFat);
}

export function getCurrentWeight(pb: PianoBase, weeklyAvgWeight: string): number | null {
  const cw = toNum(weeklyAvgWeight);
  if (cw != null && cw > 0) return cw;
  return toNum(pb.weight);
}

export function getCurrentLBM(pb: PianoBase, weeklyAvgWeight: string, checkBodyFat: string): number | null {
  const w = getCurrentWeight(pb, weeklyAvgWeight), bf = getCurrentBF(pb, checkBodyFat);
  return w && bf && bf > 0 ? round(w * (1 - bf / 100), 2) : computeLBM(pb);
}

/* ── Macro ────────────────────────────────────────────────────────────── */

export interface Macros { proteinG: number; proteinK: number; carbsG: number; carbsK: number; fatsG: number; fatsK: number }

// `currentLBM`, quando presente, riflette peso/BF% attuali (getCurrentLBM) e
// non solo quelli del Piano Base impostati una volta all'inizio — altrimenti
// le grammature di macro restano ancorate al peso di partenza per mesi di
// cut, anche mentre la massa magra reale cambia.
export function computeMacros(pb: PianoBase, kcal: number, currentLBM?: number | null): Macros {
  const lbm = currentLBM ?? computeLBM(pb), wN = toNum(pb.weight) || 0;
  const base = lbm || wN;
  const proteinG = Math.round(pb.proteinPerKgLBM * base);
  const proteinK = proteinG * 4, rem = Math.max(0, kcal - proteinK);
  const carbsG = Math.round((rem * pb.carbPercentOfRemaining) / 4), carbsK = carbsG * 4;
  const fatsG = Math.round((rem - carbsK) / 9), fatsK = fatsG * 9;
  return { proteinG, proteinK, carbsG, carbsK, fatsG, fatsK };
}

export function syncReverseProteinPresetFromValue(proteinPerKgLBM: number): ProteinPresetKey {
  const v = round(Number(proteinPerKgLBM), 1);
  const hit = (Object.entries(PROTEIN_PRESETS) as [Exclude<ProteinPresetKey, 'custom'>, { value: number }][])
    .find(([, preset]) => Math.abs(preset.value - (v ?? 0)) < 1e-6);
  return hit ? hit[0] : 'custom';
}

/* ── Reverse Diet target ──────────────────────────────────────────────── */

export interface ReverseTargetMeta {
  band: ReverseTargetBand;
  label: string;
  kgMin: number;
  kgMax: number;
  targetCpk: number;
  lbm: number | null;
  rangeKcal: { min: number | null; max: number | null };
  targetKcal: number | null;
  table: LBMTable;
}

export function getReverseTargetMeta(pb: PianoBase): ReverseTargetMeta {
  const table = getLBMTable(pb);
  const band: ReverseTargetBand = pb.reverseTargetBand === 'sopra' ? 'sopra' : 'normale';
  const label = REVERSE_TARGETS[band].label;
  const kgMin = table[band][0], kgMax = table[band][1];
  const targetCpk = pb.reverseTargetCpk != null ? pb.reverseTargetCpk : (round((kgMin + kgMax) / 2, 1) ?? kgMin);
  const lbm = computeLBM(pb);
  const rangeKcal = lbm ? getLBMRange(pb, table, band) : { min: null, max: null };
  const targetKcal = lbm ? Math.round(targetCpk * lbm) : null;
  return { band, label, kgMin, kgMax, targetCpk, lbm, rangeKcal, targetKcal, table };
}

export function getReverseStartWarning(pb: PianoBase, startKcal: number | null): string {
  if (!isReverse(pb)) return '';
  const meta = getReverseTargetMeta(pb);
  if (!meta.targetKcal || startKcal == null) return '';
  const approach = APPROACHES[pb.approachKey] || APPROACHES.conservative;
  if (meta.rangeKcal.max != null && startKcal > meta.rangeKcal.max) {
    return `${approach.label}: partenza già sopra il range target ${meta.label} (${meta.rangeKcal.min}–${meta.rangeKcal.max} kcal). Valuta un offset più basso o un target diverso.`;
  }
  if (meta.rangeKcal.min != null && startKcal >= meta.rangeKcal.min) {
    return `${approach.label}: partenza già dentro il range target ${meta.label} (${meta.rangeKcal.min}–${meta.rangeKcal.max} kcal). L'offset potrebbe essere troppo aggressivo.`;
  }
  return '';
}

export function getTrackedStartCalories(pb: PianoBase, storico: DietCheckEntry[]): number | null {
  const match = storico.find(e => {
    if (isReverse(pb)) return e.goal === 'reverse_diet';
    if (isSF(pb)) return e.goal === 'skinny_fat' && Number(e.sfPhase) === Number(pb.sfPhase);
    return false;
  });
  return match ? toNum(match.currentCalories) : null;
}

export function getProgressStartCalories(pb: PianoBase, storico: DietCheckEntry[], fallback: number): number {
  return getTrackedStartCalories(pb, storico) ?? fallback;
}

/* ── Calorie iniziali per obiettivo ───────────────────────────────────── */

export interface InitialStartCalories {
  mObj: Maintenance;
  maintenance: number;
  startCalories: number;
  startLabel: string;
}

export function computeInitialStartCalories(pb: PianoBase): InitialStartCalories {
  const mObj = estimateMaintenance(pb), m = mObj.maintenance || 0;
  let sc = m, label = '—';
  if (isSF(pb)) {
    if (pb.sfPhase === 1) { sc = Math.round(m * (1 - pb.sfDeficitPct / 100)); label = `SF Fase 1 — deficit −${pb.sfDeficitPct}%`; }
    else if (pb.sfPhase === 2) { sc = m; label = 'SF Fase 2 — mantenimento (reverse inizia qui)'; }
    else { sc = Math.round(getMaintenanceRef(pb) * (1 + pb.bulkSurplusPct / 100)); label = `SF Fase 3 — surplus +${pb.bulkSurplusPct}%`; }
  } else if (isReverse(pb)) {
    const ap = APPROACHES[pb.approachKey] || APPROACHES.conservative;
    sc = Math.round(m * (1 + ap.startOffset));
    label = `Reverse Diet — ${ap.label} (offset +${Math.round(ap.startOffset * 100)}%)`;
  } else if (isBulk(pb)) {
    sc = Math.round(getMaintenanceRef(pb) * (1 + pb.bulkSurplusPct / 100));
    label = `Bulk — surplus +${pb.bulkSurplusPct}%`;
  } else if (isMaintenance(pb)) {
    sc = getMaintenanceRef(pb); label = 'Mantenimento';
  } else if (isCut(pb)) {
    const wN = toNum(pb.weight) || 0;
    const dailyDeficit = Math.round((wN * pb.cutLossRate / 100 * 7700) / 7);
    const deficitKcal = Math.max(1000, getMaintenanceRef(pb) - dailyDeficit);
    if (pb.dietBreakEnabled) {
      const { inBreak } = computeDietBreakPhase(pb);
      if (inBreak) { sc = getMaintenanceRef(pb); label = `Cut — PAUSA DIETA · mantenimento ${sc} kcal`; }
      else { sc = deficitKcal; label = `Cut — −${pb.cutLossRate}%/sett · deficit −${dailyDeficit} kcal/die`; }
    } else {
      sc = deficitKcal;
      label = `Cut — −${pb.cutLossRate}%/sett · deficit −${dailyDeficit} kcal/die`;
    }
  } else {
    sc = m; label = `${pb.goal || '—'} — piano non ancora implementato`;
  }
  return { mObj, maintenance: m, startCalories: sc, startLabel: label };
}

export function getActiveCalories(pb: PianoBase, currentCalories: number | null): number {
  return currentCalories !== null ? currentCalories : computeInitialStartCalories(pb).startCalories;
}

/* ── Refeed / Diet break ──────────────────────────────────────────────── */

export function computeRefeedSplit(pb: PianoBase, baseKcal: number) {
  const rDays = Math.min(2, Math.max(1, pb.refeedDays));
  const nDays = 7 - rDays;
  const refeedKcal = Math.round(baseKcal + pb.refeedSurplus);
  const normalKcal = Math.round((7 * baseKcal - rDays * refeedKcal) / nDays);
  return { normalKcal, refeedKcal, normalDays: nDays, refeedDays: rDays };
}

export function computeDietBreakPhase(pb: PianoBase) {
  const cycleLen = pb.dbDeficitWeeks + pb.dbBreakWeeks;
  const posInCycle = ((pb.dbCurrentCycleWeek - 1) % cycleLen) + 1;
  const inBreak = posInCycle > pb.dbDeficitWeeks;
  return { inBreak, posInCycle, deficitWeeks: pb.dbDeficitWeeks, breakWeeks: pb.dbBreakWeeks, cycleLen };
}

/* ── Plausibilità / validazione ───────────────────────────────────────── */

export function checkPlausibility(pb: PianoBase): string[] {
  const wN = toNum(pb.weight), hN = toNum(pb.height), bfN = normalizeBodyFatPercent(pb.bodyFat), aN = toNum(pb.age);
  const warns: string[] = [];
  if (wN && hN) {
    const bmi = wN / ((hN / 100) ** 2);
    if (bmi < 15) warns.push(`BMI ${round(bmi, 1)} — peso molto basso.`);
    if (bmi > 55) warns.push(`BMI ${round(bmi, 1)} — combinazione insolita.`);
  }
  if (bfN) {
    if (pb.sex === 'male' && bfN < 4) warns.push(`BF% ${bfN}% sotto il minimo fisiologico maschile (~4%).`);
    if (pb.sex === 'female' && bfN < 10) warns.push(`BF% ${bfN}% sotto il minimo fisiologico femminile (~10%).`);
    if (wN && bfN) { const lbm = wN * (1 - bfN / 100); if (lbm < 30) warns.push(`LBM ${round(lbm, 1)} kg sembra molto bassa.`); }
  }
  if (aN && aN < 15) warns.push('Età inferiore a 15 anni — verifica.');
  return warns;
}

export function validateInput(pb: PianoBase): string[] {
  const errs: string[] = [];
  if (!pb.sex) errs.push('Sesso obbligatorio');
  if (!pb.goal) errs.push('Obiettivo obbligatorio');
  const aN = toNum(pb.age); if (!aN || aN <= 0) errs.push('Età valida obbligatoria');
  const hN = toNum(pb.height); if (!hN || hN <= 0) errs.push('Altezza valida obbligatoria');
  const wN = toNum(pb.weight); if (!wN || wN <= 0) errs.push('Peso valido obbligatorio');
  const bN = normalizeBodyFatPercent(pb.bodyFat);
  if (!bN || bN <= 0) errs.push('% Body Fat obbligatorio');
  else if (bN < 2 || bN > 65) errs.push('% Body Fat fuori range (2–65%)');
  const waistN = toNum(pb.measureWaist);
  if (!waistN || waistN <= 0) errs.push('Misura vita obbligatoria — il BF% è solo una stima, la vita è il riscontro oggettivo');
  if (pb.goal === 'bulk' || (pb.goal === 'skinny_fat' && pb.sfPhase === 3)) {
    const maxBF = normalizeBodyFatPercent(pb.bulkMaxBF), tw = toNum(pb.bulkTargetWeight);
    if (!maxBF && !tw) errs.push('Bulk: imposta almeno un criterio di fine (BF% massimo o peso target)');
    if (tw && wN && tw <= wN) errs.push('Bulk: il peso target deve essere maggiore del peso attuale');
    if (!(pb.bulkSurplusPct >= 5 && pb.bulkSurplusPct <= 10)) errs.push('Bulk: surplus tra 5% e 10%');
  }
  return errs;
}

// La vita è il segnale primario di composizione corporea in tutta la
// valutazione settimanale (computeCutWeeklyCheck ecc.) — il BF% è solo una
// stima e viene usato come fallback quando la vita manca. Richiederli
// entrambi ogni settimana evita che quel fallback scatti di continuo.
export function validateWeekly(weeklyAvgWeight: string, weeklyMeasureWaist: string, checkBodyFat: string): string[] {
  const errs: string[] = [];
  const w = toNum(weeklyAvgWeight);
  if (!w || w <= 0) errs.push('Inserisci un peso medio valido');
  const waist = toNum(weeklyMeasureWaist);
  if (!waist || waist <= 0) errs.push('Inserisci la misura vita di questa settimana');
  const bf = normalizeBodyFatPercent(checkBodyFat);
  if (!bf || bf <= 0) errs.push('Inserisci il Body Fat % di questa settimana');
  return errs;
}

// Tabella proteica "in deficit" del libro (cap.8): il fabbisogno per kg di LBM
// sale con l'età. Prima era un floor fisso a 2.0 g/kg LBM per tutte le età —
// sotto il minimo raccomandato dal libro per chiunque abbia più di 30 anni.
const PROTEIN_MIN_LBM_DEFICIT_BY_AGE: { maxAge: number; min: number }[] = [
  { maxAge: 30, min: 2.2 },
  { maxAge: 40, min: 2.4 },
  { maxAge: 50, min: 2.8 },
  { maxAge: 60, min: 3.1 },
  { maxAge: 70, min: 3.5 },
];

export function proteinFloorLBMForAge(age: number | null): number {
  if (age == null) return PROTEIN_MIN_LBM_DEFICIT_BY_AGE[0].min;
  for (const b of PROTEIN_MIN_LBM_DEFICIT_BY_AGE) if (age <= b.maxAge) return b.min;
  return PROTEIN_MIN_LBM_DEFICIT_BY_AGE[PROTEIN_MIN_LBM_DEFICIT_BY_AGE.length - 1].min;
}

// Colonna "No deficit" della stessa tabella 6.1 (Reverse Dieting Guide):
// anche fuori da un deficit il fabbisogno proteico per kg di LBM sale con
// l'età, solo su valori più bassi della colonna "In deficit". Prima non
// esisteva alcun floor per Reverse Diet / SF Fase 2-3: i preset proteici
// (1.8/2.2/2.8) erano fissi indipendentemente dall'età dell'utente.
const PROTEIN_MIN_LBM_NODEFICIT_BY_AGE: { maxAge: number; min: number }[] = [
  { maxAge: 30, min: 1.8 },
  { maxAge: 40, min: 2.0 },
  { maxAge: 50, min: 2.3 },
  { maxAge: 60, min: 2.6 },
  { maxAge: 70, min: 2.9 },
];

export function proteinFloorLBMForAgeNoDeficit(age: number | null): number {
  if (age == null) return PROTEIN_MIN_LBM_NODEFICIT_BY_AGE[0].min;
  for (const b of PROTEIN_MIN_LBM_NODEFICIT_BY_AGE) if (age <= b.maxAge) return b.min;
  return PROTEIN_MIN_LBM_NODEFICIT_BY_AGE[PROTEIN_MIN_LBM_NODEFICIT_BY_AGE.length - 1].min;
}

/** true se pb è in una fase di deficit calorico (Cut, SF Fase 1) — determina
 *  quale colonna della tabella 6.1 usare come floor proteico. */
export function isInDeficitPhase(pb: PianoBase): boolean {
  return isCut(pb) || (isSF(pb) && pb.sfPhase === 1);
}

export function proteinFloorForPB(pb: PianoBase): number {
  const age = toNum(pb.age);
  return isInDeficitPhase(pb) ? proteinFloorLBMForAge(age) : proteinFloorLBMForAgeNoDeficit(age);
}

// Prima limitato a isCut(pb) (floor "In deficit" soltanto): la tabella 6.1 ha
// un floor per età anche fuori dal deficit (Reverse Diet, SF Fase 2-3), quindi
// ora il controllo si applica sempre, con la colonna giusta in base alla fase.
export function checkProteinFloorWarn(pb: PianoBase): boolean {
  const floor = proteinFloorForPB(pb);
  const lbm = computeLBM(pb);
  return lbm ? pb.proteinPerKgLBM < floor : pb.proteinPerKgLBM < floor * 0.8;
}

/* ── Valutazione settimanale ──────────────────────────────────────────── */

export interface WeeklyMeasures { waist: string }

export interface WeeklyCheckOption { suggestedCalories: number; note: string }

export interface WeeklyCheckResult {
  decision: string;
  suggestedCalories: number;
  note: string;
  weeklyBF: string | number | null;
  weeklyMeasures: WeeklyMeasures;
  options: Record<string, WeeklyCheckOption> | null;
  isSkinnyFat: boolean;
  isReverse: boolean;
  isCut: boolean;
  isBulk: boolean;
  isMaintenance: boolean;
  prevWeekWeight?: number | null;
  prevWeekWaist?: number | null;
  prevWeekBF?: number | null;
  actualLoss?: number;
  targetLossKg?: number;
  minLossKg?: number;
  maxLossKg?: number;
  refWeight?: number;
  inDietBreak?: boolean;
  allowedGainKg?: number;
  actualGainKg?: number;
  levels?: ReturnType<typeof computeLevels>;
  sfPhase?: number;
  actualChange?: number;
  minGainKg?: number;
  maxGainKg?: number;
  /** Quale criterio ha chiuso il bulk. */
  bulkEnd?: 'bf' | 'weight';
  weeksInPhase?: number;
}

export function computeWeeklyCheck(pb: PianoBase, storico: DietCheckEntry[], prevCal: number, avgW: number | null, bfVal: number | null, measures: WeeklyMeasures): WeeklyCheckResult {
  if (isSF(pb)) return computeSFWeeklyCheck(pb, storico, prevCal, avgW, bfVal, measures);
  // Il ciclo ripassa più volte per lo stesso obiettivo: i check guardano solo la fase in corso.
  const phase = getPhaseStorico(pb, storico);
  if (isBulk(pb)) return computeBulkWeeklyCheck(pb, phase, prevCal, avgW, bfVal, measures);
  if (isMaintenance(pb)) return computeMaintenanceWeeklyCheck(pb, phase, prevCal, avgW, bfVal, measures);
  if (isReverse(pb)) return computeReverseWeeklyCheck(pb, phase, prevCal, avgW, bfVal, measures);
  if (isCut(pb)) return computeCutWeeklyCheck(pb, phase, prevCal, avgW, bfVal, measures);
  return { decision: 'not_implemented', suggestedCalories: prevCal, note: 'Protocollo non ancora implementato.', weeklyBF: bfVal, weeklyMeasures: measures, options: null, isSkinnyFat: false, isReverse: false, isCut: false, isBulk: false, isMaintenance: false };
}

export function computeCutWeeklyCheck(pb: PianoBase, storico: DietCheckEntry[], prevCal: number, avgW: number | null, bfVal: number | null, measures: WeeklyMeasures): WeeklyCheckResult {
  const wN = toNum(pb.weight) || 0;
  let prevWeekWeight: number | null = null, prevWeekWaist: number | null = null, prevWeekBF: number | null = null;
  if (storico.length > 0) {
    // storico è ordinato dal più recente al meno recente: l'ultimo check è l'indice 0.
    const last = storico[0];
    prevWeekWeight = toNum(last.weeklyAvgWeight); prevWeekWaist = toNum(last.weeklyMeasureWaist); prevWeekBF = normalizeBodyFatPercent(last.checkBodyFat);
  }
  const refWeight = prevWeekWeight !== null ? prevWeekWeight : wN;
  const actualLoss = round(refWeight - (avgW || 0), 3) ?? 0;
  const curWeight = avgW || refWeight;
  const targetLossKg = round(curWeight * pb.cutLossRate / 100, 3) ?? 0;
  const minLossKg = round(curWeight * (pb.cutLossRate * 0.5) / 100, 3) ?? 0;
  const maxLossKg = round(curWeight * (pb.cutLossRate * 1.5) / 100, 3) ?? 0;

  const bsBF = normalizeBodyFatPercent(pb.bodyFat), bsWaist = toNum(pb.measureWaist);
  const wkBF = normalizeBodyFatPercent(bfVal), wkWaist = toNum(measures.waist);
  const refWaist = prevWeekWaist ?? toNum(pb.measureWaist);
  const refBF = prevWeekBF ?? bsBF;
  const waistImproving = wkWaist != null && refWaist != null && wkWaist < refWaist - 0.3;
  const bfImproving = wkBF != null && refBF != null && wkBF < refBF - 0.2;
  const waistWorsening = wkWaist != null && refWaist != null && wkWaist > refWaist + 0.3;
  const bfWorsening = wkBF != null && refBF != null && wkBF > refBF + 0.2;
  const compositionImproving = waistImproving || (bfImproving && wkWaist == null);
  const compositionWorsening = waistWorsening || (bfWorsening && wkWaist == null);
  void bsBF; void bsWaist;

  const r: WeeklyCheckResult = {
    decision: 'cut', suggestedCalories: prevCal, note: '', weeklyBF: bfVal, weeklyMeasures: measures, options: null,
    prevWeekWeight, prevWeekWaist, prevWeekBF, isSkinnyFat: false, isReverse: false, isCut: true, isBulk: false, isMaintenance: false,
    actualLoss, targetLossKg, minLossKg, maxLossKg, refWeight, inDietBreak: false,
  };

  if (pb.dietBreakEnabled) {
    const { inBreak, posInCycle, breakWeeks } = computeDietBreakPhase(pb);
    r.inDietBreak = inBreak;
    if (inBreak) {
      const weightDelta = round(Math.abs((avgW || refWeight) - refWeight), 2) ?? 0;
      r.decision = 'cut_diet_break';
      r.suggestedCalories = prevCal;
      r.note = `Sei in PAUSA DIETA (sett. ${posInCycle - pb.dbDeficitWeeks}/${breakWeeks}). Mangi a mantenimento (${prevCal} kcal). La pausa aiuta il metabolismo a recuperare. Variazione peso questa sett.: ${weightDelta < 0.2 ? '✓ stabile' : weightDelta + ' kg'}.`;
      return r;
    }
  }

  if (wkBF != null && wkBF <= pb.cutTargetBF) {
    r.decision = 'cut_target_reached'; r.suggestedCalories = prevCal;
    r.note = `BF% target (${pb.cutTargetBF}%) raggiunto! Ora è essenziale passare a una Reverse Diet per ripristinare il metabolismo.`;
    return r;
  }

  // Libro (cap. "Interpreting Check-in Results"): una singola settimana sotto
  // target — poco o nulla perso, o persino peso fermo/su — NON è mai motivo
  // per tagliare le kcal da sola ("we don't recommend making hasty changes
  // based on one week of progress"). Si agisce solo quando sono DUE check-in
  // CONSECUTIVI sotto il 50% del target settimanale, e a quel punto si agisce
  // a prescindere da vita/BF%. Per la prima settimana sotto target, vita/BF%
  // decidono solo se monitorare con fiducia (ricomposizione) o con cautela —
  // mai se tagliare subito.
  // Stessa logica applicata al lato opposto: "if you lose 1.1 kilograms in a
  // week, is it time to add a bunch of calories back in? Probably not" — una
  // settimana troppo veloce da sola non è motivo per aumentare le kcal
  // (spesso è solo acqua/glicogeno della prima settimana o un blip). Anche
  // qui si agisce solo alla seconda settimana consecutiva sopra il target massimo.
  let prevWeekUnderTarget = false, prevWeekTooFast = false;
  if (storico.length >= 2) {
    const p0W = toNum(storico[0].weeklyAvgWeight);
    const p1W = toNum(storico[1].weeklyAvgWeight);
    if (p0W != null && p1W != null && p0W > 0) {
      const prevActualLoss = round(p1W - p0W, 3) ?? 0;
      const prevMinLossKg = round(p0W * (pb.cutLossRate * 0.5) / 100, 3) ?? 0;
      const prevMaxLossKg = round(p0W * (pb.cutLossRate * 1.5) / 100, 3) ?? 0;
      prevWeekUnderTarget = prevActualLoss < prevMinLossKg;
      prevWeekTooFast = prevActualLoss >= prevMaxLossKg;
    }
  }

  if (actualLoss >= maxLossKg && prevWeekTooFast) {
    r.decision = 'cut_too_fast_confirmed';
    r.suggestedCalories = Math.round(prevCal * 1.05);
    r.note = `Due check-in consecutivi sopra il target massimo (questa settimana: −${round(actualLoss, 2)} kg vs −${targetLossKg} kg). Rischio concreto di perdere massa magra. Aumenta +5% kcal.`;
  } else if (actualLoss >= maxLossKg) {
    r.decision = 'cut_watch_fast'; r.suggestedCalories = prevCal;
    r.note = `Perdita più veloce del previsto: −${round(actualLoss, 2)} kg vs target −${targetLossKg} kg. Spesso è solo la prima settimana (acqua/glicogeno) o una fluttuazione — una settimana da sola non basta per aumentare le kcal. Se anche il prossimo check-in è sopra il target massimo, si aumenta.`;
  } else if (actualLoss >= minLossKg) {
    r.decision = 'cut_on_track'; r.suggestedCalories = prevCal;
    r.note = `Progressione ottimale: −${round(actualLoss, 2)} kg/sett (target: −${targetLossKg} kg · range ${minLossKg}–${maxLossKg} kg). Mantieni il piano attuale.`;
  } else if (prevWeekUnderTarget) {
    // Il libro (cap. "Plateaus"): quando il plateau è confermato, le opzioni
    // sono "decreasing calories" O "adding in more exercise/activity" — non
    // un taglio automatico e basta. Stessa coppia di alternative già usata
    // dal banner di plateau più profondo (buildAdjustmentOptions).
    const [reduceOpt, , , activityOpt] = buildAdjustmentOptions(pb, prevCal);
    r.decision = 'cut_stalled_confirmed';
    r.suggestedCalories = reduceOpt.kcal;
    r.note = `Due check-in consecutivi sotto il 50% del target (questa settimana: −${round(actualLoss, 2)} kg vs −${targetLossKg} kg). Il libro raccomanda di agire ora, indipendentemente da vita/BF%: riduci le calorie o aumenta l'attività fisica. Mai sotto 1200 kcal (♀) o 1500 kcal (♂).`;
    r.options = {
      reduce:   { suggestedCalories: reduceOpt.kcal,   note: reduceOpt.note },
      activity: { suggestedCalories: activityOpt.kcal, note: activityOpt.note },
    };
  } else if (compositionImproving) {
    r.decision = 'cut_watch_composition_ok'; r.suggestedCalories = prevCal;
    const signals = [waistImproving ? `vita ↓ (${wkWaist}→${refWaist} cm)` : '', bfImproving ? `BF% ↓ (${wkBF}→${refBF}%)` : ''].filter(Boolean).join(' · ');
    r.note = `Peso sotto target (−${round(actualLoss, 2)} kg vs −${targetLossKg} kg) ma composizione migliora (${signals}). Possibile ricomposizione corporea — una settimana da sola non è motivo per agire. Non ridurre, monitora.`;
  } else if (compositionWorsening) {
    r.decision = 'cut_watch'; r.suggestedCalories = prevCal;
    const signals = [waistWorsening ? 'vita ↑' : '', bfWorsening ? 'BF% ↑' : ''].filter(Boolean).join(' e ');
    r.note = `Peso sotto target (−${round(actualLoss, 2)} kg vs −${targetLossKg} kg) e composizione in peggioramento (${signals}). Una sola settimana non basta per agire: verifica aderenza e attendi il prossimo check-in — se anche quello è sotto il 50% del target, si riduce.`;
  } else {
    r.decision = 'cut_watch'; r.suggestedCalories = prevCal;
    r.note = `Peso sotto target (−${round(actualLoss, 2)} kg vs −${targetLossKg} kg), possibile fluttuazione o ritenzione idrica. Il libro sconsiglia di agire dopo una sola settimana — monitora. Se anche il prossimo check-in è sotto il 50% del target, si riduce −5%.`;
  }
  return r;
}

export function computeLevels(pb: PianoBase, prevCal: number) {
  const lbm = computeLBM(pb); if (!lbm) return undefined;
  const table = getLBMTable(pb);
  const cpk = round(prevCal / lbm, 1) ?? 0;
  const band = getCurrentBand(table, cpk);
  const bandLabel = ({ molto_basso: 'Molto sotto', sotto: 'Sotto normale', normale: 'Normale', sopra: 'Sopra normale', molto_alto: 'Molto sopra' } as Record<string, string>)[band || ''] || '—';
  return { table, cpk, band, bandLabel, lbm: round(lbm, 1), normalRange: getLBMRange(pb, table, 'normale'), sottoRange: getLBMRange(pb, table, 'sotto'), sopraRange: getLBMRange(pb, table, 'sopra') };
}

export function computeReverseWeeklyCheck(pb: PianoBase, storico: DietCheckEntry[], prevCal: number, avgW: number | null, bfVal: number | null, measures: WeeklyMeasures): WeeklyCheckResult {
  const ap = APPROACHES[pb.approachKey] || APPROACHES.conservative;
  let prevWeekWeight: number | null = null, prevWeekWaist: number | null = null, prevWeekBF: number | null = null;
  if (storico.length > 0) {
    // storico è ordinato dal più recente al meno recente: l'ultimo check è l'indice 0.
    const last = storico[0];
    prevWeekWeight = toNum(last.weeklyAvgWeight); prevWeekWaist = toNum(last.weeklyMeasureWaist); prevWeekBF = normalizeBodyFatPercent(last.checkBodyFat);
  }
  const refWeight = prevWeekWeight !== null ? prevWeekWeight : (toNum(pb.weight) || 0);
  const actualGain = round((avgW || 0) - refWeight, 3) ?? 0;
  const curWeight = avgW || refWeight;
  const allowedGain = curWeight * ap.weeklyAllowedGainPct;

  const wkBF = normalizeBodyFatPercent(bfVal), wkWaist = toNum(measures.waist);
  const refWaist = prevWeekWaist ?? toNum(pb.measureWaist);
  const refBF = prevWeekBF ?? normalizeBodyFatPercent(pb.bodyFat);

  const wUp = wkWaist != null && refWaist != null && wkWaist > refWaist + 0.3;
  const wDown = wkWaist != null && refWaist != null && wkWaist < refWaist - 0.3;
  const bfUp = wkBF != null && refBF != null && wkBF > refBF + 0.2;
  const bfDown = wkBF != null && refBF != null && wkBF < refBF - 0.2;

  const compositionWorsened = wUp || (bfUp && wkWaist == null);
  const compositionImproving = wDown || (bfDown && wkWaist == null);

  const r: WeeklyCheckResult = {
    allowedGainKg: round(allowedGain, 3) ?? 0, actualGainKg: actualGain, decision: 'hold', suggestedCalories: prevCal, note: '',
    weeklyBF: bfVal, weeklyMeasures: measures, options: null, prevWeekWeight, prevWeekWaist, prevWeekBF,
    isSkinnyFat: false, isReverse: true, isCut: false, isBulk: false, isMaintenance: false, refWeight,
  };

  const lbm = computeLBM(pb);
  const targetMeta = getReverseTargetMeta(pb);
  if (lbm && targetMeta.targetKcal != null) {
    if (prevCal >= targetMeta.targetKcal) {
      r.decision = 'finished_reverse'; r.suggestedCalories = prevCal;
      r.note = `Target Reverse ${targetMeta.label} raggiunto (${targetMeta.targetCpk} kcal/kg LBM ≈ ${targetMeta.targetKcal} kcal). Scegli ora se mantenere, aprire un Cut o passare a un Bulk controllato.`;
      r.levels = computeLevels(pb, prevCal);
      return r;
    }
  }

  if (actualGain <= allowedGain + 1e-9) {
    const [lo, hi] = ap.calIncreasePct;
    r.decision = 'increase';
    r.options = {
      lo: { suggestedCalories: Math.round(prevCal * (1 + lo)), note: `+${round(lo * 100, 1)}% — conservativo.` },
      hi: { suggestedCalories: Math.round(prevCal * (1 + hi)), note: `+${round(hi * 100, 1)}% — se guadagno è minimo.` },
    };
    r.suggestedCalories = Math.round(prevCal * (1 + lo));
    let note = `Guadagno ${actualGain > 0 ? '+' : ''}${actualGain} kg entro il limite ≤${round(ap.weeklyAllowedGainPct * 100, 1)}%/sett. Aumenta nel range ${round(lo * 100, 1)}%–${round(hi * 100, 1)}%.`;
    if (compositionImproving) {
      const segnali = [wDown ? 'vita ↓ vs prev' : '', bfDown ? 'BF% ↓ vs prev' : ''].filter(Boolean).join(' · ');
      note += ` Ottimo: composizione migliora (${segnali}) — ricomposizione in corso.`;
    }
    r.note = note;
  } else if (!compositionWorsened) {
    const [lo] = ap.calIncreasePct;
    r.decision = 'exceeds_but_no_bf_waist_increase';
    let contNote = `+${round(lo * 100, 1)}%. Composizione stabile vs settimana scorsa → probabile ritenzione/massa magra.`;
    if (compositionImproving) {
      const segnali = [wDown ? 'vita ↓' : '', bfDown ? 'BF% ↓' : ''].filter(Boolean).join(' · ');
      contNote = `+${round(lo * 100, 1)}%. Composizione migliora (${segnali}) — peso extra probabile ritenzione o LBM. Ottimo segnale.`;
    }
    r.options = {
      continue_increase: { suggestedCalories: Math.round(prevCal * (1 + lo)), note: contNote },
      maintain: { suggestedCalories: prevCal, note: 'Mantieni stabili 1–2 settimane se preferisci attendere conferma.' },
    };
    r.note = compositionImproving
      ? `Peso oltre soglia ma composizione migliora (${[wDown ? 'vita ↓' : '', bfDown ? 'BF% ↓' : ''].filter(Boolean).join(' · ')}). Segnale positivo: l'aumento non è grasso. Puoi continuare ad aumentare.`
      : `Peso oltre limite ma Vita e BF% stabili vs settimana scorsa. Guida sez.7: probabile ritenzione idrica o massa magra. Continua o mantieni.`;
  } else {
    r.decision = 'hold'; r.suggestedCalories = prevCal;
    const signal = wUp && bfUp ? 'Vita E BF% in aumento vs settimana scorsa' : wUp ? 'Vita in aumento vs settimana scorsa (segnale primario)' : 'BF% in aumento vs settimana scorsa';
    r.note = `Peso oltre limite e ${signal}. Mantieni le calorie stabili per 1–2 settimane (guida sez.7). Non ridurre — aspetta conferma dai dati.`;
  }
  r.levels = computeLevels(pb, prevCal);
  return r;
}

/* FIX deliberato rispetto all'originale: nell'app v2.1 i limiti di
   variazione settimanale della Fase 1 Skinny Fat erano hardcoded
   (0.3%–1.0% BW/sett) e ignoravano del tutto `sfDeficitPct`, che
   influenzava solo il deficit di partenza. Qui il target di perdita
   settimanale viene derivato dal deficit configurato (stessa logica del
   Cut: kcal settimanali di deficit / 7700), con lo stesso moltiplicatore
   0.5×–1.5× già usato per il range accettabile nel Cut — così il valore
   configurato ha un effetto reale sulla valutazione settimanale. */
export function computeSFWeeklyCheck(pb: PianoBase, storico: DietCheckEntry[], prevCal: number, avgW: number | null, bfVal: number | null, measures: WeeklyMeasures): WeeklyCheckResult {
  const wN = getCurrentWeight(pb, '') || toNum(pb.weight) || 0;
  let prevWeekWeight: number | null = null, prevWeekWaist: number | null = null;
  // storico è ordinato dal più recente al meno recente: l'ultimo check è l'indice 0.
  if (storico.length > 0) { const last = storico[0]; prevWeekWeight = toNum(last.weeklyAvgWeight); prevWeekWaist = toNum(last.weeklyMeasureWaist); }
  const refW = prevWeekWeight !== null ? prevWeekWeight : wN;
  const actualChange = round((avgW || 0) - refW, 3) ?? 0;
  const bsBF = normalizeBodyFatPercent(pb.bodyFat), bsWaist = toNum(pb.measureWaist);
  const wkBF = normalizeBodyFatPercent(bfVal), wkWaist = toNum(measures.waist);
  const r: WeeklyCheckResult = { decision: 'sf', suggestedCalories: prevCal, note: '', weeklyBF: bfVal, weeklyMeasures: measures, options: null, prevWeekWeight, prevWeekWaist, isSkinnyFat: true, isReverse: false, isCut: false, isBulk: false, isMaintenance: false, sfPhase: pb.sfPhase, actualChange };

  if (pb.sfPhase === 1) {
    const m = estimateMaintenance(pb).maintenance;
    const weeklyDeficitKcal = m * (pb.sfDeficitPct / 100) * 7;
    const targetLossKg = weeklyDeficitKcal / 7700;
    const minLossKg = targetLossKg * 0.5, maxLossKg = targetLossKg * 1.5;
    const lossKg = -actualChange;
    const bfN = normalizeBodyFatPercent(bfVal);

    // Stessa logica del Cut (v. computeCutWeeklyCheck): una singola settimana
    // fuori target — troppo lenta, ferma o troppo veloce — non basta da sola
    // per cambiare le kcal. Si agisce solo alla seconda settimana consecutiva
    // fuori dallo stesso range.
    let prevWeekUnderTarget = false, prevWeekTooFast = false;
    if (storico.length >= 2) {
      const p0W = toNum(storico[0].weeklyAvgWeight);
      const p1W = toNum(storico[1].weeklyAvgWeight);
      if (p0W != null && p1W != null && p0W > 0) {
        const prevLossKg = round(p1W - p0W, 3) ?? 0;
        prevWeekUnderTarget = prevLossKg < minLossKg;
        prevWeekTooFast = prevLossKg > maxLossKg;
      }
    }

    if (bfN != null && bfN <= pb.sfTargetBF) { r.decision = 'sf_f1_target_reached'; r.suggestedCalories = prevCal; r.note = `BF% target (${pb.sfTargetBF}%) raggiunto! Passa a Fase 2.`; }
    else if (lossKg > maxLossKg && prevWeekTooFast) {
      r.decision = 'sf_f1_too_fast_confirmed'; r.suggestedCalories = Math.round(prevCal * 1.04);
      r.note = `Due check-in consecutivi sopra il target massimo (−${round(lossKg, 2)} kg/sett > max ${round(maxLossKg, 2)} kg). Rischi di perdere massa magra. +4% kcal.`;
    } else if (lossKg > maxLossKg) {
      r.decision = 'sf_f1_watch_fast'; r.suggestedCalories = prevCal;
      r.note = `Perdita più veloce del previsto: −${round(lossKg, 2)} kg/sett vs max ${round(maxLossKg, 2)} kg. Spesso è solo acqua/glicogeno o una fluttuazione — una settimana da sola non basta per agire. Se anche il prossimo check-in è sopra il target massimo, si aumenta.`;
    } else if (lossKg >= minLossKg) { r.decision = 'sf_f1_on_track'; r.suggestedCalories = prevCal; r.note = `Progressione ottimale: −${round(lossKg, 2)} kg/sett (range ideale: ${round(minLossKg, 2)}–${round(maxLossKg, 2)} kg, derivato dal deficit −${pb.sfDeficitPct}%). Mantieni.`; }
    else if (prevWeekUnderTarget) {
      const [reduceOpt, , , activityOpt] = buildAdjustmentOptions(pb, prevCal);
      r.decision = 'sf_f1_stalled_confirmed';
      r.suggestedCalories = reduceOpt.kcal;
      r.note = `Due check-in consecutivi sotto il target (questa settimana: −${round(lossKg, 2)} kg vs −${round(targetLossKg, 2)} kg). Riduci le calorie o aumenta l'attività fisica. Mai sotto 1200 kcal (♀) o 1500 kcal (♂).`;
      r.options = {
        reduce:   { suggestedCalories: reduceOpt.kcal,   note: reduceOpt.note },
        activity: { suggestedCalories: activityOpt.kcal, note: activityOpt.note },
      };
    } else if (lossKg > 0) {
      r.decision = 'sf_f1_watch'; r.suggestedCalories = prevCal;
      r.note = `Perdita sotto target: −${round(lossKg, 2)} kg/sett vs −${round(targetLossKg, 2)} kg. Una settimana da sola non è motivo per ridurre — monitora. Se anche il prossimo check-in è sotto target, si riduce.`;
    } else {
      const bfUp2 = wkBF != null && bsBF != null && wkBF > bsBF;
      r.decision = 'sf_f1_watch'; r.suggestedCalories = prevCal;
      r.note = bfUp2 ? `Peso stabile/aumentato E BF% aumentato. Una settimana da sola non basta per agire — monitora e controlla l'aderenza. Se persiste, si riduce.` : `Peso stabile/aumentato, BF% invariato — probabile ritenzione. Una settimana da sola non basta per agire — monitora. Se persiste, si riduce.`;
    }
  } else if (pb.sfPhase === 2) {
    // Prima era hardcoded a ritmo Conservativo (0.2%/sett, +2% fisso), senza
    // possibilità di scelta. Ora riusa lo stesso `approachKey` del Reverse
    // Diet standalone (i due obiettivi sono mutuamente esclusivi su un piano),
    // col default rimasto Conservativo — coerente con l'obiettivo di
    // "Stabilizzazione Metabolica" della fase.
    const ap = APPROACHES[pb.approachKey] || APPROACHES.conservative;
    const allowedGain = wN * ap.weeklyAllowedGainPct;
    const [lo, hi] = ap.calIncreasePct;
    const lbm = computeLBM(pb); const table = getLBMTable(pb);
    if (lbm) {
      const nr = getLBMRange(pb, table, 'normale');
      if (nr.min != null && prevCal >= nr.min) { r.decision = 'sf_f2_complete'; r.suggestedCalories = prevCal; r.note = `Range Normale raggiunto (${round(prevCal / lbm, 1)} kcal/kg LBM). Mantieni 1–2 settimane, poi Fase 3.`; return r; }
    }
    if (actualChange <= allowedGain + 1e-9) {
      r.decision = 'sf_f2_increase';
      r.suggestedCalories = Math.round(prevCal * (1 + lo));
      r.options = {
        lo: { suggestedCalories: Math.round(prevCal * (1 + lo)), note: `+${round(lo * 100, 1)}% — conservativo.` },
        hi: { suggestedCalories: Math.round(prevCal * (1 + hi)), note: `+${round(hi * 100, 1)}% — se il guadagno è minimo.` },
      };
      r.note = `Guadagno entro il limite (≤${round(ap.weeklyAllowedGainPct * 100, 1)}%/sett). Aumenta nel range ${round(lo * 100, 1)}%–${round(hi * 100, 1)}%.`;
    } else {
      const bfUp3 = wkBF != null && bsBF != null && wkBF > bsBF + 1e-6, wUp3 = wkWaist != null && bsWaist != null && wkWaist > bsWaist + 1e-6;
      if (!bfUp3 && !wUp3) {
        r.decision = 'sf_f2_options';
        r.options = { continue_increase: { suggestedCalories: Math.round(prevCal * (1 + lo)), note: `+${round(lo * 100, 1)}%. Vita e BF% invariati → probabile ritenzione.` }, maintain: { suggestedCalories: prevCal, note: 'Mantieni stabili 1 settimana.' } };
        r.note = 'Peso oltre limite ma composizione stabile.';
      } else { r.decision = 'sf_f2_hold'; r.note = 'Peso e composizione in aumento. Mantieni stabili questa settimana.'; }
    }
  } else {
    // Fase 3 = Clean Bulk: stessa logica del Bulk standalone (surplus e criteri di fine da pb.bulk*),
    // limitata alle entry SF fase 3 e con le decisioni rimappate sul prefisso sf_f3_.
    const bk = computeBulkWeeklyCheck(pb, storico.filter(e => e.goal === 'skinny_fat' && e.sfPhase === 3), prevCal, avgW, bfVal, measures);
    return { ...bk, decision: bk.decision.replace(/^bulk_/, 'sf_f3_'), isBulk: false, isSkinnyFat: true, sfPhase: 3, actualChange: bk.actualGainKg };
  }
  return r;
}

/* ── Bulk (lean/clean) ───────────────────────────────────────────────────
   Guadagno atteso 0,25–0,5% del peso/settimana. Come nel Cut, una sola
   settimana fuori range non basta per cambiare le kcal: si agisce al secondo
   check consecutivo. Sopra range si scala solo se la composizione peggiora
   (vita/BF% in salita); altrimenti è probabile acqua o massa magra. Le kcal
   restano sempre tra il mantenimento e il mantenimento +10%.
   `storico` è già ristretto alla fase (più recente per primo). */

const BULK_MIN_GAIN = 0.0025, BULK_MAX_GAIN = 0.005;

function compositionWorse(waist: number | null, refWaist: number | null, bf: number | null, refBF: number | null): boolean {
  const wUp = waist != null && refWaist != null && waist > refWaist + 0.3;
  const bfUp = bf != null && refBF != null && bf > refBF + 0.2;
  return wUp || (bfUp && waist == null);
}

export function computeBulkWeeklyCheck(pb: PianoBase, storico: DietCheckEntry[], prevCal: number, avgW: number | null, bfVal: number | null, measures: WeeklyMeasures): WeeklyCheckResult {
  const last = storico[0];
  const prevWeekWeight = last ? toNum(last.weeklyAvgWeight) : null;
  const prevWeekWaist = last ? toNum(last.weeklyMeasureWaist) : null;
  const prevWeekBF = last ? normalizeBodyFatPercent(last.checkBodyFat) : null;
  const refWeight = prevWeekWeight ?? toNum(pb.weight) ?? 0;
  const curWeight = avgW ?? refWeight;
  const actualGain = round(curWeight - refWeight, 3) ?? 0;
  const minGain = round(curWeight * BULK_MIN_GAIN, 3) ?? 0, maxGain = round(curWeight * BULK_MAX_GAIN, 3) ?? 0;

  const wkBF = normalizeBodyFatPercent(bfVal), wkWaist = toNum(measures.waist);
  const refWaist = prevWeekWaist ?? toNum(pb.measureWaist), refBF = prevWeekBF ?? normalizeBodyFatPercent(pb.bodyFat);
  const worsened = compositionWorse(wkWaist, refWaist, wkBF, refBF);

  const M = getMaintenanceRef(pb), ceil = Math.round(M * 1.10);
  const clamp = (k: number) => Math.min(ceil, Math.max(M, Math.round(k)));
  const r: WeeklyCheckResult = {
    decision: 'bulk_on_track', suggestedCalories: prevCal, note: '', weeklyBF: bfVal, weeklyMeasures: measures, options: null,
    prevWeekWeight, prevWeekWaist, prevWeekBF, isSkinnyFat: false, isReverse: false, isCut: false, isBulk: true, isMaintenance: false,
    refWeight, actualGainKg: actualGain, minGainKg: minGain, maxGainKg: maxGain,
  };

  const maxBF = normalizeBodyFatPercent(pb.bulkMaxBF), targetW = toNum(pb.bulkTargetWeight);
  if (maxBF && wkBF != null && wkBF >= maxBF) {
    r.decision = 'bulk_finished'; r.bulkEnd = 'bf';
    r.note = `BF% massimo (${maxBF}%) raggiunto. Il bulk è concluso: scegli se aprire un Cut o passare al Mantenimento.`;
    return r;
  }
  if (targetW && avgW != null && avgW >= targetW) {
    r.decision = 'bulk_finished'; r.bulkEnd = 'weight';
    r.note = `Peso target (${targetW} kg) raggiunto. Il bulk è concluso: scegli se aprire un Cut o passare al Mantenimento.`;
    return r;
  }

  const gainTxt = `${actualGain > 0 ? '+' : ''}${actualGain} kg (range ${minGain}–${maxGain} kg)`;
  if (actualGain >= minGain - 1e-9 && actualGain <= maxGain + 1e-9) {
    r.note = `Guadagno ${gainTxt}: nel range. Mantieni e concentrati sulla progressione dei carichi.`;
    return r;
  }

  // Settimana precedente (storico[0] vs storico[1]) fuori range nello stesso verso?
  let prevSlow = false, prevFast = false;
  if (storico.length >= 2) {
    const p0 = toNum(storico[0].weeklyAvgWeight), p1 = toNum(storico[1].weeklyAvgWeight);
    if (p0 != null && p1 != null && p0 > 0) {
      // Stessa precisione e stessa tolleranza della settimana corrente: 64 − 63,84 in float è 0,1599…, non 0,16.
      const g = round(p0 - p1, 3) ?? 0;
      prevSlow = g < (round(p0 * BULK_MIN_GAIN, 3) ?? 0) - 1e-9;
      prevFast = g > (round(p0 * BULK_MAX_GAIN, 3) ?? 0) + 1e-9 && compositionWorse(
        toNum(storico[0].weeklyMeasureWaist), toNum(storico[1].weeklyMeasureWaist),
        normalizeBodyFatPercent(storico[0].checkBodyFat), normalizeBodyFatPercent(storico[1].checkBodyFat));
    }
  }

  if (actualGain < minGain) {
    if (prevSlow) {
      r.decision = 'bulk_slow_confirmed'; r.suggestedCalories = clamp(prevCal * 1.03);
      if (r.suggestedCalories <= prevCal) {
        r.suggestedCalories = prevCal;
        r.note = `Due check consecutivi sotto range (${gainTxt}), ma sei già al tetto di mantenimento +10% (${ceil} kcal): non aumento oltre. Valuta se il surplus è adeguato o se il peso si sta stabilizzando per altre cause (sonno, stress, aderenza).`;
      } else {
        r.options = {
          lo: { suggestedCalories: clamp(prevCal * 1.03), note: '+3% — aumento prudente.' },
          hi: { suggestedCalories: clamp(prevCal * 1.05), note: '+5% — se la crescita è quasi ferma.' },
        };
        r.note = `Due check consecutivi sotto range (${gainTxt}). Aumenta le kcal, restando entro mantenimento +10% (${ceil} kcal).`;
      }
    } else {
      r.decision = 'bulk_watch_slow';
      r.note = `Guadagno sotto range: ${gainTxt}. Una settimana da sola non basta per agire — monitora. Se anche il prossimo check è sotto range, si aumenta.`;
    }
  } else if (worsened) {
    if (prevFast) {
      r.decision = 'bulk_fast_confirmed'; r.suggestedCalories = clamp(prevCal * 0.97);
      if (r.suggestedCalories >= prevCal) {
        r.suggestedCalories = prevCal;
        r.note = `Due check consecutivi sopra range con vita/BF% in salita (${gainTxt}), ma le kcal sono già al mantenimento (${M} kcal): non scendo sotto. Il bulk non sta funzionando come previsto: valuta di chiuderlo (Cut o Mantenimento).`;
      } else {
        r.options = {
          lo: { suggestedCalories: clamp(prevCal * 0.97), note: '−3% — riduzione prudente.' },
          hi: { suggestedCalories: clamp(prevCal * 0.95), note: '−5% — se vita e BF% salgono in fretta.' },
        };
        r.note = `Due check consecutivi sopra range con vita/BF% in salita (${gainTxt}): stai accumulando grasso. Riduci le kcal, senza scendere sotto il mantenimento (${M} kcal).`;
      }
    } else {
      r.decision = 'bulk_watch_fast';
      r.note = `Guadagno sopra range (${gainTxt}) e vita/BF% in salita. Una settimana da sola non basta per agire — monitora. Se si ripete, si riduce.`;
    }
  } else {
    r.decision = 'bulk_watch_fast_stable';
    r.note = `Guadagno sopra range (${gainTxt}) ma vita e BF% stabili: probabile acqua/glicogeno o massa magra. Monitora, nessuna modifica.`;
  }
  return r;
}

/* ── Mantenimento ────────────────────────────────────────────────────────
   Il riferimento è il peso della baseline di fase, non la settimana scorsa:
   così intercetta anche una deriva lenta. Banda ±0,5%. Si corregge le kcal
   (±3%) solo alla seconda settimana consecutiva fuori banda dallo stesso lato.
   Vita e BF% sono solo informativi. `storico` è già ristretto alla fase. */

const MAINT_BAND = 0.005;

export function computeMaintenanceWeeklyCheck(pb: PianoBase, storico: DietCheckEntry[], prevCal: number, avgW: number | null, bfVal: number | null, measures: WeeklyMeasures): WeeklyCheckResult {
  const last = storico[0];
  const prevWeekWeight = last ? toNum(last.weeklyAvgWeight) : null;
  const prevWeekWaist = last ? toNum(last.weeklyMeasureWaist) : null;
  const prevWeekBF = last ? normalizeBodyFatPercent(last.checkBodyFat) : null;
  const baseline = storico.find(e => e.isBaseline) ?? storico[storico.length - 1];
  const refWeight = (baseline ? toNum(baseline.weeklyAvgWeight) : null) ?? toNum(pb.weight) ?? 0;
  const curWeight = avgW ?? refWeight;
  const band = refWeight * MAINT_BAND;
  const dev = round(curWeight - refWeight, 3) ?? 0;
  const side = (w: number | null) => (w == null || refWeight <= 0 ? 0 : w - refWeight > band + 1e-9 ? 1 : w - refWeight < -band - 1e-9 ? -1 : 0);
  const curSide = refWeight > 0 ? side(curWeight) : 0;
  const prevSide = last && !last.isBaseline ? side(prevWeekWeight) : 0;
  const weeksInPhase = storico.filter(e => !e.isBaseline).length + 1;

  const r: WeeklyCheckResult = {
    decision: 'maint_on_track', suggestedCalories: prevCal, note: '', weeklyBF: bfVal, weeklyMeasures: measures, options: null,
    prevWeekWeight, prevWeekWaist, prevWeekBF, isSkinnyFat: false, isReverse: false, isCut: false, isBulk: false, isMaintenance: true,
    refWeight, actualChange: dev, weeksInPhase,
  };
  const bandTxt = `${dev > 0 ? '+' : ''}${dev} kg vs riferimento ${round(refWeight, 1)} kg (banda ±${round(band, 2)} kg)`;
  const info = [measures.waist ? `vita ${measures.waist} cm` : '', bfVal != null ? `BF% ${bfVal}` : ''].filter(Boolean).join(' · ');
  const infoTxt = info ? ` Per informazione: ${info}.` : '';

  if (curSide !== 0 && curSide === prevSide) {
    r.decision = curSide > 0 ? 'maint_drift_up' : 'maint_drift_down';
    r.suggestedCalories = Math.round(prevCal * (curSide > 0 ? 0.97 : 1.03));
    r.note = `Due check consecutivi ${curSide > 0 ? 'sopra' : 'sotto'} la banda (${bandTxt}). ${curSide > 0 ? 'Riduci' : 'Aumenta'} le kcal del 3%.${infoTxt}`;
  } else if (curSide === 0 && weeksInPhase >= pb.maintenanceWeeks) {
    r.decision = 'maint_complete';
    r.note = `${weeksInPhase} settimane di mantenimento con peso stabile (${bandTxt}). Puoi aprire un Cut o un Bulk, oppure restare in mantenimento.${infoTxt}`;
  } else if (curSide !== 0) {
    r.decision = 'maint_watch';
    r.note = `Peso fuori banda (${bandTxt}). Una settimana da sola non basta per agire — monitora. Se anche il prossimo check è ${curSide > 0 ? 'sopra' : 'sotto'} la banda, si corregge.${infoTxt}`;
  } else {
    r.note = `Peso stabile (${bandTxt}). Settimana ${weeksInPhase}/${pb.maintenanceWeeks} di mantenimento.${infoTxt}`;
  }
  return r;
}

/* ── Transizioni di fase ─────────────────────────────────────────────────
   A fine fase l'app propone la successiva (mai automatico). buildTransition
   è pura: restituisce le modifiche al piano, le kcal di partenza e un
   riepilogo da far confermare. */

export type PhaseGoal = Exclude<Goal, '' | 'skinny_fat'>;
export interface PhaseTransition { to: PhaseGoal; patch: Partial<PianoBase>; startKcal: number; summary: string }

export function getTransitionTargets(decision: string): PhaseGoal[] {
  switch (decision) {
    case 'cut_target_reached': return ['reverse_diet'];
    case 'finished_reverse': return ['cut', 'bulk', 'maintenance'];
    case 'bulk_finished': case 'sf_f3_finished': return ['cut', 'maintenance'];
    case 'maint_complete': return ['cut', 'bulk'];
    default: return [];
  }
}

const PHASE_LABEL: Record<PhaseGoal, string> = { cut: 'Cut', bulk: 'Bulk', reverse_diet: 'Reverse Diet', maintenance: 'Mantenimento' };

export function buildTransition(pb: PianoBase, to: PhaseGoal, lastKcal: number, nowIso: string = new Date().toISOString()): PhaseTransition {
  const surplus = 1 + pb.bulkSurplusPct / 100;
  // Mantenimento di riferimento della nuova fase: da Reverse/Mantenimento è l'ultima kcal reale,
  // da Bulk (o SF fase 3) si toglie il surplus.
  // Dal Bulk il riferimento salvato all'ingresso vale più della divisione: durante il bulk le kcal si spostano (+3/+5%) e dividere per il surplus lo sfalserebbe.
  const M = pb.goal === 'bulk' && pb.phaseMaintenanceKcal ? pb.phaseMaintenanceKcal
    : pb.goal === 'bulk' || pb.goal === 'skinny_fat' ? Math.round(lastKcal / surplus) : lastKcal;
  const patch: Partial<PianoBase> = { goal: to, phaseStartedAt: nowIso, phaseMaintenanceKcal: to === 'reverse_diet' ? null : M, dbCurrentCycleWeek: 1 };
  // Un bulk senza criterio di fine non si chiuderebbe mai, e un criterio già soddisfatto lo chiuderebbe al primo check:
  // quelli già raggiunti vengono azzerati e, se non ne resta nessuno, si propone BF% di partenza +3 punti (modificabile).
  let bulkNote = '';
  if (to === 'bulk') {
    const bf = normalizeBodyFatPercent(pb.bodyFat), w = toNum(pb.weight);
    const maxBF = normalizeBodyFatPercent(pb.bulkMaxBF), tw = toNum(pb.bulkTargetWeight);
    const bfDone = !!maxBF && bf != null && bf >= maxBF, wDone = !!tw && w != null && w >= tw;
    let nextMax = bfDone ? '' : pb.bulkMaxBF, nextW = wDone ? '' : pb.bulkTargetWeight;
    if (!nextMax && !nextW && bf) nextMax = String(round(bf + 3, 1));
    if (nextMax !== pb.bulkMaxBF) patch.bulkMaxBF = nextMax;
    if (nextW !== pb.bulkTargetWeight) patch.bulkTargetWeight = nextW;
    if (bfDone || wDone) bulkNote = ' Criteri di fine precedenti già raggiunti: aggiornati.';
  }
  let startKcal: number, target: string;
  if (to === 'reverse_diet') { startKcal = lastKcal; target = 'risalita graduale verso il target Reverse'; }
  else if (to === 'maintenance') { startKcal = M; target = `peso stabile ±0,5% per ~${pb.maintenanceWeeks} settimane`; }
  else if (to === 'bulk') { startKcal = Math.round(M * surplus); target = `surplus +${pb.bulkSurplusPct}%, guadagno 0,25–0,5%/sett${patch.bulkMaxBF ? `, fine a BF ${patch.bulkMaxBF}%` : ''}`; }
  else { startKcal = computeInitialStartCalories({ ...pb, ...patch, goal: 'cut' }).startCalories; target = `ritmo −${pb.cutLossRate}%/sett, target BF ${pb.cutTargetBF}%`; }
  return { to, patch, startKcal, summary: `Passi a ${PHASE_LABEL[to]}: ${startKcal} kcal/die — ${target}.${bulkNote}` };
}

/* ── Plateau detection & aggiustamenti (Cut) ─────────────────────────── */
/* Segnale volutamente separato dalla decisione settimanale in
   computeCutWeeklyCheck: quella guarda se le ULTIME 2 settimane sono sotto
   il 50% del target (decide se tagliare le kcal, orizzonte breve). Questo
   conferma un plateau più profondo — 2-3 settimane con variazioni quasi
   nulle su almeno 2 metriche su 3 (peso, vita, BF%) — il concetto di
   "adattamento metabolico" del libro, che è un'informazione di contesto, non
   un altro innesco di taglio calorico: resta un banner informativo, senza
   toccare suggestedCalories. */

export interface PlateauInfo { isPlateauWeight: boolean; isPlateauWaist: boolean; isPlateauBF: boolean; consecutiveStalls: number; stalledMetrics: number; note: string }

export function detectPlateau(allStorico: DietCheckEntry[], pb?: PianoBase): PlateauInfo | null {
  // Con `pb` si guarda solo la fase in corso: baseline e check di chiusura di una transizione hanno le stesse misure e darebbero un falso plateau.
  const storico = pb ? getPhaseStorico(pb, allStorico) : allStorico;
  if (storico.length < 2) return null;
  // storico è ordinato dal più recente al meno recente: indice 0 = attuale, 1 = precedente.
  const [curr, prev] = storico;
  const prevW = toNum(prev.weeklyAvgWeight), currW = toNum(curr.weeklyAvgWeight);
  const prevWaist = toNum(prev.weeklyMeasureWaist), currWaist = toNum(curr.weeklyMeasureWaist);
  const prevBF = normalizeBodyFatPercent(prev.checkBodyFat), currBF = normalizeBodyFatPercent(curr.checkBodyFat);

  const weightDelta = prevW != null && currW != null ? Math.abs(currW - prevW) : null;
  const isPlateauWeight = weightDelta != null && weightDelta < 0.1;
  const waistDelta = prevWaist != null && currWaist != null ? Math.abs(currWaist - prevWaist) : null;
  const isPlateauWaist = waistDelta != null && waistDelta < 0.5;
  const bfDelta = prevBF != null && currBF != null ? Math.abs(currBF - prevBF) : null;
  const isPlateauBF = bfDelta != null && bfDelta < 0.3;

  let consecutiveStalls = 0;
  for (let i = 0; i < storico.length - 1; i++) {
    const b = storico[i], a = storico[i + 1]; // b più recente di a
    const an = toNum(a.weeklyAvgWeight), bn = toNum(b.weeklyAvgWeight);
    const dW = an != null && bn != null ? Math.abs(bn - an) : null;
    if (dW != null && dW < 0.15) consecutiveStalls++; else break;
    if (consecutiveStalls >= 3) break;
  }

  const stalledMetrics = [isPlateauWeight, isPlateauWaist, isPlateauBF].filter(Boolean).length;
  const confirmed = stalledMetrics >= 2 && consecutiveStalls >= 2;
  if (!confirmed) return null;

  return {
    isPlateauWeight, isPlateauWaist, isPlateauBF, consecutiveStalls, stalledMetrics,
    note: `${consecutiveStalls} settimane consecutive senza progressione su ${stalledMetrics} metriche (peso, vita, BF%). Adattamento metabolico confermato.`,
  };
}

export interface AdjustmentOption { label: string; kcal: number; note: string }

export function buildAdjustmentOptions(pb: PianoBase, prevCal: number): AdjustmentOption[] {
  const lbm = computeLBM(pb), wN = toNum(pb.weight) || 0;
  const base = lbm || wN;
  const proteinKcal = Math.round(pb.proteinPerKgLBM * base * 4);
  const nonProteinKcal = Math.max(0, prevCal - proteinKcal);
  const adj5 = Math.round(prevCal - nonProteinKcal * 0.05);
  const adj10 = Math.round(prevCal - nonProteinKcal * 0.10);
  const adj15 = Math.round(prevCal - nonProteinKcal * 0.15);
  return [
    { label: '−5% carbs+grassi', kcal: adj5, note: 'Riduzione conservativa. Prima scelta raccomandata dal libro (cap.10).' },
    { label: '−10% carbs+grassi', kcal: adj10, note: "Solo se −5% non ha prodotto risultati dopo 2 settimane." },
    { label: '−15% carbs+grassi', kcal: adj15, note: 'Estremo del range del libro (cap.10). Solo se anche −10% non ha prodotto risultati.' },
    { label: '+attività fisica', kcal: prevCal, note: 'In alternativa alla riduzione calorica: +5–10% volume cardio. Proteine invariate.' },
  ];
}

/* ── Underestimation nudge (fasi di deficit — Cut e SF Fase 1 — ≥3 settimane) ── */
// Prima limitato a isCut(pb): la Skinny Fat Fase 1 è a tutti gli effetti una
// fase di deficit (in-app "Fase 1 — Cut", v. SF_PHASES) e non riceveva mai
// questo nudge, pur potendo sottostimare l'apporto calorico allo stesso modo.

export function computeUnderestimationWarning(pb: PianoBase, allStorico: DietCheckEntry[]): string | null {
  const storico = getPhaseStorico(pb, allStorico); // solo la fase in corso (v. detectPlateau)
  const inDeficit = isCut(pb) || (isSF(pb) && pb.sfPhase === 1);
  if (!inDeficit || storico.length < 3) return null;
  const wN = toNum(pb.weight) || 0;
  const targetLossKg = isCut(pb)
    ? wN * pb.cutLossRate / 100
    : (estimateMaintenance(pb).maintenance * (pb.sfDeficitPct / 100) * 7) / 7700;
  let slowWeeks = 0;
  // storico è ordinato dal più recente al meno recente: le 3 voci più recenti sono le prime 3.
  const recent = storico.slice(0, 3);
  for (let i = 0; i < recent.length - 1; i++) {
    const currW = toNum(recent[i].weeklyAvgWeight), prevW = toNum(recent[i + 1].weeklyAvgWeight);
    if (prevW == null || currW == null) continue;
    const actualLoss = prevW - currW;
    if (actualLoss < targetLossKg * 0.3) slowWeeks++;
  }
  if (slowWeeks >= 2) {
    return `Nelle ultime ${slowWeeks + 1} settimane la perdita di peso è significativamente sotto il target (${round(targetLossKg, 2)} kg/sett). Il libro segnala che molte persone sottostimano l'apporto calorico fino al 50%. Controlla: porzioni, condimenti, bevande caloriche, morsi e assaggi non tracciati.`;
  }
  return null;
}

/* ── Storico: entry builders + etichette tabella ─────────────────────── */

export function buildBaselineEntry(pb: PianoBase, startKcal?: number): DietCheckEntry {
  const sc = startKcal ?? computeInitialStartCalories(pb).startCalories;
  return {
    date: new Date().toISOString(), weeksPassed: 0, isBaseline: true,
    weeklyAvgWeight: pb.weight, checkBodyFat: pb.bodyFat,
    weeklyMeasureWaist: pb.measureWaist,
    weeklySkinfoldChest: pb.measureChest, weeklySkinfoldAbdomen: pb.measureAbdomen,
    weeklySkinfoldTricep: pb.measureTricep, weeklySkinfoldSuprailiac: pb.measureSuprailiac, weeklySkinfoldThigh: pb.measureThigh,
    weeklySkinfoldSubscapular: pb.measureSubscapular, weeklySkinfoldMidaxillary: pb.measureMidaxillary,
    dayWeights: ['', '', '', '', '', '', ''], currentCalories: sc,
    goal: pb.goal, approachKey: pb.approachKey, reverseTargetBand: pb.reverseTargetBand,
    sfPhase: pb.sfPhase, sfTargetBF: pb.sfTargetBF, sfDeficitPct: pb.sfDeficitPct,
    cutLossRate: pb.cutLossRate, cutTargetBF: pb.cutTargetBF, dbCurrentCycleWeek: pb.dbCurrentCycleWeek,
    subjEnergy: 0, subjHunger: 0, subjMood: 0, subjSleep: 0, subjStrength: 0,
  };
}

export function getEntryGoalLabel(e: DietCheckEntry): string {
  if (!e.goal) return '—';
  if (e.goal === 'cut') return `Cut −${e.cutLossRate || 0.6}%/sett`;
  if (e.goal === 'reverse_diet') return `Reverse · ${(e.approachKey || 'con').slice(0, 3).toUpperCase()}`;
  if (e.goal === 'skinny_fat') return `SF · F${e.sfPhase || 1}`;
  if (e.goal === 'bulk') return 'Bulk';
  if (e.goal === 'maintenance') return 'Mantenimento';
  return e.goal;
}

/* Etichetta del protocollo attivo a partire dal pianoBase — usata dove non si
   ha a disposizione l'ultima entry di storico (es. riepilogo home). */
export function getProtocolLabel(pb: PianoBase): string {
  if (!pb.goal) return '—';
  if (pb.goal === 'cut') return `Cut −${pb.cutLossRate ?? 0.6}%/sett`;
  if (pb.goal === 'reverse_diet') return `Reverse · ${APPROACHES[pb.approachKey]?.label ?? pb.approachKey}`;
  if (pb.goal === 'skinny_fat') {
    const phase = SF_PHASES[pb.sfPhase];
    const short = phase ? phase.label.split('—').pop()!.trim() : `Fase ${pb.sfPhase}`;
    return `Skinny Fat · ${short}`;
  }
  if (pb.goal === 'bulk') return `Bulk +${pb.bulkSurplusPct ?? 7}%`;
  if (pb.goal === 'maintenance') return 'Mantenimento';
  return pb.goal;
}

export function getEntryTarget(pb: PianoBase, e: DietCheckEntry): string {
  if (e.goal === 'cut') return `BF ${e.cutTargetBF ?? '—'}%`;
  if (e.goal === 'reverse_diet') {
    const meta = getReverseTargetMeta(pb);
    return meta.targetKcal ? `${meta.targetKcal} kcal` : '— kcal';
  }
  if (e.goal === 'maintenance') return 'Peso stabile ±0,5%';
  if (e.goal === 'bulk') return pb.bulkMaxBF ? `BF ${pb.bulkMaxBF}%` : pb.bulkTargetWeight ? `${pb.bulkTargetWeight} kg` : '—';
  if (e.goal === 'skinny_fat') return e.sfPhase === 1 ? `BF ${e.sfTargetBF ?? pb.sfTargetBF}%` : e.sfPhase === 2 ? 'Range normale' : pb.bulkMaxBF ? `BF ${pb.bulkMaxBF}%` : pb.bulkTargetWeight ? `${pb.bulkTargetWeight} kg` : `+${pb.bulkSurplusPct}% surplus`;
  return '—';
}

/* ── Regressione lineare (per il grafico peso/kcal) ──────────────────── */

export function linReg(pts: { x: number; y: number }[]): ((x: number) => number) | null {
  const n = pts.length; if (n < 2) return null;
  const sx = pts.reduce((a, p) => a + p.x, 0), sy = pts.reduce((a, p) => a + p.y, 0);
  const sxy = pts.reduce((a, p) => a + p.x * p.y, 0), sx2 = pts.reduce((a, p) => a + p.x * p.x, 0);
  const d = n * sx2 - sx * sx; if (d === 0) return null;
  const m = (n * sxy - sx * sy) / d, b = (sy - m * sx) / n;
  return (x: number) => m * x + b;
}

/* ── Default ──────────────────────────────────────────────────────────── */

export function defaultPianoBase(): PianoBase {
  return {
    sex: 'male', age: 37, birthDate: '', height: 168, weight: '', bodyFat: '', goal: '',
    measuredMaintenance: '', lifestyleFactor: 0.7, exerciseFactor: 0.75,
    proteinPerKgLBM: 2.2, carbPercentOfRemaining: 0.65,
    approachKey: 'conservative', tdeeMethod: 'media',
    measureWaist: '', measureChest: '', measureAbdomen: '', measureTricep: '', measureSuprailiac: '', measureThigh: '',
    measureSubscapular: '', measureMidaxillary: '', preferJp3Hip: true,
    sfPhase: 1, sfDeficitPct: 15, sfTargetBF: 13,
    savedAt: new Date().toISOString(),
    reverseTargetBand: 'normale', reverseProteinPreset: 'high', reverseTargetCpk: null,
    cutLossRate: 0.6, cutTargetBF: 12,
    refeedEnabled: false, refeedDays: 1, refeedSurplus: 300,
    dietBreakEnabled: false, dbDeficitWeeks: 3, dbBreakWeeks: 1, dbCurrentCycleWeek: 1,
    bulkSurplusPct: 7, bulkMaxBF: '', bulkTargetWeight: '', maintenanceWeeks: 6, phaseStartedAt: '', phaseMaintenanceKcal: null,
  };
}
