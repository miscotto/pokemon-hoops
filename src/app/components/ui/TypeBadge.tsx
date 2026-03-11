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
