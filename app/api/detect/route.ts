import type { NextRequest } from "next/server";
import type { DetectionModel } from "@/app/lib/types";
import { BadRequestError, InferenceError } from "./_lib/errors";
import { getInputName, getOutputNames, getSession } from "./_lib/model";
import { postprocessRfDetr, postprocessYolo } from "./_lib/postprocess";
import { preprocess } from "./_lib/preprocess";
import {
  createErrorResponse,
  createSuccessResponse,
  generateRequestId,
} from "./_lib/response";

export const runtime = "nodejs";

function parseDetectionModel(value: FormDataEntryValue | null): DetectionModel {
  if (value === null) {
    return "rfdetr";
  }

  if (typeof value !== "string") {
    throw new BadRequestError("Invalid 'model' field");
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "" || normalized === "rfdetr") {
    return "rfdetr";
  }

  if (normalized === "yolo") {
    return "yolo";
  }

  throw new BadRequestError("Unsupported detection model", {
    model: value,
    supportedModels: ["rfdetr", "yolo"],
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = generateRequestId();
  const startTime = performance.now();

  try {
    const contentType = req.headers.get("content-type");
    if (!contentType || !contentType.includes("multipart/form-data")) {
      return createErrorResponse(
        requestId,
        "BAD_REQUEST",
        "Content-Type must be multipart/form-data",
      );
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to parse form data";
      return createErrorResponse(requestId, "BAD_REQUEST", message);
    }

    const detectionModel = parseDetectionModel(formData.get("model"));
    const file = formData.get("frame");
    if (!file || !(file instanceof Blob)) {
      return createErrorResponse(
        requestId,
        "BAD_REQUEST",
        "Missing or invalid 'frame' field",
      );
    }

    if (file.size === 0) {
      return createErrorResponse(requestId, "BAD_REQUEST", "Empty frame file");
    }

    let buffer: Buffer;
    try {
      buffer = Buffer.from(await file.arrayBuffer());
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to read frame data";
      return createErrorResponse(requestId, "BAD_REQUEST", message);
    }

    const { tensor, image } = await preprocess(buffer, detectionModel);

    const session = await getSession(detectionModel);
    const inputName = getInputName(session, detectionModel);
    const results = await session.run({ [inputName]: tensor });

    const detections =
      detectionModel === "rfdetr"
        ? (() => {
            const outputNames = getOutputNames(session, "rfdetr");
            const predBoxes = results[outputNames.boxes];
            const logits = results[outputNames.logits];

            if (!predBoxes || !logits) {
              return createErrorResponse(
                requestId,
                "INFERENCE_ERROR",
                "RF-DETR output tensors not found",
                {
                  availableOutputs: Object.keys(results),
                  expectedOutputs: [outputNames.boxes, outputNames.logits],
                },
              );
            }

            return postprocessRfDetr(predBoxes, logits, image);
          })()
        : (() => {
            const outputNames = getOutputNames(session, "yolo");
            const output = results[outputNames.output];

            if (!output) {
              return createErrorResponse(
                requestId,
                "INFERENCE_ERROR",
                "YOLO output tensor not found",
                {
                  availableOutputs: Object.keys(results),
                  expectedOutputs: [outputNames.output],
                },
              );
            }

            return postprocessYolo(output, image);
          })();

    if (detections instanceof Response) {
      return detections;
    }

    const latencyMs = performance.now() - startTime;

    return createSuccessResponse(
      requestId,
      detections,
      { width: image.origWidth, height: image.origHeight },
      { latencyMs },
    );
  } catch (error) {
    const latencyMs = performance.now() - startTime;

    if (error instanceof BadRequestError) {
      return createErrorResponse(
        requestId,
        error.errorCode,
        error.message,
        error.details,
      );
    }

    if (error instanceof InferenceError) {
      return createErrorResponse(
        requestId,
        error.errorCode,
        error.message,
        error.details,
      );
    }

    if (
      error &&
      typeof error === "object" &&
      "errorCode" in error &&
      typeof error.errorCode === "string"
    ) {
      const detectError = error as {
        errorCode: string;
        message?: string;
        details?: unknown;
      };

      return createErrorResponse(
        requestId,
        detectError.errorCode as BadRequestError["errorCode"],
        detectError.message ?? "Unknown error",
        detectError.details as BadRequestError["details"],
      );
    }

    console.error(
      `[DETECT] [${requestId}] Unexpected error (${latencyMs.toFixed(0)}ms):`,
      error,
    );

    return createErrorResponse(
      requestId,
      "INTERNAL_ERROR",
      "An unexpected error occurred",
      { latencyMs },
    );
  }
}
