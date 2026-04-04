import type * as ort from "onnxruntime-node";
import type { Detection } from "@/app/lib/types";
import { InferenceError } from "./errors";
import type { ImageInfo } from "./preprocess";

const CONFIDENCE_THRESHOLD = 0.5;
const MAX_DETECTIONS = 100;
const NUM_OUTPUT_CLASSES = 91;
const BACKGROUND_CLASS_INDEX = NUM_OUTPUT_CLASSES - 1;

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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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

export function postprocess(
  predBoxes: ort.Tensor,
  logits: ort.Tensor,
  imageInfo: ImageInfo,
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

  const batchIndex = 0;
  const detections: Detection[] = [];
  const effectiveClassCount =
    numClasses === NUM_OUTPUT_CLASSES ? BACKGROUND_CLASS_INDEX : numClasses;

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

    const probabilities = softmax(row);

    let maxConfidence = -Infinity;
    let maxClass = 0;

    for (let classIndex = 0; classIndex < effectiveClassCount; classIndex++) {
      const probability = probabilities[classIndex] ?? 0;
      if (probability > maxConfidence) {
        maxConfidence = probability;
        maxClass = classIndex;
      }
    }

    if (
      !Number.isFinite(maxConfidence) ||
      maxConfidence < CONFIDENCE_THRESHOLD
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

    detections.push({
      x1,
      y1,
      x2,
      y2,
      confidence: maxConfidence,
      class: maxClass,
    });
  }

  detections.sort((a, b) => b.confidence - a.confidence);
  return detections.slice(0, MAX_DETECTIONS);
}
