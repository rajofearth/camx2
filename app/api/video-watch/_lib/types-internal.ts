import type {
  VideoWatchJob,
  VideoWatchPhase,
  VideoWatchSummary,
} from "@/app/lib/video-watch-types";

export interface PersistedFrameInfo {
  readonly frameIndex: number;
  readonly timestampMs: number;
  readonly timestampLabel: string;
  readonly imagePath: string;
  readonly checksum: string;
  readonly width: number | null;
  readonly height: number | null;
}

export interface PersistedManifest {
  readonly videoFingerprint: string;
  readonly sourceFileName: string;
  readonly sourceByteLength: number;
  readonly videoPath: string;
  readonly frameCount: number;
  readonly frames: PersistedFrameInfo[];
  readonly createdAt: string;
}

export interface PersistedState {
  readonly jobId: string;
  readonly fingerprint: string;
  readonly sourceFileName: string;
  readonly totalFrames: number;
  readonly analyzedFrames: number;
  readonly status: VideoWatchPhase;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly error?: string;
}

export interface PersistedSummaryFile {
  readonly summary: VideoWatchSummary;
}

export interface InternalJob {
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
