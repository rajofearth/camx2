import type { NextRequest } from "next/server";
import { videoAnalysisService } from "@/lib/video-analysis/application";
import {
  toErrorResponse,
  VideoAnalysisError,
} from "@/lib/video-analysis/contracts/error-codes";
import { parseProviderConfigFromFormData } from "@/lib/video-analysis/providers/runtime";

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const contentType = req.headers.get("content-type");
    if (!contentType || !contentType.includes("multipart/form-data")) {
      throw new VideoAnalysisError(
        "BAD_REQUEST",
        400,
        "Content-Type must be multipart/form-data",
      );
    }

    const formData = await req.formData();
    const video = formData.get("video");
    if (!(video instanceof Blob) || video.size === 0) {
      throw new VideoAnalysisError("BAD_REQUEST", 400, "Missing video upload");
    }

    const buffer = Buffer.from(await video.arrayBuffer());
    const job = await videoAnalysisService.createJob({
      sourceFileName:
        video instanceof File && typeof video.name === "string"
          ? video.name
          : "uploaded-video.bin",
      videoBuffer: buffer,
      clientFingerprint:
        typeof formData.get("clientFingerprint") === "string"
          ? String(formData.get("clientFingerprint"))
          : null,
      forceRefresh: formData.get("forceRefresh") === "true",
      providerConfig: parseProviderConfigFromFormData(
        formData.get("model_config"),
      ),
    });

    return Response.json(job);
  } catch (error) {
    const handled = toErrorResponse(error);
    return Response.json(handled.body, { status: handled.status });
  }
}
