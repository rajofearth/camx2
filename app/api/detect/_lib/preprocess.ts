import * as ort from "onnxruntime-node";
import sharp from "sharp";
import { BadRequestError, UnsupportedMediaError } from "./errors";

export interface ImageInfo {
  readonly origWidth: number;
  readonly origHeight: number;
  readonly inputWidth: number;
  readonly inputHeight: number;
}

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MODEL_WIDTH = 384;
const MODEL_HEIGHT = 384;
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

// RF-DETR uses ImageNet-style normalization.
const MEAN = [0.485, 0.456, 0.406] as const;
const STD = [0.229, 0.224, 0.225] as const;

export async function preprocess(
  imageBuffer: Buffer,
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

  let resized: Buffer;
  try {
    resized = await sharp(imageBuffer)
      .removeAlpha()
      .resize(MODEL_WIDTH, MODEL_HEIGHT, {
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

  if (resized.length !== MODEL_WIDTH * MODEL_HEIGHT * 3) {
    throw new UnsupportedMediaError(
      `Unexpected preprocessed image size: ${resized.length}`,
      {
        expected: MODEL_WIDTH * MODEL_HEIGHT * 3,
        width: MODEL_WIDTH,
        height: MODEL_HEIGHT,
      },
    );
  }

  // Convert HWC RGB to CHW float32 tensor with ImageNet normalization.
  const floatData = new Float32Array(3 * MODEL_WIDTH * MODEL_HEIGHT);
  const planeSize = MODEL_WIDTH * MODEL_HEIGHT;

  for (let i = 0; i < planeSize; i++) {
    const base = i * 3;
    const r = resized[base];
    const g = resized[base + 1];
    const b = resized[base + 2];

    if (r === undefined || g === undefined || b === undefined) {
      continue;
    }

    floatData[i] = (r / 255 - MEAN[0]) / STD[0];
    floatData[i + planeSize] = (g / 255 - MEAN[1]) / STD[1];
    floatData[i + 2 * planeSize] = (b / 255 - MEAN[2]) / STD[2];
  }

  const tensor = new ort.Tensor("float32", floatData, [
    1,
    3,
    MODEL_HEIGHT,
    MODEL_WIDTH,
  ]);

  return {
    tensor,
    image: {
      origWidth,
      origHeight,
      inputWidth: MODEL_WIDTH,
      inputHeight: MODEL_HEIGHT,
    },
  };
}
