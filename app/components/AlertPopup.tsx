"use client";

import type React from "react";
import type { WatchResult } from "@/app/lib/watch-types";

export interface AlertPopupProps {
  readonly isOpen: boolean;
  readonly watchResult: WatchResult | null;
  readonly cameraLabel: string;
  readonly onClose: () => void;
}

export function AlertPopup({
  isOpen,
  watchResult,
  cameraLabel,
  onClose,
}: AlertPopupProps): React.JSX.Element | null {
  if (!isOpen || !watchResult) {
    return null;
  }

  const hasHarm = watchResult.isHarm.some((harm) => harm === true);
  const description = watchResult.DescriptionOfSituationOnlyIfFoundHarm;

  if (!hasHarm || !description) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#1f2937",
          borderRadius: "12px",
          padding: "24px",
          maxWidth: "600px",
          width: "100%",
          border: "2px solid #ef4444",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <div
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                backgroundColor: "#ef4444",
                animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
              }}
            />
            <h2
              style={{
                fontSize: "20px",
                fontWeight: "700",
                color: "#fff",
                margin: 0,
              }}
            >
              Harm Detected Alert
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#9ca3af",
              fontSize: "24px",
              cursor: "pointer",
              padding: "0",
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "4px",
              transition: "background-color 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            marginBottom: "16px",
            padding: "12px",
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            borderRadius: "8px",
            border: "1px solid rgba(239, 68, 68, 0.3)",
          }}
        >
          <div
            style={{
              fontSize: "14px",
              color: "#9ca3af",
              marginBottom: "4px",
            }}
          >
            Camera:
          </div>
          <div
            style={{
              fontSize: "16px",
              fontWeight: "600",
              color: "#fff",
            }}
          >
            {cameraLabel}
          </div>
        </div>

        <div
          style={{
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              fontSize: "14px",
              color: "#9ca3af",
              marginBottom: "8px",
            }}
          >
            Situation Description:
          </div>
          <div
            style={{
              fontSize: "15px",
              color: "#fff",
              lineHeight: "1.6",
              padding: "12px",
              backgroundColor: "rgba(0, 0, 0, 0.3)",
              borderRadius: "8px",
              whiteSpace: "pre-wrap",
            }}
          >
            {description}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "12px",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "10px 24px",
              backgroundColor: "#374151",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "600",
              transition: "background-color 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#4b5563";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#374151";
            }}
          >
            Acknowledge
          </button>
        </div>
      </div>

      <style>
        {`
          @keyframes pulse {
            0%, 100% {
              opacity: 1;
            }
            50% {
              opacity: 0.5;
            }
          }
        `}
      </style>
    </div>
  );
}
