// Import React and necessary hooks
import useDetector from '@/hooks/useDetector';
import useSettings from '@/hooks/useSettings';
import { cn } from '@/lib/utils';

const StatusIndicator = ({}) => {
  const { status: detectorStatus, reInit } = useDetector();
  const { status: settingsStatus, loadSettings } = useSettings();

  const statusColor = {
    loading: 'bg-yellow-700', // Yellow for loading
    loaded: 'bg-green-700', // Green for loaded
    failed: 'bg-red-700', // Red for failed
  };

  return (
    <div className="fixed flex flex-col gap-2 top-2 right-0 p-2 m-2 bg-slate-400 opacity-90 rounded-md">
      <div className={cn(statusColor[detectorStatus], 'rounded-md px-2 mx-auto w-full')} onClick={reInit}>
        Detector
      </div>

      <div className={cn(statusColor[detectorStatus], 'rounded-md px-2 mx-auto w-full')} onClick={loadSettings}>
        Settings
      </div>
    </div>
  );
};

export default StatusIndicator;
