import { randomUUID } from "node:crypto";
import type {
  VideoWatchChatMessage,
  VideoWatchJob,
  VideoWatchPhase,
  VideoWatchSummary,
} from "@/app/lib/video-watch-types";
import { VectorStoreService } from "@/lib/rag/vector-store.service";
import { AnalysisRepository } from "@/lib/video-analysis/analysis-repository";
import { ChatContextBuilder } from "@/lib/video-analysis/chat-context-builder";
import { FrameAnalyzerService } from "@/lib/video-analysis/frame-analyzer.service";
import { FrameExtractorService } from "@/lib/video-analysis/frame-extractor.service";
import {
  type ContextAwareLlmModel,
  embedTexts,
  getSummaryModel,
  resolveLlmModelKey,
  SUMMARY_MODEL_KEY,
} from "@/lib/video-analysis/lmstudio";
import { hashSha256 } from "@/lib/video-analysis/storage";
import type {
  EmbeddingRecord,
  FrameAnalysis,
  PersistedJobState,
} from "@/lib/video-analysis/types";
import { VideoStateService } from "@/lib/video-analysis/video-state.service";

const CHAT_CONTEXT_BUFFER_TOKENS = 128;
const CHAT_MAX_RESPONSE_TOKENS = 300;
const MIN_CHAT_PROMPT_TOKENS = 512;

interface InternalJob {
  id: string;
  fingerprint: string;
  sourceFileName: string;
  status: VideoWatchPhase;
  totalFrames: number;
  analyzedFrames: number;
  createdAt: string;
  updatedAt: string;
  cache: VideoWatchJob["cache"];
  error?: string;
  summary?: VideoWatchSummary;
  runPromise?: Promise<void>;
}

const jobsById = new Map<string, InternalJob>();
const jobsByFingerprint = new Map<string, InternalJob>();
const repository = new AnalysisRepository();
const frameExtractor = new FrameExtractorService();
const frameAnalyzer = new FrameAnalyzerService();
const vectorStore = new VectorStoreService();
const chatContextBuilder = new ChatContextBuilder(repository, vectorStore);

function toPublicJob(job: InternalJob): VideoWatchJob {
  return {
    ok: true,
    jobId: job.id,
    status: job.status,
    fingerprint: job.fingerprint,
    sourceFileName: job.sourceFileName,
    totalFrames: job.totalFrames,
    analyzedFrames: job.analyzedFrames,
    cache: job.cache,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    summary: job.summary,
    error: job.error,
  };
}

function removeJobFromMemory(job: InternalJob | undefined): void {
  if (!job) {
    return;
  }

  jobsById.delete(job.id);
  jobsByFingerprint.delete(job.fingerprint);
}

function mapPersistedSummary(
  summary: VideoWatchSummary | null | undefined,
): VideoWatchSummary | undefined {
  return summary ?? undefined;
}

async function persistState(job: InternalJob): Promise<void> {
  const state: PersistedJobState = {
    schemaVersion: 1,
    pipelineVersion: "video-watch-v1-stateful-rag-square-png-1fps",
    jobId: job.id,
    fingerprint: job.fingerprint,
    sourceFileName: job.sourceFileName,
    totalFrames: job.totalFrames,
    analyzedFrames: job.analyzedFrames,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    error: job.error,
  };
  await repository.saveJobState(state, {
    jobId: job.id,
    fingerprint: job.fingerprint,
  });
}

async function loadJobFromDisk(
  fingerprint: string,
): Promise<InternalJob | null> {
  const [state, summary] = await Promise.all([
    repository.loadJobStateByFingerprint(fingerprint),
    repository.loadSummaryByFingerprint(fingerprint),
  ]);
  if (!state) {
    return null;
  }

  const job: InternalJob = {
    id: state.jobId,
    fingerprint: state.fingerprint,
    sourceFileName: state.sourceFileName,
    status: state.status,
    totalFrames: state.totalFrames,
    analyzedFrames: state.analyzedFrames,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    cache: {
      fingerprint,
      cacheHit: true,
      source: "disk",
    },
    error: state.error,
    summary: mapPersistedSummary(summary),
  };

  jobsById.set(job.id, job);
  jobsByFingerprint.set(job.fingerprint, job);
  return job;
}

async function readSummaryForJob(
  jobId: string,
): Promise<VideoWatchSummary | null> {
  const job = jobsById.get(jobId);
  if (job?.summary) {
    return job.summary;
  }

  const summary = await repository.loadSummaryByJobId(jobId);
  if (!summary) {
    return null;
  }

  return summary;
}

async function indexEmbeddings(
  videoId: string,
  records: readonly EmbeddingRecord[],
): Promise<void> {
  await vectorStore.resetVideoIndex(videoId);
  await vectorStore.createIndexForVideo(videoId);

  const batchSize = 64;
  for (let index = 0; index < records.length; index += batchSize) {
    const chunk = records.slice(index, index + batchSize);
    const vectors = await embedTexts(
      chunk.map((record) => record.metadata.text),
    );
    for (const [chunkIndex, record] of chunk.entries()) {
      const vector = vectors[chunkIndex];
      if (!vector || vector.length === 0) {
        continue;
      }
      await vectorStore.addFrameEmbedding({
        ...record,
        vector,
      });
    }
  }
}

function buildFailureAnalysis(input: {
  readonly frameIndex: number;
  readonly timestampMs: number;
  readonly timestampLabel: string;
  readonly message: string;
  readonly rollingSummary: string;
}): FrameAnalysis {
  return {
    frameIndex: input.frameIndex,
    timestampMs: input.timestampMs,
    timestampLabel: input.timestampLabel,
    sceneChanged: false,
    skipped: false,
    summaryText: `Frame analysis failed: ${input.message}`,
    newOrUpdatedObjects: [],
    events: [],
    anomalies: [input.message],
    updatedRollingSummary: input.rollingSummary,
    rawResponse: "",
    modelKey: "unavailable",
    latencyMs: 0,
    error: input.message,
  };
}

async function processVideoJob(
  job: InternalJob,
  sourceByteLength: number,
): Promise<void> {
  try {
    await repository.initialize();
    job.status = "extracting";
    job.updatedAt = new Date().toISOString();
    await persistState(job);

    const manifest = await frameExtractor.extractFrames({
      videoId: job.fingerprint,
      fingerprint: job.fingerprint,
      sourceFileName: job.sourceFileName,
      sourceByteLength,
    });

    job.totalFrames = manifest.frameCount;
    job.status = "analyzing";
    job.updatedAt = new Date().toISOString();
    await persistState(job);

    const videoStateService = VideoStateService.initialize(job.fingerprint);
    let lastAnalyzedChecksum: string | null = null;
    let processedFrames = 0;

    for (const frame of manifest.frames) {
      const existing = await repository.readFrameAnalysis(
        job.fingerprint,
        frame.frameIndex,
      );
      if (existing) {
        videoStateService.updateFromFrame(existing);
        processedFrames += 1;
        if (processedFrames % 60 === 0) {
          videoStateService.trimOldObjects();
        }
        if (!existing.skipped) {
          lastAnalyzedChecksum = frame.checksum;
        }
        continue;
      }

      const currentState = videoStateService.getCurrentState();
      let analysis: FrameAnalysis;
      try {
        if (lastAnalyzedChecksum && lastAnalyzedChecksum === frame.checksum) {
          analysis = frameAnalyzer.createSkippedFrameAnalysis({
            frameIndex: frame.frameIndex,
            timestampMs: frame.timestampMs,
            timestampLabel: frame.timestampLabel,
            currentState,
            reason: "frame checksum matches the last analyzed frame",
          });
        } else {
          analysis = await frameAnalyzer.analyzeFrame({
            frameIndex: frame.frameIndex,
            timestampMs: frame.timestampMs,
            timestampLabel: frame.timestampLabel,
            imagePath: frame.imagePath,
            currentState,
          });
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unknown frame analysis error";
        analysis = buildFailureAnalysis({
          frameIndex: frame.frameIndex,
          timestampMs: frame.timestampMs,
          timestampLabel: frame.timestampLabel,
          message,
          rollingSummary: currentState.rollingSummary,
        });
      }

      await repository.saveFrameAnalysis(job.fingerprint, analysis);
      videoStateService.updateFromFrame(analysis);
      processedFrames += 1;
      if (processedFrames % 60 === 0) {
        videoStateService.trimOldObjects();
      }
      if (!analysis.skipped) {
        lastAnalyzedChecksum = frame.checksum;
      }

      job.analyzedFrames = processedFrames;
      job.updatedAt = new Date().toISOString();
      await persistState(job);
    }

    job.status = "combining";
    job.updatedAt = new Date().toISOString();
    await persistState(job);

    const finalized = await repository.finalizeAnalysis({
      videoId: job.fingerprint,
      fingerprint: job.fingerprint,
      currentState: videoStateService.getCurrentState(),
    });
    await indexEmbeddings(job.fingerprint, finalized.embeddingRecords);

    job.summary = finalized.summary;
    job.totalFrames = manifest.frameCount;
    job.analyzedFrames = manifest.frameCount;
    job.status = "completed";
    job.updatedAt = new Date().toISOString();
    job.error = undefined;
    await persistState(job);
    VideoStateService.clear(job.fingerprint);
  } catch (error) {
    job.status = "error";
    job.error =
      error instanceof Error ? error.message : "Unknown video watch error";
    job.updatedAt = new Date().toISOString();
    await persistState(job);
    VideoStateService.clear(job.fingerprint);
  }
}

export async function createOrResumeVideoJob(input: {
  readonly sourceFileName: string;
  readonly videoBuffer: Buffer;
  readonly clientFingerprint?: string | null;
  readonly forceRefresh?: boolean;
}): Promise<VideoWatchJob> {
  await repository.initialize();

  const fingerprint = hashSha256(input.videoBuffer);
  let existingJob =
    jobsByFingerprint.get(fingerprint) ?? (await loadJobFromDisk(fingerprint));

  if (
    input.clientFingerprint &&
    input.clientFingerprint.length > 0 &&
    input.clientFingerprint !== fingerprint
  ) {
    throw new Error("Client fingerprint did not match uploaded video bytes");
  }

  if (input.forceRefresh) {
    removeJobFromMemory(existingJob ?? undefined);
    await repository.removeArtifacts({ fingerprint });
    await vectorStore.resetVideoIndex(fingerprint);
    existingJob = null;
  }

  if (existingJob?.status === "completed" && existingJob.summary) {
    existingJob.cache = {
      fingerprint,
      cacheHit: true,
      source: existingJob.cache.source === "memory" ? "memory" : "disk",
    };
    existingJob.updatedAt = new Date().toISOString();
    return toPublicJob(existingJob);
  }

  if (existingJob?.runPromise) {
    existingJob.cache = {
      fingerprint,
      cacheHit: true,
      source: "memory",
    };
    return toPublicJob(existingJob);
  }

  await frameExtractor.writeSourceVideo({
    fingerprint,
    sourceFileName: input.sourceFileName,
    videoBuffer: input.videoBuffer,
  });

  const job =
    existingJob ??
    ({
      id: randomUUID(),
      fingerprint,
      sourceFileName: input.sourceFileName,
      status: "uploading",
      totalFrames: 0,
      analyzedFrames: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      cache: {
        fingerprint,
        cacheHit: false,
        source: "upload",
      },
    } satisfies InternalJob);

  job.sourceFileName = input.sourceFileName;
  job.updatedAt = new Date().toISOString();
  jobsById.set(job.id, job);
  jobsByFingerprint.set(fingerprint, job);

  await persistState(job);

  job.runPromise = processVideoJob(job, input.videoBuffer.length)
    .catch(() => {
      // Process errors are captured into job state already.
    })
    .finally(() => {
      job.runPromise = undefined;
    });

  return toPublicJob(job);
}

export async function clearVideoJobCache(input: {
  readonly jobId?: string | null;
  readonly fingerprint?: string | null;
}): Promise<string | null> {
  const fingerprint =
    input.fingerprint ||
    (input.jobId
      ? await repository.resolveFingerprintByJobId(input.jobId)
      : null);

  if (!fingerprint) {
    return null;
  }

  removeJobFromMemory(jobsByFingerprint.get(fingerprint));
  await repository.removeArtifacts({ fingerprint });
  await vectorStore.resetVideoIndex(fingerprint);
  return fingerprint;
}

export async function getVideoJobStatus(input: {
  readonly jobId?: string | null;
  readonly fingerprint?: string | null;
}): Promise<VideoWatchJob | null> {
  const byJobId = input.jobId ? jobsById.get(input.jobId) : null;
  if (byJobId) {
    return toPublicJob(byJobId);
  }

  const byFingerprint = input.fingerprint
    ? jobsByFingerprint.get(input.fingerprint)
    : null;
  if (byFingerprint) {
    return toPublicJob(byFingerprint);
  }

  const fingerprint =
    input.fingerprint ||
    (input.jobId
      ? await repository.resolveFingerprintByJobId(input.jobId)
      : null);
  if (!fingerprint) {
    return null;
  }

  const loaded = await loadJobFromDisk(fingerprint);
  return loaded ? toPublicJob(loaded) : null;
}

type LlmChatMessage = {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
};

function normalizeChatHistory(
  messages: readonly VideoWatchChatMessage[] | undefined,
  question: string,
): VideoWatchChatMessage[] {
  const normalized =
    messages?.flatMap((message) => {
      const content = message.content.trim();
      if (!content) {
        return [];
      }

      return [
        {
          role: message.role,
          content,
        } satisfies VideoWatchChatMessage,
      ];
    }) ?? [];

  if (!normalized.length) {
    return [
      {
        role: "user",
        content: question,
      },
    ];
  }

  const latestMessage = normalized.at(-1);
  if (latestMessage?.role === "user" && latestMessage.content === question) {
    return normalized;
  }

  return [
    ...normalized,
    {
      role: "user",
      content: question,
    },
  ];
}

function trimTextToCharLimit(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }

  if (limit <= 1) {
    return text.slice(0, limit);
  }

  return `${text.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
}

function buildPromptMessages(input: {
  readonly contextBlock: string;
  readonly history: readonly VideoWatchChatMessage[];
  readonly latestQuestion: string;
}): LlmChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "Use ONLY the following retrieved video context with persistent object IDs and exact timestamps. Answer precisely.",
        "Use earlier turns to resolve follow-up questions, but let the supplied retrieved context overrule prior assistant guesses.",
        "Give direct answers, mention timestamps when supported, and say clearly when the evidence does not support a claim.",
        "",
        input.contextBlock,
      ].join("\n"),
    },
    ...input.history.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    {
      role: "user",
      content: input.latestQuestion,
    },
  ];
}

async function countChatTokens(
  model: ContextAwareLlmModel,
  history: readonly LlmChatMessage[],
): Promise<number> {
  const prompt = await model.applyPromptTemplate(history);
  return await model.countTokens(prompt);
}

async function buildChatPrompt(
  model: ContextAwareLlmModel,
  contextBlock: string,
  conversation: readonly VideoWatchChatMessage[],
): Promise<{ chat: LlmChatMessage[]; maxTokens: number }> {
  const latestQuestion = conversation.at(-1)?.content ?? "";
  const priorHistory = conversation.slice(0, -1);
  const modelInfo = await model.getModelInfo();
  const contextWindow = Math.max(
    MIN_CHAT_PROMPT_TOKENS + CHAT_CONTEXT_BUFFER_TOKENS,
    Math.min(modelInfo.contextLength, modelInfo.maxContextLength),
  );
  const maxTokens = Math.max(
    128,
    Math.min(CHAT_MAX_RESPONSE_TOKENS, Math.floor(contextWindow * 0.2)),
  );
  const promptBudget = Math.max(
    MIN_CHAT_PROMPT_TOKENS,
    contextWindow - maxTokens - CHAT_CONTEXT_BUFFER_TOKENS,
  );

  let historyStartIndex = 0;
  let contextCharLimit = Math.max(240, contextBlock.length);
  let fallbackChat = buildPromptMessages({
    contextBlock,
    history: priorHistory.slice(historyStartIndex),
    latestQuestion,
  });

  while (true) {
    const candidateChat = buildPromptMessages({
      contextBlock: trimTextToCharLimit(contextBlock, contextCharLimit),
      history: priorHistory.slice(historyStartIndex),
      latestQuestion,
    });

    fallbackChat = candidateChat;

    if ((await countChatTokens(model, candidateChat)) <= promptBudget) {
      return {
        chat: candidateChat,
        maxTokens,
      };
    }

    if (historyStartIndex < priorHistory.length) {
      historyStartIndex += 1;
      continue;
    }

    if (contextCharLimit > 240) {
      contextCharLimit = Math.max(240, Math.floor(contextCharLimit * 0.75));
      continue;
    }

    return {
      chat: fallbackChat,
      maxTokens,
    };
  }
}

export async function answerQuestionAboutVideo(input: {
  readonly jobId: string;
  readonly question: string;
  readonly messages?: readonly VideoWatchChatMessage[];
}): Promise<{ answer: string; modelKey: string }> {
  const summary = await readSummaryForJob(input.jobId);
  if (!summary) {
    throw new Error("Video analysis is not ready yet");
  }

  const contextBlock = await chatContextBuilder.buildContext({
    jobId: input.jobId,
    question: input.question,
  });
  const resolvedSummaryModelKey = await resolveLlmModelKey(SUMMARY_MODEL_KEY);
  const model = await getSummaryModel();
  const conversation = normalizeChatHistory(input.messages, input.question);
  const prompt = await buildChatPrompt(model, contextBlock, conversation);

  const response = await model.respond(prompt.chat, {
    temperature: 0.1,
    maxTokens: prompt.maxTokens,
    contextOverflowPolicy: "rollingWindow",
  });

  const answer = response?.content?.trim();
  if (!answer) {
    throw new Error("LM Studio returned an empty answer");
  }

  return {
    answer,
    modelKey: resolvedSummaryModelKey,
  };
}
