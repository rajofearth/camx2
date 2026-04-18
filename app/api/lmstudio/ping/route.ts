import { NextResponse } from "next/server";

import { createLmStudioClientForRequest } from "@/app/lib/lmstudio-client-factory";
import { parseLmStudioPostParams } from "@/app/lib/lmstudio-post-params";
import {
  formatLmStudioError,
  isLmStudioConnectionError,
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

  const parsed = parseLmStudioPostParams(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false as const, error: parsed.error },
      { status: 400 },
    );
  }

  const { baseUrl, apiToken } = parsed.params;
  const client = createLmStudioClientForRequest(baseUrl, apiToken);

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
