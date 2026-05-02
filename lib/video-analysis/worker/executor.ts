import type { VideoAnalysisJob } from "@/types/video-analysis";
import type { VideoAnalysisStore } from "../storage/types";

export class VideoAnalysisWorker {
  private readonly runningJobs = new Map<string, Promise<void>>();

  constructor(private readonly store: VideoAnalysisStore) {}

  start(job: VideoAnalysisJob, run: () => Promise<void>): Promise<void> {
    const existing = this.runningJobs.get(job.jobId);
    if (existing) return existing;

    const promise = run().finally(() => {
      this.runningJobs.delete(job.jobId);
    });
    this.runningJobs.set(job.jobId, promise);
    return promise;
  }

  isRunning(jobId: string): boolean {
    return this.runningJobs.has(jobId);
  }

  async removeArtifacts(fingerprint: string): Promise<void> {
    await this.store.clearJob(fingerprint);
  }
}
