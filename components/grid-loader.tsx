"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";

export type GridMatrix = [
  [0 | 1, 0 | 1, 0 | 1],
  [0 | 1, 0 | 1, 0 | 1],
  [0 | 1, 0 | 1, 0 | 1],
];

export type PresetPattern =
  | "solo-center"
  | "solo-tl"
  | "solo-tr"
  | "solo-bl"
  | "solo-br"
  | "line-h-top"
  | "line-h-mid"
  | "line-h-bot"
  | "line-v-left"
  | "line-v-mid"
  | "line-v-right"
  | "line-diag-1"
  | "line-diag-2"
  | "corners-only"
  | "corners-sync"
  | "corners"
  | "plus-hollow"
  | "plus-full"
  | "L-tl"
  | "L-tr"
  | "L-bl"
  | "L-br"
  | "T-top"
  | "T-bot"
  | "T-left"
  | "T-right"
  | "duo-h"
  | "duo-v"
  | "duo-diag"
  | "frame"
  | "frame-sync"
  | "sparse-1"
  | "sparse-2"
  | "sparse-3"
  | "wave-lr"
  | "wave-rl"
  | "wave-tb"
  | "wave-bt"
  | "diagonal-tl"
  | "diagonal-tr"
  | "diagonal-bl"
  | "diagonal-br"
  | "ripple-out"
  | "ripple-in"
  | "cross"
  | "x-shape"
  | "diamond"
  | "stripes-h"
  | "stripes-v"
  | "checkerboard"
  | "rows-alt"
  | "spiral-cw"
  | "spiral-ccw"
  | "snake"
  | "snake-rev"
  | "rain"
  | "rain-rev"
  | "waterfall"
  | "breathing"
  | "heartbeat"
  | "twinkle"
  | "sparkle"
  | "chaos"
  | "edge-cw"
  | "border";

export interface GridLoaderProps {
  pattern?: PresetPattern | GridMatrix;
  mode?: "sequence" | "stagger";
  sequence?: Array<PresetPattern | GridMatrix>;
  speed?: "slow" | "normal" | "fast";
  color?: "white" | "red" | "blue" | "green" | "amber" | string;
  size?: "sm" | "md" | "lg" | "xl" | number;
  blur?: number;
  gap?: number;
  rounded?: boolean;
  static?: boolean;
  className?: string;
}

const PATTERNS: Record<PresetPattern, GridMatrix> = {
  "solo-center": [
    [0, 0, 0],
    [0, 1, 0],
    [0, 0, 0],
  ],
  "solo-tl": [
    [1, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ],
  "solo-tr": [
    [0, 0, 1],
    [0, 0, 0],
    [0, 0, 0],
  ],
  "solo-bl": [
    [0, 0, 0],
    [0, 0, 0],
    [1, 0, 0],
  ],
  "solo-br": [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 1],
  ],
  "line-h-top": [
    [1, 1, 1],
    [0, 0, 0],
    [0, 0, 0],
  ],
  "line-h-mid": [
    [0, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  "line-h-bot": [
    [0, 0, 0],
    [0, 0, 0],
    [1, 1, 1],
  ],
  "line-v-left": [
    [1, 0, 0],
    [1, 0, 0],
    [1, 0, 0],
  ],
  "line-v-mid": [
    [0, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
  ],
  "line-v-right": [
    [0, 0, 1],
    [0, 0, 1],
    [0, 0, 1],
  ],
  "line-diag-1": [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  "line-diag-2": [
    [0, 0, 1],
    [0, 1, 0],
    [1, 0, 0],
  ],
  "corners-only": [
    [1, 0, 1],
    [0, 0, 0],
    [1, 0, 1],
  ],
  "corners-sync": [
    [1, 0, 1],
    [0, 0, 0],
    [1, 0, 1],
  ],
  corners: [
    [1, 0, 1],
    [0, 0, 0],
    [1, 0, 1],
  ],
  "plus-hollow": [
    [0, 1, 0],
    [1, 0, 1],
    [0, 1, 0],
  ],
  "plus-full": [
    [0, 1, 0],
    [1, 1, 1],
    [0, 1, 0],
  ],
  "L-tl": [
    [1, 1, 0],
    [1, 0, 0],
    [0, 0, 0],
  ],
  "L-tr": [
    [0, 1, 1],
    [0, 0, 1],
    [0, 0, 0],
  ],
  "L-bl": [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
  ],
  "L-br": [
    [0, 0, 0],
    [0, 0, 1],
    [0, 1, 1],
  ],
  "T-top": [
    [1, 1, 1],
    [0, 1, 0],
    [0, 0, 0],
  ],
  "T-bot": [
    [0, 0, 0],
    [0, 1, 0],
    [1, 1, 1],
  ],
  "T-left": [
    [1, 0, 0],
    [1, 1, 0],
    [1, 0, 0],
  ],
  "T-right": [
    [0, 0, 1],
    [0, 1, 1],
    [0, 0, 1],
  ],
  "duo-h": [
    [0, 0, 0],
    [1, 1, 0],
    [0, 0, 0],
  ],
  "duo-v": [
    [0, 1, 0],
    [0, 1, 0],
    [0, 0, 0],
  ],
  "duo-diag": [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 0],
  ],
  frame: [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
  ],
  "frame-sync": [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
  ],
  "sparse-1": [
    [1, 0, 0],
    [0, 0, 1],
    [0, 1, 0],
  ],
  "sparse-2": [
    [0, 1, 0],
    [1, 0, 0],
    [0, 0, 1],
  ],
  "sparse-3": [
    [0, 0, 1],
    [0, 1, 0],
    [1, 0, 0],
  ],
  "wave-lr": [
    [1, 1, 0],
    [1, 1, 0],
    [1, 1, 0],
  ],
  "wave-rl": [
    [0, 1, 1],
    [0, 1, 1],
    [0, 1, 1],
  ],
  "wave-tb": [
    [1, 1, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
  "wave-bt": [
    [0, 0, 0],
    [1, 1, 1],
    [1, 1, 1],
  ],
  "diagonal-tl": [
    [1, 1, 0],
    [1, 1, 0],
    [0, 0, 0],
  ],
  "diagonal-tr": [
    [0, 1, 1],
    [0, 1, 1],
    [0, 0, 0],
  ],
  "diagonal-bl": [
    [0, 0, 0],
    [1, 1, 0],
    [1, 1, 0],
  ],
  "diagonal-br": [
    [0, 0, 0],
    [0, 1, 1],
    [0, 1, 1],
  ],
  "ripple-out": [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
  ],
  "ripple-in": [
    [0, 0, 0],
    [0, 1, 0],
    [0, 0, 0],
  ],
  cross: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 1, 0],
  ],
  "x-shape": [
    [1, 0, 1],
    [0, 1, 0],
    [1, 0, 1],
  ],
  diamond: [
    [0, 1, 0],
    [1, 0, 1],
    [0, 1, 0],
  ],
  "stripes-h": [
    [1, 1, 1],
    [0, 0, 0],
    [1, 1, 1],
  ],
  "stripes-v": [
    [1, 0, 1],
    [1, 0, 1],
    [1, 0, 1],
  ],
  checkerboard: [
    [1, 0, 1],
    [0, 1, 0],
    [1, 0, 1],
  ],
  "rows-alt": [
    [1, 1, 1],
    [0, 0, 0],
    [1, 1, 1],
  ],
  "spiral-cw": [
    [1, 1, 1],
    [0, 0, 1],
    [0, 0, 1],
  ],
  "spiral-ccw": [
    [1, 1, 1],
    [1, 0, 0],
    [1, 0, 0],
  ],
  snake: [
    [1, 1, 0],
    [0, 1, 0],
    [0, 0, 0],
  ],
  "snake-rev": [
    [0, 0, 0],
    [0, 1, 0],
    [0, 1, 1],
  ],
  rain: [
    [0, 1, 0],
    [0, 1, 0],
    [0, 0, 0],
  ],
  "rain-rev": [
    [0, 0, 0],
    [0, 1, 0],
    [0, 1, 0],
  ],
  waterfall: [
    [1, 1, 0],
    [0, 0, 0],
    [0, 0, 0],
  ],
  breathing: [
    [0, 0, 0],
    [0, 1, 0],
    [0, 0, 0],
  ],
  heartbeat: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 1, 0],
  ],
  twinkle: [
    [1, 0, 0],
    [0, 0, 1],
    [0, 1, 0],
  ],
  sparkle: [
    [1, 0, 1],
    [0, 1, 0],
    [1, 0, 1],
  ],
  chaos: [
    [1, 0, 1],
    [0, 1, 0],
    [1, 0, 0],
  ],
  "edge-cw": [
    [1, 1, 1],
    [0, 0, 0],
    [0, 0, 0],
  ],
  border: [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
  ],
};

const COLORS: Record<string, string> = {
  white: "#f5f5f4",
  red: "#f87171",
  blue: "#38bdf8",
  green: "#4ade80",
  amber: "#fbbf24",
};

const SIZES: Record<string, number> = {
  sm: 24,
  md: 32,
  lg: 48,
  xl: 64,
};

const SPEEDS: Record<string, number> = {
  slow: 1500,
  normal: 800,
  fast: 400,
};

const resolvePattern = (pattern: PresetPattern | GridMatrix | undefined): GridMatrix => {
  if (!pattern) return PATTERNS["plus-hollow"];
  if (typeof pattern === "string") return PATTERNS[pattern] ?? PATTERNS["plus-hollow"];
  return pattern;
};

const resolveColor = (color: string | undefined): string => {
  if (!color) return COLORS.white;
  return COLORS[color] ?? color;
};

const resolveSize = (size: "sm" | "md" | "lg" | "xl" | number | undefined): number => {
  if (size === undefined) return SIZES.md;
  if (typeof size === "number") return size;
  return SIZES[size] ?? SIZES.md;
};

const GridCell = ({
  active,
  color,
  cellSize,
  animationDelay,
  mode,
  cycleDuration,
  shouldReduceMotion,
  rounded,
}: {
  active: boolean;
  color: string;
  cellSize: number;
  animationDelay: number;
  mode: "sequence" | "stagger";
  cycleDuration: number;
  shouldReduceMotion: boolean | null;
  rounded?: boolean;
}) => {
  const glowSize = cellSize * 0.8;
  const borderRadius = rounded ? "50%" : undefined;

  if (!active) {
    return <div style={{ width: cellSize, height: cellSize }} />;
  }

  if (shouldReduceMotion) {
    return (
      <div
        style={{
          width: cellSize,
          height: cellSize,
          backgroundColor: color,
          borderRadius,
          boxShadow: `0 0 ${glowSize * 0.3}px ${color}, 0 0 ${glowSize * 0.6}px ${color}40, 0 0 ${glowSize * 1.2}px ${color}20`,
        }}
      />
    );
  }

  const staggerAnimation = {
    opacity: [0, 1, 1, 0],
    scale: [0.8, 1, 1, 0.8],
  };

  return (
    <motion.div
      animate={staggerAnimation}
      style={{
        width: cellSize,
        height: cellSize,
        backgroundColor: color,
        borderRadius,
        boxShadow: `0 0 ${glowSize * 0.3}px ${color}, 0 0 ${glowSize * 0.6}px ${color}40, 0 0 ${glowSize * 1.2}px ${color}20`,
      }}
      transition={{
        duration: cycleDuration / 1000,
        repeat: Number.POSITIVE_INFINITY,
        ease: [0.645, 0.045, 0.355, 1],
        delay: mode === "stagger" ? animationDelay : 0,
        times: [0, 0.2, 0.8, 1],
      }}
    />
  );
};

const GridLoader = ({
  pattern,
  mode = "stagger",
  sequence,
  speed = "normal",
  color,
  size,
  blur,
  gap: gapProp,
  rounded,
  static: isStatic,
  className,
}: GridLoaderProps) => {
  const shouldReduceMotion = useReducedMotion();
  const [sequenceIndex, setSequenceIndex] = useState(0);

  const sizeInPx = resolveSize(size);
  const gapSize = gapProp ?? 0;
  const cellSize = (sizeInPx - gapSize * 2) / 3;
  const resolvedColor = resolveColor(color);
  const cycleDuration = SPEEDS[speed] ?? SPEEDS.normal;
  const disableAnimation = isStatic || shouldReduceMotion;

  useEffect(() => {
    if (mode !== "sequence" || !sequence || sequence.length === 0 || disableAnimation) {
      return;
    }

    const interval = setInterval(() => {
      setSequenceIndex((prev) => (prev + 1) % sequence.length);
    }, cycleDuration);

    return () => clearInterval(interval);
  }, [mode, sequence, cycleDuration, disableAnimation]);

  const currentGrid = useMemo(() => {
    if (mode === "sequence" && sequence && sequence.length > 0) {
      return resolvePattern(sequence[sequenceIndex]);
    }
    return resolvePattern(pattern);
  }, [mode, sequence, sequenceIndex, pattern]);

  const cells = currentGrid.flat();

  const staggerDelays = useMemo(() => {
    if (mode !== "stagger") {
      return cells.map(() => 0);
    }

    const activeCells = cells.reduce<number[]>((acc, cell, idx) => {
      if (cell === 1) acc.push(idx);
      return acc;
    }, []);

    const delayPerCell = cycleDuration / 1000 / (activeCells.length + 2);

    return cells.map((cell, idx) => {
      if (cell === 0) return 0;
      const activeIndex = activeCells.indexOf(idx);
      return activeIndex * delayPerCell;
    });
  }, [cells, mode, cycleDuration]);

  const cellKeys = ["tl", "tm", "tr", "ml", "mm", "mr", "bl", "bm", "br"];

  return (
    <output
      aria-label="Loading"
      className={className ? `grid grid-cols-3 ${className}` : "grid grid-cols-3"}
      style={{
        width: sizeInPx,
        height: sizeInPx,
        gap: gapSize,
        filter: blur ? `blur(${blur}px)` : undefined,
      }}
    >
      {cells.map((active, idx) => (
        <GridCell
          key={cellKeys[idx]}
          active={active === 1}
          animationDelay={staggerDelays[idx]}
          cellSize={cellSize}
          color={resolvedColor}
          cycleDuration={cycleDuration}
          mode={mode}
          rounded={rounded}
          shouldReduceMotion={disableAnimation}
        />
      ))}
    </output>
  );
};

export default GridLoader;

export { PATTERNS, COLORS, SIZES };
