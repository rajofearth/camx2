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

  for (const det of detections) {
    drawMask(ctx, det, frameW, frameH);
  }

  for (const det of detections) {
    const x1 = det.x1 * sx;
    const y1 = det.y1 * sy;
    const x2 = det.x2 * sx;
    const y2 = det.y2 * sy;
    const width = x2 - x1;
    const height = y2 - y1;

    // Draw box
    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth = 2;
    ctx.strokeRect(x1, y1, width, height);

    // Draw label background
    ctx.fillStyle = "#00ff00";
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
  frameW: number,
  frameH: number,
): void {
  const { mask } = detection;
  if (!mask) {
    return;
  }

  const bytes = decodeMask(mask.data);
  const offscreen = document.createElement("canvas");
  offscreen.width = mask.width;
  offscreen.height = mask.height;
  const offscreenCtx = offscreen.getContext("2d");

  if (!offscreenCtx) {
    return;
  }

  const imageData = offscreenCtx.createImageData(mask.width, mask.height);
  const pixelCount = mask.width * mask.height;

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex++) {
    const byteIndex = pixelIndex >> 3;
    const bitIndex = pixelIndex & 7;
    const isForeground = ((bytes[byteIndex] ?? 0) & (1 << bitIndex)) !== 0;

    if (!isForeground) {
      continue;
    }

    const rgbaIndex = pixelIndex * 4;
    imageData.data[rgbaIndex] = 0;
    imageData.data[rgbaIndex + 1] = 255;
    imageData.data[rgbaIndex + 2] = 0;
    imageData.data[rgbaIndex + 3] = 76;
  }

  offscreenCtx.putImageData(imageData, 0, 0);
  const sx = ctx.canvas.width / frameW;
  const sy = ctx.canvas.height / frameH;
  const destX = detection.x1 * sx;
  const destY = detection.y1 * sy;
  const destWidth = Math.max(1, (detection.x2 - detection.x1) * sx);
  const destHeight = Math.max(1, (detection.y2 - detection.y1) * sy);
  const scaledMask = document.createElement("canvas");
  scaledMask.width = Math.max(1, Math.round(destWidth));
  scaledMask.height = Math.max(1, Math.round(destHeight));
  const scaledCtx = scaledMask.getContext("2d");

  if (!scaledCtx) {
    return;
  }

  scaledCtx.imageSmoothingEnabled = true;
  scaledCtx.imageSmoothingQuality = "high";
  scaledCtx.drawImage(offscreen, 0, 0, scaledMask.width, scaledMask.height);

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.globalAlpha = 0.7;
  ctx.drawImage(
    scaledMask,
    0,
    0,
    scaledMask.width,
    scaledMask.height,
    destX,
    destY,
    destWidth,
    destHeight,
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

export function syncCanvasSize(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
): void {
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
}
