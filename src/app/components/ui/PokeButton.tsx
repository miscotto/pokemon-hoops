import { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "danger" | "ghost" | "accent";
type Size = "sm" | "md" | "lg";

interface PokeButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantStyles: Record<Variant, string> = {
  primary:
    "bg-[var(--color-primary)] text-[var(--color-primary-text)] border-[var(--color-shadow)]",
  danger:
    "bg-[var(--color-danger)] text-white border-[var(--color-shadow)]",
  ghost:
    "bg-[var(--color-surface)] text-[var(--color-primary)] border-[var(--color-primary)]",
  accent:
    "bg-[var(--color-accent)] text-[var(--color-shadow)] border-[var(--color-shadow)]",
};

const sizeStyles: Record<Size, string> = {
  sm: "text-[7px] px-2 py-1 sm:text-[9px] sm:px-3 sm:py-1.5",
  md: "text-[8px] px-3 py-1.5 sm:text-[11px] sm:px-4 sm:py-2.5",
  lg: "text-[10px] px-4 py-2 sm:text-[13px] sm:px-6 sm:py-3.5",
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
