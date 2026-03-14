# data-fetched

Auto-generated snapshot branch. Do not edit manually.

Updated nightly by the `upstream-snapshot` workflow, or on-demand when upstream versions change (detected by `version-check` workflow).

## Structure
```
data-fetched/
├── bsi/
│   ├── components/{slug}.json     — HTML markup variants (Bootstrap Italia)
│   ├── components-status.json     — component list + accessibility status
│   ├── custom-properties.json     — CSS tokens --bsi-*
│   └── root.scss                  — bridge --bsi-* → --it-*
├── devkit/
│   ├── index.json                 — Storybook index
│   └── stories/{slug}.json        — copy-paste HTML markup per component
├── design-tokens/
│   └── variables.scss             — global --it-* tokens
├── designers/
│   └── components/{slug}.json     — usage guidelines (from YAML)
├── dsnav.json                     — DS nav + versions
└── snapshot-meta.json             — versions + fetch timestamp
```

## Sources

| File | Upstream |
|------|----------|
| `bsi/*` | [bootstrap-italia](https://github.com/italia/bootstrap-italia) branch `3.x` |
| `devkit/*` | [dev-kit-italia](https://github.com/italia/dev-kit-italia) Storybook |
| `design-tokens/*` | [design-tokens-italia](https://github.com/italia/design-tokens-italia) |
| `designers/*` | [designers.italia.it](https://github.com/italia/designers.italia.it) |
| `dsnav.json` | [designers.italia.it](https://github.com/italia/designers.italia.it) |

## Last snapshot

See `snapshot-meta.json` for versions and fetch timestamp.