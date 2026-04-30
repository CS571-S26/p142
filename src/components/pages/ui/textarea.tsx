import { forwardRef, type TextareaHTMLAttributes } from "react";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className = "", ...props }, ref) => {
  const base =
    "w-full rounded-md border-2 border-[#3D2817] px-3 py-2 text-sm shadow-sm placeholder:text-[#785A38] focus:outline-none focus:ring-2 focus:ring-[#FF9F45] focus:border-transparent disabled:opacity-50 text-[#3D2817]";
  return <textarea ref={ref} className={`${base} ${className}`} {...props} />;
});

Textarea.displayName = "Textarea";
