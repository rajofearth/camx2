"use client";

import { Button } from "@/components/ui/button";

import { useModelConfiguration } from "./model-configuration-context";

export function ModelConfigFooter() {
  const { saveConfig, discardConfig, lastSavedAt } = useModelConfiguration();

  return (
    <div className="flex flex-col items-end gap-2 border-t border-op-border pt-8">
      {lastSavedAt !== null && (
        <p className="font-mono text-[9px] uppercase tracking-wide text-op-text-sec">
          Last saved {new Date(lastSavedAt).toLocaleString()}
        </p>
      )}
      <div className="flex items-center justify-end gap-4">
        <Button type="button" variant="ghost" onClick={discardConfig}>
          Discard Changes
        </Button>
        <Button type="button" size="lg" onClick={saveConfig}>
          Apply Configuration
        </Button>
      </div>
    </div>
  );
}
