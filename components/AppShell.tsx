"use client";

import type React from "react";
import { RouteActivityProvider } from "./RouteActivityProvider";
import {
  defaultNavItems,
  NavAvatar,
  NavIconButton,
  ThemeSwitcher,
  TopNav,
} from "./shell";

export function AppShell({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <RouteActivityProvider>
      <TopNav
        items={defaultNavItems}
        actions={
          <div className="flex items-center gap-1">
            <NavIconButton icon="notifications" />
            <ThemeSwitcher />
            <div className="ml-1">
              <NavAvatar />
            </div>
          </div>
        }
      />
      {children}
    </RouteActivityProvider>
  );
}
