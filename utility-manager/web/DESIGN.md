---
name: SCRD Utility Manager
description: The department's system of record for island power, water and sewerage, worn in the SCRD TV board's lagoon glass.
colors:
  accent: "#4a8fe0"
  link: "#9cc8ff"
  state-in-progress: "#4a8fe0"
  state-on-hold: "#d69a2d"
  state-overdue: "#db5f5f"
  state-done: "#3ba46e"
  tone-good: "#6fe3a2"
  tone-warn: "#f3c66b"
  tone-serious: "#f0a07c"
  tone-serious-fill: "#d9774f"
  tone-bad: "#ff8c8c"
  tone-info: "#8cc0ff"
  tone-none: "#6b7a90"
  state-neutral: "#7c8ba0"
  service-electricity: "#6ea5f7"
  service-water: "#34c3b6"
  service-sewerage: "#a98af0"
  lagoon-deep: "#061628"
  lagoon-mid: "#0a2740"
  lagoon-shallow: "#0f3b57"
  bloom-teal: "#1c7c8c"
  bloom-blue: "#2b4c9b"
  bloom-indigo: "#3a3d8f"
  ink: "#f2f6fb"
  ink-secondary: "rgb(222 233 245 / .86)"
  ink-muted: "rgb(222 233 245 / .84)"
  glass-border: "rgb(255 255 255 / .18)"
  glass-hover: "rgb(255 255 255 / .1)"
  glass-solid: "rgb(16 44 70 / .92)"
  hairline: "rgb(255 255 255 / .12)"
  track: "rgb(255 255 255 / .1)"
  field-well: "rgb(0 10 24 / .35)"
typography:
  display:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "2.6rem"
    fontWeight: 750
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "1.6rem"
    fontWeight: 700
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 650
  body:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 650
    letterSpacing: "0.04em"
  figure:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "1.6rem"
    fontWeight: 700
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
rounded:
  xs: "6px"
  sm: "10px"
  md: "12px"
  lg: "14px"
  xl: "18px"
  panel: "22px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "18px"
  page: "24px 28px"
  page-phone: "16px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "8px 15px"
  button-secondary:
    backgroundColor: "{colors.glass-hover}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 15px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 15px"
  button-small:
    rounded: "{rounded.sm}"
    padding: "4px 11px"
  input:
    backgroundColor: "{colors.field-well}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "9px 12px"
  nav-link:
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.md}"
    padding: "9px 12px"
  tab:
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.sm}"
    padding: "7px 14px"
  pill:
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  card:
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "18px"
  work-row:
    textColor: "{colors.ink}"
    padding: "14px 20px"
---

# Design System: SCRD Utility Manager

## Overview

**Creative North Star: "The Lagoon Board"**

The app wears the same world as the SCRD TV board: a deep lagoon at night, navy sinking into near-black, lit from below by soft teal, blue and indigo blooms and a faint dot grid, with frosted glass panels floating over it. The glass is cool, quiet and professional; every panel has a lit top edge as if light from the water catches its rim. It is always dark, as the board is, and there is no light theme.

Colour does jobs only. It marks state (in progress, on hold, overdue, done), service identity (electricity, water, sewerage), and the one accent for actions and selection. Everything else is ink on glass. State is never colour alone: every state carries its word, and asset states also carry a small drawn mark (dot, ring, cross, gear, triangle, square).

Density is that of an operating tool, not a brochure: lists of work rows, tables of gensets, tiles per service. Phones are first-class; the sidebar becomes a floating glass bottom bar and the page head shrinks to its title and main action.

**Key Characteristics:**
- Fixed radial lagoon backdrop with three colour blooms and a 22px dot grid behind everything.
- Gradient frosted glass panels (white 13% to 5%, 22px blur) with a 1px white-18% border and a lit top edge.
- Selection is lighter glass with an inset highlight, never a solid accent fill (filter chips excepted).
- Four board state colours, shown as tinted glass pills with white type and as a 3px left edge on rows.
- One accent blue for primary actions, focus and progress.
- Inter Variable throughout; tabular figures for every number.

## Colors

A cool lagoon palette of navies and frosted whites, with colour reserved for state, service and the single action blue.

### Primary
- **Board Blue** (accent): the only action colour. Primary buttons (as a light-to-deep blue gradient with a soft blue glow), focus borders and rings, progress bars, the current step of a stepper, selected filter chips. It is also the in-progress state colour, which is the board's own choice.
- **Shallow-Water Link** (link): text links and the general focus outline; the cooler, lighter blue that reads on glass.

### Secondary
State colours, taken from the TV board. Each appears as a tinted glass pill fill (40% mix, 70% border) with white type, or as a row's 3px edge:
- **Board Blue** (state-in-progress): in progress, dismantling, in transit, installing.
- **Harbour Amber** (state-on-hold): on hold, awaiting parts.
- **Coral Alarm** (state-overdue): overdue rows, critical severity, nav badges, alert stat rings.
- **Reef Green** (state-done): completed and resolved.
- **Slate Grey** (state-neutral): planned, cancelled, closed.

Text tones for state words on glass, lighter than their fills so they pass contrast: good, warn, serious, bad, info. Serious has its own fill (tone-serious-fill) for major faults; tone-none is the fill for "no report" and missing data.

### Tertiary
Service identity, used on title icons, tile top bars, service badges, the dot before an island name, and the active nav icon:
- **Grid Blue** (service-electricity)
- **Lagoon Teal** (service-water)
- **Outfall Violet** (service-sewerage)

### Neutral
- **Deep Lagoon** (lagoon-deep): page backdrop and the outer edge of the radial ground.
- **Mid Lagoon** (lagoon-mid) and **Shallow Lagoon** (lagoon-shallow): the inner stops of the radial ground.
- **Teal, Blue and Indigo Blooms** (bloom-teal, bloom-blue, bloom-indigo): three soft radial light pools on the backdrop, mixed at roughly 40% into transparency. Never used on components.
- **Frost Ink** (ink): primary text and headings.
- **Secondary Ink** (ink-secondary): nav labels, meta lines, field labels.
- **Muted Ink** (ink-muted): references, dates, table headers and sidebar group labels. It sits close to secondary ink so it stays legible outdoors; hierarchy between the two comes from size and weight.
- **Glass Border** (glass-border), **Hairline** (hairline), **Track** (track): panel borders, row dividers, and the quiet fill behind progress, counts and inner list items.
- **Solid Glass** (glass-solid): the opaque fallback for glass when blur is unsupported or reduced transparency is requested, and the modal and phone sheet surface.
- **Field Well** (field-well): the darker recessed fill of inputs and selects.

### Named Rules
**The Colour Has a Job Rule.** Colour appears only for state, service identity, or the one action blue. A decorative colour with no meaning does not ship.

**The Never Colour Alone Rule.** Every state is a word; asset and condition states also carry a drawn mark. A coloured dot, edge or fill is always backed by its label.

**The Cool Water Rule.** Surfaces, backdrops and neutrals stay cool (navy, teal, frosted white). Warm hues appear only as state (on hold, serious, overdue).

## Typography

**Display Font:** Inter Variable (with Inter, system-ui)
**Body Font:** Inter Variable (with Inter, system-ui)
**Label/Mono Font:** ui-monospace, SFMono-Regular, Menlo for tokens and codes

**Character:** One neutral, highly legible variable sans at many weights (500 to 800), so hierarchy comes from weight and size rather than a second family. Numbers always use tabular figures.

### Hierarchy
- **Display** (750, 2.6rem, 1): the hero figure on service tiles (online capacity and the like); 2.2rem on phones.
- **Headline** (700, 1.6rem): page titles; 1.3rem on phones.
- **Title** (650, 1rem): card and section headings, tile headings at 1.15rem.
- **Body** (400, 15px, 1.5): everything else. Update text is clamped to two lines in lists and capped at 75ch.
- **Label** (650, 0.75rem, 0.04em, uppercase): table headers. Sidebar group labels use the same voice at 0.7rem and 0.08em.
- **Figure** (700, 1.6rem, tabular): stat numbers.

### Named Rules
**The Tabular Figures Rule.** Every count, figure, reference (WO-0001), date and kilowatt value uses tabular numerals, so columns of numbers align.

**The One Family Rule.** Inter Variable carries every role; weight (550 for nav, 600 for controls, 650 for titles and state words, 700 and above for figures) does the work a second face would.

## Layout

A two-column shell on desktop: a 248px floating glass sidebar (12px inset from the viewport, 22px radius, sticky, full height) and a content column capped at 1280px with 24px by 28px padding and 64px at the bottom. Content flows in glass cards on auto-fit grids (minimums of 380px, 300px, 260px and 160px for stats), with 16px gaps between cards and 12px between stats.

The page head is always the same: breadcrumbs, then an optional 44px service-coloured title icon, the title and subtitle, and the actions pushed right with the primary action last. Work-style lists then carry state tabs with counts, one search-and-filter toolbar, and the list.

At 860px and below the shell collapses to one column: the sidebar is replaced by a sticky top bar (logo and account) and a floating glass bottom bar of five tabs (four destinations, Work always among them, plus More, which opens a glass sheet). Page padding drops to 16px with 96px at the bottom to clear the bar. On phones the title icon and desk-only actions (Export CSV) drop out, filters fold behind a Filters button with a count, and tabs scroll sideways rather than wrap.

Spacing steps in 4px multiples with 14px and 18px as common in-between values: 4 to 8 inside controls, 12 to 16 between items, 18 inside cards.

## Elevation & Depth

Depth is glass over water. Panels are translucent gradient glass blurred 22px with 1.35 saturation, lifted by one large, soft, cool shadow, and lit by a 1px inset highlight along the top edge. Inside panels, depth is tonal: lighter glass for hover and selection, darker wells for inputs and segmented tracks. There are no hard or offset shadows.

### Shadow Vocabulary
- **Lagoon float** (`box-shadow: 0 18px 50px rgb(0 8 20 / .35)`): every glass panel: cards, tiles, stats, sidebar, bars.
- **Lit edge** (`box-shadow: inset 0 1px 0 rgb(255 255 255 / .3)`): the top rim of every glass panel, paired with the float.
- **Selection highlight** (`box-shadow: inset 0 1px 0 rgb(255 255 255 / .22)` on `rgb(255 255 255 / .15)`): active nav link, active tab, active bottom-bar item, active segmented switch.
- **Action glow** (`box-shadow: 0 6px 18px rgb(74 143 224 / .4), inset 0 1px 0 rgb(255 255 255 / .35)`): primary buttons only.
- **Focus ring** (`box-shadow: 0 0 0 3px rgb(74 143 224 / .25)` with an accent border): focused inputs and selects. Other controls take a 2px solid outline offset 2px.
- **State edge** (`box-shadow: inset 3px 0 0 <state colour>`): rows that carry a state; see Components.
- **Alert ring** (`box-shadow: inset 0 0 0 1.5px <state fill>, <lagoon float>`): stats that need attention (overdue, warning).

### Named Rules
**The Lit Rim Rule.** Every glass panel has both the inset lit top edge and the lagoon float. A panel with one and not the other reads as a mistake.

**The Glass Fallback Rule.** Where backdrop blur is unsupported or reduced transparency is requested, glass becomes solid glass (`glass-solid`) with no blur; it never becomes transparent over the busy backdrop.

## Shapes

Soft, generously rounded rectangles that grow with size: 6px for priority tags, 8 to 10px for badges, small buttons and tabs, 12px for buttons, inputs, nav links and inner list items, 14 to 16px for tab tracks, stat tiles and atoll headers, 18px for cards and the work list, 22px for the sidebar, tiles, modals and the phone sheet, 26px for the sign-in card. Labels and counts are full pills. Borders are always 1px and translucent white; dividers inside lists are hairlines. Service tiles carry a 4px service-coloured top bar clipped by their radius.

## Components

### Buttons
Quiet glass by default; only the primary action is coloured.
- **Shape:** gently rounded (12px); small buttons 10px.
- **Primary:** a light-to-deep board-blue gradient (140deg, #5aa2f0 to #2f6fc9) with white text, no border, the action glow, padding 8px by 15px, weight 600. One per view, usually the page head's last action ("Log work").
- **Secondary:** white-10% glass with the glass border; hover lifts to white-18%.
- **Ghost:** transparent with a hairline border, for desk utilities (Export CSV, pager, cancel).
- **Hover / Focus / Active:** background shift over 0.12s; press nudges down 1px; focus is a 2px outline offset 2px. Disabled is 50% opacity.

### Chips
- **Style:** pill-shaped glass filter chips with the glass border and 12px blur, secondary ink, weight 600.
- **State:** a selected chip fills solid accent with white text; counts inside chips are tabular.

### Cards / Containers
- **Corner Style:** 18px.
- **Background:** gradient glass (white 13% to 5% at 160deg).
- **Shadow Strategy:** lit edge plus lagoon float (see Elevation & Depth).
- **Border:** 1px white 18%.
- **Internal Padding:** 18px (14px on phones); heading row 12px above content.

### Inputs / Fields
- **Style:** recessed dark well (`field-well`) with a 1px white-16% border, 12px radius, 9px by 12px padding. Selects use a drawn chevron. Placeholders are pale ink at 68%.
- **Focus:** accent border plus a 3px soft blue ring; no outline.
- **Error / Disabled:** errors sit in a coral-tinted solid-glass box with the bad tone; disabled fields drop to 70% opacity.

### Navigation
- **Sidebar:** a floating glass column with the STELCO logo and app name, then nav links (20px line icon and label, weight 550, secondary ink, 12px radius). Hover takes white-10% glass. Active takes the selection highlight with white text; a service link's icon turns its service colour when active or hovered. Groups are separated by small uppercase group labels; a coral count badge flags items needing attention.
- **Phones:** a floating glass bottom bar (20px radius, 10px from the edges) of icon-over-label tabs at 0.68rem; More opens a glass sheet above it.

### State Tabs
A dark track (black 20%, white-10% border, 14px radius, 4px padding) holding tabs (10px radius, weight 600). The active tab takes the selection highlight. Each tab may carry a pill count: track-coloured by default, accent-tinted when active, coral-tinted when the tab is Overdue and non-empty.

### State Pill
Tinted glass label with white type: fill is the state colour at 40% into transparency, border at 70%, full pill radius, 0.78rem weight 600, padding 2px by 10px. Unknown or neutral states use slate grey. The word is always the state's plain name.

### Status Mark (signature)
For assets, conditions and faults: a 12px drawn shape beside the state word, both in the state's text tone, weight 650. Running is a dot, standby a ring, down a cross, maintenance a gear, minor fault a triangle, major fault a square, no faults a check, disconnected a slashed circle, decommissioned a dash, unknown a question mark. Interface icons are 24px-grid line icons at 1.8 stroke in currentColor.

### Work Row (signature)
Each work item is one openable row in a glass list (18px radius), divided by hairlines: title with its reference before it, a meta line (service dot, island, asset, type, separated by middle dots), and the latest update clamped to two lines with author and age. A right column (220px) holds the state pill, who has it, and the due or done date; overdue dates turn coral and bold. The row's state rides on a 3px left edge in the state colour (overdue overrides). Hover takes white-10% glass; focus is an inset accent outline. On phones the row stacks: title, state and holder, meta, update.

## Do's and Don'ts

### Do:
- **Do** put every new surface on gradient glass with the 1px white-18% border, the inset lit top edge and the lagoon float, over the fixed lagoon backdrop.
- **Do** show state with the board colours (in progress #4a8fe0, on hold #d69a2d, overdue #db5f5f, done #3ba46e) as tinted glass pills with white type, and as a 3px left edge on rows.
- **Do** pair every state colour with its word, and asset or condition states with their drawn mark.
- **Do** keep one primary action per view, in the board-blue gradient, placed last in the page head's actions.
- **Do** mark selection with lighter glass (white 15%) and an inset highlight.
- **Do** use tabular figures for every number, date and reference.
- **Do** keep the phone shell: floating bottom bar with Work among its tabs, filters folded behind a button, desk-only actions hidden.

### Don't:
- **Don't** add a light theme or light pastel glass; the world is always dark.
- **Don't** use warm tints on surfaces, backdrops or neutrals; warmth is reserved for on-hold, serious and overdue states.
- **Don't** use colour as decoration or as the only signal of state.
- **Don't** fill selected tabs, nav links or rows with solid accent blue; solid accent is for primary buttons and selected filter chips.
- **Don't** use hard or offset shadows; depth is soft float, lit rim and tonal glass.
- **Don't** set glass panels transparent without blur over the backdrop; fall back to solid glass.
