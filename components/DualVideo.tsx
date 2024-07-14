// components/DualVideo.tsx

// video.tsx:
'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { sortProcessStore } from '@/stores/sortProcessStore';
import useSettings from '@/hooks/useSettings';

const TEST_VIDEOS = ['normal', 'too-close'];
const TEST_VIDEO_PATH = '/test-videos/';
const VIDEO_PLAYBACK_RATE = 1;

const Video = () => {
  const videoRef1 = useRef<HTMLVideoElement>(null);
  const videoRef2 = useRef<HTMLVideoElement>(null);
  const [cameras, setCameras] = useState<{ deviceId: string; label: string }[]>([]);
  const [selectedCamera1, setSelectedCamera1] = useState('');
  const [selectedCamera2, setSelectedCamera2] = useState('');
  const setVideoStreamId = sortProcessStore((state) => state.setVideoStreamId);
  const setVideoStreamId2 = sortProcessStore((state) => state.setVideoStreamId2);
  const { settings } = useSettings();

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
  }, []);

  const selectCamera1 = async (cameraId: string) => {
    if (videoRef1.current) {
      if (cameraId.slice(0, 4) === 'test') {
        videoRef1.current.srcObject = null;
        videoRef1.current.src = `${TEST_VIDEO_PATH}${cameraId.slice(5)}.mp4`;
        videoRef1.current.playbackRate = VIDEO_PLAYBACK_RATE;
      } else {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: cameraId, width: { ideal: 3840, max: 3840 }, height: { ideal: 2160, max: 2160 } },
          });
          videoRef1.current.src = '';
          videoRef1.current.srcObject = stream;
        } catch (error) {
          console.error('Error accessing the selected camera:', error);
        }
      }

      videoRef1.current.onloadedmetadata = () => {
        setSelectedCamera1(cameraId);
        setVideoStreamId(cameraId);
        console.log('videoRef1.current.videoWidth', videoRef1.current?.videoWidth);
        console.log('videoRef1.current.videoHeight', videoRef1.current?.videoHeight);
      };
    }
  };
  const selectCamera2 = async (cameraId: string) => {
    if (videoRef2.current) {
      if (cameraId.slice(0, 4) === 'test') {
        videoRef2.current.srcObject = null;
        videoRef2.current.src = `${TEST_VIDEO_PATH}${cameraId.slice(5)}.mp4`;
        videoRef2.current.playbackRate = VIDEO_PLAYBACK_RATE;
      } else {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: cameraId, width: { ideal: 3840, max: 3840 }, height: { ideal: 2160, max: 2160 } },
          });
          videoRef2.current.src = '';
          videoRef2.current.srcObject = stream;
        } catch (error) {
          console.error('Error accessing the selected camera:', error);
        }
      }

      videoRef2.current.onloadedmetadata = () => {
        setSelectedCamera2(cameraId);
        setVideoStreamId2(cameraId);
        console.log('videoRef2.current.videoWidth', videoRef2.current?.videoWidth);
        console.log('videoRef2.current.videoHeight', videoRef2.current?.videoHeight);
      };
    }
  };

  const handleCameraChange1 = async (cameraId: string) => {
    await selectCamera1(cameraId);
  };
  const handleCameraChange2 = async (cameraId: string) => {
    await selectCamera2(cameraId);
  };

  if (!settings) return null;

  return (
    <div className="min-w-96 mx-auto flex max-w-md flex-col">
      {/* Video container with Tailwind classes to clip to bottom half */}
      {/* <div className="relative overflow-hidden h-48 w-full"> */}
      <div className="relative h-96 w-full">
        {/* <video ref={videoRef1} id="video1" autoPlay loop playsInline muted className="mb-4 h-96 w-full absolute -translate-y-1/2 top-1/2"></video> */}

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

          {/* <canvas id="canvas1" className="absolute top-0 left-0 w-full h-full bg-blue-600 opacity-50"></canvas> */}
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
          {/* <canvas id="canvas2" className="absolute top-0 left-0 w-full h-full bg-red-600 opacity-50"></canvas> */}
        </div>
      </div>
      <VideoSourceSelect cameras={cameras} selectedCamera={selectedCamera1} handleCameraChange={handleCameraChange1} />
      <VideoSourceSelect cameras={cameras} selectedCamera={selectedCamera2} handleCameraChange={handleCameraChange2} />
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
  );
};

export default Video;
