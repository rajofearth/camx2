"use client";

import { usePathname } from "next/navigation";
import type React from "react";
import { createContext, useContext, useMemo } from "react";

type RouteActivityState = {
  readonly pathname: string;
  readonly isChatRoute: boolean;
  readonly isCameraPaused: boolean;
};

const RouteActivityContext = createContext<RouteActivityState | null>(null);

export function RouteActivityProvider({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const pathname = usePathname();

  const value = useMemo<RouteActivityState>(() => {
    const normalizedPathname = pathname ?? "/";
    const isChatRoute =
      normalizedPathname.startsWith("/chat") ||
      normalizedPathname.startsWith("/analysis");

    return {
      pathname: normalizedPathname,
      isChatRoute,
      isCameraPaused: isChatRoute,
    };
  }, [pathname]);

  return (
    <RouteActivityContext.Provider value={value}>
      {children}
    </RouteActivityContext.Provider>
  );
}

export function useRouteActivity(): RouteActivityState {
  const value = useContext(RouteActivityContext);

  if (!value) {
    return {
      pathname: "/",
      isChatRoute: false,
      isCameraPaused: false,
    };
  }

  return value;
}
