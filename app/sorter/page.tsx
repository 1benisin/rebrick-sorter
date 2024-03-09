'use client';
import SorterControllerButton from '@/components/buttons/SortProcessCtrlButton';
import DualVideo from '@/components/DualVideo';
import DetectionPairDisplay from '@/components/DetectionPairDisplay';
import StatusIndicator from '@/components/StatusIndicator';
import ConveyorButton from '@/components/buttons/ConveyorButton';
import MoveSorterButton from '@/components/buttons/HomeSorterButton';
import HomeSorterButton from '@/components/buttons/HomeSorterButton';

const SortPage = () => {
  return (
    <div>
      <StatusIndicator />
      <div className="grid grid-cols-6">
        <div className="flex flex-col">
          <SorterControllerButton />
          <ConveyorButton />
          <HomeSorterButton />
        </div>
        <div className="w-full col-span-3">
          <DualVideo />
        </div>

        <div className="col-span-2 grid-cols-1 gap-1" id="video-capture-container">
          {/* <template id="video-capture-canvas-template">
            <canvas className="w-full max-w-full"></canvas>
          </template> */}
          {/* I want to inject detection images here */}
        </div>
      </div>
      <div className="w-full">
        <DetectionPairDisplay />
      </div>
    </div>
  );
};

export default SortPage;
