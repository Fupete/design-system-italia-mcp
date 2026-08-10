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
│   ├── index.ts                       # Entry point — HTTP + stdio transport, /health, /cache/invalidate, ping
│   ├── cache.ts                       # In-memory cache — two TTL buckets: snapshot (24h) + githubIssues (15min)
│   ├── constants.ts                   # URL e costanti condivise — SNAPSHOT_* + upstream + BETA_WARNING — unica source of truth
│   ├── fetch.ts                       # Shared fetch helpers (fetchJson, fetchText) per i loader
│   ├── schemas.ts                     # Zod output schemas per structuredContent — copertura parziale, vedi sotto
│   ├── slugify.ts                     # Normalizzazione slug + SLUG_ALIASES + slugsToTry()
│   ├── types.ts                       # Tipi TypeScript condivisi — ResolvedHop, TokenRole, DevKitEntry, UnionRow, ecc.
│   ├── utils.ts                       # Utility condivise (formatTimestamp)
│   ├── loaders/
│   │   ├── bsi.ts                     # Sorgenti #1 #2 #3 — markup, status, token BSI (da snapshot)
│   │   ├── designers.ts               # Sorgente #5 — JSON linee guida (da snapshot, no yaml a runtime)
│   │   ├── devkit.ts                  # Sorgenti #7 #8 #9 — index + stories + props Dev Kit (da snapshot)
│   │   ├── devkit-parser.ts           # Parser argTypes/props da stories.ts — usato da snapshot-static.ts (CI) e come fallback runtime in devkit.ts
│   │   ├── github.ts                  # Sorgente #10 — GitHub Issues REST API (unica sorgente live)
│   │   ├── meta.ts                    # Sorgente #11 — versioni + designersUrl (da snapshot-meta.json)
│   │   └── tokens.ts                  # Sorgente #4 + #6 — bridge BSI→IT, DTI, resolveToken/findComponentsByToken/resolveTokenValues, roleFor/hopFor
│   └── tools/
│       ├── helpers.ts                 # resolveSlug(), buildMeta(), buildComponentUnion()/unionRows() — shared tool helpers
│       ├── dsi-list-components.ts     # dsi_list_components — unione vera BSI ∪ Dev Kit
│       ├── dsi-search-components.ts   # dsi_search_components — ricerca sulla stessa unione
│       ├── bsi-list-component-variants.ts    # bsi_list_component_variants
│       ├── bsi-get-component-markup.ts       # bsi_get_component_markup
│       ├── bsi-list-components-by-status.ts  # bsi_list_components_by_status
│       ├── devkit-list-component-variants.ts # devkit_list_component_variants
│       ├── devkit-get-component-markup.ts    # devkit_get_component_markup
│       ├── devkit-list-component-props.ts    # devkit_list_component_props
│       ├── tokens-list-component-vars.ts     # tokens_list_component_vars
│       ├── tokens-list-globals.ts            # tokens_list_globals
│       ├── tokens-resolve.ts                 # tokens_resolve
│       ├── tokens-find-components.ts         # tokens_find_components
│       ├── tokens-search.ts                  # tokens_search
│       ├── docs-get-component-guide.ts       # docs_get_component_guide
│       ├── github-get-component-issues.ts    # github_get_component_issues
│       └── github-get-project-repo-links.ts  # github_get_project_repo_links
├── scripts/
│   ├── canary.ts                      # Canary runner — upstream health + snapshot freshness
│   ├── canary_config.ts               # Config canary: UPSTREAM_HEALTH + SNAPSHOT_FRESHNESS
│   ├── snapshot-static.ts             # CI: fetch sorgenti statiche + props DevKit → data-fetched/
│   ├── snapshot-devkit.ts             # CI: Playwright → markup HTML da Storybook → data-fetched/devkit/stories/
│   ├── find-slug-mismatches.ts        # Cross-source slug discovery
│   └── check-version.ts               # Verifica allineamento package.json + publiccode.yml + tag
├── *_test.ts                          # node:test — cache, health, devkit-parser, helpers, tokens (pure functions: unionRows, roleFor/hopFor, normalizeTokenName, resolveChain)
├── .github/workflows/
│   ├── ci.yml                         # Typecheck + build su push/PR
│   ├── test.yml                       # Typecheck + npm run test su push/PR su main
│   ├── release.yml                    # Docker multiarch + npm publish su tag
│   ├── upstream-snapshot.yml          # Weekly safety-net 04:00 UTC dom + workflow_dispatch → popola data-fetched
│   ├── version-check.yml              # Nightly 03:00 UTC: controlla versioni npm/dsnav, triggera snapshot
│   └── upstream-canary.yml            # Daily canary 07:00 UTC — apre issue su failure
├── Dockerfile
├── publiccode.yml
├── package.json                       # Version source of truth — letta da index.ts a runtime
└── tsconfig.json
```

**Nota manutenzione**: l'array `tools` nel payload di `ping` (in `index.ts`) è mantenuto a mano, non derivato programmaticamente dai `register*` — se aggiungi o rimuovi un tool, aggiornalo anche lì. 

**Regola soglia**: se un file supera ~400 righe, spezzarlo per modulo.

**Naming tool (v0.4.0 — mersato)**:
  - Namespace per sorgente/asse: `dsi_` (inventario unificato componenti — unione vera, non BSI-guidata), `bsi_`, `devkit_` (markup/varianti/props — mirror solo dove le sorgenti producono artefatti distinti), `tokens_` (asse sorgente css-var/token collassato in un unico namespace ombrello — la chain di risoluzione è una sola e Dev Kit consuma le stesse `--bsi-*`, il confine bsi_/tokens_ per var era artificiale), `docs_`, `github_`.
  - Verbi: `list_` = elenco nomi/righe senza markup pesante, `get_` = markup/dato atomico singolo, `search_`/`find_`/`resolve_` invariati.
  - **Nessun tool aggregatore**: `get_component_full` rimosso — non passava il test aggregatore in eval (il modello lo usava come scorciatoia verbosa, non come workflow cross-namespace mirato; risposte 8000+ token per componenti come Card). Combinare più fonti in un'unica risposta è ora responsabilità del client, componendo più chiamate.
  - **Nessun tool `list_accessibility_issues`**: rimosso, sovrapposizione con `github_get_component_issues` — un solo canale per le issue. Lo stato a11y per-componente resta in `dsi_list_components` (campo `bsi.accessibility`) e `docs_get_component_guide`.
  - 17 tool totali (16 registrati via `register*` + `ping`, quest'ultimo definito direttamente in `index.ts`).
  - Deviazioni note codice↔CSV contratto (`toolsroadmapfullwithbumps.csv`), da allineare: `bsi_list_component_variants` senza `maxVariants` (lista sempre completa); `*_get_component_markup` con `variant` opzionale invece di `variantName` richiesto; `tokens_list_globals` usa il parametro `match` nel codice contro `category` nel CSV.
  - `bsi_list_components_by_status` ora accetta `library` (`bootstrapItalia` default | `devKitItalia`) — `components_status.json` traccia lo stato anche per Dev Kit Italia. **Breaking**: il campo `bsiDoc` nel risultato è rinominato `docUrl` (dipende da quale libreria filtri).

---

## Architettura dati — snapshot nightly + GitHub Issues live

Tutte le sorgenti tranne GitHub Issues sono lette dal branch `data-fetched`,
popolato nightly dal workflow `upstream-snapshot.yml` o on-demand da
`version-check.yml` quando rileva una nuova versione upstream.

I loader leggono da URL `SNAPSHOT_*` definite in `src/constants.ts`
(raw GitHub sul branch `data-fetched`). Non fetchano mai le sorgenti
upstream direttamente — quello è compito degli script CI.

| #  | Sorgente | Branch | Snapshot path | Contenuto | Note |
|----|----------|--------|---------------|-----------|------|
| 1  | BSI markup | `3.x` | `bsi/components/{slug}.json` | Markup HTML varianti per componente | ⚠️ beta, branch temporaneo |
| 2  | BSI status | `3.x` | `bsi/components-status.json` | ~55 componenti, stato librerie (BSI/UI Kit/Dev Kit), accessibilità, note issue | Stabile |
| 3  | BSI tokens | `3.x` | `bsi/custom-properties.json` | Token CSS `--bsi-*` per-componente | ⚠️ beta, branch temporaneo |
| 4  | BSI root.scss | `3.x` | `bsi/root.scss` | Bridge `--bsi-*` → `--it-*` | ⚠️ beta, token resolution |
| 5  | Designers JSON | `main` | `designers/components/{slug}.json` | Linee guida d'uso, accessibilità (YAML→JSON in CI) | Stabile |
| 6  | Design Tokens | `main` | `design-tokens/variables.scss` | Token globali `--it-*` con valori concreti | Stabile |
| 7  | Dev Kit index | `main` | `devkit/index.json` | Indice Storybook: tag stato, varianti, id univoco (`entry.id`), importPath | ⚠️ beta |
| 8  | Dev Kit stories | `main` | `devkit/stories/{slug}.json` | Markup HTML per variante — Playwright extracted | ⚠️ beta |
| 9  | Dev Kit props | `main` | `devkit/props/{slug}.json` | Props `it-*`: attributi HTML, tipo, descrizione, default, opzioni | ⚠️ beta |
| 10 | GitHub Issues | live runtime | — | Issue aperte: bootstrap-italia, design-ui-kit, dev-kit-italia, design-tokens-italia | Unica sorgente live — TTL 15min |
| 11 | DS meta/nav | snapshot | `dsnav.json` + `snapshot-meta.json` | Versioni DS/BSI/DevKit/DTI + URL verificati componenti | In ogni risposta meta |

**Catena di risoluzione token** (sorgenti #3 → #4 → #6, in `loaders/tokens.ts`):
```
--bsi-accordion-body-padding-x: var(--bsi-spacing-m)   ← #3 custom-properties.json (bsiMap)
--bsi-spacing-m: #{tokens.$it-spacing-m}                ← #4 root.scss (bridge, post @use/@forward)
$it-spacing-m: $it-spacing-6x                           ← #6 variables.scss (dtiRaw, alias)
$it-spacing-6x: 24px // 6x la dimensione della baseline ← #6 variables.scss (dtiRaw, literal + comment)
```
`resolveChain()` segue la catena ricorsivamente e restituisce sia il valore finale
che ogni hop intermedio come `ResolvedHop`. `bsi.ts` gestisce solo #1 #2 #3.

**Modello di manipolabilità (T-MANIP)** — `resolvedVia: ResolvedHop[]`, non `string[]`:
```typescript
interface ResolvedHop {
  name: string          // chiave interna normalizzata
  sourceName: string     // "$it-spacing-6x" per dti, "--bsi-spacing-m" per bsi-*
  form: 'css-custom-property' | 'sass-variable'
  role: 'bsi-component' | 'bsi-global' | 'dti'
  overridable: boolean  // true per --bsi-* (sovrascrivibile a runtime), false per --it-*/$it-* (centrale)
}
```
`roleFor()`/`hopFor()` in `loaders/tokens.ts` derivano il ruolo: se il nome è chiave
in `dtiRaw` → `'dti'`; se è chiave nel `bridge` → `'bsi-global'`; altrimenti
`'bsi-component'`. Il discriminante primario è l'appartenenza alle mappe, **non**
il prefisso `--it-`/`--bsi-` — `parseDesignTokens()` mappa qualsiasi `$foo:` a
`--foo`, quindi un Design Token senza prefisso `it-` verrebbe altrimenti
etichettato erroneamente come `bsi-component`/`overridable:true`.

**Perché branch data-fetched invece di fetch live?**
Elimina dipendenze di rete a runtime per le sorgenti core. Diff nightly
visibili su GitHub — cambio upstream rilevato prima di impattare il server.
`dataFetchedAt` nelle risposte riflette la data dell'ultimo snapshot CI.

**Perché BSI 3.x e non 2.x?**
BSI 2.x è stabile e ha le API di stato componenti (#2) e markup HTML (#1).
BSI 3.x aggiunge i token CSS strutturati per componente (`custom_properties.json` — sorgente #3)
e `_root.scss` (sorgente #4) con i bridge `--bsi-* → --it-*`, necessari per la risoluzione `valueResolved`.
Senza la 3.x non sarebbe possibile esporre il layer token. Dev Kit Italia è costruito su BSI 3.x.

**Regola**: non modificare mai le URL upstream nelle costanti.
Se una sorgente cambia struttura, aggiornare solo il loader corrispondente, non i tool.

**Nota sorgente #11**: Dev Kit Italia è un monorepo workspace. Il `package.json`
root ha `"version": "0.0.0"` — usare sempre `packages/dev-kit-italia/package.json`
per la versione reale. `snapshot-meta.json` include le versioni di BSI, Dev Kit e DS
al momento del fetch.

**Nota sulla doppia natura di "stabile"**: la colonna Note di questa tabella
misura il rischio di URL/schema (branch temporaneo, a rischio ristrutturazione),
non lo stato di beta/stable del *contenuto*. `components_status.json` (#2) è
schema-stabile, non è mai stato segnato "branch temporaneo", ma il suo
contenuto descrive lo stato di componenti dentro BSI 3.x/Dev Kit Italia, quindi
`bsi_list_components_by_status` è comunque `stability: 'beta'` a livello tool.
Le due classificazioni misurano cose diverse e possono legittimamente non
coincidere, non è un'incoerenza da correggere quando succede.

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

test.yml (ad ogni push/PR su main)
  → npm run typecheck
  → npm run test (node:test — cache, health, devkit-parser, helpers, tokens)
```

---

## Test

`node:test`, nessuna dipendenza aggiuntiva. Suite su funzioni pure esportate
(`unionRows`, `roleFor`/`hopFor`, `normalizeTokenName`, `resolveChain` e simili)
oltre a cache/health/devkit-parser preesistenti. Le funzioni pure sono più
facili da testare con fixture che verificare solo end-to-end via MCP Inspector —
diversi bug reali (B1, B2, B4 sull'union model e la risoluzione token) sono stati
trovati proprio da questi test, non dalla sola verifica manuale.

```bash
npm run typecheck && npm run test
```

Eseguito automaticamente da `test.yml` ad ogni push/PR su `main`.

---

## Versioni nelle risposte

Ogni risposta include `meta.versions` con tre campi distinti:

```typescript
versions: {
  designSystem: string        // da snapshot-meta.json, es. "v1.10.1"
  bootstrapItalia: string     // da snapshot-meta.json, es. "3.0.0-beta.4"
  devKitItalia: string        // da snapshot-meta.json, es. "1.0.0-beta.0"
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
- Dev Kit index.json: `componenti-accordion--documentazione` (id Storybook, univoco garantito)
- Dev Kit stories snapshot: `accordion.json` (slug normalizzato)

**Source of truth per la lista componenti**: `components_status.json` ∪ `devkit/index.json` (unione, vedi `dsi_list_components`)
**Normalizzazione**: strip backtick + lowercase + trim → `accordion`
**Slug matching**: centralizzato in `src/slugify.ts`, non duplicare logica
**Convenzione**: slugify una volta all'entry point del tool (in `resolveSlug()`),
poi `slugsToTry()` sul risultato.

Se un componente non viene trovato in una sorgente secondaria, la risposta lo
riflette nel campo `null` corrispondente (`bsi: null` o `devkit: null` in
`dsi_list_components`/`dsi_search_components`) oppure in `warnings`. Non fallire
silenziosamente.

---

## Slug aliases — cross-source + user-facing

Alias centralizzati in `src/slugify.ts` (`SLUG_ALIASES`), tre livelli:
1. Cross-source — BSI ↔ Dev Kit ↔ BSI JSON filenames (e.g. tables↔tabelle)
2. EN plurals/synonyms — user writes "dialog", system finds "modal"
3. IT synonyms — user writes "fisarmonica", system finds "accordion"

`slugsToTry()` risolve bidirezionalmente e transitivamente.
Canonical slug risolto via `loadStatus()` — tutte le risposte
usano lo slug BSI canonical, mai l'alias dell'input utente.

**Identità per l'unione BSI∪DevKit**: `unionRows()` in `tools/helpers.ts` usa
`DevKitEntry.id` (Storybook entry id, garantito univoco) come chiave di identità
per evitare collisioni sull'alias guard — **non** `importPath` né lo slug, che
possono essere condivisi da componenti bundle-pattern. Risolve in due sotto-passate
(1a exact match, poi 1b alias match) così l'ordine di iterazione della Map non
decide chi vince un Dev Kit entry conteso da due slug BSI che aliasano allo stesso
componente.

---

## Coherence check tra sorgenti — pattern riusabile

Alcune sorgenti descrivono lo stesso dato reale da punti diversi, aggiornati
con cadenze diverse: una board a mano (`components_status.json`, editata da
persone) contro uno snapshot derivato in automatico (`devkit/index.json`,
CI). Quando questo succede, non c'è una fonte "giusta" a priori — solo due
osservazioni dello stesso fatto che possono disallinearsi nel tempo.

Pattern: funzione pura in `helpers.ts`, confronto di uguaglianza, ritorna
`null` se combaciano o se manca uno dei due valori (niente da confrontare),
altrimenti un messaggio pronto per `warnings`. Mai un errore fatale — nessuna
delle due sorgenti è più autorevole dell'altra, si segnala la divergenza e
si lascia decidere al chiamante.

```typescript
// helpers.ts
export function devKitUrlMismatch(
  slug: string,
  boardUrl: string | null | undefined,
  storybookUrl: string | null | undefined
): string | null {
  if (!boardUrl || !storybookUrl || boardUrl === storybookUrl) return null
  return `Dev Kit URL mismatch for "${slug}": components_status.json has "${boardUrl}", ` +
    `Dev Kit index.json has "${storybookUrl}" — one source may be stale.`
}
```

Usato oggi da `docs_get_component_guide` (`sourceUrls.devKitDoc` vs
`devKit.storybookUrl`). Stesso pattern applicabile ad altre coppie
board/snapshot se emergono — funzione pura testabile con fixture
(`helpers_test.ts`), non richiede fetch né stato.

---

## Dev Kit Italia — componentType, varianti e props

Dal `index.json` il campo `importPath` determina il pattern:
```
./packages/accordion/stories/it-accordion.stories.ts   → dedicated (web-component)
./packages/dev-kit-italia/stories/components/alert.stories.ts  → bundle (html-bsi)
```

`componentType`: `"web-component"` (dedicated) o `"html-bsi"` (bundle).
Derivato da `pattern` in `loadDevKitIndex()`.

`DevKitEntry.displayName` è derivato dall'ultimo segmento del titolo Storybook
(es. "Componenti/Video player" → "Video player") — il campo `name` grezzo
nell'indice è sempre la stringa letterale "Documentazione" per le entry `docs`,
non un nome visualizzabile.

**Varianti** — markup HTML per variante da snapshot Playwright
(`devkit/stories/{slug}.json`). Ogni file contiene un array di varianti
con `name` (titolo dalla pagina Storybook) e `html` (markup dal source panel).

**Props** — argTypes/props da snapshot CI (`devkit/props/{slug}.json`).
Estratte da `devkit-parser.ts` durante `snapshot-static.ts`, non a runtime.
Include: nome attributo HTML `it-*`, tipo, descrizione IT, default, opzioni.

`bsi_get_component_markup` e `devkit_get_component_markup` sono separati per
namespace (v0.4.0) — a differenza del vecchio `get_component_variant`, non
pescano più trasparentemente da entrambe le sorgenti in un'unica chiamata.

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
  stability: 'beta' | 'stable',  // beta se include token BSI 3.x o dati Dev Kit — nessuna sorgente resta 'alpha'
}
```

Se una sorgente non risponde, includere nel campo `warnings` e
restituire comunque i dati delle sorgenti disponibili.

**Nota warnings**: `BETA_WARNING` (in `constants.ts`, ex `ALPHA_WARNING`) va
aggiunto a `warnings` per i tool che espongono dati da sorgenti beta. Copertura
**non uniforme** ad oggi: presente in tutti i tool `tokens_` e in
`docs_get_component_guide`; assente nei tool `bsi_`/`devkit_`
(`bsi_get_component_markup`, `bsi_list_component_variants`,
`devkit_get_component_markup`, `devkit_list_component_variants`,
`devkit_list_component_props`) e in `dsi_list_components`/`dsi_search_components`
nonostante `stability:'beta'` — follow-up non bloccante da chiudere.

**Nota outputSchema**: copertura Zod (`structuredContent`) a macchia di leopardo —
presente solo su `tokens_list_component_vars`, `bsi_get_component_markup`,
`devkit_get_component_markup` (3 tool su 17). Gli altri restituiscono solo
`content` testuale. Follow-up non bloccante.

**Nota CC-BY-SA**: `docs_get_component_guide` include contenuti editoriali da
Designers Italia licenziati CC-BY-SA 4.0. Aggiungere warning nella risposta.

---

## Transport

- **Remoto (default)**: HTTP con Streamable HTTP transport
- **Locale (self-hosting)**: StdioServerTransport
  Selezionabile via env: `TRANSPORT=stdio` (default: `http`)

---

## Pipeline consigliata per i tool

I tool sono organizzati per progressive disclosure: inizia dal meno
costoso e usa il tool più mirato per namespace. **Non esiste un tier di
aggregazione** — combinare dati da più sorgenti in una risposta è
responsabilità del client, componendo più chiamate (vedi nota su
`get_component_full`, rimosso).

```
1. DISCOVERY
   ping                              → verifica connessione + lista tool
   dsi_list_components               → inventario unificato BSI ∪ Dev Kit, con stato
   dsi_search_components(query)      → trova per nome / alias IT-EN / tag Dev Kit
   bsi_list_components_by_status(status) → filtra per stato BSI

2. TOOL SPECIFICO PER NAMESPACE  (usa il tool più mirato per la domanda)
   bsi_list_component_variants(component)    → nomi varianti BSI
   bsi_get_component_markup(component, variant?)   → markup di una variante BSI
   devkit_list_component_variants(component) → nomi varianti Dev Kit
   devkit_get_component_markup(component, variant?) → markup di una variante Dev Kit
   devkit_list_component_props(component)    → props it-* Dev Kit
   docs_get_component_guide(component)       → linee guida d'uso e accessibilità
   tokens_list_component_vars(component)     → token --bsi-* con valueResolved
   tokens_resolve(variable)                  → risolve una singola variabile
   tokens_find_components(variable)          → cosa cambia sovrascrivendo una variabile
   tokens_search(query)                      → ricerca token per nome
   github_get_component_issues(component)    → issue GitHub aperte
   github_get_project_repo_links             → link issue repository
```

**Nota WAI-ARIA**: i dati Dev Kit (props `it-*`, argTypes) riguardano
i web component — non trasferire attributi WAI-ARIA o props Dev Kit in
contesto BSI puro (HTML classico). Le sorgenti sono complementari,
non intercambiabili.

---

## Niente troncamento server-side (rimosso in v0.4.0)

`maxVariants` è stato rimosso. Il modello attuale non tronca mai:
- `bsi_list_component_variants` / `devkit_list_component_variants` restituiscono
  sempre **tutti** i nomi disponibili (`variantsAvailable`), nessun limite.
- `bsi_get_component_markup` / `devkit_get_component_markup` restituiscono
  sempre **una sola** variante per chiamata (`variant` opzionale, default la prima).

Se serve il markup di più varianti, il client fa più chiamate mirate a
`*_get_component_markup` usando i nomi ottenuti da `*_list_component_variants`.

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
- Non usare `importPath` o lo slug come chiave d'identità per l'unione BSI∪DevKit —
  usare sempre `DevKitEntry.id` (Storybook), l'unico garantito univoco
- Non ri-risolvere `token.name` in `bsiMap` per ottenere la chain — `bsiMap` è
  last-write-wins su nomi duplicati tra componenti; risolvere sempre a partire
  dal `ref` estratto dal valore del token (vedi `resolveTokenValues`/`findComponentsByToken`)
- Non trattare una risoluzione riuscita di `--bsi-*` come univoca senza controllare
  prima l'ambiguità: il check va fatto PRIMA di ogni tentativo di risoluzione
  (vedi `resolveToken()`), non solo come fallback su fallimento
- Non reintrodurre `get_component_full` o un tool aggregatore equivalente —
  la combinazione multi-sorgente è del client
- Non usare `maxVariants` o altre forme di troncamento server-side nei tool
  `bsi_`/`devkit_` — list = tutti i nomi, get = una variante

---

## Dipendenze previste

```json
{
  "@modelcontextprotocol/sdk": "^1.29.0",
  "zod": "^3.23.0"
}
```

`js-yaml` è in devDependencies — usato solo dagli script snapshot CI, non a runtime.
`playwright` è in devDependencies — usato solo da `snapshot-devkit.ts` in CI.

Evitare dipendenze aggiuntive se possibile. Preferire API native Node.js.

---

## Licenza e copyright

BSD 3-Clause — © 2026 Daniele Tabellini (Fupete)