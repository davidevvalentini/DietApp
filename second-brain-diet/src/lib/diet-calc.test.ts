import { describe, expect, it } from 'vitest';
import { mkEntry, mkPb } from '@/lib/__fixtures__/diet-helpers';
import type { PianoBase } from '@/lib/diet-calc';
import {
  buildBaselineEntry, computeInitialStartCalories, defaultPianoBase, getEntryGoalLabel, getEntryTarget,
  getPhaseStorico, getProtocolLabel, resolvePhaseStart, validateInput,
} from '@/lib/diet-calc';

describe('modello dati bulk/mantenimento', () => {
  it('defaultPianoBase ha i default nuovi', () => {
    const d = defaultPianoBase();
    expect(d.bulkSurplusPct).toBe(7);
    expect(d.maintenanceWeeks).toBe(6);
    expect(d.phaseStartedAt).toBe('');
    expect(d.phaseMaintenanceKcal).toBeNull();
    expect(d.bulkMaxBF).toBe('');
    expect(d.bulkTargetWeight).toBe('');
  });
});

describe('validateInput bulk', () => {
  it('richiede almeno un criterio di fine', () => {
    expect(validateInput(mkPb({ goal: 'bulk' }))).toContain('Bulk: imposta almeno un criterio di fine (BF% massimo o peso target)');
  });
  it('rifiuta un peso target non maggiore del peso attuale', () => {
    expect(validateInput(mkPb({ goal: 'bulk', bulkTargetWeight: '69' }))).toContain('Bulk: il peso target deve essere maggiore del peso attuale');
  });
  it('rifiuta un surplus fuori range', () => {
    expect(validateInput(mkPb({ goal: 'bulk', bulkMaxBF: '18', bulkSurplusPct: 12 }))).toContain('Bulk: surplus tra 5% e 10%');
  });
  it('accetta una configurazione valida', () => {
    const errs = validateInput(mkPb({ goal: 'bulk', bulkMaxBF: '18', bulkSurplusPct: 7 }));
    expect(errs.filter(e => e.startsWith('Bulk:'))).toEqual([]);
  });
  it('applica le stesse regole alla fase 3 dello Skinny Fat', () => {
    expect(validateInput(mkPb({ goal: 'skinny_fat', sfPhase: 3 }))).toContain('Bulk: imposta almeno un criterio di fine (BF% massimo o peso target)');
    expect(validateInput(mkPb({ goal: 'skinny_fat', sfPhase: 1 })).filter(e => e.startsWith('Bulk:'))).toEqual([]);
  });
});

describe('getPhaseStorico / resolvePhaseStart', () => {
  const storico = [
    mkEntry({ date: '2026-10-12T06:00:00Z', goal: 'cut' }),
    mkEntry({ date: '2026-10-05T06:00:00Z', goal: 'bulk' }),
    mkEntry({ date: '2026-09-28T06:00:00Z', goal: 'bulk' }),
    mkEntry({ date: '2026-09-20T06:00:00Z', goal: 'reverse_diet' }),
  ];
  it('filtra per goal e data di inizio fase', () => {
    const pb = mkPb({ goal: 'bulk', phaseStartedAt: '2026-09-25T00:00:00Z' });
    expect(getPhaseStorico(pb, storico).map(e => e.date)).toEqual(['2026-10-05T06:00:00Z', '2026-09-28T06:00:00Z']);
  });
  it('senza phaseStartedAt usa il blocco iniziale consecutivo (bulk dietro un cut → vuoto)', () => {
    expect(getPhaseStorico(mkPb({ goal: 'bulk' }), storico)).toEqual([]);
    expect(getPhaseStorico(mkPb({ goal: 'cut' }), storico).map(e => e.date)).toEqual(['2026-10-12T06:00:00Z']);
  });
  it('senza phaseStartedAt, bulk in testa → le due entry bulk', () => {
    expect(getPhaseStorico(mkPb({ goal: 'bulk' }), storico.slice(1)).length).toBe(2);
  });
  it('resolvePhaseStart su piano legacy reverse = data della entry più vecchia del blocco', () => {
    const legacy = [
      mkEntry({ date: '2026-10-10T06:00:00Z', goal: 'reverse_diet' }),
      mkEntry({ date: '2026-09-28T10:25:20Z', goal: 'reverse_diet' }),
      mkEntry({ date: '2026-09-12T06:46:50Z', goal: 'skinny_fat' }),
    ];
    expect(resolvePhaseStart(mkPb({ goal: 'reverse_diet' }), legacy)).toBe('2026-09-28T10:25:20Z');
    expect(resolvePhaseStart(mkPb({ goal: 'reverse_diet', phaseStartedAt: '2026-09-01T00:00:00Z' }), legacy)).toBe('2026-09-01T00:00:00Z');
    expect(resolvePhaseStart(mkPb({ goal: 'bulk' }), legacy)).toBe('');
  });
});

describe('computeInitialStartCalories bulk/mantenimento', () => {
  it('bulk = mantenimento × (1 + surplus)', () => {
    expect(computeInitialStartCalories(mkPb({ goal: 'bulk', bulkSurplusPct: 7 })).startCalories).toBe(2140);
  });
  it('mantenimento = mantenimento', () => {
    expect(computeInitialStartCalories(mkPb({ goal: 'maintenance' })).startCalories).toBe(2000);
  });
  it('phaseMaintenanceKcal ha la precedenza sulla stima', () => {
    expect(computeInitialStartCalories(mkPb({ goal: 'maintenance', phaseMaintenanceKcal: 2050 })).startCalories).toBe(2050);
    expect(computeInitialStartCalories(mkPb({ goal: 'bulk', phaseMaintenanceKcal: 2050 })).startCalories).toBe(2194);
    const cutDefault = computeInitialStartCalories(mkPb({ goal: 'cut' })).startCalories;
    const cutRef = computeInitialStartCalories(mkPb({ goal: 'cut', phaseMaintenanceKcal: 2050 })).startCalories;
    expect(cutRef - cutDefault).toBe(50);
  });
  it('SF fase 3 usa bulkSurplusPct', () => {
    expect(computeInitialStartCalories(mkPb({ goal: 'skinny_fat', sfPhase: 3, bulkSurplusPct: 8 })).startCalories).toBe(2160);
  });
});

describe('buildBaselineEntry', () => {
  it('startKcal sovrascrive currentCalories', () => {
    expect(buildBaselineEntry(mkPb({ goal: 'bulk' }), 2222).currentCalories).toBe(2222);
    expect(buildBaselineEntry(mkPb({ goal: 'bulk' })).currentCalories).toBe(2140);
  });
});

describe('etichette', () => {
  it('maintenance e bulk', () => {
    expect(getProtocolLabel(mkPb({ goal: 'maintenance' }))).toBe('Mantenimento');
    expect(getProtocolLabel(mkPb({ goal: 'bulk', bulkSurplusPct: 7 }))).toBe('Bulk +7%');
    expect(getEntryGoalLabel(mkEntry({ date: '2026-10-01', goal: 'maintenance' }))).toBe('Mantenimento');
    expect(getEntryGoalLabel(mkEntry({ date: '2026-10-01', goal: 'bulk' }))).toBe('Bulk');
    expect(getEntryTarget(mkPb({ goal: 'maintenance' }), mkEntry({ date: '2026-10-01', goal: 'maintenance' }))).toBe('Peso stabile ±0,5%');
  });
});

/* Nota: nella copia pubblica sono omessi i test di regressione su dati reali dell'autore. */

/* ── Task 2: check settimanale Bulk ───────────────────────────────────── */

import { computeBulkWeeklyCheck, computeWeeklyCheck, type DietCheckEntry } from '@/lib/diet-calc';

const bulkPb = (over = {}) => mkPb({ goal: 'bulk', bulkMaxBF: '18', bulkTargetWeight: '75', ...over });
/** storico di fase, dal più recente al più vecchio: [peso, vita?] — l'ultimo elemento è la baseline. */
const phase = (goal: 'bulk' | 'cut' | 'maintenance', rows: [string, string?][]): DietCheckEntry[] =>
  rows.map(([w, waist], i) => mkEntry({
    date: `2026-10-${String(14 - i).padStart(2, '0')}T06:00:00Z`, goal, weeklyAvgWeight: w,
    weeklyMeasureWaist: waist ?? '80', checkBodyFat: '15', isBaseline: i === rows.length - 1,
  }));

describe('computeBulkWeeklyCheck', () => {
  const run = (rows: [string, string?][], avgW: number | null, waist = '80', bf: number | null = 15, prevCal = 2140, over = {}) =>
    computeBulkWeeklyCheck(bulkPb(over), phase('bulk', rows), prevCal, avgW, bf, { waist });

  it('bulk_finished su BF% massimo', () => {
    const r = run([['70']], 71, '80', 18);
    expect(r.decision).toBe('bulk_finished'); expect(r.bulkEnd).toBe('bf'); expect(r.suggestedCalories).toBe(2140);
  });
  it('bulk_finished su peso target', () => {
    const r = run([['74.5']], 75);
    expect(r.decision).toBe('bulk_finished'); expect(r.bulkEnd).toBe('weight');
  });
  it('senza criteri di fine non finisce mai', () => {
    const r = run([['90']], 90.3, '80', 25, 2140, { bulkMaxBF: '', bulkTargetWeight: '' });
    expect(r.decision).not.toBe('bulk_finished');
  });
  it('bulk_on_track con guadagno nel range (0,25–0,5%)', () => {
    const r = run([['70']], 70.25);
    expect(r.decision).toBe('bulk_on_track'); expect(r.suggestedCalories).toBe(2140);
    expect(r.minGainKg).toBeCloseTo(0.175, 2); expect(r.maxGainKg).toBeCloseTo(0.35, 2);
  });
  it('bulk_watch_slow alla prima settimana sotto range', () => {
    expect(run([['70']], 70.05).decision).toBe('bulk_watch_slow');
  });
  it('bulk_slow_confirmed alla seconda: opzioni +3% / +5%', () => {
    const r = run([['70.05'], ['70']], 70.1, '80', 15, 2000);
    expect(r.decision).toBe('bulk_slow_confirmed');
    expect(r.options!.lo.suggestedCalories).toBe(2060);
    expect(r.options!.hi.suggestedCalories).toBe(2100);
  });
  it('bulk_watch_fast: sopra range con vita in salita, prima settimana', () => {
    expect(run([['70']], 70.6, '80.5').decision).toBe('bulk_watch_fast');
  });
  it('bulk_fast_confirmed alla seconda: opzioni −3% / −5%', () => {
    const r = run([['70.6', '80.5'], ['70', '80']], 71.2, '81');
    expect(r.decision).toBe('bulk_fast_confirmed');
    expect(r.options!.lo.suggestedCalories).toBe(2076);
    expect(r.options!.hi.suggestedCalories).toBe(2033);
  });
  it('bulk_watch_fast_stable: sopra range ma composizione stabile', () => {
    const r = run([['70']], 70.6, '80');
    expect(r.decision).toBe('bulk_watch_fast_stable'); expect(r.suggestedCalories).toBe(2140);
  });
  it('kcal sempre tra mantenimento e mantenimento +10%', () => {
    const up = run([['70.05'], ['70']], 70.1, '80', 15, 2150);
    expect(Math.max(up.options!.lo.suggestedCalories, up.options!.hi.suggestedCalories)).toBeLessThanOrEqual(2200);
    expect(up.options!.hi.suggestedCalories).toBe(2200);
    const down = run([['70.6', '80.5'], ['70', '80']], 71.2, '81', 15, 2010);
    expect(Math.min(down.options!.lo.suggestedCalories, down.options!.hi.suggestedCalories)).toBeGreaterThanOrEqual(2000);
  });
  it('campi vuoti o parziali: nessuna eccezione, kcal finite', () => {
    for (const r of [
      run([['70']], null), run([['']], 70.3), run([['70']], 70.3, '', 15), run([['70']], 70.3, '', null),
      run([['70.05', ''], ['70', '']], 70.1, '', 15.5),
    ]) { expect(Number.isFinite(r.suggestedCalories)).toBe(true); expect(r.decision).toBeTruthy(); }
  });
  it('fase con una sola entry: mai *_confirmed', () => {
    expect(run([['70']], 70.01).decision).not.toMatch(/confirmed/);
    expect(run([['70']], 71, '82').decision).not.toMatch(/confirmed/);
  });
});

describe('computeWeeklyCheck: dispatch e storico di fase', () => {
  it('bulk viene instradato al check bulk', () => {
    const r = computeWeeklyCheck(bulkPb(), phase('bulk', [['70']]), 2140, 70.25, 15, { waist: '80' });
    expect(r.decision).toBe('bulk_on_track'); expect(r.isBulk).toBe(true); expect(r.isMaintenance).toBe(false);
  });
  it('Cut dopo un Bulk non vede il peso del bulk come settimana scorsa', () => {
    // baseline Cut 71 kg (14/10) davanti a un'entry bulk 70.4 (07/10): senza scoping prevWeekUnderTarget sarebbe vero
    const st = [
      mkEntry({ date: '2026-10-14T06:00:00Z', goal: 'cut', weeklyAvgWeight: '71', isBaseline: true }),
      mkEntry({ date: '2026-10-07T06:00:00Z', goal: 'bulk', weeklyAvgWeight: '70.4' }),
    ];
    const r = computeWeeklyCheck(mkPb({ goal: 'cut', weight: '71', phaseStartedAt: '2026-10-14T00:00:00Z' }), st, 1600, 71, 15, { waist: '80' });
    expect(r.decision).not.toBe('cut_stalled_confirmed');
  });
  it('SF fase 3 delega al check bulk con prefisso sf_f3_', () => {
    const st = [mkEntry({ date: '2026-10-14T06:00:00Z', goal: 'skinny_fat', sfPhase: 3, weeklyAvgWeight: '70', isBaseline: true })];
    const r = computeWeeklyCheck(mkPb({ goal: 'skinny_fat', sfPhase: 3, bulkMaxBF: '18' }), st, 2140, 70.25, 15, { waist: '80' });
    expect(r.decision).toBe('sf_f3_on_track'); expect(r.isSkinnyFat).toBe(true); expect(r.isBulk).toBe(false); expect(r.sfPhase).toBe(3);
    const fin = computeWeeklyCheck(mkPb({ goal: 'skinny_fat', sfPhase: 3, bulkMaxBF: '18' }), st, 2140, 70.5, 18.2, { waist: '80' });
    expect(fin.decision).toBe('sf_f3_finished');
  });
});


/* ── Task 3: check settimanale Mantenimento ───────────────────────────── */

import { computeMaintenanceWeeklyCheck } from '@/lib/diet-calc';

describe('computeMaintenanceWeeklyCheck', () => {
  // Riferimento: baseline di fase a 70 kg → banda ±0,35 kg. Kcal 2000, maintenanceWeeks 6.
  const mPb = (over = {}) => mkPb({ goal: 'maintenance', ...over });
  const run = (rows: [string, string?][], avgW: number | null, waist = '80', bf: number | null = 15, prevCal = 2000, over = {}) =>
    computeMaintenanceWeeklyCheck(mPb(over), phase('maintenance', rows), prevCal, avgW, bf, { waist });

  it('in banda → maint_on_track, kcal invariate', () => {
    const r = run([['70']], 70.3);
    expect(r.decision).toBe('maint_on_track'); expect(r.suggestedCalories).toBe(2000); expect(r.isMaintenance).toBe(true);
    expect(r.refWeight).toBe(70);
  });
  it('prima settimana fuori banda → maint_watch', () => {
    expect(run([['70']], 70.5).decision).toBe('maint_watch');
  });
  it('seconda settimana sopra banda → maint_drift_up (−3%)', () => {
    const r = run([['70.5'], ['70']], 70.5);
    expect(r.decision).toBe('maint_drift_up'); expect(r.suggestedCalories).toBe(1940);
  });
  it('seconda settimana sotto banda → maint_drift_down (+3%)', () => {
    const r = run([['69.5'], ['70']], 69.4);
    expect(r.decision).toBe('maint_drift_down'); expect(r.suggestedCalories).toBe(2060);
  });
  it('deriva su lati opposti in settimane consecutive → maint_watch', () => {
    expect(run([['70.5'], ['70']], 69.4).decision).toBe('maint_watch');
  });
  it('dopo maintenanceWeeks in banda → maint_complete', () => {
    const five: [string][] = [['70.1'], ['70.2'], ['70.0'], ['70.1'], ['70.2']];
    expect(run([...five, ['70']], 70.1).decision).toBe('maint_complete');
    expect(run([...five.slice(1), ['70']], 70.1).decision).toBe('maint_on_track');
  });
  it('la deriva confermata prevale su maint_complete', () => {
    const rows: [string][] = [['70.5'], ['70.1'], ['70.1'], ['70.1'], ['70.1'], ['70']];
    expect(run(rows, 70.6).decision).toBe('maint_drift_up');
  });
  it('fase con la sola baseline e peso fuori banda → maint_watch, mai drift', () => {
    expect(run([['70']], 71).decision).toBe('maint_watch');
  });
  it('campi vuoti o parziali: nessuna eccezione, kcal finite', () => {
    for (const r of [run([['70']], null), run([['']], 70.3), run([['70']], 70.3, '', null), run([['70.5', ''], ['70', '']], 70.5, '', null)]) {
      expect(Number.isFinite(r.suggestedCalories)).toBe(true); expect(r.decision).toBeTruthy();
    }
  });
  it('vita e BF% non cambiano la decisione né le kcal', () => {
    const a = run([['70.5'], ['70']], 70.5, '80', 15), b = run([['70.5'], ['70']], 70.5, '83', 19);
    expect([b.decision, b.suggestedCalories]).toEqual([a.decision, a.suggestedCalories]);
  });
  it('dispatch da computeWeeklyCheck', () => {
    const r = computeWeeklyCheck(mPb(), phase('maintenance', [['70']]), 2000, 70.2, 15, { waist: '80' });
    expect(r.decision).toBe('maint_on_track'); expect(r.isMaintenance).toBe(true); expect(r.isBulk).toBe(false);
  });
});

/* ── Task 4: transizioni di fase ──────────────────────────────────────── */

import { buildTransition, getTransitionTargets } from '@/lib/diet-calc';

describe('getTransitionTargets', () => {
  it('ciclo: Cut→Reverse, Reverse→Cut/Bulk/Mantenimento, Bulk→Cut/Mantenimento, Mantenimento→Cut/Bulk', () => {
    expect(getTransitionTargets('cut_target_reached')).toEqual(['reverse_diet']);
    expect(getTransitionTargets('finished_reverse')).toEqual(['cut', 'bulk', 'maintenance']);
    expect(getTransitionTargets('bulk_finished')).toEqual(['cut', 'maintenance']);
    expect(getTransitionTargets('sf_f3_finished')).toEqual(['cut', 'maintenance']);
    expect(getTransitionTargets('maint_complete')).toEqual(['cut', 'bulk']);
    expect(getTransitionTargets('hold')).toEqual([]);
  });
});

describe('buildTransition', () => {
  const NOW = '2026-10-14T08:00:00.000Z';
  const base = (over = {}) => mkPb({ weight: '70', cutLossRate: 0.6, bulkSurplusPct: 7, ...over });

  it('Reverse → Bulk: ultima kcal × (1 + surplus)', () => {
    const t = buildTransition(base({ goal: 'reverse_diet' }), 'bulk', 2050, NOW);
    expect(t.patch).toMatchObject({ goal: 'bulk', phaseStartedAt: NOW, phaseMaintenanceKcal: 2050 });
    expect(t.startKcal).toBe(2194);
    expect(t.summary).toMatch(/Bulk/); expect(t.summary).toMatch(/2194 kcal/);
  });
  it('verso Bulk senza criteri di fine propone BF% di partenza + 3 punti; non sovrascrive quelli esistenti', () => {
    expect(buildTransition(base({ goal: 'reverse_diet', bodyFat: '15' }), 'bulk', 2050, NOW).patch.bulkMaxBF).toBe('18');
    expect(buildTransition(base({ goal: 'reverse_diet', bodyFat: '15', bulkTargetWeight: '75' }), 'bulk', 2050, NOW).patch).not.toHaveProperty('bulkMaxBF');
    expect(buildTransition(base({ goal: 'reverse_diet', bodyFat: '15', bulkMaxBF: '17' }), 'bulk', 2050, NOW).patch).not.toHaveProperty('bulkMaxBF');
  });
  it('Reverse → Mantenimento', () => {
    const t = buildTransition(base({ goal: 'reverse_diet' }), 'maintenance', 2050, NOW);
    expect(t.startKcal).toBe(2050); expect(t.patch).toMatchObject({ goal: 'maintenance', phaseMaintenanceKcal: 2050 });
  });
  it('Reverse → Cut: mantenimento − deficit del ritmo di perdita', () => {
    const t = buildTransition(base({ goal: 'reverse_diet' }), 'cut', 2050, NOW);
    expect(t.startKcal).toBe(2050 - 462); expect(t.patch).toMatchObject({ goal: 'cut', phaseMaintenanceKcal: 2050 });
  });
  it('Bulk → Mantenimento: toglie il surplus', () => {
    const t = buildTransition(base({ goal: 'bulk' }), 'maintenance', 2194, NOW);
    expect(t.startKcal).toBe(2050); expect(t.patch.phaseMaintenanceKcal).toBe(2050);
  });
  it('Bulk → Cut: deficit sul mantenimento senza surplus', () => {
    expect(buildTransition(base({ goal: 'bulk' }), 'cut', 2194, NOW).startKcal).toBe(2050 - 462);
  });
  it('SF fase 3 → Mantenimento come il Bulk', () => {
    expect(buildTransition(base({ goal: 'skinny_fat', sfPhase: 3 }), 'maintenance', 2194, NOW).startKcal).toBe(2050);
  });
  it('Cut → Reverse: riparte dall’ultima kcal reale', () => {
    const t = buildTransition(base({ goal: 'cut' }), 'reverse_diet', 1700, NOW);
    expect(t.startKcal).toBe(1700); expect(t.patch).toMatchObject({ goal: 'reverse_diet', phaseMaintenanceKcal: null });
  });
  it('Mantenimento → Bulk', () => {
    expect(buildTransition(base({ goal: 'maintenance' }), 'bulk', 2050, NOW).startKcal).toBe(Math.round(2050 * 1.07));
  });
  it('verso Cut non tocca target né refeed', () => {
    const { patch } = buildTransition(base({ goal: 'reverse_diet' }), 'cut', 2050, NOW);
    for (const k of ['cutTargetBF', 'cutLossRate', 'refeedEnabled', 'refeedDays', 'refeedSurplus', 'dietBreakEnabled']) expect(patch).not.toHaveProperty(k);
  });
});

/* ── Fix pass dalla review finale ─────────────────────────────────────── */

import { computeUnderestimationWarning, detectPlateau, hydratePianoBase } from '@/lib/diet-calc';

describe('I1: banner plateau/sottostima solo sulla fase corrente', () => {
  // Reverse → Cut: la baseline del Cut e il check di chiusura del Reverse hanno le stesse misure.
  const st = [
    mkEntry({ date: '2026-10-14T08:00:00.001Z', goal: 'cut', weeklyAvgWeight: '64.5', weeklyMeasureWaist: '78', checkBodyFat: '15', isBaseline: true }),
    mkEntry({ date: '2026-10-14T08:00:00.000Z', goal: 'reverse_diet', weeklyAvgWeight: '64.5', weeklyMeasureWaist: '78', checkBodyFat: '15' }),
    mkEntry({ date: '2026-10-07T08:00:00.000Z', goal: 'reverse_diet', weeklyAvgWeight: '64.5', weeklyMeasureWaist: '78', checkBodyFat: '15' }),
  ];
  const cutPb = mkPb({ goal: 'cut', weight: '64.5', phaseStartedAt: '2026-10-14T08:00:00.001Z' });
  it('detectPlateau con pb non vede la fase precedente', () => {
    expect(detectPlateau(st)).not.toBeNull(); // senza scoping il falso positivo c'è
    expect(detectPlateau(st, cutPb)).toBeNull();
  });
  it('computeUnderestimationWarning non vede la fase precedente', () => {
    expect(computeUnderestimationWarning(cutPb, st)).toBeNull();
  });
});

describe('I2: mantenimento in uscita dal Bulk', () => {
  it('usa phaseMaintenanceKcal e non lastKcal / surplus', () => {
    // kcal salite a 2255 con +5% a bulk in corso: dividere per 1,07 darebbe 2108 invece del vero 2050
    const t = buildTransition(mkPb({ goal: 'bulk', bulkSurplusPct: 7, phaseMaintenanceKcal: 2050 }), 'maintenance', 2255, '2026-10-14T08:00:00.000Z');
    expect(t.startKcal).toBe(2050);
    expect(buildTransition(mkPb({ goal: 'bulk', phaseMaintenanceKcal: 2050 }), 'cut', 2255).startKcal).toBe(2050 - 462);
  });
  it('senza riferimento salvato ripiega sulla divisione per il surplus', () => {
    expect(buildTransition(mkPb({ goal: 'bulk', bulkSurplusPct: 7 }), 'maintenance', 2194).startKcal).toBe(2050);
  });
});

describe('I3: criteri di fine già soddisfatti non si riusano in un nuovo Bulk', () => {
  const T = '2026-10-14T08:00:00.000Z';
  it('BF% massimo già raggiunto → riproposto a BF + 3', () => {
    const t = buildTransition(mkPb({ goal: 'maintenance', bulkMaxBF: '18', bodyFat: '18.2' }), 'bulk', 2050, T);
    expect(t.patch.bulkMaxBF).toBe('21.2'); expect(t.summary).toMatch(/già raggiunt/);
  });
  it('peso target già raggiunto → azzerato, e si propone il BF% se non resta alcun criterio', () => {
    const t = buildTransition(mkPb({ goal: 'maintenance', bulkTargetWeight: '75', weight: '75.2', bodyFat: '15' }), 'bulk', 2050, T);
    expect(t.patch.bulkTargetWeight).toBe(''); expect(t.patch.bulkMaxBF).toBe('18');
  });
  it('un criterio ancora valido resta com’è', () => {
    const t = buildTransition(mkPb({ goal: 'maintenance', bulkMaxBF: '18', bodyFat: '16', bulkTargetWeight: '75', weight: '75.2' }), 'bulk', 2050, T);
    expect(t.patch).not.toHaveProperty('bulkMaxBF'); expect(t.patch.bulkTargetWeight).toBe('');
  });
});

describe('I4: hydratePianoBase (caricamento e ripristino da backup)', () => {
  it('applica i default dei campi nuovi e ricava phaseStartedAt', () => {
    const old = { goal: 'reverse_diet', weight: '64' } as Partial<PianoBase>;
    const st = [mkEntry({ date: '2026-10-10T06:00:00Z', goal: 'reverse_diet' }), mkEntry({ date: '2026-09-28T06:00:00Z', goal: 'reverse_diet' })];
    const pb = hydratePianoBase(old, st);
    expect(pb.bulkSurplusPct).toBe(7); expect(pb.maintenanceWeeks).toBe(6);
    expect(pb.phaseStartedAt).toBe('2026-09-28T06:00:00Z');
    expect(pb.weight).toBe('64');
    expect(Number.isFinite(buildTransition(pb, 'bulk', 2050).startKcal)).toBe(true);
  });
});

/* ── Minor rimandati dalla review finale ──────────────────────────────── */

import { currentKcalForPhase, getEntryTarget as getEntryTargetM } from '@/lib/diet-calc';

describe('M1: bordo esatto del range nel check Bulk (float)', () => {
  it('63,84 → 64,00 è esattamente +0,25%: la settimana dopo non risulta "sotto range"', () => {
    const rows: [string, string?][] = [['64'], ['63.84']];
    const r = computeBulkWeeklyCheck(bulkPb({ weight: '64' }), phase('bulk', rows), 2140, 64.05, 15, { waist: '80' });
    expect(r.decision).toBe('bulk_watch_slow'); // prima: bulk_slow_confirmed per 0.1599999… < 0.16
  });
});

describe('M2: Cut in pausa dieta usa il mantenimento di riferimento della fase', () => {
  it('computeInitialStartCalories in pausa = phaseMaintenanceKcal, non la formula', () => {
    const pb = mkPb({ goal: 'cut', dietBreakEnabled: true, dbDeficitWeeks: 3, dbBreakWeeks: 1, dbCurrentCycleWeek: 4, measuredMaintenance: '2400', phaseMaintenanceKcal: 2050 });
    expect(computeInitialStartCalories(pb).startCalories).toBe(2050);
  });
});

describe('M3: la transizione riparte da settimana 1 del ciclo diet break', () => {
  it('patch con dbCurrentCycleWeek = 1', () => {
    expect(buildTransition(mkPb({ goal: 'reverse_diet', dbCurrentCycleWeek: 3 }), 'cut', 2050).patch.dbCurrentCycleWeek).toBe(1);
  });
});

describe('M5: kcal caricate dalla fase corrente, non da un\'entry di un altro goal', () => {
  it('entry di testa di un altro goal (piano salvato prima dello storico) → null', () => {
    const st = [mkEntry({ date: '2026-10-14T08:00:00.001Z', goal: 'bulk', currentCalories: 2194, isBaseline: true }), mkEntry({ date: '2026-10-14T08:00:00.000Z', goal: 'reverse_diet', currentCalories: 2050 })];
    expect(currentKcalForPhase(mkPb({ goal: 'reverse_diet', phaseStartedAt: '2026-09-01T00:00:00Z' }), st)).toBe(2050);
    expect(currentKcalForPhase(mkPb({ goal: 'cut', phaseStartedAt: '2026-10-14T08:00:00.001Z' }), st)).toBeNull();
  });
});

describe('M6: Bulk al tetto kcal non offre opzioni inutili', () => {
  it('slow_confirmed con kcal già a mantenimento +10% → nessuna opzione, nota sul tetto', () => {
    const r = computeBulkWeeklyCheck(bulkPb(), phase('bulk', [['70.05'], ['70']]), 2200, 70.1, 15, { waist: '80' });
    expect(r.decision).toBe('bulk_slow_confirmed'); expect(r.options).toBeNull();
    expect(r.suggestedCalories).toBe(2200); expect(r.note).toMatch(/tetto/);
  });
  it('fast_confirmed con kcal già al mantenimento → nessuna opzione, nota sul mantenimento', () => {
    const r = computeBulkWeeklyCheck(bulkPb(), phase('bulk', [['70.6', '80.5'], ['70', '80']]), 2000, 71.2, 15, { waist: '81' });
    expect(r.decision).toBe('bulk_fast_confirmed'); expect(r.options).toBeNull();
    expect(r.suggestedCalories).toBe(2000); expect(r.note).toMatch(/mantenimento/);
  });
});

describe('M7: target mostrato per SF fase 3', () => {
  it('usa i criteri di fine del bulk e non un +7% fisso', () => {
    const pb = mkPb({ goal: 'skinny_fat', sfPhase: 3, bulkMaxBF: '18', bulkSurplusPct: 8 });
    const e = mkEntry({ date: '2026-10-14T08:00:00Z', goal: 'skinny_fat', sfPhase: 3 });
    expect(getEntryTargetM(pb, e)).toBe('BF 18%');
    expect(getEntryTargetM(mkPb({ goal: 'skinny_fat', sfPhase: 3, bulkSurplusPct: 8 }), e)).toBe('+8% surplus');
  });
});

describe('M8: SF fase 3 — divergenze volute rispetto alla vecchia logica fissa', () => {
  // Vecchia logica (surplus +7% fisso, max 0,5%/sett, nessuna fine):
  //   guadagno ≤ 0,5%            → sf_f3_on_track anche se quasi fermo
  //   guadagno > 0,5% e BF% su   → sf_f3_too_much_fat (−3%) già alla prima settimana
  // Nuova (check del Bulk): range 0,25–0,5%, regola delle due settimane, fine su BF%/peso.
  const sf3 = (rows: [string, string?][]) => rows.map(([w, waist], i) => mkEntry({
    date: `2026-10-${String(14 - i).padStart(2, '0')}T06:00:00Z`, goal: 'skinny_fat', sfPhase: 3, weeklyAvgWeight: w,
    weeklyMeasureWaist: waist ?? '80', checkBodyFat: '15', isBaseline: i === rows.length - 1,
  }));
  const run = (rows: [string, string?][], avgW: number, waist = '80', bf = 15) =>
    computeWeeklyCheck(mkPb({ goal: 'skinny_fat', sfPhase: 3, bulkMaxBF: '18' }), sf3(rows), 2140, avgW, bf, { waist });
  it('guadagno quasi nullo: prima on_track, ora watch_slow', () => { expect(run([['70']], 70.05).decision).toBe('sf_f3_watch_slow'); });
  it('guadagno eccessivo con vita in salita alla prima settimana: prima −3% subito, ora solo watch_fast', () => {
    const r = run([['70']], 70.6, '80.5'); expect(r.decision).toBe('sf_f3_watch_fast'); expect(r.suggestedCalories).toBe(2140);
  });
  it('invariato: guadagno nel range → on_track', () => { expect(run([['70']], 70.25).decision).toBe('sf_f3_on_track'); });
  it('nuovo: fine su BF% massimo', () => { expect(run([['70']], 70.25, '80', 18.1).decision).toBe('sf_f3_finished'); });
});
