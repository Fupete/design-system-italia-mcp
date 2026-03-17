# CLAUDE.md — design-system-italia-mcp

Istruzioni e decisioni architetturali per Claude Code.
Leggere prima di modificare il codice.

---

## Contesto del progetto

Filo è un server MCP remoto non ufficiale che espone i dati del Design system
.italia ad assistenti AI (Claude, Cursor, VS Code). Progetto personale
sperimentale e non ufficiale a cura di Daniele Tabellini (Fupete).

Riferimento tecnico: [italia/dati-semantic-mcp](https://github.com/italia/dati-semantic-mcp)

---

## Struttura

```
design-system-italia-mcp/
├── src/
│   ├── index.ts                  # Entry point — HTTP + stdio transport, /health, /cache/invalidate
│   ├── cache.ts                  # In-memory cache — two TTL buckets: snapshot (24h) + githubIssues (15min)
│   ├── constants.ts              # URL e costanti condivise — SNAPSHOT_* + upstream — unica source of truth
│   ├── fetch.ts                  # Shared fetch helpers (fetchJson, fetchText) per i loader
│   ├── schemas.ts                # Zod output schemas per structuredContent
│   ├── slugify.ts                # Normalizzazione slug + SLUG_ALIASES + slugsToTry()
│   ├── types.ts                  # Tipi TypeScript condivisi
│   ├── utils.ts                  # Utility condivise (formatTimestamp)
│   ├── loaders/
│   │   ├── bsi.ts                # Sorgenti #1 #2 #3 — markup, status, token BSI (da snapshot)
│   │   ├── designers.ts          # Sorgente #4 — JSON linee guida (da snapshot, no yaml a runtime)
│   │   ├── devkit.ts             # Sorgenti #6 #7 #7b — index + stories + props Dev Kit (da snapshot)
│   │   ├── devkit-parser.ts      # Parser argTypes/props da stories.ts — usato solo da snapshot-static.ts (CI)
│   │   ├── github.ts             # Sorgente #8 — GitHub Issues REST API (unica sorgente live)
│   │   ├── meta.ts               # Sorgente #9 — versioni + designersUrl (da snapshot-meta.json)
│   │   └── tokens.ts             # Sorgente #5 — DTI + bridge BSI→IT con valueResolved (da snapshot)
│   └── tools/
│       ├── helpers.ts            # resolveSlug(), buildMeta() — shared tool helpers
│       ├── components.ts         # list_components, get_component, search_components, get_component_variant
│       ├── full.ts               # get_component_full
│       ├── guidelines.ts         # get_component_guidelines, list_by_status, list_accessibility_issues
│       ├── issues.ts             # get_component_issues, get_project_board_status
│       └── tokens.ts             # get_component_tokens, find_token
├── scripts/
│   ├── canary.ts                 # Canary runner — upstream health + snapshot freshness
│   ├── canary.config.ts          # Config canary: UPSTREAM_HEALTH + SNAPSHOT_FRESHNESS
│   ├── snapshot-static.ts        # CI: fetch sorgenti statiche + props DevKit → data-fetched/
│   ├── snapshot-devkit.ts        # CI: Playwright → markup HTML da Storybook → data-fetched/devkit/stories/
│   ├── find-slug-mismatches.ts   # Cross-source slug discovery
│   └── check-version.ts          # Verifica allineamento package.json + publiccode.yml + tag
├── .github/workflows/
│   ├── ci.yml                    # Typecheck + build su push/PR
│   ├── release.yml               # Docker multiarch + npm publish su tag
│   ├── upstream-snapshot.yml     # Weekly safety-net 04:00 UTC dom + workflow_dispatch → popola data-fetched
│   ├── version-check.yml         # Nightly 03:00 UTC: controlla versioni npm/dsnav, triggera snapshot
│   └── upstream-canary.yml       # Daily canary 07:00 UTC — apre issue su failure
├── Dockerfile
├── publiccode.yml
├── package.json                  # Version source of truth — letta da index.ts a runtime
└── tsconfig.json
```

**Regola soglia**: se un file supera ~400 righe, spezzarlo per modulo.
**Naming tool**: prefisso `dsi_*` previsto in v0.4.0 (breaking change, insieme a `bsi:{}` restructure).

---

## Architettura dati — snapshot nightly + GitHub Issues live

Tutte le sorgenti tranne GitHub Issues sono lette dal branch `data-fetched`,
popolato nightly dal workflow `upstream-snapshot.yml` o on-demand da
`version-check.yml` quando rileva una nuova versione upstream.

I loader leggono da URL `SNAPSHOT_*` definite in `src/constants.ts`
(raw GitHub sul branch `data-fetched`). Non fetchano mai le sorgenti
upstream direttamente — quello è compito degli script CI.

| # | Sorgente | Snapshot path | Note |
|---|----------|---------------|------|
| 1 | BSI markup | `data-fetched/bsi/components/{slug}.json` | Stabile |
| 2 | BSI status | `data-fetched/bsi/components-status.json` | Stabile |
| 3 | BSI tokens | `data-fetched/bsi/custom-properties.json` | ⚠️ Alpha |
| 3b | BSI root.scss | `data-fetched/bsi/root.scss` | Bridge --bsi-* → --it-* |
| 4 | Designers JSON | `data-fetched/designers/components/{slug}.json` | YAML→JSON in CI, stabile |
| 5 | Design Tokens | `data-fetched/design-tokens/variables.scss` | Stabile |
| 6 | Dev Kit index | `data-fetched/devkit/index.json` | ⚠️ Alpha |
| 7 | Dev Kit stories | `data-fetched/devkit/stories/{slug}.json` | ⚠️ Alpha — Playwright extracted |
| 7b | Dev Kit props | `data-fetched/devkit/props/{slug}.json` | ⚠️ Alpha — argTypes parsed in CI |
| 8 | GitHub Issues | live fetch runtime | Unica sorgente live — TTL 15min |
| 9 | DS meta/nav | `data-fetched/dsnav.json` + `snapshot-meta.json` | Versioni + nav |

URL snapshot: costanti `SNAPSHOT_*` in `src/constants.ts`.
URL upstream (canary + script CI): costanti senza prefisso in `src/constants.ts`.

**Perché branch data-fetched invece di fetch live?**
Elimina dipendenze di rete a runtime per le sorgenti core. Diff nightly
visibili su GitHub — cambio upstream rilevato prima di impattare il server.
`dataFetchedAt` nelle risposte riflette la data dell'ultimo snapshot CI.

**Perché BSI 3.x e non 2.x?**
BSI 2.x è stabile e ha le API di stato componenti (#2) e markup HTML (#1).
BSI 3.x aggiunge i token CSS strutturati per componente (`custom_properties.json` — sorgente #3)
e `_root.scss` con i bridge `--bsi-* → --it-*`, necessari per la risoluzione `valueResolved`.
Senza la 3.x non sarebbe possibile esporre il layer token. Dev Kit Italia è costruito su BSI 3.x.

**Regola**: non modificare mai le URL upstream nelle costanti.
Se una sorgente cambia struttura, aggiornare solo il loader corrispondente, non i tool.

**Nota sorgente #9**: Dev Kit Italia è un monorepo workspace. Il `package.json`
root ha `"version": "0.0.0"` — usare sempre `packages/dev-kit-italia/package.json`
per la versione reale. `snapshot-meta.json` include le versioni di BSI, Dev Kit e DS
al momento del fetch.

---

## CI snapshot — flusso nightly

```
version-check.yml (03:00 UTC nightly)
  → GET npm registry BSI + Dev Kit + dsnav.yaml
  → se versione cambiata → triggera upstream-snapshot.yml

upstream-snapshot.yml (04:00 UTC domenica safety-net + on trigger)
  → snapshot-static.ts: fetch BSI JSON, Designers YAML→JSON, Design Tokens,
    Dev Kit index, props (via devkit-parser.ts), dsnav, package.json
  → snapshot-devkit.ts: Playwright su italia.github.io/dev-kit-italia
    → markup HTML per componente
  → commit su branch data-fetched
  → snapshot-meta.json con versioni + fetchedAt timestamp

upstream-canary.yml (07:00 UTC daily)
  → upstream health: sorgenti upstream raggiungibili e strutturalmente valide
  → snapshot freshness: fetchedAt < 48h, conteggio file coerente
  → scrive HAS_FAILURES e FAILED_SOURCES su GITHUB_OUTPUT
  → apertura issue automatica: non ancora implementata
```

---

## Versioni nelle risposte

Ogni risposta include `meta.versions` con tre campi distinti:

```typescript
versions: {
  designSystem: string        // da snapshot-meta.json, es. "v1.10.1"
  bootstrapItalia: string     // da snapshot-meta.json, es. "3.0.0-alpha.2"
  devKitItalia: string        // da snapshot-meta.json, es. "1.0.0-alpha.5"
  designTokensItalia: string  // da snapshot-meta.json, es. "1.3.2"
}
```

E `meta.designersUrl` con l'URL verificato dalla nav (non dedotto dallo slug):
```typescript
designersUrl: string | null  // es. "https://designers.italia.it/design-system/componenti/accordion/"
```

---

## Slug matching — regola critica

Le sorgenti usano nomi diversi per lo stesso componente:

- BSI API: `accordion` (lowercase, hyphenated)
- components_status.json: `` `Accordion` `` (con backtick, Title Case)
- Designers Italia: `accordion` (lowercase)
- Dev Kit index.json: `componenti-accordion--documentazione` (id Storybook)
- Dev Kit stories snapshot: `accordion.json` (slug normalizzato)

**Source of truth per la lista componenti**: `components_status.json`
**Normalizzazione**: strip backtick + lowercase + trim → `accordion`
**Slug matching**: centralizzato in `src/slugify.ts`, non duplicare logica
**Convenzione**: slugify una volta all'entry point del tool (in `resolveSlug()`),
poi `slugsToTry()` sul risultato.

Se un componente non viene trovato in una sorgente secondaria,
la risposta include il campo `sources_available: string[]` con
le sorgenti che hanno risposto. Non fallire silenziosamente.

---

## Slug aliases — cross-source + user-facing

Tre livelli di alias centralizzati in `src/slugify.ts` (38 entry):
1. Cross-source — BSI ↔ Dev Kit ↔ BSI JSON filenames (e.g. tables↔tabelle)
2. EN plurals/synonyms — user writes "dialog", system finds "modal"
3. IT synonyms — user writes "fisarmonica", system finds "accordion"

`slugsToTry()` risolve bidirezionalmente e transitivamente.
Canonical slug risolto via `loadStatus()` — tutte le risposte
usano lo slug BSI canonical, mai l'alias dell'input utente.

---

## Dev Kit Italia — componentType, varianti e props

Dal `index.json` il campo `importPath` determina il pattern:
```
./packages/accordion/stories/it-accordion.stories.ts   → dedicated (web-component)
./packages/dev-kit-italia/stories/components/alert.stories.ts  → bundle (html-bsi)
```

`componentType`: `"web-component"` (dedicated) o `"html-bsi"` (bundle).
Derivato da `pattern` in `loadDevKitIndex()`.

**Varianti** — markup HTML per variante da snapshot Playwright
(`devkit/stories/{slug}.json`). Ogni file contiene un array di varianti
con `name` (titolo dalla pagina Storybook) e `html` (markup dal source panel).
Non più da parsing statico di stories.ts — eliminato in v0.3.0.

**Props** — argTypes/props da snapshot CI (`devkit/props/{slug}.json`).
Estratte da `devkit-parser.ts` durante `snapshot-static.ts`, non a runtime.
Include: nome attributo HTML `it-*`, tipo, descrizione IT, default, opzioni.

`get_component_variant(name, variantName)` pesca da BSI e Dev Kit variants
trasparentemente — restituisce tutti i match da entrambe le sorgenti.

---

## Cache

Due bucket TTL:
- `TTL.snapshot` — 24h (tutte le sorgenti da `data-fetched` branch)
- `TTL.githubIssues` — 15 min (unica sorgente live)

In sviluppo: `TTL.snapshot` ridotto a 1h.

Endpoint di invalidazione manuale:
```
POST /cache/invalidate
Authorization: Bearer <CACHE_INVALIDATION_TOKEN>
Body: { "source": "all" | "bsi" | "designers" | "tokens" | "devkit" | "github" | "meta" }
```

---

## Ogni risposta tool deve includere

```typescript
meta: {
  dataFetchedAt: string | null,  // data snapshot CI — null per Issues (live = formatTimestamp())
  sourceUrls: string[],          // URL upstream delle sorgenti (non URL snapshot interni)
  warnings: string[],            // sorgenti mancanti o errori non fatali
  versions?: DsVersions,         // designSystem / bootstrapItalia / devKitItalia / designTokensItalia
  designersUrl?: string | null,  // URL verificato da dsnav.json, non dedotto
  stability: 'alpha' | 'stable', // alpha se include token BSI 3.x o Dev Kit
}
```

Se una sorgente non risponde, includere nel campo `warnings` e
restituire comunque i dati delle sorgenti disponibili.

**Nota warnings**: aggiungere sempre un warning se `bootstrapItalia` o `devKitItalia`
contengono `alpha` nel numero di versione — il client deve sapere che il layer token
potrebbe avere breaking changes.

**Nota CC-BY-SA**: `get_component_guidelines` e `get_component_full` includono
contenuti editoriali da Designers Italia licenziati CC-BY-SA 4.0.
Aggiungere warning nelle risposte di questi tool.

---

## Transport

- **Remoto (default)**: HTTP con Streamable HTTP transport
- **Locale (self-hosting)**: StdioServerTransport
  Selezionabile via env: `TRANSPORT=stdio` (default: `http`)

---

## Pipeline consigliata per i tool

I tool sono organizzati per progressive disclosure: inizia dal meno
costoso e aggrega solo quando necessario.
```
1. DISCOVERY
   ping                        → verifica connessione + lista tool
   list_components             → panoramica tutti i componenti con stato
   search_components(query)    → trova per nome / alias IT-EN / tag Dev Kit
   list_by_status(status)      → filtra per stato BSI / Dev Kit
   list_accessibility_issues   → componenti con note a11y aperte

2. TOOL SPECIFICO  (usa il tool più mirato per la domanda)
   get_component(name) → markup HTML + varianti Dev Kit
   get_component_variant(name, variantName) → markup completo di una variante
   get_component_guidelines(name) → linee guida d'uso e accessibilità
   get_component_tokens(name) → token CSS --bsi-* con valueResolved
   get_component_issues(name) → issue GitHub aperte
   find_token(query) → ricerca token per nome o descrizione
   get_project_board_status → stato aggregato board GitHub

3. AGGREGAZIONE  (solo se servono dati da più sorgenti insieme)
   get_component_full(name) → tutte le sorgenti in una risposta unica
```

Regola: non usare `get_component_full` come prima chiamata di default.
Usarlo solo quando la risposta richiede dati aggregati da più sorgenti.
I tool al livello 2 sono il livello corretto per la maggior parte delle query.

**Nota WAI-ARIA**: i dati Dev Kit (props `it-*`, argTypes) riguardano
i web component — non trasferire attributi WAI-ARIA o props Dev Kit in
contesto BSI puro (HTML classico). Le sorgenti sono complementari,
non intercambiabili.

---

## Truncation varianti

BSI variants e Dev Kit variants usano la stessa interfaccia:
```typescript
{
  variantsCount: number,
  variantsAvailable: string[],  // tutti i nomi
  variants: ComponentVariant[]  // prime N (default 3)
}
```

`maxVariants` parametro opzionale in `get_component` (default 3).
`get_component_variant` per richiederne una specifica per nome.
`get_component_full` tronca a 3 sia BSI che Dev Kit variants.

---

## Cosa NON fare

- Non integrare conoscenza pregressa di Bootstrap nella logica dei tool
- Non leggere sorgenti upstream direttamente nei loader —
  usare sempre le costanti `SNAPSHOT_*` che puntano al branch `data-fetched`
- Non usare Playwright nei loader o tool — Playwright è solo per `snapshot-devkit.ts` (CI)
- Non committare manualmente nel branch `data-fetched` — popolato solo dal CI
- Non parsare YAML a runtime — la conversione YAML→JSON avviene nel CI (`snapshot-static.ts`)
- Non rimuovere `devkit-parser.ts` — serve a `snapshot-static.ts` per estrarre
  props/argTypes dei web component nel CI
- Non usare `require()` — il progetto è ESM, usare sempre import statico
- Non aggiungere dipendenze pesanti senza discuterne prima
- Non duplicare la logica di slug matching fuori da `slugify.ts`
- Non fallire silenziosamente se una sorgente non risponde
- Non usare il `package.json` root di dev-kit-italia per la versione (è `"0.0.0"`)
- Non dichiarare VERSION manualmente — viene letta da `package.json` a runtime via `createRequire`
- Non usare `server.tool()` — usare sempre `server.registerTool()` con `title`, `inputSchema`, `annotations`
- Non duplicare l'oggetto output — costruirlo una volta e riusare per `content` e `structuredContent`

---

## Dipendenze previste

```json
{
  "@modelcontextprotocol/sdk": "^1.27.0",
  "zod": "^3.23.0"
}
```

`js-yaml` è in devDependencies — usato solo dagli script snapshot CI, non a runtime.
`playwright` è in devDependencies — usato solo da `snapshot-devkit.ts` in CI.

Evitare dipendenze aggiuntive se possibile. Preferire API native Node.js.

---

## Licenza e copyright

BSD 3-Clause — © 2026 Daniele Tabellini (Fupete)