#!/usr/bin/env bash
# smoke-test.sh — runs a lot of test-matrix call against the local dev server,
# logs everything to one file for manual or LLM assisted review before 
# a new release tag.

# Manual pre-release smoke test — not automated (would require exporting
# createMcpServer from index.ts: risk on a production entry point outweighs
# the benefit). Update this file whenever a tool is added, removed, 
# or gets a new param.

set -uo pipefail   # no -e on purpose: a failing call is data, not a reason to stop

cd "$(git rev-parse --show-toplevel)" || { echo "not inside a git repo"; exit 1; }

OUT="review-$(date +%Y%m%d-%H%M).log"
: > "$OUT"

run() {
  local label="$1"; shift
  echo "### $label"
  {
    echo "### $label"
    echo "\$ $*"
  } >> "$OUT"
  TRANSPORT=stdio npx @modelcontextprotocol/inspector --cli npx tsx --env-file=.env src/index.ts "$@" >> "$OUT" 2>&1
  echo "" >> "$OUT"
}

# ── Discovery ─────────────────────────────────────────────────────────────
run "ping" \
  --method tools/call --tool-name ping

run "dsi_list_components" \
  --method tools/call --tool-name dsi_list_components

run "dsi_search_components: fisarmonica" \
  --method tools/call --tool-name dsi_search_components --tool-arg query=fisarmonica

run "dsi_search_components: dialog" \
  --method tools/call --tool-name dsi_search_components --tool-arg query=dialog

run "dsi_search_components: no match" \
  --method tools/call --tool-name dsi_search_components --tool-arg query=xyzzy

# ── Bootstrap Italia ─────────────────────────────────────────────────────
run "bsi_list_component_variants: accordion" \
  --method tools/call --tool-name bsi_list_component_variants --tool-arg component=accordion

run "bsi_get_component_markup: accordion, default variant" \
  --method tools/call --tool-name bsi_get_component_markup --tool-arg component=accordion

# NB: "Base" è una guess ragionevole sul nome variante — se questa fallisce,
# prendi un nome vero dall'output della chiamata sopra e sostituiscilo qui.
run "bsi_get_component_markup: accordion, variant esplicita" \
  --method tools/call --tool-name bsi_get_component_markup --tool-arg component=accordion --tool-arg variant=Base

run "bsi_list_components_by_status: PRONTO (default bootstrapItalia)" \
  --method tools/call --tool-name bsi_list_components_by_status --tool-arg status=PRONTO

run "bsi_list_components_by_status: PRONTO, library=devKitItalia" \
  --method tools/call --tool-name bsi_list_components_by_status --tool-arg status=PRONTO --tool-arg library=devKitItalia

# ── Dev Kit Italia ───────────────────────────────────────────────────────
run "devkit_list_component_variants: icon (Dev Kit-only component)" \
  --method tools/call --tool-name devkit_list_component_variants --tool-arg component=icon

run "devkit_get_component_markup: icon" \
  --method tools/call --tool-name devkit_get_component_markup --tool-arg component=icon

run "devkit_list_component_props: accordion (check subcomponent props)" \
  --method tools/call --tool-name devkit_list_component_props --tool-arg component=accordion

run "devkit_list_component_variants: affix (bundle pattern, not dedicated)" \
  --method tools/call --tool-name devkit_list_component_variants --tool-arg component=affix

run "devkit_get_component_markup: affix" \
  --method tools/call --tool-name devkit_get_component_markup --tool-arg component=affix

# ── Design tokens ────────────────────────────────────────────────────────
run "tokens_list_component_vars: accordion (check valueResolvedNote on scss-expression)" \
  --method tools/call --tool-name tokens_list_component_vars --tool-arg component=accordion

run "tokens_resolve: --it-elevation-low (KNOWN still broken, composite value, fix in 0.4.1)" \
  --method tools/call --tool-name tokens_resolve --tool-arg variable=--it-elevation-low

run "tokens_resolve: \$it-spacing-m (Sass form)" \
  --method tools/call --tool-name tokens_resolve --tool-arg 'variable=$it-spacing-m'

run "tokens_resolve: --bsi-accordion-body-padding-x" \
  --method tools/call --tool-name tokens_resolve --tool-arg variable=--bsi-accordion-body-padding-x
  
run "tokens_list_globals: no args" \
  --method tools/call --tool-name tokens_list_globals

run "tokens_list_globals: match=spacing" \
  --method tools/call --tool-name tokens_list_globals --tool-arg match=spacing

run "tokens_find_components: --it-spacing-m" \
  --method tools/call --tool-name tokens_find_components --tool-arg variable=--it-spacing-m

run "tokens_search: blue" \
  --method tools/call --tool-name tokens_search --tool-arg query=blue

# ── Documentazione, issue, stato ────────────────────────────────────────
run "docs_get_component_guide: accordion (no mismatch expected)" \
  --method tools/call --tool-name docs_get_component_guide --tool-arg component=accordion

run "docs_get_component_guide: buttons (alias pair, watch for mismatch warning)" \
  --method tools/call --tool-name docs_get_component_guide --tool-arg component=buttons

run "github_get_component_issues: accordion" \
  --method tools/call --tool-name github_get_component_issues --tool-arg component=accordion

run "github_get_project_repo_links" \
  --method tools/call --tool-name github_get_project_repo_links

# ── Edge cases / errori — spesso dove si trova il prossimo bug ──────────
run "EDGE: bsi_get_component_markup su componente inesistente" \
  --method tools/call --tool-name bsi_get_component_markup --tool-arg component=nonexistentcomponent

run "EDGE: devkit_get_component_markup su componente inesistente" \
  --method tools/call --tool-name devkit_get_component_markup --tool-arg component=nonexistentcomponent

run "EDGE: docs_get_component_guide su componente inesistente" \
  --method tools/call --tool-name docs_get_component_guide --tool-arg component=nonexistentcomponent

run "EDGE: bsi_list_components_by_status con stato inventato" \
  --method tools/call --tool-name bsi_list_components_by_status --tool-arg status=STATO_INVENTATO

run "EDGE: bsi_list_components_by_status con library=uiKitItalia (non valido nell'enum)" \
  --method tools/call --tool-name bsi_list_components_by_status --tool-arg status=PRONTO --tool-arg library=uiKitItalia

run "EDGE: tokens_resolve su variabile inesistente" \
  --method tools/call --tool-name tokens_resolve --tool-arg variable=--bsi-nonexistent-var

echo ""
echo "Fatto. Output completo in: $OUT"
echo "Consiglio: grep -c '\"isError\": true' \"$OUT\"  per un conteggio rapido di quante chiamate sono fallite"