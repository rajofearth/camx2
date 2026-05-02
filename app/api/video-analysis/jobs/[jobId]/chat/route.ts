import type { NextRequest } from "next/server";
import { videoAnalysisService } from "@/lib/video-analysis/application";
import { toErrorResponse } from "@/lib/video-analysis/contracts/error-codes";
import { chatRequestSchema } from "@/lib/video-analysis/contracts/schemas";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  try {
    const { jobId } = await context.params;
    const body = chatRequestSchema.parse(await req.json());
    const result = await videoAnalysisService.answerQuestion({
      jobId,
      question: body.question,
      messages: body.messages ?? [],
    });
    return Response.json({
      ok: true,
      answer: result.answer,
      modelKey: result.modelKey,
    });
  } catch (error) {
    const handled = toErrorResponse(error);
    return Response.json(handled.body, { status: handled.status });
  }
}
