import * as ort from "onnxruntime-node";
import sharp from "sharp";
import type { DetectionModel } from "@/app/lib/types";
import { BadRequestError, UnsupportedMediaError } from "./errors";

export interface ImageInfo {
  readonly origWidth: number;
  readonly origHeight: number;
  readonly inputWidth: number;
  readonly inputHeight: number;
}

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

// For RF-DETR normalization
const MEAN = [0.485, 0.456, 0.406] as const;
const STD = [0.229, 0.224, 0.225] as const;

const MODEL_DIMENSIONS: Record<DetectionModel, { width: number; height: number }> = {
  rfdetr: { width: 312, height: 312 },
  yolo: { width: 640, height: 640 },
};

export async function preprocess(
  imageBuffer: Buffer,
  modelType: DetectionModel,
): Promise<{ tensor: ort.Tensor; image: ImageInfo }> {
  if (!imageBuffer.length) throw new BadRequestError("Empty image buffer");
  if (imageBuffer.length > MAX_IMAGE_SIZE_BYTES)
    throw new BadRequestError(
      `Image too large: ${imageBuffer.length} bytes (max: ${MAX_IMAGE_SIZE_BYTES})`
    );

  // Extract image metadata
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(imageBuffer).metadata();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new UnsupportedMediaError(`Failed to parse image: ${message}`);
  }

  // Validate MIME by format
  if (
    !metadata.format ||
    !ALLOWED_MIME_TYPES.some((mime) => mime.includes(metadata.format))
  ) {
    throw new UnsupportedMediaError(`Unsupported image format: ${metadata.format ?? "unknown"}`);
  }

  const origWidth = metadata.width ?? 0;
  const origHeight = metadata.height ?? 0;
  if (
    origWidth <= 0 ||
    origHeight <= 0 ||
    !Number.isFinite(origWidth) ||
    !Number.isFinite(origHeight)
  ) {
    throw new BadRequestError(`Invalid image dimensions: ${origWidth}x${origHeight}`);
  }

  const { width: modelWidth, height: modelHeight } = MODEL_DIMENSIONS[modelType];

  // Preprocess (resize, remove alpha, get raw RGB data)
  let resized: Buffer;
  try {
    resized = await sharp(imageBuffer)
      .removeAlpha()
      .resize(modelWidth, modelHeight, {
        fit: "fill",
        kernel: sharp.kernel.lanczos3,
      })
      .raw()
      .toBuffer();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new UnsupportedMediaError(`Failed to preprocess image: ${message}`);
  }

  if (resized.length !== modelWidth * modelHeight * 3) {
    throw new UnsupportedMediaError(`Unexpected preprocessed image size: ${resized.length}`, {
      expected: modelWidth * modelHeight * 3,
      width: modelWidth,
      height: modelHeight,
      modelType,
    });
  }

  // Convert from HWC RGB to CHW float32 tensor
  const floatData = new Float32Array(3 * modelWidth * modelHeight);
  const planeSize = modelWidth * modelHeight;
  const rMean = MEAN[0], gMean = MEAN[1], bMean = MEAN[2];
  const rStd = STD[0], gStd = STD[1], bStd = STD[2];

  if (modelType === "rfdetr") {
    for (let i = 0; i < planeSize; ++i) {
      const base = i * 3;
      floatData[i] = (resized[base] / 255 - rMean) / rStd;
      floatData[i + planeSize] = (resized[base + 1] / 255 - gMean) / gStd;
      floatData[i + 2 * planeSize] = (resized[base + 2] / 255 - bMean) / bStd;
    }
  } else {
    for (let i = 0; i < planeSize; ++i) {
      const base = i * 3;
      floatData[i] = resized[base] / 255;
      floatData[i + planeSize] = resized[base + 1] / 255;
      floatData[i + 2 * planeSize] = resized[base + 2] / 255;
    }
  }

  // Result is a [1, 3, H, W] tensor
  const tensor = new ort.Tensor("float32", floatData, [
    1,
    3,
    modelHeight,
    modelWidth,
  ]);
  return {
    tensor,
    image: {
      origWidth,
      origHeight,
      inputWidth: modelWidth,
      inputHeight: modelHeight,
    },
  };
}
