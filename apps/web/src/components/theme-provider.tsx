"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Applies the chosen theme by putting `light` or `dark` on `<html>` before the first
 * paint. Follows the operating system until the person picks one.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
