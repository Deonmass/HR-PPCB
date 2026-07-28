Guest house Excel templates
===========================

EXPORT TEMPLATE (unique format — use this only for export / current gestion)
---------------------------------------------------------------------------
Canonical path: Excel/templates/guest-house/Guesthouse_template.xlsx
Registered via GUEST_HOUSE_EXPORT_TEMPLATE_PATH in lib/excel-export-template-paths.ts

Sheet "Gestion": monthly occupancy calendar (single sheet / layout).
- Column A: building headers (Batiment #1, Batiment #2, Kimpese) + Room # N - NAME
- Columns B–AF: days of the month (guest name when occupied)
- AG/AH: Total / Taux % (formulas preserved)
- Kimpese (row 26+): external hotels when on-site guest house is full

Do NOT replace this file with a multi-month multi-sheet workbook.

HISTORY / SEED SOURCE (import-only — never used as export template)
-------------------------------------------------------------------
Path: Excel/templates/guest-house/history/All GH passage.xlsx

Contains one planning sheet per past month (Sept 2022 → …).
Import into JSON with:
  node scripts/import-guest-house-history.mjs

Root Excel/Guesthouse_template.xlsx may exist as a synced blank copy; canonical
export path remains Excel/templates/guest-house/Guesthouse_template.xlsx.
