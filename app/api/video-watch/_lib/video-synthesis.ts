import { promises as fs } from "node:fs";
import type {
  VideoWatchFrameResult,
  VideoWatchSummary,
} from "@/app/lib/video-watch-types";
import {
  ensureCacheDir,
  readAllFrameResults,
  writeFrameResult,
  writeJson,
} from "./cache";
import { isSceneUnchangedAnalysis, SUMMARY_MODEL_KEY } from "./config";
import { getClient, resolveModelKey } from "./llm-client";
import { summaryPath, timelinePath } from "./paths";
import { persistState } from "./state-persist";
import type {
  InternalJob,
  PersistedManifest,
  PersistedSummaryFile,
} from "./types-internal";

function displayFrameAnalysisForTimeline(text: string): string {
  if (isSceneUnchangedAnalysis(text)) {
    return "No material change from the prior sample.";
  }
  return text.trim();
}

function tokenJaccardSimilarity(a: string, b: string): number {
  const tokenize = (s: string) => {
    const t = s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2);
    return new Set(t);
  };

  const A = tokenize(a);
  const B = tokenize(b);
  let inter = 0;
  for (const x of A) {
    if (B.has(x)) {
      inter += 1;
    }
  }
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

function timelineSegmentsMergeable(rawA: string, rawB: string): boolean {
  const a = displayFrameAnalysisForTimeline(rawA);
  const b = displayFrameAnalysisForTimeline(rawB);
  if (a === b) {
    return true;
  }
  if (isSceneUnchangedAnalysis(rawA) && isSceneUnchangedAnalysis(rawB)) {
    return true;
  }
  const minLen = Math.min(a.length, b.length);
  if (minLen < 28) {
    return a === b;
  }
  return tokenJaccardSimilarity(a, b) >= 0.68;
}

export function buildCompressedTimelineText(
  ordered: readonly VideoWatchFrameResult[],
): string {
  if (!ordered.length) {
    return "";
  }

  const lines: string[] = [];
  let index = 0;

  while (index < ordered.length) {
    const start = ordered[index];
    if (!start) {
      break;
    }
    const displayText = displayFrameAnalysisForTimeline(start.frameAnalysis);
    let next = index + 1;

    while (next < ordered.length) {
      const left = ordered[next - 1];
      const right = ordered[next];
      if (!left || !right) {
        break;
      }
      if (!timelineSegmentsMergeable(left.frameAnalysis, right.frameAnalysis)) {
        break;
      }
      next += 1;
    }

    const end = ordered[next - 1];
    if (!end) {
      break;
    }

    if (start.timestampLabel === end.timestampLabel) {
      lines.push(`${start.timestampLabel}: ${displayText}`);
    } else {
      lines.push(
        `${start.timestampLabel}–${end.timestampLabel}: ${displayText}`,
      );
    }

    index = next;
  }

  return lines.join("\n");
}

function buildSynthesisEvidence(
  ordered: readonly VideoWatchFrameResult[],
): string {
  const narratives = ordered
    .map((f) => {
      const line = `${f.timestampLabel} — ${f.frameAnalysis.trim()}`;
      return line;
    })
    .join("\n");

  const objects = ordered
    .map((f) => {
      const entries = Object.entries(f.objects);
      if (!entries.length) {
        return `${f.timestampLabel} — (no tracked ids)`;
      }
      return `${f.timestampLabel} — ${JSON.stringify(Object.fromEntries(entries))}`;
    })
    .join("\n");

  return [
    "Samples are ~1 per second. Each frame was described from the image alone (no prior frame text was given to the frame model). Continuity is inferred here.",
    "",
    "### Frame-level notes (chronological)",
    narratives,
    "",
    "### Tracked ids by time (for who is whom — do not repeat this list as prose)",
    objects,
  ].join("\n");
}

export async function summarizeVideo(
  orderedResults: VideoWatchFrameResult[],
): Promise<VideoWatchSummary> {
  const timelineText = buildCompressedTimelineText(orderedResults);
  const resolvedSummaryModelKey = await resolveModelKey(SUMMARY_MODEL_KEY);
  const model = await getClient().llm.model(resolvedSummaryModelKey);

  const evidence = buildSynthesisEvidence(orderedResults);

  const response = await model.respond(
    [
      {
        role: "system",
        content: [
          "You turn sampled CCTV evidence into a useful brief for someone who was not watching the feed.",
          "Prioritize: what happens, in order, with approximate times — entries, exits, count changes, interactions, posture or movement, anything that changes the situation.",
          "Use stable ids from the evidence when they disambiguate people.",
          "Do NOT produce sections titled 'recurring elements', 'notable appearances', or bullet lists that restate the same clothing or visibility in different words.",
          "Do NOT pad the answer by repeating one observation many times. If nothing new happens for a stretch, say that once with the time range.",
          "If the clip is visually static after an initial setup, say so clearly instead of narrating each similar frame.",
          "Stay within the evidence; do not guess motives or off-screen events.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "Write 2–5 short paragraphs (plain text, no markdown headings required).",
          "1) One paragraph: the story of the clip in chronological order (what changes, when).",
          "2) Optionally one short paragraph: who is present and how we tell them apart (ids), only if it helps.",
          "3) End with one sentence on what is unknown or not visible.",
          "",
          evidence,
        ].join("\n"),
      },
    ],
    {
      temperature: 0.15,
      maxTokens: 1600,
    },
  );

  const rawText = response?.content?.trim();
  if (!rawText) {
    throw new Error("LM Studio returned empty summary response");
  }

  return {
    timelineText,
    summaryText: rawText,
    modelKey: resolvedSummaryModelKey,
    rawText,
  };
}

export async function finalizeJob(
  job: InternalJob,
  manifest: PersistedManifest,
): Promise<void> {
  const cacheDir = await ensureCacheDir(job.fingerprint);
  const orderedResults = await readAllFrameResults(cacheDir);

  for (const frame of orderedResults) {
    await writeFrameResult(cacheDir, frame);
  }

  const summary = await summarizeVideo(orderedResults);

  await fs.writeFile(timelinePath(cacheDir), summary.timelineText, "utf8");
  job.summary = summary;
  job.totalFrames = manifest.frameCount;
  job.analyzedFrames = orderedResults.length;
  job.status = "completed";
  job.updatedAt = new Date().toISOString();
  await writeJson(summaryPath(cacheDir), {
    summary,
  } satisfies PersistedSummaryFile);
  await persistState(job);
}
