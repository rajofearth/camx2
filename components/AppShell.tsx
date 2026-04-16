"use client";

import type React from "react";
import { RouteActivityProvider } from "./RouteActivityProvider";

export function AppShell({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return <RouteActivityProvider>{children}</RouteActivityProvider>;
}
