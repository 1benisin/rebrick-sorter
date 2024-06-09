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

const StatusIndicator = ({}) => {
  const { status: cassifierStatus } = useClassifier();
  const { status: detectorStatus, reInit } = useDetector();
  const { status: hardwareStatus, init: initHardware } = useHardware();
  const { status: settingsStatus, loadSettings } = useSettings();
  const { socket, status: socketStatus, init: initializeSocket } = useSocket();
  const { status: videoCaptureStatus, init: initVideoCapture } = useVideoCapture();
  const { status: sortControllerStatus } = useSortController();

  const statusColor = {
    loading: 'bg-yellow-700', // Yellow for loading
    loaded: 'bg-green-700', // Green for loaded
    failed: 'bg-red-700', // Red for failed
  };

  return (
    <div className="fixed right-0 top-2 m-2 flex flex-col gap-2 rounded-md bg-slate-400 p-2 opacity-90">
      <div
        className={cn(statusColor[settingsStatus], 'mx-auto w-full cursor-pointer rounded-md px-2')}
        onClick={loadSettings}
      >
        Settings
      </div>

      <div
        className={cn(statusColor[socketStatus], 'mx-auto w-full cursor-pointer rounded-md px-2')}
        onClick={() => {
          initializeSocket();
          console.log('SOCKET STATUS: ', { active: socket?.active, connected: socket?.connected, id: socket?.id });
        }}
      >
        Socket
      </div>

      <div
        className={cn(statusColor[hardwareStatus], 'mx-auto w-full cursor-pointer rounded-md px-2')}
        onClick={initHardware}
      >
        Hardware
      </div>

      <div className={cn(statusColor[cassifierStatus], 'mx-auto w-full rounded-md px-2')}>Classifier</div>

      <div
        className={cn(statusColor[videoCaptureStatus], 'mx-auto w-full cursor-pointer rounded-md px-2')}
        onClick={initVideoCapture}
      >
        Video Capture
      </div>

      <div className={cn(statusColor[detectorStatus], 'mx-auto w-full rounded-md px-2')} onClick={reInit}>
        Detector
      </div>

      <div className={cn(statusColor[sortControllerStatus], 'mx-auto w-full rounded-md px-2')}>Sorter Controller</div>

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
