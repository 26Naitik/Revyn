import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "soft"
  | "danger-ghost";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-white shadow-[var(--shadow-cta)] hover:bg-brand-dark active:bg-brand-dark",
  secondary:
    "border border-line bg-surface text-ink hover:border-line-strong hover:bg-canvas",
  ghost: "text-muted hover:bg-canvas hover:text-ink",
  soft: "bg-brand-soft text-brand-dark ring-1 ring-inset ring-brand/20 hover:bg-green-100",
  "danger-ghost":
    "text-danger ring-1 ring-inset ring-danger/20 hover:bg-danger-soft",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 rounded-lg px-3 text-[13px]",
  md: "h-9.5 gap-2 rounded-lg px-4 text-sm",
  lg: "h-11 gap-2 rounded-lg px-5 text-[15px]",
};

export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className = ""
): string {
  return [
    "inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100",
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, className)}
      {...props}
    />
  );
}
