// app/sorter/page.tsx

'use client';
import SorterControllerButton from '@/components/buttons/SortProcessCtrlButton';
import DualVideo from '@/components/DualVideo';
import DetectionPairDisplay from '@/components/DetectionPairDisplay';
import StatusIndicator from '@/components/StatusIndicator';
import ConveyorButton from '@/components/buttons/ConveyorButton';
import HomeSorterButton from '@/components/buttons/HomeSorterButton';
import { sortProcessStore } from '@/stores/sortProcessStore';
import SorterPositionDisplay from '@/components/SorterPositionDisplay';

const SortPage = () => {
  const ppmCount = sortProcessStore((state) => state.ppmCount);
  return (
    <div>
      <StatusIndicator />
      <div className="grid grid-cols-6">
        <div className="flex flex-col">
          <SorterControllerButton />
          <ConveyorButton />
          <HomeSorterButton />
          <SorterPositionDisplay />
          <div>{`${ppmCount} PPM (last 10min)`}</div>
        </div>
        <div className="col-span-3 w-full">
          <DualVideo />
        </div>

        <div className="col-span-2 grid-cols-1 gap-1" id="video-capture-container">
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
