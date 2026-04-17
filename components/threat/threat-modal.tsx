"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ConfidenceBar } from "@/components/ui/confidence-bar"
import { BoundingBox } from "@/components/ui/bounding-box"
import { MonoLabel } from "@/components/ui/mono-label"

interface ThreatModalProps {
  open: boolean
  onDismiss?: () => void
  onFlag?: () => void
  onAcknowledge?: () => void
  onDispatch?: () => void

  /** Threat metadata */
  threatId: string
  cameraId: string
  timestamp: string
  classification: string
  confidence: number

  /** Frame capture */
  frameSrc?: string
  frameId?: string

  /** VLM analysis text */
  vlmAnalysis?: string[]

  /** Optional bounding box on the frame */
  boundingBox?: {
    top: string
    left: string
    width: string
    height: string
  }
}

/**
 * ThreatModal — full-screen critical threat alert dialog.
 *
 * Rendered over a blurred feed background.
 * Red pulsing top accent bar, critical border, two-column body.
 * Actions: DISMISS · FLAG · ACKNOWLEDGE · DISPATCH (primary destructive)
 */
function ThreatModal({
  open,
  onDismiss,
  onFlag,
  onAcknowledge,
  onDispatch,
  threatId,
  cameraId,
  timestamp,
  classification,
  confidence,
  frameSrc,
  frameId,
  vlmAnalysis = [],
  boundingBox,
}: ThreatModalProps) {
  if (!open) return null

  return (
    <div
      data-slot="threat-modal"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-op-base/60 backdrop-blur-sm" />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-3xl overflow-hidden rounded-sm border border-op-critical bg-op-surface shadow-2xl">
        {/* Critical pulsing bar */}
        <div className="h-0.5 w-full animate-pulse bg-op-critical" />

        <div className="flex flex-col gap-6 p-6">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-op-border pb-4">
            <div>
              <h2 className="flex items-center gap-3 font-mono text-2xl font-bold text-op-critical">
                <span
                  className="material-symbols-outlined text-3xl"
                  style={{ fontVariationSettings: '"FILL" 1' }}
                >
                  warning
                </span>
                CRITICAL THREAT DETECTED
              </h2>
              <MonoLabel className="mt-1 text-op-text-sec">
                ID: {threatId} · {cameraId} · {timestamp}
              </MonoLabel>
            </div>

            <div className="rounded-sm border border-op-critical bg-op-critical/10 px-4 py-1.5">
              <MonoLabel variant="critical">CONFIDENCE: {confidence}%</MonoLabel>
            </div>
          </div>

          {/* Body */}
          <div className="flex gap-6">
            {/* Frame capture */}
            <div className="relative flex-1 overflow-hidden border border-op-border bg-op-base">
              {frameSrc ? (
                <img
                  src={frameSrc}
                  alt="Threat frame"
                  className="h-auto w-full grayscale contrast-150"
                />
              ) : (
                <div className="flex aspect-video items-center justify-center">
                  <span className="material-symbols-outlined text-[48px] text-op-border">
                    videocam_off
                  </span>
                </div>
              )}

              {/* Bounding box overlay */}
              {boundingBox && (
                <BoundingBox
                  variant="critical"
                  crosshair
                  style={{
                    top: boundingBox.top,
                    left: boundingBox.left,
                    width: boundingBox.width,
                    height: boundingBox.height,
                  }}
                />
              )}

              {/* Frame ID chip */}
              {frameId && (
                <div className="absolute bottom-3 right-3 border border-op-border bg-op-base/90 px-3 py-0.5">
                  <MonoLabel size="2xs">{frameId}</MonoLabel>
                </div>
              )}
            </div>

            {/* Right info panel */}
            <div className="flex w-80 flex-col gap-4">
              {/* Classification */}
              <div className="border border-op-border bg-op-elevated p-4">
                <MonoLabel className="mb-2">CLASSIFICATION</MonoLabel>
                <p className="font-mono text-lg font-medium text-op-silver">
                  {classification}
                </p>
                <ConfidenceBar
                  value={confidence}
                  variant="critical"
                  thick
                  className="mt-4"
                />
              </div>

              {/* VLM analysis */}
              {vlmAnalysis.length > 0 && (
                <div className="flex-1 border border-op-border bg-op-elevated p-4">
                  <MonoLabel className="mb-3">VLM ANALYSIS</MonoLabel>
                  <div className="space-y-2 font-mono text-sm leading-relaxed text-op-silver">
                    {vlmAnalysis.map((line, i) => (
                      <p key={i}>&gt; {line}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 border-t border-op-border pt-4">
            <Button variant="ghost" onClick={onDismiss}>
              DISMISS
            </Button>
            <Button variant="outline" onClick={onFlag}>
              FLAG
            </Button>
            <Button variant="secondary" onClick={onAcknowledge}>
              ACKNOWLEDGE
            </Button>
            <Button variant="destructive" size="lg" onClick={onDispatch}>
              DISPATCH
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export { ThreatModal }
