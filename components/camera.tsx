import React, { useEffect, useState, useRef } from "react";
import Camera, { CameraDevice } from "@/lib/camera";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CameraComponent = () => {
  const videoRef = useRef(null);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCamera, setSelectedCamera] = useState("");
  const cameraInstance = useRef<Camera | null>(null);

  useEffect(() => {
    const setupCameras = async () => {
      if (videoRef.current) {
        cameraInstance.current = new Camera(videoRef.current);
        const availableCameras = await cameraInstance.current.getCameras();
        setCameras(availableCameras);
        if (availableCameras.length > 0) {
          setSelectedCamera(availableCameras[0].deviceId);
          cameraInstance.current.selectCamera(availableCameras[0].deviceId);
        }
      }
    };

    setupCameras();

    // Cleanup function
    return () => {
      if (cameraInstance.current) {
        cameraInstance.current.stopCamera();
      }
    };
  }, []);

  const handleCameraChange = async (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const cameraId = e.target.value;
    setSelectedCamera(cameraId);

    if (cameraInstance.current) {
      await cameraInstance.current.selectCamera(cameraId);
    } else {
      console.error("Camera instance is not initialized");
    }
  };

  return (
    <div className="flex flex-col max-w-md mx-auto text-xs">
      <video ref={videoRef} autoPlay playsInline className="mb-4"></video>

      <div className="flex w-full items-center ">
        <label htmlFor="cameraSelect">Select Camera:</label>
        <Select value={selectedCamera} onValueChange={setSelectedCamera}>
          <SelectTrigger className="text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {cameras.map((camera) => (
              <SelectItem
                key={camera.deviceId}
                value={camera.deviceId}
                className="text-xs"
              >
                {camera.label || `Camera ${camera.deviceId}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

export default CameraComponent;
