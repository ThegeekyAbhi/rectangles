"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CheckCircleIcon, InfoIcon, WarningIcon, XCircleIcon, SpinnerIcon } from "@phosphor-icons/react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CheckCircleIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <WarningIcon className="size-4" />
        ),
        error: (
          <XCircleIcon className="size-4" />
        ),
        loading: (
          <SpinnerIcon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          "--width": "320px",
        } as React.CSSProperties
      }
      // Bottom centre stays clear of the canvas toolbar in the bottom-right corner.
      position="bottom-center"
      offset={24}
      toastOptions={{
        classNames: {
          // Compact, and not selectable: a toast is read at a glance, never copied.
          toast: "cn-toast select-none !items-center !gap-2.5 !px-3 !py-2.5 !text-sm !shadow-md",
          title: "!font-medium !leading-5",
          description: "!text-xs !leading-4 !text-muted-foreground",
          icon: "!text-muted-foreground",
          error: "[&_[data-icon]]:!text-destructive",
          actionButton:
            "!h-7 !rounded-md !border !border-border !bg-transparent !px-2.5 !text-xs !font-medium !text-foreground hover:!bg-accent",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
