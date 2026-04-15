/**
 * Image utilities: create square images, compress to WebP (quality), then optionally convert to PNG.
 *
 * Changes:
 * - Supports output selection via `output` option: 'png' (default) or 'webp'.
 * - Uses a smaller default `targetSize` (320) to reduce payload size and speed up processing.
 * - If `output: 'webp'` is requested, returns WebP directly (smaller than PNG).
 *
 * Performance tips:
 * - For fastest processing and smallest uploads, request WebP from the client and ensure the server accepts it.
 * - If the downstream requires PNG, we first apply lossy WebP compression then convert to PNG to preserve the compressed visual.
 */

export interface ImageProcessOptions {
  /**
   * The quality of the compressed WebP image.
   * 0.6 represents 60% quality. Range: 0..1
   */
  quality?: number;

  /**
   * How to make the image square.
   * - 'crop'  : center-crops the shorter side to make a square (no distortion)
   * - 'stretch': stretches the image to a square (may distort)
   */
  mode?: "crop" | "stretch";

  /**
   * Optional target size (pixel width and height) of the square output.
   * Defaults to 320 to balance speed and visual fidelity.
   */
  targetSize?: number;

  /**
   * Output format: 'png' (default) or 'webp'.
   * - 'webp' returns a compressed WebP Blob (significantly smaller).
   * - 'png' returns a PNG Blob (useful when server requires PNG).
   */
  output?: "png" | "webp" | "jpeg" | "jpg";
}

/**
 * Converts an input File or Blob (image) into a square image and returns either WebP or PNG.
 *
 * Behavior:
 * - If output === 'webp', this function decodes, crops/stretches, draws, and exports a WebP at the requested quality.
 * - If output === 'png', it first exports a compressed WebP (visual compression) then decodes that WebP and re-encodes to PNG.
 *
 * This lets you get the visual benefits of lossy compression while optionally producing PNGs when required.
 */
export async function makeSquareAndCompress(
  file: File | Blob,
  options: ImageProcessOptions = {},
): Promise<Blob> {
  const {
    quality = 0.6,
    mode = "crop",
    targetSize = 320, // smaller default to reduce size and speed processing
    output = "png",
  } = options;

  // Validate quality bounds
  const q = Math.max(0, Math.min(1, quality));

  // Utility: create an ImageBitmap from a Blob (fast decode). Fallback to Image element if needed.
  async function decodeToBitmap(blob: Blob): Promise<ImageBitmap> {
    if (typeof createImageBitmap === "function") {
      try {
        return await createImageBitmap(blob);
      } catch {
        // fallback to image element below
      }
    }

    return await new Promise<ImageBitmap>((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = async () => {
        try {
          if (typeof createImageBitmap === "function") {
            const bmp = await createImageBitmap(img);
            URL.revokeObjectURL(url);
            resolve(bmp);
            return;
          }

          const c = document.createElement("canvas");
          c.width = img.naturalWidth || img.width;
          c.height = img.naturalHeight || img.height;
          const ctx = c.getContext("2d");
          if (!ctx) {
            URL.revokeObjectURL(url);
            reject(new Error("Failed to get canvas 2D context"));
            return;
          }
          ctx.drawImage(img, 0, 0);
          const blob2 = await new Promise<Blob | null>((res) =>
            c.toBlob(res, "image/png"),
          );
          if (!blob2) {
            URL.revokeObjectURL(url);
            reject(new Error("Failed to create intermediate blob"));
            return;
          }
          const bmp2 = await createImageBitmap(blob2);
          URL.revokeObjectURL(url);
          resolve(bmp2);
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load image for decoding"));
      };
      img.src = url;
    });
  }

  // Utility: create canvas (prefer OffscreenCanvas)
  function makeCanvas(
    width: number,
    height: number,
  ): HTMLCanvasElement | OffscreenCanvas {
    const OffscreenCanvasCtor = globalThis.OffscreenCanvas;
    if (typeof OffscreenCanvasCtor !== "undefined") {
      try {
        return new OffscreenCanvasCtor(width, height);
      } catch {
        // fall through to HTMLCanvasElement
      }
    }
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    return c;
  }

  function isOffscreenCanvas(
    canvas: HTMLCanvasElement | OffscreenCanvas,
  ): canvas is OffscreenCanvas {
    return typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas;
  }

  // Utility: canvas -> blob promise wrapper
  function canvasToBlob(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    type: string,
    quality?: number,
  ): Promise<Blob | null> {
    if (isOffscreenCanvas(canvas)) {
      return canvas.convertToBlob({ type, quality });
    }
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), type, quality);
    });
  }

  // Decode source
  const sourceBitmap = await decodeToBitmap(file);
  try {
    const srcW = sourceBitmap.width;
    const srcH = sourceBitmap.height;

    // Compute square source/canvas size. Use provided targetSize if smaller than source to reduce work.
    const squareSourceSize =
      mode === "crop" ? Math.min(srcW, srcH) : Math.max(srcW, srcH);
    const finalSize = Math.max(
      1,
      Math.floor(Math.min(targetSize, squareSourceSize)),
    );

    let sx = 0;
    let sy = 0;
    let sWidth = srcW;
    let sHeight = srcH;

    if (mode === "crop") {
      sx = Math.floor((srcW - squareSourceSize) / 2);
      sy = Math.floor((srcH - squareSourceSize) / 2);
      sWidth = squareSourceSize;
      sHeight = squareSourceSize;
    } else {
      sx = 0;
      sy = 0;
      sWidth = srcW;
      sHeight = srcH;
    }

    // Draw source region into intermediate canvas sized to finalSize
    const intermediateCanvas = makeCanvas(finalSize, finalSize);
    const intermediateCtx = intermediateCanvas.getContext("2d");
    if (!intermediateCtx) {
      throw new Error("Failed to get 2D context for intermediate canvas");
    }

    intermediateCtx.fillStyle = "#FFFFFF";
    intermediateCtx.fillRect(0, 0, finalSize, finalSize);
    intermediateCtx.drawImage(
      sourceBitmap,
      sx,
      sy,
      sWidth,
      sHeight,
      0,
      0,
      finalSize,
      finalSize,
    );

    // Try exporting WebP (compressed visual). If WebP isn't supported, optionally
    // fall back to JPEG (for smaller size) when the caller requested WebP or JPEG.
    //
    // We also collect a processed blob variable so we can log sizes before returning.
    let processedBlob: Blob | null = null;

    const webpCandidate = await canvasToBlob(
      intermediateCanvas,
      "image/webp",
      q,
    );

    if (webpCandidate) {
      // If the caller explicitly requested WebP output, return it directly.
      if (output === "webp") {
        try {
          // Log sizes for debugging on the client before sending
          try {
            // `file` is the original input blob; log its size and the processed size.
            // Use console.debug so it can be filtered during normal runs.
            // eslint-disable-next-line no-console
            console.debug(
              `[image-utils] makeSquareAndCompress: originalSize=${(file as Blob).size} processedType=image/webp processedSize=${webpCandidate.size}`,
            );
        } catch {
            // ignore logging failures
          }
        } catch {
          // ignore logging failures
        }
        return webpCandidate;
      }

      // If caller requested JPEG explicitly, create and return JPEG from intermediate canvas
      if (output === "jpeg" || output === "jpg") {
        const jpegBlob = await canvasToBlob(
          intermediateCanvas,
          "image/jpeg",
          q,
        );
        if (!jpegBlob) {
          throw new Error("Failed to export JPEG");
        }
        try {
          // eslint-disable-next-line no-console
          console.debug(
            `[image-utils] makeSquareAndCompress: originalSize=${(file as Blob).size} processedType=image/jpeg processedSize=${jpegBlob.size}`,
          );
        } catch {}
        return jpegBlob;
      }

      // Otherwise, keep the webp candidate for subsequent decode -> PNG path.
      processedBlob = webpCandidate;
    } else {
      // WebP couldn't be produced (browser may not support it). If caller explicitly
      // requested JPEG output, attempt to produce JPEG now.
      if (output === "jpeg" || output === "jpg") {
        const jpegCandidate = await canvasToBlob(
          intermediateCanvas,
          "image/jpeg",
          q,
        );
        if (!jpegCandidate) {
          throw new Error("Failed to export intermediate JPEG");
        }
        // eslint-disable-next-line no-console
        console.debug(
          `[image-utils] makeSquareAndCompress: originalSize=${(file as Blob).size} processedType=image/jpeg processedSize=${jpegCandidate.size}`,
        );
        return jpegCandidate;
      }

      // If caller wanted WebP but it's not supported, try JPEG fallback.
      if (output === "webp") {
        const jpegCandidate = await canvasToBlob(
          intermediateCanvas,
          "image/jpeg",
          q,
        );
        if (!jpegCandidate) {
          throw new Error(
            "Failed to export intermediate WebP or JPEG fallback",
          );
        }
        // eslint-disable-next-line no-console
        console.warn(
          "[image-utils] WebP not supported, falling back to JPEG output",
        );
        try {
          // eslint-disable-next-line no-console
          console.debug(
            `[image-utils] makeSquareAndCompress: originalSize=${(file as Blob).size} processedType=image/jpeg processedSize=${jpegCandidate.size}`,
          );
        } catch {
          // ignore logging failures
        }
        return jpegCandidate;
      }

      // If we didn't need 'webp' or 'jpeg' output, but webp export failed, we cannot proceed to
      // the decode->PNG conversion path because we have no compressed visual. Throw.
      throw new Error("Failed to export intermediate WebP");
    }

    // At this point `processedBlob` is the WebP we will decode for PNG output.
    const compressedBitmap = await decodeToBitmap(processedBlob as Blob);

    // Draw compressed visual to final canvas and export PNG
    const finalCanvas = makeCanvas(finalSize, finalSize);
    const finalCtx = finalCanvas.getContext("2d");
    if (!finalCtx) {
      throw new Error("Failed to get 2D context for final canvas");
    }

    finalCtx.fillStyle = "#FFFFFF";
    finalCtx.fillRect(0, 0, finalSize, finalSize);
    finalCtx.drawImage(compressedBitmap, 0, 0, finalSize, finalSize);
    compressedBitmap.close?.();

    const pngBlob = await canvasToBlob(finalCanvas, "image/png");
    if (!pngBlob) throw new Error("Failed to convert to PNG");

    // Log sizes for debugging before returning
    try {
      // eslint-disable-next-line no-console
      console.debug(
        `[image-utils] makeSquareAndCompress: originalSize=${(file as Blob).size} processedType=image/png processedSize=${pngBlob.size}`,
      );
    } catch {
      // ignore logging failures
    }

    return pngBlob;
  } finally {
    try {
      if (typeof sourceBitmap.close === "function") sourceBitmap.close();
    } catch {}
  }
}
