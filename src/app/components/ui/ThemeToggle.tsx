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
    <PokeButton variant="ghost" size="sm" onClick={toggle} aria-label="Toggle theme">
      {theme === "dark" ? "☀" : "☾"}
    </PokeButton>
  );
}
