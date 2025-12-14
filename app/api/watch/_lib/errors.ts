export type WatchErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "UPSTREAM_ERROR"
  | "INTERNAL_ERROR";

export class BadRequestError extends Error {
  public readonly errorCode: WatchErrorCode = "BAD_REQUEST";
  public readonly details?: Readonly<Record<string, unknown>>;

  public constructor(
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "BadRequestError";
    this.details = details;
  }
}

export function toHttpStatus(errorCode: WatchErrorCode): number {
  switch (errorCode) {
    case "BAD_REQUEST":
      return 400;
    case "UNAUTHORIZED":
      return 401;
    case "UPSTREAM_ERROR":
      return 502;
    case "INTERNAL_ERROR":
      return 500;
  }
}
