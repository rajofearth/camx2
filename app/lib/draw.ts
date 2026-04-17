import { cocoClassName } from "./coco";
import type { Detection, DetectionModel } from "./types";

export interface DrawDetectionsOptions {
  readonly frameW: number;
  readonly frameH: number;
  readonly model: DetectionModel;
}

// Draws detections (masks, boxes, labels) onto a canvas context
export function drawDetections(
  ctx: CanvasRenderingContext2D,
  detections: readonly Detection[],
  options: DrawDetectionsOptions,
): void {
  const { frameW, frameH, model } = options;
  const sx = ctx.canvas.width / frameW;
  const sy = ctx.canvas.height / frameH;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  if (!detections.length) return;

  // Draw masks first for proper stacking
  for (let i = 0; i < detections.length; ++i) {
    drawMask(ctx, detections[i], i);
  }

  // Draw each detection's box and label
  for (let i = 0; i < detections.length; ++i) {
    const det = detections[i];
    const x1 = det.x1 * sx,
      y1 = det.y1 * sy;
    const x2 = det.x2 * sx,
      y2 = det.y2 * sy;
    const style = getDetectionStyle(det, i);

    ctx.strokeStyle = style.strokeCss;
    ctx.lineWidth = 2;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

    ctx.fillStyle = style.labelCss;
    ctx.font = "16px Arial";
    const label = `${cocoClassName(det.class, model)} ${(det.confidence * 100).toFixed(1)}%`;
    const labelMetrics = ctx.measureText(label);
    ctx.fillRect(x1, y1 - 20, labelMetrics.width + 4, 20);

    ctx.fillStyle = "#000";
    ctx.fillText(label, x1 + 2, y1 - 4);
  }
}

// Draw binary mask with edge highlighting (on an offscreen canvas, then draw on main canvas)
function drawMask(
  ctx: CanvasRenderingContext2D,
  detection: Detection,
  index: number,
): void {
  const mask = detection.mask;
  if (!mask) return;

  const { width, height } = mask;
  const bytes = decodeMask(mask.data);
  const style = getDetectionStyle(detection, index);
  const offscreen = document.createElement("canvas");
  offscreen.width = width;
  offscreen.height = height;
  const offscreenCtx = offscreen.getContext("2d");
  if (!offscreenCtx) return;

  const imageData = offscreenCtx.createImageData(width, height);
  const data = imageData.data;

  // Fast in-place decode and edge calculation
  for (let y = 0; y < height; ++y) {
    for (let x = 0; x < width; ++x) {
      if (!readMaskBit(bytes, width, x, y)) continue;
      const isEdge =
        x === 0 ||
        y === 0 ||
        x === width - 1 ||
        y === height - 1 ||
        !readMaskBit(bytes, width, x - 1, y) ||
        !readMaskBit(bytes, width, x + 1, y) ||
        !readMaskBit(bytes, width, x, y - 1) ||
        !readMaskBit(bytes, width, x, y + 1);

      const rgbaIdx = 4 * (y * width + x);
      const color = isEdge ? style.edge : style.fill;
      data[rgbaIdx] = color[0];
      data[rgbaIdx + 1] = color[1];
      data[rgbaIdx + 2] = color[2];
      data[rgbaIdx + 3] = isEdge ? 172 : 92;
    }
  }

  offscreenCtx.putImageData(imageData, 0, 0);

  ctx.save();
  ctx.drawImage(
    offscreen,
    0,
    0,
    width,
    height,
    0,
    0,
    ctx.canvas.width,
    ctx.canvas.height,
  );
  ctx.restore();
}

// Decode base64-encoded binary mask
function decodeMask(encoded: string): Uint8Array {
  const bin = atob(encoded);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; ++i) arr[i] = bin.charCodeAt(i);
  return arr;
}

// Return true if (x, y) is set in the binary mask
function readMaskBit(
  bytes: Uint8Array,
  width: number,
  x: number,
  y: number,
): boolean {
  if (x < 0 || y < 0) return false;
  const idx = y * width + x,
    byteIdx = idx >> 3,
    bitIdx = idx & 7;
  return ((bytes[byteIdx] ?? 0) & (1 << bitIdx)) !== 0;
}

// Get per-detection color styles (hue based on class and index)
function getDetectionStyle(
  detection: Detection,
  index: number,
): {
  readonly fill: readonly [number, number, number];
  readonly edge: readonly [number, number, number];
  readonly strokeCss: string;
  readonly labelCss: string;
} {
  const hue = (detection.class * 53 + index * 29) % 360;
  const fill = hslToRgb(hue, 78, 62);
  const edge = hslToRgb(hue, 82, 45);
  return {
    fill,
    edge,
    strokeCss: rgbToCss(edge),
    labelCss: rgbToCss(fill),
  };
}

// Convert hsl color to rgb array
function hslToRgb(
  hue: number,
  saturation: number,
  lightness: number,
): [number, number, number] {
  const s = saturation / 100,
    l = lightness / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hh = hue / 60,
    x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0,
    g = 0,
    b = 0;
  if (hh < 1) {
    r = c;
    g = x;
  } else if (hh < 2) {
    r = x;
    g = c;
  } else if (hh < 3) {
    g = c;
    b = x;
  } else if (hh < 4) {
    g = x;
    b = c;
  } else if (hh < 5) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const m = l - c / 2;
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

// Convert rgb array to css color string
function rgbToCss(rgb: readonly [number, number, number]): string {
  return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`;
}

// Set canvas size to match video if available
export function syncCanvasSize(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
): void {
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
}
