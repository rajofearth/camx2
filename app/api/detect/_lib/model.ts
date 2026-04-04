import { join } from "node:path";
import * as ort from "onnxruntime-node";
import type { DetectionModel } from "@/app/lib/types";
import { ModelError } from "./errors";

const MODEL_CONFIG = {
  rfdetr: {
    fileName: "rfdetr-nano.onnx",
    inputName: "pixel_values",
    outputNames: {
      boxes: "pred_boxes",
      logits: "logits",
    },
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
  const cachedSession = sessions.get(modelType);
  if (cachedSession) {
    return cachedSession;
  }

  const config = MODEL_CONFIG[modelType];

  try {
    const modelPath = join(process.cwd(), "public", "models", config.fileName);
    const session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ["webgpu", "cpu"],
    });

    sessions.set(modelType, session);

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

export function getInputName(
  session: ort.InferenceSession,
  modelType: DetectionModel,
): string {
  const expectedInput = MODEL_CONFIG[modelType].inputName;
  const inputName =
    session.inputNames.find((name) => name === expectedInput) ??
    session.inputNames[0];

  if (!inputName) {
    throw new ModelError("Model has no input names", { modelType });
  }

  return inputName;
}

export function getOutputNames(
  session: ort.InferenceSession,
  modelType: "rfdetr",
): {
  readonly boxes: string;
  readonly logits: string;
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
    }
  | {
      readonly output: string;
    } {
  if (modelType === "rfdetr") {
    const boxes =
      session.outputNames.find(
        (name) => name === MODEL_CONFIG.rfdetr.outputNames.boxes,
      ) ?? session.outputNames[0];
    const logits =
      session.outputNames.find(
        (name) => name === MODEL_CONFIG.rfdetr.outputNames.logits,
      ) ?? session.outputNames[1];

    if (!boxes || !logits) {
      throw new ModelError("Model must expose both box and logit outputs", {
        modelType,
        availableOutputs: session.outputNames,
      });
    }

    return { boxes, logits };
  }

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
