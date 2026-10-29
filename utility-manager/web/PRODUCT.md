# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
STELCO's South Central Regional Department (SCRD), Maldives. Mixed use:
- Head office managers, engineers and unit heads on desktops in the office, keeping track of plants, gensets, work and the national takeover.
- Island engineers and technicians on phones, often outdoors or inside powerhouses, logging and following up work. Field reporting also happens on the department's Telegram bot (@SRDmanagerbot), which shares the same data.
- Non-technical staff (administration, logistics) and the General Manager, who view work, projects and interruptions without using the system every day.

## Product Purpose
The department's system of record for electricity (powerhouses, diesel gensets, solar, batteries), water (RO plants) and sewerage on the islands of its atolls (AA, ADh, Dh, F, M, Th, V), plus the national FENAKA-to-STELCO takeover tracker. Success: anyone, including someone unfamiliar with it, can log work and track it to completion without help, and the state of every island's plant is visible at a glance.

## Positioning
Built around the department's own operating vocabulary and workflow: monthly genset updates, faults per genset, work orders (WO-0001) with updates, genset moves between islands, interruptions, projects (PRJ-0001) with task trackers, and the takeover map, all shared with the Telegram bot and an assistant.

## Operating Context
- Work orders: logged by technical staff and unit heads, assigned to units or people, updated with short text posts that move them through planned, in progress, awaiting parts, on hold, completed.
- Monthly genset update per powerhouse: hours, status, faults, overhaul/alternator flags.
- Interruptions reported from the field; alerts and a daily summary go to Telegram groups.
- Documents and files are Microsoft 365 links only; the system stores no files.
- Fleet Manager may read records and send monthly updates through an access token.

## Capabilities and Constraints
- React + Vite web app on a Cloudflare Worker, Postgres (Supabase). Live at islandsmanager.org.
- Roles: admin, manager, staff, viewer; technical vs non-technical staff; units with heads; island/atoll scopes.
- Public repository: no staff contacts or personal data in code or docs.
- Must work well on phones (field use) and desktops (office use), in bright outdoor light as well as indoors.

## Brand Commitments
- Keep the STELCO logo (web/public). Colours, type and overall look are free to change.
- Department name: South Central Regional Department, short name SCRD; app name "SCRD Utility Manager".

## Evidence on Hand
Real operational data in the live system (islands, gensets, work orders, takeover statuses). No testimonials or external claims; none should be invented.

## Product Principles
1. Anyone can log and track work without training: the next action is always obvious.
2. State first: what is down, overdue or at fault is visible before anything else.
3. One vocabulary across the website, Telegram and the assistant.
4. Works in the field: readable on a phone in sunlight, usable with one hand.
5. Plain language over jargon in labels, help and errors.

## Accessibility & Inclusion
Field use on phones outdoors: high contrast, large touch targets, colour never the only signal of state.
