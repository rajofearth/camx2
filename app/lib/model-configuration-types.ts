/** One row from `/api/lmstudio/models` (LLM models available in LM Studio). */
export interface LlmModelOptionDto {
  readonly modelKey: string;
  readonly identifier: string;
  readonly isLoaded: boolean;
  readonly vision: boolean | null;
  readonly trainedForToolUse: boolean | null;
  readonly maxContextLength: number | null;
}
