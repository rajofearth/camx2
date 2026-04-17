// Efficient image processing worker.

type InMsg = {
  id?: string;
  imageDataUrl?: string;
  arrayBuffer?: ArrayBuffer;
  mimeType?: string;
  options?: {
    quality?: number;
    mode?: "crop" | "stretch";
    targetSize?: number;
    output?: "png" | "webp";
  };
};

const workerScope = self as typeof globalThis & {
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

workerScope.addEventListener("message", async (ev: MessageEvent) => {
  const msg = ev.data as InMsg;
  const t0 = performance.now();

  try {
    const opts = msg.options ?? {};
    const quality = typeof opts.quality === "number" ? opts.quality : 0.6;
    const mode = opts.mode === "stretch" ? "stretch" : "crop";
    const targetSize =
      typeof opts.targetSize === "number"
        ? Math.max(1, Math.floor(opts.targetSize))
        : undefined;
    const output = opts.output === "png" ? "png" : "webp";

    const preprocessStart = performance.now();
    let inputBlob: Blob;
    if (msg.arrayBuffer) {
      inputBlob = new Blob([msg.arrayBuffer], {
        type: msg.mimeType || "image/jpeg",
      });
    } else if (msg.imageDataUrl) {
      const res = await fetch(msg.imageDataUrl);
      if (!res.ok) throw new Error(`Failed to fetch image URL: ${res.status}`);
      inputBlob = await res.blob();
    } else {
      throw new Error("No image provided");
    }
    const preprocessEnd = performance.now();

    const processingStart = performance.now();
    const srcBitmap = await createImageBitmap(inputBlob);
    const srcW = srcBitmap.width,
      srcH = srcBitmap.height;

    // Calculate cropping and scaling
    const squareSize =
      mode === "crop" ? Math.min(srcW, srcH) : Math.max(srcW, srcH);
    const finalSize =
      typeof targetSize === "number"
        ? Math.min(squareSize, targetSize)
        : squareSize;
    let sx = 0,
      sy = 0,
      sWidth = srcW,
      sHeight = srcH;
    if (mode === "crop") {
      sx = Math.floor((srcW - squareSize) / 2);
      sy = Math.floor((srcH - squareSize) / 2);
      sWidth = sHeight = squareSize;
    }

    if (typeof OffscreenCanvas === "undefined") {
      srcBitmap.close?.();
      throw new Error("OffscreenCanvas is not available in this environment");
    }

    const off = new OffscreenCanvas(finalSize, finalSize);
    const ctx = off.getContext("2d");
    if (!ctx) {
      srcBitmap.close?.();
      throw new Error("Unable to get 2D context on OffscreenCanvas");
    }

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
    srcBitmap.close?.();

    // Convert OffscreenCanvas to Blob, fallback if needed
    async function canvasToBlob(
      canvas: OffscreenCanvas,
      type: string,
      q?: number,
    ): Promise<Blob> {
      if (typeof canvas.convertToBlob === "function") {
        return await canvas.convertToBlob({ type, quality: q });
      }
      const bmp = await createImageBitmap(canvas);
      const tmp = new OffscreenCanvas(bmp.width, bmp.height);
      const tctx = tmp.getContext("2d");
      if (!tctx) throw new Error("Failed to get tmp canvas context");
      tctx.drawImage(bmp, 0, 0);
      bmp.close?.();
      return await tmp.convertToBlob({ type, quality: q });
    }

    let producedBlob: Blob;

    if (output === "webp") {
      producedBlob = await canvasToBlob(off, "image/webp", quality);
    } else {
      // Try compressing via webp first for PNG output
      let webpBlob: Blob | null = null;
      try {
        webpBlob = await canvasToBlob(off, "image/webp", quality);
      } catch {
        webpBlob = null;
      }
      if (webpBlob) {
        const webpBmp = await createImageBitmap(webpBlob);
        const finalCanvas = new OffscreenCanvas(finalSize, finalSize);
        const fctx = finalCanvas.getContext("2d");
        if (!fctx) throw new Error("Failed to get final canvas context");
        fctx.fillStyle = "#FFF";
        fctx.fillRect(0, 0, finalSize, finalSize);
        fctx.drawImage(webpBmp, 0, 0, finalSize, finalSize);
        webpBmp.close?.();
        producedBlob = await canvasToBlob(finalCanvas, "image/png");
      } else {
        producedBlob = await canvasToBlob(off, "image/png");
      }
    }

    const producedArrayBuffer = await producedBlob.arrayBuffer();
    const processingEnd = performance.now();
    const totalMs = performance.now() - t0;

    const timings = {
      preprocessMs: preprocessEnd - preprocessStart,
      processingMs: processingEnd - processingStart,
      totalMs,
    };

    workerScope.postMessage(
      {
        id: msg?.id,
        success: true,
        arrayBuffer: producedArrayBuffer,
        mimeType:
          producedBlob.type || (output === "webp" ? "image/webp" : "image/png"),
        timings,
      },
      [producedArrayBuffer],
    );
  } catch (err: unknown) {
    try {
      workerScope.postMessage({
        id: msg.id,
        success: false,
        error: String(
          (err as Error)?.message ??
            (err as Error) ??
            "Unknown error in image worker",
        ),
      });
    } catch {
      // Silent
    }
  }
});
