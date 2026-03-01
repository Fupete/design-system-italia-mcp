# MCP Server per Design system .italia

> ⚠️ **Progetto non ufficiale e sperimentale**
> Questo è un progetto personale sandbox di Daniele Tabellini.
> I dati sono forniti così come sono e potrebbero essere incompleti
> o non aggiornati. Utilizzare a proprio rischio.

> ⚠️ **Unofficial & experimental personal sandbox project**
> This is a personal sandbox project by Daniele Tabellini.
> Data is provided as-is and may be outdated or incomplete. 
> Use at your own risk.

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/fupete/design-system-italia-mcp)
[![License: BSD-3-Clause](https://img.shields.io/badge/License-BSD_3--Clause-blue.svg)](LICENSE)

---

## Cos'è / What it is

**IT** — Server MCP (Model Context Protocol) remoto non ufficiale
che espone a assistenti AI i dati strutturati di Design system
.italia: componenti Bootstrap Italia, Dev Kit Italia, token CSS, 
linee guida d'uso, stato di accessibilità e issue GitHub collegate.

**EN** — An unofficial remote MCP (Model Context Protocol) server
providing AI assistants with structured access to Italy's Design
System resources: Bootstrap Italia and Dev Kit Italia components, 
CSS tokens, usage guidelines, accessibility status, and related 
GitHub issues.

---

## Strumenti esposti / Exposed tools

### Componenti (Bootstrap Italia)
- `list_components` — elenco di tutti i componenti con stato
- `get_component(name)` — markup HTML Bootstrap Italia e varianti di un componente
- `search_components(query)` — ricerca per nome o caratteristica (tendenzialmente nome in inglese)
- `get_component_full(name)` ⭐ — risposta aggregata: markup +
  token CSS + linee guida + stato + issue aperte in una sola query + ...

### Token e variabili CSS
- `get_component_tokens(name)` — variabili CSS `--bsi-*` personalizzabili
  con descrizioni semantiche, tokens da Design Tokens Italia e valori risolti
- `find_token(query)` — ricerca per nome variabile o descrizione

### Linee guida e accessibilità (Designers Italia)
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
personalizzabili, linee guida d'uso e issue GitHub aperte.

Esempio: *"Dimmi tutto sul componente Alert"* → stato beta/stabile,
markup HTML con varianti, variabili CSS con valori risolti, note
accessibilità, issue GitHub aperte.

Ogni risposta include le versioni delle sorgenti (Design System, Bootstrap Italia,
Dev Kit Italia), URL verificato della documentazione ufficiale e timestamp dell'ultimo fetch.

---

## Come connettersi / How to connect

### Claude (claude.ai)
Impostazioni → Integrazioni → Aggiungi server MCP

```
https://[url-server]/mcp
```

### Cursor / VS Code
```json
{
  "mcpServers": {
    "design-system-italia": {
      "url": "https://[url-server]/mcp"
    }
  }
}
```

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

> 💡 **Provider remoto consigliato** — Per esporre il server
> pubblicamente, scegli un VPS con datacenter EU per privacy e
> sovranità dei dati. Alcune opzioni: Hetzner (DE), OVHcloud (FR),
> Scaleway (FR), Infomaniak (CH).

---

## Sorgenti dati / Data sources

Il server non ospita dati propri. Legge direttamente dai
repository ufficiali in tempo reale.

| # | Repo | File / endpoint | Contenuto | Tool MCP | TTL cache |
|---|------|-----------------|-----------|----------|-----------|
| 1 | [bootstrap-italia](https://github.com/italia/bootstrap-italia) | `api/componenti/{slug}.json` | Markup HTML varianti per componente | `get_component` `list_components` `search_components` | Lunga (per release) |
| 2 | [bootstrap-italia](https://github.com/italia/bootstrap-italia) | `api/components_status.json` | Lista ~55 componenti, stato per libreria (BSI/UI Kit), accessibilità, note issue | `list_components` `list_by_status` `list_accessibility_issues` | Media (4h) |
| 3 | [bootstrap-italia](https://github.com/italia/bootstrap-italia) | `api/custom_properties.json` | Token CSS `--bsi-*` per-componente con descrizioni semantiche. Prefisso canonico BSI v3 | `get_component_tokens` `find_token` | Lunga (per release) |
| 4 | [designers.italia.it](https://github.com/italia/designers.italia.it) | `src/data/content/design-system/componenti/{slug}.yaml` | Linee guida d'uso, accessibilità, stato redazionale, quando/come usare | `get_component_guidelines` | Lunga (24h) |
| 5 | [design-tokens-italia](https://github.com/italia/design-tokens-italia) | `dist/scss/_variables.scss` | Token globali `--it-*` con valori concreti. Risolve `var(--bsi-spacing-m)` → `24px` per i designer | `get_component_tokens` (campo `valueResolved`) `find_token` | Lunga (24h) |
| 6 | [dev-kit-italia](https://github.com/italia/dev-kit-italia) | `italia.github.io/dev-kit-italia/index.json` | Indice Storybook: tag stato (`a11y-ok` `alpha` `new` `web-component`), varianti in italiano, URL docs, importPath → path esatto stories.ts | `list_components` `get_component_guidelines` | Breve (15-30 min) |
| 7 | [dev-kit-italia](https://github.com/italia/dev-kit-italia) | `packages/{slug}/stories/it-{slug}.stories.ts` (path da #6) | Props `it-*`: nome attributo HTML, tipo, descrizione IT, default, opzioni. Sottocomponenti. Due pattern: package dedicato o wrapper bundle | `get_component` `get_component_full` | Media (4h) |
| 8 | GitHub REST API | `search/issues?q={slug}+repo:italia/...+is:open` | Issue aperte sui repo: bootstrap-italia, design-ui-kit, dev-kit-italia, design-tokens-italia | `get_component_issues` `get_project_board_status` | Breve (15-30 min) |
| 9 | [designers.italia.it](https://github.com/italia/designers.italia.it) + [bootstrap-italia](https://github.com/italia/bootstrap-italia) + [dev-kit-italia](https://github.com/italia/dev-kit-italia) | `src/data/dsnav.yaml` + `package.json` (×2) | Versioni Design System / BSI / Dev Kit Italia. URL verificati pagine componenti e fondamenti su designers.italia.it | `meta` in tutte le risposte | Lunga (24h) |

**Note:**
- TTL indicativi e configurabili. In fase di sviluppo: cache di qualche ora + endpoint di invalidazione manuale protetto da token
- Sorgenti #1 #2 #3: stesso repo BSI, loader condiviso con cache unica per repo
- Sorgenti #6 #7: Dev Kit Italia, due fetch — index.json come indice, stories.ts per dettaglio props. L'`importPath` in #6 indica il path esatto del file #7
- Sorgente #9: fetch parallelo con `Promise.allSettled` — non esposta come tool separato, popola il campo `meta.versions` e `meta.designersUrl` in tutte le risposte
- `get_component_full` aggrega tutte le sorgenti in una risposta unica

---

## System prompt consigliato / Recommended system prompt

Per ridurre il rischio di allucinazioni, istruire l'agente a basarsi
esclusivamente sui dati restituiti dal server.

```
Usa esclusivamente i dati restituiti dagli strumenti MCP di
Design system .italia. Non integrare con conoscenza pregressa
su Bootstrap, Bootstrap Italia, Dev Kit Italia o altri framework.
Per ogni risposta, cita la versione della sorgente e il link
alla documentazione ufficiale inclusi nella risposta del tool.
```

---

## Stack tecnico / Tech stack

- Node.js + TypeScript
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
- HTTP transport (remoto) / StdioTransport (locale, via `TRANSPORT=stdio`)
- Docker (deploy universale — locale o VPS EU a scelta)

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

Documentazione: CC BY 4.0

I dati esposti mantengono la licenza delle rispettive sorgenti.