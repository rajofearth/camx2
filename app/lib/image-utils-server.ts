import sharp from "sharp";

export interface ServerImageProcessOptions {
  /**
   * The quality of the compressed visual pass.
   * Range: 0..1
   */
  quality?: number;

  /**
   * How to make the image square.
   * - "crop": center-crops to a square without distortion
   * - "stretch": resizes to a square and may distort the image
   */
  mode?: "crop" | "stretch";

  /**
   * Final square width/height in pixels.
   */
  targetSize?: number;

  /**
   * Final output format.
   */
  output?: "png" | "webp" | "jpeg" | "jpg";
}

/**
 * Server-side equivalent of the browser image utility:
 * 1. decode the input image
 * 2. make it square
 * 3. apply a lossy compression pass
 * 4. optionally re-encode as PNG
 *
 * For `output: "png"`, this intentionally compresses to WebP first and then
 * converts that compressed visual result to PNG, matching the client-side
 * behavior as closely as possible.
 */
export async function makeSquareAndCompressServer(
  input: Buffer,
  options: ServerImageProcessOptions = {},
): Promise<Buffer> {
  const {
    quality = 0.6,
    mode = "crop",
    targetSize = 320,
    output = "png",
  } = options;

  if (!Buffer.isBuffer(input) || input.length === 0) {
    throw new Error("Input image buffer is empty");
  }

  const normalizedQuality = Math.max(0, Math.min(1, quality));
  const webpQuality = Math.round(normalizedQuality * 100);
  const jpegQuality = Math.round(normalizedQuality * 100);
  const finalSize = Math.max(1, Math.floor(targetSize));

  const base = sharp(input, { failOn: "error" }).rotate().removeAlpha();

  const squared =
    mode === "crop"
      ? base.resize(finalSize, finalSize, {
          fit: "cover",
          position: "centre",
          kernel: sharp.kernel.lanczos3,
        })
      : base.resize(finalSize, finalSize, {
          fit: "fill",
          kernel: sharp.kernel.lanczos3,
        });

  if (output === "webp") {
    return await squared
      .clone()
      .webp({
        quality: webpQuality,
      })
      .toBuffer();
  }

  if (output === "jpeg" || output === "jpg") {
    return await squared
      .clone()
      .jpeg({
        quality: jpegQuality,
        mozjpeg: true,
      })
      .toBuffer();
  }

  const compressedWebp = await squared
    .clone()
    .webp({
      quality: webpQuality,
    })
    .toBuffer();

  return await sharp(compressedWebp, { failOn: "error" })
    .removeAlpha()
    .png()
    .toBuffer();
}
