import type * as ort from "onnxruntime-node";
import type { Detection, DetectionMask } from "@/app/lib/types";
import { InferenceError } from "./errors";
import type { ImageInfo } from "./preprocess";

const RF_DETR_CONFIDENCE_THRESHOLD = 0.5;
const YOLO_CONFIDENCE_THRESHOLD = 0.25;
const YOLO_NMS_IOU_THRESHOLD = 0.45;
const MAX_DETECTIONS = 100;
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
  if (masks) {
    return postprocessRfDetrSegmentation(predBoxes, logits, masks, imageInfo);
  }

  return postprocessRfDetrDetection(predBoxes, logits, imageInfo);
}

function postprocessRfDetrDetection(
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

    for (let classIndex = 0; classIndex < numClasses; classIndex++) {
      const probability = probabilities[classIndex] ?? 0;
      if (probability > maxConfidence) {
        maxConfidence = probability;
        maxClass = classIndex;
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

    const detection: Detection = {
      x1,
      y1,
      x2,
      y2,
      confidence: maxConfidence,
      class: maxClass,
    };

    detections.push(detection);
  }

  detections.sort((a, b) => b.confidence - a.confidence);
  return detections.slice(0, MAX_DETECTIONS);
}

function postprocessRfDetrSegmentation(
  predBoxes: ort.Tensor,
  logits: ort.Tensor,
  masks: ort.Tensor,
  imageInfo: ImageInfo,
): Detection[] {
  const boxShape = validateShape(predBoxes.dims, 3, "pred_boxes");
  const logitShape = validateShape(logits.dims, 3, "logits");
  const maskShape = validateShape(masks.dims, 4, "masks");

  const batchSizeBoxes = Number(boxShape[0]);
  const numQueriesBoxes = Number(boxShape[1]);
  const boxWidth = Number(boxShape[2]);
  const batchSizeLogits = Number(logitShape[0]);
  const numQueriesLogits = Number(logitShape[1]);
  const numClasses = Number(logitShape[2]);
  const batchSizeMasks = Number(maskShape[0]);
  const numQueriesMasks = Number(maskShape[1]);
  const maskHeight = Number(maskShape[2]);
  const maskWidth = Number(maskShape[3]);

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
    !Number.isFinite(batchSizeMasks) ||
    !Number.isFinite(numQueriesMasks) ||
    !Number.isFinite(maskHeight) ||
    !Number.isFinite(maskWidth) ||
    batchSizeMasks < 1 ||
    numQueriesMasks < 1 ||
    maskHeight < 1 ||
    maskWidth < 1
  ) {
    throw new InferenceError(
      `Unexpected masks shape: ${JSON.stringify(masks.dims)}`,
    );
  }

  if (
    batchSizeBoxes !== batchSizeLogits ||
    batchSizeBoxes !== batchSizeMasks ||
    numQueriesBoxes !== numQueriesLogits ||
    numQueriesBoxes !== numQueriesMasks
  ) {
    throw new InferenceError(
      `Mismatched RF-DETR segmentation output shapes: pred_boxes=${JSON.stringify(
        predBoxes.dims,
      )}, logits=${JSON.stringify(logits.dims)}, masks=${JSON.stringify(
        masks.dims,
      )}`,
    );
  }

  const boxData = getTensorData(predBoxes, "pred_boxes");
  const logitData = getTensorData(logits, "logits");
  const maskData = getTensorData(masks, "masks");
  const batchIndex = 0;
  const queryScores = new Array<number>(numQueriesBoxes);
  const queryLabels = new Array<number>(numQueriesBoxes);
  const sortedIndices = Array.from(
    { length: numQueriesBoxes },
    (_, index) => index,
  );

  for (let queryIndex = 0; queryIndex < numQueriesBoxes; queryIndex++) {
    const logitOffset =
      (batchIndex * numQueriesBoxes + queryIndex) * numClasses;
    let maxConfidence = -Infinity;
    let maxClass = 0;

    for (let classIndex = 0; classIndex < numClasses; classIndex++) {
      const confidence = sigmoid(
        Number(logitData[logitOffset + classIndex] ?? 0),
      );
      if (confidence > maxConfidence) {
        maxConfidence = confidence;
        maxClass = classIndex;
      }
    }

    queryScores[queryIndex] = maxConfidence;
    queryLabels[queryIndex] = maxClass;
  }

  sortedIndices.sort(
    (leftIndex, rightIndex) =>
      (queryScores[rightIndex] ?? 0) - (queryScores[leftIndex] ?? 0),
  );

  const detections: Detection[] = [];

  for (const queryIndex of sortedIndices.slice(0, MAX_DETECTIONS)) {
    const confidence = queryScores[queryIndex] ?? 0;
    if (
      !Number.isFinite(confidence) ||
      confidence < RF_DETR_CONFIDENCE_THRESHOLD
    ) {
      continue;
    }

    const boxOffset = (batchIndex * numQueriesBoxes + queryIndex) * 4;
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

    const mask = resizeAndPackMask(
      maskData,
      batchIndex,
      queryIndex,
      numQueriesBoxes,
      maskWidth,
      maskHeight,
      imageInfo.origWidth,
      imageInfo.origHeight,
    );

    detections.push({
      x1,
      y1,
      x2,
      y2,
      confidence,
      class: queryLabels[queryIndex] ?? 0,
      ...(mask ? { mask } : {}),
    });
  }

  return detections;
}

function resizeAndPackMask(
  maskData: Float32Array | Float64Array | Int32Array | Uint8Array,
  batchIndex: number,
  queryIndex: number,
  numQueries: number,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): DetectionMask | undefined {
  const sourcePlaneSize = sourceWidth * sourceHeight;
  const offset = (batchIndex * numQueries + queryIndex) * sourcePlaneSize;

  if (offset + sourcePlaneSize > maskData.length) {
    return undefined;
  }

  const packed = new Uint8Array(Math.ceil((targetWidth * targetHeight) / 8));
  let hasForeground = false;

  for (let targetY = 0; targetY < targetHeight; targetY++) {
    const sourceY =
      targetHeight === 1
        ? 0
        : (targetY * (sourceHeight - 1)) / (targetHeight - 1);
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(y0 + 1, sourceHeight - 1);
    const yLerp = sourceY - y0;

    for (let targetX = 0; targetX < targetWidth; targetX++) {
      const sourceX =
        targetWidth === 1
          ? 0
          : (targetX * (sourceWidth - 1)) / (targetWidth - 1);
      const x0 = Math.floor(sourceX);
      const x1 = Math.min(x0 + 1, sourceWidth - 1);
      const xLerp = sourceX - x0;

      const topLeft = Number(maskData[offset + y0 * sourceWidth + x0] ?? 0);
      const topRight = Number(maskData[offset + y0 * sourceWidth + x1] ?? 0);
      const bottomLeft = Number(maskData[offset + y1 * sourceWidth + x0] ?? 0);
      const bottomRight = Number(maskData[offset + y1 * sourceWidth + x1] ?? 0);

      const top = topLeft + (topRight - topLeft) * xLerp;
      const bottom = bottomLeft + (bottomRight - bottomLeft) * xLerp;
      const interpolated = top + (bottom - top) * yLerp;

      if (interpolated > 0) {
        const pixelIndex = targetY * targetWidth + targetX;
        const byteIndex = pixelIndex >> 3;
        const bitIndex = pixelIndex & 7;
        packed[byteIndex] = packed[byteIndex] | (1 << bitIndex);
        hasForeground = true;
      }
    }
  }

  if (!hasForeground) {
    return undefined;
  }

  return {
    width: targetWidth,
    height: targetHeight,
    data: Buffer.from(packed).toString("base64"),
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
