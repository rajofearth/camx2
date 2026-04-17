import type * as ort from "onnxruntime-node";
import type { Detection, DetectionMask } from "@/app/lib/types";
import { InferenceError } from "./errors";
import type { ImageInfo } from "./preprocess";

const RF_DETR_CONFIDENCE_THRESHOLD = 0.5;
const YOLO_CONFIDENCE_THRESHOLD = 0.25;
const YOLO_NMS_IOU_THRESHOLD = 0.45;
const MAX_DETECTIONS = 100;

// Numerically stable softmax
function softmax(logits: readonly number[]): number[] {
  if (!logits.length) return [];
  const maxLogit = Math.max(...logits);
  let sum = 0;
  const exps = logits.map((x) => {
    const v = Math.exp(x - maxLogit);
    sum += v;
    return v;
  });
  return !sum || !Number.isFinite(sum)
    ? new Array(logits.length).fill(0)
    : exps.map((e) => e / sum);
}

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

const sigmoid = (v: number) =>
  v >= 0 ? 1 / (1 + Math.exp(-v)) : Math.exp(v) / (1 + Math.exp(v));

// Only handles float32/float64/int32/uint8, as expected from onnxruntime-node
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

// Ensure tensor shape is as expected before further processing
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
  return masks
    ? postprocessRfDetrSegmentation(predBoxes, logits, masks, imageInfo)
    : postprocessRfDetrDetection(predBoxes, logits, imageInfo);
}

function postprocessRfDetrDetection(
  predBoxes: ort.Tensor,
  logits: ort.Tensor,
  imageInfo: ImageInfo,
): Detection[] {
  const boxShape = validateShape(predBoxes.dims, 3, "pred_boxes");
  const logitShape = validateShape(logits.dims, 3, "logits");

  const batchSizeBoxes = +boxShape[0];
  const numQueriesBoxes = +boxShape[1];
  const boxWidth = +boxShape[2];
  const batchSizeLogits = +logitShape[0];
  const numQueriesLogits = +logitShape[1];
  const numClasses = +logitShape[2];

  if (
    batchSizeBoxes !== batchSizeLogits ||
    numQueriesBoxes !== numQueriesLogits ||
    !Number.isFinite(batchSizeBoxes) ||
    !Number.isFinite(numQueriesBoxes) ||
    !Number.isFinite(boxWidth) ||
    !Number.isFinite(batchSizeLogits) ||
    !Number.isFinite(numQueriesLogits) ||
    !Number.isFinite(numClasses) ||
    batchSizeBoxes < 1 ||
    numQueriesBoxes < 1 ||
    boxWidth !== 4 ||
    batchSizeLogits < 1 ||
    numQueriesLogits < 1 ||
    numClasses < 2
  ) {
    throw new InferenceError(
      `Unexpected pred_boxes/logits shape: ${JSON.stringify(predBoxes.dims)}, ${JSON.stringify(logits.dims)}`,
    );
  }

  const boxData = getTensorData(predBoxes, "pred_boxes");
  const logitData = getTensorData(logits, "logits");
  const detections: Detection[] = [];
  // Assume single batch
  for (let i = 0; i < numQueriesBoxes; i++) {
    const boxOffset = i * 4;
    const logitOffset = i * numClasses;
    if (
      boxOffset + 3 >= boxData.length ||
      logitOffset + numClasses - 1 >= logitData.length
    )
      break;

    const cx = +boxData[boxOffset];
    const cy = +boxData[boxOffset + 1];
    const width = +boxData[boxOffset + 2];
    const height = +boxData[boxOffset + 3];
    if (![cx, cy, width, height].every(Number.isFinite)) continue;

    // Softmax gives probabilities
    const row = Array.from({ length: numClasses }, (_, j) =>
      Number(logitData[logitOffset + j] ?? 0),
    );
    const probabilities = softmax(row);
    let maxClass = 0,
      maxConfidence = -Infinity;
    for (let j = 0; j < numClasses; j++) {
      const p = probabilities[j] ?? 0;
      if (p > maxConfidence) {
        maxConfidence = p;
        maxClass = j;
      }
    }
    if (
      !Number.isFinite(maxConfidence) ||
      maxConfidence < RF_DETR_CONFIDENCE_THRESHOLD
    )
      continue;

    // Convert normalized (cx,cy,w,h) to [x1,y1,x2,y2] in original image
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
    if (x2 <= x1 || y2 <= y1) continue;

    detections.push({
      x1,
      y1,
      x2,
      y2,
      confidence: maxConfidence,
      class: maxClass,
    });
  }

  // Limit to MAX_DETECTIONS
  if (detections.length > 1)
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

  const batchSizeBoxes = +boxShape[0],
    numQueriesBoxes = +boxShape[1],
    boxWidth = +boxShape[2];
  const batchSizeLogits = +logitShape[0],
    numQueriesLogits = +logitShape[1],
    numClasses = +logitShape[2];
  const batchSizeMasks = +maskShape[0],
    numQueriesMasks = +maskShape[1];
  const maskHeight = +maskShape[2],
    maskWidth = +maskShape[3];

  if (
    batchSizeBoxes !== batchSizeLogits ||
    batchSizeBoxes !== batchSizeMasks ||
    numQueriesBoxes !== numQueriesLogits ||
    numQueriesBoxes !== numQueriesMasks ||
    !Number.isFinite(batchSizeBoxes) ||
    !Number.isFinite(numQueriesBoxes) ||
    !Number.isFinite(boxWidth) ||
    !Number.isFinite(batchSizeLogits) ||
    !Number.isFinite(numQueriesLogits) ||
    !Number.isFinite(numClasses) ||
    !Number.isFinite(batchSizeMasks) ||
    !Number.isFinite(numQueriesMasks) ||
    !Number.isFinite(maskHeight) ||
    !Number.isFinite(maskWidth) ||
    batchSizeBoxes < 1 ||
    numQueriesBoxes < 1 ||
    boxWidth !== 4 ||
    batchSizeLogits < 1 ||
    numQueriesLogits < 1 ||
    numClasses < 2 ||
    batchSizeMasks < 1 ||
    numQueriesMasks < 1 ||
    maskHeight < 1 ||
    maskWidth < 1
  ) {
    throw new InferenceError(
      `Unexpected RF-DETR segm output: pred_boxes=${JSON.stringify(predBoxes.dims)}, ` +
        `logits=${JSON.stringify(logits.dims)}, masks=${JSON.stringify(masks.dims)}`,
    );
  }

  const boxData = getTensorData(predBoxes, "pred_boxes");
  const logitData = getTensorData(logits, "logits");
  const maskData = getTensorData(masks, "masks");
  const queryScores = new Array<number>(numQueriesBoxes);
  const queryLabels = new Array<number>(numQueriesBoxes);

  // Calculate max score, class for each query
  for (let i = 0; i < numQueriesBoxes; i++) {
    const logitOffset = i * numClasses;
    let maxConfidence = -Infinity,
      maxClass = 0;
    for (let j = 0; j < numClasses; j++) {
      const conf = sigmoid(Number(logitData[logitOffset + j] ?? 0));
      if (conf > maxConfidence) {
        maxConfidence = conf;
        maxClass = j;
      }
    }
    queryScores[i] = maxConfidence;
    queryLabels[i] = maxClass;
  }

  // indices sorted by score descending
  const sortedIndices = Array.from(
    { length: numQueriesBoxes },
    (_, i) => i,
  ).sort((a, b) => (queryScores[b] ?? 0) - (queryScores[a] ?? 0));

  const detections: Detection[] = [];
  for (let c = 0; c < Math.min(sortedIndices.length, MAX_DETECTIONS); c++) {
    const i = sortedIndices[c];
    const confidence = queryScores[i] ?? 0;
    if (
      !Number.isFinite(confidence) ||
      confidence < RF_DETR_CONFIDENCE_THRESHOLD
    )
      continue;

    const boxOffset = i * 4;
    const cx = +boxData[boxOffset],
      cy = +boxData[boxOffset + 1],
      width = +boxData[boxOffset + 2],
      height = +boxData[boxOffset + 3];
    if (![cx, cy, width, height].every(Number.isFinite)) continue;

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
    if (x2 <= x1 || y2 <= y1) continue;

    const mask = resizeAndPackMask(
      maskData,
      0,
      i,
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
      class: queryLabels[i] ?? 0,
      ...(mask ? { mask } : {}),
    });
  }
  return detections;
}

// Packs a mask to base64 bitpacked Uint8Array, nearest-neighbor resampled.
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
  if (offset + sourcePlaneSize > maskData.length) return;
  const packed = new Uint8Array(Math.ceil((targetWidth * targetHeight) / 8));
  let hasForeground = false;

  for (let ty = 0; ty < targetHeight; ty++) {
    const sy =
      targetHeight === 1 ? 0 : (ty * (sourceHeight - 1)) / (targetHeight - 1);
    const y0 = Math.floor(sy),
      y1 = Math.min(y0 + 1, sourceHeight - 1),
      yLerp = sy - y0;
    for (let tx = 0; tx < targetWidth; tx++) {
      const sx =
        targetWidth === 1 ? 0 : (tx * (sourceWidth - 1)) / (targetWidth - 1);
      const x0 = Math.floor(sx),
        x1 = Math.min(x0 + 1, sourceWidth - 1),
        xLerp = sx - x0;
      // Bilinear interpolation
      const topLeft = +maskData[offset + y0 * sourceWidth + x0] || 0;
      const topRight = +maskData[offset + y0 * sourceWidth + x1] || 0;
      const bottomLeft = +maskData[offset + y1 * sourceWidth + x0] || 0;
      const bottomRight = +maskData[offset + y1 * sourceWidth + x1] || 0;
      const top = topLeft + (topRight - topLeft) * xLerp;
      const bottom = bottomLeft + (bottomRight - bottomLeft) * xLerp;
      const interpolated = top + (bottom - top) * yLerp;

      if (interpolated > 0) {
        const pi = ty * targetWidth + tx,
          byteI = pi >> 3,
          bitI = pi & 7;
        packed[byteI] |= 1 << bitI;
        hasForeground = true;
      }
    }
  }
  if (!hasForeground) return;
  return {
    width: targetWidth,
    height: targetHeight,
    data: Buffer.from(packed).toString("base64"),
  };
}

// Standard box iou
function intersectionOverUnion(a: Detection, b: Detection): number {
  const x1 = Math.max(a.x1, b.x1),
    y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2),
    y2 = Math.min(a.y2, b.y2);
  const iw = Math.max(0, x2 - x1),
    ih = Math.max(0, y2 - y1);
  const inter = iw * ih;
  if (inter <= 0) return 0;
  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  const union = areaA + areaB - inter;
  return union <= 0 ? 0 : inter / union;
}

// Greedy class-aware NMS
function applyClassAwareNms(
  detections: readonly Detection[],
  iouThreshold: number,
): Detection[] {
  if (detections.length <= 1) return detections.slice();
  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
  const kept: Detection[] = [];
  for (const d of sorted) {
    if (
      !kept.some(
        (k) =>
          k.class === d.class && intersectionOverUnion(k, d) > iouThreshold,
      )
    ) {
      kept.push(d);
      if (kept.length >= MAX_DETECTIONS) break;
    }
  }
  return kept;
}

export function postprocessYolo(
  output: ort.Tensor,
  imageInfo: ImageInfo,
): Detection[] {
  const shape = validateShape(output.dims, 3, "output0");
  const batchSize = +shape[0],
    channelCount = +shape[1],
    anchorCount = +shape[2];
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
    // Find most confident class for this anchor
    let maxConfidence = -Infinity,
      maxClass = 0;
    for (let classIdx = 0; classIdx < classCount; classIdx++) {
      const si = (classIdx + 4) * anchorCount + anchorIndex;
      const score = +(outputData[si] ?? 0);
      if (score > maxConfidence) {
        maxConfidence = score;
        maxClass = classIdx;
      }
    }
    if (
      !Number.isFinite(maxConfidence) ||
      maxConfidence < YOLO_CONFIDENCE_THRESHOLD
    )
      continue;
    // YOLO layout: [anchors for cx][anchors for cy][anchors for w][anchors for h]
    const cx = +outputData[anchorIndex];
    const cy = +outputData[anchorCount + anchorIndex];
    const width = +outputData[2 * anchorCount + anchorIndex];
    const height = +outputData[3 * anchorCount + anchorIndex];
    if (![cx, cy, width, height].every(Number.isFinite)) continue;

    const x1 = clamp((cx - width / 2) * xScale, 0, imageInfo.origWidth);
    const y1 = clamp((cy - height / 2) * yScale, 0, imageInfo.origHeight);
    const x2 = clamp((cx + width / 2) * xScale, 0, imageInfo.origWidth);
    const y2 = clamp((cy + height / 2) * yScale, 0, imageInfo.origHeight);
    if (x2 <= x1 || y2 <= y1) continue;

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
