import { forwardRef, type ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "ghost" | "outline";
}

const variantClasses: Record<string, string> = {
  default: "bg-black text-white hover:bg-gray-800",
  ghost: "bg-transparent hover:bg-gray-100",
  outline: "border border-gray-300 bg-white hover:bg-gray-50",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", ...props }, ref) => {
    const base = "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors cursor-pointer disabled:opacity-50";
    const v = variantClasses[variant] ?? variantClasses.default;
    return (
      <button ref={ref} className={`${base} ${v} ${className}`} {...props} />
    );
  }
);

Button.displayName = "Button";
