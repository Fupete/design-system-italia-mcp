![Filo.](docs/assets/imgs/filo-logo.svg)

# MCP server per il Design system .italia

*Non perdere il filo.*

<img src="docs/assets/imgs/filo-illustration-hero.png" alt="Tenere il filo blu Italia." width="400">

> ⚠️ **Progetto personale non ufficiale e sperimentale** - I dati sono forniti così come sono e potrebbero essere incompleti o non aggiornati. Utilizzare a proprio rischio. / ⚠️ **Unofficial & experimental personal sandbox project** - Data is provided as-is and may be outdated or incomplete. Use at your own risk.

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/fupete/design-system-italia-mcp) [![License: BSD-3-Clause](https://img.shields.io/badge/License-BSD_3--Clause-blue.svg)](LICENSE)

---

## Di cosa parliamo? / What are we talking about?

**IT** — Design system .italia è il sistema open source ufficiale per realizzare le interfacce della Pubblica Amministrazione. Una iniziativa del progetto [Designers Italia](https://designers.italia.it/), è distribuito in più repository indipendenti.

**EN** — Design System .italia is the official open source design system for Italian Public Administration interfaces. An initiative by [Designers Italia](https://designers.italia.it/), it is distributed across multiple independent repositories.

- [Bootstrap Italia](https://github.com/italia/bootstrap-italia) — componenti e stili HTML/CSS / HTML/CSS components and styles ⚠️ v3 alpha
- [Dev Kit Italia](https://github.com/italia/dev-kit-italia) — web component `it-*` ⚠️ v1 alpha
- [Design Tokens Italia](https://github.com/italia/design-tokens-italia) — variabili CSS e SCSS globali `--it-*` e `$it-` / global CSS and SCSS variables
- [designers.italia.it](https://designers.italia.it/design-system/) — documentazione e linee guida d'uso / documentation and usage guidelines

---

## Cos'è Filo / What is Filo 

**IT** — Filo è un server MCP (Model Context Protocol) non ufficiale che espone a assistenti AI i dati strutturati del Design system .italia: componenti e markup HTML Bootstrap Italia v3 ⚠️ alpha, web component e props Dev Kit Italia v1 ⚠️ alpha, token CSS con valori risolti, linee guida per componente, stato di accessibilità e issue GitHub collegate. I dati sono aggiornati nightly tramite snapshot CI nel branch `data-fetched`.

**EN** — Filo is an unofficial MCP (Model Context Protocol) server providing AI assistants with structured access to Italy's Design System resources: Bootstrap Italia v3 components and HTML markup ⚠️ alpha, Dev Kit Italia web components and props v1 ⚠️ alpha, CSS tokens with resolved values, per-component usage guidelines, accessibility status, and related GitHub issues. Data is refreshed nightly via CI snapshot into the `data-fetched` branch.
**EN** — Filo is an unofficial MCP (Model Context Protocol) server providing AI assistants with structured access to Italy's Design System resources: Bootstrap Italia v3 components and HTML markup ⚠️ alpha, Dev Kit Italia web components and props v1 ⚠️ alpha, CSS tokens with resolved values, per-component usage guidelines, accessibility status, and related GitHub issues. Data is refreshed nightly via CI snapshot into the `data-fetched` branch.

---

## Strumenti disponibili / Available tools

### Componenti
* `list_components` — elenco di tutti i componenti con stato (Bootstrap Italia + Dev Kit Italia), `componentType`
* `get_component(name, maxVariants?)` — markup per varianti HTML Bootstrap Italia e web components Dev Kit Italia ⚠️ alpha (troncate, default 3 per risorsa)
* `get_component_variant(name, variantName)` — markup completo di una variante specifica per nome (BSI o Dev Kit, trasparente) ⚠️ alpha
* `search_components(query)` — ricerca per nome, slug, alias IT/EN o tag Dev Kit
* `get_component_full(name)` — risposta aggregata: varianti Bootstrap Italia e Dev Kit Italia + props Dev Kit ⚠️ alpha + CSS custom properties e loro token chain fino a valore risolto + linee guida d'uso + stato + issue — una sola query. Da usare quando servono dati da più sorgenti insieme, non come prima chiamata.

### Design tokens e variabili CSS
- `get_component_tokens(name)` — CSS custom properties `--bsi-*` personalizzabili con descrizioni semantiche, tokens da Design Tokens Italia e catena di risoluzione fino a valori risolti
- `find_token(query)` — ricerca per nome token o descrizione

### Linee guida componenti e stato accessibilità (documentazione su Designers Italia)
- `get_component_guidelines(name)` — linee guida d'uso, quando/come usarlo, stato verifiche accessibilità
- `list_by_status(status)` — componenti per stato
- `list_accessibility_issues` — componenti con note di accessibilità aperte (liste manuali)

### Issue e stato progetto (GitHub)
- `get_component_issues(name)` — tutte le issue aperte su GitHub per componente
- `get_project_board_status` — stato aggregato delle board collegate (segnaposto per funzionalità future di visione trasparente sulla gestione progetto)

### Connessione e meta
- `ping` — verifica connessione al server, versione, timestamp e warning sulle sorgenti. Da usare all'inizio della sessione per confermare i tool disponibili

---

## Query consigliata / Recommended Query

Il valore del server è la **combinazione contestuale** di sorgenti frammentate.

Esempi: *"Dimmi tutto sul componente Alert"*, *"Quali token devo personalizzare nel mio css per cambiare i colori di header e footer?"*, *"..."*

Ogni risposta include le versioni delle risorse (Design system .italia, Bootstrap Italia, Dev Kit Italia, Design Tokens Italia), URL verificato della documentazione ufficiale e `dataFetchedAt`, la data dell'ultimo snapshot CI che avviene tendenzialmente* ogni notte, non il momento della richiesta. (* = laddove ci sono rilasci di nuove versioni upstream).

Per componenti con molte varianti (es. Card con 30+), `get_component` e `get_component_full` restituiscono di default le prime 3 con markup completo + la lista nomi di tutte. Usa `get_component_variant(name, variantName)` per richiederne altre specifiche per nome.

I nomi dei componenti funzionano in italiano e inglese: *"fisarmonica"*, *"dialog"*, *"pulsante"* trovano accordion, modal, buttons.

---

## System prompt consigliato / Recommended system prompt

Per ridurre gli errori o allucinazioni, istruisci il tuo assistente AI a basarsi esclusivamente sui dati restituiti da Filo.

**IT**
```
## Regole dati Design System .italia (Filo MCP)

DATI VERIFICATI: usa esclusivamente i dati restituiti dagli strumenti MCP di Filo. Non integrare con conoscenza pregressa su Bootstrap Italia, Dev Kit Italia, Design Tokens Italia o altri framework CSS/web component.

QUANDO IL DATO MANCA: se un'informazione non è presente nelle risposte MCP, dillo esplicitamente. Scrivi "Questo dato non è disponibile nelle sorgenti MCP" anziché fornire una stima o inferenza. Non inventare valori numerici.

QUANDO COMPONI ELEMENTI: se combini markup MCP reale con HTML/CSS che aggiungi tu, segnala chiaramente cosa viene dai dati MCP e cosa è tua inferenza.

VERSIONI E FONTI: in ogni risposta che usa dati MCP, includi la versione delle sorgenti e il link alla documentazione ufficiale restituiti dal tool.

REGOLA D'ORO: se non sei sicuro che un dato provenga da MCP, trattalo come inferenza e segnalalo.

TOOL DISPONIBILI: all'inizio della sessione, usa il tool ping per verificare la connessione e leggi la lista dei tool disponibili. Non assumere quali tool esistono.

COMPLETEZZA DATI: se un tool restituisce un sottoinsieme dei dati (es. 3 varianti su 13), segnalalo all'utente.
```

**EN**
```
## Data rules — Design System .italia (Filo MCP)

VERIFIED DATA: use exclusively the data returned by Filo's MCP tools. Do not supplement with prior knowledge of Bootstrap Italia, Dev Kit Italia, Design Tokens Italia, or any other CSS/web component framework.

WHEN DATA IS MISSING: if information is not present in the MCP responses, say so explicitly. Never invent numeric values.

WHEN COMPOSING ELEMENTS: clearly indicate what comes from MCP data and what is your own inference.

VERSIONS AND SOURCES: in every response that uses MCP data, include the source versions and official documentation URL returned by the tool.

GOLDEN RULE: if you are unsure whether a piece of data comes from MCP, treat it as inference and label it as such.

AVAILABLE TOOLS: at the start of the session, use the ping tool to verify the connection and read the list of available tools. Do not assume which tools exist.

DATA COMPLETENESS: if a tool returns a subset of available data (e.g. 3 variants out of 13), flag this to the user.
```

---

## Come connettersi / How to connect

### Claude Desktop / Cursor / VS Code (via NPX — consigliato)

Non richiede installazione — npx scarica e avvia il server automaticamente.

Aggiungi al file di configurazione MCP del tuo client:
```json
{
  "mcpServers": {
    "design-system-italia": {
      "command": "npx",
      "args": ["-y", "@fupete/design-system-italia-mcp"],
      "env": {
        "TRANSPORT": "stdio",
        "GITHUB_TOKEN": "your_token_here"
      }
    }
  }
}
```

> ℹ️ **nvm su macOS** — se `npx` risolve a una versione vecchia di Node ("You must supply a command" o "Cannot find module 'node:path'"), usa il path esplicito. Trova il path con `nvm use 22 && which npx`, poi:
> ```json
> {
>   "mcpServers": {
>     "design-system-italia": {
>       "command": "/Users/tuonome/.nvm/versions/node/v22.12.0/bin/npx",
>       "args": ["-y", "@fupete/design-system-italia-mcp"],
>       "env": {
>         "PATH": "/Users/tuonome/.nvm/versions/node/v22.12.0/bin:/usr/local/bin:/usr/bin:/bin",
>         "TRANSPORT": "stdio",
>         "GITHUB_TOKEN": "your_token_here"
>       }
>     }
>   }
> }
> ```
> Sostituisci `tuonome` e `v22.12.0` con i tuoi valori.

#### Oppure via CLI (Claude Desktop):
```bash
claude mcp add design-system-italia \
  --command "npx -y @fupete/design-system-italia-mcp" \
  --env TRANSPORT=stdio \
  --env GITHUB_TOKEN=your_token
```

> ℹ️ **Problemi con nvm su macOS?** Usa la configurazione JSON sopra con path esplicito.

### Self-hosting con Docker (locale o VPS)

Funziona su qualsiasi macchina con Docker installato — locale, VPS personale, server aziendale.

```bash
docker pull ghcr.io/fupete/design-system-italia-mcp
docker run -e GITHUB_TOKEN=your_token -p 8080:8080 \
  ghcr.io/fupete/design-system-italia-mcp
```

> ⚠️ **Docker multiarch** — se `docker pull` scarica un'architettura incompatibile,
> fai una build locale: `docker build -t design-system-italia-mcp .`

> ℹ️ **`GITHUB_TOKEN` (opzionale ma consigliato)** — serve per il tool `get_component_issues`.
> Senza token: 60 richieste/ora per IP. Con token: 5000 richieste/ora.
> Basta un token con scope pubblico read-only — nessun permesso speciale richiesto.

---

## Sorgenti dati / Data sources

I dati sono aggiornati nightly tramite CI snapshot e serviti dal branch [`data-fetched`](https://github.com/Fupete/design-system-italia-mcp/tree/data-fetched). Solo le GitHub Issues sono fetchate live a runtime.

| # | Repo | Contenuto | Tool MCP |
|---|------|-----------|----------|
| 1 | [bootstrap-italia](https://github.com/italia/bootstrap-italia) | Markup HTML varianti per componente ⚠️ alpha | `get_component` `list_components` `search_components` |
| 2 | [bootstrap-italia](https://github.com/italia/bootstrap-italia) | Lista ~55 componenti, stato librerie (BSI/UI Kit), accessibilità, note issue | `list_components` `list_by_status` `list_accessibility_issues` |
| 3 | [bootstrap-italia](https://github.com/italia/bootstrap-italia) | Token CSS `--bsi-*` per-componente con descrizioni semantiche ⚠️ alpha | `get_component_tokens` `find_token` |
| 4 | [bootstrap-italia](https://github.com/italia/bootstrap-italia) | Bridge `--bsi-*` → `--it-*` (token resolution) | `get_component_tokens` `find_token` |
| 5 | [designers.italia.it](https://github.com/italia/designers.italia.it) | Linee guida d'uso, accessibilità, quando/come usare | `get_component_guidelines` |
| 6 | [design-tokens-italia](https://github.com/italia/design-tokens-italia) | Token globali `--it-*` con valori concreti. Risolve `var(--bsi-spacing-m)` → `1.5rem` | `get_component_tokens` `find_token` |
| 7 | [dev-kit-italia](https://github.com/italia/dev-kit-italia) | Indice Storybook: tag stato, varianti, importPath ⚠️ alpha | `list_components` `search_components` |
| 8 | [dev-kit-italia](https://github.com/italia/dev-kit-italia) | Markup HTML per variante, estratto da Storybook source panel ⚠️ alpha | `get_component` `get_component_variant` `get_component_full` |
| 9 | [dev-kit-italia](https://github.com/italia/dev-kit-italia) | Props `it-*`: attributi HTML, tipo, descrizione, default, opzioni ⚠️ alpha | `get_component` `get_component_full` |
| 10 | GitHub REST API | Issue aperte: bootstrap-italia, design-ui-kit, dev-kit-italia, design-tokens-italia | `get_component_issues` `get_project_board_status` |
| 11 | designers.italia.it + BSI + Dev Kit | Versioni Design System / BSI / Dev Kit / DTI. URL verificati pagine componenti | meta in tutte le risposte |

Le sorgenti 1–9 e 11 sono aggiornate nightly e cached per 24h.
La sorgente 8 (GitHub Issues) è l'unica fetchata live a runtime (cache 15 min).
`dataFetchedAt` nelle risposte riflette la data dell'ultimo snapshot CI.

> ⚠️ **Layer token e web component in fase alpha** — Il server usa Bootstrap Italia 3.x (alpha) e Dev Kit Italia (alpha). Token CSS `--bsi-*` e web component `it-*` possono avere breaking changes prima della release stabile.

> ⚠️ **Token and web component layer in alpha** — This server uses Bootstrap Italia 3.x (alpha) and Dev Kit Italia (alpha). CSS tokens `--bsi-*` and web components `it-*` may have breaking changes before stable release.

---

## Stack tecnico / Tech stack

- Node.js + TypeScript
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
- Streamable HTTP transport / stdio transport (via `TRANSPORT=stdio`)
- Docker (self-hosting — locale o VPS)
- Playwright (CI only — snapshot Dev Kit Storybook markup)

---

## Sviluppo locale / Local development

```bash
git clone https://github.com/fupete/design-system-italia-mcp
cd design-system-italia-mcp
npm install
cp .env.example .env
# aggiungi GITHUB_TOKEN in .env
npm run dev

# Verifica sorgenti upstream e freschezza snapshot
npx tsx scripts/canary.ts
```

Server disponibile su `http://localhost:8080/mcp`

Testare con [MCP Inspector](https://github.com/modelcontextprotocol/inspector):
```bash
npx @modelcontextprotocol/inspector http://localhost:8080/mcp
```

---

## Riferimenti / References

- [dati-semantic-mcp](https://github.com/italia/dati-semantic-mcp) progetto analogo per schema.gov.it iniziato da [@mfortini](https://github.com/mfortini), spunto iniziale
- [MCP Protocol](https://modelcontextprotocol.io)
- [Design system .italia](https://designers.italia.it/design-system/come-iniziare/)
- [Bootstrap Italia](https://italia.github.io/bootstrap-italia)
- [Dev Kit Italia](https://italia.github.io/dev-kit-italia)
- [Design Tokens Italia](https://github.com/italia/design-tokens-italia)

---

## Provenienza dei dati e licenze / Data provenance & licenses

Il server recupera e serve dati da repository pubblici upstream. Le sorgenti includono Bootstrap Italia, Dev Kit Italia, Design Tokens Italia e Designers Italia — tutte **BSD-3-Clause**. I contenuti editoriali di Designers Italia (linee guida d'uso, note di accessibilità) sono licenziati sotto **CC-BY-SA 4.0**. I lavori derivati ereditano il requisito ShareAlike / This server fetches and serves data from public upstream repositories. Sources include Bootstrap Italia, Dev Kit Italia, Design Tokens Italia and Designers Italia — all **BSD-3-Clause**. Editorial content from Designers Italia
(usage guidelines, accessibility notes) is licensed under **CC-BY-SA 4.0**. Derivatives of that content inherit the ShareAlike requirement.

Dettagli completi, link agli autori upstream e riferimenti alle licenze: / Full provenance details, upstream author links and license references: [data-fetched branch README](https://github.com/Fupete/design-system-italia-mcp/blob/data-fetched/README.md)

---

## Licenza / License

BSD 3-Clause — © 2026 Daniele Tabellini (Fupete)
Documentazione: CC BY SA 4.0
I dati esposti mantengono la licenza delle rispettive sorgenti

Illustrazione hero: <a href="https://www.opendoodles.com/about">Open Doodles</a> (remix)

---

Filo è un progetto sperimentale sviluppato da [@Fupete](https://github.com/fupete) anche litigando con qualche LLM. [Issue](https://github.com/Fupete/design-system-italia-mcp/issues) benvenute. / Filo is an experimental project developed by [@Fupete](https://github.com/fupete), partly by arguing with a few LLMs. [Issues](https://github.com/Fupete/design-system-italia-mcp/issues) welcome.
