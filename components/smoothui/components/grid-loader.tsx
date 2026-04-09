"use client";

import { motion } from "motion/react";

type GridLoaderProps = {
  pattern?: "sparkle" | "plus-hollow" | string;
  mode?: "stagger" | "pulse";
  color?: "blue" | "white" | string;
  size?: "sm" | "md";
  blur?: number;
  gap?: number;
};

const GRID_CELLS = [
  { x: 0, y: 0, spark: 0.15 },
  { x: 1, y: 0, spark: 0.55 },
  { x: 2, y: 0, spark: 0.15 },
  { x: 0, y: 1, spark: 0.55 },
  { x: 1, y: 1, spark: 1 },
  { x: 2, y: 1, spark: 0.55 },
  { x: 0, y: 2, spark: 0.15 },
  { x: 1, y: 2, spark: 0.55 },
  { x: 2, y: 2, spark: 0.15 },
] as const;

export default function GridLoader({
  pattern = "sparkle",
  mode = "stagger",
  color = "blue",
  size = "sm",
  blur = 0,
  gap = 1,
}: GridLoaderProps) {
  const cellSize = size === "sm" ? 3.5 : 4.5;
  const accent =
    color === "white"
      ? "rgba(255,255,255,0.92)"
      : color === "blue"
        ? "rgba(96,165,250,0.95)"
        : color;

  return (
    <span
      aria-hidden="true"
      className="inline-grid shrink-0"
      style={{
        gridTemplateColumns: "repeat(3, min-content)",
        gap: `${gap}px`,
        filter: blur ? `blur(${blur}px)` : undefined,
      }}
    >
      {GRID_CELLS.map((cell, index) => {
        const isActive =
          pattern === "plus-hollow" ? [1, 3, 4, 5, 7].includes(index) : true;
        const delay = mode === "stagger" ? index * 0.08 : 0;

        return (
          <motion.span
            key={`${cell.x}-${cell.y}`}
            initial={{ opacity: 0.35, scale: 0.92 }}
            animate={{
              opacity: isActive ? [0.35, 1, 0.45] : [0.2, 0.5, 0.2],
              scale: isActive ? [0.85, 1, 0.88] : [0.9, 0.95, 0.9],
            }}
            transition={{
              duration: mode === "stagger" ? 1.2 : 1.6,
              repeat: Number.POSITIVE_INFINITY,
              repeatType: "loop",
              ease: "easeInOut",
              delay,
            }}
            style={{
              width: `${cellSize}px`,
              height: `${cellSize}px`,
              borderRadius: pattern === "plus-hollow" ? "9999px" : "2px",
              backgroundColor: isActive ? accent : "rgba(255,255,255,0.18)",
              boxShadow: isActive
                ? `0 0 10px ${accent}`
                : "0 0 0 1px rgba(255,255,255,0.05)",
            }}
          />
        );
      })}
    </span>
  );
}
