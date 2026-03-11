# Pokemon Hoops — UI Theme Redesign Spec
**Date:** 2026-03-11
**Status:** Approved

---

## Overview

Redo the entire site styling with a Pokemon theme: white background, Press Start 2P pixel font, Classic R/B/Y color palette, pixel-art borders with hard shadows, typewriter effects in key areas, and a React component library + Tailwind token extension so future features can reuse the same UI patterns consistently. Dark mode is also supported via CSS variable swapping.

---

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Style era | Modern Pixel (Pokemon R/B aesthetic) | White bg, hard pixel borders, clean but unmistakably Pokemon |
| Font | Press Start 2P | Loaded via `next/font/google` for self-hosting and zero layout shift |
| Colors | Classic R/B/Y palette | Most recognizable Pokemon color identity |
| Typewriter | Dialogue boxes, tournament play-by-play, login welcome | Matches actual Pokemon game UX patterns |
| Implementation | React component library + Tailwind token extension | Most extensible; future features just import components |
| Dark mode | CSS variable swap on `[data-theme="dark"]` | Same components, no duplication, localStorage + system pref |

---

## Color Tokens

All colors are defined as CSS custom properties in `globals.css`. Components reference semantic variable names (not raw hex) so dark mode works automatically.

### Semantic Token Names (used in all components)

| CSS Variable | Light Value | Dark Value | Usage |
|---|---|---|---|
| `--color-bg` | `#f0f0ff` | `#0d0d1a` | Page background |
| `--color-surface` | `#ffffff` | `#1a1a2e` | Card / dialog / panel bg |
| `--color-surface-alt` | `#f8f8ff` | `#16213e` | Input background / inset areas |
| `--color-border` | `#3b4cca` | `#ffde00` | Primary border color |
| `--color-shadow` | `#222222` | `#ffde00` | Hard pixel shadow color |
| `--color-primary` | `#3b4cca` | `#ffde00` | Primary action / nav bg / highlights |
| `--color-primary-text` | `#ffde00` | `#222222` | Text on primary-colored surfaces |
| `--color-accent` | `#ffde00` | `#3b4cca` | Secondary accent |
| `--color-danger` | `#cc0000` | `#cc0000` | Danger / live / HP |
| `--color-text` | `#222222` | `#ffffff` | Body text |
| `--color-text-muted` | `#666666` | `#aaaaaa` | Secondary / metadata text |

### Static Palette (for Tailwind class generation only — never used directly in components)

These are registered in the Tailwind `@theme` block purely to generate utility classes like `bg-poke-blue`. Components use the semantic CSS variables above.

| Tailwind Token | Value |
|---|---|
| `poke-blue` | `#3b4cca` |
| `poke-yellow` | `#ffde00` |
| `poke-red` | `#cc0000` |
| `poke-black` | `#222222` |
| `poke-white` | `#ffffff` |

---

## Shadow Scale

All shadows are hard pixel-offset (no blur) to match the pixel art aesthetic. They reference `--color-shadow` so dark mode automatically flips to yellow shadows.

| Tailwind Class | CSS Value | Usage |
|---|---|---|
| `shadow-poke-sm` | `2px 2px 0 var(--color-shadow)` | Small interactive elements |
| `shadow-poke-md` | `4px 4px 0 var(--color-shadow)` | Cards, dialogs |
| `shadow-poke-primary` | `4px 4px 0 var(--color-primary)` | Highlighted / selected cards |
| `shadow-poke-danger` | `4px 4px 0 var(--color-danger)` | Danger / live elements |

---

## Typography Scale

Font: loaded via `next/font/google` (`Press_Start_2P`) in `layout.tsx`, applied as a CSS variable (`--font-pixel`) to `<html>`, then set globally in `globals.css` as `font-family: var(--font-pixel), monospace`.

| Level | Size | Line Height | Usage |
|---|---|---|---|
| H1 | `14px` | `1.8` | Site title ("POKEMON HOOPS") |
| H2 | `11px` | `1.8` | Page titles ("ROSTER BUILDER") |
| H3 | `9px` | `2` | Section headings |
| Body | `8px` | `2` | Card names, labels |
| Small | `7px` | `2` | Stats, descriptions, button labels |
| XS | `6px` | `2` | Pokedex number, salary, secondary info |
| XXS | `5px` | `2` | Type badges |

---

## Tailwind `@theme` Extension

This project uses **Tailwind CSS v4**, which configures tokens in CSS via the `@theme` block in `globals.css` — there is no `tailwind.config.ts`. Add to the `@theme` block:

```css
@theme {
  --color-poke-blue: #3b4cca;
  --color-poke-yellow: #ffde00;
  --color-poke-red: #cc0000;
  --color-poke-black: #222222;
  --color-poke-white: #ffffff;

  --font-family-pixel: var(--font-pixel), monospace;

  --shadow-poke-sm: 2px 2px 0 var(--color-shadow);
  --shadow-poke-md: 4px 4px 0 var(--color-shadow);
  --shadow-poke-primary: 4px 4px 0 var(--color-primary);
  --shadow-poke-danger: 4px 4px 0 var(--color-danger);
}
```

---

## React Component Library

All components live in `src/app/components/ui/`. Each is a thin wrapper that encapsulates the Pokemon styling, exposes standard HTML props, and uses the semantic CSS variables above. All colors used inside components reference `var(--color-*)` tokens — never raw hex values.

### `<PokeButton>`
**Variants:** `primary` (primary bg, primary-text), `danger` (danger bg, white text), `ghost` (surface bg, primary border+text)
**Props:** `variant`, `size` (`sm` | `md`), standard button HTML props
**Style:** 2px solid `var(--color-border)`, `shadow-poke-sm`, pixel font, no border-radius

### `<PokeCard>`
**Props:** `children`, `variant` (`default` | `highlighted` | `danger`), `className`
**Style:** `var(--color-surface)` bg, 3px solid `var(--color-border)`, `shadow-poke-md`, no border-radius
**Variants:** `highlighted` uses `shadow-poke-primary`; `danger` uses `shadow-poke-danger`

### `<PokeDialog>`
**Props:** `label` (string — optional colored tab at top), `children`, `showCursor` (boolean, default `false`)
**Style:** `var(--color-surface)` bg, 3px solid `var(--color-shadow)` border, `shadow-poke-md`
**Cursor behavior:** When `showCursor={true}`, renders a blinking block cursor (`■`) after the last child via CSS `::after`. This is CSS-only. `<TypewriterText>` manages its own internal cursor independently — when used inside `<PokeDialog>`, set `showCursor={false}` on the dialog to avoid a double cursor.

### `<TypewriterText>`
**Props:** `text` (string or string[]), `speed` (ms per char, default 40), `onDone` (callback), `className`
**Behavior:** Types out characters one at a time. If given an array, types each string sequentially with a 400ms pause between. Shows an inline blinking block cursor (`■`) while typing; cursor disappears on completion. The cursor is rendered inline as a `<span>` — not via CSS pseudo-elements — so it works correctly mid-sentence.
**Usage:** Login welcome message, PokeDialog content, tournament play-by-play events

### `<TypeBadge>`
**Props:** `type` (Pokemon type string, e.g. `"fire"`, `"water"`)
**Style:** Keeps existing 18-type background colors from `globals.css` (`.type-fire` etc.), adds 1px solid `var(--color-shadow)` border, Press Start 2P at 5px, no border-radius
**Usage:** Pokemon cards, roster slots

### `<PokeInput>`
**Props:** `label` (string), standard input/textarea HTML props
**Style:** 3px solid `var(--color-border)` border, `var(--color-surface-alt)` background, `shadow-poke-sm`, pixel font, no border-radius; focus state increases border to `var(--color-primary)` with `outline: none`

### `<ThemeToggle>`
**Props:** none (client component, `"use client"`)
**Behavior:**
1. On mount, reads `localStorage.getItem('theme')`. If not set, falls back to `window.matchMedia('(prefers-color-scheme: dark)').matches`.
2. Sets `document.documentElement.setAttribute('data-theme', value)`.
3. On toggle click, flips the value, updates the attribute, and writes to `localStorage`.
**Style:** Small ☀ / ☾ `<PokeButton variant="ghost" size="sm">`, lives in nav header
**Flash prevention:** An inline `<script>` tag is added to `layout.tsx`'s `<head>` (before any CSS loads) that reads `localStorage` and sets `data-theme` synchronously. This runs before React hydrates and prevents flash of wrong theme.

---

## Page-Level Changes

### Auth Screen (`AuthForm.tsx`)
- Full-page `var(--color-bg)` background
- Centered `<PokeCard>` with Professor Oak speech bubble above the form
- Speech bubble contains `<TypewriterText text={["Welcome, Trainer!", "Build your dream Pokemon roster."]} />`
- Inputs: `<PokeInput>`
- Buttons: `<PokeButton variant="primary">` (Sign In) and `<PokeButton variant="ghost">` (toggle sign up/in)

### Dashboard (`RosterDashboard.tsx`)
- Sticky nav bar: `var(--color-primary)` background, `var(--color-primary-text)` text, contains `<ThemeToggle>` and sign out `<PokeButton variant="ghost">`
- Tournament banner: `<PokeCard variant="highlighted">` with red `★ TOURNAMENT ROSTER` label badge, two action buttons
- Roster grid: each roster is a `<PokeCard>` with name, pixel progress bar (primary color when 6/6, accent color otherwise), Pokemon count, Edit + Delete `<PokeButton>` variants
- New Roster: dashed `var(--color-border)` border card with `+` icon (not a `<PokeCard>` — use a custom dashed-border div)

### Roster Builder (`RosterBuilder.tsx`)
- Left sidebar: `var(--color-surface)` bg, `var(--color-border)` border-right, pixel font labels
- Type filter pills: rendered as `<TypeBadge>` — selected state adds `shadow-poke-sm`
- Search: `<PokeInput>`
- Pokemon browse grid: each entry is `<PokeCard>` with sprite (`image-rendering: pixelated`), Pokedex number, name, `<TypeBadge>` tags, stats (PPG/RPG/APG), salary, `<PokeButton variant="primary" size="sm">` to draft. Disabled state: reduced opacity, no shadow, button disabled.
- Right sidebar roster slots: each slot is a `<PokeCard>` showing position label + assigned Pokemon (or empty placeholder)
- Salary cap tracker: pixel-style `<progress>`-like div, fills with `var(--color-primary)`, turns `var(--color-danger)` when over cap

### Pokemon Card (`PokemonCard.tsx`)
- Wraps in `<PokeCard>` with all content inside
- Sprite: `<img>` with `image-rendering: pixelated`, `var(--color-surface-alt)` background
- Name: Body (8px) weight, `var(--color-text)`
- Types: row of `<TypeBadge>`
- Stats row: XS (6px), `var(--color-text-muted)`
- Draft button: `<PokeButton variant="primary" size="sm">`

### Roster Slot (`RosterSlot.tsx`)
- Wraps in `<PokeCard>`
- Position label (PG/SG/SF/PF/C/6th): XS (6px), `var(--color-text-muted)`
- Filled state: shows Pokemon sprite, name, remove button (`<PokeButton variant="danger" size="sm">`)
- Empty state: dashed inner border, position label centered, muted text

### Tournament View (`TournamentView.tsx`)
- Bracket matchup cards: `<PokeCard>` — winner uses `variant="highlighted"`, loser uses reduced opacity
- Match detail: `<PokeDialog label="HIGHLIGHTS">` wrapping a scrollable event log
- Play-by-play: each new event renders as `<TypewriterText>` inside the dialog. Previous events rendered as static text at reduced opacity (0.5). Only the newest event types in.
- Buttons: `<PokeButton>` variants

### Live Tournament (`LiveTournament.tsx`)
- Same treatment as TournamentView
- "LIVE" indicator: small pill with `var(--color-danger)` background, `var(--color-primary-text)` text, pixel border, pulsing CSS animation

### Global (`layout.tsx`, `globals.css`)
- `layout.tsx`: load `Press_Start_2P` via `next/font/google`, apply as `--font-pixel` CSS variable on `<html className={pixelFont.variable}>`. Add flash-prevention inline `<script>` in `<head>`.
- `globals.css`: define all `--color-*` CSS variables on `:root` (light) and `[data-theme="dark"]`. Define `@theme` tokens. Set `font-family: var(--font-pixel), monospace` on `body`. Set `background-color: var(--color-bg)` on `body`. Retain all 18 `.type-*` classes, add `border: 1px solid var(--color-shadow)` to each.

---

## File Structure

```
src/
  app/
    components/
      ui/                        ← NEW: component library
        PokeButton.tsx
        PokeCard.tsx
        PokeDialog.tsx
        TypewriterText.tsx
        TypeBadge.tsx
        PokeInput.tsx
        ThemeToggle.tsx
        index.ts                 ← barrel export
      AuthForm.tsx               ← updated
      RosterDashboard.tsx        ← updated
      RosterBuilder.tsx          ← updated
      PokemonCard.tsx            ← updated
      RosterSlot.tsx             ← updated
      TournamentView.tsx         ← updated
      LiveTournament.tsx         ← updated
    globals.css                  ← updated: CSS vars, @theme tokens, font, type colors
    layout.tsx                   ← updated: next/font/google, flash-prevention script
```

---

## Dark Mode Implementation

1. All semantic `--color-*` CSS variables defined on `:root` in `globals.css` for light mode values.
2. `[data-theme="dark"]` selector in `globals.css` overrides the same variable names with dark values.
3. Components reference only `var(--color-*)` — never raw hex. Colors swap automatically.
4. `<ThemeToggle>` is a client component that toggles the `data-theme` attribute on `<html>` and persists to `localStorage`.
5. Flash prevention: inline `<script>` in `layout.tsx`'s `<head>` reads `localStorage` synchronously before hydration and sets `data-theme` on `<html>`. This script runs before CSS paints, eliminating flash of wrong theme. `layout.tsx` itself is a Server Component and does not access `localStorage` directly.

---

## Out of Scope

- Animations beyond typewriter cursor blink, typewriter typing, and the "LIVE" pulse
- Pokemon sprite animations (static `<img>` with `image-rendering: pixelated`)
- Any changes to backend logic, API routes, or data
- Sound effects
