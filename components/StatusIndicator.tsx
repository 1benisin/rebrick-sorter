// Import React and necessary hooks
import useClassifier from '@/hooks/useClassifier';
import useDetector from '@/hooks/useDetector';
import useHardware from '@/hooks/useHardware';
import useSettings from '@/hooks/useSettings';
import useSocket from '@/hooks/useSocket';
import useSortController from '@/hooks/useSortController';
import useVideoCapture from '@/hooks/useVideoCapture';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { SocketAction } from '@/types/socketMessage.type';
import { sortProcessStore } from '@/stores/sortProcessStore';

const StatusIndicator = ({}) => {
  const { status: cassifierStatus } = useClassifier();
  const { status: detectorStatus, reInit } = useDetector();
  const { status: hardwareStatus, init: initHardware } = useHardware();
  const { status: settingsStatus, loadSettings } = useSettings();
  const { status: socketStatus, socket } = useSocket();
  const { status: videoCaptureStatus, init: initVideoCapture } = useVideoCapture();
  const { status: sortControllerStatus } = useSortController();
  const videoStreamId = sortProcessStore((state) => state.videoStreamId);

  const statusColor = {
    loading: 'bg-yellow-700', // Yellow for loading
    loaded: 'bg-green-700', // Green for loaded
    failed: 'bg-red-700', // Red for failed
  };

  return (
    <div className="fixed flex flex-col gap-2 top-2 right-0 p-2 m-2 bg-slate-400 opacity-90 rounded-md">
      <div className={cn(statusColor[settingsStatus], 'rounded-md px-2 mx-auto w-full cursor-pointer')} onClick={loadSettings}>
        Settings
      </div>

      <div className={cn(statusColor[socketStatus], 'rounded-md px-2 mx-auto w-full')}>Socket</div>

      <div className={cn(statusColor[videoCaptureStatus], 'rounded-md px-2 mx-auto w-full cursor-pointer')} onClick={initVideoCapture}>
        Video Capture
      </div>

      <div className={cn(statusColor[cassifierStatus], 'rounded-md px-2 mx-auto w-full')}>Classifier</div>

      <div className={cn(statusColor[hardwareStatus], 'rounded-md px-2 mx-auto w-full cursor-pointer')} onClick={initHardware}>
        Hardware
      </div>

      <div className={cn(statusColor[detectorStatus], 'rounded-md px-2 mx-auto w-full')} onClick={reInit}>
        Detector
      </div>

      <div className={cn(statusColor[sortControllerStatus], 'rounded-md px-2 mx-auto w-full')}>Sorter Controller</div>

      {socket && (
        <Button size="sm" onClick={() => socket.emit(SocketAction.LOG_PART_QUEUE)}>
          Log Part Queue
        </Button>
      )}
      {socket && (
        <Button size="sm" variant="outline" onClick={() => socket.emit(SocketAction.LOG_SPEED_QUEUE)}>
          Log Speed Queue
        </Button>
      )}
    </div>
  );
};

export default StatusIndicator;
