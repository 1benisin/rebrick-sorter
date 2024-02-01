// video.tsx:

import React, { useEffect, useState, useRef } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
const TEST_VIDEO_PATH = "/test-videos/normal.mp4";

const Video = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameras, setCameras] = useState<{ deviceId: string; label: string }[]>(
    []
  );
  const [selectedCamera, setSelectedCamera] = useState("");

  useEffect(() => {
    const getCameras = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(
          (device) => device.kind === "videoinput"
        );
        setCameras(
          videoDevices.map((device) => ({
            deviceId: device.deviceId,
            label: device.label,
          }))
        );
        if (videoDevices.length > 0 && !selectedCamera) {
          setSelectedCamera(videoDevices[0].deviceId);
          selectCamera(videoDevices[0].deviceId);
        }
      } catch (error) {
        console.error("Error accessing media devices:", error);
      }
    };

    getCameras();
  }, [selectedCamera]);

  const selectCamera = async (cameraId: string) => {
    if (videoRef.current) {
      if (cameraId === "test-video") {
        videoRef.current.srcObject = null;
        videoRef.current.src = TEST_VIDEO_PATH; // Adjust the path to your test video
      } else {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: cameraId },
          });
          videoRef.current.src = "";
          videoRef.current.srcObject = stream;
        } catch (error) {
          console.error("Error accessing the selected camera:", error);
        }
      }
    }
  };

  const handleCameraChange = async (cameraId: string) => {
    setSelectedCamera(cameraId);
    await selectCamera(cameraId);
  };

  return (
    <div className="flex flex-col max-w-md mx-auto text-xs">
      <video
        ref={videoRef}
        id="video1"
        autoPlay
        loop
        playsInline
        className="mb-4"
      ></video>

      <div className="flex w-full items-center ">
        <label htmlFor="cameraSelect">Select Camera:</label>
        <Select value={selectedCamera} onValueChange={handleCameraChange}>
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
            <SelectItem
              key={"test-video"}
              value={"test-video"}
              className="text-xs"
            >
              Test Video
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

export default Video;
