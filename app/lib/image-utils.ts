export interface ImageProcessOptions {
  quality?: number; // WebP/JPEG compression, 0..1. Default: 0.6
  mode?: "crop" | "stretch"; // 'crop': center square, 'stretch': fill
  targetSize?: number; // px side. Default: 320
  output?: "png" | "webp" | "jpeg" | "jpg"; // Default: 'png'
}

// Core image square & compress utility
export async function makeSquareAndCompress(
  file: File | Blob,
  options: ImageProcessOptions = {},
): Promise<Blob> {
  const {
    quality = 0.6,
    mode = "crop",
    targetSize = 320,
    output = "png",
  } = options;

  const q = Math.max(0, Math.min(1, quality));

  // Decode Blob to ImageBitmap, fall back to img & canvas
  async function decodeToBitmap(blob: Blob): Promise<ImageBitmap> {
    if (typeof createImageBitmap === "function") {
      try {
        return await createImageBitmap(blob);
      } catch {}
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
            reject(new Error("No 2d context"));
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
        reject(new Error("Failed to load image"));
      };
      img.src = url;
    });
  }

  // Create canvas (prefers offscreen when supported)
  function makeCanvas(
    w: number,
    h: number,
  ): HTMLCanvasElement | OffscreenCanvas {
    const OffscreenCanvasCtor = globalThis.OffscreenCanvas;
    if (typeof OffscreenCanvasCtor !== "undefined") {
      try {
        return new OffscreenCanvasCtor(w, h);
      } catch {}
    }
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }

  function isOffscreenCanvas(
    c: HTMLCanvasElement | OffscreenCanvas,
  ): c is OffscreenCanvas {
    return (
      typeof OffscreenCanvas !== "undefined" && c instanceof OffscreenCanvas
    );
  }

  function get2dContext(
    canvas: HTMLCanvasElement | OffscreenCanvas,
  ): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No 2d context");
    return context;
  }

  // Canvas to Blob, async
  function canvasToBlob(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    type: string,
    quality?: number,
  ): Promise<Blob | null> {
    if (isOffscreenCanvas(canvas))
      return canvas.convertToBlob({ type, quality });
    return new Promise((resolve) => {
      (canvas as HTMLCanvasElement).toBlob(
        (blob) => resolve(blob),
        type,
        quality,
      );
    });
  }

  const srcBitmap = await decodeToBitmap(file);
  try {
    const srcW = srcBitmap.width,
      srcH = srcBitmap.height;
    const squareSrcSize =
      mode === "crop" ? Math.min(srcW, srcH) : Math.max(srcW, srcH);
    const finalSize = Math.max(
      1,
      Math.floor(Math.min(targetSize, squareSrcSize)),
    );

    let sx = 0,
      sy = 0,
      sWidth = srcW,
      sHeight = srcH;
    if (mode === "crop") {
      sx = Math.floor((srcW - squareSrcSize) / 2);
      sy = Math.floor((srcH - squareSrcSize) / 2);
      sWidth = sHeight = squareSrcSize;
    }

    // Draw normalized image into a square
    const tmpCanvas = makeCanvas(finalSize, finalSize);
    const ctx = get2dContext(tmpCanvas);
    ctx.fillStyle = "#FFF";
    ctx.fillRect(0, 0, finalSize, finalSize);
    ctx.drawImage(
      srcBitmap,
      sx,
      sy,
      sWidth,
      sHeight,
      0,
      0,
      finalSize,
      finalSize,
    );

    // Try exporting to WebP; if not supported, will try JPEG if needed
    let resultBlob: Blob | null = null;
    const webpBlob = await canvasToBlob(tmpCanvas, "image/webp", q);

    if (webpBlob) {
      if (output === "webp") return webpBlob;
      if (output === "jpeg" || output === "jpg") {
        const jpegBlob = await canvasToBlob(tmpCanvas, "image/jpeg", q);
        if (!jpegBlob) throw new Error("JPEG export failed");
        return jpegBlob;
      }
      resultBlob = webpBlob; // For PNG conversion below
    } else {
      if (output === "jpeg" || output === "jpg") {
        const jpegBlob = await canvasToBlob(tmpCanvas, "image/jpeg", q);
        if (!jpegBlob) throw new Error("JPEG export failed");
        return jpegBlob;
      }
      if (output === "webp") {
        const jpegBlob = await canvasToBlob(tmpCanvas, "image/jpeg", q);
        if (!jpegBlob) throw new Error("WebP and JPEG export failed");
        return jpegBlob;
      }
      throw new Error("WebP export failed");
    }

    // For 'png' output, decode the lossy compressed version to bitmap, then export to PNG to preserve visuals
    const bitmap = await decodeToBitmap(resultBlob as Blob);
    const finalCanvas = makeCanvas(finalSize, finalSize);
    const finalCtx = get2dContext(finalCanvas);
    finalCtx.fillStyle = "#FFF";
    finalCtx.fillRect(0, 0, finalSize, finalSize);
    finalCtx.drawImage(bitmap, 0, 0, finalSize, finalSize);
    bitmap.close?.();

    const pngBlob = await canvasToBlob(finalCanvas, "image/png");
    if (!pngBlob) throw new Error("PNG export failed");
    return pngBlob;
  } finally {
    try {
      srcBitmap.close?.();
    } catch {}
  }
}
