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
  sm: "text-[6px] px-2 py-1",
  md: "text-[7px] px-3 py-2",
  lg: "text-[8px] px-5 py-3",
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
