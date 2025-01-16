import { useSettings } from '@/components/hooks/useSettings';
import { SettingsType } from '@/types/settings.type';
import React, { useState, useEffect, useRef } from 'react';

const DualVideo = () => {
  const { settings, saveSettings, isLoading } = useSettings();

  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId1, setSelectedDeviceId1] = useState('');
  const [selectedDeviceId2, setSelectedDeviceId2] = useState('');

  const videoRef1 = useRef<HTMLVideoElement>(null);
  const videoRef2 = useRef<HTMLVideoElement>(null);

  // Fetch video devices when component mounts
  useEffect(() => {
    // Request permission to access media devices
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        // Stop the stream immediately since we just need permissions
        stream.getTracks().forEach((track) => track.stop());

        // Now enumerate devices
        navigator.mediaDevices.enumerateDevices().then((devices) => {
          const videoInputs = devices.filter((device) => device.kind === 'videoinput');
          setVideoDevices(videoInputs);
        });
      })
      .catch((error) => {
        console.error('Error accessing media devices:', error);
      });
  }, []);

  // Initialize selected devices from settings
  useEffect(() => {
    if (settings) {
      // check if selectedDeviceId1 is in the list of video devices
      const device1Exists = videoDevices.some((device) => device.deviceId === settings.videoStreamId1);
      if (device1Exists) {
        setSelectedDeviceId1(settings.videoStreamId1);
      }
      const device2Exists = videoDevices.some((device) => device.deviceId === settings.videoStreamId2);
      if (device2Exists) {
        setSelectedDeviceId2(settings.videoStreamId2);
      }
    }
  }, [settings, videoDevices]);

  // Handle changes to selectedDeviceId1
  useEffect(() => {
    let stream: MediaStream;

    // check if selectedDeviceId1 is in the list of video devices
    const deviceExists = videoDevices.some((device) => device.deviceId === selectedDeviceId1);

    if (selectedDeviceId1 && deviceExists) {
      console.log('--Selected device 1:', selectedDeviceId1);

      navigator.mediaDevices
        .getUserMedia({ video: { deviceId: { exact: selectedDeviceId1 } } })
        .then((s) => {
          stream = s;
          if (videoRef1.current) {
            videoRef1.current.srcObject = stream;
          }
        })
        .catch((error) => {
          console.error('Error accessing video device 1:', error);
        });
    }

    // Cleanup on component unmount or device change
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [selectedDeviceId1, videoDevices]);

  // Handle changes to selectedDeviceId2
  useEffect(() => {
    let stream: MediaStream;

    // check if selectedDeviceId1 is in the list of video devices
    const deviceExists = videoDevices.some((device) => device.deviceId === selectedDeviceId2);

    if (selectedDeviceId2 && deviceExists) {
      navigator.mediaDevices
        .getUserMedia({ video: { deviceId: { exact: selectedDeviceId2 } } })
        .then((s) => {
          stream = s;
          if (videoRef2.current) {
            videoRef2.current.srcObject = stream;
          }
        })
        .catch((error) => {
          console.error('Error accessing video device 2:', error);
        });
    }

    // Cleanup on component unmount or device change
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [selectedDeviceId2, videoDevices]);

  // Handle selection change for the first device
  const handleDeviceChange1 = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const deviceId = event.target.value;
    setSelectedDeviceId1(deviceId);

    // Update settings
    if (settings) {
      saveSettings({ ...settings, videoStreamId1: deviceId });
    }
  };

  // Handle selection change for the second device
  const handleDeviceChange2 = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const deviceId = event.target.value;
    setSelectedDeviceId2(deviceId);

    // Update settings
    if (settings) {
      saveSettings({ ...settings, videoStreamId2: deviceId });
    }
  };

  return (
    <div className="min-w-96 mx-auto flex max-w-md flex-col">
      <div className="relative h-80 w-full">
        {settings && (
          <>
            <div className="absolute left-0 top-0 h-3/5 w-full overflow-hidden">
              <video
                ref={videoRef1}
                id="video1"
                autoPlay
                loop
                playsInline
                muted
                className="left-0 top-0 w-full"
                // Show middle 60% of video1, so translate up by 20%
                style={{ transform: `translateY(-20%)` }}
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
                // Show middle 40% of video2, so translate up by 30%, and flip horizontally
                style={{ transform: `scaleX(-1) translateY(-30%)` }}
              ></video>
            </div>
          </>
        )}
      </div>
      <div>
        <select value={selectedDeviceId1} onChange={handleDeviceChange1}>
          <option key={'default'} value={''}>
            {'Select a camera'}
          </option>
          {videoDevices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {`Camera ${device.deviceId.slice(-5)}`}
            </option>
          ))}
        </select>
        <select value={selectedDeviceId2} onChange={handleDeviceChange2}>
          <option key={'default'} value={''}>
            {'Select a camera'}
          </option>
          {videoDevices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {`Camera ${device.deviceId.slice(-5)}`}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default DualVideo;
