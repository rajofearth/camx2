import { promises as fs } from "node:fs";
import path from "node:path";
import { summarizeText } from "@/lib/video-analysis/lmstudio";
import {
  compactTimelinePath,
  ensureAnalysisRoot,
  ensureVideoDirs,
  hashSha256,
  persistReferences,
  queryCachePath,
  readJson,
  readPersistedJobState,
  readPersistedManifest,
  readPersistedSummary,
  readReferenceByFingerprint,
  readReferenceByJobId,
  registryPath,
  removeVideoArtifacts,
  statePath,
  summaryPath,
  writeJson,
} from "@/lib/video-analysis/storage";
import type {
  CompactTimeline,
  CompactTimelineEntry,
  EmbeddingRecord,
  FrameAnalysis,
  GlobalEntityRegistry,
  GlobalEntityRegistryEntry,
  JobReference,
  PersistedJobState,
  PersistedManifest,
  PersistedSummary,
  VideoState,
} from "@/lib/video-analysis/types";

function frameAnalysisPath(fingerprint: string, frameIndex: number): string {
  return path.join(
    path.dirname(statePath(fingerprint)),
    "analyses",
    `frame-${String(frameIndex).padStart(6, "0")}.json`,
  );
}

function extractKeywords(input: string): string[] {
  return [
    ...new Set(
      input
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 3),
    ),
  ];
}

function timelineEntryToText(entry: CompactTimelineEntry): string {
  const segments = [entry.text];
  if (entry.events.length > 0) {
    segments.push(`events: ${entry.events.join("; ")}`);
  }
  if (entry.anomalies.length > 0) {
    segments.push(`anomalies: ${entry.anomalies.join("; ")}`);
  }
  if (entry.objectIds.length > 0) {
    segments.push(`objects: ${entry.objectIds.join(", ")}`);
  }
  return `${entry.timestampLabel}: ${segments.join(" | ")}`;
}

function buildRegistry(
  analyses: readonly FrameAnalysis[],
  videoId: string,
): GlobalEntityRegistry {
  const registry = new Map<string, GlobalEntityRegistryEntry>();

  for (const analysis of analyses) {
    for (const object of analysis.newOrUpdatedObjects) {
      const existing = registry.get(object.id);
      if (!existing) {
        registry.set(object.id, {
          id: object.id,
          label: object.label,
          firstSeenMs: object.firstSeenMs,
          firstSeenLabel: object.firstSeenLabel,
          lastSeenMs: object.lastSeenMs,
          lastSeenLabel: object.lastSeenLabel,
          totalMentions: 1,
          attributes: [...object.attributes],
        });
        continue;
      }

      registry.set(object.id, {
        ...existing,
        label: object.label || existing.label,
        lastSeenMs: Math.max(existing.lastSeenMs, object.lastSeenMs),
        lastSeenLabel:
          object.lastSeenMs >= existing.lastSeenMs
            ? object.lastSeenLabel
            : existing.lastSeenLabel,
        totalMentions: existing.totalMentions + 1,
        attributes: [
          ...new Set([...existing.attributes, ...object.attributes]),
        ],
      });
    }
  }

  return {
    videoId,
    generatedAt: new Date().toISOString(),
    totalUniqueObjects: registry.size,
    entities: [...registry.values()].sort(
      (left, right) => left.firstSeenMs - right.firstSeenMs,
    ),
  };
}

function buildCompactTimeline(
  analyses: readonly FrameAnalysis[],
  videoId: string,
): CompactTimeline {
  return {
    videoId,
    generatedAt: new Date().toISOString(),
    entries: analyses.map((analysis) => ({
      frameIndex: analysis.frameIndex,
      timestampMs: analysis.timestampMs,
      timestampLabel: analysis.timestampLabel,
      text: analysis.summaryText,
      objectIds: analysis.newOrUpdatedObjects.map((object) => object.id),
      events: analysis.events.map((event) => event.description),
      anomalies: [...analysis.anomalies],
      skipped: analysis.skipped,
    })),
  };
}

export class AnalysisRepository {
  async initialize(): Promise<void> {
    await ensureAnalysisRoot();
  }

  async saveJobState(
    state: PersistedJobState,
    reference: JobReference,
  ): Promise<void> {
    await ensureVideoDirs(reference.fingerprint);
    await Promise.all([
      writeJson(statePath(reference.fingerprint), state),
      writeJson(
        path.join(path.dirname(statePath(reference.fingerprint)), "refs.json"),
        reference,
      ),
      persistReferences(reference),
    ]);
  }

  async saveManifest(
    fingerprint: string,
    manifest: PersistedManifest,
  ): Promise<void> {
    await writeJson(
      path.join(path.dirname(statePath(fingerprint)), "manifest.json"),
      manifest,
    );
  }

  async loadJobStateByFingerprint(
    fingerprint: string,
  ): Promise<PersistedJobState | null> {
    return await readPersistedJobState(fingerprint);
  }

  async loadJobStateByJobId(jobId: string): Promise<PersistedJobState | null> {
    const reference = await readReferenceByJobId(jobId);
    if (!reference) {
      return null;
    }
    return await this.loadJobStateByFingerprint(reference.fingerprint);
  }

  async resolveFingerprintByJobId(jobId: string): Promise<string | null> {
    const reference = await readReferenceByJobId(jobId);
    return reference?.fingerprint ?? null;
  }

  async resolveReference(input: {
    readonly jobId?: string | null;
    readonly fingerprint?: string | null;
  }): Promise<JobReference | null> {
    if (input.fingerprint) {
      return await readReferenceByFingerprint(input.fingerprint);
    }
    if (input.jobId) {
      return await readReferenceByJobId(input.jobId);
    }
    return null;
  }

  async removeArtifacts(input: {
    readonly jobId?: string | null;
    readonly fingerprint?: string | null;
  }): Promise<string | null> {
    const reference = await this.resolveReference(input);
    if (!reference) {
      return null;
    }

    await removeVideoArtifacts(reference.fingerprint);
    return reference.fingerprint;
  }

  async saveFrameAnalysis(
    fingerprint: string,
    analysis: FrameAnalysis,
  ): Promise<void> {
    await writeJson(
      frameAnalysisPath(fingerprint, analysis.frameIndex),
      analysis,
    );
  }

  async readFrameAnalysis(
    fingerprint: string,
    frameIndex: number,
  ): Promise<FrameAnalysis | null> {
    return await readJson<FrameAnalysis>(
      frameAnalysisPath(fingerprint, frameIndex),
    );
  }

  async readAllFrameAnalyses(fingerprint: string): Promise<FrameAnalysis[]> {
    const analysesDirectory = path.join(
      path.dirname(statePath(fingerprint)),
      "analyses",
    );
    const files = await fs.readdir(analysesDirectory).catch(() => []);
    const analyses = await Promise.all(
      files
        .filter((fileName) => fileName.endsWith(".json"))
        .sort()
        .map(
          async (fileName) =>
            await readJson<FrameAnalysis>(
              path.join(analysesDirectory, fileName),
            ),
        ),
    );
    return analyses.filter((value): value is FrameAnalysis => value !== null);
  }

  async hasFrameAnalysis(
    fingerprint: string,
    frameIndex: number,
  ): Promise<boolean> {
    return (await this.readFrameAnalysis(fingerprint, frameIndex)) !== null;
  }

  async loadManifest(fingerprint: string): Promise<PersistedManifest | null> {
    return await readPersistedManifest(fingerprint);
  }

  async finalizeAnalysis(input: {
    readonly videoId: string;
    readonly fingerprint: string;
    readonly currentState: VideoState;
  }): Promise<{
    registry: GlobalEntityRegistry;
    compactTimeline: CompactTimeline;
    summary: PersistedSummary;
    embeddingRecords: EmbeddingRecord[];
  }> {
    const analyses = (await this.readAllFrameAnalyses(input.fingerprint)).sort(
      (left, right) => left.frameIndex - right.frameIndex,
    );
    const registry = buildRegistry(analyses, input.videoId);
    const compactTimeline = buildCompactTimeline(analyses, input.videoId);
    const timelineText = compactTimeline.entries
      .map(timelineEntryToText)
      .join("\n");
    const summaryResult = await summarizeText(timelineText);
    const summary: PersistedSummary = {
      timelineText,
      summaryText: summaryResult.summaryText,
      rawText: summaryResult.rawText,
      modelKey: summaryResult.modelKey,
    };

    await Promise.all([
      writeJson(registryPath(input.fingerprint), registry),
      writeJson(compactTimelinePath(input.fingerprint), compactTimeline),
      writeJson(summaryPath(input.fingerprint), summary),
      writeJson(
        path.join(
          path.dirname(statePath(input.fingerprint)),
          "video-state.json",
        ),
        input.currentState,
      ),
    ]);

    const embeddingRecords: EmbeddingRecord[] = [
      ...compactTimeline.entries.map((entry) => ({
        id: `${input.videoId}:timeline:${entry.frameIndex}`,
        vector: [],
        metadata: {
          videoId: input.videoId,
          source: "timeline" as const,
          frameIndex: entry.frameIndex,
          timestampMs: entry.timestampMs,
          timestampLabel: entry.timestampLabel,
          text: timelineEntryToText(entry),
          objects: entry.objectIds.join("|"),
          events: entry.events.join("|"),
          anomalies: entry.anomalies.join("|"),
          keywords: extractKeywords(
            `${entry.text} ${entry.events.join(" ")} ${entry.anomalies.join(" ")}`,
          ).join("|"),
        },
      })),
      ...registry.entities.map((entity) => ({
        id: `${input.videoId}:registry:${entity.id}`,
        vector: [],
        metadata: {
          videoId: input.videoId,
          source: "registry" as const,
          frameIndex: -1,
          timestampMs: entity.lastSeenMs,
          timestampLabel: entity.lastSeenLabel,
          text: `${entity.id} (${entity.label}) first seen at ${entity.firstSeenLabel} and last seen at ${entity.lastSeenLabel}. Attributes: ${entity.attributes.join(", ") || "none"}. Total mentions: ${entity.totalMentions}.`,
          objects: entity.id,
          events: "",
          anomalies: "",
          keywords: extractKeywords(
            `${entity.id} ${entity.label} ${entity.attributes.join(" ")}`,
          ).join("|"),
        },
      })),
      ...analyses.map((analysis) => ({
        id: `${input.videoId}:frame:${analysis.frameIndex}`,
        vector: [],
        metadata: {
          videoId: input.videoId,
          source: "frame" as const,
          frameIndex: analysis.frameIndex,
          timestampMs: analysis.timestampMs,
          timestampLabel: analysis.timestampLabel,
          text: `${analysis.timestampLabel}: ${analysis.summaryText}`,
          objects: analysis.newOrUpdatedObjects
            .map((object) => object.id)
            .join("|"),
          events: analysis.events.map((event) => event.description).join("|"),
          anomalies: analysis.anomalies.join("|"),
          keywords: extractKeywords(
            `${analysis.summaryText} ${analysis.events.map((event) => event.description).join(" ")} ${analysis.anomalies.join(" ")}`,
          ).join("|"),
        },
      })),
    ];

    return {
      registry,
      compactTimeline,
      summary,
      embeddingRecords,
    };
  }

  async loadSummaryByJobId(jobId: string): Promise<PersistedSummary | null> {
    const reference = await readReferenceByJobId(jobId);
    if (!reference) {
      return null;
    }
    return await readPersistedSummary(reference.fingerprint);
  }

  async loadSummaryByFingerprint(
    fingerprint: string,
  ): Promise<PersistedSummary | null> {
    return await readPersistedSummary(fingerprint);
  }

  async loadRegistryByJobId(
    jobId: string,
  ): Promise<GlobalEntityRegistry | null> {
    const reference = await readReferenceByJobId(jobId);
    if (!reference) {
      return null;
    }
    return await readJson<GlobalEntityRegistry>(
      registryPath(reference.fingerprint),
    );
  }

  async loadCompactTimelineByJobId(
    jobId: string,
  ): Promise<CompactTimeline | null> {
    const reference = await readReferenceByJobId(jobId);
    if (!reference) {
      return null;
    }
    return await readJson<CompactTimeline>(
      compactTimelinePath(reference.fingerprint),
    );
  }

  async readCachedQuestionContext<T>(
    fingerprint: string,
    questionHash: string,
  ): Promise<T | null> {
    return await readJson<T>(queryCachePath(fingerprint, questionHash));
  }

  async writeCachedQuestionContext(
    fingerprint: string,
    questionHash: string,
    value: unknown,
  ): Promise<void> {
    await writeJson(queryCachePath(fingerprint, questionHash), value);
  }

  questionHash(question: string): string {
    return hashSha256(question.trim().toLowerCase());
  }
}
