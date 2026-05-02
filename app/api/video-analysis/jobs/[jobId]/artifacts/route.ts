import type { NextRequest } from "next/server";
import { videoAnalysisService } from "@/lib/video-analysis/application";
import { toErrorResponse } from "@/lib/video-analysis/contracts/error-codes";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  try {
    const { jobId } = await context.params;
    const artifacts = await videoAnalysisService.getArtifacts(jobId);
    return Response.json({
      ok: true,
      ...artifacts,
    });
  } catch (error) {
    const handled = toErrorResponse(error);
    return Response.json(handled.body, { status: handled.status });
  }
}
