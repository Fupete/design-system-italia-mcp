# MCP Server per Design system .italia

> ⚠️ **Progetto non ufficiale e sperimentale**
> I dati sono forniti così come sono e potrebbero essere incompleti > o non aggiornati. Utilizzare a proprio rischio.

> ⚠️ **Unofficial & experimental personal sandbox project**
> Data is provided as-is and may be outdated or incomplete.
> Use at your own risk.

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/fupete/design-system-italia-mcp)
[![License: BSD-3-Clause](https://img.shields.io/badge/License-BSD_3--Clause-blue.svg)](LICENSE)

---

## Cos'è / What it is

**IT** — Server MCP (Model Context Protocol) non ufficiale che espone a assistenti AI i dati strutturati del Design system .italia: componenti e markup HTML Bootstrap Italia, web component e props Dev Kit Italia ⚠️ alpha, token CSS con valori risolti, linee guida per componente, stato di accessibilità e issue GitHub collegate.

**EN** — An unofficial MCP (Model Context Protocol) server providing AI assistants with structured access to Italy's Design System resources: Bootstrap Italia components and HTML markup, Dev Kit Italia web components and props ⚠️ alpha, CSS tokens with resolved values, per-component usage guidelines, accessibility status, and related GitHub issues.

---

## Strumenti esposti / Exposed tools

### Componenti
* `list_components` — elenco di tutti i componenti con stato (Bootstrap Italia + Dev Kit Italia)
* `get_component(name)` — markup HTML Bootstrap Italia, varianti e props web component Dev Kit Italia ⚠️ alpha
* `search_components(query)` — ricerca per nome o caratteristica
* **Tool principale:** `get_component_full(name)` — risposta aggregata: markup HTML + props Dev Kit Italia ⚠️ alpha + token CSS + linee guida per componente + stato + issue aperte in una sola query

### Token e variabili CSS
- `get_component_tokens(name)` — variabili CSS `--bsi-*` personalizzabili
  con descrizioni semantiche, tokens da Design Tokens Italia e valori risolti
- `find_token(query)` — ricerca per nome variabile o descrizione

### Linee guida componenti e stato accessibilità (documentazione su Designers Italia)
- `get_component_guidelines(name)` — linee guida d'uso, quando/come usarlo,
  stato verifiche accessibilità complete 
- `list_by_status(status)` — componenti per stato (…)
- `list_accessibility_issues` — componenti con note di accessibilità aperte (liste manuali)

### Issue e stato progetto (GitHub)
- `get_component_issues(name)` — issue aperte per componente
- `get_project_board_status` — stato aggregato delle board collegate

---

## Query consigliata / Recommended query

Il valore principale del server è la **combinazione contestuale**
delle sorgenti. Usa `get_component_full(name)` per ottenere in
una singola chiamata: stato del componente, markup HTML, variabili CSS
personalizzabili, componente da Dev Kit Italia, linee guida d'uso 
e issue GitHub aperte.

Esempio: *"Dimmi tutto sul componente Alert"* → stato beta/stabile,
markup HTML con varianti, variabili CSS con valori risolti, web component e props,
eventuali note accessibilità, issue GitHub aperte.

Ogni risposta include le versioni delle sorgenti (Design System .italia, Bootstrap Italia,
Dev Kit Italia), URL verificato della documentazione ufficiale e timestamp dell'ultimo fetch.

---

## Come connettersi / How to connect


### Claude Desktop / Cursor / VS Code (via NPX — consigliato)

Aggiungi al file di configurazione MCP del tuo client:
```json
{
  "mcpServers": {
    "design-system-italia": {
      "command": "npx",
      "args": ["-y", "@fupete/design-system-italia-mcp"],
      "env": {
        "GITHUB_TOKEN": "your_token_here"
      }
    }
  }
}
```

Oppure via CLI (Claude Desktop):
```bash
claude mcp add design-system-italia \
  --command "npx -y @fupete/design-system-italia-mcp" \
  --env GITHUB_TOKEN=your_token
```

Non richiede installazione — npx scarica e avvia il server automaticamente.

### Self-hosting con Docker (locale o VPS)
```bash
docker pull ghcr.io/fupete/design-system-italia-mcp
docker run -e GITHUB_TOKEN=your_token -p 8080:8080 \
  ghcr.io/fupete/design-system-italia-mcp
```


Funziona su qualsiasi macchina con Docker installato — locale,
VPS personale, server aziendale.

Per uso locale con Claude Desktop o Cursor senza server remoto,
imposta `TRANSPORT=stdio` nelle variabili d'ambiente.

> ⚠️ **Docker multiarch** — se `docker pull` scarica un'architettura incompatibile,
> fai una build locale: `docker build -t design-system-italia-mcp .`

> ℹ️ **`GITHUB_TOKEN` (opzionale ma consigliato)** — serve per il tool `get_component_issues`.
> Senza token: 60 richieste/ora per IP. Con token: 5000 richieste/ora.
> Basta un token con scope pubblico read-only — nessun permesso speciale richiesto.

---

## Sorgenti dati / Data sources

Il server non ospita dati propri. Legge direttamente dai
repository ufficiali in tempo reale.


| # | Repo | File / endpoint | Contenuto | Tool MCP | TTL cache |
|---|------|-----------------|-----------|----------|-----------|
| 1 | [bootstrap-italia](https://github.com/italia/bootstrap-italia) | `api/componenti/{slug}.json` | Markup HTML varianti per componente | `get_component` `list_components` `search_components` | Lunga (per release) |
| 2 | [bootstrap-italia](https://github.com/italia/bootstrap-italia) | `api/components_status.json` | Lista ~55 componenti, stato per libreria (BSI/UI Kit), accessibilità, note issue | `list_components` `list_by_status` `list_accessibility_issues` | Media (4h) |
| 3 | [bootstrap-italia](https://github.com/italia/bootstrap-italia) | `api/custom_properties.json` | Token CSS `--bsi-*` per-componente con descrizioni semantiche. Prefisso canonico BSI v3 ⚠️ alpha | `get_component_tokens` `find_token` | Lunga (per release) |
| 4 | [designers.italia.it](https://github.com/italia/designers.italia.it) | `src/data/content/design-system/componenti/{slug}.yaml` | Linee guida d'uso, accessibilità, stato redazionale, quando/come usare | `get_component_guidelines` | Lunga (24h) |
| 5 | [design-tokens-italia](https://github.com/italia/design-tokens-italia) | `dist/scss/_variables.scss` | Token globali `--it-*` con valori concreti. Risolve `var(--bsi-spacing-m)` → `24px` per i designer | `get_component_tokens` (campo `valueResolved`) `find_token` | Lunga (24h) |
| 6 | [dev-kit-italia](https://github.com/italia/dev-kit-italia) | `italia.github.io/dev-kit-italia/index.json` | Indice Storybook: tag stato (`a11y-ok` `alpha` `new` `web-component`), varianti in italiano, URL docs, importPath → path esatto stories.ts ⚠️ alpha | `list_components` `get_component_guidelines` | Breve (15-30 min) |
| 7 | [dev-kit-italia](https://github.com/italia/dev-kit-italia) | `packages/{slug}/stories/it-{slug}.stories.ts` (path da #6) | Props `it-*`: nome attributo HTML, tipo, descrizione IT, default, opzioni. Sottocomponenti ⚠️ alpha | `get_component` `get_component_full` | Media (4h) |
| 8 | GitHub REST API | `search/issues?q={slug}+repo:italia/...+is:open` | Issue aperte sui repo: bootstrap-italia, design-ui-kit, dev-kit-italia, design-tokens-italia | `get_component_issues` `get_project_board_status` | Breve (15-30 min) |
| 9 | [designers.italia.it](https://github.com/italia/designers.italia.it) + [bootstrap-italia](https://github.com/italia/bootstrap-italia) + [dev-kit-italia](https://github.com/italia/dev-kit-italia) | `src/data/dsnav.yaml` + `package.json` (×2) | Versioni Design System / BSI / Dev Kit Italia. URL verificati pagine componenti e fondamenti su designers.italia.it | `meta` in tutte le risposte | Lunga (24h) |

> ⚠️ **Layer token in fase alpha** — Il server usa Bootstrap Italia 3.x (alpha) e Dev Kit Italia (alpha).
> La 3.x è necessaria per accedere ai token CSS strutturati per componente (`custom_properties.json`,
> `_root.scss`) e all'integrazione completa con Design Tokens Italia — funzionalità non presenti in BSI 2.x.
> Le API di stato componenti e markup HTML esistono in entrambe le versioni e sono stabili,
> ma token CSS e web component Dev Kit possono avere breaking changes prima della release stabile.
> Non usare il layer token in produzione senza verificare lo stato upstream.

> ⚠️ **Token layer in alpha** — This server uses Bootstrap Italia 3.x (alpha) and Dev Kit Italia (alpha).
> 3.x is required for structured per-component CSS tokens (`custom_properties.json`, `_root.scss`)
> and full Design Tokens Italia integration — features not available in BSI 2.x.
> Component status and markup HTML APIs exist in both versions and are stable,
> but CSS tokens and Dev Kit web components may have breaking changes before stable release.
> Do not use the token layer in production without checking upstream status.

**Note:**
- TTL indicativi e configurabili. In fase di sviluppo: cache di qualche ora + endpoint di invalidazione manuale protetto da token
- Sorgenti #1 #2: markup e stato componenti — presenti anche in BSI 2.x stabile, struttura consolidata
- Sorgenti #3 #6 #7: token CSS per-componente e web component Dev Kit — introdotti in BSI 3.x ⚠️ alpha
- Sorgenti #1 #2 #3: stesso repo BSI, loader condiviso con cache unica per repo
- Sorgenti #6 #7: Dev Kit Italia, due fetch — index.json come indice, stories.ts per dettaglio props. L'`importPath` in #6 indica il path esatto del file #7
- Sorgente #9: fetch parallelo con `Promise.allSettled` — non esposta come tool separato, popola il campo `meta.versions` e `meta.designersUrl` in tutte le risposte
- `get_component_full` aggrega tutte le sorgenti in una risposta unica

---

## System prompt consigliato / Recommended system prompt

Per ridurre il rischio di allucinazioni, istruire l'assistente a basarsi
esclusivamente sui dati restituiti dal server.

**IT**
```
Usa esclusivamente i dati restituiti dagli strumenti MCP del
Design System .italia. Non integrare con conoscenza pregressa su
Bootstrap Italia, Dev Kit Italia o altri framework CSS/web component.
Per ogni risposta includi la versione delle sorgenti e il link alla
documentazione ufficiale restituiti dal tool.
```

**EN**
```
Use only the data returned by the Design System .italia MCP tools.
Do not supplement with prior knowledge of Bootstrap Italia, Dev Kit Italia,
or any other CSS framework or web component library.
For every response, include the source versions and official documentation
URL returned by the tool.
```

---

## Stack tecnico / Tech stack

- Node.js + TypeScript
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
- Streamable HTTP transport / stdio transport (via `TRANSPORT=stdio`)
- Docker (self-hosting — locale o VPS)

---

## Sviluppo locale / Local development

```bash
git clone https://github.com/fupete/design-system-italia-mcp
cd design-system-italia-mcp
npm install
cp .env.example .env
# aggiungi GITHUB_TOKEN in .env
npm run dev
```

Server disponibile su `http://localhost:8080/mcp`

Testare con [MCP Inspector](https://github.com/modelcontextprotocol/inspector):
```bash
npx @modelcontextprotocol/inspector http://localhost:8080/mcp
```

---

## Riferimenti / References

- [dati-semantic-mcp](https://github.com/italia/dati-semantic-mcp)
  — progetto analogo per schema.gov.it iniziato da @mfortini, idea iniziale
- [MCP Protocol](https://modelcontextprotocol.io)
- [Designers Italia](https://designers.italia.it)
- [Bootstrap Italia](https://italia.github.io/bootstrap-italia)
- [Dev Kit Italia](https://italia.github.io/dev-kit-italia)

---

## Licenza / License

BSD 3-Clause — © 2026 Daniele Tabellini (Fupete)

Documentazione: CC BY SA 4.0

I dati esposti mantengono la licenza delle rispettive sorgenti.
