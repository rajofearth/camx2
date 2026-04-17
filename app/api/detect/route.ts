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

// Parse and validate the detection model, defaulting to "rfdetr"
function parseDetectionModel(value: FormDataEntryValue | null): DetectionModel {
  if (value === null) return "rfdetr";
  if (typeof value !== "string")
    throw new BadRequestError("Invalid 'model' field");
  const normalized = value.trim().toLowerCase();
  if (normalized === "" || normalized === "rfdetr") return "rfdetr";
  if (normalized === "yolo") return "yolo";
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
    if (!contentType?.includes("multipart/form-data")) {
      return createErrorResponse(
        requestId,
        "BAD_REQUEST",
        "Content-Type must be multipart/form-data",
      );
    }

    // Parse multipart form data
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
    if (!(file instanceof Blob) || !file.size) {
      return createErrorResponse(
        requestId,
        "BAD_REQUEST",
        !file ? "Missing 'frame' field" : "Empty frame file",
      );
    }

    // Read file buffer
    let buffer: Buffer;
    try {
      buffer = Buffer.from(await file.arrayBuffer());
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to read frame data";
      return createErrorResponse(requestId, "BAD_REQUEST", message);
    }

    // Preprocess the image for the chosen model
    const { tensor, image } = await preprocess(buffer, detectionModel);

    // Run inference
    const session = await getSession(detectionModel);
    const inputName = getInputName(session, detectionModel);
    const results = await session.run({ [inputName]: tensor });

    let detections;
    if (detectionModel === "rfdetr") {
      const outputNames = getOutputNames(session, "rfdetr");
      const predBoxes = results[outputNames.boxes];
      const logits = results[outputNames.logits];
      const masks = outputNames.masks ? results[outputNames.masks] : undefined;

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
      detections = postprocessRfDetr(predBoxes, logits, image, masks);
    } else {
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
      detections = postprocessYolo(output, image);
    }

    // If downstream returned an error, propagate
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

    // Handle known error types, fallback to generic error
    if (error instanceof BadRequestError || error instanceof InferenceError) {
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
      typeof (error as any).errorCode === "string"
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

    // Log unknown/unexpected error
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
