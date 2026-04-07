export interface CameraSourceRef {
  readonly video: HTMLVideoElement | null;
  readonly getScreenshot: () => string | null;
}
