"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  buildEnrollmentSubjectFromForm,
  defaultWatchlistCode,
} from "./enroll-helpers";
import type { EnrollmentSubject, ThreatLevel } from "./types";

const THREAT_OPTIONS: { value: ThreatLevel; label: string }[] = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export function EnrollSubjectDialog({
  open,
  onOpenChange,
  onEnrolled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnrolled: (subject: EnrollmentSubject) => void;
}) {
  const [name, setName] = React.useState("");
  const [aliases, setAliases] = React.useState("");
  const [threatLevel, setThreatLevel] = React.useState<ThreatLevel>("medium");
  const [confidence, setConfidence] = React.useState("92");
  const [heightCm, setHeightCm] = React.useState("175");
  const [weightKg, setWeightKg] = React.useState("70");
  const [crimeCategories, setCrimeCategories] = React.useState("");
  const [watchlistCode, setWatchlistCode] = React.useState(() =>
    defaultWatchlistCode("medium"),
  );
  const [lastSeen, setLastSeen] = React.useState("");
  const [imageAlt, setImageAlt] = React.useState("");
  const [imageDataUrl, setImageDataUrl] = React.useState<string | null>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const reset = React.useCallback(() => {
    setName("");
    setAliases("");
    setThreatLevel("medium");
    setConfidence("92");
    setHeightCm("175");
    setWeightKg("70");
    setCrimeCategories("");
    setWatchlistCode(defaultWatchlistCode("medium"));
    setLastSeen("");
    setImageAlt("");
    setImageDataUrl(null);
  }, []);

  React.useEffect(() => {
    if (open) {
      reset();
    }
  }, [open, reset]);

  React.useEffect(() => {
    setWatchlistCode(defaultWatchlistCode(threatLevel));
  }, [threatLevel]);

  const readFileAsDataUrl = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setImageDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) {
      readFileAsDataUrl(file);
    }
  };

  const onPickFile: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      readFileAsDataUrl(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      return;
    }
    const conf = Number.parseFloat(confidence);
    const h = Number.parseInt(heightCm, 10);
    const w = Number.parseInt(weightKg, 10);
    if (
      Number.isNaN(conf) ||
      Number.isNaN(h) ||
      Number.isNaN(w) ||
      conf < 0 ||
      conf > 100
    ) {
      return;
    }

    const placeholderImage =
      "data:image/svg+xml," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect fill="#0f0f0f" width="400" height="400"/><text x="50%" y="50%" fill="#5c5c5c" font-family="monospace" font-size="14" text-anchor="middle" dominant-baseline="middle">NO IMAGE</text></svg>`,
      );

    const subject = buildEnrollmentSubjectFromForm({
      name,
      aliases,
      threatLevel,
      confidence: conf,
      heightCm: h,
      weightKg: w,
      crimeCategories,
      watchlistCode: watchlistCode.trim() || defaultWatchlistCode(threatLevel),
      lastSeen,
      imageUrl: imageDataUrl ?? placeholderImage,
      imageAlt: imageAlt || name.trim(),
    });

    onEnrolled(subject);
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="max-h-[min(90vh,800px)] gap-0 overflow-hidden rounded-none border border-op-border bg-op-surface p-0 sm:max-w-xl"
        showCloseButton
      >
        <DialogHeader className="border-b border-op-border bg-op-elevated px-5 py-4">
          <DialogTitle className="font-sans text-base font-medium uppercase tracking-tight text-foreground">
            Enroll new subject
          </DialogTitle>
          <DialogDescription className="font-mono text-[10px] text-op-text-sec">
            Registry intake — local preview only. No backend persistence.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid max-h-[calc(90vh-8rem)] gap-4 overflow-y-auto px-5 py-4"
          onSubmit={handleSubmit}
        >
          <button
            type="button"
            className={cn(
              "flex w-full cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-op-border bg-op-base px-4 py-6 transition-colors",
              dragOver && "border-op-silver bg-op-elevated/50",
            )}
            onDragLeave={() => setDragOver(false)}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              accept="image/*"
              className="sr-only"
              onChange={onPickFile}
              ref={fileInputRef}
              type="file"
            />
            <span className="material-symbols-outlined text-[28px] text-op-text-sec">
              add_a_photo
            </span>
            <p className="font-mono text-[10px] uppercase text-op-text-sec">
              Drop portrait or click to upload
            </p>
            {imageDataUrl && (
              <p className="font-mono text-[9px] text-op-nominal">
                Image loaded
              </p>
            )}
          </button>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" required>
              <Input
                autoComplete="off"
                onChange={(e) => setName(e.target.value)}
                placeholder="Surname, Given"
                required
                value={name}
              />
            </Field>
            <Field label="Confidence %">
              <Input
                inputMode="decimal"
                max={100}
                min={0}
                onChange={(e) => setConfidence(e.target.value)}
                step={0.1}
                type="number"
                value={confidence}
              />
            </Field>
          </div>

          <Field label="Aliases (comma-separated)">
            <Input
              onChange={(e) => setAliases(e.target.value)}
              placeholder="Ghost, V-RAY"
              value={aliases}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Threat level">
              <select
                className="h-7 w-full rounded-sm border border-op-border bg-op-base px-2.5 font-mono text-xs text-foreground outline-none focus:border-op-silver"
                onChange={(e) => setThreatLevel(e.target.value as ThreatLevel)}
                value={threatLevel}
              >
                {THREAT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Watchlist code">
              <Input
                onChange={(e) => setWatchlistCode(e.target.value)}
                placeholder={defaultWatchlistCode(threatLevel)}
                value={watchlistCode}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Height (cm)">
              <Input
                inputMode="numeric"
                onChange={(e) => setHeightCm(e.target.value)}
                type="number"
                value={heightCm}
              />
            </Field>
            <Field label="Weight (kg)">
              <Input
                inputMode="numeric"
                onChange={(e) => setWeightKg(e.target.value)}
                type="number"
                value={weightKg}
              />
            </Field>
          </div>

          <Field label="Crime categories (comma or |)">
            <Input
              onChange={(e) => setCrimeCategories(e.target.value)}
              placeholder="ESPIONAGE, FRAUD"
              value={crimeCategories}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Last seen">
              <Input
                onChange={(e) => setLastSeen(e.target.value)}
                placeholder="ZONE_B4 / 14:22:11"
                value={lastSeen}
              />
            </Field>
            <Field label="Image alt text">
              <Input
                onChange={(e) => setImageAlt(e.target.value)}
                placeholder="Portrait description"
                value={imageAlt}
              />
            </Field>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-op-border bg-op-elevated/80 px-0 pt-4 sm:flex-row sm:justify-end">
            <Button
              className="rounded-sm border border-op-border bg-transparent font-sans text-[10px] font-bold uppercase tracking-widest"
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="rounded-sm bg-op-silver font-sans text-[10px] font-bold uppercase tracking-widest text-op-base hover:bg-white"
              type="submit"
            >
              Commit enrollment
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-widest text-op-text-sec">
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </div>
  );
}
