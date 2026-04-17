"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

interface SidebarItem {
  href: string
  label: string
  icon: string
}

interface SidebarGroup {
  heading?: string
  items: SidebarItem[]
}

interface SettingsSidebarProps extends React.ComponentProps<"aside"> {
  groups: SidebarGroup[]
  width?: "sm" | "default"
}

/**
 * SettingsSidebar — left sidebar for settings pages.
 *
 * Supports grouped nav sections with headings.
 * Active item: bg-op-elevated + silver text + left border accent
 * Inactive item: foreground text, hover bg-op-elevated
 */
function SettingsSidebar({
  groups,
  width = "default",
  className,
  ...props
}: SettingsSidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      data-slot="settings-sidebar"
      className={cn(
        "flex shrink-0 flex-col overflow-y-auto border-r border-op-border bg-op-surface",
        width === "sm" ? "w-56" : "w-64",
        className,
      )}
      {...props}
    >
      {groups.map((group, gi) => (
        <div key={gi} className={cn("px-4 py-4", gi > 0 && "border-t border-op-border")}>
          {group.heading && (
            <h2 className="mb-3 font-mono text-[10px] uppercase tracking-widest text-op-text-sec">
              {group.heading}
            </h2>
          )}
          <nav className="space-y-px">
            {group.items.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href)

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors duration-75",
                    isActive
                      ? "border-l-2 border-op-silver bg-op-elevated pl-[10px] font-medium text-op-silver"
                      : "border-l-2 border-transparent text-foreground hover:bg-op-elevated",
                  )}
                >
                  <span
                    className={cn(
                      "material-symbols-outlined text-[18px] transition-colors",
                      isActive
                        ? "text-op-silver"
                        : "text-op-text-sec group-hover:text-foreground",
                    )}
                    style={
                      isActive
                        ? { fontVariationSettings: '"FILL" 1' }
                        : undefined
                    }
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
      ))}
    </aside>
  )
}

export { SettingsSidebar }
export type { SidebarGroup, SidebarItem }
