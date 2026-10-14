'use client';

import { useEffect, useRef } from 'react';
import { toNum, normalizeBodyFatPercent, linReg, type DietCheckEntry } from '@/lib/diet-calc';

/* Grafico peso/kcal con trend lineare — porta 1:1 del canvas dell'app originale,
   ricolorato sui token del design system. */
export function WeightTrendChart({ storico }: { storico: DietCheckEntry[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const entries = storico.filter(e => !e.isBaseline || (e.isBaseline && toNum(e.weeklyAvgWeight)));
    if (entries.length < 2) return;

    const style = getComputedStyle(document.documentElement);
    const cText = style.getPropertyValue('--sb-text').trim() || '#0c0c0c';
    const cMuted = style.getPropertyValue('--sb-text-muted').trim() || '#8a8a8a';
    const cAccent = style.getPropertyValue('--sb-accent').trim() || '#f0c030';
    const cGrid = style.getPropertyValue('--sb-border').trim() || '#e0dbd2';

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.parentElement ? canvas.parentElement.clientWidth - 32 : 600, H = 180;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.scale(dpr, dpr); ctx.clearRect(0, 0, W, H);

    const PAD = { t: 10, r: 52, b: 36, l: 52 }, cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
    const weights = entries.map(e => toNum(e.weeklyAvgWeight));
    const kcals = entries.map(e => toNum(e.currentCalories));
    const vW = weights.filter((x): x is number => x != null), vK = kcals.filter((x): x is number => x != null);
    if (!vW.length) return;
    const minW = Math.min(...vW) * 0.985, maxW = Math.max(...vW) * 1.015;
    const minK = vK.length ? Math.min(...vK) * 0.97 : 0, maxK = vK.length ? Math.max(...vK) * 1.03 : 0;
    const n = entries.length;
    const xS = (i: number) => PAD.l + (i / (n - 1 || 1)) * cW;
    const yW = (v: number) => PAD.t + cH - ((v - minW) / (maxW - minW || 1)) * cH;
    const yK = (v: number) => PAD.t + cH - ((v - minK) / (maxK - minK || 1)) * cH;

    ctx.strokeStyle = cGrid; ctx.lineWidth = 0.8;
    for (let i = 0; i <= 4; i++) { const y = PAD.t + (i / 4) * cH; ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + cW, y); ctx.stroke(); }

    ctx.font = `9px monospace`; ctx.fillStyle = cMuted; ctx.textAlign = 'center';
    const step = Math.max(1, Math.floor(n / 7));
    for (let i = 0; i < n; i += step) {
      const d = new Date(entries[i].date);
      ctx.fillText(d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }), xS(i), H - 20);
      if (entries[i].isBaseline) { ctx.fillStyle = cMuted; ctx.fillText('▲', xS(i), H - 10); ctx.fillStyle = cMuted; }
    }

    ctx.textAlign = 'right'; ctx.fillStyle = cText;
    for (let i = 0; i <= 4; i++) { const v = minW + (i / 4) * (maxW - minW); ctx.fillText(String(Math.round(v * 10) / 10), PAD.l - 6, PAD.t + cH - (i / 4) * cH + 3); }

    if (vK.length >= 2) {
      ctx.textAlign = 'left'; ctx.fillStyle = cAccent;
      for (let i = 0; i <= 4; i++) { const v = Math.round(minK + (i / 4) * (maxK - minK)); ctx.fillText(String(v), PAD.l + cW + 6, PAD.t + cH - (i / 4) * cH + 3); }
    }

    if (vK.length >= 2) {
      ctx.strokeStyle = cAccent; ctx.lineWidth = 1.8; ctx.setLineDash([4, 3]);
      ctx.beginPath(); let st = false;
      kcals.forEach((v, i) => { if (v == null) return; st ? ctx.lineTo(xS(i), yK(v)) : ctx.moveTo(xS(i), yK(v)); st = true; });
      ctx.stroke(); ctx.setLineDash([]);
    }

    if (vW.length >= 2) {
      ctx.strokeStyle = cText; ctx.lineWidth = 2.5; ctx.beginPath(); let st = false;
      weights.forEach((v, i) => { if (v == null) return; st ? ctx.lineTo(xS(i), yW(v)) : ctx.moveTo(xS(i), yW(v)); st = true; });
      ctx.stroke();
      weights.forEach((v, i) => {
        if (v == null) return;
        ctx.beginPath(); ctx.arc(xS(i), yW(v), entries[i]?.isBaseline ? 4 : 3, 0, Math.PI * 2);
        ctx.fillStyle = entries[i]?.isBaseline ? cMuted : cText; ctx.fill();
      });
      const pts = weights.map((v, i) => (v != null ? { x: i, y: v } : null)).filter((p): p is { x: number; y: number } => p != null);
      const reg = linReg(pts);
      if (reg && pts.length >= 2) {
        const x0 = pts[0].x, xN = pts[pts.length - 1].x;
        ctx.strokeStyle = cMuted; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(xS(x0), yW(reg(x0))); ctx.lineTo(xS(xN), yW(reg(xN)));
        ctx.stroke(); ctx.setLineDash([]);
      }
    }

    const ly = H - 8, lx = PAD.l;
    ctx.font = `9px monospace`; ctx.textAlign = 'left';
    ctx.strokeStyle = cText; ctx.lineWidth = 2.5; ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 12, ly); ctx.stroke();
    ctx.fillStyle = cText; ctx.fillText('Peso (sx)', lx + 15, ly + 3);
    ctx.strokeStyle = cMuted; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(lx + 72, ly); ctx.lineTo(lx + 84, ly); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = cMuted; ctx.fillText('Trend', lx + 87, ly + 3);
    if (vK.length >= 2) {
      ctx.strokeStyle = cAccent; ctx.lineWidth = 1.8; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(lx + 130, ly); ctx.lineTo(lx + 142, ly); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = cAccent; ctx.fillText('Kcal (dx)', lx + 145, ly + 3);
    }
  }, [storico]);

  const entries = storico.filter(e => !e.isBaseline || (e.isBaseline && toNum(e.weeklyAvgWeight)));
  if (entries.length < 2) {
    return (
      <p style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--sb-text-muted)', padding: '24px 0', textAlign: 'center' }}>
        {entries.length === 0 ? 'Nessun dato salvato ancora.' : 'Aggiungi almeno 2 settimane per il grafico.'}
      </p>
    );
  }
  return <canvas ref={canvasRef} style={{ display: 'block', width: '100%' }} />;
}

/* Grafico ritmo perdita settimanale (solo Cut) con banda target 0.5x–1.5x. */
export function LossRateChart({ storico, cutLossRate }: { storico: DietCheckEntry[]; cutLossRate: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || storico.length < 3) return;

    const rates: (number | null)[] = [];
    for (let i = 1; i < storico.length; i++) {
      const prevW = toNum(storico[i - 1].weeklyAvgWeight), currW = toNum(storico[i].weeklyAvgWeight);
      if (prevW == null || currW == null || prevW === 0) { rates.push(null); continue; }
      rates.push(Math.round(((prevW - currW) / prevW) * 10000) / 100);
    }
    const validRates = rates.filter((r): r is number => r != null);
    if (validRates.length < 2) return;

    const style = getComputedStyle(document.documentElement);
    const cGreen = style.getPropertyValue('--sb-green').trim() || '#1a9c4a';
    const cRed = style.getPropertyValue('--sb-red').trim() || '#e03030';
    const cAccent = style.getPropertyValue('--sb-accent').trim() || '#f0c030';
    const cMuted = style.getPropertyValue('--sb-text-muted').trim() || '#8a8a8a';
    const cGrid = style.getPropertyValue('--sb-border').trim() || '#d8d4cc';

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.parentElement ? canvas.parentElement.clientWidth - 32 : 600, H = 90;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.scale(dpr, dpr); ctx.clearRect(0, 0, W, H);

    const PAD = { t: 10, r: 14, b: 22, l: 52 }, cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
    const allVals = [...validRates, 0, cutLossRate * 1.6];
    const minR = Math.min(...allVals) - 0.1, maxR = Math.max(...allVals) + 0.1;
    const n = rates.length;
    const xS = (i: number) => PAD.l + (i / (n - 1 || 1)) * cW;
    const yR = (v: number) => PAD.t + cH - ((v - minR) / (maxR - minR || 1)) * cH;

    const bandLo = cutLossRate * 0.5, bandHi = cutLossRate * 1.5;
    ctx.fillStyle = 'rgba(26,156,74,.10)';
    ctx.fillRect(PAD.l, yR(bandHi), cW, yR(bandLo) - yR(bandHi));

    ctx.strokeStyle = cGrid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD.l, yR(0)); ctx.lineTo(PAD.l + cW, yR(0)); ctx.stroke();

    ctx.strokeStyle = 'rgba(26,156,74,.5)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(PAD.l, yR(cutLossRate)); ctx.lineTo(PAD.l + cW, yR(cutLossRate)); ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = `9px monospace`; ctx.fillStyle = cMuted; ctx.textAlign = 'right';
    [0, cutLossRate, cutLossRate * 1.5].forEach(v => { ctx.fillText(v.toFixed(1) + '%', PAD.l - 5, yR(v) + 3); });

    rates.forEach((r, i) => {
      if (r == null) return;
      const nextIdx = rates.slice(i + 1).findIndex(x => x != null);
      if (nextIdx === -1) return;
      const j = i + 1 + nextIdx;
      const rj = rates[j] as number;
      const inBand = r >= bandLo && r <= bandHi;
      ctx.strokeStyle = inBand ? cGreen : r > bandHi ? cAccent : cRed;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(xS(i), yR(r)); ctx.lineTo(xS(j), yR(rj)); ctx.stroke();
    });

    rates.forEach((r, i) => {
      if (r == null) return;
      const inBand = r >= bandLo && r <= bandHi;
      ctx.beginPath(); ctx.arc(xS(i), yR(r), 3.5, 0, Math.PI * 2);
      ctx.fillStyle = inBand ? cGreen : r > bandHi ? cAccent : cRed; ctx.fill();
    });

    ctx.fillStyle = cMuted; ctx.textAlign = 'center';
    const step = Math.max(1, Math.floor(n / 6));
    for (let i = 0; i < n; i += step) {
      const d = new Date(storico[i + 1]?.date || storico[i].date);
      ctx.fillText(d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }), xS(i), H - 3);
    }
  }, [storico, cutLossRate]);

  if (storico.length < 3) return null;
  const rates: (number | null)[] = [];
  for (let i = 1; i < storico.length; i++) {
    const prevW = toNum(storico[i - 1].weeklyAvgWeight), currW = toNum(storico[i].weeklyAvgWeight);
    rates.push(prevW == null || currW == null || prevW === 0 ? null : ((prevW - currW) / prevW) * 100);
  }
  if (rates.filter(r => r != null).length < 2) return null;

  return (
    <div>
      <p style={{ fontFamily: 'monospace', fontSize: 9, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--sb-text-muted)', marginBottom: 8 }}>
        Ritmo perdita settimanale % BW · Target band ({round1(cutLossRate * 0.5)}–{round1(cutLossRate * 1.5)}%)
      </p>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%' }} />
      <p style={{ fontFamily: 'monospace', fontSize: 9, color: 'var(--sb-text-muted)', marginTop: 6 }}>
        Target: −{cutLossRate}% · Range: {round1(cutLossRate * 0.5)}%–{round1(cutLossRate * 1.5)}% · Verde = ottimale
      </p>
    </div>
  );
}

function round1(n: number) { return Math.round(n * 10) / 10; }

/* Widget stelline (1-5) per il feedback soggettivo del check settimanale. */
export function StarRating({ label, value, labels, onChange }: { label: string; value: number; labels: string[]; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontFamily: 'monospace', fontSize: 9, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--sb-text-muted)' }}>{label}</span>
      <div style={{ display: 'flex', gap: 2 }}>
        {[1, 2, 3, 4, 5].map(i => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(value === i ? 0 : i)}
            style={{ background: 'none', border: 'none', fontSize: 17, cursor: 'pointer', padding: 0, lineHeight: 1, opacity: i <= value ? 1 : 0.25, color: 'var(--sb-accent)' }}
          >★</button>
        ))}
      </div>
      <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'var(--sb-text-sub)', minHeight: 12 }}>{value > 0 ? labels[value] : '—'}</span>
    </div>
  );
}
