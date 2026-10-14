'use client';

import { useEffect, useRef, useState } from 'react';
import { Scale, ChevronDown, ChevronUp, Download, Trash2, X, Pencil, Check } from 'lucide-react';
import { mobileConfirm } from '@/lib/confirm';
import { todayItaly } from '@/lib/date';
import { WeightTrendChart, LossRateChart, StarRating } from './DietCharts';
import {
  type PianoBase, type DietCheckEntry, type WeeklyCheckResult, type Goal,
  defaultPianoBase, toNum, round, normalizeBodyFatPercent, normalizeBodyFatInput,
  computeAF, isCut, isReverse, isSF, isBulk, isMaintenance, getPhaseStorico, hydratePianoBase, currentKcalForPhase, getMaintenanceRef, getTransitionTargets, buildTransition, type PhaseGoal, getLBMTable, getLBMRange, getCurrentBand,
  computeLBM, getCurrentBF, getCurrentWeight, getCurrentLBM, computeMacros,
  computeInitialStartCalories, getActiveCalories, getReverseTargetMeta, getReverseStartWarning,
  getProgressStartCalories, computeRefeedSplit, computeDietBreakPhase,
  checkPlausibility, validateInput, validateWeekly, checkProteinFloorWarn, proteinFloorLBMForAge,
  proteinFloorLBMForAgeNoDeficit, isInDeficitPhase,
  computeWeeklyCheck, buildAdjustmentOptions, detectPlateau, computeUnderestimationWarning, computeBodyFatSkinfold, computeAge,
  buildBaselineEntry, getEntryGoalLabel, getEntryTarget,
  syncReverseProteinPresetFromValue, APPROACHES, PROTEIN_PRESETS, SF_PHASES,
} from '@/lib/diet-calc';

/* ── Design tokens (stesso pattern di health/page.tsx e net-worth/page.tsx) ── */
const CARD: React.CSSProperties = { background: 'var(--sb-surface)', border: '1px solid var(--sb-border)', borderRadius: 10 };
const FIELD: React.CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: 8, fontSize: 13,
  background: 'var(--sb-surface2)', border: '1px solid var(--sb-border)', color: 'var(--sb-text)', outline: 'none',
};
const LABEL: React.CSSProperties = { fontSize: 10.5, fontWeight: 600, color: 'var(--sb-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'block' };
const HINT: React.CSSProperties = { fontSize: 11, color: 'var(--sb-text-muted)', marginTop: 3, lineHeight: 1.4 };
const BTN_PRIMARY: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
  background: 'var(--sb-accent)', color: '#0d1117', border: 'none', cursor: 'pointer',
};
const BTN_GHOST: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '8px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
  background: 'var(--sb-surface2)', color: 'var(--sb-text-sub)', border: '1px solid var(--sb-border)', cursor: 'pointer',
};
const BTN_DANGER: React.CSSProperties = { ...BTN_GHOST, color: 'var(--sb-red)', borderColor: 'var(--sb-red)' };

const GOAL_META: Record<Exclude<Goal, ''>, { label: string; color: string }> = {
  cut: { label: 'Cut', color: 'var(--sb-red)' },
  bulk: { label: 'Bulk', color: 'var(--sb-blue)' },
  reverse_diet: { label: 'Reverse Diet', color: 'var(--sb-green)' },
  skinny_fat: { label: 'Skinny Fat', color: '#d4620a' },
  maintenance: { label: 'Mantenimento', color: 'var(--sb-text-muted)' },
};

const DECISION_META: Record<string, { label: string; color: string }> = {
  increase: { label: 'AUMENTA', color: 'var(--sb-green)' },
  hold: { label: 'MANTIENI', color: 'var(--sb-text-muted)' },
  exceeds_but_no_bf_waist_increase: { label: 'OPZIONI', color: 'var(--sb-accent)' },
  finished_reverse: { label: 'TARGET RAGGIUNTO', color: 'var(--sb-green)' },
  cut_on_track: { label: 'ON TRACK', color: 'var(--sb-green)' },
  cut_too_fast_confirmed: { label: 'TROPPO RAPIDO', color: 'var(--sb-accent)' },
  cut_watch_fast: { label: 'MONITORA · VELOCE', color: 'var(--sb-accent)' },
  cut_watch_composition_ok: { label: 'MONITORA · RICOMPOSIZIONE', color: 'var(--sb-blue)' },
  cut_watch: { label: 'MONITORA', color: '#d4620a' },
  cut_stalled_confirmed: { label: 'STALLO CONFERMATO', color: 'var(--sb-red)' },
  cut_target_reached: { label: 'TARGET BF% ✓', color: 'var(--sb-green)' },
  cut_diet_break: { label: 'PAUSA DIETA', color: 'var(--sb-blue)' },
  sf_f1_on_track: { label: 'ON TRACK', color: 'var(--sb-green)' },
  sf_f1_too_fast_confirmed: { label: 'TROPPO RAPIDO', color: 'var(--sb-accent)' },
  sf_f1_watch_fast: { label: 'MONITORA · VELOCE', color: 'var(--sb-accent)' },
  sf_f1_watch: { label: 'MONITORA', color: '#d4620a' },
  sf_f1_stalled_confirmed: { label: 'STALLO CONFERMATO', color: 'var(--sb-red)' },
  sf_f1_target_reached: { label: 'TARGET BF% ✓', color: 'var(--sb-green)' },
  sf_f2_increase: { label: 'AUMENTA', color: 'var(--sb-green)' },
  sf_f2_options: { label: 'OPZIONI', color: 'var(--sb-accent)' },
  sf_f2_hold: { label: 'MANTIENI', color: 'var(--sb-text-muted)' },
  sf_f2_complete: { label: 'FASE 2 ✓', color: 'var(--sb-green)' },
  bulk_on_track: { label: 'ON TRACK', color: 'var(--sb-green)' },
  bulk_watch_slow: { label: 'MONITORA · LENTO', color: '#d4620a' },
  bulk_slow_confirmed: { label: 'TROPPO LENTO', color: 'var(--sb-accent)' },
  bulk_watch_fast: { label: 'MONITORA · VELOCE', color: '#d4620a' },
  bulk_fast_confirmed: { label: 'TROPPO GRASSO', color: 'var(--sb-red)' },
  bulk_watch_fast_stable: { label: 'MONITORA · ACQUA?', color: 'var(--sb-blue)' },
  bulk_finished: { label: 'BULK CONCLUSO ✓', color: 'var(--sb-green)' },
  sf_f3_on_track: { label: 'ON TRACK', color: 'var(--sb-green)' },
  sf_f3_watch_slow: { label: 'MONITORA · LENTO', color: '#d4620a' },
  sf_f3_slow_confirmed: { label: 'TROPPO LENTO', color: 'var(--sb-accent)' },
  sf_f3_watch_fast: { label: 'MONITORA · VELOCE', color: '#d4620a' },
  sf_f3_fast_confirmed: { label: 'TROPPO GRASSO', color: 'var(--sb-red)' },
  sf_f3_watch_fast_stable: { label: 'MONITORA · ACQUA?', color: 'var(--sb-blue)' },
  sf_f3_finished: { label: 'BULK CONCLUSO ✓', color: 'var(--sb-green)' },
  maint_on_track: { label: 'STABILE', color: 'var(--sb-green)' },
  maint_watch: { label: 'MONITORA', color: '#d4620a' },
  maint_drift_up: { label: 'DERIVA ↑', color: 'var(--sb-red)' },
  maint_drift_down: { label: 'DERIVA ↓', color: 'var(--sb-red)' },
  maint_complete: { label: 'MANTENIMENTO ✓', color: 'var(--sb-green)' },
};

const SUBJ_FIELDS: { key: 'subjEnergy' | 'subjHunger' | 'subjMood' | 'subjSleep' | 'subjStrength'; label: string; labels: string[] }[] = [
  { key: 'subjEnergy', label: 'Energia', labels: ['', 'Esausto', 'Stanco', 'Ok', 'Buona', 'Ottima'] },
  { key: 'subjHunger', label: 'Fame', labels: ['', 'Insaziabile', 'Alta', 'Media', 'Bassa', 'Assente'] },
  { key: 'subjMood', label: 'Umore', labels: ['', 'Pessimo', 'Basso', 'Ok', 'Buono', 'Ottimo'] },
  { key: 'subjSleep', label: 'Sonno', labels: ['', 'Pessimo', 'Scarso', 'Discreto', 'Buono', 'Ottimo'] },
  { key: 'subjStrength', label: 'Forza', labels: ['', 'Crollo', 'In calo', 'Stabile', 'In crescita', 'Picco'] },
];

interface CheckForm {
  weeklyAvgWeight: string;
  weeksPassed: string;
  checkBodyFat: string;
  weeklyMeasureWaist: string;
  weeklyMeasureHips: string;
  weeklyMeasureChest: string;
  weeklyMeasureArm: string;
  weeklyMeasureThigh: string;
  weeklyWalkAmount: string;
  weeklyWalkUnit: 'km' | 'passi';
  weeklySkinfoldChest: string;
  weeklySkinfoldAbdomen: string;
  weeklySkinfoldTricep: string;
  weeklySkinfoldSuprailiac: string;
  weeklySkinfoldThigh: string;
  weeklySkinfoldSubscapular: string;
  weeklySkinfoldMidaxillary: string;
  dayWeights: string[];
  subjEnergy: number; subjHunger: number; subjMood: number; subjSleep: number; subjStrength: number;
}

function defaultCheckForm(): CheckForm {
  return {
    weeklyAvgWeight: '', weeksPassed: '1', checkBodyFat: '',
    weeklyMeasureWaist: '', weeklyMeasureHips: '', weeklyMeasureChest: '', weeklyMeasureArm: '', weeklyMeasureThigh: '',
    weeklyWalkAmount: '', weeklyWalkUnit: 'passi',
    weeklySkinfoldChest: '', weeklySkinfoldAbdomen: '', weeklySkinfoldTricep: '', weeklySkinfoldSuprailiac: '', weeklySkinfoldThigh: '',
    weeklySkinfoldSubscapular: '', weeklySkinfoldMidaxillary: '',
    dayWeights: ['', '', '', '', '', '', ''],
    subjEnergy: 0, subjHunger: 0, subjMood: 0, subjSleep: 0, subjStrength: 0,
  };
}

// Sceglie automaticamente il 7 punti (se tutti e 7 i siti sono compilati) o il
// 3 punti (petto+addome, o tricipite+sovrailiaca se preferHip e disponibili) —
// usata sia per il baseline (pianoBase) sia per il check settimanale (checkForm).
function jp3FromSkinfolds(sex: PianoBase['sex'], age: number, s: { chest: string; abdomen: string; tricep: string; suprailiac: string; thigh: string; subscapular?: string; midaxillary?: string }, preferHip?: boolean) {
  return computeBodyFatSkinfold(sex, age, s, preferHip);
}

function protocolLabel(protocol: '7pt' | '3pt_std' | '3pt_hip' | null): string {
  return protocol === '7pt' ? '7 punti' : protocol === '3pt_hip' ? '3 punti · fianchi' : protocol === '3pt_std' ? '3 punti · standard' : '';
}

async function postDiet(body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch('/api/diet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) return false;
    const json = await res.json().catch(() => ({} as { success?: boolean }));
    return json.success === true;
  } catch { return false; }
}

/* ── Sotto-componenti UI ──────────────────────────────────────────────── */

function SectionCard({ title, sub, badge, open, onToggle, children }: {
  title: string; sub: string; badge?: { text: string; color: string };
  open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div style={{ ...CARD, marginBottom: 14, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div>
          <p style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--sb-text)', margin: 0 }}>{title}</p>
          <p style={{ fontSize: 11.5, color: 'var(--sb-text-muted)', marginTop: 2 }}>{sub}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {badge && (
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 9px', borderRadius: 6, color: badge.color, border: `1px solid ${badge.color}` }}>
              {badge.text}
            </span>
          )}
          {open ? <ChevronUp size={16} style={{ color: 'var(--sb-text-muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--sb-text-muted)' }} />}
        </div>
      </button>
      {open && <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--sb-border)' }}>{children}</div>}
    </div>
  );
}

function Field({ label, children, hint, info }: { label: string; children: React.ReactNode; hint?: string; info?: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ ...LABEL, display: 'inline-flex', alignItems: 'center' }}>{label}{info && <InfoTip>{info}</InfoTip>}</label>
      {children}
      {hint && <p style={HINT}>{hint}</p>}
    </div>
  );
}

// Cerchio con "?" — al passaggio del mouse mostra le istruzioni su come
// prendere quella specifica misura, con link al video quando disponibile.
function InfoTip({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', marginLeft: 5 }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span style={{
        width: 14, height: 14, borderRadius: '50%', background: 'var(--sb-surface2)',
        border: '1px solid var(--sb-border)', color: 'var(--sb-text-muted)',
        fontSize: 9.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'help', lineHeight: 1,
      }}>?</span>
      {open && (
        <span style={{
          position: 'absolute', bottom: '140%', left: '50%', transform: 'translateX(-50%)',
          width: 220, padding: '8px 10px', borderRadius: 8, fontSize: 11, fontWeight: 400,
          lineHeight: 1.4, background: 'var(--sb-surface)', border: '1px solid var(--sb-border)',
          color: 'var(--sb-text-sub)', boxShadow: '0 4px 14px rgba(0,0,0,0.3)', zIndex: 20,
          textTransform: 'none', letterSpacing: 'normal', textAlign: 'left',
        }}>
          {children}
        </span>
      )}
    </span>
  );
}

// Checkbox custom, stesso pattern di src/components/meal-plan/ui.tsx: il
// checkbox nativo del browser (spunta blu di sistema, angoli squadrati)
// stona con i token colore del tema dell'app.
function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }} onClick={e => e.preventDefault()}>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        style={{
          width: 16, height: 16, borderRadius: 5, flexShrink: 0, cursor: 'pointer', padding: 0, marginTop: 2,
          border: `1.5px solid ${checked ? 'var(--sb-green)' : 'var(--sb-border)'}`,
          background: checked ? 'var(--sb-green)' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {checked && <Check style={{ width: 10, height: 10, color: '#0d1117' }} />}
      </button>
      <span onClick={() => onChange(!checked)} style={{ fontSize: 12.5, color: 'var(--sb-text-sub)', cursor: 'pointer' }}>{label}</span>
    </label>
  );
}

const MEASURE_VIDEO = 'https://www.youtube.com/watch?v=Z9GF9wk2mg8&t=1s';

function MeasureInfo({ text }: { text: string }) {
  return (
    <>
      {text}{' '}
      <a href={MEASURE_VIDEO} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--sb-accent)' }}>Video ↗</a>
    </>
  );
}

// Bug classico dei controlled number input in React (facebook/react#7359):
// legando value={numeroDiStato} e convertendo con Number(e.target.value) ad
// ogni tasto, digitare un punto decimale ("2." per scrivere "2.5") lo fa
// sparire subito perché React riscrive il DOM con la stringa del numero
// arrotondato — di fatto impedendo di scrivere decimali a mano (restavano
// utilizzabili solo le frecce su/giù, che rispettano lo `step`). Il fix è
// tenere il testo digitato in uno stato locale, sincronizzarlo dal valore
// esterno solo quando il campo NON ha il focus, e propagare il numero al
// padre solo quando il testo digitato è già un numero valido.
function NumberInput({ value, onChange, style, ...rest }: {
  value: number; onChange: (n: number) => void; style?: React.CSSProperties;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'style'>) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(String(value)); }, [value]);
  return (
    <input
      {...rest} type="number" style={style} value={text}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; setText(String(value)); }}
      onChange={e => {
        const t = e.target.value;
        setText(t);
        const n = Number(t);
        if (t.trim() !== '' && !isNaN(n)) onChange(n);
      }}
    />
  );
}

// Stessa causa del bug sopra, versione per il BF%: `normalizeBodyFatInput`
// arrotonda e converte il formato frazionario (0.15 → 15%) ad ogni tasto,
// quindi cancellava allo stesso modo punti decimali digitati a mano. Qui il
// valore grezzo viene propagato in tempo reale (i calcoli a valle già
// parsano BF% con normalizeBodyFatPercent, quindi leggono correttamente
// anche il testo non ancora normalizzato) e la normalizzazione vera e
// propria scatta solo alla perdita del focus.
function BodyFatInput({ value, onChange, style, ...rest }: {
  value: string; onChange: (v: string) => void; style?: React.CSSProperties;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'style'>) {
  const [text, setText] = useState(value);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(value); }, [value]);
  return (
    <input
      {...rest} type="number" style={style} value={text}
      onFocus={() => { focused.current = true; }}
      onChange={e => { setText(e.target.value); onChange(e.target.value); }}
      onBlur={() => { focused.current = false; const n = normalizeBodyFatInput(text); setText(n); onChange(n); }}
    />
  );
}

// data-cols pilota il collasso da mobile in globals.css (.sb-diet-grid) — le
// colonne fisse (repeat(N,1fr)) qui sono corrette solo alla larghezza desktop
// della pagina; sotto i 640px alcune (7 input del peso giornaliero, 5 stelline
// del feedback) sborderebbero dalla propria cella senza un collasso via CSS,
// dato che lo style inline non può leggere una media query.
function Grid({ cols, children }: { cols: number; children: React.ReactNode }) {
  return (
    <div className="sb-diet-grid" data-cols={cols} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10, marginBottom: 4 }}>
      {children}
    </div>
  );
}

interface DietVersionListItem {
  savedAt: string;
  entries: number;
  preview: { date: string; weight: string; waist: string } | null;
}

// Elenco degli snapshot presi automaticamente prima di ogni scrittura (vedi
// src/lib/diet-versions.ts) — rete di sicurezza contro cancellazioni/modifiche
// per errore, non un flusso pensato per l'uso quotidiano: si apre solo su
// richiesta, non precarica nulla.
function DietBackupPanel({ onRestore }: { onRestore: (data: { pianoBase: PianoBase; storico: DietCheckEntry[] }) => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<DietVersionListItem[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/diet/versions');
      setVersions(res.ok ? await res.json() : []);
    } catch { setVersions([]); }
    setLoading(false);
  }

  async function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && versions === null) void load();
  }

  async function handleRestore(savedAt: string) {
    if (!(await mobileConfirm('Ripristinare questo backup? Lo stato attuale viene comunque salvato in cronologia prima.'))) return;
    setStatus('Ripristino…');
    try {
      const res = await fetch('/api/diet/versions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ savedAt }) });
      if (!res.ok) { setStatus('Errore nel ripristino'); return; }
      const data = await res.json();
      onRestore({ pianoBase: data.pianoBase, storico: data.storico });
      setStatus('✓ Ripristinato');
      void load();
    } catch { setStatus('Errore nel ripristino'); }
  }

  return (
    <div style={{ marginTop: 14 }}>
      <button style={{ ...BTN_GHOST, fontSize: 11 }} onClick={handleToggle}>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Backup automatici
      </button>
      {open && (
        <div style={{ ...CARD, padding: 12, marginTop: 8 }}>
          <p style={{ fontSize: 10.5, color: 'var(--sb-text-muted)', marginBottom: 8 }}>
            Ogni salvataggio crea prima uno snapshot dello stato precedente — usali per recuperare dati persi o modificati per errore.
          </p>
          {loading && <p style={{ fontSize: 11.5, color: 'var(--sb-text-muted)' }}>Carico…</p>}
          {!loading && versions && versions.length === 0 && <p style={{ fontSize: 11.5, color: 'var(--sb-text-muted)' }}>Nessun backup ancora.</p>}
          {!loading && versions && versions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
              {versions.map(v => (
                <div key={v.savedAt} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '5px 7px', borderRadius: 6, background: 'var(--sb-surface2)' }}>
                  <span style={{ fontSize: 11, color: 'var(--sb-text-sub)', fontFamily: 'monospace' }}>
                    {new Date(v.savedAt).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    {' · '}{v.entries} check{v.preview ? ` · ${v.preview.weight || '—'}kg / ${v.preview.waist || '—'}cm` : ''}
                  </span>
                  <button style={{ ...BTN_GHOST, padding: '3px 9px', fontSize: 10, flexShrink: 0 }} onClick={() => handleRestore(v.savedAt)}>Ripristina</button>
                </div>
              ))}
            </div>
          )}
          {status && <p style={{ fontSize: 11, color: 'var(--sb-text-muted)', marginTop: 6 }}>{status}</p>}
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, unit, sub, accent }: { label: string; value: string | number; unit?: string; sub?: string; accent?: string }) {
  return (
    <div style={{ ...CARD, padding: '12px 14px' }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--sb-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>{label}</p>
      <p style={{ fontSize: 24, fontWeight: 700, color: accent || 'var(--sb-text)', lineHeight: 1 }}>{value}{unit && <span style={{ fontSize: 12, marginLeft: 3, fontWeight: 500 }}>{unit}</span>}</p>
      {sub && <p style={{ fontSize: 10.5, color: 'var(--sb-text-muted)', marginTop: 4 }}>{sub}</p>}
    </div>
  );
}

function GoalColorPanel({ color, title, children }: { color: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${color}`, borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
      <div style={{ background: color, padding: '6px 12px' }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</span>
      </div>
      <div style={{ padding: 12, background: `color-mix(in srgb, ${color} 6%, var(--sb-surface))` }}>{children}</div>
    </div>
  );
}

/* ── Pagina ───────────────────────────────────────────────────────────── */

// Ultimi 7 giorni (oggi incluso), non la settimana di calendario lun-dom: il
// check non cade sempre nello stesso giorno (a volte sabato, a volte
// domenica), e ancorarsi al lunedì accorciava la media a 3-6 pesate invece di
// 7 ogni volta che il check non cadeva di domenica — settimane non più
// confrontabili tra loro. Con una finestra rolling la media è sempre su 7
// giorni pieni (se pesati ogni giorno) qualunque giorno si faccia il check.
function trailing7Dates(): string[] {
  const [y, m, d] = todayItaly().split('-').map(Number);
  const today = new Date(Date.UTC(y, m - 1, d));
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(today);
    dt.setUTCDate(today.getUTCDate() - (6 - i));
    return dt.toISOString().split('T')[0];
  });
}

function formatDayLabel(dateStr: string): string {
  const [, mm, dd] = dateStr.split('-');
  return `${dd}/${mm}`;
}

// Pesi già loggati nel journal per gli ultimi 7 giorni — pre-popola "Peso
// giornaliero" invece di farlo ripartire da zero ogni volta, dato che il
// peso viene comunque inserito ogni giorno in homepage.
async function fetchTrailing7Weights(): Promise<string[]> {
  return Promise.all(
    trailing7Dates().map(async (date) => {
      try {
        const r = await fetch(`/api/journal?date=${date}`);
        const j = await r.json();
        return j.weight != null ? String(j.weight) : '';
      } catch {
        return '';
      }
    })
  );
}

export default function DietPage() {
  const [loading, setLoading] = useState(true);
  const [pb, setPb] = useState<PianoBase>(defaultPianoBase());
  const [storico, setStorico] = useState<DietCheckEntry[]>([]);
  const [currentCalories, setCurrentCalories] = useState<number | null>(null);
  const transitioning = useRef(false);
  const [checkForm, setCheckForm] = useState<CheckForm>(defaultCheckForm());
  const [suggestion, setSuggestion] = useState<WeeklyCheckResult | null>(null);
  const [inputErrors, setInputErrors] = useState<string[]>([]);
  const [weeklyError, setWeeklyError] = useState('');
  const [modalMsg, setModalMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [open, setOpen] = useState({ input: true, plan: false, check: false, storico: false });
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<{ weeklyAvgWeight: string; currentCalories: string; checkBodyFat: string; weeklyMeasureWaist: string }>({ weeklyAvgWeight: '', currentCalories: '', checkBodyFat: '', weeklyMeasureWaist: '' });
  const storicoJustCleared = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const patchPB = (patch: Partial<PianoBase>) => setPb(prev => ({ ...prev, ...patch }));
  const patchCheck = (patch: Partial<CheckForm>) => setCheckForm(prev => ({ ...prev, ...patch }));

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/diet');
        const data = await res.json();
        const loadedStorico: DietCheckEntry[] = data.storico || [];
        const loadedPB: PianoBase = hydratePianoBase(data.pianoBase, loadedStorico);
        // Ricalcolata a ogni caricamento invece che fidarsi del valore
        // salvato: altrimenti resterebbe quella dell'ultimo salvataggio,
        // sbagliata dopo il primo compleanno successivo.
        const freshAge = computeAge(loadedPB.birthDate, todayItaly());
        if (freshAge != null) loadedPB.age = freshAge;
        setPb(loadedPB);
        setStorico(loadedStorico);

        const weekWeights = await fetchTrailing7Weights();
        const hasWeekWeights = weekWeights.some(w => w !== '');
        const weekNums = weekWeights.map(toNum).filter((x): x is number => x != null);
        const weekAvg = weekNums.length > 0 ? String(round(weekNums.reduce((a, b) => a + b, 0) / weekNums.length, 2)) : '';

        if (loadedStorico.length > 0) {
          // storico è ordinato dal più recente al meno recente (vedi /api/diet):
          // l'ultimo check è l'indice 0, non l'ultimo elemento dell'array.
          const last = loadedStorico[0];
          // Solo l'ultima entry della fase in corso: storico[0] può essere di un altro obiettivo
          // (es. dopo una transizione il cui salvataggio del piano è fallito a metà).
          setCurrentCalories(currentKcalForPhase(loadedPB, loadedStorico));
          setCheckForm({
            weeklyAvgWeight: hasWeekWeights ? weekAvg : (last.weeklyAvgWeight || ''), weeksPassed: String(last.weeksPassed || 1),
            // Come le misure e le pliche: va ricompilato ogni settimana
            // (si auto-calcola dalle pliche appena inserite), non riproposto
            // dalla settimana precedente.
            checkBodyFat: '',
            // Le misure vanno prese di nuovo ogni settimana: partono vuote,
            // non ripropongono il valore della settimana precedente.
            weeklyMeasureWaist: '', weeklyMeasureHips: '', weeklyMeasureChest: '', weeklyMeasureArm: '', weeklyMeasureThigh: '',
            weeklyWalkAmount: '', weeklyWalkUnit: last.weeklyWalkUnit || 'passi',
            weeklySkinfoldChest: '', weeklySkinfoldAbdomen: '', weeklySkinfoldTricep: '', weeklySkinfoldSuprailiac: '', weeklySkinfoldThigh: '',
            weeklySkinfoldSubscapular: '', weeklySkinfoldMidaxillary: '',
            dayWeights: hasWeekWeights ? weekWeights : (last.dayWeights || ['', '', '', '', '', '', '']),
            subjEnergy: 0, subjHunger: 0, subjMood: 0, subjSleep: 0, subjStrength: 0,
          });
          setOpen({ input: false, plan: false, check: true, storico: false });
        } else if (hasWeekWeights) {
          setCheckForm(prev => ({ ...prev, dayWeights: weekWeights, weeklyAvgWeight: weekAvg }));
        }
      } catch {
        showToast('Errore nel caricamento dei dati', 'error');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function persistEntry(entry: DietCheckEntry, toastOnSuccess = true) {
    const ok = await postDiet({ action: 'saveEntry', entry });
    if (ok) { if (toastOnSuccess) showToast('✓ Entry salvata', 'success'); }
    else showToast('Errore nel salvataggio della entry', 'error');
  }

  function commitCheckEntry(kcalOverride?: number) {
    storicoJustCleared.current = false;
    const nextWeeksPassed = (toNum(checkForm.weeksPassed) || 1) + 1;
    let nextDbWeek = pb.dbCurrentCycleWeek;
    if (isCut(pb) && pb.dietBreakEnabled) {
      const cycleLen = pb.dbDeficitWeeks + pb.dbBreakWeeks;
      nextDbWeek = (pb.dbCurrentCycleWeek % cycleLen) + 1;
    }
    const activeKcal = kcalOverride ?? getActiveCalories(pb, currentCalories);
    const entry: DietCheckEntry = {
      date: new Date().toISOString(), weeksPassed: nextWeeksPassed,
      weeklyAvgWeight: checkForm.weeklyAvgWeight, checkBodyFat: checkForm.checkBodyFat,
      weeklyMeasureWaist: checkForm.weeklyMeasureWaist,
      weeklyMeasureHips: checkForm.weeklyMeasureHips, weeklyMeasureChest: checkForm.weeklyMeasureChest,
      weeklyMeasureArm: checkForm.weeklyMeasureArm, weeklyMeasureThigh: checkForm.weeklyMeasureThigh,
      weeklyWalkAmount: checkForm.weeklyWalkAmount, weeklyWalkUnit: checkForm.weeklyWalkUnit,
      weeklySkinfoldChest: checkForm.weeklySkinfoldChest, weeklySkinfoldAbdomen: checkForm.weeklySkinfoldAbdomen,
      weeklySkinfoldTricep: checkForm.weeklySkinfoldTricep, weeklySkinfoldSuprailiac: checkForm.weeklySkinfoldSuprailiac, weeklySkinfoldThigh: checkForm.weeklySkinfoldThigh,
      weeklySkinfoldSubscapular: checkForm.weeklySkinfoldSubscapular, weeklySkinfoldMidaxillary: checkForm.weeklySkinfoldMidaxillary,
      dayWeights: checkForm.dayWeights, currentCalories: activeKcal,
      goal: pb.goal, approachKey: pb.approachKey, reverseTargetBand: pb.reverseTargetBand,
      sfPhase: pb.sfPhase, cutLossRate: pb.cutLossRate, cutTargetBF: pb.cutTargetBF,
      dbCurrentCycleWeek: nextDbWeek,
      subjEnergy: checkForm.subjEnergy, subjHunger: checkForm.subjHunger, subjMood: checkForm.subjMood, subjSleep: checkForm.subjSleep, subjStrength: checkForm.subjStrength,
    };
    // Il server (saveEntry) riordina sempre storico per data decrescente dopo
    // l'inserimento: bisogna rispecchiare lo stesso ordinamento anche
    // nell'update ottimistico lato client, altrimenti storico[0] (usato
    // ovunque come riferimento "settimana scorsa") punta all'entry sbagliata
    // finché la pagina non viene ricaricata.
    setStorico(prev => [...prev, entry].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setCheckForm(prev => ({ ...prev, weeksPassed: String(nextWeeksPassed), subjEnergy: 0, subjHunger: 0, subjMood: 0, subjSleep: 0, subjStrength: 0 }));
    if (nextDbWeek !== pb.dbCurrentCycleWeek) patchPB({ dbCurrentCycleWeek: nextDbWeek });
    return persistEntry(entry);
  }

  function acceptSuggestion(kcal: number) {
    setCurrentCalories(kcal);
    if (checkForm.weeklyAvgWeight !== '') patchPB({ weight: checkForm.weeklyAvgWeight });
    commitCheckEntry(kcal);
    setSuggestion(null);
    showToast(`✓ Piano aggiornato: ${kcal} kcal — entry salvata`, 'success');
    setOpen(prev => ({ ...prev, plan: true }));
  }

  /** Peso, BF% e vita dell'ultimo check compilato: servono a calcolare e a creare la baseline della fase successiva. */
  function latestMeasures(): Partial<PianoBase> {
    return {
      ...(checkForm.weeklyAvgWeight !== '' ? { weight: checkForm.weeklyAvgWeight } : {}),
      ...(checkForm.checkBodyFat !== '' ? { bodyFat: normalizeBodyFatInput(checkForm.checkBodyFat) } : {}),
      ...(checkForm.weeklyMeasureWaist !== '' ? { measureWaist: checkForm.weeklyMeasureWaist } : {}),
    };
  }

  /** Cambio fase guidato: salva l'ultimo check della fase che finisce, poi attiva la successiva con un nuovo baseline. */
  async function applyTransition(to: PhaseGoal, lastKcal: number) {
    if (transitioning.current) return; // un secondo clic durante il salvataggio non deve aprire una seconda transizione
    const latest = latestMeasures();
    const preview = buildTransition({ ...pb, ...latest }, to, lastKcal);
    if (!(await mobileConfirm(`${preview.summary}\n\nConfermi il passaggio?`, { confirmLabel: 'Attiva fase' }))) return;
    transitioning.current = true;
    try {
      // 1. Check di chiusura della fase che finisce (con il goal vecchio), atteso: la baseline deve datare dopo.
      await commitCheckEntry(lastKcal);
      // +1 ms: la baseline si ordina dopo l'entry di chiusura appena salvata.
      const nowIso = new Date(Date.now() + 1).toISOString();
      const t = buildTransition({ ...pb, ...latest }, to, lastKcal, nowIso);
      const nextPb: PianoBase = { ...pb, ...latest, ...t.patch };
      const baseline = { ...buildBaselineEntry(nextPb, t.startKcal), date: nowIso };
      // 2. Piano base col nuovo obiettivo: se fallisce non cambia nulla (il check di chiusura resta salvato).
      const ok = await postDiet({ action: 'saveBase', pianoBase: { ...nextPb, savedAt: new Date().toISOString() } });
      if (!ok) { showToast('Errore nel salvataggio del piano base: passaggio annullato (il check è salvato)', 'error'); return; }
      // 3. Baseline della nuova fase.
      setPb(nextPb);
      setCurrentCalories(t.startKcal);
      setStorico(prev => [...prev, baseline].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      setCheckForm(prev => ({ ...prev, weeksPassed: '0' })); // la baseline ha weeksPassed 0: la nuova fase riparte da zero
      await persistEntry(baseline, false);
      setSuggestion(null);
      showToast(`✓ Fase attivata: ${GOAL_META[to].label} — ${t.startKcal} kcal`, 'success');
      setOpen(prev => ({ ...prev, plan: true }));
    } finally {
      transitioning.current = false;
    }
  }

  function handleCalcPlan() {
    const errs = validateInput(pb);
    setInputErrors(errs);
    if (errs.length) return;
    setOpen(prev => ({ ...prev, plan: true }));
    // Un'entry per questo goal esiste già in storico (baseline o check reale)?
    // Se sì, questo è solo un ricalcolo dei parametri di un piano in corso:
    // niente nuovo baseline (altrimenti ogni "Calcola Piano" reinquinerebbe
    // storico[0], che è il riferimento "settimana scorsa" usato ovunque) e
    // niente reset delle calorie tracciate (altrimenti si perderebbero
    // settimane di progressione ogni volta che si torna su Input).
    // "Per questo goal" = nella fase in corso: nel secondo giro del ciclo le entry
    // della fase precedente con lo stesso goal non devono impedire il nuovo baseline.
    const hasEntryForGoal = getPhaseStorico(pb, storico).length > 0;
    if (!storicoJustCleared.current && !hasEntryForGoal) {
      setCurrentCalories(null);
      // Cambio obiettivo a mano (senza pannello di transizione): la fase riparte da qui e
      // il mantenimento di riferimento della fase precedente non vale più.
      const freshPb = { ...pb, phaseMaintenanceKcal: null };
      const entry = buildBaselineEntry(freshPb);
      patchPB({ phaseStartedAt: entry.date, phaseMaintenanceKcal: null });
      setStorico(prev => [...prev, entry].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      void persistEntry(entry, false);
    }
  }

  async function handleGoToCheck() {
    const ok = await postDiet({ action: 'saveBase', pianoBase: { ...pb, savedAt: new Date().toISOString() } });
    showToast(ok ? '✓ Piano base salvato' : 'Errore nel salvataggio del piano base', ok ? 'success' : 'error');
    setOpen(prev => ({ ...prev, check: true }));
  }

  async function handleResetTracked() {
    if (!(await mobileConfirm('Azzerare le calorie tracciate?'))) return;
    setCurrentCalories(null);
    showToast('Calorie tracciate azzerate', 'success');
  }

  function handleDayChange(idx: number, value: string) {
    const next = [...checkForm.dayWeights]; next[idx] = value;
    const nums = next.map(toNum).filter((x): x is number => x != null);
    const avg = nums.length > 0 ? String(round(nums.reduce((a, b) => a + b, 0) / nums.length, 2)) : '';
    setCheckForm(prev => ({ ...prev, dayWeights: next, weeklyAvgWeight: avg }));
  }

  function handleClearDays() {
    setCheckForm(prev => ({ ...prev, dayWeights: ['', '', '', '', '', '', ''], weeklyAvgWeight: '' }));
  }

  function handleEvaluate() {
    const weeklyErrs = validateWeekly(checkForm.weeklyAvgWeight, checkForm.weeklyMeasureWaist, checkForm.checkBodyFat);
    if (weeklyErrs.length) { setWeeklyError(weeklyErrs.join(' · ')); return; }
    setWeeklyError('');
    const prevCal = getActiveCalories(pb, currentCalories);
    const measures = { waist: checkForm.weeklyMeasureWaist };
    const result = computeWeeklyCheck(pb, storico, prevCal, toNum(checkForm.weeklyAvgWeight), toNum(checkForm.checkBodyFat) as unknown as number, measures);
    if (result.decision === 'not_implemented') {
      setModalMsg(`Il protocollo ${(pb.goal || '').toUpperCase()} non è ancora implementato in questa versione.`);
      return;
    }
    setSuggestion(result);
  }

  function handleSaveWithoutEvaluating() {
    const weeklyErrs = validateWeekly(checkForm.weeklyAvgWeight, checkForm.weeklyMeasureWaist, checkForm.checkBodyFat);
    if (weeklyErrs.length) { setWeeklyError(weeklyErrs.join(' · ')); return; }
    setWeeklyError('');
    commitCheckEntry();
    showToast('✓ Dati settimanali salvati', 'success');
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify({ version: '2.1', pianoBase: pb, storico }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `diet-plan-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('✓ Esportazione completata', 'success');
  }

  async function handleClearStorico() {
    if (!(await mobileConfirm('Cancellare tutto lo storico? Irreversibile.'))) return;
    const ok = await postDiet({ action: 'clear' });
    if (!ok) { showToast('Errore: impossibile cancellare lo storico', 'error'); return; }
    setStorico([]);
    storicoJustCleared.current = true;
    showToast('Storico cancellato', 'success');
  }

  function handleLoadEntry(idx: number) {
    const e = storico[idx];
    if (!e) return;
    setCheckForm({
      weeklyAvgWeight: e.weeklyAvgWeight || '', weeksPassed: String(e.weeksPassed || 1),
      checkBodyFat: normalizeBodyFatInput(e.checkBodyFat),
      weeklyMeasureWaist: e.weeklyMeasureWaist || '',
      weeklyMeasureHips: e.weeklyMeasureHips || '', weeklyMeasureChest: e.weeklyMeasureChest || '',
      weeklyMeasureArm: e.weeklyMeasureArm || '', weeklyMeasureThigh: e.weeklyMeasureThigh || '',
      weeklyWalkAmount: e.weeklyWalkAmount || '', weeklyWalkUnit: e.weeklyWalkUnit || 'passi',
      weeklySkinfoldChest: e.weeklySkinfoldChest || '', weeklySkinfoldAbdomen: e.weeklySkinfoldAbdomen || '',
      weeklySkinfoldTricep: e.weeklySkinfoldTricep || '', weeklySkinfoldSuprailiac: e.weeklySkinfoldSuprailiac || '', weeklySkinfoldThigh: e.weeklySkinfoldThigh || '',
      weeklySkinfoldSubscapular: e.weeklySkinfoldSubscapular || '', weeklySkinfoldMidaxillary: e.weeklySkinfoldMidaxillary || '',
      dayWeights: e.dayWeights || ['', '', '', '', '', '', ''],
      subjEnergy: e.subjEnergy || 0, subjHunger: e.subjHunger || 0, subjMood: e.subjMood || 0, subjSleep: e.subjSleep || 0, subjStrength: e.subjStrength || 0,
    });
    setCurrentCalories(toNum(e.currentCalories));
    setSuggestion(null);
    showToast(`Entry W${e.weeksPassed || '—'} caricata`, 'success');
    setOpen(prev => ({ ...prev, check: true }));
  }

  function handleStartEditEntry(idx: number) {
    const e = storico[idx];
    if (!e) return;
    setEditDraft({
      weeklyAvgWeight: e.weeklyAvgWeight || '', currentCalories: e.currentCalories != null ? String(e.currentCalories) : '',
      checkBodyFat: normalizeBodyFatInput(e.checkBodyFat), weeklyMeasureWaist: e.weeklyMeasureWaist || '',
    });
    setEditingIdx(idx);
  }

  function handleCancelEditEntry() {
    setEditingIdx(null);
  }

  async function handleSaveEditEntry(idx: number) {
    const original = storico[idx];
    if (!original) return;
    const updated: DietCheckEntry = {
      ...original,
      weeklyAvgWeight: editDraft.weeklyAvgWeight,
      currentCalories: toNum(editDraft.currentCalories),
      checkBodyFat: editDraft.checkBodyFat,
      weeklyMeasureWaist: editDraft.weeklyMeasureWaist,
    };
    const ok = await postDiet({ action: 'updateEntry', originalDate: original.date, entry: updated });
    if (!ok) { showToast('Errore nel salvataggio della modifica', 'error'); return; }
    setStorico(prev => prev.map((e, i) => (i === idx ? updated : e)));
    setEditingIdx(null);
    showToast('✓ Entry aggiornata', 'success');
  }

  async function handleDeleteEntry(idx: number) {
    const e = storico[idx];
    if (!e) return;
    if (!(await mobileConfirm('Cancellare questa pesata dallo storico?'))) return;
    const ok = await postDiet({ action: 'deleteEntry', date: e.date });
    if (!ok) { showToast('Errore nella cancellazione della entry', 'error'); return; }
    setStorico(prev => prev.filter((_, i) => i !== idx));
    // editingIdx è posizionale: dopo la rimozione, le righe successive
    // scalano di uno, quindi va aggiornato di conseguenza (o azzerato se
    // era proprio la riga cancellata) — altrimenti il form di editing
    // resterebbe agganciato alla riga sbagliata.
    setEditingIdx(prev => (prev === null ? null : prev === idx ? null : prev > idx ? prev - 1 : prev));
    showToast('✓ Entry cancellata', 'success');
  }

  if (loading) {
    return <div style={{ padding: '22px 24px', maxWidth: 1100, margin: '0 auto', color: 'var(--sb-text-muted)', fontSize: 13 }}>Caricamento…</div>;
  }

  const plausibilityWarnings = checkPlausibility(pb);
  const proteinFloorWarn = checkProteinFloorWarn(pb);
  const proteinInDeficit = isInDeficitPhase(pb);
  const proteinFloorMin = proteinInDeficit ? proteinFloorLBMForAge(toNum(pb.age)) : proteinFloorLBMForAgeNoDeficit(toNum(pb.age));
  const initial = computeInitialStartCalories(pb);
  const activeKcal = getActiveCalories(pb, currentCalories);
  const currentLBM = getCurrentLBM(pb, checkForm.weeklyAvgWeight, checkForm.checkBodyFat);
  const macros = computeMacros(pb, activeKcal, currentLBM);
  const lbm = computeLBM(pb);
  const lbmTable = getLBMTable(pb);
  const goalMeta = pb.goal ? GOAL_META[pb.goal as Exclude<Goal, ''>] : null;
  const underestWarning = computeUnderestimationWarning(pb, storico);
  // Prima solo isCut(pb): la SF Fase 1 è una fase di deficit a tutti gli
  // effetti (v. computeUnderestimationWarning) e merita lo stesso banner.
  const inDeficitPhase = isCut(pb) || (isSF(pb) && pb.sfPhase === 1);
  const plateau = inDeficitPhase ? detectPlateau(storico, pb) : null;
  const currentBF = getCurrentBF(pb, checkForm.checkBodyFat);
  const currentWeight = getCurrentWeight(pb, checkForm.weeklyAvgWeight);
  const baselineJP3 = jp3FromSkinfolds(pb.sex, pb.age, { chest: pb.measureChest, abdomen: pb.measureAbdomen, tricep: pb.measureTricep, suprailiac: pb.measureSuprailiac, thigh: pb.measureThigh, subscapular: pb.measureSubscapular, midaxillary: pb.measureMidaxillary }, pb.preferJp3Hip);
  const checkJP3 = jp3FromSkinfolds(pb.sex, pb.age, { chest: checkForm.weeklySkinfoldChest, abdomen: checkForm.weeklySkinfoldAbdomen, tricep: checkForm.weeklySkinfoldTricep, suprailiac: checkForm.weeklySkinfoldSuprailiac, thigh: checkForm.weeklySkinfoldThigh, subscapular: checkForm.weeklySkinfoldSubscapular, midaxillary: checkForm.weeklySkinfoldMidaxillary }, pb.preferJp3Hip);

  function patchSkinfoldPB(field: 'measureChest' | 'measureAbdomen' | 'measureTricep' | 'measureSuprailiac' | 'measureThigh' | 'measureSubscapular' | 'measureMidaxillary', value: string) {
    const next = { ...pb, [field]: value };
    const { bf } = jp3FromSkinfolds(next.sex, next.age, { chest: next.measureChest, abdomen: next.measureAbdomen, tricep: next.measureTricep, suprailiac: next.measureSuprailiac, thigh: next.measureThigh, subscapular: next.measureSubscapular, midaxillary: next.measureMidaxillary }, next.preferJp3Hip);
    patchPB(bf != null ? { [field]: value, bodyFat: normalizeBodyFatInput(String(bf)) } : { [field]: value });
  }
  function patchSkinfoldCheck(field: 'weeklySkinfoldChest' | 'weeklySkinfoldAbdomen' | 'weeklySkinfoldTricep' | 'weeklySkinfoldSuprailiac' | 'weeklySkinfoldThigh' | 'weeklySkinfoldSubscapular' | 'weeklySkinfoldMidaxillary', value: string) {
    const next = { ...checkForm, [field]: value };
    const { bf } = jp3FromSkinfolds(pb.sex, pb.age, { chest: next.weeklySkinfoldChest, abdomen: next.weeklySkinfoldAbdomen, tricep: next.weeklySkinfoldTricep, suprailiac: next.weeklySkinfoldSuprailiac, thigh: next.weeklySkinfoldThigh, subscapular: next.weeklySkinfoldSubscapular, midaxillary: next.weeklySkinfoldMidaxillary }, pb.preferJp3Hip);
    patchCheck(bf != null ? { [field]: value, checkBodyFat: normalizeBodyFatInput(String(bf)) } : { [field]: value });
  }

  return (
    <div style={{ padding: '22px 24px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: 'var(--sb-text)', color: 'var(--sb-bg)', fontSize: 12.5, fontWeight: 600,
          padding: '10px 16px', borderRadius: 8, borderLeft: `4px solid ${toast.type === 'error' ? 'var(--sb-red)' : 'var(--sb-accent)'}`,
        }}>{toast.msg}</div>
      )}

      {/* Modal generico (bulk non implementato / check non implementato) */}
      {modalMsg && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 8000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setModalMsg(null)}>
          <div style={{ ...CARD, maxWidth: 440, width: '100%', padding: 24 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--sb-text)' }}>Funzionalità non ancora disponibile</p>
              <button onClick={() => setModalMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sb-text-muted)' }}><X size={16} /></button>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--sb-text-sub)', whiteSpace: 'pre-line', lineHeight: 1.6, marginBottom: 16 }}>{modalMsg}</p>
            <button style={BTN_PRIMARY} onClick={() => setModalMsg(null)}>Chiudi</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 140 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--sb-text)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Scale style={{ width: 18, height: 18, color: 'var(--sb-accent)' }} /> Diet Plan
          </h1>
          <p style={{ fontSize: 12, color: 'var(--sb-text-muted)', marginTop: 3 }}>
            {goalMeta ? <span style={{ color: goalMeta.color, fontWeight: 600 }}>{goalMeta.label}</span> : 'Nessun obiettivo impostato'}
            {' · '}{storico.length} check salvat{storico.length === 1 ? 'o' : 'i'}
          </p>
        </div>
      </div>

      {plausibilityWarnings.length > 0 && (
        <div style={{ ...CARD, borderColor: 'var(--sb-accent)', padding: '10px 14px', marginBottom: 14, fontSize: 12, color: 'var(--sb-text-sub)' }}>
          <strong style={{ color: 'var(--sb-accent)' }}>⚠ Attenzione — valori da verificare:</strong> {plausibilityWarnings.join(' · ')}
        </div>
      )}

      {/* ═══ 01 INPUT ═══ */}
      <SectionCard title="Input dati" sub="Parametri fisici e obiettivo" open={open.input} onToggle={() => setOpen(p => ({ ...p, input: !p.input }))}>
        {inputErrors.length > 0 && (
          <div style={{ ...CARD, borderColor: 'var(--sb-red)', padding: '10px 14px', margin: '12px 0', fontSize: 12, color: 'var(--sb-red)' }}>
            <strong>Correggi:</strong>{inputErrors.map((e, i) => <div key={i}>— {e}</div>)}
          </div>
        )}

        <p style={{ ...LABEL, marginTop: 14 }}>Parametri fisici</p>
        <Grid cols={4}>
          <Field label="Sesso *">
            <select style={FIELD} value={pb.sex} onChange={e => patchPB({ sex: e.target.value as PianoBase['sex'] })}>
              <option value="">—</option><option value="male">Maschio</option><option value="female">Femmina</option>
            </select>
          </Field>
          <Field label="Data di nascita *" hint={pb.age ? `Età: ${pb.age} anni` : undefined}>
            <input type="date" style={FIELD} value={pb.birthDate} onChange={e => {
              const birthDate = e.target.value;
              const age = computeAge(birthDate, todayItaly());
              patchPB(age != null ? { birthDate, age } : { birthDate });
            }} />
          </Field>
          <Field label="Altezza cm *"><NumberInput style={FIELD} value={pb.height} onChange={n => patchPB({ height: n })} /></Field>
          <Field label="Peso kg *"><input type="number" step="0.1" style={FIELD} placeholder="78.5" value={pb.weight} onChange={e => patchPB({ weight: e.target.value })} /></Field>
        </Grid>
        <Grid cols={2}>
          <Field label="Body Fat % *" hint="Necessario per LBM e tabelle di mantenimento. Range: 2–65%.">
            <BodyFatInput step="0.1" style={FIELD} placeholder="15.0" value={pb.bodyFat} onChange={v => patchPB({ bodyFat: v })} />
          </Field>
          <Field label="Obiettivo *">
            <select style={FIELD} value={pb.goal} onChange={e => patchPB({ goal: e.target.value as Goal })}>
              <option value="">— seleziona —</option>
              <option value="cut">Cut — Dimagrire</option>
              <option value="bulk">Bulk — Aumentare massa</option>
              <option value="reverse_diet">Reverse Diet</option>
              <option value="skinny_fat">Skinny Fat</option>
              <option value="maintenance">Mantenimento</option>
            </select>
          </Field>
        </Grid>

        {goalMeta && (
          <div style={{ ...CARD, padding: 12, marginBottom: 10, display: 'flex', gap: 12 }}>
            <span style={{ fontWeight: 700, color: goalMeta.color, minWidth: 90, flexShrink: 0 }}>{goalMeta.label.toUpperCase()}</span>
            <span style={{ fontSize: 12, color: 'var(--sb-text-sub)', lineHeight: 1.6 }}>
              {isCut(pb) && (() => {
                const wN = toNum(pb.weight) || 0;
                const dailyDeficit = wN > 0 ? Math.round((wN * pb.cutLossRate / 100 * 7700) / 7) : null;
                return dailyDeficit ? `Dimagrimento scientifico basato sul ritmo di perdita. Deficit stimato: −${dailyDeficit} kcal/die per −${pb.cutLossRate}%/sett. Proteine elevate per preservare la massa magra.` : 'Inserisci il peso per vedere il deficit stimato.';
              })()}
              {isBulk(pb) && 'Lean bulk: surplus controllato, guadagno atteso 0,25–0,5% del peso a settimana. Finisce quando raggiungi il BF% massimo o il peso target che imposti qui sotto.'}
              {isMaintenance(pb) && 'Peso stabile entro ±0,5% del riferimento: ogni settimana verifico che non derivi. Durata consigliata configurabile qui sotto.'}
              {isReverse(pb) && 'Risalita calorica progressiva verso un target Reverse unico. Configura approccio, target calorico e proteine qui sotto.'}
              {isSF(pb) && 'Protocollo in 3 fasi: Cut → Stabilizzazione Metabolica → Clean Bulk. Configura la fase attiva qui sotto.'}
            </span>
          </div>
        )}

        <p style={{ ...LABEL, marginTop: 14 }}>Misure baseline</p>
        <Grid cols={2}>
          <Field label="Vita cm *" hint="Riscontro oggettivo — il BF% è solo una stima." info={<MeasureInfo text="Ad altezza ombelico." />}>
            <input type="number" step="0.1" style={FIELD} value={pb.measureWaist} onChange={e => patchPB({ measureWaist: e.target.value })} />
          </Field>
          <Field label="BF% da pliche (Jackson-Pollock)" hint={baselineJP3.bf != null ? `${protocolLabel(baselineJP3.protocol)} — copiato automaticamente in “Body Fat %”.` : pb.sex ? 'Compila le pliche qui sotto per calcolarlo.' : 'Seleziona il sesso per calcolarlo.'}>
            <input type="text" readOnly value={baselineJP3.bf != null ? `${baselineJP3.bf}%` : '—'}
              style={{ ...FIELD, fontWeight: 700, cursor: 'default', color: baselineJP3.bf != null ? 'var(--sb-accent)' : 'var(--sb-text-muted)' }} />
          </Field>
        </Grid>
        {pb.sex === 'male' && (
          <div style={{ margin: '0 0 10px' }}>
            <Checkbox
              checked={pb.preferJp3Hip}
              onChange={v => patchPB({ preferJp3Hip: v })}
              label="Usa il set fianchi (tricipite+sovrailiaca) per il 3 punti invece di petto+addome — meglio se il grasso è concentrato sui fianchi."
            />
          </div>
        )}
        <Grid cols={3}>
          {pb.sex === 'female' || (pb.sex === 'male' && pb.preferJp3Hip) ? (
            <>
              <Field label="Tricipite mm" info={<MeasureInfo text="Verticale, sulla parte posteriore del braccio, a metà tra acromion e olecrano, con braccio disteso e rilassato." />}>
                <input type="number" step="0.5" style={FIELD} value={pb.measureTricep} onChange={e => patchSkinfoldPB('measureTricep', e.target.value)} />
              </Field>
              <Field label="Sovrailiaca mm" info={<MeasureInfo text="Obliqua, seguendo la naturale piega della pelle, appena sopra la cresta iliaca sulla linea ascellare anteriore." />}>
                <input type="number" step="0.5" style={FIELD} value={pb.measureSuprailiac} onChange={e => patchSkinfoldPB('measureSuprailiac', e.target.value)} />
              </Field>
            </>
          ) : (
            <>
              <Field label="Pettorale mm"><input type="number" step="0.5" style={FIELD} value={pb.measureChest} onChange={e => patchSkinfoldPB('measureChest', e.target.value)} /></Field>
              <Field label="Addome mm"><input type="number" step="0.5" style={FIELD} value={pb.measureAbdomen} onChange={e => patchSkinfoldPB('measureAbdomen', e.target.value)} /></Field>
            </>
          )}
          <Field label="Coscia mm"><input type="number" step="0.5" style={FIELD} value={pb.measureThigh} onChange={e => patchSkinfoldPB('measureThigh', e.target.value)} /></Field>
        </Grid>

        {pb.sex === 'male' && (
          <>
            <p style={{ ...LABEL, marginTop: 10 }}>Pliche opzionali — per il 7 punti</p>
            <Grid cols={4}>
              {pb.preferJp3Hip ? (
                <>
                  <Field label="Pettorale mm"><input type="number" step="0.5" style={FIELD} value={pb.measureChest} onChange={e => patchSkinfoldPB('measureChest', e.target.value)} /></Field>
                  <Field label="Addome mm"><input type="number" step="0.5" style={FIELD} value={pb.measureAbdomen} onChange={e => patchSkinfoldPB('measureAbdomen', e.target.value)} /></Field>
                </>
              ) : (
                <>
                  <Field label="Tricipite mm" info={<MeasureInfo text="Verticale, sulla parte posteriore del braccio, a metà tra acromion e olecrano, con braccio disteso e rilassato." />}>
                    <input type="number" step="0.5" style={FIELD} value={pb.measureTricep} onChange={e => patchSkinfoldPB('measureTricep', e.target.value)} />
                  </Field>
                  <Field label="Sovrailiaca mm" info={<MeasureInfo text="Obliqua, seguendo la naturale piega della pelle, appena sopra la cresta iliaca sulla linea ascellare anteriore." />}>
                    <input type="number" step="0.5" style={FIELD} value={pb.measureSuprailiac} onChange={e => patchSkinfoldPB('measureSuprailiac', e.target.value)} />
                  </Field>
                </>
              )}
              <Field label="Sottoscapolare mm" info={<MeasureInfo text="Obliqua a 45°, 1-2 cm sotto l'angolo inferiore della scapola." />}>
                <input type="number" step="0.5" style={FIELD} value={pb.measureSubscapular} onChange={e => patchSkinfoldPB('measureSubscapular', e.target.value)} />
              </Field>
              <Field label="Ascellare mm" info={<MeasureInfo text="Verticale, sulla linea ascellare media, all'altezza del processo xifoideo (sterno)." />}>
                <input type="number" step="0.5" style={FIELD} value={pb.measureMidaxillary} onChange={e => patchSkinfoldPB('measureMidaxillary', e.target.value)} />
              </Field>
            </Grid>
            <p style={HINT}>Se compili anche queste 4, il piano passa automaticamente al 7 punti — più accurato, a prescindere dal checkbox sopra.</p>
          </>
        )}

        <p style={{ ...LABEL, marginTop: 14 }}>Configurazione</p>
        <Grid cols={3}>
          <Field label="Lifestyle Factor">
            <select style={FIELD} value={pb.lifestyleFactor} onChange={e => patchPB({ lifestyleFactor: Number(e.target.value) })}>
              <option value="0.6">0.60 — Sedentario</option><option value="0.7">0.70 — Light</option><option value="0.8">0.80 — Moderate</option><option value="0.9">0.90 — High</option><option value="1.0">1.00 — Extreme</option>
            </select>
          </Field>
          <Field label="Exercise Factor">
            <select style={FIELD} value={pb.exerciseFactor} onChange={e => patchPB({ exerciseFactor: Number(e.target.value) })}>
              <option value="0.55">0.55 — Sedentario</option><option value="0.65">0.65 — Light</option><option value="0.75">0.75 — Moderate</option><option value="0.85">0.85 — Intense</option><option value="0.95">0.95 — Extreme</option>
            </select>
          </Field>
          <Field label="Metodo TDEE">
            <select style={FIELD} value={pb.tdeeMethod} onChange={e => patchPB({ tdeeMethod: e.target.value as PianoBase['tdeeMethod'] })}>
              <option value="media">Media (A+M)</option><option value="muller">Müller</option><option value="aragon">Aragon</option>
            </select>
          </Field>
        </Grid>
        <p style={HINT}>TDEE = BMR × (Lifestyle + Exercise). Lifestyle = NEAT quotidiano, Exercise = attività sportiva.</p>

        {isReverse(pb) && <ReverseConfig pb={pb} patchPB={patchPB} />}
        {(isBulk(pb) || (isSF(pb) && pb.sfPhase === 3)) && <BulkConfig pb={pb} patchPB={patchPB} />}
        {isMaintenance(pb) && <MaintenanceConfig pb={pb} patchPB={patchPB} />}
        {isSF(pb) && (
          <GoalColorPanel color={GOAL_META.skinny_fat.color} title="Configurazione Skinny Fat — Fase attiva">
            <Grid cols={pb.sfPhase === 1 ? 4 : (pb.sfPhase === 2 ? 4 : 3)}>
              <Field label="Fase">
                <select style={FIELD} value={pb.sfPhase} onChange={e => patchPB({ sfPhase: Number(e.target.value) })}>
                  <option value={1}>Fase 1 — Cut</option><option value={2}>Fase 2 — Reverse Diet</option><option value={3}>Fase 3 — Clean Bulk</option>
                </select>
              </Field>
              <Field label="Deficit Fase 1 %" hint="10–20%. Default: 15%.">
                <NumberInput style={FIELD} value={pb.sfDeficitPct} min={10} max={20} onChange={n => patchPB({ sfDeficitPct: n })} />
              </Field>
              <Field label="Target BF% fine Fase 1" hint="♂ ~12–14% · ♀ ~20–22%">
                <NumberInput step="0.5" style={FIELD} value={pb.sfTargetBF} onChange={n => patchPB({ sfTargetBF: n })} />
              </Field>
              {pb.sfPhase === 2 && (
                <Field label="Ritmo Fase 2 (cap.5/7)" hint="Default Conservativo — coerente con l'obiettivo di stabilizzazione della fase.">
                  <select style={FIELD} value={pb.approachKey} onChange={e => patchPB({ approachKey: e.target.value as PianoBase['approachKey'] })}>
                    <option value="conservative">Conservativo (+1–3%/sett · ≤0.2% kg/sett)</option>
                    <option value="moderate">Moderato (+3–6%/sett · ≤0.5% kg/sett)</option>
                    <option value="aggressive">Aggressivo (+6–9%/sett · ≤0.8% kg/sett)</option>
                  </select>
                </Field>
              )}
              <Field label="Proteine min. (cap.6/8)" hint={`${proteinInDeficit ? 'In deficit' : 'Senza deficit'}, per la tua età: min ${proteinFloorMin} g/kg LBM.`}>
                {proteinFloorWarn && <p style={{ fontSize: 10.5, color: 'var(--sb-red)' }}>⚠ Sotto il minimo raccomandato — rischio perdita massa magra.</p>}
              </Field>
            </Grid>
            {(pb.sfPhase === 2 || pb.sfPhase === 3) && (
              <DurationCallout text={`Cap.9: un reverse/stabilizzazione dovrebbe durare almeno quanto la dieta da cui recuperi (più a lungo se hai fatto yo-yo dieting cronico). Durata indicativa di questa fase: ${SF_PHASES[pb.sfPhase].dur}. È normale che peso/misure si muovano in modo irregolare (plateau poi salti) settimana su settimana — non uscire dalla fase troppo presto solo perché sembra "ferma".`} />
            )}
          </GoalColorPanel>
        )}
        {isCut(pb) && (
          <>
            <GoalColorPanel color={GOAL_META.cut.color} title="Configurazione Cut — Parametri dimagrimento">
              <Grid cols={3}>
                <Field label="Ritmo perdita % peso/sett *" hint="0.4–0.8% raccomandato · max 1%. Il deficit kcal/die viene calcolato automaticamente.">
                  <NumberInput step="0.1" style={FIELD} value={pb.cutLossRate} onChange={n => patchPB({ cutLossRate: n })} />
                </Field>
                <Field label="Target BF% finale" hint="♂ 10–15% · ♀ 18–24%. Determina l'uscita → Reverse Diet.">
                  <NumberInput step="0.5" style={FIELD} value={pb.cutTargetBF} onChange={n => patchPB({ cutTargetBF: n })} />
                </Field>
                <Field label="Proteine min. (cap.8)" hint={`In deficit, per la tua età: min ${proteinFloorMin} g/kg LBM per preservare la massa magra.`}>
                  {proteinFloorWarn && <p style={{ fontSize: 10.5, color: 'var(--sb-red)' }}>⚠ Sotto il minimo raccomandato — rischio perdita massa magra.</p>}
                </Field>
              </Grid>
            </GoalColorPanel>
            <GoalColorPanel color="var(--sb-blue)" title="Refeed Days — Giorni ad alto apporto calorico">
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                <button style={BTN_GHOST} onClick={() => patchPB({ refeedEnabled: !pb.refeedEnabled })}>{pb.refeedEnabled ? 'Disabilita' : 'Abilita'}</button>
              </div>
              <div style={{ opacity: pb.refeedEnabled ? 1 : 0.45 }}>
                <Grid cols={2}>
                  <Field label="Giorni refeed/settimana" hint="1–2 giorni. Il budget settimanale rimane invariato.">
                    <NumberInput min={1} max={2} style={FIELD} value={pb.refeedDays} onChange={n => patchPB({ refeedDays: n })} />
                  </Field>
                  <Field label="Surplus refeed kcal" hint="Calorie extra nei giorni refeed (solo carbs).">
                    <NumberInput min={150} max={600} step={50} style={FIELD} value={pb.refeedSurplus} onChange={n => patchPB({ refeedSurplus: n })} />
                  </Field>
                </Grid>
              </div>
            </GoalColorPanel>
            <GoalColorPanel color="var(--sb-text-muted)" title="Diet Break — Pause pianificate dal deficit (MATADOR)">
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                <button style={BTN_GHOST} onClick={() => patchPB({ dietBreakEnabled: !pb.dietBreakEnabled })}>{pb.dietBreakEnabled ? 'Disabilita' : 'Abilita'}</button>
              </div>
              <div style={{ opacity: pb.dietBreakEnabled ? 1 : 0.45 }}>
                <Grid cols={3}>
                  <Field label="Settimane di deficit" hint="Consecutive prima della pausa (studio MATADOR: 2–4).">
                    <NumberInput min={2} max={6} style={FIELD} value={pb.dbDeficitWeeks} onChange={n => patchPB({ dbDeficitWeeks: n })} />
                  </Field>
                  <Field label="Settimane di pausa" hint="1–2 sett. a mantenimento.">
                    <NumberInput min={1} max={2} style={FIELD} value={pb.dbBreakWeeks} onChange={n => patchPB({ dbBreakWeeks: n })} />
                  </Field>
                  <Field label="Settimana corrente nel ciclo" hint="Determina se sei in deficit o in pausa.">
                    <NumberInput min={1} max={8} style={FIELD} value={pb.dbCurrentCycleWeek} onChange={n => patchPB({ dbCurrentCycleWeek: n })} />
                  </Field>
                </Grid>
              </div>
            </GoalColorPanel>
          </>
        )}

        <Grid cols={2}>
          <Field label="Proteine g/kg LBM" hint={`Tabella 6.1 per età, ${proteinInDeficit ? 'in deficit' : 'senza deficit'}: min ${proteinFloorMin} g/kg LBM per la tua età.`}>
            <NumberInput step="0.1" style={FIELD} value={pb.proteinPerKgLBM} onChange={n => patchPB({ proteinPerKgLBM: n, reverseProteinPreset: syncReverseProteinPresetFromValue(n) })} />
          </Field>
          <Field label="Mantenimento misurato kcal (opzionale)" hint="Priorità sulle formule. Misura con 2–4 settimane di tracking.">
            <input type="number" style={FIELD} placeholder="—" value={pb.measuredMaintenance} onChange={e => patchPB({ measuredMaintenance: e.target.value })} />
          </Field>
        </Grid>

        <div style={{ ...CARD, padding: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 11.5 }}>
            <span style={{ fontWeight: 600, color: 'var(--sb-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ripartizione Carboidrati / Grassi</span>
            <span style={{ fontWeight: 600 }}>Carbs {Math.round(pb.carbPercentOfRemaining * 100)}% · Grassi {Math.round((1 - pb.carbPercentOfRemaining) * 100)}%</span>
          </div>
          <input type="range" min={0} max={1} step={0.01} value={pb.carbPercentOfRemaining} onChange={e => patchPB({ carbPercentOfRemaining: Number(e.target.value) })} style={{ width: '100%' }} />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={BTN_PRIMARY} onClick={handleCalcPlan}>Calcola Piano →</button>
          <button style={BTN_GHOST} onClick={handleResetTracked}>Reset Calorie Tracciate</button>
        </div>
      </SectionCard>

      {/* ═══ 02 PIANO ATTIVO ═══ */}
      <SectionCard title="Piano attivo" sub="Calorie · macronutrienti · target tabelle guida" badge={currentCalories != null ? { text: `${activeKcal} kcal`, color: 'var(--sb-accent)' } : undefined} open={open.plan} onToggle={() => setOpen(p => ({ ...p, plan: !p.plan }))}>
        <div style={{ marginTop: 14 }}>
          {isSF(pb) && <SFPhasePanel pb={pb} currentBF={currentBF} currentLBM={currentLBM} activeKcal={activeKcal} maintenance={initial.maintenance} />}
          {isBulk(pb) && <BulkPhasePanel pb={pb} currentBF={currentBF} activeKcal={activeKcal} maintenance={initial.maintenance} />}
          {isMaintenance(pb) && <MaintenancePhasePanel pb={pb} storico={storico} activeKcal={activeKcal} />}
          {isCut(pb) && <CutPhasePanel pb={pb} currentBF={currentBF} currentLBM={currentLBM} activeKcal={activeKcal} maintenance={getMaintenanceRef(pb)} />}
          {isCut(pb) && pb.refeedEnabled && <RefeedSplitPanel pb={pb} baseKcal={activeKcal} />}
          {isCut(pb) && pb.dietBreakEnabled && <DietBreakPanel pb={pb} baseKcal={activeKcal} maintenance={getMaintenanceRef(pb)} />}
          {(isReverse(pb) || (isSF(pb) && pb.sfPhase === 2)) && lbm && <LBMTablePanel pb={pb} activeKcal={activeKcal} table={lbmTable} />}
          <ProgressBar pb={pb} storico={storico} checkForm={checkForm} currentCalories={currentCalories} />

          <Grid cols={2}>
            <StatBox label="TDEE stimato (formula)" value={initial.maintenance} unit="kcal" sub={`metodo: ${initial.mObj.method || '—'} · AF = ${pb.lifestyleFactor} + ${pb.exerciseFactor} = ${computeAF(pb)}`} />
            <StatBox label="Calorie Piano Attivo" value={activeKcal} unit="kcal" accent="var(--sb-accent)" sub={initial.startLabel} />
          </Grid>
          {isReverse(pb) && getReverseStartWarning(pb, initial.startCalories) && (
            <p style={{ fontSize: 11, color: 'var(--sb-accent)', marginBottom: 10 }}>{getReverseStartWarning(pb, initial.startCalories)}</p>
          )}

          <Grid cols={3}>
            <StatBox label="Proteine" value={macros.proteinG} unit="g" sub={`${macros.proteinK} kcal`} />
            <StatBox label="Carboidrati" value={macros.carbsG} unit="g" sub={`${macros.carbsK} kcal`} />
            <StatBox label="Grassi" value={macros.fatsG} unit="g" sub={`${macros.fatsK} kcal`} />
          </Grid>
          <p style={{ ...HINT, marginBottom: 14 }}>{lbm ? `LBM: ${round(lbm, 2)} kg · Proteine su LBM (${pb.proteinPerKgLBM} g/kg LBM)` : `Proteine su LBM (${pb.proteinPerKgLBM} g/kg LBM) — inserisci BF% per calcolo preciso`}</p>

          <p style={LABEL}>Misure baseline</p>
          <Grid cols={3}>
            <StatBox label="Vita" value={pb.measureWaist || '—'} unit="cm" />
            <StatBox label="BF%" value={normalizeBodyFatPercent(pb.bodyFat) ?? '—'} unit="%" />
            <StatBox label="BF% da pliche" value={baselineJP3.bf ?? '—'} unit="%" sub={protocolLabel(baselineJP3.protocol) || 'Jackson-Pollock'} />
          </Grid>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <button style={BTN_PRIMARY} onClick={handleGoToCheck}>Vai al Check →</button>
            <button style={BTN_GHOST} onClick={() => setOpen(p => ({ ...p, input: true }))}>← Modifica Input</button>
          </div>
        </div>
      </SectionCard>

      {/* ═══ 03 CHECK ═══ */}
      <SectionCard title="Check settimanale" sub="Peso · misure · aggiornamento piano" badge={suggestion ? { text: '✓ valutato', color: 'var(--sb-green)' } : { text: 'in corso', color: 'var(--sb-accent)' }} open={open.check} onToggle={() => setOpen(p => ({ ...p, check: !p.check }))}>
        <div style={{ marginTop: 14 }}>
          {storico.length > 0 && (() => {
            const last = storico[0];
            const prevBF = normalizeBodyFatPercent(last.checkBodyFat);
            return (
              <div style={{ ...CARD, padding: 12, marginBottom: 12 }}>
                <p style={{ ...LABEL, marginBottom: 8 }}>Settimana precedente (da storico)</p>
                <Grid cols={4}>
                  <StatBox label="Peso medio" value={last.weeklyAvgWeight || '—'} unit="kg" />
                  <StatBox label="Calorie" value={last.currentCalories || '—'} unit="kcal" />
                  <StatBox label="BF%" value={prevBF ?? '—'} unit="%" />
                  <StatBox label="Vita" value={last.weeklyMeasureWaist || '—'} unit="cm" />
                </Grid>
              </div>
            );
          })()}

          <p style={LABEL}>Peso giornaliero — ultimi 7 giorni</p>
          <Grid cols={7}>
            {trailing7Dates().map((date, i) => (
              <Field key={date} label={formatDayLabel(date)}>
                <input type="number" step="0.1" style={FIELD} placeholder="—" value={checkForm.dayWeights[i]} onChange={e => handleDayChange(i, e.target.value)} />
              </Field>
            ))}
          </Grid>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: 'var(--sb-text-muted)' }}>{checkForm.dayWeights.filter(d => toNum(d) != null).length}/7 giorni</span>
            <button style={{ ...BTN_GHOST, padding: '4px 10px', fontSize: 11 }} onClick={handleClearDays}>Clear giorni</button>
          </div>

          <Grid cols={4}>
            <Field label="Media peso kg *">
              <input type="number" step="0.01" style={FIELD} placeholder="78.20" value={checkForm.weeklyAvgWeight} onChange={e => patchCheck({ weeklyAvgWeight: e.target.value })} />
            </Field>
            <Field label="Vita cm *" info={<MeasureInfo text="Ad altezza ombelico." />}>
              <input type="number" step="0.1" style={FIELD} value={checkForm.weeklyMeasureWaist} onChange={e => patchCheck({ weeklyMeasureWaist: e.target.value })} />
            </Field>
            <Field label="Body Fat % attuale *">
              <BodyFatInput step="0.1" style={FIELD} placeholder="—" value={checkForm.checkBodyFat} onChange={v => patchCheck({ checkBodyFat: v })} />
            </Field>
            <Field label="Settimane sul piano">
              <input type="number" min={1} style={FIELD} value={checkForm.weeksPassed} onChange={e => patchCheck({ weeksPassed: e.target.value })} />
            </Field>
          </Grid>
          {weeklyError && <p style={{ fontSize: 11, color: 'var(--sb-red)', marginTop: -2, marginBottom: 10 }}>{weeklyError}</p>}

          <Grid cols={2}>
            <StatBox label="Calorie piano attivo" value={activeKcal || '—'} unit="kcal" />
            <StatBox label={isReverse(pb) ? 'Target Reverse' : isCut(pb) ? 'Target BF%' : isBulk(pb) ? 'Fine bulk' : 'Target'} value={
              isReverse(pb) ? `${getReverseTargetMeta(pb).targetKcal ?? '—'} kcal` : isCut(pb) ? `${pb.cutTargetBF}%` : isBulk(pb) ? bulkEndText(pb) : isMaintenance(pb) ? 'Peso ±0,5%' : isSF(pb) ? (pb.sfPhase === 1 ? `${pb.sfTargetBF}%` : pb.sfPhase === 2 ? 'Range normale' : bulkEndText(pb)) : '—'
            } />
          </Grid>

          <p style={{ ...LABEL, marginTop: 8 }}>Pliche cutanee (Jackson-Pollock)</p>
          <Grid cols={4}>
            {pb.sex === 'female' || (pb.sex === 'male' && pb.preferJp3Hip) ? (
              <>
                <Field label="Tricipite mm" info={<MeasureInfo text="Verticale, sulla parte posteriore del braccio, a metà tra acromion e olecrano, con braccio disteso e rilassato." />}>
                  <input type="number" step="0.5" style={FIELD} value={checkForm.weeklySkinfoldTricep} onChange={e => patchSkinfoldCheck('weeklySkinfoldTricep', e.target.value)} />
                </Field>
                <Field label="Sovrailiaca mm" info={<MeasureInfo text="Obliqua, seguendo la naturale piega della pelle, appena sopra la cresta iliaca sulla linea ascellare anteriore." />}>
                  <input type="number" step="0.5" style={FIELD} value={checkForm.weeklySkinfoldSuprailiac} onChange={e => patchSkinfoldCheck('weeklySkinfoldSuprailiac', e.target.value)} />
                </Field>
              </>
            ) : (
              <>
                <Field label="Pettorale mm" info={<MeasureInfo text="A metà tra il capezzolo e la linea ascellare anteriore, seguendo l'inclinazione naturale del pettorale." />}>
                  <input type="number" step="0.5" style={FIELD} value={checkForm.weeklySkinfoldChest} onChange={e => patchSkinfoldCheck('weeklySkinfoldChest', e.target.value)} />
                </Field>
                <Field label="Addome mm" info={<MeasureInfo text="2 cm a lato dell'ombelico, plica verticale." />}>
                  <input type="number" step="0.5" style={FIELD} value={checkForm.weeklySkinfoldAbdomen} onChange={e => patchSkinfoldCheck('weeklySkinfoldAbdomen', e.target.value)} />
                </Field>
              </>
            )}
            <Field label="Coscia mm" info={<MeasureInfo text="A metà tra piega inguinale e rotula; identifica il punto con anca flessa e misura poi in piedi, plica verticale." />}>
              <input type="number" step="0.5" style={FIELD} value={checkForm.weeklySkinfoldThigh} onChange={e => patchSkinfoldCheck('weeklySkinfoldThigh', e.target.value)} />
            </Field>
            <Field label="BF% da pliche" hint={checkJP3.bf != null ? protocolLabel(checkJP3.protocol) : undefined}>
              <input type="text" readOnly value={checkJP3.bf != null ? `${checkJP3.bf}%` : '—'}
                style={{ ...FIELD, fontWeight: 700, cursor: 'default', color: checkJP3.bf != null ? 'var(--sb-accent)' : 'var(--sb-text-muted)' }} />
            </Field>
          </Grid>
          {pb.sex === 'male' && (
            <p style={{ ...HINT, marginTop: -4 }}>Set 3 punti: {pb.preferJp3Hip ? 'fianchi' : 'standard'} — cambialo in "Misure baseline" più sopra nella pagina.</p>
          )}

          {pb.sex === 'male' && (
            <>
              <p style={{ ...LABEL, marginTop: 8 }}>Pliche opzionali — per il 7 punti</p>
              <Grid cols={4}>
                {pb.preferJp3Hip ? (
                  <>
                    <Field label="Pettorale mm"><input type="number" step="0.5" style={FIELD} value={checkForm.weeklySkinfoldChest} onChange={e => patchSkinfoldCheck('weeklySkinfoldChest', e.target.value)} /></Field>
                    <Field label="Addome mm"><input type="number" step="0.5" style={FIELD} value={checkForm.weeklySkinfoldAbdomen} onChange={e => patchSkinfoldCheck('weeklySkinfoldAbdomen', e.target.value)} /></Field>
                  </>
                ) : (
                  <>
                    <Field label="Tricipite mm" info={<MeasureInfo text="Verticale, sulla parte posteriore del braccio, a metà tra acromion e olecrano, con braccio disteso e rilassato." />}>
                      <input type="number" step="0.5" style={FIELD} value={checkForm.weeklySkinfoldTricep} onChange={e => patchSkinfoldCheck('weeklySkinfoldTricep', e.target.value)} />
                    </Field>
                    <Field label="Sovrailiaca mm" info={<MeasureInfo text="Obliqua, seguendo la naturale piega della pelle, appena sopra la cresta iliaca sulla linea ascellare anteriore." />}>
                      <input type="number" step="0.5" style={FIELD} value={checkForm.weeklySkinfoldSuprailiac} onChange={e => patchSkinfoldCheck('weeklySkinfoldSuprailiac', e.target.value)} />
                    </Field>
                  </>
                )}
                <Field label="Sottoscapolare mm" info={<MeasureInfo text="Obliqua a 45°, 1-2 cm sotto l'angolo inferiore della scapola." />}>
                  <input type="number" step="0.5" style={FIELD} value={checkForm.weeklySkinfoldSubscapular} onChange={e => patchSkinfoldCheck('weeklySkinfoldSubscapular', e.target.value)} />
                </Field>
                <Field label="Ascellare mm" info={<MeasureInfo text="Verticale, sulla linea ascellare media, all'altezza del processo xifoideo (sterno)." />}>
                  <input type="number" step="0.5" style={FIELD} value={checkForm.weeklySkinfoldMidaxillary} onChange={e => patchSkinfoldCheck('weeklySkinfoldMidaxillary', e.target.value)} />
                </Field>
              </Grid>
              <p style={HINT}>Se compili anche queste 4, il piano passa automaticamente al 7 punti.</p>
            </>
          )}

          <p style={{ ...LABEL, marginTop: 8 }}>Circonferenze (cm)</p>
          <Grid cols={4}>
            <Field label="Fianchi cm" info={<MeasureInfo text="Nel punto più largo del bacino, a livello dei grandi trocanteri." />}>
              <input type="number" step="0.5" style={FIELD} value={checkForm.weeklyMeasureHips} onChange={e => patchCheck({ weeklyMeasureHips: e.target.value })} />
            </Field>
            <Field label="Torace cm" info={<MeasureInfo text="Appena sopra i capezzoli." />}>
              <input type="number" step="0.5" style={FIELD} value={checkForm.weeklyMeasureChest} onChange={e => patchCheck({ weeklyMeasureChest: e.target.value })} />
            </Field>
            <Field label="Braccio cm" info={<MeasureInfo text="Con il braccio disteso/rilassato, nel punto di maggiore circonferenza." />}>
              <input type="number" step="0.5" style={FIELD} value={checkForm.weeklyMeasureArm} onChange={e => patchCheck({ weeklyMeasureArm: e.target.value })} />
            </Field>
            <Field label="Coscia cm" info={<MeasureInfo text="Subito sotto la piega glutea." />}>
              <input type="number" step="0.5" style={FIELD} value={checkForm.weeklyMeasureThigh} onChange={e => patchCheck({ weeklyMeasureThigh: e.target.value })} />
            </Field>
          </Grid>

          <p style={{ ...LABEL, marginTop: 8 }}>Attività a piedi — opzionale</p>
          <Grid cols={2}>
            <Field label={checkForm.weeklyWalkUnit === 'km' ? 'Km camminati (media/die)' : 'Passi (media/die)'} info={<MeasureInfo text="Proxy di NEAT + cardio intenzionale (Reverse Dieting Guide, cap.8, step-count method). Puramente informativo, non entra nei calcoli." />}>
              <input type="number" step={checkForm.weeklyWalkUnit === 'km' ? 0.1 : 100} style={FIELD} placeholder={checkForm.weeklyWalkUnit === 'km' ? 'es. 6.5' : 'es. 8000'} value={checkForm.weeklyWalkAmount} onChange={e => patchCheck({ weeklyWalkAmount: e.target.value })} />
            </Field>
            <Field label="Unità">
              <div style={{ display: 'flex', gap: 6 }}>
                {(['passi', 'km'] as const).map(u => (
                  <button key={u} onClick={() => patchCheck({ weeklyWalkUnit: u })}
                    style={{ ...BTN_GHOST, flex: 1, background: checkForm.weeklyWalkUnit === u ? 'var(--sb-accent)' : 'var(--sb-surface2)', color: checkForm.weeklyWalkUnit === u ? '#0d1117' : 'var(--sb-text-sub)' }}>
                    {u === 'passi' ? 'Passi' : 'Km'}
                  </button>
                ))}
              </div>
            </Field>
          </Grid>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <button style={BTN_PRIMARY} onClick={handleEvaluate}>Valuta e Suggerisci</button>
            <button style={BTN_GHOST} onClick={handleSaveWithoutEvaluating}>Salva senza valutare</button>
          </div>

          <div style={{ ...CARD, padding: 12, marginBottom: 12 }}>
            <p style={{ ...LABEL, marginBottom: 10 }}>Feedback soggettivo — opzionale</p>
            <div className="sb-diet-grid" data-cols="5" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
              {SUBJ_FIELDS.map(f => (
                <StarRating key={f.key} label={f.label} value={checkForm[f.key]} labels={f.labels} onChange={v => patchCheck({ [f.key]: v } as Partial<CheckForm>)} />
              ))}
            </div>
          </div>

          {underestWarning && (
            <div style={{ ...CARD, borderColor: 'var(--sb-accent)', padding: 12, marginBottom: 12, fontSize: 11.5, color: 'var(--sb-text-sub)' }}>
              <strong style={{ color: 'var(--sb-accent)' }}>⚠ Verifica aderenza al tracciamento</strong>
              <p style={{ marginTop: 4 }}>{underestWarning}</p>
            </div>
          )}

          {plateau && (
            <div style={{ ...CARD, borderColor: 'var(--sb-red)', padding: 12, marginBottom: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--sb-red)', textTransform: 'uppercase', marginBottom: 6 }}>⚠ Plateau confermato — {plateau.consecutiveStalls} settimane</p>
              <p style={{ fontSize: 11.5, color: 'var(--sb-text-sub)', marginBottom: 10 }}>{plateau.note} Il libro raccomanda aggiustamenti conservativi: −5–15% carbs e grassi (mai le proteine) oppure +5–10% attività fisica.</p>
              <div className="sb-diet-grid" data-cols="4-cards" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                {buildAdjustmentOptions(pb, activeKcal).map(o => (
                  <div key={o.label} style={{ ...CARD, padding: 10 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--sb-text-muted)', textTransform: 'uppercase' }}>{o.label}</p>
                    <p style={{ fontSize: 18, fontWeight: 700 }}>{o.kcal} kcal</p>
                    <p style={{ fontSize: 10.5, color: 'var(--sb-text-muted)', marginBottom: 6 }}>{o.note}</p>
                    {o.kcal !== activeKcal && <button style={{ ...BTN_PRIMARY, padding: '5px 10px', fontSize: 10.5 }} onClick={() => acceptSuggestion(o.kcal)}>Accetta →</button>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {suggestion && (
            <SuggestionCard pb={pb} sug={suggestion} prevCal={activeKcal} checkForm={checkForm} onAccept={acceptSuggestion} onApplyTransition={applyTransition} transitionPb={{ ...pb, ...latestMeasures() }} />
          )}
        </div>
      </SectionCard>

      {/* ═══ 04 STORICO ═══ */}
      <SectionCard title="Storico & progressione" sub="Check settimanali · grafico · trend" badge={{ text: `${storico.length} entries`, color: storico.length ? 'var(--sb-green)' : 'var(--sb-text-muted)' }} open={open.storico} onToggle={() => setOpen(p => ({ ...p, storico: !p.storico }))}>
        <div style={{ marginTop: 14 }}>
          <div style={{ ...CARD, padding: 14, marginBottom: 14 }}>
            <p style={LABEL}>Peso kg · Kcal piano · Trend lineare peso</p>
            <WeightTrendChart storico={storico} />
          </div>
          {isCut(pb) && <div style={{ ...CARD, padding: 14, marginBottom: 14 }}><LossRateChart storico={storico} cutLossRate={pb.cutLossRate} /></div>}

          {storico.length > 0 && (
            <div style={{ overflowX: 'auto', marginBottom: 14 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--sb-surface2)' }}>
                    {['W', 'Data', 'Peso medio', 'Δ peso', 'Kcal', 'Δ kcal', 'Vita cm', 'Fianchi cm', 'Torace cm', 'Braccio cm', 'Coscia cm', 'A piedi', 'BF%', 'Obiettivo', 'Target', '', ''].map((h, hi) => (
                      <th key={hi} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--sb-text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--sb-border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {storico.slice().reverse().map((e, ri) => {
                    const idx = storico.length - 1 - ri;
                    // storico è ordinato dal più recente (idx 0) al meno recente:
                    // la voce cronologicamente precedente sta a idx+1, non idx-1.
                    const prev = idx < storico.length - 1 ? storico[idx + 1] : null;
                    const date = new Date(e.date).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
                    const eKcal = e.currentCalories, pKcal = prev?.currentCalories;
                    const eW = toNum(e.weeklyAvgWeight), pW = prev ? toNum(prev.weeklyAvgWeight) : null;
                    const dK = pKcal && eKcal ? `${eKcal >= pKcal ? '+' : ''}${eKcal - pKcal}` : '—';
                    const dW = pW && eW != null ? `${eW >= pW ? '+' : ''}${round(eW - pW, 2)}` : '—';
                    const histBF = normalizeBodyFatPercent(e.checkBodyFat);
                    const isEditing = editingIdx === idx;
                    const cellStyle: React.CSSProperties = { padding: '6px 10px', borderBottom: '1px solid var(--sb-border)' };
                    const miniField: React.CSSProperties = { ...FIELD, padding: '3px 6px', fontSize: 11, width: 72 };
                    return (
                      <tr key={idx} className="sb-hover-row" style={{ opacity: e.isBaseline ? 0.7 : 1 }}>
                        <td style={cellStyle}>{e.isBaseline ? <span style={{ fontSize: 9, padding: '1px 5px', background: 'var(--sb-surface2)', borderRadius: 4, color: 'var(--sb-text-muted)' }}>BASE</span> : (e.weeksPassed || '—')}</td>
                        <td style={cellStyle}>{date}</td>
                        <td style={cellStyle}>{isEditing
                          ? <input type="number" step="0.1" style={miniField} value={editDraft.weeklyAvgWeight} onChange={ev => setEditDraft(prev => ({ ...prev, weeklyAvgWeight: ev.target.value }))} />
                          : `${eW || '—'} kg`}</td>
                        <td style={{ ...cellStyle, color: 'var(--sb-text-muted)' }}>{dW}</td>
                        <td style={cellStyle}>{isEditing
                          ? <input type="number" style={miniField} value={editDraft.currentCalories} onChange={ev => setEditDraft(prev => ({ ...prev, currentCalories: ev.target.value }))} />
                          : (eKcal || '—')}</td>
                        <td style={{ ...cellStyle, color: pKcal && eKcal ? (eKcal >= pKcal ? 'var(--sb-red)' : 'var(--sb-green)') : 'var(--sb-text-muted)' }}>{dK}</td>
                        <td style={cellStyle}>{isEditing
                          ? <input type="number" step="0.1" style={miniField} value={editDraft.weeklyMeasureWaist} onChange={ev => setEditDraft(prev => ({ ...prev, weeklyMeasureWaist: ev.target.value }))} />
                          : (e.weeklyMeasureWaist || '—')}</td>
                        <td style={cellStyle}>{e.weeklyMeasureHips || '—'}</td>
                        <td style={cellStyle}>{e.weeklyMeasureChest || '—'}</td>
                        <td style={cellStyle}>{e.weeklyMeasureArm || '—'}</td>
                        <td style={cellStyle}>{e.weeklyMeasureThigh || '—'}</td>
                        <td style={cellStyle}>{e.weeklyWalkAmount ? `${e.weeklyWalkAmount} ${e.weeklyWalkUnit === 'km' ? 'km' : 'passi'}` : '—'}</td>
                        <td style={cellStyle}>{isEditing
                          ? <BodyFatInput step="0.1" style={miniField} value={editDraft.checkBodyFat} onChange={v => setEditDraft(prev => ({ ...prev, checkBodyFat: v }))} />
                          : `${histBF ?? '—'}%`}</td>
                        <td style={{ ...cellStyle, fontSize: 11 }}>{getEntryGoalLabel(e)}</td>
                        <td style={{ ...cellStyle, fontSize: 11 }}>{getEntryTarget(pb, e)}</td>
                        <td style={cellStyle}>
                          {isEditing ? (
                            <button style={{ ...BTN_GHOST, padding: '3px 9px', fontSize: 10, color: 'var(--sb-green)', borderColor: 'var(--sb-green)' }} onClick={() => handleSaveEditEntry(idx)}><Check size={11} /></button>
                          ) : (
                            <button style={{ ...BTN_GHOST, padding: '3px 9px', fontSize: 10 }} onClick={() => handleLoadEntry(idx)}>Carica</button>
                          )}
                        </td>
                        <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
                          {isEditing ? (
                            <button style={{ ...BTN_GHOST, padding: '3px 9px', fontSize: 10 }} onClick={handleCancelEditEntry}><X size={11} /></button>
                          ) : (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button style={{ ...BTN_GHOST, padding: '3px 7px', fontSize: 10 }} title="Modifica" onClick={() => handleStartEditEntry(idx)}><Pencil size={11} /></button>
                              <button style={{ ...BTN_DANGER, padding: '3px 7px', fontSize: 10 }} title="Elimina" onClick={() => handleDeleteEntry(idx)}><Trash2 size={11} /></button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={BTN_GHOST} onClick={handleExport}><Download size={13} /> Esporta JSON</button>
            <button style={BTN_DANGER} onClick={handleClearStorico}><Trash2 size={13} /> Cancella Storico</button>
          </div>

          <DietBackupPanel onRestore={(restored) => { setPb(hydratePianoBase(restored.pianoBase, restored.storico)); setStorico(restored.storico); }} />
        </div>
      </SectionCard>
    </div>
  );
}

/* ── Blocchi goal-specific per la sezione Input ──────────────────────── */

function ReverseConfig({ pb, patchPB }: { pb: PianoBase; patchPB: (p: Partial<PianoBase>) => void }) {
  const table = getLBMTable(pb);
  const band = pb.reverseTargetBand === 'sopra' ? 'sopra' : 'normale';
  const min = table[band][0], max = table[band][1];
  const meta = getReverseTargetMeta(pb);
  const maintenance = computeInitialStartCalories(pb).maintenance;
  const approach = APPROACHES[pb.approachKey];
  const startCalories = Math.round(maintenance * (1 + approach.startOffset));
  const warning = getReverseStartWarning(pb, startCalories);

  return (
    <GoalColorPanel color={GOAL_META.reverse_diet.color} title="Configurazione Reverse Diet — Target e proteine">
      <Field label="Approccio Reverse Diet">
        <select style={FIELD} value={pb.approachKey} onChange={e => patchPB({ approachKey: e.target.value as PianoBase['approachKey'] })}>
          <option value="conservative">Conservativo (+0% avvio · +1–3%/sett · ≤0.2% kg/sett)</option>
          <option value="moderate">Moderato (+10% avvio · +3–6%/sett · ≤0.5% kg/sett)</option>
          <option value="aggressive">Aggressivo (+20% avvio · +6–9%/sett · ≤0.8% kg/sett)</option>
        </select>
      </Field>
      <Grid cols={2}>
        <Field label="Target calorico">
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {(['normale', 'sopra'] as const).map(b => (
              <button key={b} onClick={() => patchPB({ reverseTargetBand: b, reverseTargetCpk: null })}
                style={{ ...BTN_GHOST, flex: 1, background: pb.reverseTargetBand === b ? 'var(--sb-accent)' : 'var(--sb-surface2)', color: pb.reverseTargetBand === b ? '#0d1117' : 'var(--sb-text-sub)' }}>
                {b === 'normale' ? 'Normale' : 'Sopra normale'} ({table[b][0]}–{table[b][1]})
              </button>
            ))}
          </div>
          <input type="range" min={min} max={max} step={0.5} value={pb.reverseTargetCpk ?? round((min + max) / 2, 1) ?? min}
            onChange={e => patchPB({ reverseTargetCpk: round(Number(e.target.value), 1) })} style={{ width: '100%' }} />
          <p style={{ fontSize: 11, textAlign: 'center', color: GOAL_META.reverse_diet.color, marginTop: 4 }}>{meta.targetCpk} kcal/kg LBM</p>
        </Field>
        <Field label="Livello proteine">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(Object.entries(PROTEIN_PRESETS) as [keyof typeof PROTEIN_PRESETS, { label: string; value: number }][]).map(([key, preset]) => (
              <button key={key} onClick={() => patchPB({ reverseProteinPreset: key, proteinPerKgLBM: preset.value })}
                style={{ ...BTN_GHOST, flex: 1, background: pb.reverseProteinPreset === key ? 'var(--sb-accent)' : 'var(--sb-surface2)', color: pb.reverseProteinPreset === key ? '#0d1117' : 'var(--sb-text-sub)' }}>
                {preset.label} ({preset.value})
              </button>
            ))}
          </div>
        </Field>
      </Grid>
      <p style={{ fontSize: 11.5, color: 'var(--sb-text-sub)', lineHeight: 1.6 }}>
        <strong>Target:</strong> {meta.label} · {meta.targetCpk} kcal/kg LBM{meta.targetKcal != null ? ` = ${meta.targetKcal} kcal (range ${meta.rangeKcal.min}–${meta.rangeKcal.max} kcal)` : '. Inserisci BF% per calcolo preciso.'}<br />
        <strong>Proteine:</strong> {round(Number(pb.proteinPerKgLBM), 1)} g/kg LBM
        {checkProteinFloorWarn(pb) && <span style={{ color: 'var(--sb-red)' }}> — ⚠ sotto il minimo raccomandato per la tua età (min {proteinFloorLBMForAgeNoDeficit(toNum(pb.age))} g/kg LBM, tab.6.1).</span>}
      </p>
      {warning && <p style={{ fontSize: 11, color: 'var(--sb-accent)', marginTop: 8 }}><strong>Attenzione:</strong> {warning}</p>}
      <DurationCallout text="Cap.9: un reverse dovrebbe durare almeno quanto la dieta da cui recuperi (più a lungo se hai fatto yo-yo dieting cronico). È normale che peso/misure si muovano in modo irregolare (plateau poi salti) settimana su settimana — non è un segnale che qualcosa non va." />
    </GoalColorPanel>
  );
}

function DurationCallout({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'var(--sb-surface2)', border: '1px solid var(--sb-border)', borderLeft: '3px solid var(--sb-accent)', borderRadius: 8, padding: '10px 12px', marginTop: 10 }}>
      <span style={{ fontSize: 15, lineHeight: 1 }}>⏳</span>
      <p style={{ fontSize: 11.5, color: 'var(--sb-text-sub)', lineHeight: 1.5 }}>{text}</p>
    </div>
  );
}

/* ── Pannelli sezione Piano ───────────────────────────────────────────── */

function SFPhasePanel({ pb, currentBF, currentLBM, activeKcal, maintenance }: { pb: PianoBase; currentBF: number | null; currentLBM: number | null; activeKcal: number; maintenance: number }) {
  const phase = SF_PHASES[pb.sfPhase];
  return (
    <GoalColorPanel color={GOAL_META.skinny_fat.color} title={`${phase.label} — ${phase.sub}`}>
      <p style={{ fontSize: 11.5, color: 'var(--sb-text-sub)', lineHeight: 1.7 }}>
        <strong>Obiettivo:</strong> {phase.obj}<br />
        {pb.sfPhase === 1 && currentBF != null && <>
          <strong>BF% corrente:</strong> {currentBF}% → <strong>Target:</strong> {pb.sfTargetBF}%{currentBF > pb.sfTargetBF ? ` (ancora ${round(currentBF - pb.sfTargetBF, 1)}% da perdere)` : ' ✓ Target raggiunto'}<br />
        </>}
        {pb.sfPhase === 1 && <><strong>Deficit:</strong> −{pb.sfDeficitPct}% ({maintenance} → {activeKcal} kcal)<br /></>}
        {pb.sfPhase === 3 && <><strong>Surplus:</strong> +{pb.bulkSurplusPct}% ({maintenance} → {activeKcal} kcal)<br /></>}
        {currentLBM && <><strong>LBM corrente:</strong> {currentLBM} kg · Proteine: {pb.proteinPerKgLBM} g/kg LBM = {Math.round(pb.proteinPerKgLBM * currentLBM)}g/die</>}
      </p>
    </GoalColorPanel>
  );
}

function CutPhasePanel({ pb, currentBF, currentLBM, activeKcal, maintenance }: { pb: PianoBase; currentBF: number | null; currentLBM: number | null; activeKcal: number; maintenance: number }) {
  const wN = getCurrentWeight(pb, '') || 0;
  const dailyDeficit = wN > 0 ? Math.round((wN * pb.cutLossRate / 100 * 7700) / 7) : null;
  const weeklyLoss = wN > 0 ? round(wN * pb.cutLossRate / 100, 2) : null;
  return (
    <GoalColorPanel color={GOAL_META.cut.color} title={`Cut — Ritmo −${pb.cutLossRate}%/sett · Target BF% ${pb.cutTargetBF}%`}>
      <p style={{ fontSize: 11.5, color: 'var(--sb-text-sub)', lineHeight: 1.7 }}>
        <strong>TDEE:</strong> {maintenance} kcal → <strong>Piano:</strong> {activeKcal} kcal{dailyDeficit ? ` (deficit −${dailyDeficit} kcal/die)` : ''}<br />
        {weeklyLoss && <><strong>Perdita attesa:</strong> ~{weeklyLoss} kg/sett<br /></>}
        {currentBF != null && <><strong>BF% corrente:</strong> {currentBF}% → <strong>Target:</strong> {pb.cutTargetBF}%{currentBF > pb.cutTargetBF ? ` (ancora ${round(currentBF - pb.cutTargetBF, 1)}% da perdere)` : ' ✓ Target già raggiunto'}<br /></>}
        <strong>LBM corrente:</strong> {currentLBM ? `${currentLBM} kg` : '— (inserisci BF%)'}<br />
        <strong>Proteine:</strong> {pb.proteinPerKgLBM} g/kg LBM{currentLBM ? ` = ${Math.round(pb.proteinPerKgLBM * currentLBM)}g/die` : ''}
      </p>
    </GoalColorPanel>
  );
}

function RefeedSplitPanel({ pb, baseKcal }: { pb: PianoBase; baseKcal: number }) {
  const { normalKcal, refeedKcal, normalDays, refeedDays } = computeRefeedSplit(pb, baseKcal);
  return (
    <GoalColorPanel color="var(--sb-blue)" title="Ripartizione settimanale — Refeed attivo">
      <Grid cols={2}>
        <StatBox label={`Giorni normali (${normalDays} gg)`} value={normalKcal} unit="kcal" sub="Deficit giornaliero invariato in media settimanale." />
        <StatBox label={`Giorni refeed (${refeedDays} gg)`} value={refeedKcal} unit="kcal" accent="var(--sb-blue)" sub={`+${pb.refeedSurplus} kcal · solo carbs.`} />
      </Grid>
    </GoalColorPanel>
  );
}

function DietBreakPanel({ pb, baseKcal, maintenance }: { pb: PianoBase; baseKcal: number; maintenance: number }) {
  const { inBreak, posInCycle, deficitWeeks, breakWeeks, cycleLen } = computeDietBreakPhase(pb);
  const weekLeft = inBreak ? breakWeeks - (posInCycle - deficitWeeks) + 1 : deficitWeeks - posInCycle + 1;
  return (
    <GoalColorPanel color="var(--sb-text-muted)" title={`${inBreak ? 'PAUSA — Mantenimento attivo' : 'DEFICIT — Cut attivo'} · Sett. ${posInCycle}/${cycleLen}`}>
      <Grid cols={2}>
        <StatBox label="Fase Deficit" value={baseKcal} unit="kcal" sub={`Deficit attivo · −${pb.cutLossRate}%/sett`} />
        <StatBox label="Fase Pausa" value={maintenance} unit="kcal" sub="Mantenimento · TDEE ricalcolato" />
      </Grid>
      <p style={{ fontSize: 11.5, color: 'var(--sb-text-sub)', marginTop: 8 }}>
        {inBreak ? `Sei in PAUSA. Mangia a ${maintenance} kcal per ancora ${weekLeft} sett. prima di riprendere il deficit.` : `Sei in DEFICIT. ${weekLeft} sett. rimanenti prima della prossima pausa.`}
      </p>
    </GoalColorPanel>
  );
}

function LBMTablePanel({ pb, activeKcal, table }: { pb: PianoBase; activeKcal: number; table: ReturnType<typeof getLBMTable> }) {
  const lbm = computeLBM(pb);
  const cpk = lbm ? round(activeKcal / lbm, 1) : null;
  const band = cpk != null ? getCurrentBand(table, cpk) : null;
  const cells: { key: 'sotto' | 'normale' | 'sopra'; label: string }[] = [
    { key: 'sotto', label: 'Sotto normale' }, { key: 'normale', label: 'Normale ✓' }, { key: 'sopra', label: 'Sopra normale' },
  ];
  return (
    <div style={{ ...CARD, padding: 12, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <p style={LABEL}>Tabella mantenimento kcal/kg LBM (guida sez.9)</p>
        <span style={{ fontWeight: 700, color: 'var(--sb-accent)' }}>{cpk != null ? `${cpk} kcal/kg LBM` : '—'}</span>
      </div>
      <div className="sb-diet-grid" data-cols="3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {cells.map(c => {
          const r = getLBMRange(pb, table, c.key);
          const active = c.key === band || (c.key === 'sotto' && band === 'molto_basso') || (c.key === 'sopra' && band === 'molto_alto');
          return (
            <div key={c.key} style={{ padding: 8, borderRadius: 6, background: active ? 'var(--sb-accent-dim)' : 'var(--sb-surface2)', border: active ? '1px solid var(--sb-accent-bd)' : '1px solid var(--sb-border)' }}>
              <p style={{ fontSize: 10, color: 'var(--sb-text-muted)', marginBottom: 3 }}>{c.label}</p>
              <p style={{ fontSize: 13, fontWeight: 600 }}>{table[c.key][0]}–{table[c.key][1]} kcal/kg</p>
              {r.min != null && <p style={{ fontSize: 10, color: 'var(--sb-text-muted)' }}>{r.min}–{r.max} kcal</p>}
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 10.5, color: 'var(--sb-text-muted)', marginTop: 8 }}>AF {table.af} · età {table.age}</p>
    </div>
  );
}

function ProgressBar({ pb, storico, checkForm, currentCalories }: { pb: PianoBase; storico: DietCheckEntry[]; checkForm: CheckForm; currentCalories: number | null }) {
  const sc = getActiveCalories(pb, currentCalories);
  const m = computeInitialStartCalories(pb).maintenance;
  let label = '', valueText = '', note = '', pct = 0, color = 'var(--sb-green)';

  if (isCut(pb)) {
    const startBF = normalizeBodyFatPercent(pb.bodyFat) || 0;
    const cur = getCurrentBF(pb, checkForm.checkBodyFat) || startBF;
    if (!startBF) return null;
    color = 'var(--sb-red)';
    pct = startBF <= pb.cutTargetBF ? 100 : Math.min(100, Math.max(0, ((startBF - cur) / (startBF - pb.cutTargetBF)) * 100));
    label = 'Progressione verso Target BF%';
    valueText = `Partenza: ${startBF}% → Attuale: ${cur}% → Target: ${pb.cutTargetBF}%`;
    note = cur <= pb.cutTargetBF ? '✓ Target raggiunto' : `${round(cur - pb.cutTargetBF, 1)}% ancora da perdere · ${Math.round(pct)}%`;
  } else if (isSF(pb)) {
    if (pb.sfPhase === 1) {
      const startBF = normalizeBodyFatPercent(pb.bodyFat) || 0;
      const cur = getCurrentBF(pb, checkForm.checkBodyFat) || startBF;
      color = '#d4620a';
      pct = startBF <= pb.sfTargetBF ? 100 : Math.min(100, Math.max(0, ((startBF - cur) / (startBF - pb.sfTargetBF)) * 100));
      label = 'Progressione verso Target BF%';
      valueText = `Partenza: ${startBF}% → Attuale: ${cur}% → Target: ${pb.sfTargetBF}%`;
      note = cur <= pb.sfTargetBF ? '✓ Target raggiunto' : `${round(cur - pb.sfTargetBF, 1)}% da perdere · ${Math.round(pct)}%`;
    } else if (pb.sfPhase === 2) {
      const lbm = computeLBM(pb); const table = getLBMTable(pb);
      if (!lbm) return null;
      const targetKcal = getLBMRange(pb, table, 'normale').min || 0;
      const sc0 = getProgressStartCalories(pb, storico, computeInitialStartCalories(pb).startCalories);
      pct = sc0 >= targetKcal ? 100 : Math.min(100, Math.max(0, ((sc - sc0) / (targetKcal - sc0 || 1)) * 100));
      label = 'Risalita calorica verso range Normale';
      valueText = `${sc} kcal → target: ${targetKcal} kcal`;
      note = sc >= targetKcal ? '✓ Range Normale raggiunto' : `${Math.round(pct)}% · start ${sc0} kcal`;
    } else {
      pct = 100; label = 'Surplus controllato'; valueText = `${sc} kcal`; note = 'Monitora composizione';
    }
  } else if (isReverse(pb)) {
    const meta = getReverseTargetMeta(pb);
    if (!meta.lbm || !m || meta.targetKcal == null) return null;
    const sc0 = getProgressStartCalories(pb, storico, computeInitialStartCalories(pb).startCalories);
    pct = sc0 >= meta.targetKcal ? 100 : Math.min(100, Math.max(0, ((sc - sc0) / (meta.targetKcal - sc0 || 1)) * 100));
    label = `Progressione verso target Reverse — ${meta.label}`;
    valueText = `${sc} kcal → target: ${meta.targetKcal} kcal`;
    note = sc >= meta.targetKcal ? `✓ Target ${meta.label} raggiunto` : `${Math.round(pct)}% · start ${sc0} kcal`;
  } else return null;

  return (
    <div style={{ ...CARD, padding: 12, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ ...LABEL, marginBottom: 0 }}>{label}</span>
        <span style={{ fontSize: 11 }}>{valueText}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 6, background: 'var(--sb-surface2)', borderRadius: 3 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width .4s' }} />
        </div>
        <span style={{ fontSize: 10.5, color: 'var(--sb-text-muted)', minWidth: 140, textAlign: 'right' }}>{note}</span>
      </div>
    </div>
  );
}

/* ── Suggerimento settimanale ─────────────────────────────────────────── */

const bulkEndText = (pb: PianoBase): string =>
  [pb.bulkMaxBF ? `BF ${pb.bulkMaxBF}%` : '', pb.bulkTargetWeight ? `${pb.bulkTargetWeight} kg` : ''].filter(Boolean).join(' o ') || 'da impostare';

function optionLabel(decision: string, key: string): string {
  if (decision.endsWith('fast_confirmed')) return key === 'hi' ? '↓↓ Riduci di più' : '↓ Riduci calorie';
  if (decision.endsWith('slow_confirmed')) return key === 'hi' ? '++ Aumenta di più' : '↑ Aumenta';
  return key === 'lo' || key === 'continue_increase' ? '↑ Aumenta' : key === 'hi' ? '++ Range alto' : key === 'reduce' ? '↓ Riduci calorie' : key === 'activity' ? '+ Più attività' : '— Mantieni';
}

function BulkConfig({ pb, patchPB }: { pb: PianoBase; patchPB: (p: Partial<PianoBase>) => void }) {
  const noEnd = !pb.bulkMaxBF && !pb.bulkTargetWeight;
  return (
    <GoalColorPanel color={GOAL_META.bulk.color} title="Configurazione Bulk — Surplus e fine del bulk">
      <Grid cols={3}>
        <Field label="Surplus % sul mantenimento *" hint="5–10% raccomandato (default 7). Le kcal restano entro mantenimento +10%.">
          <NumberInput min={5} max={10} step={1} style={FIELD} value={pb.bulkSurplusPct} onChange={n => patchPB({ bulkSurplusPct: n })} />
        </Field>
        <Field label="BF% massimo" hint="Il bulk finisce quando lo raggiungi. Lascia vuoto per non usare questo criterio.">
          <BodyFatInput step="0.1" style={FIELD} placeholder="18.0" value={pb.bulkMaxBF} onChange={v => patchPB({ bulkMaxBF: v })} />
        </Field>
        <Field label="Peso target kg" hint="Il bulk finisce quando lo raggiungi. Lascia vuoto per non usare questo criterio.">
          <input type="number" step="0.1" style={FIELD} placeholder="75" value={pb.bulkTargetWeight} onChange={e => patchPB({ bulkTargetWeight: e.target.value })} />
        </Field>
      </Grid>
      <p style={{ fontSize: 11, color: noEnd ? 'var(--sb-red)' : 'var(--sb-text-muted)', lineHeight: 1.5 }}>
        {noEnd ? 'Imposta almeno un criterio di fine (BF% massimo o peso target). ' : ''}Si ferma al primo dei due raggiunto. Guadagno atteso: 0,25–0,5% del peso a settimana.
      </p>
    </GoalColorPanel>
  );
}

function MaintenanceConfig({ pb, patchPB }: { pb: PianoBase; patchPB: (p: Partial<PianoBase>) => void }) {
  return (
    <GoalColorPanel color={GOAL_META.maintenance.color} title="Configurazione Mantenimento">
      <Grid cols={2}>
        <Field label="Durata consigliata (settimane)" hint="Dopo questo periodo ti propongo Cut o Bulk; se non scegli resti in mantenimento.">
          <NumberInput min={2} max={26} step={1} style={FIELD} value={pb.maintenanceWeeks} onChange={n => patchPB({ maintenanceWeeks: n })} />
        </Field>
      </Grid>
      <p style={{ fontSize: 11, color: 'var(--sb-text-muted)', lineHeight: 1.5 }}>Banda di tolleranza del peso: ±0,5% del peso di inizio fase. Due check consecutivi fuori banda dallo stesso lato correggono le kcal del 3%.</p>
    </GoalColorPanel>
  );
}

function BulkPhasePanel({ pb, currentBF, activeKcal, maintenance }: { pb: PianoBase; currentBF: number | null; activeKcal: number; maintenance: number }) {
  const wN = getCurrentWeight(pb, '') || 0;
  const ref = pb.phaseMaintenanceKcal ?? maintenance;
  return (
    <GoalColorPanel color={GOAL_META.bulk.color} title={`Bulk — Surplus +${pb.bulkSurplusPct}% · Fine: ${bulkEndText(pb)}`}>
      <p style={{ fontSize: 11.5, color: 'var(--sb-text-sub)', lineHeight: 1.7 }}>
        <strong>Mantenimento di riferimento:</strong> {ref} kcal → <strong>Piano:</strong> {activeKcal} kcal (limite {Math.round(ref * 1.10)} kcal)<br />
        {wN > 0 && <><strong>Guadagno atteso:</strong> {round(wN * 0.0025, 2)}–{round(wN * 0.005, 2)} kg/sett<br /></>}
        {currentBF != null && <><strong>BF% corrente:</strong> {currentBF}%{pb.bulkMaxBF ? ` → massimo ${pb.bulkMaxBF}%` : ''}<br /></>}
        {pb.bulkTargetWeight && wN > 0 && <><strong>Peso:</strong> {round(wN, 1)} kg → target {pb.bulkTargetWeight} kg</>}
      </p>
    </GoalColorPanel>
  );
}

function MaintenancePhasePanel({ pb, storico, activeKcal }: { pb: PianoBase; storico: DietCheckEntry[]; activeKcal: number }) {
  const phase = getPhaseStorico(pb, storico);
  const baseline = phase.find(e => e.isBaseline) ?? phase[phase.length - 1];
  const ref = (baseline ? toNum(baseline.weeklyAvgWeight) : null) ?? toNum(pb.weight) ?? 0;
  const weeks = phase.filter(e => !e.isBaseline).length;
  return (
    <GoalColorPanel color={GOAL_META.maintenance.color} title={`Mantenimento — settimana ${weeks + 1}/${pb.maintenanceWeeks}`}>
      <p style={{ fontSize: 11.5, color: 'var(--sb-text-sub)', lineHeight: 1.7 }}>
        <strong>Piano:</strong> {activeKcal} kcal<br />
        {ref > 0 && <><strong>Peso di riferimento:</strong> {round(ref, 1)} kg → banda {round(ref * 0.995, 1)}–{round(ref * 1.005, 1)} kg</>}
      </p>
    </GoalColorPanel>
  );
}

function PhaseTransitionPanel({ pb, decision, lastKcal, onApply }: { pb: PianoBase; decision: string; lastKcal: number; onApply: (to: PhaseGoal, lastKcal: number) => void }) {
  const targets = getTransitionTargets(decision);
  return (
    <div style={{ marginBottom: 14 }}>
      <p style={{ fontSize: 11.5, color: 'var(--sb-text-sub)', marginBottom: 8 }}><strong>Fase conclusa — cosa fai adesso?</strong> Scegli la prossima fase: ti mostro un riepilogo prima di attivarla.</p>
      <div className="sb-diet-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${targets.length}, 1fr)`, gap: 8 }}>
        {targets.map(to => {
          const t = buildTransition(pb, to, lastKcal);
          return (
            <div key={to} style={{ ...CARD, padding: 10, borderColor: GOAL_META[to].color }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: GOAL_META[to].color, textTransform: 'uppercase' }}>{GOAL_META[to].label}</p>
              <p style={{ fontSize: 18, fontWeight: 700 }}>{t.startKcal} kcal</p>
              <p style={{ fontSize: 10.5, color: 'var(--sb-text-muted)', marginBottom: 6 }}>{t.summary}</p>
              <button style={{ ...BTN_GHOST, padding: '5px 10px', fontSize: 10.5 }} onClick={() => onApply(to, lastKcal)}>Passa a {GOAL_META[to].label} →</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SuggestionCard({ pb, sug, prevCal, checkForm, onAccept, onApplyTransition, transitionPb }: { pb: PianoBase; sug: WeeklyCheckResult; prevCal: number; checkForm: CheckForm; onAccept: (kcal: number) => void; onApplyTransition: (to: PhaseGoal, lastKcal: number) => void; transitionPb: PianoBase }) {
  const dl = DECISION_META[sug.decision] || { label: 'VALUTA', color: 'var(--sb-text-muted)' };
  const hasOptions = !!sug.options;
  const [customKcal, setCustomKcal] = useState('');
  const wdelta = sug.prevWeekWeight != null && checkForm.weeklyAvgWeight !== '' ? round((toNum(checkForm.weeklyAvgWeight) || 0) - sug.prevWeekWeight, 2) : null;
  const bfN = normalizeBodyFatPercent(sug.weeklyBF);
  const bfStart = normalizeBodyFatPercent(pb.bodyFat) || 0;
  const bfProgress = bfN != null && bfStart > 0 ? round(bfStart - bfN, 1) : null;

  const goalTitle = sug.isBulk ? 'Bulk' : sug.isMaintenance ? 'Mantenimento' : sug.isCut ? 'Cut' + (sug.inDietBreak ? ' — Pausa Dieta' : '') : sug.isReverse ? 'Reverse Diet' : sug.isSkinnyFat ? (SF_PHASES[sug.sfPhase || pb.sfPhase]?.label || 'Skinny Fat') : (pb.goal || '—');

  return (
    <div style={{ ...CARD, overflow: 'hidden', marginTop: 10 }}>
      <div style={{ padding: '12px 16px', background: 'var(--sb-text)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 9px', borderRadius: 6, color: dl.color, border: `1px solid ${dl.color}` }}>{dl.label}</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--sb-bg)' }}>{goalTitle} — Settimana prossima</span>
        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--sb-accent)', marginLeft: 'auto' }}>{hasOptions ? '—' : `${sug.suggestedCalories} kcal`}</span>
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <SugRow label="Peso medio questa sett." value={`${checkForm.weeklyAvgWeight || '—'} kg${wdelta != null ? ` (${wdelta > 0 ? '+' : ''}${wdelta} kg vs prev)` : ''}`} />
          <SugRow label="Riferimento usato" value={sug.prevWeekWeight != null ? `${sug.prevWeekWeight} kg (settimana prec.)` : `${round(toNum(pb.weight), 1) ?? '—'} kg (baseline)`} />
          <SugRow label="Kcal correnti" value={`${prevCal} kcal`} />
          {sug.isReverse && <SugRow label="Guadagno consentito / effettivo" value={`${sug.allowedGainKg} kg · effettivo ${sug.actualGainKg && sug.actualGainKg > 0 ? '+' : ''}${sug.actualGainKg} kg`} />}
          {sug.isCut && !sug.inDietBreak && <SugRow label="Perdita effettiva / target" value={`${sug.actualLoss} kg (target ${sug.targetLossKg} kg · range ${sug.minLossKg}–${sug.maxLossKg})`} />}
          {sug.isBulk && <SugRow label="Guadagno effettivo / range" value={`${sug.actualGainKg && sug.actualGainKg > 0 ? '+' : ''}${sug.actualGainKg} kg (range ${sug.minGainKg}–${sug.maxGainKg} kg)`} />}
          {sug.isMaintenance && <SugRow label="Scostamento dal riferimento" value={`${sug.actualChange && sug.actualChange > 0 ? '+' : ''}${sug.actualChange} kg (rif. ${sug.refWeight} kg · sett. ${sug.weeksInPhase}/${pb.maintenanceWeeks})`} />}
          {sug.isSkinnyFat && <SugRow label="Var. peso effettiva" value={`${sug.actualChange && sug.actualChange > 0 ? '+' : ''}${sug.actualChange} kg`} />}
          <SugRow label="BF% attuale → target" value={`${bfN ?? '—'}%${bfProgress != null ? (sug.isBulk || sug.isMaintenance || (sug.isSkinnyFat && sug.sfPhase === 3) ? ` (${bfProgress <= 0 ? '+' : '−'}${Math.abs(bfProgress)}% da inizio)` : ` (−${bfProgress}% da inizio)`) : ''} → ${sug.isCut ? `${pb.cutTargetBF}%` : sug.isBulk || (sug.isSkinnyFat && sug.sfPhase === 3) ? (pb.bulkMaxBF ? `${pb.bulkMaxBF}%` : '—') : sug.isSkinnyFat ? `${pb.sfTargetBF}%` : '—'}`} />
        </div>
        <p style={{ fontSize: 12, color: 'var(--sb-text-sub)', lineHeight: 1.6, marginBottom: 14 }}>{sug.note}</p>

        {sug.levels && (
          <p style={{ fontSize: 11.5, color: 'var(--sb-text-sub)', marginBottom: 14 }}>
            <strong>Posizione nelle tabelle:</strong> {sug.levels.cpk} kcal/kg LBM → <strong>{sug.levels.bandLabel}</strong> (AF {sug.levels.table.af} · {sug.levels.table.age})<br />
            Sotto: {sug.levels.sottoRange.min}–{sug.levels.sottoRange.max} kcal · <strong>Normale: {sug.levels.normalRange.min}–{sug.levels.normalRange.max} kcal</strong> · Sopra: {sug.levels.sopraRange.min}–{sug.levels.sopraRange.max} kcal
          </p>
        )}

        {getTransitionTargets(sug.decision).length > 0 && <PhaseTransitionPanel pb={transitionPb} decision={sug.decision} lastKcal={sug.suggestedCalories} onApply={onApplyTransition} />}

        {sug.decision === 'cut_stalled_confirmed' && (
          <div style={{ ...CARD, borderColor: 'var(--sb-accent)', padding: 12, marginBottom: 12, fontSize: 11.5, color: 'var(--sb-text-sub)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--sb-accent)' }}>⚠ Prima di tagliare, un controllo</strong>
            <p style={{ marginTop: 4 }}>
              Il libro segnala alcune cause di "falso plateau" — se una di queste vale per questa settimana, conviene aspettare un check-in in più prima di ridurre:
              ciclo mestruale, stress intenso, sonno scarso, malattia, infortunio, scarsa aderenza al piano.
            </p>
          </div>
        )}

        {hasOptions && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
            {Object.entries(sug.options!).map(([key, opt]) => (
              <div key={key} style={{ ...CARD, padding: 12 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--sb-text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{optionLabel(sug.decision, key)}</p>
                <p style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{opt.suggestedCalories} kcal</p>
                <p style={{ fontSize: 11, color: 'var(--sb-text-muted)', marginBottom: 8 }}>{opt.note}</p>
                <button style={{ ...BTN_PRIMARY, padding: '6px 12px', fontSize: 11 }} onClick={() => onAccept(opt.suggestedCalories)}>Accetta →</button>
              </div>
            ))}
          </div>
        )}

        {!hasOptions && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, paddingTop: 12, borderTop: '1px solid var(--sb-border)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--sb-text-muted)', flex: 1 }}>Accettando, aggiorni le calorie e salvi automaticamente l&apos;entry dello storico.</span>
            <button style={sug.decision === 'hold' ? BTN_GHOST : BTN_PRIMARY} onClick={() => onAccept(sug.suggestedCalories)}>
              {sug.decision === 'hold' ? 'Conferma — mantieni' : 'Accetta'} → {sug.suggestedCalories} kcal
            </button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 12, borderTop: '1px solid var(--sb-border)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--sb-text-muted)' }}>Non sei d&apos;accordo? Imposta tu le kcal per la settimana prossima:</span>
          <input
            type="number" step="1" placeholder="es. 1750" value={customKcal}
            onChange={e => setCustomKcal(e.target.value)}
            style={{ ...FIELD, width: 100, padding: '5px 8px', fontSize: 12 }}
          />
          <button
            style={{ ...BTN_GHOST, padding: '5px 10px', fontSize: 11 }}
            disabled={!customKcal.trim()}
            onClick={() => { const v = Math.round(Number(customKcal)); if (v > 0) onAccept(v); }}
          >
            Accetta personalizzato
          </button>
        </div>
      </div>
    </div>
  );
}

function SugRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--sb-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      <p style={{ fontSize: 12.5, color: 'var(--sb-text)' }}>{value}</p>
    </div>
  );
}

