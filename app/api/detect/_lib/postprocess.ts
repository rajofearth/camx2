import type * as ort from "onnxruntime-node";
import type { Detection, DetectionMask } from "@/app/lib/types";
import { InferenceError } from "./errors";
import type { ImageInfo } from "./preprocess";

const RF_DETR_CONFIDENCE_THRESHOLD = 0.5;
const YOLO_CONFIDENCE_THRESHOLD = 0.25;
const YOLO_NMS_IOU_THRESHOLD = 0.45;
const MAX_DETECTIONS = 100;
const NUM_RF_DETR_OUTPUT_CLASSES = 91;
const RF_DETR_BACKGROUND_CLASS_INDEX = NUM_RF_DETR_OUTPUT_CLASSES - 1;

function softmax(logits: readonly number[]): number[] {
  if (logits.length === 0) return [];

  let maxLogit = -Infinity;
  for (const value of logits) {
    if (value > maxLogit) maxLogit = value;
  }

  const exps = new Array<number>(logits.length);
  let sum = 0;

  for (let i = 0; i < logits.length; i++) {
    const exp = Math.exp(logits[i] - maxLogit);
    exps[i] = exp;
    sum += exp;
  }

  if (sum === 0 || !Number.isFinite(sum)) {
    return new Array<number>(logits.length).fill(0);
  }

  for (let i = 0; i < exps.length; i++) {
    exps[i] = exps[i] / sum;
  }

  return exps;
}

function argmaxSigmoid(logits: readonly number[]): {
  readonly confidence: number;
  readonly classIndex: number;
} {
  let maxConfidence = -Infinity;
  let maxClass = 0;

  for (let classIndex = 0; classIndex < logits.length; classIndex++) {
    const confidence = sigmoid(logits[classIndex] ?? 0);
    if (confidence > maxConfidence) {
      maxConfidence = confidence;
      maxClass = classIndex;
    }
  }

  return { confidence: maxConfidence, classIndex: maxClass };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sigmoid(value: number): number {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }

  const z = Math.exp(value);
  return z / (1 + z);
}

function getTensorData(
  tensor: ort.Tensor,
  expectedName: string,
): Float32Array | Float64Array | Int32Array | Uint8Array {
  const data = tensor.data;

  if (
    data instanceof Float32Array ||
    data instanceof Float64Array ||
    data instanceof Int32Array ||
    data instanceof Uint8Array
  ) {
    return data;
  }

  throw new InferenceError(
    `Unsupported tensor data type for '${expectedName}'`,
  );
}

function validateShape(
  shape: readonly (number | string)[] | undefined,
  expectedRank: number,
  tensorName: string,
): readonly (number | string)[] {
  if (!Array.isArray(shape) || shape.length !== expectedRank) {
    throw new InferenceError(
      `Invalid ${tensorName} tensor shape: ${JSON.stringify(shape)}`,
    );
  }
  return shape;
}

export function postprocessRfDetr(
  predBoxes: ort.Tensor,
  logits: ort.Tensor,
  imageInfo: ImageInfo,
  masks?: ort.Tensor,
): Detection[] {
  const boxShape = validateShape(predBoxes.dims, 3, "pred_boxes");
  const logitShape = validateShape(logits.dims, 3, "logits");

  const batchSizeBoxes = Number(boxShape[0]);
  const numQueriesBoxes = Number(boxShape[1]);
  const boxWidth = Number(boxShape[2]);

  const batchSizeLogits = Number(logitShape[0]);
  const numQueriesLogits = Number(logitShape[1]);
  const numClasses = Number(logitShape[2]);

  if (
    !Number.isFinite(batchSizeBoxes) ||
    !Number.isFinite(numQueriesBoxes) ||
    !Number.isFinite(boxWidth) ||
    batchSizeBoxes < 1 ||
    numQueriesBoxes < 1 ||
    boxWidth !== 4
  ) {
    throw new InferenceError(
      `Unexpected pred_boxes shape: ${JSON.stringify(predBoxes.dims)}`,
    );
  }

  if (
    !Number.isFinite(batchSizeLogits) ||
    !Number.isFinite(numQueriesLogits) ||
    !Number.isFinite(numClasses) ||
    batchSizeLogits < 1 ||
    numQueriesLogits < 1 ||
    numClasses < 2
  ) {
    throw new InferenceError(
      `Unexpected logits shape: ${JSON.stringify(logits.dims)}`,
    );
  }

  if (
    batchSizeBoxes !== batchSizeLogits ||
    numQueriesBoxes !== numQueriesLogits
  ) {
    throw new InferenceError(
      `Mismatched RF-DETR output shapes: pred_boxes=${JSON.stringify(
        predBoxes.dims,
      )}, logits=${JSON.stringify(logits.dims)}`,
    );
  }

  const boxData = getTensorData(predBoxes, "pred_boxes");
  const logitData = getTensorData(logits, "logits");
  let maskData:
    | Float32Array
    | Float64Array
    | Int32Array
    | Uint8Array
    | undefined;
  let maskHeight = 0;
  let maskWidth = 0;

  if (masks) {
    const maskShape = validateShape(masks.dims, 4, "masks");
    const batchSizeMasks = Number(maskShape[0]);
    const numQueriesMasks = Number(maskShape[1]);
    maskHeight = Number(maskShape[2]);
    maskWidth = Number(maskShape[3]);

    if (
      !Number.isFinite(batchSizeMasks) ||
      !Number.isFinite(numQueriesMasks) ||
      !Number.isFinite(maskHeight) ||
      !Number.isFinite(maskWidth) ||
      batchSizeMasks < 1 ||
      numQueriesMasks !== numQueriesBoxes ||
      maskHeight < 1 ||
      maskWidth < 1
    ) {
      throw new InferenceError(
        `Unexpected masks shape: ${JSON.stringify(masks.dims)}`,
      );
    }

    maskData = getTensorData(masks, "masks");
  }

  const batchIndex = 0;
  const detections: Detection[] = [];
  const effectiveClassCount =
    numClasses === NUM_RF_DETR_OUTPUT_CLASSES
      ? RF_DETR_BACKGROUND_CLASS_INDEX
      : numClasses;
  const useSigmoidScoring = Boolean(maskData);

  for (let queryIndex = 0; queryIndex < numQueriesBoxes; queryIndex++) {
    const boxOffset = (batchIndex * numQueriesBoxes + queryIndex) * 4;
    const logitOffset =
      (batchIndex * numQueriesBoxes + queryIndex) * numClasses;

    if (
      boxOffset + 3 >= boxData.length ||
      logitOffset + numClasses - 1 >= logitData.length
    ) {
      break;
    }

    const cx = Number(boxData[boxOffset]);
    const cy = Number(boxData[boxOffset + 1]);
    const width = Number(boxData[boxOffset + 2]);
    const height = Number(boxData[boxOffset + 3]);

    if (
      !Number.isFinite(cx) ||
      !Number.isFinite(cy) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height)
    ) {
      continue;
    }

    const row = new Array<number>(numClasses);
    for (let classIndex = 0; classIndex < numClasses; classIndex++) {
      row[classIndex] = Number(logitData[logitOffset + classIndex] ?? 0);
    }

    let maxConfidence = -Infinity;
    let maxClass = 0;

    if (useSigmoidScoring) {
      const result = argmaxSigmoid(row.slice(0, effectiveClassCount));
      maxConfidence = result.confidence;
      maxClass = result.classIndex;
    } else {
      const probabilities = softmax(row);

      for (let classIndex = 0; classIndex < effectiveClassCount; classIndex++) {
        const probability = probabilities[classIndex] ?? 0;
        if (probability > maxConfidence) {
          maxConfidence = probability;
          maxClass = classIndex;
        }
      }
    }

    if (
      !Number.isFinite(maxConfidence) ||
      maxConfidence < RF_DETR_CONFIDENCE_THRESHOLD
    ) {
      continue;
    }

    const x1 = clamp(
      (cx - width / 2) * imageInfo.origWidth,
      0,
      imageInfo.origWidth,
    );
    const y1 = clamp(
      (cy - height / 2) * imageInfo.origHeight,
      0,
      imageInfo.origHeight,
    );
    const x2 = clamp(
      (cx + width / 2) * imageInfo.origWidth,
      0,
      imageInfo.origWidth,
    );
    const y2 = clamp(
      (cy + height / 2) * imageInfo.origHeight,
      0,
      imageInfo.origHeight,
    );

    if (x2 <= x1 || y2 <= y1) {
      continue;
    }

    const mask = maskData
      ? compressMask(
          maskData,
          batchIndex,
          queryIndex,
          numQueriesBoxes,
          maskWidth,
          maskHeight,
        )
      : undefined;

    const detection: Detection = {
      x1,
      y1,
      x2,
      y2,
      confidence: maxConfidence,
      class: maxClass,
      ...(mask ? { mask } : {}),
    };

    detections.push(detection);
  }

  detections.sort((a, b) => b.confidence - a.confidence);
  return detections.slice(0, MAX_DETECTIONS);
}

function compressMask(
  maskData: Float32Array | Float64Array | Int32Array | Uint8Array,
  batchIndex: number,
  queryIndex: number,
  numQueries: number,
  width: number,
  height: number,
): DetectionMask | undefined {
  const planeSize = width * height;
  const offset = (batchIndex * numQueries + queryIndex) * planeSize;
  const LOGIT_CLIP = 8;

  if (offset + planeSize > maskData.length) {
    return undefined;
  }

  const quantized = new Uint8Array(planeSize);
  let hasPositiveLogit = false;

  for (let pixelIndex = 0; pixelIndex < planeSize; pixelIndex++) {
    const rawValue = Number(maskData[offset + pixelIndex] ?? 0);
    const clippedValue = clamp(rawValue, -LOGIT_CLIP, LOGIT_CLIP);
    const quantizedValue = Math.round(
      ((clippedValue + LOGIT_CLIP) / (LOGIT_CLIP * 2)) * 255,
    );
    quantized[pixelIndex] = quantizedValue;
    if (rawValue > 0) {
      hasPositiveLogit = true;
    }
  }

  if (!hasPositiveLogit) {
    return undefined;
  }

  return {
    width,
    height,
    data: Buffer.from(quantized).toString("base64"),
  };
}

function intersectionOverUnion(a: Detection, b: Detection): number {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);

  const intersectionWidth = Math.max(0, x2 - x1);
  const intersectionHeight = Math.max(0, y2 - y1);
  const intersectionArea = intersectionWidth * intersectionHeight;

  if (intersectionArea <= 0) {
    return 0;
  }

  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  const unionArea = areaA + areaB - intersectionArea;

  if (unionArea <= 0) {
    return 0;
  }

  return intersectionArea / unionArea;
}

function applyClassAwareNms(
  detections: readonly Detection[],
  iouThreshold: number,
): Detection[] {
  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
  const kept: Detection[] = [];

  for (const candidate of sorted) {
    const overlapsKeptDetection = kept.some(
      (existing) =>
        existing.class === candidate.class &&
        intersectionOverUnion(existing, candidate) > iouThreshold,
    );

    if (!overlapsKeptDetection) {
      kept.push(candidate);
    }

    if (kept.length >= MAX_DETECTIONS) {
      break;
    }
  }

  return kept;
}

export function postprocessYolo(
  output: ort.Tensor,
  imageInfo: ImageInfo,
): Detection[] {
  const outputShape = validateShape(output.dims, 3, "output0");
  const batchSize = Number(outputShape[0]);
  const channelCount = Number(outputShape[1]);
  const anchorCount = Number(outputShape[2]);

  if (
    !Number.isFinite(batchSize) ||
    !Number.isFinite(channelCount) ||
    !Number.isFinite(anchorCount) ||
    batchSize < 1 ||
    channelCount < 5 ||
    anchorCount < 1
  ) {
    throw new InferenceError(
      `Unexpected YOLO output shape: ${JSON.stringify(output.dims)}`,
    );
  }

  const classCount = channelCount - 4;
  const outputData = getTensorData(output, "output0");
  const xScale = imageInfo.origWidth / imageInfo.inputWidth;
  const yScale = imageInfo.origHeight / imageInfo.inputHeight;
  const detections: Detection[] = [];

  for (let anchorIndex = 0; anchorIndex < anchorCount; anchorIndex++) {
    let maxConfidence = -Infinity;
    let maxClass = 0;

    for (let classIndex = 0; classIndex < classCount; classIndex++) {
      const scoreIndex = (classIndex + 4) * anchorCount + anchorIndex;
      const score = Number(outputData[scoreIndex] ?? 0);
      if (score > maxConfidence) {
        maxConfidence = score;
        maxClass = classIndex;
      }
    }

    if (
      !Number.isFinite(maxConfidence) ||
      maxConfidence < YOLO_CONFIDENCE_THRESHOLD
    ) {
      continue;
    }

    const cx = Number(outputData[anchorIndex]);
    const cy = Number(outputData[anchorCount + anchorIndex]);
    const width = Number(outputData[2 * anchorCount + anchorIndex]);
    const height = Number(outputData[3 * anchorCount + anchorIndex]);

    if (
      !Number.isFinite(cx) ||
      !Number.isFinite(cy) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height)
    ) {
      continue;
    }

    const x1 = clamp((cx - width / 2) * xScale, 0, imageInfo.origWidth);
    const y1 = clamp((cy - height / 2) * yScale, 0, imageInfo.origHeight);
    const x2 = clamp((cx + width / 2) * xScale, 0, imageInfo.origWidth);
    const y2 = clamp((cy + height / 2) * yScale, 0, imageInfo.origHeight);

    if (x2 <= x1 || y2 <= y1) {
      continue;
    }

    detections.push({
      x1,
      y1,
      x2,
      y2,
      confidence: maxConfidence,
      class: maxClass,
    });
  }

  return applyClassAwareNms(detections, YOLO_NMS_IOU_THRESHOLD);
}
