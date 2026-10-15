import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { QueryProvider } from "@/components/query-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Rectangles",
    template: "%s · Rectangles",
  },
  description:
    "Draw an architecture, send simulated traffic through it, and see where it breaks and why.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script sets a class on <html> before React loads, which React must not undo.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <QueryProvider>
            {/* Tooltips wait half a second, then follow the pointer at once between neighbours. */}
            <TooltipProvider delayDuration={500} skipDelayDuration={300}>
              {children}
            </TooltipProvider>
          </QueryProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
