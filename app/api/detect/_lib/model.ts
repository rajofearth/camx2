import { join } from "node:path";
import * as ort from "onnxruntime-node";
import { ModelError } from "./errors";

let session: ort.InferenceSession | null = null;
let sessionInitialized = false;

export async function getSession(): Promise<ort.InferenceSession> {
  if (session !== null) {
    return session;
  }

  try {
    const modelPath = join(
      process.cwd(),
      "public",
      "models",
      "rfdetr-nano.onnx",
    );
    session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ["webgpu", "cpu"],
    });

    if (!sessionInitialized) {
      console.log("[RF-DETR] Model loaded:", modelPath);
      console.log("[RF-DETR] Input names:", session.inputNames);
      console.log("[RF-DETR] Output names:", session.outputNames);
      sessionInitialized = true;
    }

    return session;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new ModelError(`Failed to load model: ${message}`, undefined, error);
  }
}

export function getInputName(session: ort.InferenceSession): string {
  const pixelValuesInput =
    session.inputNames.find((name) => name === "pixel_values") ??
    session.inputNames[0];

  if (!pixelValuesInput) {
    throw new ModelError("Model has no input names");
  }

  return pixelValuesInput;
}

export function getOutputNames(session: ort.InferenceSession): {
  readonly boxes: string;
  readonly logits: string;
} {
  const boxes =
    session.outputNames.find((name) => name === "pred_boxes") ??
    session.outputNames[0];
  const logits =
    session.outputNames.find((name) => name === "logits") ??
    session.outputNames[1];

  if (!boxes || !logits) {
    throw new ModelError("Model must expose both box and logit outputs", {
      availableOutputs: session.outputNames,
    });
  }

  return { boxes, logits };
}
