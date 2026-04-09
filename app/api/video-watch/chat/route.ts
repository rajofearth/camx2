import type { NextRequest } from "next/server";
import { answerQuestionAboutVideo } from "../_lib/service";

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = (await req.json()) as {
      jobId?: unknown;
      question?: unknown;
    };

    if (
      typeof body.jobId !== "string" ||
      body.jobId.length === 0 ||
      typeof body.question !== "string" ||
      body.question.trim().length === 0
    ) {
      return Response.json(
        {
          ok: false,
          message: "Missing jobId or question",
        },
        { status: 400 },
      );
    }

    const result = await answerQuestionAboutVideo({
      jobId: body.jobId,
      question: body.question.trim(),
    });

    return Response.json({
      ok: true,
      answer: result.answer,
      modelKey: result.modelKey,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json(
      {
        ok: false,
        message,
      },
      { status: 500 },
    );
  }
}
