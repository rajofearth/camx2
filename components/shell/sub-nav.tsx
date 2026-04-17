"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

interface SubNavItem {
  href: string
  label: string
}

interface SubNavProps extends React.ComponentProps<"div"> {
  items: SubNavItem[]
  /** Show "/" separator between items */
  separator?: boolean
}

/**
 * SubNav — secondary page-level tab navigation.
 * Used below the TopNav for sub-sections (e.g. Video Analysis / AI Query).
 *
 * Active tab: silver text + bottom border
 * Inactive tab: muted text, hover silver
 */
function SubNav({ items, separator = true, className, ...props }: SubNavProps) {
  const pathname = usePathname()

  return (
    <div
      data-slot="sub-nav"
      className={cn(
        "flex h-10 w-full shrink-0 items-center border-b border-op-border bg-op-base px-4",
        className,
      )}
      {...props}
    >
      <div className="flex h-full items-center gap-0">
        {items.map((item, i) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href)

          return (
            <React.Fragment key={item.href}>
              {separator && i > 0 && (
                <span className="mx-1 font-mono text-xs text-op-border">/</span>
              )}
              <Link
                href={item.href}
                className={cn(
                  "flex h-full items-center px-3 font-mono text-xs uppercase tracking-wider transition-colors duration-75",
                  isActive
                    ? "border-b border-op-silver text-op-silver"
                    : "text-op-text-sec hover:text-op-silver",
                )}
              >
                {item.label}
              </Link>
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}

/**
 * SubNavTabs — uncontrolled tab variant (no routing, uses value/onValueChange).
 * Useful for client-side-only tab switching without URL changes.
 */
interface SubNavTabsProps extends React.ComponentProps<"div"> {
  items: Array<{ value: string; label: string }>
  value: string
  onValueChange: (value: string) => void
}

function SubNavTabs({ items, value, onValueChange, className, ...props }: SubNavTabsProps) {
  return (
    <div
      data-slot="sub-nav-tabs"
      className={cn(
        "flex h-10 w-full shrink-0 items-center border-b border-op-border bg-op-base px-4",
        className,
      )}
      {...props}
    >
      <div className="flex h-full items-center gap-1">
        {items.map((item) => {
          const isActive = item.value === value
          return (
            <button
              key={item.value}
              onClick={() => onValueChange(item.value)}
              className={cn(
                "flex h-full items-center px-3 font-mono text-xs uppercase tracking-wider transition-colors duration-75",
                isActive
                  ? "border-b border-op-silver text-op-silver"
                  : "text-op-text-sec hover:text-op-silver",
              )}
            >
              {item.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export { SubNav, SubNavTabs }
export type { SubNavItem }
