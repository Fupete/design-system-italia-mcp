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
src/
├── index.ts          # entry point, server MCP, routing tool
├── tools/            # 1 file per gruppo di tool (max ~400 righe ciascuno)
│   ├── components.ts # list_components, get_component, search_components
│   ├── tokens.ts     # get_component_tokens, find_token
│   ├── guidelines.ts # get_component_guidelines, list_by_status, list_accessibility_issues
│   ├── issues.ts     # get_component_issues, get_project_board_status
│   └── full.ts       # get_component_full (aggrega tutti)
├── loaders/          # 1 file per sorgente dati esterna
│   ├── bsi.ts        # Bootstrap Italia JSON API
│   ├── designers.ts  # Designers Italia YAML
│   ├── tokens.ts     # Design Tokens Italia _variables.scss
│   ├── devkit.ts     # Dev Kit Italia index.json + stories.ts
│   ├── github.ts     # GitHub Issues REST API
│   └── meta.ts       # Versioni DS/BSI/DevKit + URL nav da dsnav.yaml
├── cache.ts          # cache in-memory con TTL per sorgente
├── slugify.ts        # slug matching tra sorgenti eterogenee
└── types.ts          # tipi condivisi
```

**Regola soglia**: se un file supera ~400 righe, spezzarlo per modulo.
Partire monolite, refactoring solo quando necessario.

---

## Sorgenti dati — 9 fonti, tutte read-only

| # | Sorgente | URL / path | TTL cache |
|---|----------|------------|-----------|
| 1 | BSI markup | `https://raw.githubusercontent.com/italia/bootstrap-italia/3.x/api/componenti/{slug}.json` | 24h |
| 2 | BSI status | `https://raw.githubusercontent.com/italia/bootstrap-italia/3.x/api/components_status.json` | 4h |
| 3 | BSI tokens | `https://raw.githubusercontent.com/italia/bootstrap-italia/3.x/api/custom_properties.json` | 24h |
| 4 | Designers YAML | `https://raw.githubusercontent.com/italia/designers.italia.it/main/src/data/content/design-system/componenti/{slug}.yaml` | 24h |
| 5 | Design Tokens | `https://raw.githubusercontent.com/italia/design-tokens-italia/main/dist/scss/_variables.scss` | 24h |
| 6 | Dev Kit index | `https://italia.github.io/dev-kit-italia/index.json` | 15 min |
| 7 | Dev Kit stories | raw GitHub, path da importPath in #6 | 4h |
| 8 | GitHub Issues | `https://api.github.com/search/issues?q={slug}+repo:italia/bootstrap-italia+repo:italia/design-ui-kit+repo:italia/dev-kit-italia+repo:italia/design-tokens-italia+is:open` | 15 min |
| 9 | DS meta/nav | `dsnav.yaml` (Designers Italia) + `package.json` (BSI 3.x) + `package.json` (Dev Kit `packages/dev-kit-italia/`) | 24h |

**Regola**: non modificare mai le URL upstream. Se una sorgente cambia
struttura, aggiornare solo il loader corrispondente, non i tool.

**Nota sorgente #9**: Dev Kit Italia è un monorepo workspace. Il `package.json`
root ha `"version": "0.0.0"` — usare sempre `packages/dev-kit-italia/package.json`
per la versione reale. Il `dsnav.yaml` espone anche `foundations[]` con URL delle
pagine dei fondamenti — base per futuro tool `list_foundations`.

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

## Slug aliases — inconsistenze cross-sorgente note

Alcune sorgenti usano slug diversi per lo stesso componente.
Il mapping è centralizzato in `src/slugify.ts`:

```typescript
const SLUG_ALIASES: Record<string, string[]> = {
  'buttons': ['button'],  // Dev Kit usa "button", BSI usa "buttons"
  'modal':   ['modale'],  // BSI salva il file come "modale.json"
}
```

Usare `slugsToTry(slug)` nei loader per il fallback automatico.
Aggiungere nuovi alias qui quando emergono nuove inconsistenze —
non gestire il fallback inline nei loader.

---

## Dev Kit Italia — due pattern

Dal `index.json` il campo `importPath` può essere:

```
./packages/accordion/stories/it-accordion.stories.ts   → package dedicato (web-component)
./packages/dev-kit-italia/stories/components/alert.stories.ts  → bundle BSI wrapper
```

Usare sempre `importPath` da `index.json` per costruire l'URL raw GitHub.
Non assumere il pattern dal nome del componente.

URL raw GitHub da importPath:
```
https://raw.githubusercontent.com/italia/dev-kit-italia/main/{importPath senza ./}
```

---

## Cache

Implementazione: in-memory Map con TTL per entry.
TTL separati per sorgente (vedi tabella sopra).
In sviluppo: TTL ridotti a 1h per tutte le sorgenti.

Endpoint di invalidazione manuale:
```
POST /cache/invalidate
Authorization: Bearer <CACHE_INVALIDATION_TOKEN>
Body: { "source": "all" | "bsi" | "designers" | "tokens" | "devkit" | "github" | "meta" }
```

Non implementare invalidazione automatica per ora.

---

## Ogni risposta tool deve includere

```typescript
meta: {
  fetchedAt: string,           // ISO timestamp di assemblaggio risposta
  sourceUrls: string[],        // URL delle sorgenti usate
  warnings: string[],          // sorgenti mancanti o errori non fatali
  versions?: DsVersions,       // designSystem / bootstrapItalia / devKitItalia
  designersUrl?: string | null // URL verificato da dsnav.yaml, non dedotto
}
```

Se una sorgente non risponde, includere nel campo `warnings` e
restituire comunque i dati delle sorgenti disponibili.

---

## Transport

- **Remoto (default)**: HTTP con Streamable HTTP transport
- **Locale (self-hosting)**: StdioServerTransport
  Selezionabile via env: `TRANSPORT=stdio` (default: `http`)

---

## Cosa NON fare

- Non integrare conoscenza pregressa di Bootstrap nella logica dei tool
- Non parsare SCSS o TypeScript — usare solo i JSON e file pre-processati
  (eccezione: parser leggero su stories.ts (regex per argTypes),
  _variables.scss (regex per $it-* con risoluzione ricorsiva),
  _root.scss branch 3.x (regex per bridge --bsi-* → --it-*))
- Non usare `require()` — il progetto è ESM, usare sempre import statico
- Non usare Playwright o browser headless — parsing statico soltanto
- Non aggiungere dipendenze pesanti senza discuterne prima
- Non duplicare la logica di slug matching fuori da `slugify.ts`
- Non fallire silenziosamente se una sorgente non risponde
- Non usare il `package.json` root di dev-kit-italia per la versione (è `"0.0.0"`)

---

## Dipendenze previste

```json
{
  "@modelcontextprotocol/sdk": "^1.12.0",
  "js-yaml": "^4.1.0",
  "zod": "^3.23.0"
}
```

Evitare dipendenze aggiuntive se possibile. Preferire API native Node.js.

---

## Licenza e copyright

BSD 3-Clause — © 2026 Daniele Tabellini (Fupete)