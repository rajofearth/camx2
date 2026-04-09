import type { NextRequest } from "next/server";
import type { VideoWatchChatMessage } from "@/app/lib/video-watch-types";
import { answerQuestionAboutVideo } from "../_lib/service";

export const runtime = "nodejs";

function parseMessages(
  value: unknown,
): VideoWatchChatMessage[] | null | "invalid" {
  if (value === undefined) {
    return null;
  }

  if (!Array.isArray(value)) {
    return "invalid";
  }

  const parsed: VideoWatchChatMessage[] = [];

  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      return "invalid";
    }

    const candidate = item as { role?: unknown; content?: unknown };
    if (
      (candidate.role !== "user" && candidate.role !== "assistant") ||
      typeof candidate.content !== "string"
    ) {
      return "invalid";
    }

    const content = candidate.content.trim();
    if (!content) {
      continue;
    }

    parsed.push({
      role: candidate.role,
      content,
    });
  }

  return parsed;
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = (await req.json()) as {
      jobId?: unknown;
      question?: unknown;
      messages?: unknown;
    };
    const messages = parseMessages(body.messages);

    if (
      typeof body.jobId !== "string" ||
      body.jobId.length === 0 ||
      typeof body.question !== "string" ||
      body.question.trim().length === 0 ||
      messages === "invalid"
    ) {
      return Response.json(
        {
          ok: false,
          message: "Missing or invalid jobId, question, or messages",
        },
        { status: 400 },
      );
    }

    const result = await answerQuestionAboutVideo({
      jobId: body.jobId,
      question: body.question.trim(),
      messages: messages ?? undefined,
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
