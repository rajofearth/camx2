"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

interface NavItem {
  href: string
  label: string
  /** Exact match (default) vs prefix match */
  exact?: boolean
}

interface TopNavProps extends React.ComponentProps<"nav"> {
  items?: NavItem[]
  /** Right-side slot: notifications, avatar, etc. */
  actions?: React.ReactNode
}

const defaultNavItems: NavItem[] = [
  { href: "/monitor", label: "LIVE_MONITOR" },
  { href: "/analysis", label: "ANALYSIS_QUERY" },
  { href: "/settings", label: "SETTINGS" },
]

/**
 * TopNav — primary application navigation bar.
 *
 * Layout: [LOGO] [nav links] ··· [actions]
 * Active link: silver text + bottom border + bg-elevated
 * Inactive link: muted text, hover bg-elevated
 */
function TopNav({ items = defaultNavItems, actions, className, ...props }: TopNavProps) {
  const pathname = usePathname()

  return (
    <nav
      data-slot="top-nav"
      className={cn(
        "flex h-12 w-full shrink-0 items-center justify-between border-b border-op-border bg-op-surface px-4",
        className,
      )}
      {...props}
    >
      {/* Left: Logo + nav links */}
      <div className="flex h-full items-center gap-0">
        {/* Logo */}
        <Link
          href="/"
          className="mr-8 font-mono text-sm font-bold uppercase tracking-tighter text-op-silver"
        >
          CAMX2
        </Link>

        {/* Nav links */}
        <div className="hidden h-full items-center md:flex">
          {items.map((item) => {
            const isActive = item.exact !== false
              ? pathname === item.href
              : pathname.startsWith(item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex h-full items-center px-4 font-mono text-xs uppercase tracking-widest transition-colors duration-75",
                  isActive
                    ? "border-b border-op-silver bg-op-elevated text-op-silver"
                    : "text-op-text-sec hover:bg-op-elevated hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Right: actions slot */}
      {actions && (
        <div className="flex items-center gap-1">{actions}</div>
      )}
    </nav>
  )
}

/**
 * NavIconButton — ghost icon button for the top nav right side.
 * Renders a Material Symbol icon.
 */
interface NavIconButtonProps extends React.ComponentProps<"button"> {
  icon: string
  /** Optional notification dot */
  badge?: boolean
}

function NavIconButton({ icon, badge = false, className, ...props }: NavIconButtonProps) {
  return (
    <button
      data-slot="nav-icon-button"
      className={cn(
        "relative flex size-8 items-center justify-center rounded-sm text-op-text-sec transition-colors hover:bg-op-elevated hover:text-foreground",
        className,
      )}
      {...props}
    >
      <span className="material-symbols-outlined text-[18px]">{icon}</span>
      {badge && (
        <span className="absolute right-1 top-1 size-1.5 rounded-full bg-op-warning" />
      )}
    </button>
  )
}

/**
 * NavAvatar — small user avatar for the top nav.
 */
interface NavAvatarProps extends React.ComponentProps<"div"> {
  src?: string
  fallback?: string
}

function NavAvatar({ src, fallback, className, ...props }: NavAvatarProps) {
  return (
    <div
      data-slot="nav-avatar"
      className={cn(
        "size-6 shrink-0 overflow-hidden rounded-sm border border-op-border-active bg-op-elevated",
        className,
      )}
      {...props}
    >
      {src ? (
        <img
          src={src}
          alt={fallback ?? "User"}
          className="h-full w-full object-cover grayscale opacity-80"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          <span className="material-symbols-outlined text-[14px] text-op-text-sec">
            person
          </span>
        </span>
      )}
    </div>
  )
}

export { TopNav, NavIconButton, NavAvatar, defaultNavItems }
export type { NavItem }
