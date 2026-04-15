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

  const enumerateDevices = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);

      // Request permission first to get device labels
      try {
        await navigator.mediaDevices.getUserMedia({ video: true });
      } catch (err) {
        // Permission denied or no devices
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

      // Enumerate devices
      const deviceList = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = deviceList
        .filter((device) => device.kind === "videoinput")
        .map((device) => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${device.deviceId.slice(0, 8)}`,
        }));

      setDevices(videoDevices);
      setError(videoDevices.length === 0 ? "No cameras found" : null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to enumerate devices";
      setError(message);
      setDevices([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void enumerateDevices();

    // Listen for device changes
    const handleDeviceChange = () => {
      void enumerateDevices();
    };

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
