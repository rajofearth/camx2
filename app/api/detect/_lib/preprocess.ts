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

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

// RF-DETR uses ImageNet-style normalization.
const MEAN = [0.485, 0.456, 0.406] as const;
const STD = [0.229, 0.224, 0.225] as const;

const MODEL_DIMENSIONS: Record<
  DetectionModel,
  { readonly width: number; readonly height: number }
> = {
  rfdetr: { width: 312, height: 312 },
  yolo: { width: 640, height: 640 },
};

export async function preprocess(
  imageBuffer: Buffer,
  modelType: DetectionModel,
): Promise<{ tensor: ort.Tensor; image: ImageInfo }> {
  if (imageBuffer.length === 0) {
    throw new BadRequestError("Empty image buffer");
  }

  if (imageBuffer.length > MAX_IMAGE_SIZE_BYTES) {
    throw new BadRequestError(
      `Image too large: ${imageBuffer.length} bytes (max: ${MAX_IMAGE_SIZE_BYTES})`,
    );
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(imageBuffer).metadata();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new UnsupportedMediaError(
      `Failed to parse image: ${message}`,
      undefined,
    );
  }

  if (
    !metadata.format ||
    !ALLOWED_MIME_TYPES.some((mime) => mime.includes(metadata.format ?? ""))
  ) {
    throw new UnsupportedMediaError(
      `Unsupported image format: ${metadata.format ?? "unknown"}`,
      undefined,
    );
  }

  const origWidth = metadata.width ?? 0;
  const origHeight = metadata.height ?? 0;

  if (
    origWidth <= 0 ||
    origHeight <= 0 ||
    !Number.isFinite(origWidth) ||
    !Number.isFinite(origHeight)
  ) {
    throw new BadRequestError(
      `Invalid image dimensions: ${origWidth}x${origHeight}`,
    );
  }

  const { width: modelWidth, height: modelHeight } =
    MODEL_DIMENSIONS[modelType];

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
    throw new UnsupportedMediaError(
      `Failed to preprocess image: ${message}`,
      undefined,
    );
  }

  if (resized.length !== modelWidth * modelHeight * 3) {
    throw new UnsupportedMediaError(
      `Unexpected preprocessed image size: ${resized.length}`,
      {
        expected: modelWidth * modelHeight * 3,
        width: modelWidth,
        height: modelHeight,
        modelType,
      },
    );
  }

  // Convert HWC RGB to CHW float32 tensor.
  const floatData = new Float32Array(3 * modelWidth * modelHeight);
  const planeSize = modelWidth * modelHeight;

  for (let i = 0; i < planeSize; i++) {
    const base = i * 3;
    const r = resized[base];
    const g = resized[base + 1];
    const b = resized[base + 2];

    if (r === undefined || g === undefined || b === undefined) {
      continue;
    }

    if (modelType === "rfdetr") {
      floatData[i] = (r / 255 - MEAN[0]) / STD[0];
      floatData[i + planeSize] = (g / 255 - MEAN[1]) / STD[1];
      floatData[i + 2 * planeSize] = (b / 255 - MEAN[2]) / STD[2];
    } else {
      floatData[i] = r / 255;
      floatData[i + planeSize] = g / 255;
      floatData[i + 2 * planeSize] = b / 255;
    }
  }

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
