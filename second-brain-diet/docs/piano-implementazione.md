# Diet Plan — Bulk, Mantenimento e ciclo guidato Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere al Diet Plan il protocollo Lean Bulk, il Mantenimento come obiettivo con check settimanale e le transizioni guidate tra le fasi (Bulk → Cut/Mantenimento, Cut → Reverse, Reverse → Cut/Bulk/Mantenimento, Mantenimento → Cut/Bulk).

**Architecture:** Tutta la logica nuova sta in funzioni pure di `src/lib/diet-calc.ts` (check settimanali, `buildTransition`, helper di fase), testate con Vitest in un nuovo `src/lib/diet-calc.test.ts`. La UI di `src/app/diet/page.tsx` si limita a chiamarle: pannelli di configurazione, `PhaseTransitionPanel` al posto di `PostGoalOptions`, e un `applyTransition`. Le fasi sono delimitate da `PianoBase.phaseStartedAt`; i check guardano solo lo storico della fase corrente.

**Tech Stack:** Next.js + React (TS), Vitest (`npm test`), alias `@/` → `src/`. Persistenza: `/api/diet` (`saveBase` fa spread di `pianoBase`, quindi i campi nuovi si salvano senza toccare la route).

**Spec:** `docs/superpowers/specs/2026-10-14-diet-bulk-cycle-design.md`

## Global Constraints

- Range di guadagno del bulk: **0,25–0,5% del peso/settimana**, fisso.
- Surplus bulk: `bulkSurplusPct` 5–10, default **7**. Kcal del bulk sempre tra mantenimento e mantenimento **+10%**.
- Opzioni di correzione bulk: **+3% / +5%** (sotto range) e **−3% / −5%** (sopra range con composizione che peggiora). Mantenimento: **±3%**.
- Segnali di composizione (come nel Reverse): vita **±0,3 cm**, BF% **±0,2** rispetto alla settimana precedente.
- Regola delle due settimane: si agisce solo al secondo check consecutivo fuori range.
- Mantenimento: banda **±0,5%** del peso di riferimento (peso di baseline di fase); `maintenanceWeeks` default **6**.
- Fine bulk: BF% settimanale ≥ `bulkMaxBF` **oppure** peso medio ≥ `bulkTargetWeight`; almeno un criterio obbligatorio.
- Transizioni: nessun cambio automatico; sempre riepilogo + conferma (`mobileConfirm`, già in `page.tsx`).
- UI e messaggi in italiano, stile del codice esistente (commenti in italiano, `FIELD`/`CARD`/`BTN_*` di `page.tsx`).
- Fuori ambito: Cut refeed/diet break, Skinny Fat fasi 1–2, `public/diet-app/index.html`.

## Review Focus

1. **Campi vuoti o parziali** (peso medio vuoto, vita assente con solo BF%, BF% assente): nessun `NaN`, nessun crash, decisione di ripiego sensata. Test in Task 2 e 3.
2. **Primo check subito dopo il baseline** (fase con una sola entry): mai una decisione "due settimane consecutive". Test in Task 2 e 3.
3. **Secondo giro del ciclo**: le entry della fase precedente non devono inquinare i check (Cut dopo Bulk non deve vedere il peso del bulk come "settimana scorsa"). Test in Task 2.
4. **Peso target del bulk già raggiunto o inferiore al peso attuale** all'avvio: errore di validazione, non fine bulk immediata. Test in Task 1.
5. **Piani salvati prima di questa modifica** (senza `phaseStartedAt`, senza campi bulk): caricamento senza errori, `phaseStartedAt` ricavato dallo storico. Test in Task 1.

---

## File Structure

- Modify `src/lib/diet-calc.ts` — tipi, default, validazione, helper di fase, check bulk/mantenimento, `buildTransition`, etichette.
- Create `src/lib/diet-calc.test.ts` — test di tutte le funzioni nuove e regressione SF.
- Create `src/lib/__fixtures__/diet-storico-real.json` — copia di entry reali dell'autore (non pubblicata) (solo peso/BF/kcal/goal/sfPhase/date).
- Modify `src/app/diet/page.tsx` — configurazioni, pannelli, transizioni, etichette, baseline.
- Modify `src/app/page.tsx:189-199`, `src/lib/daily-summary.ts:117` — direzione peso e tipo goal.
- Modify `docs/superpowers/specs/2026-10-14-diet-bulk-cycle-design.md` — due righe emerse dal piano (vedi Task 1, step 8).

---

### Task 1: Modello dati, validazione, helper di fase, kcal di partenza

**Files:**
- Modify: `src/lib/diet-calc.ts` (tipi righe 6–100, `computeInitialStartCalories` ~495, `validateInput` ~564, `buildBaselineEntry` ~1095, `getEntryGoalLabel`/`getProtocolLabel`/`getEntryTarget` ~1112–1146, `defaultPianoBase` ~1159)
- Test: `src/lib/diet-calc.test.ts` (create)

**Interfaces:**
- Produces:
  - `Goal` include `'maintenance'`.
  - `PianoBase` nuovi campi: `bulkSurplusPct: number`, `bulkMaxBF: string`, `bulkTargetWeight: string`, `maintenanceWeeks: number`, `phaseStartedAt: string`, `phaseMaintenanceKcal: number | null`.
  - `isBulk(pb: PianoBase): boolean`, `isMaintenance(pb: PianoBase): boolean`.
  - `getMaintenanceRef(pb: PianoBase): number` — `phaseMaintenanceKcal ?? estimateMaintenance(pb).maintenance`.
  - `getPhaseStorico(pb: PianoBase, storico: DietCheckEntry[]): DietCheckEntry[]` — storico è ordinato dal più recente; restituisce le entry con `goal === pb.goal` e `date >= pb.phaseStartedAt`; con `phaseStartedAt` vuoto usa il blocco iniziale consecutivo con lo stesso `goal`.
  - `resolvePhaseStart(pb: PianoBase, storico: DietCheckEntry[]): string` — `pb.phaseStartedAt` se valorizzato, altrimenti la `date` dell'entry più vecchia del blocco iniziale consecutivo con `goal === pb.goal`, altrimenti `''`.
  - `buildBaselineEntry(pb: PianoBase, startKcal?: number): DietCheckEntry` — `startKcal` sovrascrive `currentCalories`.

- [ ] **Step 1: Write the failing tests** in `src/lib/diet-calc.test.ts` (crea il file con helper `mkPb(over)` = `{...defaultPianoBase(), weight:'70', bodyFat:'15', measureWaist:'80', birthDate:'1988-03-31', age:38, ...over}` e `mkEntry({date, goal, weeklyAvgWeight, weeklyMeasureWaist?, checkBodyFat?, currentCalories?, isBaseline?})` che riempie il resto con `buildBaselineEntry` e sovrascrive):
  - `defaultPianoBase()` ha `bulkSurplusPct === 7`, `maintenanceWeeks === 6`, `phaseStartedAt === ''`, `phaseMaintenanceKcal === null`.
  - `validateInput` con `goal:'bulk'` e nessun criterio di fine → contiene `'Bulk: imposta almeno un criterio di fine (BF% massimo o peso target)'`.
  - `validateInput` con `goal:'bulk'`, `bulkTargetWeight:'69'` e `weight:'70'` → contiene `'Bulk: il peso target deve essere maggiore del peso attuale'`.
  - `validateInput` con `goal:'bulk'`, `bulkMaxBF:'18'`, `bulkSurplusPct:12` → contiene `'Bulk: surplus tra 5% e 10%'`.
  - `validateInput` con `goal:'bulk'`, `bulkMaxBF:'18'`, surplus 7 → nessuno degli errori bulk.
  - `getPhaseStorico` con storico `[cut@10-12, bulk@10-05, bulk@09-28, reverse@09-20]` (ordinato decrescente), `goal:'bulk'`, `phaseStartedAt:'2026-09-25T00:00:00Z'` → le due entry bulk; con `phaseStartedAt:''` → le stesse due (blocco iniziale consecutivo); con `goal:'cut'` e `phaseStartedAt:''` → solo la prima.
  - `resolvePhaseStart` su piano legacy `goal:'reverse_diet'` con le 2 entry reverse reali → la `date` della più vecchia delle due.
  - `computeInitialStartCalories`: `bulk` con maintenance misurata `2000` e `bulkSurplusPct:7` → `startCalories === 2140`; `maintenance` → `2000`; con `phaseMaintenanceKcal:2050` → `2050` per entrambi e per il Cut il mantenimento usato è 2050.
  - `buildBaselineEntry(pb, 2222).currentCalories === 2222`.
  - `getProtocolLabel`/`getEntryGoalLabel` per `maintenance` → `'Mantenimento'`; per `bulk` → `'Bulk +7%'`/`'Bulk'`; `getEntryTarget` per `maintenance` → `'Peso stabile ±0,5%'`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/diet-calc.test.ts`
Expected: FAIL (funzioni/campi non definiti).

- [ ] **Step 3: Implement types, defaults, helpers** in `diet-calc.ts`: estendi `Goal`; aggiungi i sei campi a `PianoBase` e a `defaultPianoBase()` (valori: 7, `''`, `''`, 6, `''`, `null`); aggiungi `isBulk`, `isMaintenance`, `getMaintenanceRef`, `getPhaseStorico`, `resolvePhaseStart` accanto agli altri helper `is*`. Il confronto di date usa `new Date(...).getTime()`.

- [ ] **Step 4: Implement `computeInitialStartCalories` branches** per `isBulk(pb)` (`round(getMaintenanceRef × (1 + bulkSurplusPct/100))`, label `Bulk — surplus +X%`), `isMaintenance(pb)` (`getMaintenanceRef`, label `Mantenimento`), SF fase 3 (stessa formula del bulk con `bulkSurplusPct`, label `SF Fase 3 — surplus +X%`), e nel ramo Cut usa `getMaintenanceRef(pb)` al posto di `m`.

- [ ] **Step 5: Implement `validateInput` bulk rules** con i tre messaggi esatti dello step 1 (regole attive per `goal==='bulk'` oppure `isSF && sfPhase===3`); `buildBaselineEntry(pb, startKcal?)`; etichette `getProtocolLabel`/`getEntryGoalLabel`/`getEntryTarget` per `bulk` e `maintenance`.

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/lib/diet-calc.test.ts`
Expected: PASS.

- [ ] **Step 7: Run type check**

Run: `npx tsc --noEmit -p .`
Expected: nessun errore nuovo (se `Record<Goal,…>` in `page.tsx` si lamenta per `maintenance`, rimandalo al Task 5 aggiungendo la chiave in `GOAL_META` ora con `{ label: 'Mantenimento', color: 'var(--sb-text-muted)' }`).

- [ ] **Step 8: Update the spec** con due righe: nella sezione 1 aggiungi `phaseMaintenanceKcal: number | null` ("mantenimento di riferimento della fase, impostato da `buildTransition`; null → stima") e nella sezione 4 "i check di Cut e Reverse leggono lo storico ristretto alla fase corrente (`getPhaseStorico`), altrimenti nel secondo giro vedrebbero il peso della fase precedente come settimana scorsa".

- [ ] **Step 9: Commit**

```bash
git add src/lib/diet-calc.ts src/lib/diet-calc.test.ts src/app/diet/page.tsx docs/superpowers/specs/2026-10-14-diet-bulk-cycle-design.md
git commit -m "feat(diet): modello dati bulk/mantenimento, helper di fase, validazione"
```

---

### Task 2: Check settimanale Bulk + scoping per fase

**Files:**
- Modify: `src/lib/diet-calc.ts` (`WeeklyCheckResult` ~652, `computeWeeklyCheck` ~680, `computeSFWeeklyCheck` ramo fase 3 ~992)
- Test: `src/lib/diet-calc.test.ts`; Create: `src/lib/__fixtures__/diet-storico-real.json`

**Interfaces:**
- Consumes: `getPhaseStorico`, `getMaintenanceRef`, `isBulk` (Task 1).
- Produces:
  - `computeBulkWeeklyCheck(pb, storico, prevCal, avgW, bfVal, measures): WeeklyCheckResult` — `storico` già ristretto alla fase.
  - `WeeklyCheckResult` aggiunge `isBulk: boolean`, `isMaintenance: boolean`, `minGainKg?: number`, `maxGainKg?: number`, `bulkEnd?: 'bf' | 'weight'`. Tutti i `WeeklyCheckResult` esistenti impostano `isBulk:false`, `isMaintenance:false`.
  - `computeWeeklyCheck` dispatch: `isBulk` → bulk; Cut e Reverse ricevono `getPhaseStorico(pb, storico)`; SF fase 3 chiama `computeBulkWeeklyCheck` con `storico.filter(e => e.goal==='skinny_fat' && e.sfPhase===3)` e riporta `isSkinnyFat:true`, `sfPhase:3`, `isBulk:false` (la UI SF resta com'è).
  - Decisioni: `bulk_finished`, `bulk_on_track`, `bulk_watch_slow`, `bulk_slow_confirmed`, `bulk_watch_fast`, `bulk_fast_confirmed`, `bulk_watch_fast_stable`. Per SF fase 3 le stesse decisioni con prefisso `sf_f3_` al posto di `bulk_` (la mappa etichette del Task 5 le copre).

- [ ] **Step 1: Write the failing tests** (peso base 70, kcal 2140, mantenimento misurato 2000, `bulkMaxBF:'18'`, `bulkTargetWeight:'75'`, riferimento settimana scorsa = `storico[0].weeklyAvgWeight`; range = 0,175–0,35 kg a 70 kg):
  - `bulk_finished` con `bfVal=18` (`bulkEnd:'bf'`) e con `avgW=75` (`bulkEnd:'weight'`); kcal invariate; con entrambi i criteri vuoti non scatta mai.
  - `bulk_on_track` con +0,25 kg; kcal invariate.
  - `bulk_watch_slow` con +0,05 kg e fase di una sola entry (baseline); `bulk_slow_confirmed` con +0,05 kg quando anche la settimana precedente era sotto range; `options.lo.suggestedCalories === 2183` (+3%) e `options.hi === 2247` (+5%).
  - `bulk_watch_fast` con +0,6 kg e vita +0,5 vs prec., prima settimana; `bulk_fast_confirmed` alla seconda con vita in salita: `options.lo` = −3%, `options.hi` = −5%; `bulk_watch_fast_stable` con +0,6 kg e vita/BF% stabili.
  - Limiti: con `prevCal=2200` (= mantenimento +10%) l'aumento suggerito non supera `2200`; con `prevCal=2010` la riduzione non scende sotto `2000`.
  - Review Focus 1: `avgW=null`, `weeklyAvgWeight` vuoto in storico, vita assente con solo BF%: nessuna eccezione e `Number.isFinite(suggestedCalories)`.
  - Review Focus 2: fase con una sola entry e crescita sotto range → mai `*_confirmed`.
  - Review Focus 3: storico `[bulkBaseline@10-14 (peso 71), bulk@10-07 (peso 70.4)]` e `goal:'cut'` con `phaseStartedAt` a 10-14 → il Cut valuta solo la baseline (non esiste `prevWeekUnderTarget` spurio): `cut_watch`/`cut_on_track`, mai `cut_stalled_confirmed`.
  - Regressione SF: caricato `diet-storico-real.json` (4 entry SF fase 1 + 2 reverse), `computeWeeklyCheck` su un piano `skinny_fat` fase 1 e su uno `reverse_diet` restituisce le stesse `decision` di prima della modifica (valori catturati eseguendo prima il test contro il codice non modificato: annota in un commento le decisioni attese). Nota nel test che la fase 3 SF cambia deliberatamente (regola delle due settimane, range 0,25–0,5%, surplus configurabile).

- [ ] **Step 2: Create the fixture** `src/lib/__fixtures__/diet-storico-real.json` copiando dallo storico dell'autore le 6 entry con solo `date, goal, sfPhase, weeklyAvgWeight, checkBodyFat, weeklyMeasureWaist, currentCalories, isBaseline` (nessun dato personale oltre a questi).

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/lib/diet-calc.test.ts`
Expected: FAIL (`computeBulkWeeklyCheck` non definita).

- [ ] **Step 4: Implement `computeBulkWeeklyCheck`**. Ordine: (1) fine bulk su BF%/peso; (2) range sul peso corrente; (3) rami in ordine spec §2. "Settimana precedente sotto/sopra range" si ricava da `storico[0]` vs `storico[1]` (stesso schema di `prevWeekUnderTarget` nel Cut); "composizione peggiora" = vita > prec.+0,3 oppure (BF% > prec.+0,2 e vita assente), come `compositionWorsened` del Reverse. Le kcal suggerite passano da un clamp `[M, round(M*1.10)]` con `M = getMaintenanceRef(pb)`; gli aggiustamenti sono arrotondati con `Math.round(prevCal * (1 ± pct))` e poi clampati.

- [ ] **Step 5: Implement dispatch and SF fase 3 delegation** come da Interfaces; rimuovi dal ramo `else` di `computeSFWeeklyCheck` la vecchia logica fissa (`maxGainKg = wN*0.005` ecc.) sostituendola con la chiamata e il rimappaggio del prefisso.

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/lib/diet-calc.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/diet-calc.ts src/lib/diet-calc.test.ts src/lib/__fixtures__/diet-storico-real.json
git commit -m "feat(diet): check settimanale Bulk e storico ristretto alla fase"
```

---

### Task 3: Check settimanale Mantenimento

**Files:**
- Modify: `src/lib/diet-calc.ts` (dopo `computeBulkWeeklyCheck`; dispatch in `computeWeeklyCheck`)
- Test: `src/lib/diet-calc.test.ts`

**Interfaces:**
- Consumes: `getPhaseStorico`, `getMaintenanceRef` (Task 1), `WeeklyCheckResult.isMaintenance` (Task 2).
- Produces: `computeMaintenanceWeeklyCheck(pb, storico, prevCal, avgW, bfVal, measures): WeeklyCheckResult` (storico già di fase; dispatch con `getPhaseStorico`). Decisioni: `maint_on_track`, `maint_watch`, `maint_drift_up`, `maint_drift_down`, `maint_complete`. Campi risultato: `refWeight` (peso di baseline di fase, `pb.weight` se manca), `actualChange` (avgW − refWeight), `weeksInPhase`.

- [ ] **Step 1: Write the failing tests** (riferimento 70 kg, banda ±0,35 kg, kcal 2000):
  - `avgW=70.3` → `maint_on_track`, kcal invariate; `avgW=70.5` prima settimana fuori banda → `maint_watch`.
  - Seconda settimana consecutiva sopra banda (entry precedente 70.5) → `maint_drift_up`, `suggestedCalories === 1940` (−3%); sotto banda (69.4 dopo 69.5) → `maint_drift_down`, `2060`.
  - Deriva su lati opposti in settimane consecutive (70.5 poi 69.4) → `maint_watch`, non `drift_*`.
  - Fase di `maintenanceWeeks` (6) check non baseline con peso in banda → `maint_complete`; con deriva confermata nello stesso momento → prevale `maint_drift_*`.
  - Review Focus 2: fase con la sola baseline e peso fuori banda → `maint_watch`.
  - Review Focus 1: `avgW=null` e storico con peso vuoto → nessuna eccezione, `maint_watch` o `maint_on_track` con kcal finite.
  - Vita e BF% non cambiano `decision` né kcal (stesso input con vita +3 cm → stessa decisione).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/diet-calc.test.ts -t "Mantenimento"`
Expected: FAIL.

- [ ] **Step 3: Implement `computeMaintenanceWeeklyCheck`** secondo spec §3. Ordine: deriva confermata → `maint_complete` (se `weeksInPhase >= maintenanceWeeks`, dove `weeksInPhase` = entry non baseline nella fase + 1 per il check in corso) → `maint_watch` (fuori banda, una settimana) → `maint_on_track`. Note testuali in italiano come gli altri check; aggiungi vita/BF% come informazione nella `note` quando presenti.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/diet-calc.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/diet-calc.ts src/lib/diet-calc.test.ts
git commit -m "feat(diet): check settimanale Mantenimento"
```

---

### Task 4: Transizioni di fase

**Files:**
- Modify: `src/lib/diet-calc.ts`
- Test: `src/lib/diet-calc.test.ts`

**Interfaces:**
- Consumes: tutto il Task 1.
- Produces:
  - `type PhaseTransition = { to: Exclude<Goal, ''>; patch: Partial<PianoBase>; startKcal: number; summary: string }`.
  - `getTransitionTargets(decision: string): Exclude<Goal, ''>[]` — `cut_target_reached` → `['reverse_diet']`; `finished_reverse` → `['cut','bulk','maintenance']`; `bulk_finished` e `sf_f3_finished` → `['cut','maintenance']`; `maint_complete` → `['cut','bulk']`; altro → `[]`.
  - `buildTransition(pb: PianoBase, to: Exclude<Goal, ''>, lastKcal: number, nowIso?: string): PhaseTransition`.

- [ ] **Step 1: Write the failing tests** (pb con maintenance misurata 2000, peso 70, `cutLossRate:0.6`, `bulkSurplusPct:7`, `nowIso:'2026-10-14T08:00:00.000Z'`):
  - `getTransitionTargets` per le quattro decisioni e per `'hold'` (`[]`).
  - Reverse → Bulk con `lastKcal=2050`: `patch` contiene `goal:'bulk'`, `phaseStartedAt:nowIso`, `phaseMaintenanceKcal:2050`; `startKcal === 2194` (2050×1,07).
  - Reverse → Mantenimento: `startKcal === 2050`, `goal:'maintenance'`, `phaseMaintenanceKcal:2050`.
  - Reverse → Cut: `goal:'cut'`, `startKcal === 2050 − round(70×0,6/100×7700/7)` (= 1588), `phaseMaintenanceKcal:2050`.
  - Bulk → Mantenimento con `lastKcal=2194` e surplus 7: `startKcal === 2050` (2194/1,07), `phaseMaintenanceKcal:2050`.
  - Bulk → Cut: stessa base 2050 per il deficit.
  - Cut → Reverse: `startKcal === lastKcal`, `goal:'reverse_diet'`, `phaseMaintenanceKcal: null`.
  - Mantenimento → Bulk: `startKcal === round(lastKcal×1,07)`.
  - `summary` non vuoto e contiene la kcal di partenza e il nome della fase (`/Bulk/`, `/2194 kcal/`).
  - Il `patch` di una transizione verso Cut non tocca `cutTargetBF` né i parametri refeed.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/diet-calc.test.ts -t "transizion"`
Expected: FAIL.

- [ ] **Step 3: Implement `getTransitionTargets` and `buildTransition`.** Base di mantenimento `M`: da Reverse e da Mantenimento = `lastKcal`; da Bulk = `Math.round(lastKcal / (1 + bulkSurplusPct/100))`; da Cut = non usata (verso Reverse `startKcal = lastKcal`, `phaseMaintenanceKcal: null`). Per Cut chiama `computeInitialStartCalories({ ...pb, goal:'cut', phaseMaintenanceKcal: M }).startCalories`. `summary` in italiano: "Passi a <fase>: <startKcal> kcal/die, <target della fase>".

- [ ] **Step 4: Run tests**

Run: `npx vitest run`
Expected: PASS (intera suite).

- [ ] **Step 5: Commit**

```bash
git add src/lib/diet-calc.ts src/lib/diet-calc.test.ts
git commit -m "feat(diet): transizioni guidate tra le fasi"
```

---

### Task 5: UI del Diet Plan

**Files:**
- Modify: `src/app/diet/page.tsx` — `GOAL_META` ~42, `DECISION_META` ~49, caricamento piano ~481, `handleCalcPlan` ~580–595, `handleEvaluate` ~633, menu obiettivo ~845 e descrizione ~865, blocco configurazioni ~960–1000, pannelli ~1070, `StatBox` target ~1156, `SuggestionCard` ~1625–1700 (`goalTitle`, riga BF target, `PostGoalOptions` ~1700)

**Interfaces:**
- Consumes: `isBulk`, `isMaintenance`, `getTransitionTargets`, `buildTransition`, `buildBaselineEntry(pb, startKcal)`, `resolvePhaseStart`, `getPhaseStorico` (Task 1–4); `PhaseTransition`.
- Produces: `applyTransition(t: PhaseTransition): Promise<void>` nel componente principale; `PhaseTransitionPanel({ pb, decision, lastKcal, onApply })` che sostituisce `PostGoalOptions`.

- [ ] **Step 1: Loading and baseline fix.** Dopo `loadedPB` (~481) calcola `phaseStartedAt: resolvePhaseStart(loadedPB, storicoCaricato)` quando vuoto. In `handleCalcPlan` sostituisci `storico.some(e => e.goal === pb.goal)` con `getPhaseStorico(pb, storico).length > 0`; rimuovi il ramo `pb.goal === 'bulk'` con il modal "versione futura". Se `phaseStartedAt` è vuoto alla creazione del baseline, impostalo a `new Date().toISOString()` con `patchPB`.

- [ ] **Step 2: Goal menu and descriptions.** Aggiungi `<option value="maintenance">Mantenimento</option>`; sostituisci la descrizione "Funzionalità non ancora implementata…" con testi per bulk ("Lean bulk: surplus controllato, guadagno 0,25–0,5%/sett, fine al raggiungimento del BF% massimo o del peso target.") e mantenimento ("Peso stabile entro ±0,5% del riferimento; ogni settimana verifico che non derivi."). Aggiungi `maintenance` a `GOAL_META` (se non già fatto) e le decisioni `bulk_*`, `sf_f3_*` nuove, `maint_*` a `DECISION_META` (colori: on_track verde, watch `#d4620a`, *_confirmed rosso/accent, finished/complete verde, label brevi in maiuscolo come le esistenti).

- [ ] **Step 3: Config panels.** Dopo `isReverse && <ReverseConfig>` aggiungi `BulkConfig` (`GoalColorPanel` con `GOAL_META.bulk.color`): `Surplus %` (`NumberInput`, 5–10, hint "5–10% raccomandato, default 7"), `BF% massimo` (`BodyFatInput`, hint "Fine bulk se raggiunto"), `Peso target kg` (input numerico, hint "Fine bulk se raggiunto; lascia vuoto per usare solo il BF%") e un avviso inline se mancano entrambi. Per SF fase 3 mostra gli stessi tre campi. Aggiungi `MaintenanceConfig` con `maintenanceWeeks` (hint "Durata consigliata; poi ti propongo Cut o Bulk"). Mostra gli errori di `validateInput` come già fatto per gli altri.

- [ ] **Step 4: Phase panels and labels.** `BulkPhasePanel` e `MaintenancePhasePanel` accanto a `CutPhasePanel` (TDEE/mantenimento di riferimento → piano, guadagno atteso 0,25–0,5% = kg/sett sul peso corrente, BF% corrente → massimo, peso → target; per il mantenimento banda in kg e settimane di fase `n/maintenanceWeeks`). Aggiorna: riga `StatBox` Target (`bulk` → `BF ${bulkMaxBF}%`/`${bulkTargetWeight} kg`, `maintenance` → `±0,5%`), `goalTitle` (`Bulk`, `Mantenimento`), la riga "BF% attuale → target" della `SuggestionCard`, e in `SuggestionCard` le righe di peso con `minGainKg/maxGainKg` per `isBulk` e `refWeight/actualChange` per `isMaintenance`.

- [ ] **Step 5: Transition panel.** Elimina `PostGoalOptions` e le due righe `{sug.decision === … && <PostGoalOptions …/>}`. Aggiungi `PhaseTransitionPanel` mostrato quando `getTransitionTargets(sug.decision).length > 0` (anche per `sf_f3_finished`): una card per target con titolo, `startKcal` e `summary` da `buildTransition(pb, to, sug.suggestedCalories)` e bottone "Passa a …". Il click chiama `onApply` → `applyTransition`.

- [ ] **Step 6: `applyTransition`.** `await mobileConfirm(t.summary + '\n\nConfermi?')`; se sì: `const nextPb = { ...pb, ...t.patch }`, `setPb(nextPb)`, `setCurrentCalories(t.startKcal)`, crea `buildBaselineEntry(nextPb, t.startKcal)`, inseriscila in `storico` con lo stesso ordinamento decrescente di `commitCheckEntry`, `persistEntry(entry, false)`, `postDiet({ action: 'saveBase', pianoBase: { ...nextPb, savedAt: … } })`, `setSuggestion(null)` e toast `✓ Fase attivata: <label>`. Peso e BF% del nuovo baseline vengono dall'ultimo check già accettato (`pb.weight`/`pb.bodyFat`).

- [ ] **Step 7: Type check, lint, tests**

Run: `npx tsc --noEmit -p . && npx vitest run && npx eslint src/app/diet/page.tsx src/lib/diet-calc.ts`
Expected: nessun errore.

- [ ] **Step 8: Commit**

```bash
git add src/app/diet/page.tsx
git commit -m "feat(diet): UI bulk, mantenimento e pannello transizioni"
```

---

### Task 6: Home, riepilogo giornaliero e verifica in browser

**Files:**
- Modify: `src/app/page.tsx:189-199` (`weightGoodDirection`: nessuna modifica di comportamento per `maintenance` → già `neutral`; aggiungi un commento che lo dichiara), `src/lib/daily-summary.ts:117` (commento del tipo `goal` con `'maintenance'`)
- Verify: Playwright su copia isolata (memoria "Verify in a real browser")

- [ ] **Step 1: Update comments/types** come sopra; `npx tsc --noEmit -p .` senza errori.

- [ ] **Step 2: Prepare an isolated copy.** Copia il repo e `data/` in una directory temporanea sotto lo scratchpad, avvia `next dev` su una porta libera con quella `data/` (mai sull'istanza di produzione né su `data/diet.json` reale).

- [ ] **Step 3: Walk the cycle in the browser** partendo dal piano Reverse reale (copia): imposta un Reverse al target → `finished_reverse` mostra Cut/Bulk/Mantenimento → scegli Bulk, conferma, verifica kcal = ultima × 1,07 e nuova baseline in storico → inserisci check con guadagno nel range (`bulk_on_track`) → forza `bulk_finished` con peso target raggiunto → scegli Mantenimento → verifica banda → forza `maint_complete` → scegli Cut → forza `cut_target_reached` → Reverse. Dopo ogni passo ricarica la pagina e verifica che obiettivo, kcal e storico persistano; screenshot dei pannelli Bulk, Mantenimento e transizione, desktop e mobile.

- [ ] **Step 4: Check Review Focus 5** caricando la copia con il `diet.json` originale (senza `phaseStartedAt`): la pagina si apre senza errori in console e il piano Reverse risulta con `phaseStartedAt` valorizzato dopo il primo salvataggio.

- [ ] **Step 5: Full suite, then commit and report**

Run: `npx vitest run`
Expected: tutto PASS.

```bash
git add src/app/page.tsx src/lib/daily-summary.ts
git commit -m "chore(diet): commenti goal maintenance in home e riepilogo"
```

Non fare deploy: dopo la verifica riferisci all'utente cosa è stato visto in browser, in attesa di OK per il deploy.
