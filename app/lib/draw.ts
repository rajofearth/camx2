import { cocoClassName } from "./coco";
import type { Detection, DetectionMask, DetectionModel } from "./types";

export interface DrawDetectionsOptions {
  readonly frameW: number;
  readonly frameH: number;
  readonly model: DetectionModel;
}

export function drawDetections(
  ctx: CanvasRenderingContext2D,
  detections: readonly Detection[],
  options: DrawDetectionsOptions,
): void {
  const { frameW, frameH, model } = options;
  const sx = ctx.canvas.width / frameW;
  const sy = ctx.canvas.height / frameH;

  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  if (detections.length === 0) {
    return;
  }

  for (const [index, det] of detections.entries()) {
    drawMask(ctx, det, frameW, frameH, index);
  }

  for (const [index, det] of detections.entries()) {
    const x1 = det.x1 * sx;
    const y1 = det.y1 * sy;
    const x2 = det.x2 * sx;
    const y2 = det.y2 * sy;
    const width = x2 - x1;
    const height = y2 - y1;
    const style = getDetectionStyle(det, index);

    // Draw box
    ctx.strokeStyle = style.strokeCss;
    ctx.lineWidth = 2;
    ctx.strokeRect(x1, y1, width, height);

    // Draw label background
    ctx.fillStyle = style.labelCss;
    ctx.font = "16px Arial";
    const label = `${cocoClassName(det.class, model)} ${(det.confidence * 100).toFixed(1)}%`;
    const textMetrics = ctx.measureText(label);
    const labelHeight = 20;
    ctx.fillRect(x1, y1 - labelHeight, textMetrics.width + 4, labelHeight);

    // Draw label text
    ctx.fillStyle = "#000000";
    ctx.fillText(label, x1 + 2, y1 - 4);
  }
}

function drawMask(
  ctx: CanvasRenderingContext2D,
  detection: Detection,
  _frameW: number,
  _frameH: number,
  index: number,
): void {
  const { mask } = detection;
  if (!mask) {
    return;
  }

  const bytes = decodeMask(mask.data);
  const style = getDetectionStyle(detection, index);
  const offscreen = document.createElement("canvas");
  offscreen.width = mask.width;
  offscreen.height = mask.height;
  const offscreenCtx = offscreen.getContext("2d");

  if (!offscreenCtx) {
    return;
  }

  const imageData = offscreenCtx.createImageData(mask.width, mask.height);
  const pixelCount = mask.width * mask.height;
  const width = mask.width;
  const height = mask.height;

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex++) {
    const byteIndex = pixelIndex >> 3;
    const bitIndex = pixelIndex & 7;
    const isForeground = ((bytes[byteIndex] ?? 0) & (1 << bitIndex)) !== 0;
    if (!isForeground) {
      continue;
    }

    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    const isEdge =
      x === 0 ||
      y === 0 ||
      x === width - 1 ||
      y === height - 1 ||
      !readMaskBit(bytes, width, x - 1, y) ||
      !readMaskBit(bytes, width, x + 1, y) ||
      !readMaskBit(bytes, width, x, y - 1) ||
      !readMaskBit(bytes, width, x, y + 1);
    const rgbaIndex = pixelIndex * 4;
    imageData.data[rgbaIndex] = isEdge ? style.edge[0] : style.fill[0];
    imageData.data[rgbaIndex + 1] = isEdge ? style.edge[1] : style.fill[1];
    imageData.data[rgbaIndex + 2] = isEdge ? style.edge[2] : style.fill[2];
    imageData.data[rgbaIndex + 3] = isEdge ? 172 : 92;
  }

  offscreenCtx.putImageData(imageData, 0, 0);
  ctx.save();
  ctx.drawImage(
    offscreen,
    0,
    0,
    mask.width,
    mask.height,
    0,
    0,
    ctx.canvas.width,
    ctx.canvas.height,
  );
  ctx.restore();
}

function decodeMask(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function readMaskBit(
  bytes: Uint8Array,
  width: number,
  x: number,
  y: number,
): boolean {
  if (x < 0 || y < 0) {
    return false;
  }

  const pixelIndex = y * width + x;
  const byteIndex = pixelIndex >> 3;
  const bitIndex = pixelIndex & 7;
  return ((bytes[byteIndex] ?? 0) & (1 << bitIndex)) !== 0;
}

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

function hslToRgb(
  hue: number,
  saturation: number,
  lightness: number,
): [number, number, number] {
  const s = saturation / 100;
  const l = lightness / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hh = hue / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));

  let r = 0;
  let g = 0;
  let b = 0;

  if (hh >= 0 && hh < 1) {
    r = c;
    g = x;
  } else if (hh >= 1 && hh < 2) {
    r = x;
    g = c;
  } else if (hh >= 2 && hh < 3) {
    g = c;
    b = x;
  } else if (hh >= 3 && hh < 4) {
    g = x;
    b = c;
  } else if (hh >= 4 && hh < 5) {
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

function rgbToCss(rgb: readonly [number, number, number]): string {
  return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`;
}

export function syncCanvasSize(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
): void {
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
}
