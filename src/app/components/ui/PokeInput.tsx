import { InputHTMLAttributes } from "react";

interface PokeInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function PokeInput({ label, className = "", id, ...props }: PokeInputProps) {
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
