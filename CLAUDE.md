# CLAUDE.md — design-system-italia-mcp

Istruzioni e decisioni architetturali per Claude Code.
Leggere prima di modificare il codice.

---

## Contesto del progetto

Server MCP remoto non ufficiale che espone i dati del Design System
.italia ad assistenti AI (Claude, Cursor, VS Code). Progetto personale
sperimentale di Daniele Tabellini — non affiliato a DTD o Designers Italia.

Riferimento tecnico: [italia/dati-semantic-mcp](https://github.com/italia/dati-semantic-mcp)

---

## Struttura
```
design-system-italia-mcp/
├── src/
│   ├── index.ts                  # Entry point — HTTP + stdio transport, /health, /cache/invalidate
│   ├── cache.ts                  # In-memory cache — two TTL buckets: snapshot (24h) + githubIssues (15min)
│   ├── constants.ts              # URL e costanti condivise — upstream (SNAPSHOT_* + upstream) — unica source of truth
│   ├── fetch.ts                  # Shared fetch helpers (fetchJson, fetchText) per i loader
│   ├── schemas.ts                # Zod output schemas per structuredContent
│   ├── slugify.ts                # Normalizzazione slug + SLUG_ALIASES + slugsToTry()
│   ├── types.ts                  # Tipi TypeScript condivisi
│   ├── utils.ts                  # Utility condivise (formatTimestamp)
│   ├── loaders/
│   │   ├── bsi.ts                # Sorgenti #1 #2 #3 — markup, status, token BSI (da snapshot)
│   │   ├── designers.ts          # Sorgente #4 — JSON linee guida (da snapshot, no yaml a runtime)
│   │   ├── devkit.ts             # Sorgenti #6 #7 — index + stories + props Dev Kit (da snapshot)
│   │   ├── devkit-parser.ts      # Parser argTypes/props da stories.ts — usato da devkit.ts e snapshot-static.ts
│   │   ├── github.ts             # Sorgente #8 — GitHub Issues REST API (unica sorgente live)
│   │   ├── meta.ts               # Sorgente #9 — versioni + designersUrl (da snapshot)
│   │   └── tokens.ts             # Sorgente #5 — DTI + bridge BSI→IT (da snapshot)
│   └── tools/
│       ├── components.ts         # list_components, get_component, search_components, get_component_variant
│       ├── full.ts               # get_component_full
│       ├── guidelines.ts         # get_component_guidelines, list_by_status, list_accessibility_issues
│       ├── helpers.ts            # resolveSlug(), buildMeta() — shared tool helpers
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
│   ├── upstream-snapshot.yml     # Weekly safety-net 04:00 UTC + workflow_dispatch → popola data-fetched branch
│   └── version-check.yml         # Nightly 03:00 UTC: controlla versioni npm/dsnav, triggera snapshot se cambiate
```

**Regola soglia**: se un file supera ~400 righe, spezzarlo per modulo.
**Naming tool**: prefisso `dsi_*` previsto in v0.3.0 (breaking change).

---

## Sorgenti dati — snapshot nightly + GitHub Issues live

Tutte le sorgenti tranne GitHub Issues sono lette dal branch `data-fetched`,
popolato nightly dal workflow `upstream-snapshot.yml` o on-demand da
`version-check.yml` quando rileva una nuova versione upstream.

| # | Sorgente | Snapshot path | Note |
|---|----------|--------------|------|
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
URL upstream (canary + script): costanti esistenti in `src/constants.ts`.

**Perché branch data-fetched invece di fetch live?**
Elimina dipendenze di rete a runtime per le sorgenti core. Diff nightly
visibili su GitHub — cambio upstream rilevato prima di impattare il server.
`dataFetchedAt` nelle risposte riflette la data dell'ultimo snapshot CI.

---

## Versioni nelle risposte

Ogni risposta include `meta.versions` con tre campi distinti:

```typescript
versions: {
  designSystem: string      // da dsnav.yaml → tag.label, es. "v1.10.1"
  bootstrapItalia: string   // da BSI package.json → .version, es. "3.0.0-alpha.2"
  devKitItalia: string      // da Dev Kit packages/dev-kit-italia/package.json → .version
}
```

E `meta.designersUrl` con l'URL verificato dalla nav (non dedotto dallo slug):
```typescript
designersUrl: string | null  // es. "https://designers.italia.it/design-system/componenti/accordion/"
```

Il meta loader usa `Promise.allSettled` — nessuna versione è critica per la risposta principale.

---

## Slug matching — regola critica

Le sorgenti usano nomi diversi per lo stesso componente:

- BSI API: `accordion` (lowercase, hyphenated)
- components_status.json: `` `Accordion` `` (con backtick, Title Case)
- Designers Italia YAML: `accordion` (lowercase)
- Dev Kit index.json: `componenti-accordion--documentazione` (id Storybook)
- Dev Kit stories: `packages/accordion/stories/it-accordion.stories.ts`

**Source of truth per la lista componenti**: `components_status.json`
**Normalizzazione**: strip backtick + lowercase + trim → `accordion`
**Slug matching**: centralizzato in `src/slugify.ts`, non duplicare logica

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

## Dev Kit Italia — due pattern + story variants

Dal `index.json` il campo `importPath` può essere:
```
./packages/accordion/stories/it-accordion.stories.ts   → dedicated (web-component)
./packages/dev-kit-italia/stories/components/alert.stories.ts  → bundle (html-bsi)
```

`componentType`: `"web-component"` (dedicated) o `"html-bsi"` (bundle).
Derivato da `pattern` in `loadDevKitIndex()`.

`parseStoryVariants()` estrae il markup HTML render da tutte le stories.ts
(dedicated e bundle). Tre pattern: inline render, function body, variable reference.
38/39 componenti parsati (sticky = args-driven, 0 varianti = corretto).

`loadStoryVariants()` ritorna varianti con truncation unificata:
stessa interfaccia di BSI variants (`count` + `available` + `variants` prime N).

`get_component_variant(name, variantName)` pesca da BSI e story variants
trasparentemente — restituisce tutti i match da entrambe le sorgenti.

---

## Cache

Due bucket TTL:
- `TTL.snapshot` — 24h (tutte le sorgenti da data-fetched branch)
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
  versions?: DsVersions,         // designSystem / bootstrapItalia / devKitItalia
  designersUrl?: string | null,  // URL verificato da dsnav.json, non dedotto
  stability: 'alpha' | 'stable', // alpha se include token BSI 3.x o Dev Kit
}
```

Se una sorgente non risponde, includere nel campo `warnings` e
restituire comunque i dati delle sorgenti disponibili.

**Nota warnings**: aggiungere sempre un warning se `bootstrapItalia` o `devKitItalia`
contengono `alpha` nel numero di versione — il client deve sapere che il layer token
potrebbe avere breaking changes.

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
   get_component(name) → markup HTML + story variants
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

## Cosa NON fare

- Non integrare conoscenza pregressa di Bootstrap nella logica dei tool
- Non usare `require()` — il progetto è ESM, usare sempre import statico
- Non aggiungere dipendenze pesanti senza discuterne prima
- Non duplicare la logica di slug matching fuori da `slugify.ts`
- Non fallire silenziosamente se una sorgente non risponde
- Non usare il `package.json` root di dev-kit-italia per la versione (è `"0.0.0"`)
- Non dichiarare VERSION manualmente — viene letta da `package.json` a runtime via `createRequire`
- Non usare `server.tool()` — usare sempre `server.registerTool()` con `title`, `inputSchema`, `annotations`
- Non duplicare l'oggetto output — costruirlo una volta e riusare per `content` e `structuredContent`
- Non leggere sorgenti upstream direttamente nei loader —
  usare sempre le costanti SNAPSHOT_* che puntano al branch data-fetched
- Non rimuovere parseStories() in devkit-parser.ts — serve per estrarre
  props/argTypes dei web component nel CI snapshot (snapshot-static.ts)
- Non usare Playwright nei loader o tool — Playwright è solo per snapshot-devkit.ts (CI)
- Non committare manualmente nel branch data-fetched — popolato solo dal CI
- Non parsare YAML a runtime — la conversione YAML→JSON avviene nel CI (snapshot-static.ts)

---

## Truncation varianti

BSI variants e Dev Kit story variants usano la stessa interfaccia:
```typescript
{
  variantsCount: number,
  variantsAvailable: string[],  // tutti i nomi
  variants: ComponentVariant[]  // prime N (default 3)
}
```

`maxVariants` parametro opzionale in `get_component` (default 3).
`get_component_variant` per richiederne una specifica per nome.
`get_component_full` tronca a 3 sia BSI che storyVariants.

---

## Dipendenze previste

```json
{
  "@modelcontextprotocol/sdk": "^1.12.0",
  "zod": "^3.23.0"
}
```

`js-yaml` è in devDependencies — usato solo dagli script snapshot CI, non a runtime.
`playwright` è in devDependencies — usato solo da snapshot-devkit.ts in CI.

Evitare dipendenze aggiuntive se possibile. Preferire API native Node.js.

---

## Licenza e copyright

BSD 3-Clause — © 2026 Daniele Tabellini (Fupete)