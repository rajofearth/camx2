import { randomUUID } from "node:crypto";
import type {
  VideoAnalysisChatMessage,
  VideoAnalysisFrameArtifact,
  VideoAnalysisJob,
  VideoAnalysisProviderConfig,
  VideoAnalysisSummaryArtifact,
  VideoAnalysisTimelineEntry,
} from "@/types/video-analysis";
import { VideoAnalysisError } from "../contracts/error-codes";
import type { PersistedVideoAnalysisJob } from "../domain/internal";
import { createProgress, withProgressFrameCount } from "../domain/stages";
import { analyzeFrames } from "../pipeline/analyze-frames";
import { answerChatQuestion } from "../pipeline/answer-chat";
import { buildTimeline } from "../pipeline/build-timeline";
import { extractVideoFrames } from "../pipeline/extract-video";
import { LmStudioVideoAnalysisProvider } from "../providers/lmstudio-provider";
import type { VideoAnalysisProvider } from "../providers/types";
import { LocalVideoAnalysisStore } from "../storage/local-store";
import { sourceVideoPath } from "../storage/paths";
import type { VideoAnalysisStore } from "../storage/types";
import { sha256 } from "../utils/hash";
import { VideoAnalysisWorker } from "../worker/executor";

class VideoAnalysisApplicationService {
  private readonly store: VideoAnalysisStore;
  private readonly worker: VideoAnalysisWorker;
  private readonly jobsById = new Map<string, PersistedVideoAnalysisJob>();
  private readonly jobsByFingerprint = new Map<
    string,
    PersistedVideoAnalysisJob
  >();

  constructor(store?: VideoAnalysisStore) {
    this.store = store ?? new LocalVideoAnalysisStore();
    this.worker = new VideoAnalysisWorker(this.store);
  }

  private providerFor(
    config: VideoAnalysisProviderConfig,
  ): VideoAnalysisProvider {
    return new LmStudioVideoAnalysisProvider(config);
  }

  private toPublicJob(job: PersistedVideoAnalysisJob): VideoAnalysisJob {
    const { providerConfig: _providerConfig, ...publicJob } = job;
    return publicJob;
  }

  private remember(job: PersistedVideoAnalysisJob): PersistedVideoAnalysisJob {
    this.jobsById.set(job.jobId, job);
    this.jobsByFingerprint.set(job.fingerprint, job);
    return job;
  }

  private async persist(
    job: PersistedVideoAnalysisJob,
  ): Promise<PersistedVideoAnalysisJob> {
    this.remember(job);
    await this.store.saveJob(job);
    return job;
  }

  private async loadByFingerprint(
    fingerprint: string,
  ): Promise<PersistedVideoAnalysisJob | null> {
    const mem = this.jobsByFingerprint.get(fingerprint);
    if (mem) return mem;
    const disk = await this.store.loadJobByFingerprint(fingerprint);
    return disk ? this.remember(disk) : null;
  }

  private async loadById(
    jobId: string,
  ): Promise<PersistedVideoAnalysisJob | null> {
    const mem = this.jobsById.get(jobId);
    if (mem) return mem;
    const disk = await this.store.loadJobById(jobId);
    return disk ? this.remember(disk) : null;
  }

  async createJob(input: {
    readonly sourceFileName: string;
    readonly videoBuffer: Buffer;
    readonly clientFingerprint?: string | null;
    readonly forceRefresh?: boolean;
    readonly providerConfig: VideoAnalysisProviderConfig;
  }): Promise<VideoAnalysisJob> {
    await this.store.ensureRoot();
    const fingerprint = sha256(input.videoBuffer);
    if (
      input.clientFingerprint &&
      input.clientFingerprint.length > 0 &&
      input.clientFingerprint !== fingerprint
    ) {
      throw new VideoAnalysisError(
        "BAD_REQUEST",
        400,
        "Client fingerprint did not match uploaded video bytes",
      );
    }

    const existing = await this.loadByFingerprint(fingerprint);
    if (input.forceRefresh && existing) {
      this.jobsById.delete(existing.jobId);
      this.jobsByFingerprint.delete(existing.fingerprint);
      await this.worker.removeArtifacts(existing.fingerprint);
    } else if (existing) {
      const cacheSource = this.worker.isRunning(existing.jobId)
        ? "memory"
        : "disk";
      const cached = {
        ...existing,
        cache: {
          fingerprint,
          cacheHit: true,
          source: cacheSource,
        },
      } satisfies PersistedVideoAnalysisJob;
      return this.toPublicJob(await this.persist(cached));
    }

    await this.store.writeSourceVideo(
      fingerprint,
      input.sourceFileName,
      input.videoBuffer,
    );
    const job: PersistedVideoAnalysisJob = {
      ok: true,
      jobId: randomUUID(),
      fingerprint,
      sourceFileName: input.sourceFileName,
      status: "queued",
      progress: createProgress("queued"),
      provider: input.providerConfig.provider,
      cache: {
        fingerprint,
        cacheHit: false,
        source: "upload",
      },
      providerConfig: input.providerConfig,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.persist(job);

    void this.worker.start(job, async () => {
      await this.runJob(
        job.jobId,
        input.videoBuffer.length,
        input.providerConfig,
      );
    });

    return this.toPublicJob(job);
  }

  private async runJob(
    jobId: string,
    sourceByteLength: number,
    providerConfig: VideoAnalysisProviderConfig,
  ): Promise<void> {
    const current = await this.loadById(jobId);
    if (!current) return;
    const provider = this.providerFor(providerConfig);

    try {
      let job = await this.persist({
        ...current,
        status: "extracting",
        progress: createProgress("extracting"),
        updatedAt: new Date().toISOString(),
      });

      const manifest =
        (await this.store.readManifest(job.fingerprint)) ??
        (await extractVideoFrames({
          fingerprint: job.fingerprint,
          sourceFileName: job.sourceFileName,
          sourceByteLength,
          sourcePath: sourceVideoPath(job.fingerprint, job.sourceFileName),
          store: this.store,
        }));

      job = await this.persist({
        ...job,
        status: "analyzing",
        progress: createProgress("analyzing", manifest.frameCount, 0),
        updatedAt: new Date().toISOString(),
      });

      const frames = await analyzeFrames({
        fingerprint: job.fingerprint,
        manifest,
        provider,
        store: this.store,
        concurrency: 1,
        onFrameComplete: async (completed, total) => {
          const fresh = await this.loadById(jobId);
          if (!fresh) return;
          await this.persist({
            ...fresh,
            status: "analyzing",
            progress: withProgressFrameCount(
              createProgress("analyzing", total, completed),
              completed,
              total,
            ),
            updatedAt: new Date().toISOString(),
          });
        },
      });

      job = await this.persist({
        ...job,
        status: "summarizing",
        progress: createProgress(
          "summarizing",
          manifest.frameCount,
          manifest.frameCount,
        ),
        updatedAt: new Date().toISOString(),
      });

      const timeline = buildTimeline(frames);
      await this.store.saveTimeline(job.fingerprint, timeline);
      const summary = await provider.summarizeTimeline(timeline);
      await this.store.saveSummary(job.fingerprint, summary);

      await this.persist({
        ...job,
        status: "completed",
        progress: createProgress(
          "completed",
          manifest.frameCount,
          manifest.frameCount,
        ),
        summary,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      const failed = await this.loadById(jobId);
      if (!failed) return;
      await this.persist({
        ...failed,
        status: "error",
        progress: {
          ...failed.progress,
          stage: "error",
        },
        updatedAt: new Date().toISOString(),
        error:
          error instanceof Error
            ? error.message
            : "Unknown video analysis error",
      });
    }
  }

  async getJobStatus(input: {
    readonly jobId?: string | null;
    readonly fingerprint?: string | null;
  }): Promise<VideoAnalysisJob | null> {
    if (input.jobId) {
      const job = await this.loadById(input.jobId);
      return job ? this.toPublicJob(job) : null;
    }
    if (input.fingerprint) {
      const job = await this.loadByFingerprint(input.fingerprint);
      return job ? this.toPublicJob(job) : null;
    }
    return null;
  }

  async clearJob(jobId: string): Promise<VideoAnalysisJob | null> {
    const job = await this.loadById(jobId);
    if (!job) return null;
    this.jobsById.delete(job.jobId);
    this.jobsByFingerprint.delete(job.fingerprint);
    await this.worker.removeArtifacts(job.fingerprint);
    return this.toPublicJob(job);
  }

  async answerQuestion(input: {
    readonly jobId: string;
    readonly question: string;
    readonly messages: readonly VideoAnalysisChatMessage[];
  }): Promise<{ readonly answer: string; readonly modelKey: string }> {
    const job = await this.loadById(input.jobId);
    if (!job) {
      throw new VideoAnalysisError(
        "NOT_FOUND",
        404,
        "Video analysis job not found",
      );
    }
    const summary = await this.store.readSummary(job.fingerprint);
    if (!summary) {
      throw new VideoAnalysisError(
        "BAD_REQUEST",
        400,
        "Video analysis summary is not ready yet",
      );
    }
    const timeline = await this.store.readTimeline(job.fingerprint);
    const provider = this.providerFor(job.providerConfig);
    return answerChatQuestion({
      provider,
      summary,
      timeline,
      question: input.question,
      messages: input.messages,
    });
  }

  async getArtifacts(jobId: string): Promise<{
    readonly job: VideoAnalysisJob;
    readonly frames: readonly VideoAnalysisFrameArtifact[];
    readonly timeline: readonly VideoAnalysisTimelineEntry[];
    readonly summary: VideoAnalysisSummaryArtifact | null;
  }> {
    const job = await this.loadById(jobId);
    if (!job) {
      throw new VideoAnalysisError(
        "NOT_FOUND",
        404,
        "Video analysis job not found",
      );
    }
    const [frames, timeline, summary] = await Promise.all([
      this.store.readFrameArtifacts(job.fingerprint),
      this.store.readTimeline(job.fingerprint),
      this.store.readSummary(job.fingerprint),
    ]);
    return { job: this.toPublicJob(job), frames, timeline, summary };
  }
}

export const videoAnalysisService = new VideoAnalysisApplicationService();
