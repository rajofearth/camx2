import { useCallback, useEffect, useState } from "react";

export interface CameraDevice {
  readonly deviceId: string;
  readonly label: string;
}

export interface UseCameraDevicesResult {
  readonly devices: readonly CameraDevice[];
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly refreshDevices: () => Promise<void>;
}

export function useCameraDevices(): UseCameraDevicesResult {
  const [devices, setDevices] = useState<readonly CameraDevice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Enumerate video input devices, requesting camera access first for labels
  const enumerateDevices = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      try {
        await navigator.mediaDevices.getUserMedia({ video: true });
      } catch (err) {
        if (
          err instanceof Error &&
          (err.name === "NotAllowedError" || err.name === "NotFoundError")
        ) {
          setError("Camera access denied or no cameras available");
          setDevices([]);
          setIsLoading(false);
          return;
        }
        throw err;
      }

      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices
        .filter((d) => d.kind === "videoinput")
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${d.deviceId.slice(0, 8)}`,
        }));

      setDevices(videoDevices);
      setError(videoDevices.length === 0 ? "No cameras found" : null);
    } catch (err) {
      setDevices([]);
      setError(
        err instanceof Error ? err.message : "Failed to enumerate devices",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void enumerateDevices();

    // Handle dynamic device changes
    const handleDeviceChange = () => void enumerateDevices();
    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        handleDeviceChange,
      );
    };
  }, [enumerateDevices]);

  return {
    devices,
    isLoading,
    error,
    refreshDevices: enumerateDevices,
  };
}
