"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { PokeButton, ThemeToggle } from "./ui";

interface DashboardSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const NAV_ITEMS = [
  { label: "ROSTERS", href: "/dashboard" },
  { label: "SEASONS", href: "/dashboard/seasons" },
  { label: "TOURNAMENTS", href: "/dashboard/tournaments" },
  { label: "PROFILE", href: "/dashboard/profile" },
];

export function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(href);
}

export default function DashboardSidebar({ isOpen, onClose }: DashboardSidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={[
        "fixed inset-y-0 left-0 flex flex-col w-65 z-60",
        "transition-transform duration-200",
        isOpen ? "translate-x-0" : "-translate-x-full",
        "md:relative md:z-auto md:translate-x-0 md:w-50 md:flex md:flex-col md:h-full",
      ].join(" ")}
      style={{ backgroundColor: "var(--color-surface)", borderRight: "2px solid var(--color-border)" }}
    >
      {/* Sidebar header: branding + mobile close */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b-2"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-primary)" }}
      >
        <span
          className="font-pixel text-[8px]"
          style={{ color: "var(--color-primary-text)" }}
        >
          ⚡ POKEMON HOOPS
        </span>
        <PokeButton
          variant="ghost"
          size="sm"
          className="md:hidden"
          onClick={onClose}
          aria-label="Close menu"
        >
          ✕
        </PokeButton>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-2">
        {NAV_ITEMS.map(({ label, href }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center px-4 py-3 font-pixel text-[7px] transition-colors"
              style={{
                color: active ? "var(--color-primary)" : "var(--color-text-muted)",
                borderLeft: active ? "3px solid var(--color-primary)" : "3px solid transparent",
                backgroundColor: active ? "color-mix(in srgb, var(--color-primary) 10%, transparent)" : "transparent",
              }}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom: theme + sign out */}
      <div
        className="px-4 py-3 border-t-2 flex flex-col gap-2"
        style={{ borderColor: "var(--color-border)" }}
      >
        <ThemeToggle />
        <PokeButton
          variant="ghost"
          size="sm"
          onClick={() => signOut()}
        >
          SIGN OUT
        </PokeButton>
      </div>
    </aside>
  );
}
