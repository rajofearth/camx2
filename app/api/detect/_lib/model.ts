import { join } from "node:path";
import * as ort from "onnxruntime-node";
import type { DetectionModel } from "@/app/lib/types";
import { ModelError } from "./errors";

// Model configuration info
const MODEL_CONFIG = {
  rfdetr: {
    fileName: "rf-detr-seg-nano.onnx",
    inputName: "input",
    logLabel: "RF-DETR",
  },
  yolo: {
    fileName: "yolo11n.onnx",
    inputName: "images",
    outputNames: {
      output: "output0",
    },
    logLabel: "YOLO",
  },
} as const;

const sessions = new Map<DetectionModel, ort.InferenceSession>();
const initializedModels = new Set<DetectionModel>();

export async function getSession(
  modelType: DetectionModel,
): Promise<ort.InferenceSession> {
  // Avoid reloading the same model session
  const existingSession = sessions.get(modelType);
  if (existingSession) return existingSession;
  const config = MODEL_CONFIG[modelType];
  try {
    const modelPath = join(process.cwd(), "public", "models", config.fileName);
    const session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ["webgpu", "cpu"],
    });
    sessions.set(modelType, session);

    // Only log model info once per process for each type
    if (!initializedModels.has(modelType)) {
      console.log(`[${config.logLabel}] Model loaded:`, modelPath);
      console.log(`[${config.logLabel}] Input names:`, session.inputNames);
      console.log(`[${config.logLabel}] Output names:`, session.outputNames);
      initializedModels.add(modelType);
    }

    return session;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new ModelError(
      `Failed to load ${config.logLabel} model: ${message}`,
      { modelType },
      error,
    );
  }
}

// Returns the model's correct input tensor name or first available input
export function getInputName(
  session: ort.InferenceSession,
  modelType: DetectionModel,
): string {
  const { inputName } = MODEL_CONFIG[modelType];
  const found =
    session.inputNames.find((name) => name === inputName) ??
    session.inputNames[0];
  if (!found) throw new ModelError("Model has no input names", { modelType });
  return found;
}

// Output typing: rfdetr returns boxes/logits/masks, yolo returns output
export function getOutputNames(
  session: ort.InferenceSession,
  modelType: "rfdetr",
): {
  readonly boxes: string;
  readonly logits: string;
  readonly masks?: string;
};
export function getOutputNames(
  session: ort.InferenceSession,
  modelType: "yolo",
): {
  readonly output: string;
};
export function getOutputNames(
  session: ort.InferenceSession,
  modelType: DetectionModel,
):
  | {
      readonly boxes: string;
      readonly logits: string;
      readonly masks?: string;
    }
  | {
      readonly output: string;
    } {
  if (modelType === "rfdetr") {
    let boxes: string | undefined,
      logits: string | undefined,
      masks: string | undefined;

    // Try to quickly identify outputs by shape heuristics
    for (const metadata of session.outputMetadata) {
      const shape = "shape" in metadata ? metadata.shape : undefined;
      if (!Array.isArray(shape)) continue;

      if (shape.length === 4) {
        masks = metadata.name;
      } else if (shape.length === 3) {
        const lastDim = Number(shape[2]);
        if (lastDim === 4) boxes = metadata.name;
        if (lastDim > 4) logits = metadata.name;
      }
    }

    // Fallbacks based on naming and order
    boxes ??=
      session.outputNames.find((name) => name.toLowerCase().includes("box")) ??
      session.outputNames[0];
    logits ??=
      session.outputNames.find((name) => /logit|label/i.test(name)) ??
      session.outputNames[1];
    masks ??=
      session.outputNames.find((name) => name.toLowerCase().includes("mask")) ??
      session.outputNames[2];

    if (!boxes || !logits) {
      throw new ModelError("Model must expose both box and logit outputs", {
        modelType,
        availableOutputs: session.outputNames,
      });
    }
    return { boxes, logits, masks };
  }

  // For yolo models, output tensor is usually named and always required
  const output =
    session.outputNames.find(
      (name) => name === MODEL_CONFIG.yolo.outputNames.output,
    ) ?? session.outputNames[0];

  if (!output) {
    throw new ModelError("Model must expose a YOLO output tensor", {
      modelType,
      availableOutputs: session.outputNames,
    });
  }
  return { output };
}
