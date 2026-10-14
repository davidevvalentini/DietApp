import { buildBaselineEntry, defaultPianoBase, type DietCheckEntry, type PianoBase } from '@/lib/diet-calc';

export const mkPb = (over: Partial<PianoBase> = {}): PianoBase => ({
  ...defaultPianoBase(), weight: '70', bodyFat: '15', measureWaist: '80', birthDate: '1988-03-31', age: 38,
  measuredMaintenance: '2000', ...over,
});

export const mkEntry = (over: Partial<DietCheckEntry> & { date: string; goal: PianoBase['goal'] }): DietCheckEntry => ({
  ...buildBaselineEntry(mkPb({ goal: over.goal })), isBaseline: false, weeksPassed: 1, ...over,
});
