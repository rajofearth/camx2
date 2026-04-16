import sharp from "sharp";

export interface ServerImageProcessOptions {
  // Compression quality, 0..1 (default 0.6)
  quality?: number;
  // 'crop': center-crop square, 'stretch': resize and distort
  mode?: "crop" | "stretch";
  // Final square dimension in px (default 320)
  targetSize?: number;
  // Output format
  output?: "png" | "webp" | "jpeg" | "jpg";
}

// Efficient, parity-matching server-side image normalization & compression.
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

  if (!Buffer.isBuffer(input) || input.length === 0)
    throw new Error("Input image buffer is empty");

  const q = Math.max(0, Math.min(1, quality));
  const size = Math.max(1, Math.floor(targetSize));
  const base = sharp(input, { failOn: "error" }).rotate().removeAlpha();

  // Square and resize
  const resized =
    mode === "crop"
      ? base.resize(size, size, { fit: "cover", position: "centre", kernel: sharp.kernel.lanczos3 })
      : base.resize(size, size, { fit: "fill", kernel: sharp.kernel.lanczos3 });

  if (output === "webp")
    return resized.webp({ quality: Math.round(q * 100) }).toBuffer();

  if (output === "jpeg" || output === "jpg")
    return resized.jpeg({ quality: Math.round(q * 100), mozjpeg: true }).toBuffer();

  // For PNG, match client: visually compress first, then PNG
  const lossyWebp = await resized.webp({ quality: Math.round(q * 100) }).toBuffer();
  return sharp(lossyWebp, { failOn: "error" }).removeAlpha().png().toBuffer();
}
