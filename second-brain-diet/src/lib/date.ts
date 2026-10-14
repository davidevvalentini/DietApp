/**
 * Fuso orario dell'app, scelto in Impostazioni (default Europe/Rome).
 *
 * Sta su `globalThis` e non in una variabile di modulo: lato server Next
 * compila instrumentation e le route in bundle separati, ognuno con la sua
 * copia di questo file, e il valore deve essere uno solo per tutto il
 * processo. Lato server lo impostano l'avvio e lo scheduler (da
 * scripts/.timezone, vedi lib/timezone.ts); lato client AppLayout, dalle
 * impostazioni.
 */
export const DEFAULT_TIME_ZONE = 'Europe/Rome';
const TZ_KEY = Symbol.for('second-brain.time-zone');

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function getAppTimeZone(): string {
  return (globalThis as unknown as Record<symbol, string | undefined>)[TZ_KEY] ?? DEFAULT_TIME_ZONE;
}

export function setAppTimeZone(tz: unknown): void {
  if (isValidTimeZone(tz)) (globalThis as unknown as Record<symbol, string>)[TZ_KEY] = tz;
}

/**
 * "Oggi" nel fuso di chi usa l'app (vedi getAppTimeZone), non nel fuso del server.
 *
 * Il server gira in UTC puro. `new Date().toISOString().split('T')[0]` dà la
 * data di calendario UTC: nella finestra tra mezzanotte e le 1-2 di notte ora
 * italiana (a seconda di CET/CEST), l'ora italiana è già "domani" ma l'UTC è
 * ancora "ieri" — un'azione fatta in quella finestra (journal, streak, habit,
 * todo, fee PF360, ecc.) finiva attribuita al giorno sbagliato. `Intl` con
 * `timeZone` gestisce da solo il passaggio ora legale/solare.
 */
export function todayItaly(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: getAppTimeZone() });
}

/** Ieri, calendario italiano. Aritmetica su una data pura (UTC di comodo,
 *  nessun fuso coinvolto) applicata alla data di oggi già corretta. */
export function yesterdayItaly(): string {
  const [y, m, d] = todayItaly().split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().split('T')[0];
}

/** Oggi (calendario italiano) + n giorni, stessa aritmetica di yesterdayItaly. */
export function addDaysItaly(n: number): string {
  const [y, m, d] = todayItaly().split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().split('T')[0];
}

/**
 * Chiave ISO week (`2026-W37`) di una data. Il giovedì della stessa settimana
 * decide l'anno, come da ISO 8601: fine dicembre e inizio gennaio possono
 * appartenere all'anno dell'altro.
 */
export function isoWeekKey(d: Date): string {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Domenica dalle 19:00 in poi: la finestra in cui si pianifica in anticipo
 *  la settimana che inizia il giorno dopo. */
export function isSundayPlanningWindow(now: Date = new Date()): boolean {
  return now.getDay() === 0 && now.getHours() >= 19;
}

/**
 * La settimana su cui l'app sta lavorando *adesso*.
 *
 * Di domenica sera è quella che inizia lunedì, non quella in corso: in ISO la
 * domenica è ancora l'ultimo giorno della settimana che sta finendo. Chi
 * scrive il piano (weekly review) e chi lo legge (box "This week's focus",
 * check delle priority) devono usare tutti questa stessa funzione, altrimenti
 * si salva su una settimana e se ne mostra un'altra.
 */
export function planningWeekKey(now: Date = new Date()): string {
  return isoWeekKey(isSundayPlanningWindow(now) ? new Date(now.getTime() + 86400000) : now);
}
