import { forwardRef, type ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "ghost" | "outline";
}

const variantClasses: Record<string, string> = {
  default: "bg-[#3D2817] text-white hover:bg-[#2A1B10] border-2 border-[#3D2817]",
  ghost: "bg-transparent hover:bg-[#FFD699] text-[#3D2817]",
  outline: "border-2 border-[#3D2817] bg-white text-[#3D2817] hover:bg-[#FFF8E7]",
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
