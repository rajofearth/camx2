import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * FilterBar — horizontal container for table/log filter controls.
 * bg-op-elevated, border, tight padding.
 */
function FilterBar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="filter-bar"
      className={cn(
        "flex items-center gap-2 overflow-x-auto rounded-sm border border-op-border bg-op-elevated p-2",
        className,
      )}
      {...props}
    />
  )
}

/**
 * FilterDivider — vertical separator between filter groups.
 */
function FilterDivider({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="filter-divider"
      className={cn("mx-1 h-6 w-px shrink-0 bg-op-border", className)}
      {...props}
    />
  )
}

interface FilterSearchProps extends React.ComponentProps<"div"> {
  inputProps?: React.ComponentProps<"input">
}

/**
 * FilterSearch — search input with leading search icon.
 * Focus border transitions to op-silver.
 */
function FilterSearch({
  className,
  inputProps,
  ...props
}: FilterSearchProps) {
  return (
    <div
      data-slot="filter-search"
      className={cn(
        "flex items-center gap-2 rounded-sm border border-op-border bg-op-base px-2 py-1 transition-colors focus-within:border-op-silver",
        className,
      )}
      {...props}
    >
      <span className="material-symbols-outlined shrink-0 text-[16px] text-op-text-sec">
        search
      </span>
      <input
        className="w-full border-none bg-transparent p-0 font-mono text-xs text-foreground outline-none placeholder:text-op-text-sec"
        {...inputProps}
      />
    </div>
  )
}

interface FilterDropdownProps extends React.ComponentProps<"button"> {
  label: string
}

/**
 * FilterDropdown — trigger button for filter dropdowns.
 * Shows label + chevron. Pairs with shadcn DropdownMenu.
 */
function FilterDropdown({
  label,
  className,
  ...props
}: FilterDropdownProps) {
  return (
    <button
      data-slot="filter-dropdown"
      className={cn(
        "flex items-center justify-between gap-2 rounded-sm border border-op-border bg-op-base px-3 py-1 font-mono text-xs text-foreground transition-colors hover:border-op-border-active",
        className,
      )}
      {...props}
    >
      <span>{label}</span>
      <span className="material-symbols-outlined text-[16px] text-op-text-sec">
        arrow_drop_down
      </span>
    </button>
  )
}

/**
 * FilterClearButton — small "CLEAR" reset button at end of filter bar.
 */
function FilterClearButton({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      data-slot="filter-clear"
      className={cn(
        "flex items-center gap-1 px-2 font-mono text-xs text-op-text-sec transition-colors hover:text-foreground",
        className,
      )}
      {...props}
    >
      <span className="material-symbols-outlined text-[16px]">filter_list_off</span>
      CLEAR
    </button>
  )
}

export { FilterBar, FilterDivider, FilterSearch, FilterDropdown, FilterClearButton }
