// src/app/components/DashboardShell.tsx
"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import DashboardSidebar from "./DashboardSidebar";

interface DashboardShellProps {
  children: React.ReactNode;
}

export default function DashboardShell({ children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer on navigation
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: "var(--color-bg)" }}>
      {/* Mobile overlay — sits below drawer, above content */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <DashboardSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Right side: mobile top bar + scrollable content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Mobile top bar */}
        <header
          className="md:hidden flex items-center justify-between sticky top-0 z-40 px-3 py-2 border-b-3 border-[var(--color-shadow)] shrink-0"
          style={{ backgroundColor: "var(--color-primary)" }}
        >
          <Link
            href="/"
            className="font-pixel text-[9px]"
            style={{ color: "var(--color-primary-text)" }}
          >
            ⚡ POKEMON HOOPS
          </Link>
          <button
            className="font-pixel text-[14px] leading-none px-2 py-1"
            style={{ color: "var(--color-primary-text)" }}
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            aria-expanded={sidebarOpen}
          >
            ☰
          </button>
        </header>

        {/* Main content — all scrolling happens here */}
        <main
          className="flex-1 overflow-y-auto"
          style={{ backgroundColor: "var(--color-bg)" }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
