import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import { mkEntry } from '@/lib/__fixtures__/diet-helpers';

/* saveEntry tiene una entry per giorno, ma una transizione di fase salva nello stesso giorno
 * il check di chiusura (fase vecchia) e la baseline (fase nuova): devono convivere.
 * Stesso schema di fire-calculator/route.test.ts: il cwd va su una tmp dir. */

const realCwd = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-diet-'));
let route: typeof import('./route');

beforeAll(async () => {
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true });
  process.chdir(tmp);
  route = await import('./route');
});
afterAll(() => {
  process.chdir(realCwd);
  fs.rmSync(tmp, { recursive: true, force: true });
});

const post = (body: unknown) => route.POST(new NextRequest('http://localhost/api/diet', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}));
const stored = () => JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'diet.json'), 'utf-8')).storico as { date: string; goal: string; isBaseline?: boolean }[];

describe('POST /api/diet saveEntry', () => {
  it('entry di fasi diverse nello stesso giorno convivono (chiusura + baseline)', async () => {
    await post({ action: 'saveEntry', entry: mkEntry({ date: '2026-10-14T08:00:00.000Z', goal: 'reverse_diet' }) });
    await post({ action: 'saveEntry', entry: mkEntry({ date: '2026-10-14T08:00:00.001Z', goal: 'bulk', isBaseline: true }) });
    expect(stored().map(e => e.goal)).toEqual(['bulk', 'reverse_diet']);
  });
  it('stesso giorno e stesso goal: sostituisce (comportamento esistente)', async () => {
    await post({ action: 'saveEntry', entry: mkEntry({ date: '2026-10-14T09:00:00.000Z', goal: 'bulk' }) });
    const bulk = stored().filter(e => e.goal === 'bulk');
    expect(bulk).toHaveLength(1);
    expect(bulk[0].date).toBe('2026-10-14T09:00:00.000Z');
  });
});
