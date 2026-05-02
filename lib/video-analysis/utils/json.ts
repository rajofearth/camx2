import type { ZodSchema } from "zod";
import { VideoAnalysisError } from "../contracts/error-codes";

export async function readJsonFile<T>(
  fs: typeof import("node:fs/promises"),
  filePath: string,
  schema: ZodSchema<T>,
): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return schema.parse(JSON.parse(raw));
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"
    ) {
      return null;
    }
    throw new VideoAnalysisError(
      "INTERNAL_ERROR",
      500,
      `Failed to parse artifact: ${filePath}`,
    );
  }
}

export async function writeJsonFile(
  fs: typeof import("node:fs/promises"),
  filePath: string,
  value: unknown,
): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}
