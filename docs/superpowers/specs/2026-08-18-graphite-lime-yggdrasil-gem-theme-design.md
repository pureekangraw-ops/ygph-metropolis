# METRO Graphite Lime × YGGDRASIL Gem Theme — Design Spec

**Status:** Proposed Production Design
**Product:** YGPH METROPOLIS
**Scope:** Visual theme and icon-language only
**Baseline:** Production `main` at `70d348d9`

## Goal

Create a production-ready METRO visual identity that combines a Graphite Lime palette with YGGDRASIL gemstone principles while preserving the current layout, button placement, navigation, workflows, business logic, data authority, and interaction architecture.

## Core Visual Principle

**LIGHT = MEANING.**

Graphite surfaces form the quiet default state. Lime illumination appears only when an element is active, selected, ready, verified, successful, or directly actionable. Warning and danger retain separate semantic colors and must never be represented by lime.

## Theme Architecture

The theme is implemented in three layers:

1. **Theme Tokens** — one authority for colors, surfaces, borders, shadows, radii, spacing, focus, and semantic states.
2. **Component Treatment** — shared visual rules for cards, buttons, navigation, inputs, badges, dialogs, warnings, metrics, lists, and empty states.
3. **Page Emphasis** — Home, Store, Ride, Finance, Calendar, and System may weight the same components differently according to their task, but they may not create independent local themes.

No business-domain module may own theme colors directly.

## Palette Direction

The palette is Graphite-first rather than green-first.

- Background: near-black graphite, neutral-to-cool rather than forest green.
- Raised surfaces: stepped graphite layers with subtle green-neutral undertone.
- Primary text: high-contrast off-white.
- Secondary text: muted neutral-gray with sufficient contrast.
- Accent: restrained electric lime.
- Success / Active / Verified / Actionable: lime family.
- Warning: warm amber/yellow.
- Danger: muted red.
- Borders: low-contrast graphite; accent borders appear only for semantic emphasis.

Large lime-filled areas are prohibited. Lime is an energy signal, not a wallpaper color.

## YGGDRASIL Gem Language

The theme uses gemstone principles in both conceptual and physical visual treatment. Gemstone language must improve comprehension rather than become decoration.

### Diamond — Clarity / Facet

Use crisp hierarchy and controlled facet-like edge treatment on high-value cards, selected controls, and verified information. The visual effect is subtle: a sharper border transition, small highlight, or layered surface edge rather than literal diamond drawings.

### Alexandrite — Temporal Shift

Calendar and time-sensitive states may change visual emphasis as time state changes. Today, due, overdue, and future must remain semantically distinct. The shift is expressed through state tokens, brightness, border weight, or limited hue shift; it must not recolor the whole screen.

### Rutilated Quartz — Trace / Lineage

Where data has a real relationship or provenance chain, thin thread-like visual markers may expose lineage. Examples include obligation → installment → payment and sale → receivable. Decorative lines without a real relation are prohibited.

### Chabazite — Lattice / Living Structure

Related metrics and current-state summaries should feel like one coherent lattice through shared spacing, alignment, surface levels, and grouping. Avoid unrelated floating-card visual noise.

### Labradorite — Reveal / Orientation

Focus, selection, modal opening, and active inspection may use a restrained directional sheen or gradient reveal. It must remain subtle, short-lived, and cheap to render. Persistent glow is prohibited.

### Trapiche — Brand Geometry

Trapiche-inspired radial geometry may inform the METRO brand mark, app icon, loading mark, or empty-state symbol. It must remain geometric and system-like.

**Do not use a tree icon.**

Trapiche morphology must not imply system topology or city count. The app mark must not visually claim six cities or alter YGGDRASIL architecture.

## Icon System

Bottom navigation icons must be redesigned as one coherent family.

Requirements:

- Same stroke family, optical size, corner language, and visual weight.
- Five destinations remain Home, Store, Ride, Finance, Calendar.
- Active state uses lime plus a restrained active indicator.
- Inactive icons are quieter but remain legible.
- Icons must communicate the destination directly; no decorative gemstone icon replaces functional meaning.
- App icon / brand symbol must use geometric METRO/system language and must not use a tree.

## Component Language

### Cards and Panels

Use stepped graphite surfaces and reduced border contrast. Important cards may gain a facet highlight when selected or actionable. Avoid bright outlines around every card.

### Primary Actions

Primary actions are the strongest lime-bearing control in the local view. Text contrast must remain high. Do not use lime equally on multiple competing actions.

### Secondary and Utility Actions

Remain mostly graphite/transparent with clear affordance. They must be visually subordinate to primary actions.

### Bottom Navigation

Keep existing location, five-column structure, touch target, and navigation behavior. Active destination uses a raised graphite surface, lime icon/text, and a small indicator. Do not move navigation or change destination order.

### Inputs and Selects

Use a darker graphite well within the containing surface. Normal borders are quiet. Focus uses a clearly visible lime focus treatment that does not depend on color alone where practical.

### Badges and Status

Status color follows semantic meaning, not page theme. Success/ready/verified may use lime; warning uses amber; danger uses red. Labels or icons must supplement color where the state matters.

### Modal Dialogs

Dialogs rise through surface level and shadow, not through bright borders. Existing centered-dialog interaction remains unchanged.

### Metrics

Primary numeric truth receives the highest text contrast. Labels and supporting copy are quieter. Finance must never imply that every positive-looking number is spendable money merely because lime is available.

### Motion

Motion is optional and restrained. Only short feedback/reveal transitions are allowed. Respect `prefers-reduced-motion`. No continuous glow, shimmer, particle, or expensive animation.

## Page Emphasis

### Home

Quietest page. Attention items lead, then useful summary, then city doors. Lime appears only around actionable or selected information.

### Store

Truth-first inventory and receivable information. Use lattice grouping for related stock and receivable summaries. Rutilated trace treatment may appear only where source relationships are real.

### Ride

Highest quick-glance contrast because it is used during active work. Current round, earnings, and state changes must be immediately readable. Avoid decorative effects that reduce outdoor readability.

### Finance

Numbers and obligations lead. Keep lime semantically restrained so it is not interpreted as “good money.” Warning and danger states must dominate lime where relevant.

### Calendar

Temporal state is the visual driver. Use Alexandrite-style state shift for today/selected/due/overdue/future while preserving current calendar layout and controls.

### System / Settings

Clarity-first. Version, service-worker status, diagnostics, backup, and security information use Diamond-style hierarchy and minimal decoration.

## Accessibility and Real-World Use

- Mobile-first.
- Maintain existing touch-target dimensions or larger.
- Text and functional icons require sufficient contrast in normal and outdoor conditions.
- Focus remains visible.
- Warning/danger/verification states may not rely on color alone when material.
- Theme effects must not obscure Thai text or numbers.
- Reduced-motion preference must be respected.

## Performance Constraints

Use CSS variables, gradients, borders, shadows, and short transitions only. No heavy image backgrounds, canvas effects, WebGL, particle systems, or large decorative assets. Theme work must not materially increase interaction latency or interfere with the PWA/service-worker lifecycle.

## Non-Goals

This theme does **not**:

- change business logic;
- change formulas;
- change data ownership or truth;
- move buttons or navigation;
- change workflows;
- redesign information architecture;
- introduce a theme selector in this phase;
- create separate themes per city;
- turn METRO into a fantasy/jewelry visual product;
- use a tree as the app icon.

## Verification Contract

Implementation is acceptable only when:

1. Existing functional and Greenfield tests still pass.
2. A dedicated theme contract test proves one theme-token authority and prohibits independent page palettes.
3. Bottom navigation retains five destinations and current order.
4. Functional controls retain existing IDs/actions unless a purely presentational wrapper is required and proven safe.
5. Warning, danger, focus, and active states remain visibly distinct.
6. `prefers-reduced-motion` has a safe path.
7. Service-worker production asset revision is updated through the existing release gate.
8. Production Gate passes before deployment.
9. Production is visually checked on a real mobile surface after deployment.

## Implementation Boundary

Theme implementation should prefer modifying the current stylesheet authority and icon owner rather than creating multiple era-specific stylesheets. If the existing stylesheet becomes difficult to maintain, it may be split only by stable responsibility (tokens/components) while retaining a single theme authority and one production import path.
