// components/DualVideo.tsx

// video.tsx:
'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSettings } from '@/hooks/useSettings';

const TEST_VIDEOS = ['normal', 'too-close'];
const TEST_VIDEO_PATH = '/test-videos/';
const VIDEO_PLAYBACK_RATE = 1;

const Video = () => {
  const videoRef1 = useRef<HTMLVideoElement>(null);
  const videoRef2 = useRef<HTMLVideoElement>(null);
  const [cameras, setCameras] = useState<{ deviceId: string; label: string }[]>([]);
  const [selectedCamera1, setSelectedCamera1] = useState('');
  const [selectedCamera2, setSelectedCamera2] = useState('');
  const { settings, saveSettings, isLoading, error } = useSettings();

  const selectCamera1 = useCallback(
    async (cameraId: string) => {
      if (videoRef1.current) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: cameraId, width: { ideal: 3840, max: 3840 }, height: { ideal: 2160, max: 2160 } },
          });
          videoRef1.current.src = '';
          videoRef1.current.srcObject = stream;
        } catch (error) {
          console.error('Error accessing the selected camera:', error);
        }

        videoRef1.current.onloadedmetadata = () => {
          setSelectedCamera1(cameraId);
          if (settings) {
            saveSettings({ ...settings, videoStreamId1: cameraId });
          }
          console.log('videoRef1.current.videoWidth', videoRef1.current?.videoWidth);
          console.log('videoRef1.current.videoHeight', videoRef1.current?.videoHeight);
        };
      }
    },
    [saveSettings, settings],
  );

  const selectCamera2 = useCallback(
    async (cameraId: string) => {
      if (videoRef2.current) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: cameraId, width: { ideal: 3840, max: 3840 }, height: { ideal: 2160, max: 2160 } },
          });
          videoRef2.current.src = '';
          videoRef2.current.srcObject = stream;
        } catch (error) {
          console.error('Error accessing the selected camera:', error);
        }

        videoRef2.current.onloadedmetadata = () => {
          setSelectedCamera2(cameraId);
          if (settings) {
            saveSettings({ ...settings, videoStreamId2: cameraId });
          }
          console.log('videoRef2.current.videoWidth', videoRef2.current?.videoWidth);
          console.log('videoRef2.current.videoHeight', videoRef2.current?.videoHeight);
        };
      }
    },
    [settings, saveSettings],
  );

  useEffect(() => {
    const getCameras = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((device) => device.kind === 'videoinput');
        console.log('videoDevices', videoDevices);
        setCameras(
          videoDevices.map((device) => ({
            deviceId: device.deviceId,
            label: device.label || `Camera ${device.deviceId}`,
          })),
        );

        // Automatically assign cameras based on settings
        if (settings?.videoStreamId1) {
          const deviceExists = cameras.some((camera) => camera.deviceId === settings.videoStreamId1);
          if (deviceExists) {
            await selectCamera1(settings?.videoStreamId1);
          }
        }
        if (settings?.videoStreamId2) {
          const deviceExists = cameras.some((camera) => camera.deviceId === settings.videoStreamId2);
          if (deviceExists) {
            await selectCamera2(settings.videoStreamId2);
          }
        }
      } catch (error) {
        console.error('Error accessing media devices:', error);
      }
    };

    if (!isLoading && !error) {
      getCameras();
    }
  }, [settings?.videoStreamId1, settings?.videoStreamId2, selectCamera1, selectCamera2, isLoading, error, cameras]);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!settings) return null;

  return (
    <div className="min-w-96 mx-auto flex max-w-md flex-col">
      {/* Video container to clip to bottom half */}
      <div className="relative h-96 w-full">
        <div className="absolute left-0 top-0 h-3/5 w-full overflow-hidden">
          <video
            ref={videoRef1}
            id="video1"
            autoPlay
            loop
            playsInline
            muted
            className="left-0 top-0 w-full"
            // translate video vertically
            style={{ transform: `translateY(${settings.camera1VerticalPositionPercentage}%)` }}
          ></video>
        </div>
        <div className="absolute bottom-0 left-0 h-2/5 w-full overflow-hidden">
          <video
            ref={videoRef2}
            id="video2"
            autoPlay
            loop
            playsInline
            muted
            className="left-0 top-0 w-full"
            // translate video vertically and flip horizontally
            style={{ transform: `scaleX(-1) translateY(${settings.camera2VerticalPositionPercentage}%)` }}
          ></video>
        </div>
      </div>
      <VideoSourceSelect cameras={cameras} selectedCamera={selectedCamera1} handleCameraChange={selectCamera1} />
      <VideoSourceSelect cameras={cameras} selectedCamera={selectedCamera2} handleCameraChange={selectCamera2} />
    </div>
  );
};

const VideoSourceSelect = ({
  cameras,
  selectedCamera,
  handleCameraChange,
}: {
  cameras: { deviceId: string; label: string }[];
  selectedCamera: string;
  handleCameraChange: (cameraId: string) => void;
}) => {
  return (
    <div className="flex w-full items-center pt-1 text-xs">
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
              {`Camera ${camera.deviceId.slice(-10)}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default Video;
