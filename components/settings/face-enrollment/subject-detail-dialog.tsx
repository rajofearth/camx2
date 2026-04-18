"use client";

import Image from "next/image";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  getThreatAccent,
  threatLabel,
  watchlistDetailClass,
} from "./threat-styles";
import type { EnrollmentSubject } from "./types";

export function SubjectDetailDialog({
  subject,
  open,
  onOpenChange,
}: {
  subject: EnrollmentSubject;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { border, badge } = getThreatAccent(subject.threatLevel);
  const confWidth = `${subject.confidence}%`;
  const lowTier = subject.threatLevel === "low";
  const unoptimized = subject.imageUrl.startsWith("data:");

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="max-h-[min(92vh,880px)] gap-0 overflow-hidden rounded-none border border-op-border bg-op-surface p-0 sm:max-w-2xl"
        showCloseButton
      >
        <DialogHeader className="border-b border-op-border bg-op-elevated px-5 py-4 text-left">
          <DialogTitle className="font-sans text-base font-medium uppercase tracking-tight text-foreground">
            Subject dossier
          </DialogTitle>
          <DialogDescription className="font-mono text-[10px] text-op-text-sec">
            {subject.uid} // {subject.id}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(92vh-10rem)] overflow-y-auto">
          <div className="flex flex-col gap-4 p-5 md:flex-row">
            <div
              className={cn(
                "relative w-full shrink-0 overflow-hidden border border-op-border bg-op-base md:w-56",
                "aspect-square md:aspect-auto md:h-72",
                border,
              )}
            >
              <Image
                alt={subject.imageAlt}
                className="object-cover grayscale contrast-125"
                fill
                sizes="(max-width: 768px) 100vw, 224px"
                src={subject.imageUrl}
                unoptimized={unoptimized}
              />
              <div
                className={cn(
                  "absolute left-2 top-2 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-white",
                  badge,
                )}
              >
                {threatLabel(subject.threatLevel)}
              </div>
            </div>

            <div className="min-w-0 flex-1 space-y-4">
              <div>
                <p className="font-mono text-[10px] uppercase text-op-text-sec">
                  Full name
                </p>
                <p className="font-mono text-lg font-semibold text-foreground">
                  {subject.name.toUpperCase()}
                </p>
                <p className="mt-1 font-mono text-xs text-op-text-sec">
                  {subject.aliasLine}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Detail label="Confidence">
                  <span className="font-mono text-sm text-op-silver">
                    {subject.confidence.toFixed(1)}%
                  </span>
                  <div className="confidence-gauge mt-1 max-w-[12rem]">
                    <div
                      className="confidence-fill"
                      style={{
                        width: confWidth,
                        ...(lowTier
                          ? { background: "var(--op-text-sec)" }
                          : undefined),
                      }}
                    />
                  </div>
                </Detail>
                <Detail label="Height">
                  <span className="font-mono text-sm text-foreground">
                    {subject.heightCm} cm
                  </span>
                </Detail>
                <Detail label="Weight">
                  <span className="font-mono text-sm text-foreground">
                    {subject.weightKg} kg
                  </span>
                </Detail>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Detail label="Watchlist">
                  <span
                    className={cn(
                      "font-mono text-sm font-bold",
                      watchlistDetailClass(subject.threatLevel),
                    )}
                  >
                    {subject.watchlistCode}
                  </span>
                </Detail>
                <Detail label="Last seen">
                  <span className="font-mono text-sm text-op-silver">
                    {subject.lastSeen}
                  </span>
                </Detail>
              </div>

              <Detail label="Aliases (registry)">
                <span className="font-mono text-sm text-op-silver">
                  {subject.aliasesDetail}
                </span>
              </Detail>

              <Detail label="Crime categories">
                <div className="mt-1 flex flex-wrap gap-1">
                  {subject.crimeCategories.map((cat) => (
                    <span
                      key={cat}
                      className="border border-op-border bg-op-elevated px-2 py-0.5 font-mono text-[10px] uppercase text-foreground"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              </Detail>

              <Detail label="Image alt / capture notes">
                <span className="font-mono text-xs leading-relaxed text-op-text-sec">
                  {subject.imageAlt}
                </span>
              </Detail>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-op-border bg-op-elevated/80 px-5 py-3">
          <Button
            className="rounded-sm border border-op-border bg-transparent font-sans text-[10px] font-bold uppercase tracking-widest"
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase text-op-text-sec">{label}</p>
      {children}
    </div>
  );
}
