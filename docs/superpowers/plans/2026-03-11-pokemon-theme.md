# Pokemon Theme Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the entire Pokemon Hoops app with a pixel-art Pokemon theme: white background, Press Start 2P font, Classic R/B/Y palette, hard pixel shadows, typewriter effects, dark mode, and a reusable React component library.

**Architecture:** New `src/app/components/ui/` folder holds 7 reusable components (`PokeButton`, `PokeCard`, `PokeDialog`, `TypewriterText`, `TypeBadge`, `PokeInput`, `ThemeToggle`) that all existing page components are updated to use. All colors are CSS custom properties so dark mode is a single attribute swap on `<html>`. Tokens are also registered in Tailwind's `@theme` block.

**Tech Stack:** Next.js 16 App Router · Tailwind CSS v4 (`@theme` CSS block — no `tailwind.config.ts`) · `next/font/google` (Press Start 2P) · TypeScript · React 19 (client components for interactive UI)

---

## File Map

### Created

- `src/app/components/ui/PokeButton.tsx` — Button with primary/danger/ghost variants
- `src/app/components/ui/PokeCard.tsx` — Card container with pixel border and hard shadow
- `src/app/components/ui/PokeDialog.tsx` — Pokemon dialogue box with optional label tab
- `src/app/components/ui/TypewriterText.tsx` — Types text out character by character
- `src/app/components/ui/TypeBadge.tsx` — Pokemon type pill badge
- `src/app/components/ui/PokeInput.tsx` — Labeled text input with pixel border
- `src/app/components/ui/ThemeToggle.tsx` — Light/dark mode toggle button
- `src/app/components/ui/index.ts` — Barrel export

### Modified

- `src/app/globals.css` — CSS variables, `@theme` tokens, font, type colors
- `src/app/layout.tsx` — `next/font/google`, flash-prevention inline script
- `src/app/components/AuthForm.tsx` — Restyle with UI components
- `src/app/components/RosterDashboard.tsx` — Restyle with UI components
- `src/app/components/PokemonCard.tsx` — Restyle with UI components
- `src/app/components/RosterSlot.tsx` — Restyle with UI components
- `src/app/components/RosterBuilder.tsx` — Restyle with UI components
- `src/app/components/TournamentView.tsx` — Restyle with UI components + TypewriterText
- `src/app/components/LiveTournament.tsx` — Restyle with UI components

---

## Chunk 1: Foundation — CSS Variables, Tokens, Font

### Task 1: Update `globals.css` with CSS variables, `@theme` tokens, and updated type colors

**Files:**

- Modify: `src/app/globals.css`

- [ ] **Step 1: Replace `globals.css` entirely**

Replace the full contents of `src/app/globals.css` with:

```css
@import "tailwindcss";

/* ─── Pokemon Theme: CSS Custom Properties ─────────────────────────────── */

:root {
  /* Semantic tokens — used by all components */
  --color-bg: #f0f0ff;
  --color-surface: #ffffff;
  --color-surface-alt: #f8f8ff;
  --color-border: #3b4cca;
  --color-shadow: #222222;
  --color-primary: #3b4cca;
  --color-primary-text: #ffde00;
  --color-accent: #ffde00;
  --color-danger: #cc0000;
  --color-text: #222222;
  --color-text-muted: #666666;
}

[data-theme="dark"] {
  --color-bg: #0d0d1a;
  --color-surface: #1a1a2e;
  --color-surface-alt: #16213e;
  --color-border: #ffde00;
  --color-shadow: #ffde00;
  --color-primary: #ffde00;
  --color-primary-text: #222222;
  --color-accent: #3b4cca;
  --color-danger: #cc0000;
  --color-text: #ffffff;
  --color-text-muted: #aaaaaa;
}

/* ─── Tailwind v4 @theme tokens ─────────────────────────────────────────── */

@theme inline {
  /* Static palette (for bg-poke-blue etc.) */
  --color-poke-blue: #3b4cca;
  --color-poke-yellow: #ffde00;
  --color-poke-red: #cc0000;
  --color-poke-black: #222222;
  --color-poke-white: #ffffff;

  /* Font */
  --font-family-pixel: var(--font-pixel), monospace;

  /* Pixel hard shadows */
  --shadow-poke-sm: 2px 2px 0 var(--color-shadow);
  --shadow-poke-md: 4px 4px 0 var(--color-shadow);
  --shadow-poke-primary: 4px 4px 0 var(--color-primary);
  --shadow-poke-danger: 4px 4px 0 var(--color-danger);
}

/* ─── Base ──────────────────────────────────────────────────────────────── */

html {
  -webkit-text-size-adjust: 100%;
  scroll-behavior: smooth;
}

body {
  background-color: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-pixel), monospace;
  -webkit-tap-highlight-color: transparent;
  overscroll-behavior-y: contain;
}

/* ─── Scrollbar ─────────────────────────────────────────────────────────── */

::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: var(--color-surface-alt);
}
::-webkit-scrollbar-thumb {
  background: var(--color-border);
}
::-webkit-scrollbar-thumb:hover {
  background: var(--color-primary);
}

/* ─── Pokemon Type Colors ───────────────────────────────────────────────── */

.type-normal {
  background: #a8a878;
  color: #fff;
  border: 1px solid var(--color-shadow);
}
.type-fire {
  background: #f08030;
  color: #fff;
  border: 1px solid var(--color-shadow);
}
.type-water {
  background: #6890f0;
  color: #fff;
  border: 1px solid var(--color-shadow);
}
.type-electric {
  background: #f8d030;
  color: #333;
  border: 1px solid var(--color-shadow);
}
.type-grass {
  background: #78c850;
  color: #fff;
  border: 1px solid var(--color-shadow);
}
.type-ice {
  background: #98d8d8;
  color: #333;
  border: 1px solid var(--color-shadow);
}
.type-fighting {
  background: #c03028;
  color: #fff;
  border: 1px solid var(--color-shadow);
}
.type-poison {
  background: #a040a0;
  color: #fff;
  border: 1px solid var(--color-shadow);
}
.type-ground {
  background: #e0c068;
  color: #333;
  border: 1px solid var(--color-shadow);
}
.type-flying {
  background: #a890f0;
  color: #fff;
  border: 1px solid var(--color-shadow);
}
.type-psychic {
  background: #f85888;
  color: #fff;
  border: 1px solid var(--color-shadow);
}
.type-bug {
  background: #a8b820;
  color: #fff;
  border: 1px solid var(--color-shadow);
}
.type-rock {
  background: #b8a038;
  color: #fff;
  border: 1px solid var(--color-shadow);
}
.type-ghost {
  background: #705898;
  color: #fff;
  border: 1px solid var(--color-shadow);
}
.type-dragon {
  background: #7038f8;
  color: #fff;
  border: 1px solid var(--color-shadow);
}
.type-dark {
  background: #705848;
  color: #fff;
  border: 1px solid var(--color-shadow);
}
.type-steel {
  background: #b8b8d0;
  color: #333;
  border: 1px solid var(--color-shadow);
}
.type-fairy {
  background: #ee99ac;
  color: #333;
  border: 1px solid var(--color-shadow);
}

/* ─── Safe area (notched devices) ───────────────────────────────────────── */

@supports (padding: env(safe-area-inset-bottom)) {
  .fixed.bottom-4 {
    bottom: calc(1rem + env(safe-area-inset-bottom));
  }
}

/* ─── Mobile touch targets ──────────────────────────────────────────────── */

@media (max-width: 640px) {
  input,
  select,
  button {
    font-size: 16px;
  }
  .overflow-x-auto {
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .overflow-x-auto::-webkit-scrollbar {
    display: none;
  }
}

/* ─── Typewriter cursor blink ───────────────────────────────────────────── */

@keyframes poke-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}
.poke-cursor {
  display: inline-block;
  width: 0.6em;
  height: 1em;
  background: currentColor;
  vertical-align: text-bottom;
  animation: poke-blink 1s step-end infinite;
  margin-left: 2px;
}

/* ─── Live tournament pulse ─────────────────────────────────────────────── */

@keyframes poke-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}
.poke-live-pulse {
  animation: poke-pulse 1.5s ease-in-out infinite;
}
```

- [ ] **Step 2: Verify the app still compiles**

```bash
cd /Users/rajanrahman/CascadeProjects/windsurf-project-4
npm run build 2>&1 | tail -20
```

Expected: Build completes (may have TypeScript errors from missing `--font-pixel` variable — that's fixed in Task 2). If build errors other than font, investigate before continuing.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "style: add Pokemon theme CSS variables, @theme tokens, updated type colors"
```

---

### Task 2: Update `layout.tsx` — Press Start 2P font + flash-prevention script

**Files:**

- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Replace `layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Press_Start_2P } from "next/font/google";
import "./globals.css";

const pixelFont = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-pixel",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pokémon Hoops",
  description: "Build rosters. Enter tournaments. Be the very best.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

// Inline script that runs before React hydration to set the correct theme
// and prevent flash of wrong theme on load.
const themeScript = `
(function() {
  try {
    var stored = localStorage.getItem('poke-theme');
    if (stored === 'dark' || stored === 'light') {
      document.documentElement.setAttribute('data-theme', stored);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={pixelFont.variable}>
      <head>
        {/* Flash-prevention: runs synchronously before paint */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Run the dev server and open the app**

```bash
npm run dev
```

Open `http://localhost:3000`. Expected: The page loads in Press Start 2P font with the light Pokemon theme (blue/white). No font flash.

- [ ] **Step 3: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully`

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx
git commit -m "style: load Press Start 2P via next/font, add flash-prevention theme script"
```

---

## Chunk 2: UI Component Library

### Task 3: `PokeButton`

**Files:**

- Create: `src/app/components/ui/PokeButton.tsx`

- [ ] **Step 1: Create `PokeButton.tsx`**

```tsx
import { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "danger" | "ghost";
type Size = "sm" | "md";

interface PokeButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantStyles: Record<Variant, string> = {
  primary:
    "bg-[var(--color-primary)] text-[var(--color-primary-text)] border-[var(--color-shadow)]",
  danger: "bg-[var(--color-danger)] text-white border-[var(--color-shadow)]",
  ghost:
    "bg-[var(--color-surface)] text-[var(--color-primary)] border-[var(--color-primary)]",
};

const sizeStyles: Record<Size, string> = {
  sm: "text-[6px] px-2 py-1",
  md: "text-[7px] px-3 py-2",
};

export function PokeButton({
  variant = "primary",
  size = "md",
  className = "",
  disabled,
  children,
  ...props
}: PokeButtonProps) {
  return (
    <button
      disabled={disabled}
      className={[
        "font-pixel border-2 shadow-poke-sm",
        "cursor-pointer leading-none uppercase tracking-wide",
        "active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
        "disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-x-0 disabled:translate-y-0",
        variantStyles[variant],
        sizeStyles[size],
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors in `PokeButton.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/app/components/ui/PokeButton.tsx
git commit -m "feat: add PokeButton UI component"
```

---

### Task 4: `PokeCard`

**Files:**

- Create: `src/app/components/ui/PokeCard.tsx`

- [ ] **Step 1: Create `PokeCard.tsx`**

```tsx
import { HTMLAttributes } from "react";

type CardVariant = "default" | "highlighted" | "danger";

interface PokeCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

const variantShadow: Record<CardVariant, string> = {
  default: "shadow-poke-md",
  highlighted: "shadow-poke-primary",
  danger: "shadow-poke-danger",
};

export function PokeCard({
  variant = "default",
  className = "",
  children,
  ...props
}: PokeCardProps) {
  return (
    <div
      className={[
        "bg-[var(--color-surface)] border-3 border-[var(--color-border)]",
        variantShadow[variant],
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/app/components/ui/PokeCard.tsx
git commit -m "feat: add PokeCard UI component"
```

---

### Task 5: `TypewriterText` and `PokeDialog`

**Files:**

- Create: `src/app/components/ui/TypewriterText.tsx`
- Create: `src/app/components/ui/PokeDialog.tsx`

- [ ] **Step 1: Create `TypewriterText.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

interface TypewriterTextProps {
  text: string | string[];
  speed?: number;
  onDone?: () => void;
  className?: string;
}

export function TypewriterText({
  text,
  speed = 40,
  onDone,
  className = "",
}: TypewriterTextProps) {
  const lines = Array.isArray(text) ? text : [text];
  const [lineIdx, setLineIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [done, setDone] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Reset when text prop changes
  useEffect(() => {
    setLineIdx(0);
    setCharIdx(0);
    setDone(false);
  }, [text]);

  useEffect(() => {
    if (done) {
      onDoneRef.current?.();
      return;
    }

    const currentLine = lines[lineIdx] ?? "";

    if (charIdx < currentLine.length) {
      const timer = setTimeout(() => setCharIdx((c) => c + 1), speed);
      return () => clearTimeout(timer);
    }

    // Finished current line
    if (lineIdx < lines.length - 1) {
      const pause = setTimeout(() => {
        setLineIdx((l) => l + 1);
        setCharIdx(0);
      }, 400);
      return () => clearTimeout(pause);
    }

    // All lines done
    setDone(true);
  }, [charIdx, lineIdx, done, lines, speed]);

  const displayedLines = lines.slice(0, lineIdx + 1).map((line, i) => {
    if (i < lineIdx) return line;
    return line.slice(0, charIdx);
  });

  return (
    <span className={`font-pixel ${className}`}>
      {displayedLines.map((line, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {line}
        </span>
      ))}
      {!done && <span className="poke-cursor" aria-hidden="true" />}
    </span>
  );
}
```

- [ ] **Step 2: Create `PokeDialog.tsx`**

```tsx
import { ReactNode } from "react";

interface PokeDialogProps {
  label?: string;
  labelColor?: string;
  showCursor?: boolean;
  children: ReactNode;
  className?: string;
}

export function PokeDialog({
  label,
  labelColor = "var(--color-primary)",
  showCursor = false,
  children,
  className = "",
}: PokeDialogProps) {
  return (
    <div
      className={[
        "relative bg-[var(--color-surface)] border-3 border-[var(--color-shadow)] shadow-poke-md p-3",
        className,
      ].join(" ")}
    >
      {label && (
        <div
          className="absolute -top-3 left-3 px-2 py-0.5 border-2 border-[var(--color-shadow)] font-pixel text-[6px] leading-none"
          style={{
            backgroundColor: labelColor,
            color:
              labelColor === "var(--color-primary)"
                ? "var(--color-primary-text)"
                : "#fff",
          }}
        >
          {label}
        </div>
      )}
      <div className="font-pixel text-[7px] leading-loose text-[var(--color-text)]">
        {children}
        {showCursor && <span className="poke-cursor" aria-hidden="true" />}
      </div>
      <div className="text-right font-pixel text-[6px] text-[var(--color-primary)] mt-1">
        ▼
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add src/app/components/ui/TypewriterText.tsx src/app/components/ui/PokeDialog.tsx
git commit -m "feat: add TypewriterText and PokeDialog UI components"
```

---

### Task 6: `TypeBadge`, `PokeInput`, `ThemeToggle`, and barrel export

**Files:**

- Create: `src/app/components/ui/TypeBadge.tsx`
- Create: `src/app/components/ui/PokeInput.tsx`
- Create: `src/app/components/ui/ThemeToggle.tsx`
- Create: `src/app/components/ui/index.ts`

- [ ] **Step 1: Create `TypeBadge.tsx`**

```tsx
interface TypeBadgeProps {
  type: string;
  className?: string;
}

export function TypeBadge({ type, className = "" }: TypeBadgeProps) {
  return (
    <span
      className={[
        `type-${type.toLowerCase()}`,
        "font-pixel text-[5px] px-1.5 py-0.5 uppercase leading-none",
        className,
      ].join(" ")}
    >
      {type}
    </span>
  );
}
```

- [ ] **Step 2: Create `PokeInput.tsx`**

```tsx
import { InputHTMLAttributes } from "react";

interface PokeInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function PokeInput({
  label,
  className = "",
  id,
  ...props
}: PokeInputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label
          htmlFor={inputId}
          className="font-pixel text-[6px] text-[var(--color-text-muted)] uppercase tracking-wide"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={[
          "font-pixel text-[7px] leading-loose",
          "bg-[var(--color-surface-alt)] text-[var(--color-text)]",
          "border-3 border-[var(--color-border)] shadow-poke-sm",
          "px-2 py-2 outline-none w-full",
          "focus:border-[var(--color-primary)]",
          "placeholder:text-[var(--color-text-muted)]",
          className,
        ].join(" ")}
        {...props}
      />
    </div>
  );
}
```

- [ ] **Step 3: Create `ThemeToggle.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { PokeButton } from "./PokeButton";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    // Read the theme that was already set by the inline script in layout.tsx
    const current = document.documentElement.getAttribute("data-theme");
    if (current === "dark") setTheme("dark");
  }, []);

  const toggle = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("poke-theme", next);
    } catch {}
  };

  return (
    <PokeButton
      variant="ghost"
      size="sm"
      onClick={toggle}
      aria-label="Toggle theme"
    >
      {theme === "light" ? "☾" : "☀"}
    </PokeButton>
  );
}
```

- [ ] **Step 4: Create `index.ts` barrel export**

```ts
export { PokeButton } from "./PokeButton";
export { PokeCard } from "./PokeCard";
export { PokeDialog } from "./PokeDialog";
export { TypewriterText } from "./TypewriterText";
export { TypeBadge } from "./TypeBadge";
export { PokeInput } from "./PokeInput";
export { ThemeToggle } from "./ThemeToggle";
```

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/ui/
git commit -m "feat: add TypeBadge, PokeInput, ThemeToggle, barrel export"
```

---

## Chunk 3: Page Updates — AuthForm, RosterDashboard, PokemonCard, RosterSlot

### Task 7: Restyle `AuthForm.tsx`

**Files:**

- Modify: `src/app/components/AuthForm.tsx`

- [ ] **Step 1: Replace `AuthForm.tsx`**

```tsx
"use client";

import { useState } from "react";
import { signIn, signUp } from "@/lib/auth-client";
import { PokeButton, PokeCard, PokeInput, TypewriterText } from "./ui";

export default function AuthForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "signup") {
        const result = await signUp.email({
          email,
          password,
          name: name || email.split("@")[0],
        });
        if (result.error) setError(result.error.message || "Sign up failed");
      } else {
        const result = await signIn.email({ email, password });
        if (result.error) setError(result.error.message || "Sign in failed");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      <div className="w-full max-w-sm flex flex-col gap-4">
        {/* Professor Oak speech bubble */}
        <div className="relative">
          <div className="font-pixel text-[6px] text-[var(--color-text-muted)] mb-2 uppercase tracking-widest">
            PROFESSOR OAK SAYS:
          </div>
          <PokeCard className="p-4">
            <div
              className="absolute -top-2 left-6 w-0 h-0"
              style={{
                borderLeft: "8px solid transparent",
                borderRight: "8px solid transparent",
                borderBottom: "8px solid var(--color-border)",
              }}
            />
            <TypewriterText
              text={["Welcome, Trainer!", "Build your dream Pokemon roster."]}
              speed={45}
              className="text-[8px] leading-loose text-[var(--color-text)]"
            />
          </PokeCard>
        </div>

        {/* Login card */}
        <PokeCard className="p-5 flex flex-col gap-4">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <PokeButton
              variant={mode === "login" ? "primary" : "ghost"}
              size="md"
              className="flex-1"
              onClick={() => {
                setMode("login");
                setError("");
              }}
            >
              SIGN IN
            </PokeButton>
            <PokeButton
              variant={mode === "signup" ? "primary" : "ghost"}
              size="md"
              className="flex-1"
              onClick={() => {
                setMode("signup");
                setError("");
              }}
            >
              SIGN UP
            </PokeButton>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {mode === "signup" && (
              <PokeInput
                label="TRAINER NAME"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ash Ketchum"
              />
            )}
            <PokeInput
              label="EMAIL"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ash@pallet.town"
              required
            />
            <PokeInput
              label="PASSWORD"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={8}
            />

            {error && (
              <div
                className="font-pixel text-[6px] leading-loose p-2 border-2"
                style={{
                  borderColor: "var(--color-danger)",
                  color: "var(--color-danger)",
                  backgroundColor: "var(--color-surface-alt)",
                }}
              >
                {error}
              </div>
            )}

            <PokeButton
              type="submit"
              variant="primary"
              size="md"
              disabled={loading}
              className="w-full mt-1 py-3 text-[8px]"
            >
              {loading
                ? "LOADING..."
                : mode === "login"
                ? "▶ SIGN IN"
                : "▶ CREATE ACCOUNT"}
            </PokeButton>
          </form>
        </PokeCard>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run dev server and verify Auth screen**

```bash
npm run dev
```

Open `http://localhost:3000`. Sign out if logged in. Expected: White background, pixel font, Professor Oak speech bubble with typewriter text, pixel-bordered form inputs and buttons.

- [ ] **Step 3: Commit**

```bash
git add src/app/components/AuthForm.tsx
git commit -m "style: restyle AuthForm with Pokemon pixel theme"
```

---

### Task 8: Restyle `RosterDashboard.tsx`

**Files:**

- Modify: `src/app/components/RosterDashboard.tsx`

> All data-fetching, state, and API call logic stays identical. Only JSX className/style attributes change. The actual function names in the file are: `signOut()` (imported), `handleCreate`, `handleDelete(id, name)`, `handleSetTournament(id)`, `handleUnsetTournament(id)`. Props: `onEditRoster`, `onNewRoster`, `onEnterTournament`, `onJoinLiveTournament`. API field is `pokemon_count` (not `pokemon.length`).

- [ ] **Step 1: Add UI component imports**

Replace the existing import block at the top with:

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { signOut } from "@/lib/auth-client";
import { PokeButton, PokeCard, PokeInput, ThemeToggle } from "./ui";
```

- [ ] **Step 2: Update the outer wrapper and sticky header (lines 139–162)**

Replace the outermost `<div className="min-h-screen bg-slate-900">` and the `<header>` block with:

```tsx
<div className="min-h-screen" style={{ backgroundColor: "var(--color-bg)" }}>
  {/* Header */}
  <header
    className="sticky top-0 z-50 border-b-3 border-[var(--color-shadow)] px-3 sm:px-4 py-2 sm:py-3"
    style={{ backgroundColor: "var(--color-primary)" }}
  >
    <div className="max-w-4xl mx-auto flex items-center justify-between">
      <span className="font-pixel text-[9px] sm:text-[11px]" style={{ color: "var(--color-primary-text)" }}>
        ⚡ POKEMON HOOPS
      </span>
      <div className="flex items-center gap-2">
        <span className="font-pixel text-[6px] hidden sm:block" style={{ color: "var(--color-primary-text)" }}>
          {userName}
        </span>
        <ThemeToggle />
        <PokeButton variant="ghost" size="sm" onClick={() => signOut()}>
          SIGN OUT
        </PokeButton>
      </div>
    </div>
  </header>
```

- [ ] **Step 3: Update the tournament banner (lines 166–212)**

Replace the `{tournamentRoster && ( <div className="mb-6 ...">` block. The banner now has all 4 original actions as `<PokeButton>`. Note: `onEnterTournament` takes no arguments (it is `() => void`), so `onClick={onEnterTournament}` is correct:

```tsx
{
  tournamentRoster && (
    <PokeCard variant="highlighted" className="mb-6 sm:mb-8 p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span
            className="font-pixel text-[6px] px-2 py-1 self-start border border-[var(--color-shadow)]"
            style={{ backgroundColor: "var(--color-danger)", color: "#fff" }}
          >
            ★ TOURNAMENT ROSTER
          </span>
          <span
            className="font-pixel text-[9px]"
            style={{ color: "var(--color-text)" }}
          >
            {tournamentRoster.name.toUpperCase()}
          </span>
          <span
            className="font-pixel text-[6px]"
            style={{ color: "var(--color-text-muted)" }}
          >
            {tournamentRoster.pokemon_count}/6 POKEMON
          </span>
        </div>
        <div className="flex gap-2 flex-wrap shrink-0">
          <PokeButton variant="danger" size="sm" onClick={onJoinLiveTournament}>
            ⚡ LIVE
          </PokeButton>
          <PokeButton variant="primary" size="sm" onClick={onEnterTournament}>
            VS BOTS
          </PokeButton>
          <PokeButton
            variant="ghost"
            size="sm"
            onClick={() => onEditRoster(tournamentRoster.id)}
          >
            VIEW
          </PokeButton>
          <PokeButton
            variant="ghost"
            size="sm"
            onClick={() => handleUnsetTournament(tournamentRoster.id)}
          >
            UNSET
          </PokeButton>
        </div>
      </div>
    </PokeCard>
  );
}
```

- [ ] **Step 4: Update the section header and "New Roster" button (lines 214–241)**

Replace the `<div className="flex items-center justify-between mb-6">` block:

```tsx
<div className="flex items-center justify-between mb-6">
  <div>
    <h2
      className="font-pixel text-[9px]"
      style={{ color: "var(--color-text)" }}
    >
      YOUR ROSTERS
    </h2>
    <p
      className="font-pixel text-[6px] mt-1"
      style={{ color: "var(--color-text-muted)" }}
    >
      {rosters.length} ROSTER{rosters.length !== 1 ? "S" : ""}
    </p>
  </div>
  <PokeButton
    variant="primary"
    size="sm"
    onClick={() => setShowCreateForm(true)}
  >
    + NEW ROSTER
  </PokeButton>
</div>
```

- [ ] **Step 5: Update the create-roster form (lines 243–281)**

Replace the `{showCreateForm && ( <div className="mb-6 p-4 rounded-xl ...">` block:

```tsx
{
  showCreateForm && (
    <div
      className="mb-6 p-4 border-3 border-[var(--color-border)]"
      style={{
        backgroundColor: "var(--color-surface)",
        boxShadow: "4px 4px 0 var(--color-shadow)",
      }}
    >
      <form
        onSubmit={handleCreate}
        className="flex flex-col sm:flex-row gap-2 sm:gap-3"
      >
        <div className="flex-1">
          <PokeInput
            type="text"
            value={newRosterName}
            onChange={(e) => setNewRosterName(e.target.value)}
            placeholder="Fire Squad, Dream Team..."
            autoFocus
          />
        </div>
        <div className="flex gap-2">
          <PokeButton
            type="submit"
            variant="primary"
            size="md"
            disabled={creating || !newRosterName.trim()}
          >
            {creating ? "CREATING..." : "CREATE"}
          </PokeButton>
          <PokeButton
            type="button"
            variant="ghost"
            size="md"
            onClick={() => {
              setShowCreateForm(false);
              setNewRosterName("");
              setError("");
            }}
          >
            CANCEL
          </PokeButton>
        </div>
      </form>
      {error && (
        <p
          className="font-pixel text-[6px] mt-2"
          style={{ color: "var(--color-danger)" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Update loading spinner, empty state, and roster grid ternary (lines 284–393)**

Replace the entire `{loading ? ( ... ) : rosters.length === 0 ? ( ... ) : ( ... )}` block as a single unit. This avoids the mid-ternary syntax issue:

```tsx
{
  loading ? (
    <div className="text-center py-20">
      <div
        className="inline-block w-8 h-8 border-2 border-t-transparent animate-spin"
        style={{
          borderColor: "var(--color-primary)",
          borderTopColor: "transparent",
        }}
      />
      <p
        className="font-pixel text-[7px] mt-3"
        style={{ color: "var(--color-text-muted)" }}
      >
        LOADING...
      </p>
    </div>
  ) : rosters.length === 0 ? (
    <div
      className="text-center py-20 border-3 border-dashed"
      style={{ borderColor: "var(--color-border)" }}
    >
      <p
        className="font-pixel text-[9px] mb-2"
        style={{ color: "var(--color-text)" }}
      >
        NO ROSTERS YET
      </p>
      <p
        className="font-pixel text-[6px] mb-6"
        style={{ color: "var(--color-text-muted)" }}
      >
        CREATE YOUR FIRST ROSTER
      </p>
      <PokeButton
        variant="primary"
        size="md"
        onClick={() => setShowCreateForm(true)}
      >
        + CREATE ROSTER
      </PokeButton>
    </div>
  ) : (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
      {rosters.map((roster) => (
        <PokeCard
          key={roster.id}
          variant={roster.is_tournament_roster ? "highlighted" : "default"}
          className="relative p-4 flex flex-col gap-2"
        >
          {roster.is_tournament_roster && (
            <span
              className="absolute -top-2 -right-2 font-pixel text-[5px] px-2 py-1 border border-[var(--color-shadow)]"
              style={{
                backgroundColor: "var(--color-accent)",
                color: "var(--color-shadow)",
              }}
            >
              ★ TOURNAMENT
            </span>
          )}
          <h3
            className="font-pixel text-[8px] truncate pr-4"
            style={{ color: "var(--color-text)" }}
          >
            {roster.name.toUpperCase()}
          </h3>
          <div
            className="flex items-center gap-2 font-pixel text-[6px]"
            style={{ color: "var(--color-text-muted)" }}
          >
            <span
              style={{
                color:
                  roster.pokemon_count === 6
                    ? "var(--color-primary)"
                    : "var(--color-accent)",
              }}
            >
              {roster.pokemon_count}
            </span>
            /6 &nbsp;•&nbsp; {new Date(roster.updated_at).toLocaleDateString()}
          </div>
          {/* Progress bar */}
          <div
            className="h-1.5 border border-[var(--color-shadow)]"
            style={{ backgroundColor: "var(--color-surface-alt)" }}
          >
            <div
              className="h-full transition-all"
              style={{
                width: `${(roster.pokemon_count / 6) * 100}%`,
                backgroundColor:
                  roster.pokemon_count === 6
                    ? "var(--color-primary)"
                    : "var(--color-accent)",
              }}
            />
          </div>
          {/* Actions */}
          <div className="flex gap-2 mt-2 flex-wrap">
            <PokeButton
              variant="ghost"
              size="sm"
              className="flex-1"
              onClick={() => onEditRoster(roster.id)}
            >
              {roster.pokemon_count < 6 ? "EDIT" : "VIEW"}
            </PokeButton>
            {roster.pokemon_count === 6 && !roster.is_tournament_roster && (
              <PokeButton
                variant="ghost"
                size="sm"
                onClick={() => handleSetTournament(roster.id)}
                title="Use in tournament"
              >
                ★
              </PokeButton>
            )}
            <PokeButton
              variant="danger"
              size="sm"
              onClick={() => handleDelete(roster.id, roster.name)}
              title="Delete roster"
            >
              ✕
            </PokeButton>
          </div>
        </PokeCard>
      ))}
    </div>
  );
}
```

~~**Step 7: SKIPPED** — roster grid content was merged into Step 6's full ternary block~~

- [ ] **Step 8: Verify the return block closes correctly**

After applying Step 6, verify the end of the `return (` block has exactly two closing `</div>` tags before `);`. The existing file ends with:

```tsx
      </div>
    </div>
  );
}
```

The first `</div>` closes the `<div className="max-w-4xl mx-auto ...">` inner wrapper. The second closes the outer `<div className="min-h-screen ...">`. No changes needed if the originals are intact — just confirm they are present.

- [ ] **Step 10: Run dev server and verify dashboard**

```bash
npm run dev
```

Log in and check the dashboard. Expected: pixel nav with primary-color background, tournament banner with yellow shadow, pixel roster cards with progress bars, all 4 tournament action buttons present, create-form with pixel input and buttons.

- [ ] **Step 11: Commit**

```bash
git add src/app/components/RosterDashboard.tsx
git commit -m "style: restyle RosterDashboard with Pokemon pixel theme"
```

---

### Task 9: Restyle `PokemonCard.tsx` and `RosterSlot.tsx`

**Files:**

- Modify: `src/app/components/PokemonCard.tsx`
- Modify: `src/app/components/RosterSlot.tsx`

- [ ] **Step 1: Replace `PokemonCard.tsx`**

```tsx
"use client";

import { Pokemon } from "../types";
import Image from "next/image";
import { useState } from "react";
import {
  toBballAverages,
  getPlaystyle,
  computeSalary,
} from "../utils/bballStats";
import { PokeButton, PokeCard, TypeBadge } from "./ui";

const abilitiesData = require("../../../public/abilities.json");

interface PokemonCardProps {
  pokemon: Pokemon;
  onSelect: (pokemon: Pokemon) => void;
  isSelected: boolean;
  disabled: boolean;
}

function AbilityBadge({ ability }: { ability: string }) {
  const [showTip, setShowTip] = useState(false);
  const abilityInfo = abilitiesData[ability];
  const desc = abilityInfo
    ? abilityInfo["effect desc"]
    : "Standard Pokemon ability";

  return (
    <span
      className="relative font-pixel text-[5px] leading-loose px-1.5 py-0.5 border cursor-help"
      style={{
        backgroundColor: "var(--color-surface-alt)",
        borderColor: "var(--color-border)",
        color: "var(--color-text-muted)",
      }}
      title={desc}
      onClick={(e) => {
        e.stopPropagation();
        setShowTip((v) => !v);
      }}
      onMouseLeave={() => setShowTip(false)}
    >
      ✨ {ability}
      {showTip && (
        <span
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 text-[6px] font-pixel leading-loose text-center pointer-events-none border-2"
          style={{
            backgroundColor: "var(--color-surface)",
            borderColor: "var(--color-shadow)",
            color: "var(--color-text)",
            boxShadow: "3px 3px 0 var(--color-shadow)",
          }}
        >
          {desc}
        </span>
      )}
    </span>
  );
}

export default function PokemonCard({
  pokemon,
  onSelect,
  isSelected,
  disabled,
}: PokemonCardProps) {
  const avg = toBballAverages(pokemon);
  const playstyle = getPlaystyle(avg, pokemon);
  const salary = computeSalary(avg, pokemon);

  return (
    <button
      onClick={() => onSelect(pokemon)}
      draggable={!disabled || isSelected}
      onDragStart={(e) => {
        e.dataTransfer.setData("application/pokemon", JSON.stringify(pokemon));
        e.dataTransfer.effectAllowed = "move";
      }}
      disabled={disabled && !isSelected}
      className="relative flex flex-col items-center p-2 w-full text-left"
      style={{
        border: `3px solid ${
          isSelected ? "var(--color-accent)" : "var(--color-border)"
        }`,
        backgroundColor: isSelected
          ? "var(--color-surface-alt)"
          : "var(--color-surface)",
        boxShadow: isSelected
          ? "4px 4px 0 var(--color-accent)"
          : disabled
          ? "none"
          : "4px 4px 0 var(--color-shadow)",
        opacity: disabled && !isSelected ? 0.4 : 1,
        cursor: disabled && !isSelected ? "not-allowed" : "pointer",
      }}
    >
      {isSelected && (
        <div
          className="absolute -top-2 -right-2 w-5 h-5 flex items-center justify-center border-2 font-pixel text-[7px]"
          style={{
            backgroundColor: "var(--color-accent)",
            borderColor: "var(--color-shadow)",
            color: "var(--color-shadow)",
          }}
        >
          ✓
        </div>
      )}

      {/* Sprite */}
      <div
        className="relative w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center"
        style={{ backgroundColor: "var(--color-surface-alt)" }}
      >
        <Image
          src={pokemon.sprite}
          alt={pokemon.name}
          fill
          sizes="(max-width: 640px) 64px, 80px"
          className="object-contain"
          style={{ imageRendering: "pixelated" }}
          unoptimized
        />
      </div>

      {/* Pokedex number */}
      <p
        className="font-pixel text-[6px] mt-1"
        style={{ color: "var(--color-text-muted)" }}
      >
        #{String(pokemon.id).padStart(3, "0")}
      </p>

      {/* Name */}
      <p
        className="font-pixel text-[7px] mt-0.5 capitalize truncate w-full text-center"
        style={{ color: "var(--color-text)" }}
      >
        {pokemon.name}
      </p>

      {/* Types */}
      <div className="flex gap-1 mt-1.5 flex-wrap justify-center">
        {pokemon.types.map((type) => (
          <TypeBadge key={type} type={type} />
        ))}
      </div>

      {/* Stats */}
      <div className="flex gap-2 mt-1.5 font-pixel text-[6px]">
        <span style={{ color: "#f08030" }}>
          {avg.ppg}
          <span style={{ color: "var(--color-text-muted)" }}>pt</span>
        </span>
        <span style={{ color: "#6890f0" }}>
          {avg.rpg}
          <span style={{ color: "var(--color-text-muted)" }}>rb</span>
        </span>
        <span style={{ color: "#78c850" }}>
          {avg.apg}
          <span style={{ color: "var(--color-text-muted)" }}>as</span>
        </span>
      </div>

      {/* Playstyle */}
      <p
        className="font-pixel text-[5px] mt-0.5 text-center"
        style={{ color: "var(--color-text-muted)" }}
      >
        {playstyle}
      </p>

      {/* Ability */}
      {pokemon.ability && <AbilityBadge ability={pokemon.ability} />}

      {/* Salary */}
      <span
        className="mt-1 font-pixel text-[6px] px-1.5 py-0.5 border"
        style={{
          backgroundColor:
            salary >= 35 ? "var(--color-accent)" : "var(--color-surface-alt)",
          borderColor: "var(--color-shadow)",
          color:
            salary >= 35 ? "var(--color-shadow)" : "var(--color-text-muted)",
        }}
      >
        ${salary}M
      </span>

      {/* Draft button */}
      {!disabled && !isSelected && (
        <PokeButton variant="primary" size="sm" className="mt-2 w-full">
          + DRAFT
        </PokeButton>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Replace `RosterSlot.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Pokemon } from "../types";
import Image from "next/image";
import {
  toBballAverages,
  getPlaystyle,
  computeSalary,
} from "../utils/bballStats";
import { SUPPORT_ABILITIES } from "../utils/supportAbilities";
import { PokeButton, PokeCard, TypeBadge } from "./ui";

interface RosterSlotProps {
  position: string;
  label: string;
  pokemon: Pokemon | null;
  onRemove: () => void;
  isReserve?: boolean;
  isDragOver?: boolean;
  onDrop?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
}

function AbilityBadge({ ability }: { ability: string }) {
  const [showTip, setShowTip] = useState(false);
  const desc = SUPPORT_ABILITIES[ability]?.description;
  return (
    <span
      className="relative font-pixel text-[5px] leading-loose px-1.5 py-0.5 border cursor-help"
      style={{
        backgroundColor: "var(--color-surface-alt)",
        borderColor: "var(--color-border)",
        color: "var(--color-text-muted)",
      }}
      title={desc}
      onClick={(e) => {
        e.stopPropagation();
        setShowTip((v) => !v);
      }}
      onMouseLeave={() => setShowTip(false)}
    >
      ✨ {ability}
      {showTip && desc && (
        <span
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-44 p-2 text-[6px] font-pixel leading-loose text-center pointer-events-none border-2"
          style={{
            backgroundColor: "var(--color-surface)",
            borderColor: "var(--color-shadow)",
            color: "var(--color-text)",
            boxShadow: "3px 3px 0 var(--color-shadow)",
          }}
        >
          {desc}
        </span>
      )}
    </span>
  );
}

export default function RosterSlot({
  position,
  label,
  pokemon,
  onRemove,
  isReserve = false,
  isDragOver = false,
  onDrop,
  onDragOver,
  onDragLeave,
}: RosterSlotProps) {
  const [showStats, setShowStats] = useState(false);

  const borderStyle = isDragOver
    ? {
        borderColor: "var(--color-accent)",
        backgroundColor: "var(--color-surface-alt)",
      }
    : pokemon
    ? {
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }
    : {
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface-alt)",
      };

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      className="relative flex flex-col items-center border-3 border-dashed p-2 transition-all"
      style={borderStyle}
    >
      {/* Position label */}
      <span
        className="font-pixel text-[7px] uppercase tracking-widest mb-1"
        style={{
          color: isReserve ? "var(--color-accent)" : "var(--color-primary)",
        }}
      >
        {position}
      </span>

      {pokemon ? (
        <>
          <div className="relative w-14 h-14">
            <Image
              src={pokemon.sprite}
              alt={pokemon.name}
              fill
              sizes="56px"
              className="object-contain"
              style={{ imageRendering: "pixelated" }}
              unoptimized
            />
          </div>
          <p
            className="font-pixel text-[7px] capitalize mt-0.5 truncate w-full text-center"
            style={{ color: "var(--color-text)" }}
          >
            {pokemon.name}
          </p>
          {(() => {
            const avg = toBballAverages(pokemon);
            const playstyle = getPlaystyle(avg, pokemon);
            const salary = computeSalary(avg, pokemon);
            return (
              <>
                <span
                  className="font-pixel text-[6px] px-1.5 py-0.5 border mt-1"
                  style={{
                    backgroundColor:
                      salary >= 35
                        ? "var(--color-accent)"
                        : "var(--color-surface-alt)",
                    borderColor: "var(--color-shadow)",
                    color:
                      salary >= 35
                        ? "var(--color-shadow)"
                        : "var(--color-text-muted)",
                  }}
                >
                  ${salary}M
                </span>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowStats(!showStats);
                  }}
                  className="mt-1.5 font-pixel text-[6px] cursor-pointer"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {showStats ? "HIDE" : "STATS"}
                </button>

                {showStats && (
                  <div className="w-full pt-2 flex flex-col gap-1 items-center">
                    <span
                      className="font-pixel text-[5px]"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {playstyle}
                    </span>
                    {pokemon.ability && (
                      <AbilityBadge ability={pokemon.ability} />
                    )}
                    <div className="flex gap-1 mt-1 flex-wrap justify-center">
                      {pokemon.types.map((type) => (
                        <TypeBadge key={type} type={type} />
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-x-3 gap-y-1 mt-2 text-center w-full">
                      {[
                        { label: "PPG", val: avg.ppg, color: "#f08030" },
                        { label: "RPG", val: avg.rpg, color: "#6890f0" },
                        { label: "APG", val: avg.apg, color: "#78c850" },
                        { label: "SPG", val: avg.spg, color: "#f8d030" },
                        { label: "BPG", val: avg.bpg, color: "#cc0000" },
                        { label: "MPG", val: avg.mpg, color: "#a040a0" },
                      ].map(({ label, val, color }) => (
                        <div key={label} className="flex flex-col items-center">
                          <span
                            className="font-pixel text-[8px] font-bold"
                            style={{ color }}
                          >
                            {val}
                          </span>
                          <span
                            className="font-pixel text-[5px]"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            {label}
                          </span>
                        </div>
                      ))}
                    </div>
                    {/* PER bar */}
                    <div className="flex items-center gap-1 mt-1.5 w-full font-pixel text-[5px]">
                      <span style={{ color: "var(--color-text-muted)" }}>
                        PER
                      </span>
                      <div
                        className="flex-1 h-1.5 border"
                        style={{
                          borderColor: "var(--color-shadow)",
                          backgroundColor: "var(--color-surface-alt)",
                        }}
                      >
                        <div
                          className="h-full"
                          style={{
                            width: `${(avg.per / 35) * 100}%`,
                            backgroundColor:
                              avg.per >= 25
                                ? "var(--color-accent)"
                                : avg.per >= 18
                                ? "#78c850"
                                : "var(--color-text-muted)",
                          }}
                        />
                      </div>
                      <span
                        style={{
                          color:
                            avg.per >= 25
                              ? "var(--color-accent)"
                              : "var(--color-text-muted)",
                        }}
                      >
                        {avg.per}
                      </span>
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          <PokeButton
            variant="danger"
            size="sm"
            className="mt-2"
            onClick={onRemove}
          >
            REMOVE
          </PokeButton>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-14 w-14 gap-1">
          <span
            className="font-pixel text-[18px]"
            style={{ color: "var(--color-border)" }}
          >
            +
          </span>
          <p
            className="font-pixel text-[5px] text-center"
            style={{ color: "var(--color-text-muted)" }}
          >
            {label}
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run dev server and verify**

```bash
npm run dev
```

Open the Roster Builder. Expected: Pokemon cards in pixel style with type badges, salary labels, white backgrounds. Roster slots show pixel-style position labels and remove buttons.

- [ ] **Step 4: Commit**

```bash
git add src/app/components/PokemonCard.tsx src/app/components/RosterSlot.tsx
git commit -m "style: restyle PokemonCard and RosterSlot with Pokemon pixel theme"
```

---

## Chunk 4: Page Updates — RosterBuilder, TournamentView, LiveTournament

### Task 10: Restyle `RosterBuilder.tsx`

**Files:**

- Modify: `src/app/components/RosterBuilder.tsx`

> RosterBuilder.tsx is ~981 lines. Read it fully before editing. All drag-drop logic, search/filter state, and API calls stay identical. Only JSX className/style attributes change.

- [ ] **Step 1: Read `RosterBuilder.tsx` fully before editing**

Read `src/app/components/RosterBuilder.tsx`.

- [ ] **Step 2: Add UI component imports**

```tsx
import { PokeButton, PokeCard, PokeInput, TypeBadge } from "./ui";
```

- [ ] **Step 3: Update the outer layout background**

Find the outermost container div and add:

```tsx
style={{ backgroundColor: "var(--color-bg)" }}
```

- [ ] **Step 4: Update the left sidebar**

Replace the sidebar's className-based styling with:

```tsx
style={{
  backgroundColor: "var(--color-surface)",
  borderRight: "3px solid var(--color-border)",
}}
```

- [ ] **Step 5: Replace the search input with `<PokeInput>`**

Find the search `<input>` element and replace with:

```tsx
<PokeInput
  label="SEARCH"
  type="text"
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  placeholder="BULBASAUR..."
/>
```

- [ ] **Step 6: Update type filter pills**

Replace each type pill `<button>` with `<TypeBadge>`-style buttons:

```tsx
<button
  key={type}
  onClick={() => toggleType(type)}
  className={[
    `type-${type} font-pixel text-[5px] px-1.5 py-0.5 uppercase`,
    selectedTypes.includes(type)
      ? "border-2 border-[var(--color-shadow)] shadow-poke-sm"
      : "border border-[var(--color-shadow)] opacity-60",
  ].join(" ")}
>
  {type}
</button>
```

- [ ] **Step 7: Update section headings and labels throughout the sidebar**

Replace all Tailwind text color classes (e.g. `text-slate-400`, `text-white`) on labels, section titles with:

```tsx
style={{ color: "var(--color-text-muted)" }}  // for labels
style={{ color: "var(--color-text)" }}         // for headings
```

Use `font-pixel` className on all label/heading text.

- [ ] **Step 8: Update the salary cap bar**

```tsx
{
  /* Salary cap tracker */
}
<div className="p-3 border-t-2" style={{ borderColor: "var(--color-border)" }}>
  <div className="flex justify-between mb-1">
    <span
      className="font-pixel text-[6px]"
      style={{ color: "var(--color-text-muted)" }}
    >
      SALARY CAP
    </span>
    <span
      className="font-pixel text-[6px]"
      style={{
        color: totalSalary > 160 ? "var(--color-danger)" : "var(--color-text)",
      }}
    >
      ${totalSalary}M / $160M
    </span>
  </div>
  <div
    className="h-2 border-2"
    style={{
      borderColor: "var(--color-shadow)",
      backgroundColor: "var(--color-surface-alt)",
    }}
  >
    <div
      className="h-full transition-all"
      style={{
        width: `${Math.min((totalSalary / 160) * 100, 100)}%`,
        backgroundColor:
          totalSalary > 160 ? "var(--color-danger)" : "var(--color-primary)",
      }}
    />
  </div>
</div>;
```

- [ ] **Step 9: Update the Save button**

Replace the save button with:

```tsx
<PokeButton
  variant="primary"
  size="md"
  onClick={handleSave}
  disabled={saving}
  className="w-full"
>
  {saving ? "SAVING..." : saved ? "✓ SAVED" : "SAVE ROSTER"}
</PokeButton>
```

- [ ] **Step 10: Update the Back button**

```tsx
<PokeButton variant="ghost" size="sm" onClick={() => setView("dashboard")}>
  ◀ BACK
</PokeButton>
```

- [ ] **Step 11: Run dev server and verify RosterBuilder**

```bash
npm run dev
```

Navigate to a roster. Expected: pixel sidebar with blue border, type filter pills in their type colors, pixel font throughout, white card backgrounds.

- [ ] **Step 12: Commit**

```bash
git add src/app/components/RosterBuilder.tsx
git commit -m "style: restyle RosterBuilder with Pokemon pixel theme"
```

---

### Task 11: Restyle `TournamentView.tsx`

**Files:**

- Modify: `src/app/components/TournamentView.tsx`

> TournamentView.tsx is ~1030 lines. Read it fully before editing. All simulation logic, bracket state, and matchup data stay identical. Only JSX styling changes, plus adding TypewriterText to highlight events.

- [ ] **Step 1: Read `TournamentView.tsx` fully before editing**

Read `src/app/components/TournamentView.tsx`.

- [ ] **Step 2: Add UI component imports**

```tsx
import { PokeButton, PokeCard, PokeDialog, TypewriterText } from "./ui";
```

- [ ] **Step 3: Update outer background**

```tsx
style={{ backgroundColor: "var(--color-bg)" }}
```

- [ ] **Step 4: Update bracket matchup cards**

Each matchup card should use `<PokeCard>` — winner gets `variant="highlighted"`, loser gets normal variant with reduced opacity:

```tsx
<PokeCard
  variant={isWinner ? "highlighted" : "default"}
  className={["p-2 flex flex-col gap-1", !isWinner && "opacity-50"]
    .filter(Boolean)
    .join(" ")}
>
  <span
    className="font-pixel text-[6px]"
    style={{ color: "var(--color-text)" }}
  >
    {team.name.toUpperCase()}
  </span>
  <span
    className="font-pixel text-[8px]"
    style={{
      color: isWinner ? "var(--color-primary)" : "var(--color-text-muted)",
    }}
  >
    {score}
  </span>
</PokeCard>
```

- [ ] **Step 5: Add TypewriterText to play-by-play highlight events**

Find where highlight events are rendered and replace static text with TypewriterText for the most recent event. All prior events render as static, dimmed text:

```tsx
{
  highlights.map((event, i) => {
    const isLatest = i === highlights.length - 1;
    return (
      <div
        key={i}
        className="font-pixel text-[6px] leading-loose"
        style={{ opacity: isLatest ? 1 : 0.45, color: "var(--color-text)" }}
      >
        {isLatest ? <TypewriterText text={event} speed={35} /> : event}
      </div>
    );
  });
}
```

- [ ] **Step 6: Wrap highlights section in `<PokeDialog>`**

```tsx
<PokeDialog label="HIGHLIGHTS" className="max-h-48 overflow-y-auto">
  {/* highlight events mapped above */}
</PokeDialog>
```

- [ ] **Step 7: Update all buttons to `<PokeButton>`**

Replace all remaining `<button>` elements in this file with `<PokeButton>` variants.

- [ ] **Step 8: Update section headings, scores, and team names**

Replace all `text-slate-*`, `text-amber-*`, `text-white` classes with inline `style={{ color: "var(--color-*)" }}`.

- [ ] **Step 9: Run dev server and verify tournament**

```bash
npm run dev
```

Run a tournament. Expected: pixel bracket cards, highlighted winner cards, play-by-play events with typewriter effect on the latest event.

- [ ] **Step 10: Commit**

```bash
git add src/app/components/TournamentView.tsx
git commit -m "style: restyle TournamentView with Pokemon pixel theme + TypewriterText"
```

---

### Task 12: Restyle `LiveTournament.tsx`

**Files:**

- Modify: `src/app/components/LiveTournament.tsx`

> LiveTournament.tsx is ~944 lines with 4 sub-components: `LobbyView`, `LiveTeamRow`, `LiveMatchupCard`, `LiveBracketView`. All polling, state management, and API calls stay identical. Only JSX styling changes.

- [ ] **Step 1: Read `LiveTournament.tsx` fully before editing**

Read `src/app/components/LiveTournament.tsx`.

- [ ] **Step 2: Add UI component imports**

```tsx
import { PokeButton, PokeCard, TypewriterText } from "./ui";
```

- [ ] **Step 3: Restyle `LobbyView` component**

Replace the `LobbyView` function's return JSX. Keep all the props and logic (the `progress` calculation etc.) unchanged:

```tsx
return (
  <div className="max-w-lg mx-auto text-center">
    <PokeCard className="p-8">
      <h2
        className="font-pixel text-[10px] mb-2"
        style={{ color: "var(--color-text)" }}
      >
        LIVE TOURNAMENT LOBBY
      </h2>
      <p
        className="font-pixel text-[6px] mb-6"
        style={{ color: "var(--color-text-muted)" }}
      >
        WAITING FOR PLAYERS...
      </p>

      {/* Progress ring — keep SVG logic, update colors */}
      <div className="relative w-32 h-32 mx-auto mb-6">
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx="64"
            cy="64"
            r="56"
            fill="none"
            stroke="var(--color-surface-alt)"
            strokeWidth="8"
          />
          <circle
            cx="64"
            cy="64"
            r="56"
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="8"
            strokeDasharray={`${progress * 3.52} ${352 - progress * 3.52}`}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="font-pixel text-[14px]"
            style={{ color: "var(--color-text)" }}
          >
            {lobby.teamCount}
            <span
              className="font-pixel text-[9px]"
              style={{ color: "var(--color-text-muted)" }}
            >
              /{lobby.maxTeams}
            </span>
          </span>
        </div>
      </div>

      {/* Team list */}
      <div className="flex flex-col gap-2 text-left">
        {lobby.teams.map((t, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-4 py-2 border-2"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-surface-alt)",
            }}
          >
            <span
              className="font-pixel text-[7px]"
              style={{ color: "var(--color-primary)" }}
            >
              {i + 1}
            </span>
            <span
              className="font-pixel text-[7px]"
              style={{ color: "var(--color-text)" }}
            >
              {t.teamName}
            </span>
            <span
              className="font-pixel text-[6px] ml-auto"
              style={{ color: "var(--color-text-muted)" }}
            >
              JOINED
            </span>
          </div>
        ))}
        {Array.from({ length: lobby.maxTeams - lobby.teamCount }).map(
          (_, i) => (
            <div
              key={`empty-${i}`}
              className="flex items-center gap-3 px-4 py-2 border-2 border-dashed"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-surface-alt)",
              }}
            >
              <span
                className="font-pixel text-[7px]"
                style={{ color: "var(--color-text-muted)" }}
              >
                {lobby.teamCount + i + 1}
              </span>
              <span
                className="font-pixel text-[6px] italic"
                style={{ color: "var(--color-text-muted)" }}
              >
                WAITING...
              </span>
            </div>
          )
        )}
      </div>

      <div className="mt-6 flex items-center justify-center gap-2">
        <span
          className="font-pixel text-[6px] px-2 py-1 border-2 poke-live-pulse"
          style={{
            backgroundColor: "var(--color-danger)",
            borderColor: "var(--color-shadow)",
            color: "#fff",
            boxShadow: "2px 2px 0 var(--color-shadow)",
          }}
        >
          ⚡ SEARCHING...
        </span>
      </div>
    </PokeCard>
  </div>
);
```

- [ ] **Step 4: Restyle `LiveTeamRow` component**

Replace the `LiveTeamRow` function's return JSX:

```tsx
return (
  <div
    className="px-3 py-2 flex items-center gap-2"
    style={{
      backgroundColor: isWinner ? "var(--color-surface-alt)" : "transparent",
    }}
  >
    <span
      className="font-pixel text-[6px] w-4 shrink-0"
      style={{ color: "var(--color-text-muted)" }}
    >
      {seed}
    </span>
    <span
      className="font-pixel text-[7px] flex-1 truncate"
      style={{ color: isWinner ? "var(--color-primary)" : "var(--color-text)" }}
    >
      {name.toUpperCase()}
    </span>
    {isUser && (
      <span
        className="font-pixel text-[5px] px-1.5 py-0.5 border"
        style={{
          backgroundColor: "var(--color-accent)",
          borderColor: "var(--color-shadow)",
          color: "var(--color-shadow)",
        }}
      >
        YOU
      </span>
    )}
    {showScore && (
      <span
        className="font-pixel text-[8px] tabular-nums"
        style={{
          color: isWinner ? "var(--color-primary)" : "var(--color-text-muted)",
        }}
      >
        {score}
      </span>
    )}
  </div>
);
```

- [ ] **Step 5: Restyle `LiveMatchupCard` component**

Replace the `LiveMatchupCard` function's return JSX:

```tsx
const statusColor = isDone
  ? "#78c850"
  : isLive
  ? "var(--color-danger)"
  : "var(--color-text-muted)";

return (
  <div
    className="border-3 overflow-hidden"
    style={{
      borderColor: isDone
        ? "#78c850"
        : isLive
        ? "var(--color-danger)"
        : "var(--color-border)",
      backgroundColor: "var(--color-surface)",
      boxShadow: isLive
        ? `4px 4px 0 var(--color-danger)`
        : `3px 3px 0 var(--color-shadow)`,
    }}
  >
    {/* Status bar */}
    <div
      className="px-3 py-1 flex items-center gap-2"
      style={{ backgroundColor: "var(--color-surface-alt)" }}
    >
      {isLive && (
        <span
          className="font-pixel text-[5px] px-1.5 py-0.5 border poke-live-pulse"
          style={{
            backgroundColor: "var(--color-danger)",
            borderColor: "var(--color-shadow)",
            color: "#fff",
          }}
        >
          ⚡ LIVE
        </span>
      )}
      <span
        className="font-pixel text-[6px] uppercase"
        style={{ color: statusColor }}
      >
        {isDone ? "FINAL" : isLive ? "IN PROGRESS" : "UPCOMING"}
      </span>
    </div>

    {/* Teams */}
    <div
      className="divide-y"
      style={{ borderColor: "var(--color-surface-alt)" }}
    >
      <LiveTeamRow
        name={matchup.homeTeam.name}
        seed={matchup.homeTeam.seed}
        score={matchup.homeScore}
        isWinner={isDone && matchup.winner === "home"}
        isUser={matchup.homeTeam.name === userTeamName}
        showScore={!isUpcoming}
      />
      <LiveTeamRow
        name={matchup.awayTeam.name}
        seed={matchup.awayTeam.seed}
        score={matchup.awayScore}
        isWinner={isDone && matchup.winner === "away"}
        isUser={matchup.awayTeam.name === userTeamName}
        showScore={!isUpcoming}
      />
    </div>

    {/* Watch / Recap button */}
    {(isLive || isDone) && (
      <PokeButton
        variant={isLive ? "danger" : "ghost"}
        size="sm"
        className="w-full"
        onClick={() => onWatch(matchup.id)}
      >
        {isLive ? "WATCH LIVE" : "VIEW RECAP"}
      </PokeButton>
    )}

    {/* MVP */}
    {isDone && matchup.mvp && (
      <div
        className="px-3 py-1.5 font-pixel text-[6px] flex items-center gap-1"
        style={{
          color: "var(--color-text-muted)",
          backgroundColor: "var(--color-surface-alt)",
        }}
      >
        MVP:{" "}
        <span style={{ color: "var(--color-primary)" }}>
          {matchup.mvp.name}
        </span>
        &nbsp;({matchup.mvp.points} pts)
      </div>
    )}
  </div>
);
```

- [ ] **Step 6: Restyle `LiveBracketView` — champion banner and all 5 round headers**

Find the champion banner block and replace:

```tsx
{
  champion && (
    <div className="mb-8 text-center">
      <PokeCard variant="highlighted" className="inline-block px-8 py-5">
        <div
          className="font-pixel text-[9px] mb-1"
          style={{ color: "var(--color-primary-text)" }}
        >
          ★ TOURNAMENT CHAMPION ★
        </div>
        <div
          className="font-pixel text-[12px]"
          style={{ color: "var(--color-text)" }}
        >
          {champion.name.toUpperCase()}
        </div>
      </PokeCard>
    </div>
  );
}
```

Replace all 5 `<h3>` round-header elements with the exact strings below (the file has 5 headers across the 2 grid columns):

```tsx
{
  /* Column 1 — Round 1 */
}
<h3
  className="font-pixel text-[6px] uppercase tracking-wider text-center mb-2"
  style={{ color: "var(--color-primary)" }}
>
  WEST FIRST ROUND
</h3>;
{
  /* ... west round 1 matchups ... */
}
<h3
  className="font-pixel text-[6px] uppercase tracking-wider text-center mb-2 pt-3"
  style={{ color: "var(--color-danger)" }}
>
  EAST FIRST ROUND
</h3>;
{
  /* ... east round 1 matchups ... */
}

{
  /* Column 2 — Round 2 + Championship */
}
<h3
  className="font-pixel text-[6px] uppercase tracking-wider text-center mb-2"
  style={{ color: "var(--color-primary)" }}
>
  WEST FINAL
</h3>;
{
  /* ... west round 2 matchups ... */
}
<h3
  className="font-pixel text-[6px] uppercase tracking-wider text-center mb-2 pt-3"
  style={{ color: "var(--color-accent)" }}
>
  CHAMPIONSHIP
</h3>;
{
  /* ... round 3 matchups ... */
}
<h3
  className="font-pixel text-[6px] uppercase tracking-wider text-center mb-2 pt-3"
  style={{ color: "var(--color-danger)" }}
>
  EAST FINAL
</h3>;
{
  /* ... east round 2 matchups ... */
}
```

- [ ] **Step 6b: Restyle `LiveEventFeed` component + add TypewriterText**

`LiveEventFeed` is the play-by-play component (it takes `events: GameEvent[]`). Replace its return JSX. The latest event (`reversed[0]`) types in with `<TypewriterText>` keyed by event count so it re-triggers on each new event:

```tsx
return (
  <div
    className="border-3 overflow-hidden"
    style={{
      borderColor: "var(--color-border)",
      boxShadow: "4px 4px 0 var(--color-shadow)",
    }}
  >
    {/* Header */}
    <div
      className="px-4 py-2 border-b-2 flex items-center gap-2"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface-alt)",
      }}
    >
      <span
        className="font-pixel text-[7px]"
        style={{ color: "var(--color-text)" }}
      >
        PLAY-BY-PLAY
      </span>
      {events.length > 0 && (
        <span
          className="font-pixel text-[5px] px-1.5 py-0.5 border"
          style={{
            borderColor: "var(--color-shadow)",
            color: "var(--color-text-muted)",
          }}
        >
          {events.length} PLAYS
        </span>
      )}
    </div>

    <div
      ref={containerRef}
      className="h-96 overflow-y-auto"
      style={{ backgroundColor: "var(--color-surface)" }}
    >
      {reversed.map((event, idx) => {
        const isNew = idx === 0;
        const isHome = event.team === "home";
        return (
          <div
            key={events.length - 1 - idx}
            className="px-4 py-2.5 flex gap-3"
            style={{
              borderBottom: `1px solid var(--color-surface-alt)`,
              borderLeft: `3px solid ${
                isHome ? "var(--color-primary)" : "var(--color-danger)"
              }`,
              backgroundColor: isNew
                ? "var(--color-surface-alt)"
                : "var(--color-surface)",
            }}
          >
            <div className="shrink-0 text-center w-10">
              <div
                className="font-pixel text-[5px]"
                style={{ color: "var(--color-text-muted)" }}
              >
                Q{event.quarter}
              </div>
              <div
                className="font-pixel text-[5px]"
                style={{ color: "var(--color-text-muted)" }}
              >
                {event.clock}
              </div>
            </div>
            <div className="text-base shrink-0">{getIcon(event.type)}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                {event.pokemonSprite && (
                  <img
                    src={event.pokemonSprite}
                    alt=""
                    className="w-4 h-4"
                    style={{ imageRendering: "pixelated" }}
                  />
                )}
                <span
                  className="font-pixel text-[6px]"
                  style={{
                    color: isHome
                      ? "var(--color-primary)"
                      : "var(--color-danger)",
                  }}
                >
                  {event.pokemonName?.toUpperCase()}
                </span>
                {event.pointsScored && (
                  <span
                    className="font-pixel text-[5px] px-1 border"
                    style={{ borderColor: "#78c850", color: "#78c850" }}
                  >
                    +{event.pointsScored}
                  </span>
                )}
              </div>
              {isNew ? (
                <TypewriterText
                  key={events.length}
                  text={event.description}
                  speed={30}
                  className="text-[6px]"
                />
              ) : (
                <span
                  className="font-pixel text-[6px]"
                  style={{ color: "var(--color-text-muted)", opacity: 0.7 }}
                >
                  {event.description}
                </span>
              )}
            </div>
            <div
              className="shrink-0 font-pixel text-[6px] tabular-nums"
              style={{ color: "var(--color-text-muted)" }}
            >
              {event.homeScore}-{event.awayScore}
            </div>
          </div>
        );
      })}
      {events.length === 0 && (
        <div className="text-center py-12">
          <span
            className="font-pixel text-[6px]"
            style={{ color: "var(--color-text-muted)" }}
          >
            GAME HASN&apos;T STARTED YET...
          </span>
        </div>
      )}
    </div>
  </div>
);
```

- [ ] **Step 7: Update outer background and back button in main export**

Find the outermost container `<div>` in the main exported component and add:

```tsx
style={{ backgroundColor: "var(--color-bg)" }}
```

Find the back `<button>` (if any) in the main component and replace with:

```tsx
<PokeButton variant="ghost" size="sm" onClick={onBack}>
  ◀ BACK
</PokeButton>
```

- [ ] **Step 8: Run dev server and verify live tournament**

```bash
npm run dev
```

Navigate to a live tournament. Expected: pixel-styled lobby, matchup cards with pixel borders, LIVE badge pulsing in red, champion banner in yellow, consistent pixel font throughout.

- [ ] **Step 9: Final build check**

```bash
npm run build 2>&1 | tail -30
```

Expected: `✓ Compiled successfully` with no TypeScript errors.

- [ ] **Step 10: Commit**

```bash
git add src/app/components/LiveTournament.tsx
git commit -m "style: restyle LiveTournament with Pokemon pixel theme"
```

---

### Task 13: Final verification checklist

- [ ] **Light mode check**: Open `http://localhost:3000`, verify white/blue/yellow theme on all screens
- [ ] **Dark mode check**: Click the ☾ toggle in the nav. Verify the entire app switches to dark navy/yellow theme. Reload the page — dark mode should persist (localStorage).
- [ ] **System preference**: In browser dev tools, emulate `prefers-color-scheme: dark`, open a fresh private window — dark mode should apply with no flash.
- [ ] **Typewriter check**: On the login screen, verify the Professor Oak text types out on load. In tournament view, verify only the latest highlight event types in.
- [ ] **Mobile check**: Resize to 375px width. Verify layout is usable, font is readable, buttons are large enough to tap.
- [ ] **Build passes**: `npm run build` completes with no errors.
