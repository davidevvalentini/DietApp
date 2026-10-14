# Diet Plan — modulo del Second Brain

Codice del **Diet Plan** del Second Brain: calcolo del piano e valutazione settimanale per tutti i protocolli, con **ciclo guidato** tra le fasi. È l'evoluzione delle versioni standalone `DietPlan_v*.html` di questa repository (la v4 è nella cartella principale).

> Questo è un estratto del modulo, non un'app autonoma: la pagina `src/app/diet/page.tsx` e la route `src/app/api/diet/route.ts` girano dentro un'app Next.js (App Router) che fornisce layout, autenticazione e i token di stile. Quello che si può eseguire da solo è la **logica** (`src/lib/diet-calc.ts`) con i suoi test.

## Protocolli

| Obiettivo | Cosa fa il check settimanale |
|---|---|
| **Cut** | Ritmo di perdita % del peso/sett, deficit calcolato, refeed e diet break opzionali, rilevamento plateau. |
| **Reverse Diet** | Risalita calorica graduale verso un target in kcal/kg di massa magra, con tre approcci (conservativo, moderato, aggressivo). |
| **Skinny Fat** | Tre fasi: Cut → Reverse (stabilizzazione) → Clean Bulk. |
| **Bulk (lean)** | Surplus 5–10% sul mantenimento, guadagno atteso 0,25–0,5% del peso/sett, fine al raggiungimento di un BF% massimo e/o di un peso target (al primo dei due). |
| **Mantenimento** | Peso entro ±0,5% di quello di inizio fase; due check consecutivi fuori banda correggono le kcal del 3%; dopo N settimane propone la fase successiva. |

In tutti i casi una sola settimana fuori range non cambia le kcal: si agisce al secondo check consecutivo.

## Ciclo guidato

A fine fase l'app propone la successiva e la attiva con un clic, dopo un riepilogo da confermare. Non cambia mai fase da sola.

```
Reverse ──► Cut ──► Reverse ──► Bulk ──► Mantenimento ──► Cut …
              ▲                    │            │
              └────────────────────┴────────────┘
```

- Cut → Reverse
- Reverse → Cut, Bulk o Mantenimento
- Bulk → Cut o Mantenimento
- Mantenimento → Cut o Bulk

I check leggono solo lo storico della **fase corrente** (`getPhaseStorico`, delimitata da `phaseStartedAt`): altrimenti nel secondo giro del ciclo il peso della fase precedente diventerebbe la "settimana scorsa" della nuova.

## Struttura

```
src/lib/diet-calc.ts            logica pura: formule, check settimanali, transizioni (nessuna dipendenza)
src/lib/diet-calc.test.ts       test della logica
src/lib/diet-versions.ts        snapshot di backup del piano
src/lib/atomic-write.ts         scrittura atomica + lock sui file JSON
src/lib/{confirm,date}.ts       piccoli helper usati dalla pagina
src/lib/__fixtures__/           helper dei test
src/app/diet/page.tsx           pagina /diet (React, richiede l'app host)
src/app/diet/DietCharts.tsx     grafici peso / ritmo
src/app/api/diet/route.ts       API: salva piano base e check settimanali (data/diet.json)
src/app/api/diet/route.test.ts  test della route
docs/                           spec e piano di implementazione del Bulk/Mantenimento/ciclo
```

## Eseguire i test

```bash
npm install
npm test
```

Nella copia pubblica sono omessi i test di regressione su dati reali dell'autore (lo storico personale non è pubblicato); la logica è coperta dai test sintetici.

## Note

- Le formule di fabbisogno e i criteri sui check seguono la guida a cui si ispira l'app (tabelle kcal/kg di massa magra, regola delle due settimane); le soglie sono decisioni di prodotto, non indicazioni mediche.
- Italiano, interfaccia e messaggi compresi.
