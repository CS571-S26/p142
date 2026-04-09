import { forwardRef, type TextareaHTMLAttributes } from "react";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className = "", ...props }, ref) => {
  const base =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent disabled:opacity-50";
  return <textarea ref={ref} className={`${base} ${className}`} {...props} />;
});

Textarea.displayName = "Textarea";
