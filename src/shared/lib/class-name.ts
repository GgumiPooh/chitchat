import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// WARN: Omitting a `--text-*` token makes tailwind-merge read it as a colour and stop deduplicating sizes.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        "display-lg",
        "display-md",
        "display-sm",
        "title-md",
        "title-sm",
        "body-lg",
        "body-md",
        "body-sm",
        "chat-body",
        "chat-name",
        "chat-time",
        "chat-badge",
        "caption",
        "micro",
        "button-md",
        "button-sm",
        "tab-label",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
