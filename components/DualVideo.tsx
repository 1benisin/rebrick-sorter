// video.tsx:

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
  const [selectedCamera, setSelectedCamera] = useState('');
  const setVideoStreamId = sortProcessStore((state) => state.setVideoStreamId);
  const { settings, loaded } = useSettings();

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
    if (videoRef1.current && videoRef2.current) {
      setVideoStreamId(cameraId);
      if (cameraId.slice(0, 4) === 'test') {
        videoRef1.current.srcObject = null;
        videoRef2.current.srcObject = null;
        videoRef1.current.src = `${TEST_VIDEO_PATH}${cameraId.slice(5)}.mp4`;
        videoRef2.current.src = `${TEST_VIDEO_PATH}${cameraId.slice(5)}.mp4`;
        videoRef1.current.playbackRate = VIDEO_PLAYBACK_RATE;
        videoRef2.current.playbackRate = VIDEO_PLAYBACK_RATE;
      } else {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: cameraId },
          });
          videoRef1.current.src = '';
          videoRef2.current.src = '';
          videoRef1.current.srcObject = stream;
          videoRef2.current.srcObject = stream;
        } catch (error) {
          console.error('Error accessing the selected camera:', error);
        }
      }
      // console.log width and height of video
      videoRef1.current.onloadedmetadata = () => {
        console.log('videoRef1.current.videoWidth', videoRef1.current?.videoWidth);
        console.log('videoRef1.current.videoHeight', videoRef1.current?.videoHeight);
      };
    }
  };

  const handleCameraChange = async (cameraId: string) => {
    setSelectedCamera(cameraId);
    await selectCamera(cameraId);
  };

  if (!loaded) return null;

  return (
    <div className="flex flex-col max-w-md min-w-96 mx-auto">
      {/* Video container with Tailwind classes to clip to bottom half */}
      {/* <div className="relative overflow-hidden h-48 w-full"> */}
      <div className="relative w-full h-96">
        {/* <video ref={videoRef1} id="video1" autoPlay loop playsInline muted className="mb-4 h-96 w-full absolute -translate-y-1/2 top-1/2"></video> */}

        <div className="absolute overflow-hidden top-0 left-0 w-full h-2/3">
          <video
            ref={videoRef1}
            id="video1"
            autoPlay
            loop
            playsInline
            muted
            className="top-0 left-0 w-full"
            // translate video vertically
            style={{ transform: `translateY(${settings.camera1VerticalPositionPercentage}%)` }}
          ></video>

          <canvas id="canvas1" className="absolute top-0 left-0 w-full h-full bg-blue-600 opacity-50"></canvas>
        </div>
        <div className="absolute overflow-hidden bottom-0 left-0 w-full h-1/3">
          <video
            ref={videoRef2}
            id="video2"
            autoPlay
            loop
            playsInline
            muted
            className="top-0 left-0 w-full"
            // translate video vertically
            style={{ transform: `translateY(${settings.camera2VerticalPositionPercentage}%)` }}
          ></video>
          <canvas id="canvas2" className="absolute top-0 left-0 w-full h-full bg-red-600 opacity-50"></canvas>
        </div>
      </div>

      <div className="flex w-full items-center text-xs">
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
