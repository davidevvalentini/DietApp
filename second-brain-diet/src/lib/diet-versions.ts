import { promises as fs } from 'fs';
import path from 'path';
import { writeJsonAtomic } from '@/lib/atomic-write';
import type { PianoBase, DietCheckEntry } from '@/lib/diet-calc';

// ─────────────────────────────────────────────────────────────────────────────
// Backup dei dati diet.json: uno snapshot dello stato PRECEDENTE prima di ogni
// scrittura (saveBase/saveEntry/updateEntry/deleteEntry/clear), stesso pattern
// di project-versions.ts. A differenza dell'autosave dei progetti, qui non
// c'è debounce da filtrare — ogni scrittura del diet è un'azione deliberata
// (un check settimanale, una modifica), quindi si fa uno snapshot ad ogni
// scrittura, senza throttle temporale.
// ─────────────────────────────────────────────────────────────────────────────

const versionsFile = path.join(process.cwd(), 'data', 'diet-versions.json');

export interface DietVersion {
  savedAt:   string;
  pianoBase: PianoBase;
  storico:   DietCheckEntry[];
}

export const MAX_VERSIONS = 50;

export async function readVersions(): Promise<DietVersion[]> {
  try {
    return JSON.parse(await fs.readFile(versionsFile, 'utf-8'));
  } catch {
    return [];
  }
}

export async function writeVersions(versions: DietVersion[]): Promise<void> {
  const dir = path.dirname(versionsFile);
  await fs.mkdir(dir, { recursive: true });
  writeJsonAtomic(versionsFile, versions);
}

export async function snapshot(previous: { pianoBase: PianoBase; storico: DietCheckEntry[] }): Promise<void> {
  const versions = await readVersions();
  versions.push({ savedAt: new Date().toISOString(), pianoBase: previous.pianoBase, storico: previous.storico });
  await writeVersions(versions.slice(-MAX_VERSIONS));
}
