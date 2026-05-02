import type { NextRequest } from "next/server";
import { videoAnalysisService } from "@/lib/video-analysis/application";
import {
  toErrorResponse,
  VideoAnalysisError,
} from "@/lib/video-analysis/contracts/error-codes";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  try {
    const { jobId } = await context.params;
    const job = await videoAnalysisService.getJobStatus({ jobId });
    if (!job) {
      throw new VideoAnalysisError(
        "NOT_FOUND",
        404,
        "Video analysis job not found",
      );
    }
    return Response.json(job);
  } catch (error) {
    const handled = toErrorResponse(error);
    return Response.json(handled.body, { status: handled.status });
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  try {
    const { jobId } = await context.params;
    const cleared = await videoAnalysisService.clearJob(jobId);
    if (!cleared) {
      throw new VideoAnalysisError(
        "NOT_FOUND",
        404,
        "Video analysis job not found",
      );
    }
    return Response.json({
      ok: true,
      fingerprint: cleared.fingerprint,
    });
  } catch (error) {
    const handled = toErrorResponse(error);
    return Response.json(handled.body, { status: handled.status });
  }
}
