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

**IT** — Server MCP (Model Context Protocol) non ufficiale che espone a assistenti AI i dati strutturati del Design system .italia: componenti e markup HTML Bootstrap Italia, web component e props Dev Kit Italia ⚠️ alpha, token CSS con valori risolti, linee guida per componente, stato di accessibilità e issue GitHub collegate. I dati sono aggiornati nightly tramite snapshot CI nel branch `data-fetched`.

**EN** — An unofficial MCP (Model Context Protocol) server providing AI assistants with structured access to Italy's Design System resources: Bootstrap Italia components and HTML markup, Dev Kit Italia web components and props ⚠️ alpha, CSS tokens with resolved values, per-component usage guidelines, accessibility status, and related GitHub issues. Data is refreshed nightly via CI snapshot into the `data-fetched` branch.

---

## Strumenti esposti / Exposed tools

### Componenti
* `list_components` — elenco di tutti i componenti con stato (Bootstrap Italia + Dev Kit Italia), `componentType`
* `get_component(name, maxVariants?)` — markup HTML Bootstrap Italia (troncato, default 3) + story variants Dev Kit Italia ⚠️ alpha
* `get_component_variant(name, variantName)` — **nuovo** — markup completo di una variante specifica per nome (BSI o Dev Kit, trasparente)
* `search_components(query)` — ricerca per nome, slug, alias IT/EN o tag Dev Kit
* **Tool principale:** `get_component_full(name)` — risposta aggregata: markup HTML + story variants + props Dev Kit Italia ⚠️ alpha + token CSS + linee guida + stato + issue — una sola query

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

Esempio: *"Dimmi tutto sul componente Alert"* → stato del componente,
markup HTML con varianti, variabili CSS con valori risolti, web component e props,
eventuali note di accessibilità, issue GitHub aperte.

Ogni risposta include le versioni delle sorgenti (Design System .italia, Bootstrap Italia,
Dev Kit Italia), URL verificato della documentazione ufficiale e `dataFetchedAt` —
la data dell'ultimo snapshot CI, non il momento della richiesta.

Per componenti con molte varianti (es. Card con 30+), `get_component` restituisce
le prime 3 con markup completo + la lista nomi di tutte. Usa
`get_component_variant(name, variantName)` per richiederne altre per nome.

I nomi dei componenti funzionano in italiano e inglese:
*"fisarmonica"*, *"dialog"*, *"pulsante"* trovano accordion, modal, buttons.


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

> ℹ️ **nvm su macOS** — se `npx` risolve a una versione vecchia di Node
> ("You must supply a command" o "Cannot find module 'node:path'"),
> usa il path esplicito. Trova il path con `nvm use 22 && which npx`, poi:
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

Funziona su qualsiasi macchina con Docker installato — locale,
VPS personale, server aziendale.

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

I dati sono aggiornati nightly tramite CI snapshot e serviti dal branch `data-fetched`.
Solo le GitHub Issues sono fetchate live a runtime.

| # | Repo | Contenuto | Tool MCP |
|---|------|-----------|----------|
| 1 | [bootstrap-italia](https://github.com/italia/bootstrap-italia) | Markup HTML varianti per componente | `get_component` `list_components` `search_components` |
| 2 | [bootstrap-italia](https://github.com/italia/bootstrap-italia) | Lista ~55 componenti, stato librerie (BSI/UI Kit), accessibilità, note issue | `list_components` `list_by_status` `list_accessibility_issues` |
| 3 | [bootstrap-italia](https://github.com/italia/bootstrap-italia) | Token CSS `--bsi-*` per-componente con descrizioni semantiche ⚠️ alpha | `get_component_tokens` `find_token` |
| 4 | [designers.italia.it](https://github.com/italia/designers.italia.it) | Linee guida d'uso, accessibilità, quando/come usare | `get_component_guidelines` |
| 5 | [design-tokens-italia](https://github.com/italia/design-tokens-italia) | Token globali `--it-*` con valori concreti. Risolve `var(--bsi-spacing-m)` → `24px` | `get_component_tokens` `find_token` |
| 6 | [dev-kit-italia](https://github.com/italia/dev-kit-italia) | Indice Storybook: tag stato, varianti in italiano, importPath ⚠️ alpha | `list_components` `search_components` |
| 7 | [dev-kit-italia](https://github.com/italia/dev-kit-italia) | Markup HTML copia-incolla per variante, estratto da Storybook source panel ⚠️ alpha | `get_component` `get_component_variant` `get_component_full` |
| 7b | [dev-kit-italia](https://github.com/italia/dev-kit-italia) | Props `it-*`: attributi HTML, tipo, descrizione, default, opzioni ⚠️ alpha | `get_component` `get_component_full` |
| 8 | GitHub REST API | Issue aperte: bootstrap-italia, design-ui-kit, dev-kit-italia, design-tokens-italia | `get_component_issues` `get_project_board_status` |
| 9 | designers.italia.it + BSI + Dev Kit | Versioni Design System / BSI / Dev Kit. URL verificati pagine componenti | `meta` in tutte le risposte |

Le sorgenti 1–7b e 9 sono aggiornate nightly e cached per 24h.
La sorgente 8 (GitHub Issues) è l'unica fetchata live a runtime (cache 15 min).
`dataFetchedAt` nelle risposte riflette la data dell'ultimo snapshot CI.

> ⚠️ **Layer token e web component in fase alpha** — Il server usa Bootstrap Italia 3.x (alpha)
> e Dev Kit Italia (alpha). Token CSS `--bsi-*` e web component `it-*` possono avere
> breaking changes prima della release stabile.

> ⚠️ **Token and web component layer in alpha** — This server uses Bootstrap Italia 3.x (alpha)
> and Dev Kit Italia (alpha). CSS tokens `--bsi-*` and web components `it-*` may have
> breaking changes before stable release.

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

- [dati-semantic-mcp](https://github.com/italia/dati-semantic-mcp)
  — progetto analogo per schema.gov.it iniziato da @mfortini, idea iniziale
- [MCP Protocol](https://modelcontextprotocol.io)
- [Designers Italia](https://designers.italia.it)
- [Bootstrap Italia](https://italia.github.io/bootstrap-italia)
- [Dev Kit Italia](https://italia.github.io/dev-kit-italia)

---

## Provenienza dei dati e licenze / Data provenance & licenses

Il server recupera e serve dati da repository pubblici upstream.
Le sorgenti includono Bootstrap Italia, Dev Kit Italia, Design Tokens Italia e
Designers Italia — tutte **BSD-3-Clause**. I contenuti editoriali di Designers Italia
(linee guida d'uso, note di accessibilità) sono licenziati sotto **CC-BY-SA 4.0**.
I lavori derivati ereditano il requisito ShareAlike.

This server fetches and serves data from public upstream repositories.
Sources include Bootstrap Italia, Dev Kit Italia, Design Tokens Italia and
Designers Italia — all **BSD-3-Clause**. Editorial content from Designers Italia
(usage guidelines, accessibility notes) is licensed under **CC-BY-SA 4.0**.
Derivatives of that content inherit the ShareAlike requirement.

Dettagli completi, link agli autori upstream e riferimenti alle licenze: / 
Full provenance details, upstream author links and license references:
[data-fetched branch README](https://github.com/Fupete/design-system-italia-mcp/blob/data-fetched/README.md)

---

## Licenza / License

BSD 3-Clause — © 2026 Daniele Tabellini (Fupete)

Documentazione: CC BY SA 4.0

I dati esposti mantengono la licenza delle rispettive sorgenti.
