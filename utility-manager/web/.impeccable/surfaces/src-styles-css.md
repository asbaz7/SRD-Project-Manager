---
version: 1
slug: "src-styles-css"
primary_target: "src/styles.css"
related_targets: ["src/components/Layout.jsx","src/pages/Work.jsx"]
---

# App shell and every page (web/src/styles.css, Layout)

Scope: the whole SCRD Utility Manager web app (Operate mode). Audience and job: see PRODUCT.md; priority from the user: simple for anyone unfamiliar, logging and tracking work must be easy.

## Direction contract
THESIS: The app wears the same world as the SCRD TV board the user designed: a deep lagoon backdrop under frosted glass, cool and professional, no warmth. It refuses the grey-and-blue admin default and the previous light pastel glass.
OWN-WORLD: Ground is a radial lagoon, #0f3b57 into #0a2740 into #061628, with teal/blue/indigo light blooms and a faint 22px dot grid. Panels are gradient glass (white 13% to 5%) with a 1px white-18% border and a lit top edge. Ink #f2f6fb, secondary 78%, muted 58%. State colours from the board: in progress #4a8fe0, on hold #d69a2d, overdue #db5f5f, done #3ba46e. Labels are tinted glass pills with white type. Rows carry state on a 3px left edge (the board's row style, pinned by the user). Selection is light glass with an inset highlight. One accent blue for primary actions.
STORY: A person opens the app on a desk or a phone, sees what is down, overdue or on hold first, and logs or updates work without help.
FIRST VIEWPORT: Glass sidebar with STELCO logo left (bottom bar on phones); page head with title and primary action top right; state tabs with counts; one search and filter bar; content in glass panels.
FORM: User-pinned direction (the SCRD TV board's theme), which beats the roll; the roll's assigned direction was set aside. seed:284806e4dab44592
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
