// video.tsx:

import React, { useEffect, useState, useRef } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { sortProcessStore } from '@/stores/sortProcessStore';

const TEST_VIDEOS = ['normal', 'too-close'];
const TEST_VIDEO_PATH = '/test-videos/';
const VIDEO_PLAYBACK_RATE = 1;

const Video = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameras, setCameras] = useState<{ deviceId: string; label: string }[]>([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const setVideoStreamId = sortProcessStore((state) => state.setVideoStreamId);

  useEffect(() => {
    const getCameras = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((device) => device.kind === 'videoinput');
        setCameras(
          videoDevices.map((device) => ({
            deviceId: device.deviceId,
            label: device.label || `Camera ${device.deviceId}`,
          })),
        );
      } catch (error) {
        console.error('Error accessing media devices:', error);
      }
    };

    getCameras();
  }, [selectedCamera]);

  const selectCamera = async (cameraId: string) => {
    if (videoRef.current) {
      setVideoStreamId(cameraId);
      if (cameraId.slice(0, 4) === 'test') {
        videoRef.current.srcObject = null;
        videoRef.current.src = `${TEST_VIDEO_PATH}${cameraId.slice(5)}.mp4`;
        videoRef.current.playbackRate = VIDEO_PLAYBACK_RATE;
      } else {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: cameraId },
          });
          videoRef.current.src = '';
          videoRef.current.srcObject = stream;
        } catch (error) {
          console.error('Error accessing the selected camera:', error);
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
      <video ref={videoRef} id="video" autoPlay loop playsInline muted className="mb-4"></video>

      <div className="flex w-full items-center ">
        <label htmlFor="cameraSelect">Select Camera:</label>
        <Select value={selectedCamera} onValueChange={handleCameraChange}>
          <SelectTrigger className="text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem key="placeholder" value="" className="text-xs">
              Choose Video Source
            </SelectItem>
            {cameras.map((camera) => (
              <SelectItem key={camera.deviceId} value={camera.deviceId} className="text-xs">
                {camera.label || `Camera ${camera.deviceId}`}
              </SelectItem>
            ))}
            {TEST_VIDEOS.map((video) => (
              <SelectItem key={video} value={`test-${video}`} className="text-xs">
                Test - {video}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

export default Video;
