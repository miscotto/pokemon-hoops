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
