import { LMStudioClient } from "@lmstudio/sdk";
import { NextResponse } from "next/server";

import {
  formatLmStudioError,
  isLmStudioConnectionError,
  normalizeLmStudioWsUrl,
} from "@/app/lib/lmstudio-url";

export const runtime = "nodejs";

interface PingBody {
  readonly baseUrl?: unknown;
  readonly apiToken?: unknown;
}

export async function POST(request: Request) {
  let body: PingBody;
  try {
    body = (await request.json()) as PingBody;
  } catch {
    return NextResponse.json(
      { ok: false as const, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const rawUrl = typeof body.baseUrl === "string" ? body.baseUrl : "";
  const apiToken =
    typeof body.apiToken === "string" && body.apiToken.trim().length > 0
      ? body.apiToken.trim()
      : undefined;

  let baseUrl: string;
  try {
    baseUrl = normalizeLmStudioWsUrl(rawUrl);
  } catch (error) {
    return NextResponse.json(
      { ok: false as const, error: formatLmStudioError(error) },
      { status: 400 },
    );
  }

  const client = new LMStudioClient({
    baseUrl,
    apiToken,
    verboseErrorMessages: false,
  });

  try {
    await client.llm.listLoaded();
    return NextResponse.json({ ok: true as const });
  } catch (error) {
    if (isLmStudioConnectionError(error)) {
      return NextResponse.json({
        ok: false as const,
        error: `LM Studio is not reachable at ${baseUrl}. Start LM Studio or check the URL and port.`,
      });
    }
    return NextResponse.json({
      ok: false as const,
      error: formatLmStudioError(error),
    });
  }
}
