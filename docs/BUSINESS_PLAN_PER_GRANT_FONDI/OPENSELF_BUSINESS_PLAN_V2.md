---
title: "PIANO D'IMPRESA — OPENSELF v2"
subtitle: "Piattaforma di Identità Professionale Digitale — Domanda Pre-Seed 3.0 Lazio Innova"
author: "Tommaso Maria Rinversi"
date: "Marzo 2026"
classification: "Documento riservato"
---

# PIANO D'IMPRESA — OPENSELF v2

**Piattaforma di Identità Professionale Digitale — Domanda Pre-Seed 3.0 Lazio Innova**

*Fondatore: Tommaso Maria Rinversi*
*Data: Marzo 2026*
*Sito: openself.dev*
*Documento riservato*

---

## Indice

1. [Executive Summary](#1-executive-summary)
2. [Il Problema e l'Opportunità di Mercato](#2-il-problema-e-lopportunità-di-mercato)
3. [La Soluzione](#3-la-soluzione)
4. [Innovatività del Progetto](#4-innovatività-del-progetto)
5. [Il Team e le Competenze](#5-il-team-e-le-competenze)
6. [Strategia di Accesso al Mercato e Trazione](#6-strategia-di-accesso-al-mercato-e-trazione)
7. [Modello di Business e Piano Finanziario](#7-modello-di-business-e-piano-finanziario)
8. [Roadmap Tecnica e Piano Operativo](#8-roadmap-tecnica-e-piano-operativo)
9. [Analisi dei Rischi, Mitigazioni e Direzione Strategica](#9-analisi-dei-rischi-mitigazioni-e-direzione-strategica)
10. [Impatto e Conclusioni](#10-impatto-e-conclusioni)

---

## 1. Executive Summary

### Il problema

La presenza online professionale è rotta. In un mondo in cui il 78% dei recruiter utilizza i social media per valutare i candidati e il 54% di essi ha scartato un profilo per un'immagine digitale inadeguata, la maggior parte dei professionisti si affida ancora a pagine statiche, compilate manualmente e frammentate su decine di piattaforme. LinkedIn impone un formato rigido e identico per tutti; i portfolio personali richiedono competenze tecniche o costosi designer; i profili social catturano frammenti, mai l'intera identità professionale.

Ma il problema va oltre la presentazione. I professionisti indipendenti — freelancer, consulenti, gig worker — non possono dimostrare la propria credibilità in modo strutturato e verificabile. Chi apre un conto bancario dedicato alla propria attività, cerca un affitto in una nuova città, o si propone a un nuovo cliente, deve affidarsi a documentazione frammentaria e autodichiarazioni non verificabili. Il deficit di fiducia nell'economia dei lavori indipendenti è un problema sistemico: la frode nella creazione di conti bancari costa al settore finanziario europeo EUR 5,8 miliardi all'anno, e il 67% delle banche riporta un aumento dei tentativi di frode (EBA Report, 2024). Un dialogo avviato con il creatore di Mooney (oggi in Intesa Sanpaolo) ha confermato che questo è un problema attuale e significativo nel settore bancario — un segnale di mercato che valida la direzione strategica di OpenSelf.

### La soluzione

**OpenSelf** è una piattaforma di identità professionale digitale che trasforma una conversazione in una pagina professionale vivente e un profilo progressivamente verificato. L'utente non compila moduli: parla — a voce o via chat — e un agente AI con memoria episodica a quattro livelli estrae fatti, competenze, esperienze e tratti identitari, componendo una pagina personalizzata con 19 tipologie di sezione, quattro template di layout e un sistema di identità visiva proprietario (Presence System). Cinque connettori (GitHub, LinkedIn, RSS/Atom, Spotify, Strava) alimentano la pagina in modo continuo; un processo autonomo a tre livelli mantiene il profilo coerente e aggiornato senza intervento dell'utente.

L'arricchimento del profilo è progressivo e trasparente: il livello L1 (auto-dichiarato) cattura le informazioni dalla conversazione; il livello L2 (verificato da connettori) conferma e arricchisce le dichiarazioni con dati provenienti da fonti esterne. Il Fact Clustering con 14 identity matcher categoriali unifica automaticamente le informazioni da fonti diverse — "Python" menzionato in conversazione e presente nei repository GitHub diventa un singolo fatto verificato da due fonti indipendenti. Il livello Portfolio+ introduce badge verificati e la generazione di un dossier professionale PDF con indicazione delle fonti di verifica per ciascun dato.

La privacy è un vantaggio competitivo strutturale: l'utente possiede i propri dati, il modello SaaS garantisce la sostenibilità senza monetizzare le informazioni personali, e l'architettura è conforme fin dalla progettazione al GDPR e all'AI Act europeo.

### L'opportunità di mercato

Il mercato globale del personal branding digitale vale circa EUR 5 miliardi (TAM), con un segmento europeo accessibile di circa EUR 1,2 miliardi (SAM). Quattro macro-trend convergono a favore di OpenSelf: la frammentazione dell'identità digitale, l'esplosione del lavoro indipendente (43 milioni di gig worker europei, di cui circa 5-8 milioni in attività a contenuto intellettuale e professionale), la democratizzazione dell'AI generativa e l'inasprimento normativo sulla privacy dei dati. A questi si aggiunge il crescente deficit di fiducia nell'economia digitale, che crea domanda per soluzioni di credibilità verificata — un'opportunità di mercato che OpenSelf è architetturalmente predisposto a servire. L'Italia — con 3,5 milioni di partite IVA, di cui circa 2 milioni in settori rilevanti — rappresenta il mercato di ingresso ideale prima dell'espansione europea.

L'obiettivo a tre anni (SOM scenario base) è di 5.000 utenti registrati, 400 utenti paganti (350 Pro + 50 Portfolio+) e un run-rate ARR di circa EUR 27.000. L'obiettivo di EUR 120.000+ ARR è un'aspirazione a 5+ anni, raggiungibile con l'espansione europea (8 lingue già operative) e l'introduzione di tier a maggiore valore aggiunto.

### Trazione attuale

OpenSelf non è un'idea: è un prodotto funzionante, in produzione all'indirizzo **openself.dev** su infrastruttura Hetzner (Helsinki). L'intero sistema è stato progettato, sviluppato e testato da un singolo fondatore utilizzando strumenti AI (Claude, ChatGPT, Gemini) come team di sviluppo augmentato. A oggi conta oltre 3.077 test automatizzati (287 file), 5 connettori attivi con doppio risultato (fatti + eventi episodici), supporto nativo per 8 lingue, un sistema di memoria a 4 livelli (a breve termine, riassuntiva, meta-memoria, episodica), Journey Intelligence a 6 stati con 11 situazioni, 35 migrazioni di database, Fact Clustering con 14 identity matcher per deduplicazione multi-sorgente, Content Curation a due livelli, Activity Feed e sistema di greeting concierge. I livelli L1 (auto-dichiarato) e L2 (verificato da connettori) sono già operativi. Questo livello di maturità tecnica — raggiunto in settimane, non anni — dimostra empiricamente la tesi centrale del progetto: un singolo fondatore con competenze ibride e padronanza degli strumenti AI può produrre risultati paragonabili a quelli di un team di 3-5 sviluppatori tradizionali.

### Modello di business

Modello freemium SaaS con tre livelli di pricing progressivo:

| | **Free** | **Pro** | **Portfolio+** |
|--|----------|---------|----------------|
| **Prezzo** | EUR 0/mese | EUR 4,99/mese o EUR 49,99/anno | EUR 9,99/mese o EUR 99,99/anno |
| Conversazione AI | Inclusa (limiti mensili) | Illimitata | Illimitata |
| Connettori | 2 | Tutti (5+) | Tutti (5+) |
| Memoria | Tier 1-2 | Tier 1-4 completa | Tier 1-4 completa |
| Dominio custom | — | Incluso | Incluso |
| Worker autonomo | — | Incluso | Incluso |
| Content Curation | — | Inclusa | Inclusa + prioritaria |
| Badge verificati (L2) | — | — | Inclusi |
| Dossier professionale PDF | — | — | Incluso |

Il piano Free è genuinamente utile (conversazione, pagina base, 2 connettori). Il piano Pro sblocca l'esperienza completa. Il piano Portfolio+ aggiunge credibilità verificata con badge e dossier professionale. Economia unitaria obiettivo: margine lordo del 91% sul piano Pro, grazie a un'architettura ottimizzata per il costo computazionale (routing multi-provider, memorizzazione aggressiva, elaborazione asincrona).

### Il fondatore

**Tommaso Maria Rinversi** porta un profilo unico che combina rigore analitico, visione strategica e capacità tecnica: oltre 7,5 anni in Financial Analytics presso CDP — Cassa Depositi e Prestiti (il principale istituto nazionale di promozione italiano), MBA candidate presso LUISS Business School (Roma), alumnus LUISS e Deutsche Schule Rom, esperienza in consulenza strategica (KPMG) e istituzioni europee (Commissione Europea). Sviluppatore con competenza AI nativa, utilizza Claude Max, ChatGPT Plus e Gemini Pro come team di sviluppo augmentato, con risultati dimostrabili (oltre 3.077 test, prodotto in produzione). Multilingue: italiano (nativo), tedesco e inglese (full professional), francese (working), cinese e spagnolo (elementary). Ha avviato un dialogo con il creatore di Mooney (oggi in Intesa Sanpaolo) che ha confermato la domanda di mercato per soluzioni di identità digitale verificata nel settore bancario.

### La richiesta

Si richiede il contributo a fondo perduto Pre-Seed 3.0 di Lazio Innova (EUR 145.000) per l'esecuzione del piano a 18 mesi, con l'obiettivo di raggiungere 1.250 utenti registrati e 100 utenti paganti entro il diciottesimo mese (Pro + Portfolio+), avviare l'espansione europea (8 lingue già operative), e posizionare OpenSelf come piattaforma leader in Europa per l'identità professionale digitale.

### La visione

OpenSelf non è un page builder: è il fondamento dell'identità professionale digitale nell'era dell'AI. La visione è un percorso progressivo: dalla pagina professionale vivente generata dalla conversazione (attuale e operativo), all'arricchimento progressivo del profilo con badge verificati da fonti esterne (operativo), fino alla certificazione dell'identità digitale professionale integrando credenziali istituzionali (SPID, CIE) e dati finanziari (Open Banking) tramite partner certificati. L'evoluzione verso la certificazione dell'identità digitale è la direzione strategica post-Series A, validata dal dialogo con operatori del settore bancario. Il piano attuale costruisce le fondamenta tecniche e la base utenti necessarie per rendere questa evoluzione possibile.

---

## 2. Il Problema e l'Opportunità di Mercato

### 2.1 Il problema: l'identità digitale professionale è frammentata, statica, inadeguata — e non verificabile

#### Problema A — La frammentazione della presenza online

Ogni professionista oggi gestisce — o più spesso trascura — la propria presenza online attraverso una costellazione di piattaforme disconnesse: LinkedIn per il network, GitHub per il codice, Behance per il design, un portfolio statico costruito anni fa e mai aggiornato, profili social che catturano frammenti ma non l'identità complessiva. Il risultato è triplice:

**Frammentazione.** Le informazioni professionali sono distribuite su 5-15 piattaforme diverse, ciascuna con formati proprietari, aggiornamenti manuali e nessuna interoperabilità. Il professionista è costretto a mantenere una presenza coerente su ognuna — un compito che la stragrande maggioranza abbandona dopo poche settimane.

**Staticità.** I portfolio tradizionali e le pagine personali sono fotografie scattate in un momento preciso. Non riflettono la crescita, i nuovi progetti, le competenze acquisite, i cambiamenti di direzione. Il 72% dei portfolio professionali non viene aggiornato per più di sei mesi dopo la creazione (LinkedIn Talent Insights, 2023).

**Inadeguatezza rispetto alle aspettative del mercato.** Il mercato del lavoro ha già superato il CV tradizionale: il **78% dei recruiter** utilizza i social media per valutare i candidati (CareerBuilder, 2023), il **54%** ha scartato un candidato per una presenza online insufficiente o incoerente (The Muse, 2023), e il **67%** dei decision-maker dichiara di formarsi un'opinione sulla competenza di un professionista prima del primo contatto diretto, sulla base della sua presenza digitale (HubSpot Professional Survey, 2023).

#### Problema B — Il deficit di fiducia nell'economia dei lavori indipendenti

Il problema va oltre la presentazione. I professionisti indipendenti — freelancer, consulenti, gig worker — non possono dimostrare la propria credibilità in modo strutturato e verificabile. Chi apre un conto bancario dedicato alla propria attività, cerca un affitto in una nuova città, o si propone a un nuovo cliente, deve affidarsi a documentazione frammentaria e autodichiarazioni non verificabili.

Il deficit di fiducia ha dimensioni sistemiche:

- La frode digitale nel settore bancario europeo costa **EUR 5,8 miliardi all'anno** (European Banking Authority, 2024).
- Il **67% delle banche** riporta un aumento dei tentativi di frode nella creazione di conti e nell'onboarding digitale (EBA Report, 2024).
- L'apertura di un conto bancario per freelancer richiede documentazione eccessiva e processi di verifica manuali che costano alle banche **EUR 50-200 per cliente** in KYC (Know Your Customer).
- I gig worker non dispongono di una reputazione professionale portabile: le valutazioni ottenute su una piattaforma non sono trasferibili altrove.

Il dialogo avviato con il creatore di Mooney (oggi in Intesa Sanpaolo) ha confermato che la frode nella creazione di conti bancari è un problema attuale e significativo — un segnale di mercato che valida l'intuizione che i profili professionali arricchiti e progressivamente verificati possano evolvere naturalmente verso credenziali di identità digitale verificata.

### 2.2 Macro-trend convergenti

#### Trend 1 — La frammentazione dell'identità digitale

Il professionista medio utilizza oggi 7,4 piattaforme per la propria presenza online (Hootsuite Digital Report, 2024). Questa frammentazione genera costi di manutenzione crescenti e incoerenza tra le diverse rappresentazioni della stessa persona. La domanda di una soluzione unificante — un riferimento unico dell'identità professionale — è in crescita esponenziale.

#### Trend 2 — L'esplosione del lavoro indipendente

L'Europa conta **43 milioni di gig worker** (Eurostat, 2024), di cui circa 5-8 milioni in attività a contenuto intellettuale e professionale che beneficiano di una presenza online strutturata, un dato in crescita del 12% annuo. In Italia, le partite IVA attive superano i **3,5 milioni** (ISTAT, 2024), di cui circa **2 milioni in settori ATECO J (informazione), M (professioni), R (arte/intrattenimento)**, con una concentrazione crescente in queste aree. Per questi professionisti, la presenza online non è complementare al lavoro: *è* il canale di acquisizione organica di clienti.

#### Trend 3 — La democratizzazione dell'AI generativa

L'intelligenza artificiale generativa ha abbattuto le barriere alla creazione di contenuti, ma ha contemporaneamente creato un paradosso: se tutti possono generare testi e immagini, il differenziatore diventa l'autenticità. OpenSelf risolve questo paradosso utilizzando l'AI non per generare contenuti generici, ma per estrarre e strutturare l'identità unica di ogni individuo attraverso la conversazione.

#### Trend 4 — L'inasprimento normativo e il vantaggio privacy-first

Il GDPR (2018), il Digital Services Act (2023) e l'AI Act europeo (2024) stanno ridisegnando il panorama competitivo a favore delle soluzioni privacy-by-design. Le piattaforme che monetizzano i dati degli utenti affrontano costi di compliance crescenti. OpenSelf, progettato fin dal primo giorno con un modello in cui l'utente possiede i propri dati, è nativamente conforme e trasforma la compliance in vantaggio competitivo.

#### Trend 5 — Il deficit di fiducia nell'economia digitale

La frode digitale costa al settore bancario europeo EUR 5,8 miliardi all'anno. Il 67% delle banche riporta un aumento dei tentativi di frode (EBA Report, 2024). eIDAS 2.0 e l'EUDI Wallet (European Digital Identity Wallet) sono la risposta istituzionale a questo deficit di fiducia sistemico — ogni cittadino europeo disporrà di un portafoglio di identità digitale entro il 2027. Il mercato si muove verso l'identità digitale verificata: OpenSelf è posizionato per evolvere naturalmente in questa direzione, complementando le credenziali istituzionali (*chi sei*) con la rappresentazione professionale verificata (*cosa sai fare*).

### 2.3 Dimensione del mercato

| Livello | Valore stimato | Definizione |
|---------|---------------|-------------|
| **TAM** | ~EUR 5 miliardi | Mercato globale del personal branding digitale e dei professional presence tools. Stima basata sull'aggregazione dei segmenti website builder personale (Grand View Research, 2024), link-in-bio/creator tools, e digital portfolio — categorie in rapida convergenza. |
| **SAM** | ~EUR 1,2 miliardi | Mercato europeo — professionisti, freelance e gig worker con necessità di presenza online |
| **SOM** | ~EUR 27.000 ARR (scenario base, Anno 3) | Obiettivo a 3 anni — penetrazione Italia + early adoption EU |

Il SOM è presentato su tre scenari:

| Scenario | Utenti registrati (Anno 3) | Utenti paganti | Mix | Run-rate ARR |
|----------|---------------------------|----------------|-----|-------------|
| **Pessimistico** | 2.500 | 200 | 175 Pro + 25 Portfolio+ | ~EUR 13.500 |
| **Base** | 5.000 | 400 | 350 Pro + 50 Portfolio+ | ~EUR 27.000 |
| **Ottimistico** | 10.000 | 800 | 700 Pro + 100 Portfolio+ | ~EUR 54.000 |

**Validazione bottom-up:** 2 milioni di partite IVA rilevanti × 0,25% raggiungibili in 3 anni = 5.000 × 8% conversione = 400 utenti paganti × ARPU medio ponderato EUR 67/anno (87,5% Pro a EUR 59,88 + 12,5% Portfolio+ a EUR 119,88) = ~EUR 27.000 — coerente con lo scenario base.

L'obiettivo di EUR 120.000+ ARR è un'aspirazione a 5+ anni, raggiungibile con l'espansione europea (8 lingue pronte), l'introduzione del tier Pro+ Coach (EUR 14,99/mese) e la crescita della base utenti oltre i confini italiani. Non è un target triennale.

### 2.4 Segmenti di clientela

#### Segmento A — Freelance e consulenti (priorità alta)

| Caratteristica | Dettaglio |
|----------------|-----------|
| Dimensione Italia | 3,5 milioni di partite IVA (di cui ~2 milioni in settori ATECO J, M, R) |
| Esigenza critica | Acquisizione clienti: la presenza online è il principale canale di acquisizione organica di clienti |
| Disponibilità a pagare | EUR 5-15/mese |
| Canale di acquisizione | Community professionali, LinkedIn, passaparola, content marketing |

#### Segmento B — Professionisti in transizione di carriera (priorità alta)

| Caratteristica | Dettaglio |
|----------------|-----------|
| Dimensione Europa | 12 milioni di transizioni/anno (Eurostat, 2023) |
| Esigenza critica | Necessità urgente e temporanea di visibilità professionale aggiornata |
| Disponibilità a pagare | EUR 3-6/mese |

#### Segmento C — Creativi e professionisti tech (priorità media)

| Caratteristica | Dettaglio |
|----------------|-----------|
| Dimensione Europa | 8,5 milioni (Eurostat Creative Economy, 2023) |
| Esigenza critica | Portfolio che mostri competenze trasversali, non solo output |
| Disponibilità a pagare | EUR 6-15/mese |

#### Segmento D — Professionisti con necessità di credibilità verificata (priorità media)

| Caratteristica | Dettaglio |
|----------------|-----------|
| Dimensione Europa | Sottoinsieme dei segmenti A-C: freelancer internazionali, gig worker, professionisti in transizione |
| Esigenza critica | Dimostrare competenza e affidabilità a banche, proprietari immobiliari, nuovi clienti |
| Disponibilità a pagare | EUR 10-15/mese |
| Canale di acquisizione | Referral da professionisti soddisfatti, community di freelancer internazionali, SEO su query "portfolio verificato" |

Questo segmento valorizza particolarmente i badge verificati e il dossier professionale PDF del livello Portfolio+. La necessità è concreta e misurabile: un freelancer che apre un conto bancario, un consulente che si presenta a un nuovo cliente estero, un professionista in transizione che deve dimostrare credibilità senza il supporto di un'organizzazione.

### 2.5 Perché l'Italia — e perché ora

L'Italia rappresenta il mercato di ingresso ideale per cinque ragioni convergenti:

1. **Massa critica di professionisti indipendenti.** Con 3,5 milioni di partite IVA (di cui circa 2 milioni in settori ATECO J, M, R) e una crescita del lavoro autonomo superiore alla media europea.

2. **Gap digitale come opportunità.** Il 62% dei professionisti italiani non dispone di una presenza online strutturata oltre LinkedIn (stima interna basata su analisi del mercato).

3. **Ecosistema di supporto maturo.** Roma e il Lazio offrono un ecosistema startup in rapida maturazione: LUISS EnLabs, CDP Venture Capital SGR, Lazio Innova, Smart&Start Italia. Il fondatore è radicato in questo ecosistema: residente a Roma, alumnus LUISS, professionista CDP da oltre sette anni.

4. **Vantaggio normativo.** L'Italia, con il Garante Privacy tra i più attivi d'Europa, ha creato un contesto culturale in cui la privacy è un valore percepito dal consumatore.

5. **Trampolino verso l'Europa e oltre.** L'architettura di OpenSelf è globale fin dal primo giorno: supporto nativo per **8 lingue**, localizzazione completa, infrastruttura cloud-agnostic. La strategia "Italy-first, Europe-second, global-ready" consente di validare il modello in un mercato domestico accessibile, per poi scalare verso i mercati germanofoni, francofoni e anglosassoni.

### 2.6 Panorama competitivo

| Dimensione | LinkedIn | About.me | Linktree | Website Builder (Wix, Squarespace) | **OpenSelf** |
|------------|----------|----------|----------|-------------------------------------|-------------|
| Personalizzazione | Formato unico per tutti | Limitata | Limitata | Alta ma manuale | **AI-driven, conversazionale** |
| Aggiornamento | Manuale | Manuale | Manuale | Manuale | **Autonomo (worker + connettori)** |
| Privacy dati | Piattaforma possiede i dati | Piattaforma possiede i dati | Piattaforma possiede i dati | Piattaforma possiede i dati | **Utente possiede i dati** |
| Costo | Free / EUR 30+/mese (Premium) | Free / EUR 5-22/mese | Free / EUR 5-22/mese | EUR 11-37/mese | **Free / EUR 4,99-9,99/mese** |
| AI nativa | No | No | No | Parziale | **Core architecture** |
| Multi-source | No | Aggregazione link | Aggregazione link | No | **5 connettori con dedup** |
| Lingue | Interfaccia multilingue | Inglese-centrico | Inglese-centrico | Parziale | **8 lingue (contenuto + UI)** |
| Credibilità verificata | Auto-dichiarato | No | No | No | **L1+L2 con 14 matcher, dossier PDF** |

#### Competitor diretti

| Competitor diretto | Focus | Utenti | AI | Aggiornamento autonomo | Credibilità verificata | Prezzo |
|---|---|---|---|---|---|---|
| **Linktree** | Link-in-bio e micro-landing | 50M+ | No | Manuale | No | Free / EUR 5-22/mese |
| Read.cv | Portfolio moderno per dev/designer | Community attiva | No | Manuale | No | Free / EUR 7/mese |
| Polywork | "Living professional page" | Finanziato (Series A) | No | Manuale | No | Free / EUR 7/mese |
| Contra | Portfolio + marketplace freelancer | Marketplace integrato | No | Manuale | No | Free |
| Bento.me | Link-in-bio evoluto | Crescita rapida | No | Manuale | No | Free / EUR 4/mese |
| Carrd | Sito personale minimal | Milioni di utenti | No | Manuale | No | Free / EUR 1,50/mese |
| Beacons.ai | Link-in-bio con AI per creator | Funding, AI features | Parziale (bio gen) | Manuale | No | Free / EUR 9/mese |

#### Servizi di identità adiacenti

| Servizio | Funzione | Sovrapposizione con OpenSelf |
|----------|----------|------------------------------|
| SPID / CIE | Autenticazione identità anagrafica | Nessuna — autenticano *chi sei*, non rappresentano *cosa sai fare* |
| EUDI Wallet (2027) | Portafoglio identità digitale EU | Complementare — OpenSelf consuma credenziali EUDI come input L3 (direzione strategica) |

Il vantaggio di OpenSelf rispetto a questi competitor diretti non è in una singola funzionalità, ma nell'integrazione di memoria persistente a 4 livelli, aggiornamento autonomo via worker e connettori, composizione AI personalizzata, e arricchimento progressivo del profilo con verifica multi-sorgente — un sistema che nessun competitor offre oggi.

---

## 3. La Soluzione

### 3.1 Panoramica del prodotto

OpenSelf è una piattaforma SaaS che genera, mantiene e aggiorna autonomamente la pagina professionale di un individuo a partire da una conversazione naturale, e costruisce progressivamente un profilo professionale verificato. Il prodotto è **live e funzionante** all'indirizzo **openself.dev**, in produzione su infrastruttura Hetzner (Helsinki, Finlandia).

L'architettura si fonda su un principio radicale: **conversation-first, not form-first** (prima la conversazione, non il modulo). L'utente non seleziona template, non compila campi, non carica documenti. Parla — a voce tramite Speech-to-Text o via chat testuale — e un agente AI dotato di memoria persistente a quattro livelli, 25 strumenti operativi e un sistema di Journey Intelligence a 6 stati costruisce progressivamente una rappresentazione professionale ricca, coerente, personalizzata e progressivamente verificata.

### 3.2 Architettura funzionale

#### 3.2.1 Memoria a quattro livelli

OpenSelf implementa un sistema di memoria a quattro livelli, analogo all'architettura della memoria umana (semantica, di lavoro, metacognitiva, episodica). Questa architettura è descritta in dettaglio nella Sezione 4.2, Innovazione 1.

#### 3.2.2 Connettori e aggiornamento autonomo

| Connettore | Autenticazione | Dati importati |
|------------|---------------|----------------|
| **GitHub** | OAuth | Repository, linguaggi, contributi. Eventi episodici per nuovi repository. |
| **LinkedIn** | Upload archivio ZIP | Esperienze, formazione, certificazioni, competenze. |
| **RSS / Atom** | URL diretto | Articoli pubblicati. Protezione SSRF integrata. |
| **Spotify** | OAuth | Gusti musicali. Rilevamento taste-shift per eventi episodici. |
| **Strava** | OAuth | Attività sportive, statistiche, record personali. |

Ogni connettore implementa il pattern a **doppio risultato**: genera sia fatti strutturati (Tier 1) sia eventi episodici (Tier 4). Il **Fact Clustering** con 14 identity matcher deduplica automaticamente le informazioni da fonti multiple.

#### 3.2.3 Presence System — Identità visiva

| Asse | Funzione | Opzioni |
|------|----------|---------|
| **Surface** | Texture e materialità del canvas | Canvas, Clay, Archive |
| **Voice** | Tipografia e ritmo comunicativo | Signal, Narrative, Terminal |
| **Light** | Palette cromatica e atmosfera | Day, Night |

Le combinazioni producono **firme visive distintive** senza richiedere alcuna competenza di design.

#### 3.2.4 Worker autonomo a tre livelli

Il worker opera senza intervento dell'utente e senza richiedere che l'utente sia online, su tre livelli (housekeeping, giornaliero, settimanale). La pagina si mantiene viva e aggiornata anche se l'utente non interagisce per settimane. Il dettaglio è nella Sezione 4.2, Innovazione 3.

### 3.3 Caso d'uso: il percorso di Marco

Marco è un consulente freelance di Roma, 34 anni, specializzato in data analytics.

**Minuto 0-5 — Prima conversazione.** Marco apre openself.dev e inizia a parlare (usa il microfono grazie al supporto Speech-to-Text). L'agente estrae 15 fatti strutturati e genera una pagina completa con bio, esperienze, competenze e interessi.

**Minuto 5-10 — Connettori.** Marco collega GitHub (OAuth) e incolla il suo feed RSS. I connettori importano repository e articoli. Il Fact Clustering riconosce che "Python" appare sia nella conversazione sia su GitHub e unifica le due fonti.

**Settimana 2 — Aggiornamento autonomo.** Il worker ha sincronizzato un nuovo articolo dal feed RSS, rilevato un nuovo repository GitHub, generato una proposta di curation, e il Dream Cycle (ciclo di consolidamento) ha identificato un pattern di pubblicazione regolare.

**Mese 3 — Valore cumulativo.** La pagina è aggiornata, coerente e ricca. Il sistema ha accumulato 85 fatti, 12 eventi episodici, 3 meta-memorie. Marco non ha mai aperto un editor o compilato un form.

**Mese 6 — Credibilità professionale.** Marco deve aprire un conto bancario dedicato alla sua attività freelance. Il suo profilo OpenSelf mostra badge "GitHub Verificato" e "Pubblicazioni Verificate" (L2). Genera un dossier professionale PDF dal suo profilo e lo presenta alla banca insieme alla documentazione standard. Il profilo arricchito — con storia verificata dei progetti, competenze confermate dai connettori, e pattern di attività professionale — offre alla banca un quadro più completo di quanto un estratto conto e una dichiarazione dei redditi possano fornire. Marco non ha bisogno di un intermediario: controlla i propri dati e decide cosa condividere.

### 3.4 Piani e pricing

| | **Free** | **Pro** | **Portfolio+** |
|--|----------|---------|----------------|
| **Prezzo** | EUR 0/mese | EUR 4,99/mese o EUR 49,99/anno | EUR 9,99/mese o EUR 99,99/anno |
| **Disponibilità** | Sempre | Generale | Generale |
| Conversazione AI | Inclusa (limiti mensili) | Illimitata | Illimitata |
| Connettori | 2 | Tutti (5+) | Tutti (5+) |
| Memoria | Tier 1-2 | Tier 1-4 completa | Tier 1-4 completa |
| Dominio custom | — | Incluso | Incluso |
| Worker autonomo | — | Incluso | Incluso |
| Content Curation | — | Inclusa | Inclusa + prioritaria |
| Badge verificati (L2) | — | — | Inclusi |
| Dossier professionale PDF | — | — | Incluso |

### 3.5 Privacy come vantaggio competitivo strutturale

| Principio | Implementazione |
|-----------|-----------------|
| **Proprietà dei dati** | L'utente è proprietario dei propri dati. Il modello di business è la sottoscrizione, non la vendita di informazioni personali. |
| **Minimizzazione** | Nessun tracciamento comportamentale, nessuna profilazione per advertising. |
| **Trasparenza AI** | Garanzia di veridicità degli strumenti: l'AI non può dichiarare azioni non eseguite. Meccanismo di proposal-and-review per modifiche sensibili. |
| **Conformità nativa** | Conforme fin dalla progettazione al GDPR, al Digital Services Act e all'AI Act europeo. |
| **Disconnessione e purge** | Ogni connettore può essere disconnesso con purge atomica di tutti i dati importati. |

### 3.6 Arricchimento progressivo del profilo

L'arricchimento del profilo è progressivo e trasparente: l'utente non compila form di verifica. Semplicemente collegando i propri account professionali e parlando con l'agente, il profilo accumula evidenze verificabili.

| Livello | Fonte | Esempio | Stato |
|---------|-------|---------|-------|
| **L1 — Auto-dichiarato** | Conversazione con l'agente AI | "Sono un consulente data analytics con 8 anni di esperienza" | Operativo |
| **L2 — Verificato da connettori** | GitHub, LinkedIn, RSS, Spotify, Strava | Repository attivi confermano competenze dichiarate; pubblicazioni verificano expertise | Operativo |

Il Fact Clustering con 14 identity matcher categoriali unifica automaticamente le informazioni da fonti diverse — ad esempio, "Python" menzionato in conversazione e presente nei repository GitHub diventa un singolo fatto verificato da due fonti indipendenti. La priorità per sorgente (utente > chat > worker > connettore) garantisce che le dichiarazioni dell'utente prevalgano quando sono confermate da fonti esterne, e che le informazioni dai connettori arricchiscano il profilo senza sovrascrivere l'autodichiarato.

### 3.7 Dossier professionale verificato

Il livello Portfolio+ introduce la possibilità di generare un dossier professionale verificato: un documento PDF che aggrega le informazioni del profilo con indicazione delle fonti di verifica per ciascun dato. Il dossier è controllato dall'utente: sceglie quali informazioni includere, genera il documento, e lo condivide direttamente con banche, clienti o datori di lavoro. OpenSelf non agisce da intermediario né da garante — fornisce lo strumento per aggregare e presentare le proprie credenziali in modo strutturato e verificabile.

### 3.8 Architettura local-first come vantaggio competitivo

L'architettura local-first di OpenSelf — basata su SQLite con un file per identità — non è un compromesso tecnico: è una scelta architetturale precisa che allinea l'infrastruttura ai principi del prodotto:

- **1 file = 1 identità**: backup, export e portabilità dei dati sono operazioni banali (copia di un file)
- **Zero configurazione, zero server database**: riduce i costi operativi e i punti di vulnerabilità
- **Performance ottimale per single-user**: nessun overhead di concorrenza multi-tenant
- **Allineamento con la filosofia privacy-first**: i dati dell'utente sono fisicamente isolati

Il layer di astrazione (Drizzle ORM) garantisce portabilità futura verso PostgreSQL senza riscrittura della business logic. La migrazione — se necessaria per scenari di scala post-Series A — è un refactoring metodico del layer di persistenza, non una ricostruzione dell'architettura.

---

## 4. Innovatività del Progetto

### 4.1 Natura dell'innovazione

OpenSelf non è un website builder con un chatbot aggiunto. È un cambio di paradigma nell'interazione tra persona e presenza digitale: dalla compilazione manuale alla **conversazione come interfaccia primaria**, dalla pagina statica alla **pagina vivente** che si aggiorna autonomamente, dal formato unico per tutti alla **rappresentazione personale unica** generata dall'intelligenza artificiale, dalla pagina come presentazione alla **pagina come credenziale professionale progressivamente verificata**.

L'innovazione non risiede in una singola funzionalità ma nell'integrazione di undici innovazioni tecniche in un sistema coerente che nessun competitor ha mai tentato di assemblare.

### 4.2 Le undici innovazioni chiave

#### Innovazione 1 — Sistema di memoria a quattro livelli

| Livello | Funzione | Stato |
|---------|----------|-------|
| **Tier 1 — Facts** | Knowledge base strutturata con fatti immutabili, deduplicazione, clustering multi-sorgente | Operativo (120 fatti attivi per utente) |
| **Tier 2 — Summary** | Compattazione asincrona delle sessioni con meccanismi di protezione contro il sovraccarico | Operativo (audit tramite registro di compattazione) |
| **Tier 3 — Meta-Memory** | Preferenze comunicative con classificazione per attualità e provenienza, con decadimento a 14 giorni | Operativo (punteggio differenziato per agente e worker) |
| **Tier 4 — Episodic** | Ledger append-only con ricerca full-text, tracciamento della provenienza multi-sorgente, Dream Cycle (ciclo di consolidamento) | Operativo (6 sorgenti: chat, GitHub, LinkedIn, RSS, Spotify, Strava) |

Nessun competitor implementa più di un livello di memoria. La combinazione di quattro livelli — analoga all'architettura della memoria umana (semantica, di lavoro, metacognitiva, episodica) — consente all'agente di mantenere una rappresentazione dell'utente che si arricchisce nel tempo senza perdere contesto.

#### Innovazione 2 — Soul Profile con proposal-and-review

Il Soul Profile cattura l'identità vocale e comunicativa dell'utente — non solo *cosa* dice, ma *come* lo dice. L'agente non può modificare direttamente il Soul Profile: ogni modifica passa attraverso un meccanismo di proposal-and-review che richiede l'approvazione esplicita dell'utente. Questo garantisce che l'identità digitale resti sotto il controllo della persona, non dell'algoritmo.

#### Innovazione 3 — Worker autonomo a tre livelli (Heartbeat)

| Livello | Frequenza | Funzione |
|---------|-----------|----------|
| Global Housekeeping | Ogni ciclo (15 min) | Pulizia risorse orfane, recupero job bloccati, cleanup cluster |
| Light (Daily) | Giornaliero | Sincronizzazione connettori, compattazione sessioni, aggiornamento delta |
| Deep (Weekly) | Settimanale (gated: minimo 25 fatti) | Dream Cycle (ciclo di consolidamento), Content Curation, conformity check, consolidamento cluster |

Il worker opera senza intervento dell'utente e senza richiedere che l'utente sia online. La pagina si mantiene viva e aggiornata anche se l'utente non interagisce per settimane. Questo è il differenziatore strutturale rispetto a tutti i page builder esistenti.

#### Innovazione 4 — Cinque connettori con doppio risultato e Fact Clustering

Ogni connettore produce simultaneamente fatti strutturati (Tier 1) ed eventi episodici (Tier 4). Il **Fact Clustering** con 14 identity matcher categoriali deduplica automaticamente le informazioni provenienti da fonti diverse — ad esempio, "Python" menzionato nella conversazione e presente nei repository GitHub viene unificato in un singolo cluster con priorità per sorgente (utente > chat > worker > connettore).

Il pattern **first-sync baseline** previene il flooding della timeline: alla prima sincronizzazione vengono creati solo i fatti, non gli eventi episodici. Il pattern a **doppio risultato** consente la ricostruzione dell'evoluzione temporale del profilo — non solo *cosa* l'utente sa fare, ma *come* le sue competenze si sono sviluppate nel tempo.

#### Innovazione 5 — Motore di composizione ibrido a due stadi

| Stadio | Funzione | Approccio |
|--------|----------|-----------|
| **Stadio 1** | Skeleton deterministico | Algoritmo puro: mappa fatti verso sezioni, widget e layout |
| **Stadio 2** | Personalizzazione LLM per sezione | AI: arricchisce il testo mantenendo la coerenza con il Soul Profile |

La composizione avviene sempre nella lingua originale dei fatti, poi viene tradotta. Mai composizione diretta in lingua target — una scelta architetturale documentata (ADR) che previene il testo ibrido e garantisce coerenza linguistica.

#### Innovazione 6 — Memoria episodica con Dream Cycle (ciclo di consolidamento)

La memoria episodica è un ledger append-only di eventi significativi con ricerca full-text (FTS5). Il **Dream Cycle** (ciclo di consolidamento) settimanale — ispirato alla consolidazione della memoria durante il sonno — analizza gli eventi recenti alla ricerca di pattern comportamentali: pubblicazione regolare, impegno sportivo costante, taste-shift musicale. I pattern identificati vengono proposti all'utente come insight e, se confermati, diventano fatti strutturati che arricchiscono la pagina.

Il nome "Dream Cycle" non è casuale: come il sonno consolida i ricordi trasformandoli da episodi isolati a conoscenza strutturata, il worker di OpenSelf consolida gli eventi episodici in pattern significativi.

#### Innovazione 7 — Fact Clustering per deduplicazione multi-sorgente

Il **Fact Clustering** opera in due fasi: **in fase di scrittura** (ogni fatto nuovo viene confrontato con i cluster esistenti tramite 14 matcher categoriali specifici per tipo di informazione) e **in fase di lettura** (la proiezione unifica i cluster in fatti aggregati con fusione per campo e risoluzione della visibilità). Il sistema costituisce una sostituzione trasparente della lettura diretta dei fatti su tutti i percorsi di pagina (preview, pubblicazione, bozza, personalizzazione, rilevamento dello stato del percorso).

#### Innovazione 8 — Content Curation Layer a due livelli

| Livello | Meccanismo | Scopo |
|---------|-----------|-------|
| **Layer 1** | Override per singolo fatto con hash guard di integrità | Override editoriale per singolo elemento (titolo, descrizione, label) |
| **Layer 2** | Stato editoriale per sezione con tracciamento della sorgente | Copia editoriale per sezione — il personalizzatore LLM salta le sezioni curate dall'agente |

Lo strumento di curazione unificato rotta automaticamente tra curazione per elemento (se è specificato un fatto) e curazione per sezione (se non è specificato). Il worker di curazione genera proposte settimanali tramite il sistema di proposte esistente, senza sovrascrivere le curazioni dell'agente.

#### Innovazione 9 — Journey Intelligence

| Componente | Dettaglio |
|-----------|-----------|
| **Journey States** | 6 stati (first_visit, returning_no_page, draft_ready, active_fresh, active_stale, blocked) |
| **Situations** | 11 situazioni contestuali (profilo incompleto, proposte soul in sospeso, pattern episodici da confermare, ecc.) |
| **Expertise Levels** | 3 livelli (novice, familiar, expert) |
| **Policy System** | Componibile per stato — ogni stato ha una policy dedicata con fasi, flusso, limiti |

Il Journey Intelligence adatta il comportamento dell'agente alla fase del percorso dell'utente. Un utente alla prima visita riceve un'esperienza guidata e strutturata; un utente attivo con pagina pubblicata riceve suggerimenti proattivi di aggiornamento. Le policy sono componibili e documentate, non hardcoded nell'agente.

#### Innovazione 10 — Arricchimento progressivo dell'identità professionale

OpenSelf introduce un meccanismo conversazionale per la costruzione progressiva dell'identità professionale con verifica multi-sorgente automatica. Il livello L1 (auto-dichiarato) cattura le competenze e le esperienze dalla conversazione naturale con l'agente. Il livello L2 (verificato da connettori) conferma e arricchisce le dichiarazioni con dati provenienti da fonti esterne verificabili.

Il Fact Clustering unifica le informazioni da fonti multiple in cluster di identità con priorità per sorgente. Ogni cluster aggrega le informazioni provenienti da conversazione, connettori e worker, producendo un fatto proiettato che rappresenta la versione più completa e verificata di ogni informazione. Il risultato è un profilo che non solo *rappresenta* il professionista, ma *dimostra* le sue competenze con evidenze verificabili da fonti indipendenti.

Nessun competitor offre un meccanismo conversazionale per la costruzione progressiva dell'identità professionale con verifica multi-sorgente automatica.

#### Innovazione 11 — Dossier professionale verificato

Il livello Portfolio+ introduce la generazione di un documento PDF strutturato con indicazione delle fonti di verifica per ciascun dato. L'utente controlla quali informazioni includere e con chi condividere. A differenza dei CV tradizionali (auto-dichiarati, non verificabili), il dossier OpenSelf collega ogni dato alla sua fonte: GitHub per i progetti, LinkedIn per le esperienze, RSS per le pubblicazioni, conversazione per le competenze dichiarate. Il dossier non è un certificato — è un aggregato strutturato di evidenze verificabili che il professionista presenta direttamente, senza intermediari.

### 4.3 Tabella competitiva aggiornata

| Dimensione tecnica | LinkedIn | Linktree / About.me | Wix / Squarespace | **OpenSelf** |
|-------------------|----------|---------------------|-------------------|-------------|
| Memoria persistente | Nessuna | Nessuna | Nessuna | **4 livelli (facts, summary, meta, episodic)** |
| Aggiornamento autonomo | Manuale | Manuale | Manuale | **Worker a 3 livelli + 5 connettori** |
| Deduplicazione multi-sorgente | N/A | N/A | N/A | **Fact Clustering con 14 matcher** |
| Identità vocale adattiva | No | No | No | **Soul Profile con proposal-and-review** |
| Pattern recognition temporale | No | No | No | **Dream Cycle (ciclo di consolidamento)** |
| Curazione contenuti AI | No | No | Parziale (AI text) | **2 livelli (per elemento + per sezione)** |
| Composizione ibrida | No | No | Template statico | **Deterministico + LLM per sezione** |
| Journey Intelligence | No | No | No | **6 stati x 11 situazioni x 3 livelli** |
| Privacy by design | No (monetizza dati) | No | No | **Si (dati dell'utente, hosting EU)** |
| Credibilità verificata | Auto-dichiarato | No | No | **L1+L2 con 14 matcher, dossier PDF** |

### 4.4 Difendibilità dell'innovazione

La difendibilità di OpenSelf non è brevettuale — è architetturale. Il vantaggio competitivo risiede nell'integrazione di undici innovazioni in un sistema coerente che richiede mesi di sviluppo coordinato per essere replicato:

1. **Complessità di integrazione.** Ogni innovazione funziona in sinergia con le altre: il Dream Cycle (ciclo di consolidamento) dipende dalla memoria episodica, che dipende dai connettori, che dipendono dal Fact Clustering, che dipende dalla Knowledge Base. Replicare una singola funzionalità è possibile; replicare il sistema integrato richiede un investimento significativo.

2. **Effetto rete dati.** Ogni utente che usa OpenSelf arricchisce la propria knowledge base nel tempo. I fatti accumulati, i pattern episodici identificati, le curazioni validate — tutto contribuisce a un profilo che diventa più prezioso con l'uso. Il costo di migrazione verso un competitor cresce con il tempo di utilizzo.

3. **Documentazione come asset.** 17 Architecture Decision Records, ARCHITECTURE.md, CLAUDE.md, e oltre 3.077 test automatizzati costituiscono un corpo di conoscenza architetturale che consente onboarding rapido di nuovi collaboratori e continuità di sviluppo anche in caso di transizione.

4. **Vantaggio del primo arrivato nel segmento.** Nessun competitor offre oggi una soluzione conversation-first (prima la conversazione, non il modulo) con memoria persistente multi-livello, connettori a doppio risultato, e worker autonomo. Il primo a costruire una base utenti in questo segmento beneficia dell'effetto cumulativo dei dati accumulati.

5. **Evoluzione naturale verso la certificazione.** L'architettura a livelli (L1→L2→L3 futuro) posiziona OpenSelf per un'evoluzione naturale verso la certificazione dell'identità digitale, integrando credenziali istituzionali (SPID, CIE, Open Banking) tramite partner certificati quando il mercato e le risorse lo consentiranno.

Lo stato di sviluppo quantitativo è documentato nella Sezione 1 (Executive Summary) e nella Sezione 8 (Roadmap). I numeri chiave — 25 strumenti agente, 5 connettori operativi, 8 lingue, 14 identity matcher — attestano una maturità tecnica che supera ampiamente quanto richiesto per la validazione di mercato.

---

## 5. Il Team e le Competenze

### 5.1 Il fondatore

**Tommaso Maria Rinversi** — Fondatore, CEO, Sviluppatore Full-Stack

Tommaso porta un profilo professionale unico che combina competenze analitiche di livello enterprise, formazione economica avanzata, e capacità tecnica full-stack:

#### Esperienza professionale

| Periodo | Ruolo | Organizzazione | Competenze chiave |
|---------|-------|----------------|-------------------|
| Apr 2018 – presente (7,5+ anni) | Financial Analytics (Data, Automation & Decision Support) | **CDP — Cassa Depositi e Prestiti** | Analisi finanziaria su scala istituzionale, gestione dati complessi, automazione decisionale, reporting strategico |
| Feb 2016 – Apr 2018 | Consulente | **KPMG** | Consulenza strategica, project management, analisi di processo |
| Set 2015 – Feb 2016 | Stagista Blue Book | **Commissione Europea** (Bruxelles) | Istituzioni europee, policy making, contesto regolatorio EU |

#### Formazione

| Periodo | Titolo | Istituzione |
|---------|--------|-------------|
| Apr 2024 – in corso | **MBA** | LUISS Business School, Roma |
| 2013 – 2015 | **Laurea Magistrale** in Economia | LUISS Guido Carli, Roma (Tesi: "From MiFID I to MiFID II") |
| 2010 – 2013 | **Laurea Triennale** in Economia | LUISS Guido Carli, Roma |
| 2012 | **Exchange Program** | Hong Kong Baptist University |
| 1993 – 2010 | **Abitur + Maturità** | Deutsche Schule Rom (formazione bilingue italo-tedesca) |

#### Competenze linguistiche

| Lingua | Livello |
|--------|---------|
| Italiano | Nativo |
| Tedesco | Padronanza professionale completa |
| Inglese | Padronanza professionale completa |
| Francese | Competenza lavorativa |
| Cinese (Mandarino) | Elementare |
| Spagnolo | Elementare |

La competenza multilingue del fondatore non è solo un asset personale: è direttamente integrata nel prodotto. OpenSelf supporta 8 lingue fin dal primo giorno — una scelta architettonica informata dalla sensibilità del fondatore per la comunicazione interculturale.

#### Competenze tecniche rilevanti

Le competenze tecniche full-stack sono state sviluppate e dimostrate attraverso la costruzione di OpenSelf (2024-2026), a complemento del background analitico-quantitativo consolidato in oltre 7 anni di esperienza enterprise (Python, Machine Learning, Data Analysis, Power BI, Tableau, database design). La disciplina nel data modeling e nella qualità del dato acquisita in CDP informa direttamente l'architettura multi-tier di memoria e il motore di composizione deterministico di OpenSelf.

La competenza finanziaria del fondatore è direttamente rilevante per l'evoluzione strategica di OpenSelf verso l'identità professionale verificata: oltre 7,5 anni in CDP — Cassa Depositi e Prestiti (il principale istituto nazionale di promozione italiano) forniscono una comprensione diretta delle dinamiche del settore bancario-finanziario, dei requisiti di compliance, e delle esigenze di verifica dell'identità.

- **Sviluppo full-stack** (sviluppato su OpenSelf): TypeScript, Next.js (App Router), React, Node.js
- **Data & Analytics** (background enterprise): Python, Machine Learning, Data Analysis, Power BI, Tableau, Econometrics
- **Database**: SQLite (Drizzle ORM), progettazione schema, 35 migrazioni
- **AI/LLM**: Vercel AI SDK, prompt engineering avanzato, orchestrazione multi-provider, Extended Thinking
- **DevOps**: Docker, Coolify, Hetzner Cloud, CI/CD
- **Architettura software**: ADR, test-driven development, oltre 3.077 test automatizzati (287 file)
- **Certificazioni**: PRINCE2 Foundation, GMAT 620

#### Validazione di mercato

Il fondatore ha avviato un dialogo con il creatore di Mooney (oggi in Intesa Sanpaolo), che ha confermato che la frode nella creazione di conti bancari è un problema attuale e significativo nel settore. Questo confronto ha validato l'intuizione che i profili professionali arricchiti di OpenSelf possano evolvere naturalmente verso credenziali di identità digitale verificata — una direzione strategica che il prodotto è già architetturalmente predisposto a supportare.

### 5.2 Il modello di sviluppo potenziato dall'AI

OpenSelf è sviluppato utilizzando un modello operativo innovativo: il **fondatore singolo potenziato dall'AI**. Il fondatore orchestra tre strumenti AI come team di sviluppo aumentato:

| Strumento | Costo mensile | Ruolo nel flusso di lavoro |
|-----------|--------------|-------------------|
| **Claude Max** (Anthropic) | ~EUR 90/mese | Sviluppo core, architettura, code review, debugging, planning |
| **ChatGPT Plus** (OpenAI) | ~EUR 20/mese | Brainstorming, design thinking, analisi alternative, documentazione |
| **Gemini Pro** (Google) | ~EUR 20/mese | Validazione cross-model, code review indipendente, ricerca |

**Costo totale: ~EUR 130/mese = ~EUR 1.560/anno**

Questo investimento produce output equivalente a un team di 3-5 sviluppatori tradizionali. Il risultato è dimostrato empiricamente: 19 tipologie di sezione, 5 connettori a doppio risultato, 35 migrazioni database, quattro template di layout, 17 Architecture Decision Records, 8 lingue con localizzazione completa — tutto prodotto da un singolo fondatore con strumenti AI dal costo di EUR 130/mese. Il modello potenziato dall'AI non è solo efficiente dal punto di vista dei costi: è un validatore in tempo reale della tesi di prodotto di OpenSelf. Se un singolo fondatore può costruire un prodotto di questa complessità utilizzando strumenti AI, allora gli strumenti AI hanno raggiunto un livello di maturità tale da abilitare una nuova categoria di prodotti costruiti su di essi.

### 5.3 Piano di crescita del team

La crescita del team è strettamente vincolata al raggiungimento di milestone di ricavo. Nessuna assunzione avviene prima che i ricavi la giustifichino.

| Fase | Periodo | Team | Trigger |
|------|---------|------|---------|
| **Fase 0-1** | M1-M9 | Fondatore singolo + consulenti a progetto (design, legal, fiscale) | Nessuno — validazione con risorse minime |
| **Fase 2** | M10-M18 | + 1 sviluppatore full-stack senior (o collaboratore esterno) | MRR >= EUR 400, ~100 utenti paganti |
| **Fase 3** | M19-M24 | + 1 frontend/design + 1 customer success (part-time) | MRR >= EUR 800, 140+ utenti paganti |

### 5.4 Consiglio consultivo

Il fondatore ha avviato i contatti con potenziali consiglieri tecnici e di business nell'ecosistema LUISS e startup romano. Il consiglio consultivo sarà costituito entro M+3 dalla costituzione dell'SRLS, con 3-4 persone con competenze complementari:

- **Consigliere tecnico/AI**: esperto di architetture LLM in produzione, per validazione delle scelte architetturali e mentoring tecnico
- **Consigliere business/startup**: fondatore o dirigente con esperienza in SaaS B2C, per validazione della strategia di accesso al mercato e strategie di prezzo
- **Consigliere ecosistema**: figura connessa all'ecosistema startup romano/italiano (LUISS, Lazio Innova, CDP Venture Capital) per facilitazione di partnership e accesso a network
- **Consigliere compliance/identità**: esperto di regolamentazione eIDAS, GDPR e identità digitale, per guidare l'evoluzione strategica verso la certificazione (post-Series A)

### 5.5 Ecosistema e network

Il fondatore è inserito in un ecosistema professionale e accademico che costituisce un asset strategico per OpenSelf:

| Network | Valore per OpenSelf |
|---------|---------------------|
| **LUISS** (alumnus + MBA) | Accesso a rete alumni, potenziali beta tester qualificati, collaborazioni accademiche, incubatore LUISS EnLabs |
| **CDP — Cassa Depositi e Prestiti** | 7,5+ anni di esperienza istituzionale, comprensione del panorama finanziario italiano, credibilità professionale |
| **Commissione Europea** | Comprensione del contesto regolatorio EU (GDPR, AI Act, DSA), network istituzionale europeo |
| **KPMG** | Esperienza in consulenza strategica, capacità analitica e di project management |
| **Deutsche Schule Rom** | Network bilingue italo-tedesco, ponte naturale verso il mercato DACH (Germania, Austria, Svizzera) |
| **Ecosistema Roma/Lazio** | Lazio Innova, Talent Garden Roma, community tech locali, accesso a eventi e meetup |

### 5.6 Perché un fondatore singolo è un vantaggio in questa fase

La narrativa dominante nel mondo startup associa il successo a team cofondatori. Per OpenSelf, nella fase attuale, il modello fondatore singolo è una scelta strategica deliberata, non un vincolo:

1. **Velocità decisionale.** Nessun overhead di coordinamento, nessun conflitto tra cofondatori, nessun compromesso architetturale. Le 17 ADR dimostrano che le decisioni vengono prese con rigore ma senza burocrazia.

2. **Coerenza architetturale.** Un sistema con 11 innovazioni integrate richiede una visione architetturale unitaria. La coerenza del sistema — dalla memoria a 4 livelli al Dream Cycle al Fact Clustering — è il risultato di un singolo architetto con visione completa.

3. **Efficienza di capitale massima.** Il costo di sviluppo di OpenSelf fino a questo punto è stato di circa EUR 130/mese di strumenti AI + infrastruttura cloud. Nessun team tradizionale avrebbe potuto raggiungere lo stesso risultato con la stessa efficienza.

4. **Il modello scala quando serve.** Il piano prevede assunzioni progressive legate a milestone di ricavo. La transizione da fondatore singolo a team avviene quando il prodotto ha dimostrato riscontro prodotto-mercato — non prima. Questo protegge il capitale dal rischio più comune nelle startup early-stage: bruciare risorse prima della validazione.

---

## 6. Strategia di Accesso al Mercato e Trazione

### Principio guida: validazione prima di acquisizione

OpenSelf non investe in acquisizione a pagamento finché il prodotto non ha dimostrato capacità di fidelizzazione. I canali organici, le community di professionisti indipendenti e il passaparola diretto sono sufficienti per i primi 50 utenti beta — l'unico obiettivo della Fase 0.

### 6.1 Strategia di accesso al mercato

La strategia è strutturata in tre fasi sequenziali, ciascuna con obiettivi distinti e canali di acquisizione appropriati alla scala del momento. L'approccio è deliberatamente dal basso verso l'alto: partire da un mercato verticale ristretto (professionisti indipendenti italiani, con epicentro Roma e Lazio), dominarlo, poi espandersi.

**Fase 0 — Validazione (M1-M3): 50 utenti beta**
L'obiettivo non è la crescita numerica ma la qualità del segnale. 50 utenti selezionati manualmente, intervistati direttamente, che forniscono riscontro strutturato. Il canale principale è il network professionale del fondatore su LinkedIn e Twitter/X (@openself_dev), integrato da community italiane di professionisti indipendenti e sviluppatori. Un canale privilegiato è la rete alumni LUISS e la coorte MBA del fondatore — professionisti con un bisogno naturale di presenza online strutturata e una propensione elevata all'adozione di strumenti AI. L'ecosistema startup romano (Lazio Innova, LUISS EnLabs, Talent Garden Roma, spazi di coworking locali) offre un bacino accessibile di primi utilizzatori qualificati. Il costo di acquisizione in questa fase è essenzialmente zero: nessun budget dedicato al marketing, nessuna pubblicità, solo contatto diretto e personalizzato.

**Fase 1 — Lancio pubblico (M4-M9): 500 utenti**
Dopo la validazione, il lancio su Product Hunt e Indie Hackers rappresenta il primo momento di distribuzione massiva a costo zero. Il lancio viene preparato con una lista di contatti di almeno 200 persone costruita durante la beta. Il programma di invito viene attivato al momento del lancio Pro: ogni utente che porta un utente pagante ottiene un mese gratuito — un incentivo autofinanziato. La SEO viene alimentata con contenuti organici (guide sul personal branding, tutorial sulla costruzione di una pagina professionale efficace). Il posizionamento verticale per professionisti con necessità di credibilità verificata (apertura conti bancari, affitti, candidature) è un differenziatore chiave rispetto ai page builder generalisti.

**Fase 2 — Crescita organica (M10-M24): 2.000+ utenti**
A questo punto il prodotto deve generare acquisizione autonoma attraverso il meccanismo virale più naturale: le pagine OpenSelf sono pubbliche e indicizzabili. Ogni pagina pubblicata porta il marchio OpenSelf visibile in modo discreto, generando curiosità e traffico verso il sito. La strategia SEO matura con contenuti mirati ai professionisti italiani ed europei. Si valuta l'attivazione di micro-campagne su LinkedIn Ads mirate per settore (sviluppatori, designer, consulenti) con budget contenuto (EUR 500-1.000/mese).

### 6.2 Mercato primario di attacco: professionisti indipendenti italiani

Il mercato di ingresso di OpenSelf è il mercato italiano dei professionisti indipendenti con profilo digitale rilevante, con un focus iniziale sull'ecosistema romano e laziale. La scelta non è geografica per inerzia ma strategica: l'Italia conta oltre 2 milioni di partite IVA in settori ad alta intensità di presenza professionale online (sviluppo software, design, consulenza, comunicazione, fotografia, coaching), su un totale di 3,5 milioni. È un mercato accessibile direttamente dall'Italia, culturalmente e linguisticamente omogeneo, e sottosviluppato in termini di strumenti di personal branding rispetto agli equivalenti anglosassoni.

L'ecosistema Roma/Lazio offre vantaggi specifici per la fase di lancio: la presenza del fondatore nel network professionale romano, la vicinanza a incubatori come LUISS EnLabs e CDP Venture Lab, e una community tecnologica in crescita con eventi regolari (incontri, conferenze, spazi di coworking) che facilitano il reclutamento diretto dei beta tester.

**Segmento A — Sviluppatori e designer indipendenti:** il segmento con l'esigenza critica più acuta — portfolio costantemente obsoleto, GitHub attivo ma non comunicato, progetti difficili da presentare a clienti non tecnici.

**Segmento B — Consulenti e professionisti della conoscenza:** manager, coach, esperti di settore che costruiscono una marca personale parallela al lavoro dipendente. Spesso LinkedIn è il loro unico punto di presenza digitale: la migrazione verso una pagina propria è un'opportunità naturale.

**Segmento C — Creativi e professionisti del contenuto:** fotografi, copywriter, gestori di social media, giornalisti. Hanno portfolio da mostrare e attività continue da comunicare — il connettore RSS/Atom è la loro funzionalità fondamentale.

### 6.3 Canali di acquisizione

I canali sono ordinati per priorità temporale. I canali organici e gratuiti sono prioritari nella fase di validazione; i canali a pagamento vengono attivati solo dopo la validazione del riscontro prodotto-mercato.

| Canale | Destinatario | Obiettivo | CAC stimato |
|--------|-------------|-----------|-------------|
| LinkedIn + Twitter/X | Professionisti indipendenti, sviluppatori, designer | Reclutamento beta (M1-M3) e notorietà continuativa | EUR 0 (organico) |
| Rete alumni LUISS / MBA | Professionisti ad alto profilo, consulenti | Reclutamento beta qualificato, ambasciatori naturali | EUR 0 (network diretto) |
| Community italiane | Dev.to Italia, Freelancer Italiani, Slack/Discord di settore | 50 utenti beta da community mirate | EUR 0 (contatto diretto) |
| Ecosistema Roma/Lazio | Lazio Innova, LUISS EnLabs, Talent Garden, spazi di coworking | Credibilità istituzionale, primi 20 beta tester | EUR 0 (partnership) |
| Product Hunt | Primi utilizzatori internazionali, sviluppatori | Lancio pubblico, 100-300 registrazioni giornaliere | EUR 0 (lancio preparato) |
| Indie Hackers | Costruttori indipendenti, solopreneur, sviluppatori | Trazione e credibilità nel mercato indie | EUR 0 (contenuto) |
| SEO + contenuti | Professionisti indipendenti con intento di personal branding | Traffico organico continuativo da M6+ | EUR 5-15 (costo creazione contenuto) |
| Programma di invito | Utenti esistenti soddisfatti | Acquisizione a basso CAC da M6+ | EUR 4,99 (1 mese Pro gratuito) |
| LinkedIn Ads (attivato su domanda) | Consulenti, designer, sviluppatori IT/EU | Crescita controllata da M12+ | EUR 15-25 (obiettivo) |

### 6.4 Piano di beta (M1-M3)

Il piano di beta è strutturato come un esperimento controllato, non come un lancio. L'obiettivo è raccogliere segnali di qualità da un campione rappresentativo dei tre segmenti target prima di investire in distribuzione.

**Reclutamento dei beta tester**
Obiettivo: 50 utenti selezionati nell'arco di 4 settimane. Canali: LinkedIn del fondatore (contatto diretto su network professionale), Twitter/X @openself_dev (serie di post di lancio beta con invito all'azione), rete alumni LUISS e coorte MBA (contatto diretto con ex-colleghi di corso), contatto diretto su 3-5 community italiane di professionisti indipendenti, eventi e incontri dell'ecosistema startup romano. Criterio di selezione: professionisti che hanno un profilo LinkedIn attivo ma un sito personale obsoleto o assente — il target con l'esigenza critica più forte.

**Protocollo di onboarding e riscontro**
Ogni beta tester riceve: accesso immediato al prodotto, messaggio di benvenuto personale dal fondatore, invito a una videochiamata di 20 minuti dopo 2 settimane di utilizzo. Le videochiamate sono strutturate attorno a tre domande: cosa ha funzionato, cosa non ha funzionato, pagheresti EUR 4,99/mese per questo. I risultati vengono categorizzati e usati come input diretto per le priorità della Fase 1.

**Criteri di avanzamento alla Fase 1**
La Fase 1 (lancio pubblico e attivazione Pro) si avvia solo se: NPS >= 30, fidelizzazione M+1 degli utenti beta >= 35%, almeno 15 utenti su 50 dichiarano intenzione esplicita di pagare EUR 4,99/mese. Se uno dei tre criteri non è raggiunto, si avvia un ciclo di ripensamento prima del lancio pubblico.

### 6.5 Strategia di lancio pubblico (M4-M6)

**Product Hunt**
Product Hunt è il canale di lancio primario per OpenSelf. Un lancio ben preparato genera tipicamente 500-2.000 visitatori unici nel giorno del lancio e 50-300 registrazioni, con costo zero. La preparazione include: costruzione di una lista di contatti di almeno 200 sostenitori durante la beta, preparazione di risorse visive della pagina PH, coordinamento per concentrare i voti nelle prime ore (le prime 4 ore determinano il posizionamento giornaliero). Obiettivo: primi 5 del giorno.

**Programma di invito**
Al lancio del livello Pro viene attivato il programma di invito: ogni utente che porta un amico che si converte in Pro riceve 1 mese gratuito. L'incentivo è autofinanziato (il mese gratuito per chi invita costa circa EUR 0,05 in LLM, non EUR 4,99 di mancato ricavo, perché l'utente invitato paga comunque). L'obiettivo è un rapporto di invito di 0,2 (ogni 5 Pro acquisisce 1 nuovo Pro tramite invito) nelle prime 12 settimane di lancio.

### 6.6 Metriche e funnel

Il funnel di acquisizione di OpenSelf è semplice: visita → registrazione → onboarding completato → pagina pubblicata → upgrade Pro → upgrade Portfolio+. Le metriche prioritarie non sono le visite, ma la qualità della conversione in ogni passaggio del funnel.

| Metrica | M+3 (beta) | M+12 | M+24 |
|---------|-----------|------|------|
| Visite mensili (stima) | 500 | 5.000 | 25.000 |
| Registrazioni mensili | 50 (beta) | 200 | 600 |
| Onboarding completato (tasso) | 80% | 70% | 65% |
| Pagina pubblicata (tasso su reg.) | 90% | 85% | 80% |
| Conversione free → Pro | 0% (beta) | 7% | 7% |
| Conversione Pro → Portfolio+ | N/A | 15% | 15% |
| Fidelizzazione M+1 (utenti attivi) | >= 35% | >= 50% | >= 55% |
| CAC medio (Pro) | EUR 0 | <= EUR 15 | <= EUR 20 |
| NPS | >= 30 | >= 40 | >= 45 |

La conversione free→Pro del 7% è lo scenario base, in linea con i parametri di riferimento del modello freemium per prodotti professionali (2-8% consumatore, 10-25% B2B). OpenSelf si colloca nel segmento prosumer professionale. La conversione Pro→Portfolio+ del 15% è conservativa: il dossier professionale PDF e i badge verificati offrono un valore tangibile e quantificabile per il segmento D (professionisti con necessità di credibilità verificata).

### 6.7 Trazione attuale (Marzo 2026)

Lo stato completo del prodotto è documentato nella Sezione 8.1. In sintesi: prodotto operativo su openself.dev, insieme funzionale completo (5 connettori, 4 livelli di memoria, 25 strumenti agente, 8 lingue, 14 identity matcher, Content Curation, Activity Feed, Fact Clustering, Chat Concierge), oltre 3.077 test automatizzati (287 file). L1 (auto-dichiarato) e L2 (verificato da connettori) sono già operativi. Nessuna spesa di marketing effettuata alla data di redazione. La beta non è ancora lanciata formalmente.

---

## 7. Modello di Business e Piano Finanziario

### 7.1 Strategia di pricing

Il pricing di OpenSelf è posizionato tra i page builder personali e i SaaS professionali, riflettendo il valore aggiunto dell'intelligenza artificiale e dell'aggiornamento autonomo. EUR 4,99/mese è il punto di prezzo primario — superiore a Carrd Pro (EUR 1,58/mese), competitivo con Linktree Pro (EUR 5-22/mese), e significativamente inferiore ai website builder professionali (Squarespace EUR 11-37/mese). Il tier Portfolio+ a EUR 9,99/mese aggiunge un chiaro step-up di valore: badge verificati e dossier professionale PDF — funzionalità che nessun competitor offre.

| Livello | Prezzo | Cosa sblocca | Destinatario |
|---------|--------|-------------|--------------|
| Free | EUR 0 | Onboarding AI, generazione pagina, 2 connettori | Chiunque voglia provare |
| Pro | EUR 4,99/mese o EUR 49,99/anno | Worker autonomo, tutti i connettori, memoria completa, dominio custom, content curation | Professionisti che vogliono una pagina vivente |
| Portfolio+ | EUR 9,99/mese o EUR 99,99/anno | Badge verificati (L2), dossier professionale PDF, curation prioritaria | Professionisti che necessitano di credibilità verificata |

### 7.2 Economia unitaria

I costi variabili per utente Pro sono stati calcolati sui token reali generati in un mese di utilizzo tipico: 4 sessioni da 15 turni + worker 4 volte a settimana + 4 connettori attivi. Prezzi Haiku 4.5 con cache dei prompt (cache read = 10%) e API Batch (-50%) per i job del worker. Cambio EUR/USD = 0,92.

| Livello | Prezzo mensile | Costo variabile / MAU | Margine lordo | LTV 12 mesi |
|---------|---------------|----------------------|---------------|-------------|
| Pro (mensile) | EUR 4,99 | EUR 0,46 | EUR 4,53 (91%) | ~EUR 43 |
| Pro (annuale, effettivo) | EUR 4,17 | EUR 0,46 | EUR 3,71 (89%) | ~EUR 37 |
| Portfolio+ (mensile) | EUR 9,99 | EUR 0,60 | EUR 9,39 (94%) | ~EUR 94 |
| Portfolio+ (annuale, eff.) | EUR 8,33 | EUR 0,60 | EUR 7,73 (93%) | ~EUR 77 |

Il costo variabile del Portfolio+ è leggermente superiore al Pro per la generazione del dossier PDF (~EUR 0,14/dossier, stimato 1x/mese).

### 7.3 Modello di costo LLM — Dati reali per operazione

I costi LLM sono stati calcolati operazione per operazione per evitare stime ottimistiche. Ogni voce è verificata sull'architettura attuale: prompt di sistema ~4.500 token, storico medio 3.000 token per sessione, output ~500 token per turno.

| Operazione | Token (cache + nuovi) | Output | Costo |
|-----------|----------------------|--------|-------|
| Singolo turno conversazione | 4.500 cache + ~1.500 nuovi | ~500 | EUR 0,004/turno |
| Onboarding completo (20 turni + gen. pagina) | ~75K cache + ~20K nuovi totali | ~13K | EUR 0,161 una tantum |
| Sessione tipica (15 turni) | ~67K cache + ~22K nuovi | ~7.500 | EUR 0,082/sessione |
| Worker leggero (API Batch, -50%) | 4.500 cache + 2.500 nuovi | 800 | EUR 0,003/esecuzione |
| Worker profondo (API Batch, -50%) | 4.500 cache + 6.000 nuovi | 2.500 | EUR 0,009/esecuzione |
| Aggiornamento connettore (API Batch, -50%) | 1.000 cache + 3.500 nuovi | 1.200 | EUR 0,004/esecuzione |
| Generazione dossier PDF (Portfolio+) | ~8K cache + ~5K nuovi | ~3.000 | EUR 0,014/dossier |
| UTENTE GRATUITO ATTIVO / mese | 2 sessioni + 4x worker + 2 conn. x 4 sett. | — | EUR 0,21/mese |
| UTENTE PRO ATTIVO / mese | 4 sessioni + 4x worker leggero + 1x profondo + 4 conn. x 4 sett. | — | EUR 0,43/mese |
| UTENTE PORTFOLIO+ / mese | Come Pro + dossier 1x/mese + curation prioritaria | — | EUR 0,57/mese |

### 7.4 Proiezioni economico-finanziarie a 3 anni

Le proiezioni seguono ipotesi deliberatamente conservative: nessun effetto virale, conversione free→Pro al 7%, conversione Pro→Portfolio+ al 15%, fidelizzazione annua al 72%. I ricavi Anno 1 sono bassi per scelta: la beta gratuita dura M1-M3, il lancio Pro avviene a M4.

**Metodologia di derivazione dei ricavi:** Il livello Pro viene lanciato a M4 (post-beta). Gli utenti paganti crescono linearmente da 0 al target di fine anno. Ricavo = utenti paganti medi × prezzo mensile × mesi attivi. Le formule utilizzano il prezzo mensile pieno (EUR 4,99/EUR 9,99) come baseline conservativa — lo sconto annuale (EUR 49,99/EUR 99,99 all'anno) riduce leggermente il ricavo effettivo ma è compensato dalla migliore fidelizzazione.

- **Anno 1 (M1-M12):** Pro da M4. Rampa lineare 0→35 Pro in 9 mesi (media 17,5), Portfolio+ da M7 0→5 (media 2,5 in 6 mesi). Pro: 17,5 × EUR 4,99 × 9 = EUR 786. Portfolio+: 2,5 × EUR 9,99 × 6 = EUR 150. **Totale: ~EUR 936.**
- **Anno 2 (M13-M24):** Rampa 35→140 Pro (media 87,5), 5→20 Portfolio+ (media 12,5). 12 mesi pieni. Pro: 87,5 × 4,99 × 12 = EUR 5.240. Portfolio+: 12,5 × 9,99 × 12 = EUR 1.499. **Totale: ~EUR 6.739.**
- **Anno 3 (M25-M36):** Rampa 140→350 Pro (media 245), 20→50 Portfolio+ (media 35). Pro: 245 × 4,99 × 12 = EUR 14.671. Portfolio+: 35 × 9,99 × 12 = EUR 4.196. **Totale: ~EUR 18.867.**
- **Run-rate ARR fine Anno 3:** 350 × 4,99 × 12 + 50 × 9,99 × 12 = EUR 20.958 + EUR 5.994 = **~EUR 27.000 ARR.**

| RICAVO / VOCE DI COSTO | Anno 1 (M1-M12) | Anno 2 (M13-M24) | Anno 3 (M25-M36) |
|---|---|---|---|
| **UTENTI PAGANTI (fine anno)** | | | |
| Pro | 35 | 140 | 350 |
| Portfolio+ | 5 | 20 | 50 |
| **TOTALE RICAVI ANNUI** | **~EUR 936** | **~EUR 6.739** | **~EUR 18.867** |
| **COSTI VARIABILI** | | | |
| LLM — utenti gratuiti (MAU ~100/400/1.000) | EUR 252 | EUR 1.008 | EUR 2.520 |
| LLM — utenti Pro (MAU) | EUR 193 | EUR 773 | EUR 1.932 |
| LLM — utenti Portfolio+ (MAU) | EUR 36 | EUR 144 | EUR 360 |
| Infrastruttura Hetzner | EUR 120 | EUR 300 | EUR 600 |
| Strumenti SaaS (monitoraggio, CDN, email) | EUR 180 | EUR 300 | EUR 480 |
| **TOTALE COSTI VARIABILI** | **EUR 781** | **EUR 2.525** | **EUR 5.892** |
| **MARGINE LORDO** | **EUR 155 (17%)** | **EUR 4.214 (63%)** | **EUR 12.975 (69%)** |
| **COSTI FISSI** | | | |
| Compenso amministratore CEO | EUR 18.000 | EUR 21.600 | EUR 24.000 |
| Contributi INPS Gestione Separata (24%) | EUR 4.320 | EUR 5.184 | EUR 5.760 |
| Collaboratore tecnico | EUR 0 | EUR 12.000 | EUR 24.000 |
| Legale / Commercialista | EUR 3.000 | EUR 4.000 | EUR 5.000 |
| Strumenti AI per sviluppo | EUR 1.560 | EUR 1.560 | EUR 1.560 |
| Dominio openself.dev | EUR 30 | EUR 30 | EUR 30 |
| Diritto camerale CCIAA + tassa gov. | EUR 510 | EUR 510 | EUR 510 |
| Registrazione marchio EUIPO | EUR 900 | EUR 0 | EUR 0 |
| Costituzione SRLS | EUR 800 | EUR 0 | EUR 0 |
| Consulenza privacy/conformità | EUR 1.500 | EUR 0 | EUR 0 |
| Attrezzatura di sviluppo (PC) | EUR 2.500 | EUR 0 | EUR 0 |
| Marketing e contenuti | EUR 600 | EUR 2.400 | EUR 4.800 |
| Commissioni di pagamento (Stripe) | EUR 70 | EUR 300 | EUR 700 |
| **TOTALE COSTI FISSI** | **EUR 33.790** | **EUR 47.584** | **EUR 66.360** |
| **EBIT** | **-EUR 33.635** | **-EUR 43.370** | **-EUR 53.385** |

La crescita del margine lordo dal 17% (Anno 1) al 69% (Anno 3) è strutturale: ogni utente pagante aggiunto diluisce il costo degli utenti gratuiti. Il deficit annuale è coperto dal contributo Pre-Seed 3.0 nei primi 18 mesi e da capitale del fondatore + ricavi crescenti nel periodo successivo.

**Dettaglio delle voci di costo:**
- **Compenso amministratore SRLS** (non stipendio): il fondatore percepisce un compenso come amministratore unico della SRLS, deliberato dall'assemblea. L'importo è mantenuto contenuto nei primi 3 anni per massimizzare l'efficienza del capitale.
- **Contributi INPS Gestione Separata** (24% del compenso lordo): aliquota ridotta in quanto il fondatore mantiene la copertura contributiva principale come lavoratore dipendente presso CDP.
- **Strumenti AI per sviluppo** (EUR 1.560/anno): Claude Max (~EUR 90/mese), ChatGPT Plus (~EUR 20/mese), Gemini Pro (~EUR 20/mese). Costituiscono il "team di sviluppo aumentato".
- **Attrezzatura di sviluppo** (EUR 2.500 una tantum): workstation PC per lo sviluppo locale, test LLM e debug.
- **Registrazione marchio EUIPO** (EUR 900 una tantum): protezione del marchio "OpenSelf" nelle classi 9 e 42 (software e SaaS) sul territorio dell'Unione Europea.
- **Costituzione SRLS** (EUR 800 una tantum): atto costitutivo, PEC, firma digitale, iscrizione CCIAA, apertura posizioni INPS/INAIL.
- **Consulenza privacy/conformità** (EUR 1.500 Anno 1): DPIA, redazione Informativa Privacy e Condizioni d'uso conformi al GDPR e all'AI Act, revisione legale dei flussi dati dei connettori.

### 7.5 Piano di utilizzo del contributo Pre-Seed 3.0

Pre-Seed 3.0 (Lazio Innova) è un **contributo a fondo perduto** — non un mutuo. Lo strumento finanzia fino a EUR 145.000 per un progetto di 18 mesi. Con un investimento esterno di EUR 10.000 (angel), il moltiplicatore 2x attiva il tetto massimo di EUR 145.000 (vs EUR 100.000 senza angel). La SRLS sarà iscritta nella sezione speciale del Registro delle Imprese come **startup innovativa**.

| Categoria di spesa Pre-Seed 3.0 | M1-M9 | M10-M18 | Totale 18 mesi |
|---|---|---|---|
| Personale — Compenso amministratore CEO | EUR 13.500 | EUR 13.500 | EUR 27.000 |
| Contributi INPS (24%) | EUR 3.240 | EUR 3.240 | EUR 6.480 |
| Personale — Collaboratore tecnico (da M10) | EUR 0 | EUR 9.000 | EUR 9.000 |
| Consulenza legale / commercialista | EUR 2.250 | EUR 2.250 | EUR 4.500 |
| Consulenza privacy/conformità | EUR 1.500 | EUR 0 | EUR 1.500 |
| Tecnologie e licenze (LLM API + SaaS + AI dev tools) | EUR 1.305 | EUR 1.305 | EUR 2.610 |
| Infrastruttura cloud (Hetzner) | EUR 90 | EUR 180 | EUR 270 |
| Attrezzatura sviluppo (PC) | EUR 2.500 | EUR 0 | EUR 2.500 |
| Costituzione SRLS + PEC + firma digitale | EUR 800 | EUR 0 | EUR 800 |
| Registrazione marchio EUIPO | EUR 900 | EUR 0 | EUR 900 |
| Diritto camerale + tassa gov. (18 mesi) | EUR 383 | EUR 383 | EUR 765 |
| Marketing e contenuti | EUR 450 | EUR 1.350 | EUR 1.800 |
| Commissioni di pagamento (Stripe) | EUR 35 | EUR 105 | EUR 140 |
| Dominio | EUR 23 | EUR 23 | EUR 45 |
| **TOTALE** | **EUR 26.975** | **EUR 31.335** | **EUR 58.310** |

**Due viste del modello finanziario:**
- **Vista progetto 18 mesi** (scope Pre-Seed 3.0): spese EUR 58.310 coperte dal contributo. Questo è ciò che Lazio Innova valuta.
- **Vista sostenibilità 3 anni** (mostra il percorso verso il pareggio): le proiezioni Anno 2-3 mostrano che il business può raggiungere la sostenibilità. Le spese oltre i 18 mesi del grant sono coperte da ricavi + capitale del fondatore.

**Allocazione del contributo:** EUR 58.310 di spese contro un tetto di EUR 145.000 (con EUR 10.000 angel per moltiplicatore 2x). Il margine residuo di EUR 86.690 è buffer per: costi di compliance imprevisti, espansione del team se la trazione supera le attese, spesa marketing aggiuntiva. Senza angel: tetto EUR 100.000, comunque sufficiente a coprire il piano base di EUR 58.310.

**Flusso di cassa con contributo:**

| Periodo | Ricavi | Costi | Deficit | Contributo Pre-Seed 3.0 | Saldo |
|---|---|---|---|---|---|
| M1-M9 (beta+lancio) | ~EUR 0 | EUR 26.975 | -EUR 26.975 | +EUR 26.975 | EUR 0 |
| M10-M18 (crescita) | ~EUR 700 | EUR 31.335 | -EUR 30.635 | +EUR 30.635 | EUR 0 |
| **Totale 18 mesi** | **~EUR 700** | **EUR 58.310** | **-EUR 57.610** | **+EUR 57.610** | **EUR 0** |
| M19-M36 (post-grant) | ~EUR 20.000 | ~EUR 55.000 | -EUR 35.000 | — | Fondatore + ricavi |

### 7.6 Infrastruttura — Piano di crescita

L'architettura SQLite one-file-per-identity è adeguata fino a migliaia di utenti attivi. La migrazione a PostgreSQL, se necessaria per scenari di scala post-Series A, è un refactoring metodico del layer di persistenza (Drizzle ORM) senza riscrittura della business logic.

| Utenti registrati | MAU stimati | Configurazione | Costo/mese |
|-------------------|-------------|---------------|------------|
| 0-300 | 0-75 | Hetzner CX22 — EUR 3,99/mese | EUR 4-10 |
| 300-1.500 | 75-375 | Hetzner CX32 — EUR 6,80/mese | EUR 15-25 |
| 1.500-5.000 | 375-1.250 | CX42 (EUR 16,40) + CX22 worker (EUR 3,99) | EUR 25-40 |

Prezzi post-aprile 2026 (Hetzner ha annunciato un aumento del 30-37% sulle istanze cloud a partire dal 1° aprile 2026, già incorporato nei valori sopra).

### 7.7 Analisi del punto di pareggio

L'analisi utilizza il **margine di contribuzione** (ricavo per utente meno costo variabile per utente), non il ricavo lordo, per determinare il numero di utenti necessario a coprire i costi fissi mensili.

| Parametro | Valore |
|-----------|--------|
| Costi fissi mensili a regime (Anno 3) | CEO EUR 2.000 + INPS EUR 480 + collaboratore EUR 2.000 + legale EUR 417 + AI tools EUR 130 + marketing EUR 400 + Stripe EUR 58 + CCIAA EUR 43 + infra/SaaS EUR 2 = **~EUR 5.530/mese** |
| Margine di contribuzione medio per utente pagante (mix 350 Pro + 50 Portfolio+) | Ricavo medio ponderato EUR 5,62/mese - costo variabile medio EUR 0,48/mese = **EUR 5,14/utente/mese** |
| **Utenti paganti per pareggio** | EUR 5.530 / EUR 5,14 ≈ **~1.076 utenti paganti** |

Il pareggio operativo a ~1.076 utenti paganti è un obiettivo post-Anno 3, raggiungibile con l'espansione europea (8 lingue pronte) e l'introduzione di tier a maggiore valore aggiunto (Pro+ Coach a EUR 14,99/mese). Lo scenario base proietta 400 utenti paganti a M+36; il pareggio richiede una crescita continuata oltre il piano triennale.

**Percorso verso la sostenibilità:**
- **M1-M18 (periodo grant):** deficit coperto dal contributo Pre-Seed 3.0.
- **M19-M36 (post-grant):** deficit coperto da capitale del fondatore + ricavi crescenti.
- **M36+ (percorso pareggio):** espansione EU, introduzione Pro+ Coach, crescita organica verso 1.076 utenti paganti.

### 7.8 Analisi di sensibilità

| Scenario | Conversione free→Pro | Utenti paganti fine A3 | Ricavi A3 | Run-rate ARR A3 | Pareggio |
|----------|---------------------|----------------------|-----------|-----------------|----------|
| **Pessimistico** | 4% | 200 (175 Pro + 25 P+) | ~EUR 9.400 | ~EUR 13.500 | Post-Anno 5 |
| **Base** | 7% | 400 (350 Pro + 50 P+) | ~EUR 18.867 | ~EUR 27.000 | Anno 4-5 |
| **Ottimistico** | 12% | 800 (700 Pro + 100 P+) | ~EUR 37.734 | ~EUR 54.000 | Anno 3-4 |

In tutti e tre gli scenari, il deficit del periodo grant (M1-M18) è coperto dal contributo Pre-Seed 3.0. Lo scenario pessimistico richiede una strategia di sostenibilità più aggressiva (accelerazione Pro+ Coach o ricerca di un round seed). Lo scenario base raggiunge il pareggio tra Anno 4 e Anno 5, con l'espansione europea e il Pro+ Coach come acceleratori.

---

## 8. Roadmap Tecnica e Piano Operativo

### Principio guida

La roadmap è organizzata attorno a traguardi verificabili — utenti, ricavi, funzionalità — non a date. La priorità assoluta è la validazione del mercato: 50 utenti beta attivi prima di qualsiasi espansione di funzionalità o assunzione.

### 8.1 Stato attuale del prodotto (Marzo 2026)

Al momento della presentazione del piano d'impresa, OpenSelf è un prodotto completo e pubblicamente accessibile all'indirizzo **openself.dev**. Non è un prototipo, non è un prodotto minimo embrionale: è un sistema completo e operativo con un livello di maturità tecnica che supera ampiamente quanto richiesto per la validazione di mercato.

Il prodotto include: un agente conversazionale con 25 strumenti operativi e sistema di memoria a 4 livelli (semantica, di lavoro, metacognitiva, episodica); 5 connettori attivi (GitHub, LinkedIn, RSS, Spotify, Strava) con aggiornamento autonomo e doppio risultato (fatti + eventi episodici); un motore di composizione ibrido (deterministico + LLM) con 19 tipologie di sezione e quattro template di layout; il Presence System per l'identità visiva; Journey Intelligence adattivo (6 stati, 11 situazioni); Content Curation a due livelli; Fact Clustering con 14 identity matcher per deduplicazione multi-sorgente; Activity Feed; sistema di greeting Concierge; Speech-to-Text; localizzazione completa in 8 lingue. I livelli L1 (auto-dichiarato) e L2 (verificato da connettori) sono già operativi.

L'infrastruttura è in produzione su Hetzner (Helsinki), con oltre 3.077 test automatizzati (287 file), 35 migrazioni database e 17 Architecture Decision Records. L'architettura è conforme fin dalla progettazione al GDPR e ai requisiti dell'AI Act.

L'intero sistema è stato costruito da un singolo fondatore utilizzando strumenti AI come team di sviluppo aumentato — una validazione pratica della tesi di prodotto di OpenSelf.

### 8.2 Roadmap

La roadmap è strutturata in quattro fasi operative (3 fasi nel periodo del contributo + 1 fase post-grant), più una direzione strategica post-Series A.

| Fase | Periodo | Obiettivo | Traguardi chiave |
|------|---------|-----------|-----------------|
| **Fase 0** | M1-M3 | Validazione: 50 utenti beta | 50 beta attivi; NPS ≥ 30; fidelizzazione ≥ 35%; ottimizzazione costi LLM; iterazione UX |
| **Fase 1** | M4-M9 | Lancio pubblico, primi paganti | 500 registrati, 35 Pro, 5 Portfolio+; lancio Product Hunt; programma referral; connettori aggiuntivi on-demand |
| **Fase 2** | M10-M18 | Crescita Italia, team | 1.250 registrati, ~100 paganti (87 Pro, 12 Portfolio+); primo collaboratore tecnico; Verified Portfolio tier completo; API pubblica per integrazioni |
| **Fase 3** | M19-M24 | Espansione EU, consolidamento | 2.000 registrati, 140 Pro, 20 Portfolio+; team di 3; espansione FR/DE/ES (8 lingue pronte); crescita verso pareggio operativo |

**Direzione strategica (post-Serie A)**

Le fasi successive — evoluzione dell'agente in AI Career Coach proattivo (EUR 14,99/mese), integrazione di credenziali istituzionali (SPID, CIE, Open Banking) tramite partner certificati, e sviluppo dell'Identity API per integrazioni B2B — rappresentano la direzione strategica post-Series A. L'architettura attuale è predisposta per questa evoluzione: i quattro livelli di memoria, il Fact Clustering multi-sorgente, e il sistema di verifica L1+L2 costituiscono le fondamenta tecniche su cui costruire livelli di certificazione superiori.

### 8.3 Piano operativo e struttura del team

Il piano di crescita del team è dettagliato nella Sezione 5.3. In sintesi: fondatore singolo fino a M+9, prima assunzione a M+10 (criterio: MRR >= EUR 400, ~100 utenti paganti), team di 3 equivalenti a tempo pieno a M+24.

### 8.4 Infrastruttura e scalabilità

L'architettura attuale è progettata per crescere verticalmente fino a migliaia di utenti attivi senza modifiche strutturali. Lo stack — Next.js App Router, SQLite (one-file-per-identity), worker asincrono, Coolify su Hetzner — è ottimizzato per semplicità operativa e costo contenuto nella fase di validazione.

- **Attuale — Fase 0-1 (0-500 utenti):** Hetzner CX23 (2 vCPU, 4GB RAM), SQLite, costo infrastruttura ~EUR 30-50/mese
- **Crescita verticale — Fase 2 (500-2.000 utenti):** Upgrade a Hetzner CX32/CX42, CDN per risorse statiche, costo stimato ~EUR 100-200/mese
- **Architettura distribuita — Fase 3 (2.000-5.000 utenti):** Separazione worker da server applicativo, costo stimato ~EUR 300-500/mese

L'architettura SQLite one-file-per-identity è un vantaggio competitivo strutturale (backup banale, isolamento fisico dei dati, zero configurazione database). Il layer di astrazione Drizzle ORM garantisce portabilità futura verso PostgreSQL senza riscrittura della business logic. L'instradamento LLM multi-provider è già implementato: permette di ottimizzare il costo per operazione e di mantenere la resilienza in caso di indisponibilità di un provider.

### 8.5 KPI e metriche di successo

Le metriche prioritarie per la fase di validazione sono la fidelizzazione degli utenti attivi e la conversione free→Pro. Il volume assoluto di registrazioni è secondario rispetto alla qualità dell'interazione.

| KPI | M+3 | M+9 | M+18 | M+24 | M+36 |
|-----|-----|-----|------|------|------|
| Utenti registrati | 50 | 500 | 1.250 | 2.000 | 5.000 |
| Utenti paganti (Pro) | 0 | 35 | 87 | 140 | 350 |
| Utenti paganti (Portfolio+) | 0 | 5 | 12 | 20 | 50 |
| MRR | EUR 0 | EUR 224 | EUR 554 | EUR 899 | EUR 2.246 |
| ARR | EUR 0 | EUR 2.688 | EUR 6.648 | EUR 10.788 | EUR 26.952 |
| Conversione free→Pro | N/A | 7% | 7% | 7% | 7% |
| Conversione Pro→Portfolio+ | N/A | 15% | 15% | 15% | 15% |
| NPS | ≥ 30 | ≥ 40 | ≥ 45 | ≥ 50 | ≥ 50 |
| Team (ETP) | 1 | 1 | 2 | 3 | 3-5 |

**Nota metodologica**
I target di MRR e utenti paganti sono deliberatamente conservativi nelle fasi 0-1. L'obiettivo primario dei primi 12 mesi non è la massimizzazione dei ricavi, ma la validazione del riscontro prodotto-mercato. Un NPS ≥ 40 con 500 utenti registrati ha più valore strategico di EUR 5.000 MRR con utenti insoddisfatti.

---

## 9. Analisi dei Rischi, Mitigazioni e Direzione Strategica

### Approccio all'analisi dei rischi

OpenSelf è un progetto a fondatore singolo in fase pre-revenue. I rischi principali non sono tecnologici — il prodotto funziona ed è maturo — ma operativi e di mercato. L'analisi che segue identifica i rischi reali e le mitigazioni concrete, senza minimizzare le vulnerabilità strutturali della fase iniziale.

### 9.1 Mappa dei rischi e analisi approfondita

| Categoria | Rischio | Livello | Mitigazione |
|-----------|---------|---------|-------------|
| Operativo | **Dipendenza dal fondatore singolo.** Malattia, esaurimento o cambio di priorità blocca l'intero progetto. | ALTO | Codebase completamente documentata (ARCHITECTURE.md, 17 ADR, CLAUDE.md). Oltre 3.077 test garantiscono continuità. Roadmap pubblica e piano di inserimento per eventuali collaboratori. Consiglio consultivo previsto entro M+3. |
| Mercato | **Mancata validazione del riscontro prodotto-mercato.** I 50 utenti beta non confermano la proposta di valore o la fidelizzazione è troppo bassa. | ALTO | Criterio di avanzamento esplicito: se NPS < 30 a M+3 o fidelizzazione M+1 < 30%, nessun investimento aggiuntivo prima di un ciclo di ripensamento. Interviste qualitative strutturate con ogni utente beta. Costo marginale della fase beta quasi zero. |
| Competitivo | **Entrata di un attore grande** (LinkedIn, Wix, Notion). | MEDIO | I grandi attori hanno cicli di sviluppo lunghi e non possono convergere su questo posizionamento senza cannibalizzare il loro business principale. Il vantaggio di OpenSelf è nell'integrazione sistemica (4 livelli memoria + 5 connettori + worker a 3 livelli + Soul Profile + Journey Intelligence + Fact Clustering), non in una singola funzionalità. |
| Competitivo | **Pressione competitiva sul pricing.** Alternative gratuite (Carrd, Linktree free tier) rendono EUR 4,99/mese una barriera psicologica per i freelancer italiani. | MEDIO | Livello gratuito genuinamente utile come hook. Il valore del coach AI si dimostra con l'uso — la conversione avviene dopo che l'utente ha sperimentato il prodotto. Il Portfolio+ offre un valore tangibile e quantificabile (dossier verificato) che i competitor gratuiti non possono replicare. |
| Tecnologico | **Aumento dei costi LLM o discontinuità di un provider.** | MEDIO | Instradamento multi-provider già operativo (Anthropic, OpenAI, Google, Ollama). Il costo LLM stimato a regime (Haiku 4.5) è <EUR 0,05/utente/mese nel livello gratuito. La tendenza strutturale dei costi LLM è in calo di oltre il 90% annuo. |
| Tecnologico | **Dipendenza da strumenti AI per lo sviluppo.** | MEDIO | Approccio multi-strumento deliberato: 3 provider AI distinti eliminano il punto unico di vulnerabilità. Le competenze sono trasferibili tra strumenti. |
| Legale/HR | **Mancata autorizzazione del datore di lavoro per attività parallela.** | MEDIO | Il processo di autorizzazione è avviato in parallelo alla beta gratuita, prima di qualsiasi monetizzazione. In caso di diniego, il progetto rimane nella fase beta gratuita fino alla risoluzione. |
| Tecnologico | **Comportamento inaffidabile dell'agente LLM.** | BASSO | Action Claim Guard anti-allucinazione, oltre 3.077 test, Journey Intelligence con policy per stato, conferma esplicita per operazioni distruttive, Extended Thinking. |
| Regolatorio | **Evoluzione normativa AI Act / GDPR.** | BASSO | OpenSelf rientra nella categoria a **rischio limitato** ai sensi dell'art. 50 del Regolamento UE 2024/1689 (AI Act). Architettura conforme fin dalla progettazione al GDPR, dati in Europa, nessuna cessione a terzi. |
| Finanziario | **Copertura finanziaria esaurita prima della validazione.** | BASSO | Costi operativi in fase beta <EUR 250/mese totali. Il fondatore ha un reddito da lavoro dipendente che copre i costi di vita. Il contributo Pre-Seed 3.0 copre le spese del piano a 18 mesi. |

**Analisi approfondita — Rischio prioritario 1: Fondatore singolo**

La dipendenza da un singolo individuo è il rischio strutturale più importante. Non è mitigabile completamente, ma è gestibile:

- *Documentazione come asset:* ARCHITECTURE.md, 17 ADR, CLAUDE.md e oltre 3.077 test garantiscono che un collaboratore possa orientarsi rapidamente nel codebase senza dipendere dalla memoria del fondatore.
- *Consiglio consultivo:* identificazione di 2-3 consiglieri tecnici e di business entro M+3, con incontri mensili strutturati.
- *Gestione del carico:* il progetto è esplicitamente strutturato per sessioni sostenibili, non per sprint ad alta intensità.
- *Efficienza potenziata dall'AI:* l'utilizzo sistematico di 3 strumenti AI riduce il carico cognitivo e mantiene alta la produttività.

**Analisi approfondita — Rischio prioritario 2: Riscontro prodotto-mercato**

- La beta di 50 utenti è progettata come esperimento controllato. L'obiettivo è raccogliere segnali di qualità, non numeri.
- Le interviste qualitative con ogni utente beta forniscono input diretto per il ripensamento o la prosecuzione.
- Il costo totale della fase beta è stimato in <EUR 750 (3 mesi × ~EUR 250/mese). Il rischio finanziario di un insuccesso della fase beta è quasi zero.
- Il prodotto è già completo: un eventuale ripensamento riguarderebbe il posizionamento o il target, non la ricostruzione del software.

### 9.2 Piano di contingenza

**Scenario A — NPS < 30 o fidelizzazione M+1 < 30% a fine beta**
Il prodotto non ha trovato il riscontro prodotto-mercato nella forma attuale. Risposta: ciclo di scoperta di 4 settimane (interviste approfondite, analisi dati di utilizzo). Poi: ripensamento su uno dei tre assi — cambio di target, cambio di canale, cambio di funzionalità principale. Nessuna monetizzazione prima del ripensamento validato.

**Scenario B — Il datore di lavoro attuale nega l'autorizzazione per SRLS**
Risposta a breve termine: la beta gratuita continua senza monetizzazione. Risposta a medio termine: valutazione di un accordo di part-time, o dimissioni volontarie dopo che i ricavi raggiungono un livello sufficiente (obiettivo: MRR > EUR 2.000 prima di eventuali dimissioni).

**Scenario C — Aumento significativo dei costi LLM (>10x)**
L'instradamento multi-provider permette di migrare il traffico verso provider più economici in ore. Il livello gratuito può essere limitato. I modelli a pesi aperti locali (via Ollama, già integrato) diventano un'alternativa per le operazioni leggere.

**Scenario D — Indisponibilità prolungata degli strumenti AI per sviluppo**
Migrazione immediata del flusso di lavoro sugli strumenti rimanenti. La velocità di sviluppo si ridurrebbe del 40-60%, ma il prodotto è già funzionante e maturo. Il codebase è completamente documentato e testato.

**Scenario E — Il livello Portfolio+ non trova domanda**
I badge verificati e il dossier PDF non generano conversioni sufficienti. Risposta: il tier Pro a EUR 4,99 sostiene il modello anche senza Portfolio+. Il dossier viene incluso nel tier Pro come feature, non come upsell. Il pricing rimane sostenibile.

### 9.3 Analisi SWOT

| | Fattori positivi | Fattori negativi |
|--|------------------|------------------|
| **Interni** | **Punti di forza:** Prodotto operativo e maturo (3.077+ test, 5 connettori, 8 lingue). Architettura innovativa unica (4 livelli memoria + Dream Cycle). Architettura predisposta per evoluzione verso identità verificata (L1+L2 operativi). Conformità nativa come vantaggio competitivo. Fondatore con profilo ibrido economia/tecnologia e network istituzionale (CDP, LUISS, CE). Costi operativi ultra-contenuti. | **Punti di debolezza:** Fondatore singolo (fattore bus = 1). Zero trazione con utenti reali. Dipendenza da strumenti AI per lo sviluppo. Fondatore attualmente dipendente a tempo pieno. Consiglio consultivo non ancora costituito. |
| **Esterni** | **Opportunità:** Economia dei lavori indipendenti europea in crescita (+12%/anno). Costi LLM in calo strutturale. AI Act favorisce soluzioni conformi fin dalla progettazione europee. Ecosistema startup italiano in accelerazione. Deficit di fiducia nella gig economy crea domanda per credibilità verificata. Nessun competitor offre memoria persistente + aggiornamento autonomo + verifica multi-sorgente. | **Minacce:** Ingresso di attori grandi (LinkedIn, Wix) nel segmento. Aumento imprevisto dei costi LLM. Evoluzione normativa restrittiva. Competitor diretti agili (Read.cv, Polywork, Bento.me). Pressione al ribasso sul pricing da alternative gratuite. Rischio di mancata validazione del riscontro prodotto-mercato. |

### 9.4 Note su conformità e proprietà intellettuale

**Classificazione AI Act.** OpenSelf rientra nella categoria a **rischio limitato** ai sensi dell'art. 50 del Regolamento UE 2024/1689. Il sistema genera contenuti per conto dell'utente (pagina professionale) ma non effettua profilazione automatizzata con effetti giuridici, non tratta categorie particolari di dati (art. 9 GDPR), non è destinato a soggetti vulnerabili, e non rientra negli allegati I-III del Regolamento. Gli obblighi applicabili riguardano la **trasparenza**: informare l'utente che sta interagendo con un sistema di AI (già implementato) e fornire informazioni sul funzionamento del sistema.

**Licenza del codice sorgente.** Il codebase è rilasciato con licenza AGPL-3.0. Per il modello SaaS commerciale, è prevista una strategia di doppia licenza: la versione open-source resta AGPL-3.0, mentre il servizio ospitato su openself.dev è offerto come SaaS commerciale. Questa strategia è consolidata nel settore (GitLab, Mattermost, Nextcloud).

**Protezione dei dati personali.** Oltre alla conformità GDPR nativa dell'architettura (dati in UE, nessuna cessione a terzi, diritto alla cancellazione implementato), il piano prevede la stipula di un **DPA** (Data Processing Agreement) con ogni sub-responsabile del trattamento (Hetzner, provider LLM, Stripe). La DPIA è prevista tra le consulenze del primo anno.

### 9.5 Direzione Strategica — L'evoluzione verso l'identità digitale certificata

L'architettura di OpenSelf è predisposta per un'evoluzione naturale verso la certificazione dell'identità digitale professionale. I livelli L1 (auto-dichiarato) e L2 (verificato da connettori) sono già operativi. I livelli successivi rappresentano la direzione strategica post-Series A:

**L3 — Verificato da fonti istituzionali.** Integrazione di credenziali SPID/CIE per la verifica dell'identità anagrafica e di dati finanziari tramite Open Banking (via partner certificati come Tink o Plaid) per la verifica della capacità economica. OpenSelf non diventa un identity provider: consuma credenziali istituzionali come input per arricchire il profilo dell'utente.

**Posizionamento rispetto a eIDAS 2.0 e EUDI Wallet.** L'EUDI Wallet, in fase di implementazione da parte dei governi EU (2026-2027), fornirà a ogni cittadino un portafoglio di identità digitale legalmente vincolante. OpenSelf non compete con l'EUDI Wallet: lo complementa. L'EUDI Wallet certifica *chi sei* (nome, data di nascita, cittadinanza). OpenSelf certifica *cosa sai fare* (competenze, esperienze, pubblicazioni, attività verificate). La convergenza naturale è che OpenSelf consumi le credenziali EUDI come input L3 per il profilo professionale — aggiungendo contesto e narrativa a dati anagrafici altrimenti asettici.

**Validazione di mercato.** Il dialogo avviato con il creatore di Mooney (oggi in Intesa Sanpaolo) ha confermato che la frode nella creazione di conti bancari è un problema attuale e significativo. I profili professionali arricchiti e progressivamente verificati di OpenSelf rispondono a un bisogno reale del settore bancario e finanziario: ridurre il costo del KYC (attualmente EUR 50-200 per cliente) fornendo un quadro professionale pre-verificato.

**Perché non ora.** L'evoluzione verso L3 richiede risorse che un Pre-Seed non può coprire: compliance (DPO, DPIA estesa, accordi con identity provider certificati), partnership con provider Open Banking (costi di licenza EUR 10-20K), e un volume di utenti sufficiente a rendere l'integrazione economicamente sostenibile. Queste sono attività post-Series A, non pre-seed. Il piano attuale costruisce le fondamenta tecniche e la base utenti necessarie per rendere questa evoluzione possibile.

---

## 10. Impatto e Conclusioni

### 10.1 Impatto economico e sociale

OpenSelf affronta un problema strutturale del mercato del lavoro contemporaneo: la gestione della presenza professionale online è un'attività ad alto costo in termini di tempo e competenze, inaccessibile alla maggioranza dei professionisti che ne avrebbero maggior bisogno. Il risultato è una disuguaglianza digitale silenziosa: chi può permettersi un designer, un copywriter o le ore necessarie per aggiornare manualmente il proprio sito ha una presenza online efficace; chi non può — la vasta maggioranza dei professionisti indipendenti, dei lavoratori autonomi, dei ricercatori — ha un profilo LinkedIn abbandonato o un sito personale obsoleto.

**Democratizzazione della presenza professionale online.** OpenSelf riduce a cinque minuti di conversazione un processo che oggi richiede ore di lavoro specializzato. Un professionista indipendente che fattura EUR 50/ora e dedica 4 ore/mese alla gestione del proprio sito personale risparmia EUR 200/mese — un valore 40 volte superiore al costo del livello Pro. Per i professionisti a inizio carriera, il livello gratuito offre una pagina funzionante e aggiornata a costo zero.

**Guadagno di produttività misurabile.** I connettori e il sistema di aggiornamento autonomo eliminano la necessità di manutenzione manuale: la pagina si mantiene sincronizzata con le attività reali del professionista senza alcun intervento. Il risparmio stimato per un utente Pro attivo è di 3-5 ore/mese di lavoro manuale eliminato.

**Inclusione finanziaria.** L'evoluzione verso il dossier professionale verificato apre la strada all'inclusione finanziaria dei lavoratori indipendenti. I freelancer e i gig worker oggi faticano ad accedere al credito bancario perché mancano gli strumenti per dimostrare la propria affidabilità professionale in modo strutturato. Il dossier verificato di OpenSelf — che aggrega competenze, pubblicazioni, attività verificate dai connettori — è un primo passo concreto verso la riduzione di questa asimmetria informativa.

**Sovranità digitale italiana ed europea.** OpenSelf è un prodotto AI concepito, sviluppato e ospitato in Europa. I dati degli utenti risiedono su infrastruttura europea (Hetzner, Helsinki). L'architettura è conforme fin dalla progettazione al GDPR e all'AI Act. Nessun dato viene ceduto a terzi, utilizzato per la pubblicità, o impiegato per l'addestramento di modelli AI senza consenso esplicito. In un mercato dominato da piattaforme americane che monetizzano i dati personali degli utenti europei, OpenSelf rappresenta un'alternativa strutturalmente allineata ai valori e alla normativa dell'Unione Europea.

**Creazione di occupazione.** Il piano prevede la creazione di 2+ posti di lavoro equivalenti a tempo pieno entro M+18, con crescita progressiva a 3 persone entro M+24. Le assunzioni privilegiano talento italiano ed europeo, con un focus sulle competenze AI/LLM — un settore ad alta domanda e alta qualificazione.

### 10.2 Impatto sull'ecosistema startup italiano

**Validazione del modello fondatore singolo potenziato dall'AI.** Il progetto dimostra che un singolo fondatore tecnico, utilizzando sistematicamente strumenti AI come team di sviluppo aumentato, può costruire un prodotto di complessità e maturità equivalente a mesi di lavoro di un team di 3-5 sviluppatori. Se finanziato, OpenSelf diventa un modello replicabile per altri fondatori italiani che vogliono competere nel mercato AI globale con risorse limitate.

**Contributo all'ecosistema Roma/Lazio.** Il fondatore è residente a Roma e inserito nell'ecosistema professionale e accademico locale. La beta iniziale con focus sul network romano e laziale crea valore diretto per l'ecosistema: i beta tester diventano ambasciatori, i casi d'uso locali alimentano il riscontro prodotto-mercato, e il successo del progetto rafforza la credibilità di Roma come polo per startup AI.

**Ponte accademia-industria.** Il fondatore è alumnus LUISS (Economia e MBA). La connessione con la rete alumni LUISS è un'opportunità per creare un ponte tra la ricerca accademica in AI e l'applicazione commerciale. Collaborazioni con il dipartimento di Business & Management della LUISS per casi di studio sul modello di fondatore singolo potenziato dall'AI sono un'estensione naturale del progetto.

**Alternativa europea agli strumenti di personal branding americani.** Il mercato degli strumenti per la presenza online personale è oggi dominato da aziende americane (LinkedIn, Squarespace, Wix, Linktree, Carrd). Nessuna offre un'alternativa conforme fin dalla progettazione costruita in Europa, per gli europei, con dati in Europa. OpenSelf occupa questo spazio vuoto con un posizionamento che i competitor americani non possono replicare senza stravolgere il proprio modello di business basato sulla monetizzazione dei dati.

### 10.3 Sostenibilità del modello

La sostenibilità economica di OpenSelf si fonda su quattro pilastri verificabili:

1. **Economia unitaria validata.** Margine lordo unitario del 91% sul livello Pro e del 94% sul livello Portfolio+. Il costo variabile per utente (EUR 0,46-0,60/mese) è dominato dai costi LLM, in calo strutturale.

2. **Costi LLM in calo strutturale.** Oltre il 90% di riduzione tra il 2023 e il 2026. Tendenza guidata dalla concorrenza tra provider, dall'ottimizzazione hardware e dalla compressione dei modelli. Ogni riduzione migliora direttamente il margine senza richiedere aumenti di prezzo.

3. **Costi operativi contenuti.** EUR 20.000-40.000/anno nella fase iniziale, grazie all'architettura ottimizzata (SQLite, Hetzner, instradamento LLM per livello di costo) e al modello fondatore singolo potenziato dall'AI. Il contributo Pre-Seed 3.0 copre interamente questi costi per i primi 18 mesi.

4. **Pareggio raggiungibile.** Il punto di pareggio operativo è raggiungibile con ~1.076 utenti paganti (mix Pro + Portfolio+). Con l'espansione europea e l'introduzione del Pro+ Coach da Anno 4, il pareggio è un obiettivo realistico nella traiettoria Anno 4-5.

### 10.4 Perché finanziare OpenSelf

OpenSelf presenta caratteristiche distintive rispetto alla maggioranza delle proposte in fase pre-revenue:

1. **Il prodotto esiste ed è operativo.** Questo non è un documento di presentazione con bozze grafiche e promesse. Il prodotto è operativo su openself.dev, con un'architettura di produzione matura. Il rischio tecnico è stato eliminato. Il finanziamento serve a portare al mercato un prodotto che funziona, non a finanziare la speranza che un prodotto venga costruito.

2. **Efficienza di capitale significativa.** Un singolo fondatore ha costruito, con un investimento in strumenti AI di circa EUR 130/mese, un prodotto la cui complessità e maturità sono paragonabili a mesi di lavoro di un team di 3-5 sviluppatori. Il contributo Pre-Seed 3.0 amplifica questa efficienza, non la sostituisce.

3. **Tempistica di mercato ottimale.** Tre tendenze convergono nel rendere il 2026 il momento ideale: l'economia dei lavori indipendenti europea cresce al 12% annuo, l'adozione diffusa dell'AI ha eliminato la barriera psicologica all'uso di interfacce conversazionali, i costi LLM sono scesi di oltre il 90% in tre anni.

4. **Vantaggio competitivo europeo.** In un mercato post-AI Act, la conformità fin dalla progettazione non è un optional: è un requisito e un differenziatore competitivo. OpenSelf è nativamente conforme al GDPR e all'AI Act, con dati in Europa e nessuna cessione a terzi.

5. **Percorso chiaro verso la sostenibilità.** Margini lordi del 91%+ sul livello Pro, costi variabili in calo strutturale, pareggio raggiungibile a ~1.076 utenti paganti. Il contributo Pre-Seed 3.0 copre i primi 18 mesi; i ricavi crescenti e il capitale del fondatore coprono il periodo successivo.

6. **Direzione strategica con fondamenta solide.** OpenSelf non si limita al personal branding: ha una direzione strategica chiara verso l'identità professionale digitale certificata. I livelli L1+L2 sono già operativi, l'architettura è predisposta per l'evoluzione verso L3, e il dialogo con operatori del settore bancario ha validato la domanda di mercato. Il finanziamento Pre-Seed serve a costruire la base utenti e la trazione necessarie per rendere questa evoluzione possibile nel round successivo.

### 10.5 Conclusione

OpenSelf nasce dalla constatazione di un fallimento strutturale del mercato: la presenza professionale online — un asset sempre più critico per la carriera di ogni professionista — è gestita con strumenti statici, manuali e frammentati che producono rappresentazioni destinate all'obsolescenza nel momento stesso in cui vengono pubblicate. A questo si aggiunge un deficit di fiducia crescente: i professionisti indipendenti non possono dimostrare la propria credibilità in modo strutturato e verificabile.

La risposta di OpenSelf è architetturale, non cosmetica: un agente AI con memoria persistente a quattro livelli, connettori a dati in tempo reale, un worker autonomo che mantiene la pagina viva nel tempo, e un sistema di arricchimento progressivo del profilo che trasforma le informazioni da auto-dichiarate a verificate da fonti indipendenti. La differenza rispetto ai competitor non è una funzionalità aggiuntiva: è un cambio di paradigma da "pagina compilata" a "pagina che respira e che dimostra."

Il prodotto non è una promessa. È operativo, accessibile pubblicamente, e tecnicamente maturo — con un'architettura documentata, una copertura test rigorosa e un'ampiezza funzionale che supera ampiamente quanto richiesto per la validazione di mercato. Il rischio tecnico è stato eliminato prima ancora della presentazione del piano d'impresa.

Ciò che OpenSelf chiede è un contributo a fondo perduto per portare al mercato un prodotto che funziona: validare il riscontro prodotto-mercato con 50 utenti beta selezionati, lanciare i livelli Pro e Portfolio+, costruire la prima base di utenti paganti, e dimostrare che un prodotto AI europeo, conforme fin dalla progettazione, costruito da un singolo fondatore con strumenti AI, può competere nel mercato globale del personal branding digitale.

La visione va oltre: questi profili professionali arricchiti e progressivamente verificati sono le fondamenta su cui costruire l'identità digitale certificata del futuro. L'EUDI Wallet dirà *chi sei*. OpenSelf dirà *cosa sai fare* — e lo dimostrerà con evidenze verificabili. L'architettura è pronta. La domanda di mercato è validata. Il prodotto è live. Il passo successivo è la crescita.
