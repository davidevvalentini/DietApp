import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { writeJsonAtomic, withFileLock } from '@/lib/atomic-write';
import { snapshot } from '@/lib/diet-versions';
import { defaultPianoBase as calcDefaultPianoBase, type PianoBase, type DietCheckEntry } from '@/lib/diet-calc';

const DATA = path.join(process.cwd(), 'data', 'diet.json');

// ── v1.5 Types ────────────────────────────────────────────────────────────────
// PianoBase e DietCheckEntry vengono da @/lib/diet-calc invece di essere
// ridefiniti qui: due copie dello stesso tipo divergono nel tempo (è già
// successo — questa copia locale mancava weeklyMeasureChest/Thigh,
// cutLossRate, refeedEnabled/dietBreakEnabled, i campi subj*...), e ovunque
// il codice sotto ricostruisce un oggetto campo per campo invece di limitarsi
// a fare spread, i campi mancanti dal tipo locale sparivano silenziosamente.

interface DietDataV15 {
  version:    '1.5';
  pianoBase:  PianoBase;
  storico:    DietCheckEntry[];
  savedAt:    string;
}

// ── Legacy types ────────────────────────────────────────────────────────────────

interface DietEntry {
  date:                   string;
  sex:                    string;
  age:                    number;
  height:                 number;
  weight:                 number;
  bodyFat:                number;
  goal:                   string;
  measuredMaintenance:     string;
  lifestyleFactor:        number;
  exerciseFactor:         number;
  proteinPerKgLBM:        number;
  carbPercentOfRemaining: number;
  approachKey:            string;
  tdeeMethod:             string;
  measureWaist:           string;
  measureHips:            string;
  measureArm:             string;
  weeklyAvgWeight:        string;
  weeksPassed:            number;
  checkBodyFat:           string;
  weeklyMeasureWaist:     string;
  weeklyMeasureHips:      string;
  weeklyMeasureArm:       string;
  dayWeights:             string[];
  currentCalories:        number | null;
  plan:                   { startCalories: number };
}

interface DietDataLegacy {
  current: DietEntry | null;
  history: DietEntry[];
}

// ── File helpers ────────────────────────────────────────────────────────────────

function readLegacy(): DietDataLegacy {
  try {
    if (!fs.existsSync(DATA)) return { current: null, history: [] };
    const raw = JSON.parse(fs.readFileSync(DATA, 'utf-8'));
    // Detect v1.5 format
    if (raw.version === '1.5' || raw.pianoBase !== undefined) return null as unknown as DietDataLegacy;
    return raw;
  } catch { return { current: null, history: [] }; }
}

function readV15(): DietDataV15 | null {
  try {
    if (!fs.existsSync(DATA)) return null;
    const raw = JSON.parse(fs.readFileSync(DATA, 'utf-8'));
    if (raw.version === '1.5') return raw as DietDataV15;
    return null;
  } catch { return null; }
}

function writeV15(data: DietDataV15): void {
  const dir = path.dirname(DATA);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  writeJsonAtomic(DATA, data);
}

function toV15(legacy: DietDataLegacy): DietDataV15 {
  const last = legacy.current ?? legacy.history[0];
  const base = calcDefaultPianoBase();
  const pianoBase: PianoBase = last ? {
    ...base,
    sex:               (last.sex as PianoBase['sex'])  ?? base.sex,
    age:               last.age               ?? base.age,
    height:            last.height            ?? base.height,
    weight:            String(last.weight     ?? base.weight),
    bodyFat:           String(last.bodyFat    ?? base.bodyFat),
    goal:              (last.goal as PianoBase['goal']) ?? base.goal,
    measuredMaintenance:last.measuredMaintenance?? base.measuredMaintenance,
    lifestyleFactor:   last.lifestyleFactor   ?? base.lifestyleFactor,
    exerciseFactor:    last.exerciseFactor    ?? base.exerciseFactor,
    proteinPerKgLBM:   last.proteinPerKgLBM   ?? base.proteinPerKgLBM,
    carbPercentOfRemaining: last.carbPercentOfRemaining ?? base.carbPercentOfRemaining,
    approachKey:       (last.approachKey as PianoBase['approachKey']) ?? base.approachKey,
    tdeeMethod:        (last.tdeeMethod as PianoBase['tdeeMethod'])   ?? base.tdeeMethod,
    measureWaist:      last.measureWaist       ?? base.measureWaist,
    sfPhase:           (last as unknown as Record<string,unknown>).sfPhase           as number ?? base.sfPhase,
    sfDeficitPct:      (last as unknown as Record<string,unknown>).sfDeficitPct      as number ?? base.sfDeficitPct,
    sfTargetBF:        (last as unknown as Record<string,unknown>).sfTargetBF        as number ?? base.sfTargetBF,
    savedAt:           last.date              ?? new Date().toISOString(),
  } : base;

  const storico: DietCheckEntry[] = legacy.history.map(e => ({
    date:               e.date,
    weeksPassed:        e.weeksPassed,
    weeklyAvgWeight:    e.weeklyAvgWeight,
    checkBodyFat:       e.checkBodyFat,
    weeklyMeasureWaist: e.weeklyMeasureWaist,
    weeklyMeasureHips:  e.weeklyMeasureHips  ?? '',
    weeklyMeasureArm:   e.weeklyMeasureArm   ?? '',
    weeklySkinfoldChest: '',
    weeklySkinfoldAbdomen: '',
    weeklySkinfoldTricep: '',
    weeklySkinfoldSuprailiac: '',
    weeklySkinfoldThigh: '',
    dayWeights:         e.dayWeights,
    currentCalories:    e.currentCalories,
    goal:               e.goal as DietCheckEntry['goal'],
    approachKey:        e.approachKey as DietCheckEntry['approachKey'],
    reverseTargetBand:  base.reverseTargetBand,
    sfPhase:            (e as unknown as Record<string,unknown>).sfPhase as number ?? 1,
    cutLossRate:        base.cutLossRate,
    cutTargetBF:        base.cutTargetBF,
    dbCurrentCycleWeek: base.dbCurrentCycleWeek,
    subjEnergy: 0, subjHunger: 0, subjMood: 0, subjSleep: 0, subjStrength: 0,
  }));

  return {
    version:    '1.5',
    pianoBase,
    storico:    storico.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    savedAt:    new Date().toISOString(),
  };
}

// ── GET ────────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const v15 = readV15();
    if (v15) return NextResponse.json(v15);

    const legacy = readLegacy();
    if (legacy.history.length > 0 || legacy.current) {
      const migrated = toV15(legacy);
      writeV15(migrated);
      return NextResponse.json(migrated);
    }

    return NextResponse.json({ version: '1.5', pianoBase: calcDefaultPianoBase(), storico: [], savedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[GET /api/diet]', err);
    return NextResponse.json({ error: 'Failed to load diet data' }, { status: 500 });
  }
}

// ── POST ───────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    return await withFileLock('diet.json', async () => {
    const v15   = readV15() ?? { version: '1.5', pianoBase: calcDefaultPianoBase(), storico: [], savedAt: new Date().toISOString() };

    // Stato precedente all'azione corrente, per lo snapshot di backup — va
    // preso PRIMA di ogni mutazione qui sotto. `storico` è copiato al primo
    // livello perché push/splice/sort sotto mutano l'array in place.
    const prevPianoBase = v15.pianoBase;
    const prevStorico   = [...v15.storico];

    // ── v1.5 actions ────────────────────────────────────────────────────────

    if (body.action === 'saveBase') {
      // Save/update piano base (from "Vai al Check")
      await snapshot({ pianoBase: prevPianoBase, storico: prevStorico });
      v15.pianoBase = { ...v15.pianoBase, ...body.pianoBase, savedAt: new Date().toISOString() };
      v15.savedAt   = new Date().toISOString();
      writeV15(v15);
      return NextResponse.json({ success: true, pianoBase: v15.pianoBase });
    }

    if (body.action === 'saveEntry') {
      // Add/update a check entry in storico (from acceptSuggestion / save without evaluate)
      await snapshot({ pianoBase: prevPianoBase, storico: prevStorico });
      const entry: DietCheckEntry = {
        date:               new Date().toISOString(),
        ...body.entry,
      };
      // Una entry per giorno *e per obiettivo*: in una transizione di fase il check di chiusura
      // (fase vecchia) e la baseline (fase nuova) cadono nello stesso giorno e devono convivere.
      const idx = v15.storico.findIndex(e =>
        e.goal === entry.goal && new Date(e.date).toDateString() === new Date(entry.date).toDateString()
      );
      if (idx >= 0) v15.storico[idx] = entry;
      else v15.storico.push(entry);
      v15.storico.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      v15.savedAt = new Date().toISOString();
      writeV15(v15);
      return NextResponse.json({ success: true, entry, storico: v15.storico });
    }

    if (body.action === 'updateEntry') {
      // Edit an existing storico entry, identified by its original date
      const idx = v15.storico.findIndex(e => e.date === body.originalDate);
      if (idx < 0) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
      await snapshot({ pianoBase: prevPianoBase, storico: prevStorico });
      v15.storico[idx] = { ...v15.storico[idx], ...body.entry, date: v15.storico[idx].date };
      v15.storico.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      v15.savedAt = new Date().toISOString();
      writeV15(v15);
      return NextResponse.json({ success: true, storico: v15.storico });
    }

    if (body.action === 'deleteEntry') {
      // Remove a single storico entry, identified by its date
      const idx = v15.storico.findIndex(e => e.date === body.date);
      if (idx < 0) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
      await snapshot({ pianoBase: prevPianoBase, storico: prevStorico });
      v15.storico.splice(idx, 1);
      v15.savedAt = new Date().toISOString();
      writeV15(v15);
      return NextResponse.json({ success: true, storico: v15.storico });
    }

    if (body.action === 'loadEntry') {
      const entry = v15.storico[body.index ?? 0];
      if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
      return NextResponse.json({ success: true, entry });
    }

    if (body.action === 'clear') {
      await snapshot({ pianoBase: prevPianoBase, storico: prevStorico });
      v15.storico = [];
      v15.savedAt = new Date().toISOString();
      writeV15(v15);
      return NextResponse.json({ success: true });
    }

    // ── Legacy action ────────────────────────────────────────────────────────
    // Migrate on first legacy save
    if (body.action === 'save' && body.entry) {
      await snapshot({ pianoBase: prevPianoBase, storico: prevStorico });
      const legacy: DietDataLegacy = { current: null, history: [] };
      // Spread invece di elencare i campi uno per uno: qui prima si perdevano
      // silenziosamente tutti i campi non esplicitamente ricopiati (vedi nota
      // sui tipi in cima al file).
      const entry: DietCheckEntry = {
        goal:               v15.pianoBase.goal,
        approachKey:        v15.pianoBase.approachKey,
        sfPhase:            v15.pianoBase.sfPhase,
        ...body.entry,
        date:               new Date().toISOString(),
      };
      v15.storico.push(entry);
      v15.storico.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      v15.pianoBase = {
        ...v15.pianoBase,
        sex:               body.entry.sex               ?? v15.pianoBase.sex,
        age:               body.entry.age               ?? v15.pianoBase.age,
        height:            body.entry.height            ?? v15.pianoBase.height,
        weight:            body.entry.weight            ?? v15.pianoBase.weight,
        bodyFat:           body.entry.bodyFat           ?? v15.pianoBase.bodyFat,
        goal:              body.entry.goal              ?? v15.pianoBase.goal,
        measuredMaintenance:body.entry.measuredMaintenance?? v15.pianoBase.measuredMaintenance,
        lifestyleFactor:   body.entry.lifestyleFactor   ?? v15.pianoBase.lifestyleFactor,
        exerciseFactor:    body.entry.exerciseFactor    ?? v15.pianoBase.exerciseFactor,
        proteinPerKgLBM:   body.entry.proteinPerKgLBM   ?? v15.pianoBase.proteinPerKgLBM,
        carbPercentOfRemaining: body.entry.carbPercentOfRemaining ?? v15.pianoBase.carbPercentOfRemaining,
        approachKey:       body.entry.approachKey        ?? v15.pianoBase.approachKey,
        tdeeMethod:        body.entry.tdeeMethod         ?? v15.pianoBase.tdeeMethod,
        measureWaist:      body.entry.measureWaist       ?? v15.pianoBase.measureWaist,
        measureChest:      body.entry.measureChest       ?? v15.pianoBase.measureChest,
        measureAbdomen:    body.entry.measureAbdomen     ?? v15.pianoBase.measureAbdomen,
        measureTricep:     body.entry.measureTricep      ?? v15.pianoBase.measureTricep,
        measureSuprailiac: body.entry.measureSuprailiac  ?? v15.pianoBase.measureSuprailiac,
        measureThigh:      body.entry.measureThigh       ?? v15.pianoBase.measureThigh,
        sfPhase:           body.entry.sfPhase            ?? v15.pianoBase.sfPhase,
        sfDeficitPct:      body.entry.sfDeficitPct       ?? v15.pianoBase.sfDeficitPct,
        sfTargetBF:        body.entry.sfTargetBF         ?? v15.pianoBase.sfTargetBF,
        savedAt:           new Date().toISOString(),
      };
      v15.savedAt = new Date().toISOString();
      writeV15(v15);
      return NextResponse.json({ success: true, storico: v15.storico, pianoBase: v15.pianoBase });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    });
  } catch (err) {
    console.error('[POST /api/diet]', err);
    return NextResponse.json({ error: 'Failed to save diet data' }, { status: 500 });
  }
}
