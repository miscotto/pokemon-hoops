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
