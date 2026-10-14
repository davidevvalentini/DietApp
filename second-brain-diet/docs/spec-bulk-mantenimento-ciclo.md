# Diet Plan — fase Bulk, Mantenimento e ciclo guidato

Data: 2026-10-14 · Stato: in attesa di revisione

## Obiettivo

Completare il Diet Plan (`/diet`) con:

1. un protocollo **Lean/Clean Bulk** vero (oggi `goal: 'bulk'` è solo una voce di menu che mostra "disponibile in una versione futura");
2. il **Mantenimento** come obiettivo con check settimanale;
3. un **ciclo circolare guidato**: a fine fase l'app propone la fase successiva e la attiva con un clic, dopo conferma.

Successo: da un Reverse arrivato al target si può arrivare al Bulk senza cambi manuali di obiettivo, e ogni fase del ciclo ha un check settimanale e una condizione di fine.

## Stato attuale (da codice)

- Logica in `src/lib/diet-calc.ts`, UI in `src/app/diet/page.tsx`. Check settimanali: `computeCutWeeklyCheck`, `computeReverseWeeklyCheck`, `computeSFWeeklyCheck`. `computeWeeklyCheck` per `bulk` restituisce `not_implemented`.
- La fase 3 dello Skinny Fat è un abbozzo fisso (+7%, max 0,5%/sett, −3% se guadagno eccessivo e BF% in salita), senza target né fine.
- `PostGoalOptions` (page.tsx) mostra tre card con kcal; "Scegli" cambia solo le kcal, **non** `pb.goal`.
- `handleCalcPlan` crea il baseline solo se non esiste già un'entry con lo stesso `goal` in storico (`hasEntryForGoal`): nel secondo giro del ciclo il baseline non verrebbe mai creato.

## Decisioni prese

- Bulk: lean/clean, un solo approccio, surplus configurabile +5/+10% (default +7%).
- Fine bulk: due criteri opzionali a scelta dell'utente, BF% massimo e peso target; stop al primo raggiunto; almeno uno obbligatorio.
- Mantenimento: obiettivo vero, con controllo di deriva del peso.
- Ciclo: Bulk → Cut o Mantenimento; Cut → Reverse (unica opzione); Reverse → Cut, Bulk o Mantenimento; Mantenimento → Cut o Bulk.
- Skinny Fat resta un protocollo a sé; la sua fase 3 delega al nuovo check del bulk.
- Nessuna transizione automatica: l'app propone, l'utente conferma.

## 1. Modello dati

- `Goal` aggiunge `'maintenance'`.
- Nuovi campi `PianoBase` (default in `defaultPianoBase`, quindi i piani salvati restano validi):
  - `bulkSurplusPct: number` (default 7, range 5–10)
  - `bulkMaxBF: string` (vuoto = criterio disattivato)
  - `bulkTargetWeight: string` (vuoto = criterio disattivato)
  - `maintenanceWeeks: number` (default 6)
  - `phaseStartedAt: string` (ISO; impostato a ogni transizione; per i piani esistenti si ricava dalla prima entry dell'obiettivo corrente nell'ultimo blocco consecutivo dello storico)
  - `phaseMaintenanceKcal: number | null` (mantenimento di riferimento della fase, impostato da `buildTransition`; null → stima a formula)
- `validateInput`: se `goal === 'bulk'` (o SF fase 3) richiede almeno uno tra `bulkMaxBF` e `bulkTargetWeight`; `bulkSurplusPct` entro 5–10.
- **Correzione baseline:** `hasEntryForGoal` diventa "esiste un'entry con quel `goal` e `date >= phaseStartedAt`". Le settimane di fase si contano con lo stesso criterio.

## 2. Check Bulk — `computeBulkWeeklyCheck`

Stessa firma degli altri check; `WeeklyCheckResult` aggiunge `isBulk`, `bulkMinGainKg`, `bulkMaxGainKg`, `actualGainKg` (già presente).

- Range di guadagno fisso: **0,25–0,5% del peso/settimana** (`minGainKg`, `maxGainKg` su peso corrente).
- Segnali di composizione come nel Reverse: vita ±0,3 cm, BF% ±0,2 rispetto alla settimana precedente.
- Ordine di valutazione:
  1. **Fine bulk:** BF% settimanale ≥ `bulkMaxBF` oppure peso medio ≥ `bulkTargetWeight` → `bulk_finished`, kcal invariate, pannello di transizione.
  2. Guadagno nel range → `bulk_on_track`, mantieni.
  3. Guadagno sotto il range: una settimana → `bulk_watch_slow`; due consecutive → `bulk_slow_confirmed` con opzioni +3% / +5%.
  4. Guadagno sopra il range: se vita o BF% in salita, una settimana → `bulk_watch_fast`, due consecutive → `bulk_fast_confirmed` con opzioni −3% / −5%; se la composizione è stabile → `bulk_watch_fast_stable` (probabile acqua/massa magra), mantieni.
- Limiti: kcal suggerite sempre tra mantenimento e mantenimento +10%.
- Kcal di partenza: mantenimento × (1 + `bulkSurplusPct`/100). Arrivando dal Reverse, il mantenimento è l'ultima kcal reale.
- `computeSFWeeklyCheck` fase 3 richiama `computeBulkWeeklyCheck` e rimappa le decisioni sul prefisso `sf_f3_*` solo se serve alla UI esistente.

## 3. Check Mantenimento — `computeMaintenanceWeeklyCheck`

- Riferimento: peso a inizio fase (baseline), non la settimana precedente, per intercettare derive lente.
- Banda: **±0,5%** del riferimento.
- Dentro banda → `maint_on_track`.
- Fuori banda: una settimana → `maint_watch`; due consecutive → `maint_drift_up` (opzione −3% kcal) o `maint_drift_down` (opzione +3% kcal).
- Vita e BF% mostrati come informazione, non cambiano la decisione.
- Dopo `maintenanceWeeks` settimane di fase → `maint_complete` con proposta Cut / Bulk; se non si sceglie resta in mantenimento.
- Kcal: mantenimento stimato (`estimateMaintenance`), oppure l'ultima kcal reale se la fase arriva da Reverse o Bulk.

## 4. Transizioni guidate

`buildTransition(pb, to, lastKcal)` in `diet-calc.ts` (pura, testabile) restituisce `{ patch: Partial<PianoBase>, startKcal, summary }`.

| Da | A | Kcal di partenza | Patch principali |
|---|---|---|---|
| Bulk | Cut | mantenimento × (1 − deficit) con parametri Cut esistenti | `goal: 'cut'` |
| Bulk | Mantenimento | mantenimento stimato | `goal: 'maintenance'` |
| Cut | Reverse | ultima kcal reale | `goal: 'reverse_diet'` |
| Reverse | Cut | come Bulk→Cut | `goal: 'cut'` |
| Reverse | Bulk | ultima kcal × (1 + `bulkSurplusPct`) | `goal: 'bulk'` |
| Reverse | Mantenimento | ultima kcal | `goal: 'maintenance'` |
| Mantenimento | Cut / Bulk | come sopra | `goal` |

I check di Cut e Reverse leggono lo storico ristretto alla fase corrente (`getPhaseStorico`): altrimenti nel secondo giro vedrebbero il peso della fase precedente come settimana scorsa.

Tutte impostano `phaseStartedAt = now` e usano `buildBaselineEntry` per il baseline della nuova fase. Il pannello mostra un riepilogo (fase, kcal, target) e chiede conferma prima di applicare.

## 5. Interfaccia

- `PostGoalOptions` sostituito da `PhaseTransitionPanel`, mostrato per `cut_target_reached`, `finished_reverse`, `bulk_finished`, `maint_complete`.
- Menu obiettivo: aggiunge "Mantenimento"; "Bulk" non è più disabilitato (`page.tsx` handleCalcPlan e descrizione obiettivo).
- `BulkConfig` (surplus, due criteri di fine) e `MaintenanceConfig` (settimane); pannello di fase per Bulk e Mantenimento come `CutPhasePanel`.
- Etichette decisioni nuove nella mappa `DECISION_LABELS` (page.tsx ~riga 53–71); titolo del check e riga "BF% attuale → target" per i nuovi obiettivi.
- `getProtocolLabel`, `getEntryGoalLabel`, `getEntryTarget` coprono `maintenance`.
- Home (`weightGoodDirection`): `bulk` resta `up`, `maintenance` → `neutral`. `daily-summary.ts`: il tipo `goal` include `'maintenance'`.

## 6. Test e verifica

- Vitest su `diet-calc.ts`: ogni ramo di `computeBulkWeeklyCheck` e `computeMaintenanceWeeklyCheck` con storico simulato; ogni riga della tabella di `buildTransition`; validazione; conteggio settimane con `phaseStartedAt`.
- Regressione fase 3 Skinny Fat su uno storico reale dell'autore (non pubblicato): le decisioni non devono cambiare tranne dove la nuova logica è deliberatamente diversa, e va elencato dove.
- Verifica in browser reale su copia isolata (Playwright) prima del deploy: percorso Reverse → Bulk → Mantenimento → Cut → Reverse con conferma, salvataggio e ricarica.

## Fuori ambito

- Cut con refeed e diet break: invariati.
- Skinny Fat: protocollo e fasi 1–2 invariati.
- App standalone `public/diet-app/index.html`: non toccata.
- Nessun cambio automatico di fase senza conferma.
