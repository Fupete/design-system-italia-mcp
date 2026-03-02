// ─── Costanti condivise ───────────────────────────────────────────────────────

// Warning alpha layer — usato in ping (index.ts) e in meta.warnings dei tool
// che espongono dati da sorgenti alpha (token CSS, Dev Kit Italia).
//
// Sorgenti alpha: #3 BSI custom_properties.json, #6 Dev Kit index, #7 Dev Kit stories
// Sorgenti stabili: #1 #2 BSI markup/status, #4 Designers YAML, #5 DTI, #8 GitHub Issues
export const ALPHA_WARNING =
  'Token layer alpha: Bootstrap Italia ' + VERSION_BSI_HINT() + ' e Dev Kit Italia usano BSI 3.x (alpha). ' +
  'Markup HTML e stato componenti sono stabili. ' +
  'Token CSS (--bsi-*) e web component Dev Kit possono avere breaking changes prima della release stabile.'

function VERSION_BSI_HINT(): string {
  return '3.x'
}