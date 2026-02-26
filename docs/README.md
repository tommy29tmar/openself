# OpenSelf Docs Guide

Last updated: 2026-02-26

Questa cartella contiene la documentazione operativa del progetto.
Usa questo file come guida rapida su cosa aggiornare e quando.

## Struttura dei file

### `ARCHITECTURE.md`

Scopo:
- visione del prodotto
- architettura target
- principi, componenti, flussi di alto livello
- contratti runtime e invarianti stabili

Quando aggiornarlo:
- cambia il design architetturale
- cambiano componenti o responsabilita del sistema
- vengono introdotte nuove scelte strutturali di lungo periodo

Quando non aggiornarlo:
- piccoli fix implementativi
- stato progresso giornaliero
- checklist di sprint / roadmap operativa

### `STATUS.md`

Scopo:
- fotografia reale dello stato attuale (fatto / parziale / mancante)
- gap principali tra target e implementazione
- snapshot qualita/test

Quando aggiornarlo:
- dopo merge che cambia lo stato reale di una feature
- quando cambia il livello di copertura o rischio

Regola:
- deve descrivere solo verita runtime, non intenzioni

### `ROADMAP.md`

Scopo:
- priorita esecutive (Now / Next / Later)
- milestone e definition of done

Quando aggiornarlo:
- all'inizio o fine iterazione
- quando cambiano priorita, dipendenze o scope

Regola:
- contiene piano e ordine di lavoro, non stato storico dettagliato

### `archive/`

Scopo:
- preservare contenuto storico estratto dai documenti principali
- evitare perdita di contesto durante refactor strutturali

Regola:
- i file in `archive/` non sono source of truth operativa
- per lo stato corrente usa sempre `STATUS.md` e `ROADMAP.md`

### `decisions/` (ADR)

Scopo:
- decisioni tecniche durevoli e relative motivazioni

File principali:
- `decisions/README.md`: convenzioni ADR e template
- `decisions/ADR-XXXX-*.md`: singole decisioni

Quando aggiungere un ADR:
- tradeoff tecnico importante
- decisione che impatta architettura o manutenzione futura
- scelta che il team deve poter ricostruire in futuro

## Flusso consigliato dopo ogni lavoro

1. Implementa codice e test.
2. Se cambia la realta del prodotto, aggiorna `STATUS.md`.
3. Se cambia la priorita del backlog, aggiorna `ROADMAP.md`.
4. Se hai preso una decisione strutturale importante, aggiungi un ADR.
5. Se il target architetturale cambia, aggiorna `ARCHITECTURE.md`.

## Checklist rapida per PR

1. Codice e test coerenti con la modifica
2. `STATUS.md` aggiornato (se necessario)
3. `ROADMAP.md` aggiornato (se necessario)
4. ADR aggiunto (se necessario)
5. `ARCHITECTURE.md` aggiornato solo se c'e una modifica architetturale reale

## Convenzioni pratiche

1. Usa date assolute in formato `YYYY-MM-DD`.
2. Mantieni i documenti brevi e operativi.
3. Evita duplicazioni lunghe: `ARCHITECTURE` spiega il target, `STATUS` spiega il presente.
4. Se rimuovi sezioni grandi durante un refactor docs, preservale in `docs/archive/`.
