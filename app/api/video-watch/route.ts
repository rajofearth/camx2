import type { NextRequest } from "next/server";
import { parseJobRuntimeFromFormField } from "./_lib/lm-runtime-defaults";
import {
  clearVideoJobCache,
  createOrResumeVideoJob,
  getVideoJobStatus,
} from "./_lib/service";

export const runtime = "nodejs";

function errorResponse(
  status: number,
  errorCode: "BAD_REQUEST" | "NOT_FOUND" | "UPSTREAM_ERROR" | "INTERNAL_ERROR",
  message: string,
): Response {
  return Response.json(
    {
      ok: false,
      errorCode,
      message,
    },
    { status },
  );
}

export async function GET(req: NextRequest): Promise<Response> {
  const jobId = req.nextUrl.searchParams.get("jobId");
  const fingerprint = req.nextUrl.searchParams.get("fingerprint");

  if (!jobId && !fingerprint) {
    return errorResponse(
      400,
      "BAD_REQUEST",
      "Missing required query parameter: jobId or fingerprint",
    );
  }

  const job = await getVideoJobStatus({ jobId, fingerprint });
  if (!job) {
    return errorResponse(404, "NOT_FOUND", "Video analysis job not found");
  }

  return Response.json(job);
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const contentType = req.headers.get("content-type");
    if (!contentType || !contentType.includes("multipart/form-data")) {
      return errorResponse(
        400,
        "BAD_REQUEST",
        "Content-Type must be multipart/form-data",
      );
    }

    const formData = await req.formData();
    const video = formData.get("video");
    const clientFingerprint = formData.get("clientFingerprint");
    const forceRefresh = formData.get("forceRefresh");
    const lmRuntime = parseJobRuntimeFromFormField(
      formData.get("model_config"),
    );

    if (!(video instanceof Blob) || video.size === 0) {
      return errorResponse(400, "BAD_REQUEST", "Missing video upload");
    }

    const buffer = Buffer.from(await video.arrayBuffer());
    const job = await createOrResumeVideoJob({
      sourceFileName:
        video instanceof File && typeof video.name === "string"
          ? video.name
          : "uploaded-video.bin",
      videoBuffer: buffer,
      clientFingerprint:
        typeof clientFingerprint === "string" ? clientFingerprint : null,
      forceRefresh: forceRefresh === "true",
      lmRuntime,
    });

    return Response.json(job);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const lower = message.toLowerCase();
    const status =
      lower.includes("lm studio") || lower.includes("required lm studio model")
        ? 502
        : 500;
    const errorCode = status === 502 ? "UPSTREAM_ERROR" : "INTERNAL_ERROR";
    return errorResponse(status, errorCode, message);
  }
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const jobId = req.nextUrl.searchParams.get("jobId");
  const fingerprint = req.nextUrl.searchParams.get("fingerprint");

  if (!jobId && !fingerprint) {
    return errorResponse(
      400,
      "BAD_REQUEST",
      "Missing required query parameter: jobId or fingerprint",
    );
  }

  const removedFingerprint = await clearVideoJobCache({ jobId, fingerprint });
  if (!removedFingerprint) {
    return errorResponse(404, "NOT_FOUND", "Video analysis cache not found");
  }

  return Response.json({
    ok: true,
    fingerprint: removedFingerprint,
  });
}
