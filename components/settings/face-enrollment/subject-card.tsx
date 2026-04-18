"use client";

import Image from "next/image";

import { cn } from "@/lib/utils";
import { getThreatAccent, threatLabel } from "./threat-styles";
import type { EnrollmentSubject } from "./types";

export function SubjectCard({
  subject,
  selected,
  onOpen,
}: {
  subject: EnrollmentSubject;
  selected: boolean;
  onOpen: () => void;
}) {
  const { border, badge } = getThreatAccent(subject.threatLevel);
  const confWidth = `${subject.confidence}%`;
  const lowTier = subject.threatLevel === "low";
  const unoptimized = subject.imageUrl.startsWith("data:");

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex flex-col border border-op-border bg-op-surface text-left transition-shadow",
        "border-l-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-op-silver/40",
        border,
        selected && "ring-1 ring-op-border-active",
      )}
    >
      <div className="group relative aspect-square overflow-hidden bg-op-base">
        <Image
          alt={subject.imageAlt}
          className="object-cover opacity-80 grayscale contrast-125 transition-opacity group-hover:opacity-100"
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 33vw, 20vw"
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
        <div className="absolute bottom-0 w-full border-t border-op-border bg-op-surface/90 p-2">
          <div className="flex items-end justify-between">
            <span className="font-mono text-[10px] text-op-text-sec">
              {subject.uid}
            </span>
            <span className="font-mono text-[10px] text-op-silver">
              CONF: {subject.confidence.toFixed(1)}%
            </span>
          </div>
          <div className="confidence-gauge mt-1">
            <div
              className="confidence-fill"
              style={{
                width: confWidth,
                ...(lowTier ? { background: "var(--op-text-sec)" } : undefined),
              }}
            />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div>
          <h4 className="text-sm font-bold uppercase leading-tight tracking-wide text-foreground">
            {subject.name}
          </h4>
          <p className="mt-0.5 font-mono text-[10px] uppercase text-op-text-sec">
            {subject.aliasLine}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-y-2">
          <div>
            <p className="font-mono text-[8px] uppercase text-op-text-sec">
              Height
            </p>
            <p className="font-mono text-[10px] text-op-silver">
              {subject.heightCm} CM
            </p>
          </div>
          <div>
            <p className="font-mono text-[8px] uppercase text-op-text-sec">
              Weight
            </p>
            <p className="font-mono text-[10px] text-op-silver">
              {subject.weightKg} KG
            </p>
          </div>
        </div>
        <div>
          <p className="mb-1 font-mono text-[8px] uppercase text-op-text-sec">
            Crime Categories
          </p>
          <div className="flex flex-wrap gap-1">
            {subject.crimeCategories.map((cat) => (
              <span
                key={cat}
                className="border border-op-border bg-op-elevated px-1.5 py-0.5 font-mono text-[9px] text-foreground"
              >
                {cat}
              </span>
            ))}
          </div>
        </div>
      </div>
    </button>
  );
}
