'use client';
import SorterControllerButton from '@/components/buttons/SortProcessCtrlButton';
import DualVideo from '@/components/DualVideo';
import DetectionPairDisplay from '@/components/DetectionPairDisplay';
import StatusIndicator from '@/components/StatusIndicator';
import ConveyorButton from '@/components/buttons/ConveyorButton';
import MoveSorterButton from '@/components/buttons/HomeSorterButton';

const SortPage = () => {
  return (
    <div>
      <StatusIndicator />
      <div className="px-4 flex">
        <div className="flex flex-col">
          <SorterControllerButton />
          <ConveyorButton />
        </div>
        <div className="w-full">
          <DualVideo />
        </div>

        <div id="video-capture-container">{/* I want to inject detection images here */}</div>
      </div>
      <div className="w-full">
        <DetectionPairDisplay />
      </div>
    </div>
  );
};

export default SortPage;
