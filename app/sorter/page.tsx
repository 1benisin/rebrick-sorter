// app/sorter/page.tsx

'use client';
import SorterControllerButton from '@/components/buttons/SortProcessCtrlButton';
import DualVideo from '@/components/DualVideo';
import DetectionPairDisplay from '@/components/DetectionPairDisplay';
import StatusIndicator from '@/components/StatusIndicator';
import ConveyorButton from '@/components/buttons/ConveyorButton';
import HomeSorterButton from '@/components/buttons/HomeSorterButton';
import { sortProcessStore } from '@/stores/sortProcessStore';
import EncoderStatusDisplay from '@/components/EncoderStatusDisplay';
import JetCalibrationPanel from '@/components/buttons/JetCalibrationPanel';

const SortPage = () => {
  const ppmCount = sortProcessStore((state) => state.ppmCount);
  return (
    <div>
      {/* <StatusIndicator /> */}
      <div className="grid grid-cols-6">
        {/* Left column - controls only */}
        <div className="flex flex-col gap-2">
          <SorterControllerButton />
          <ConveyorButton />
          <HomeSorterButton />
          <div>{`${ppmCount} PPM (last 10min)`}</div>
        </div>

        {/* Center - dual video */}
        <div className="col-span-3 w-full">
          <DualVideo />
        </div>

        {/* Right column - encoder display above video capture */}
        <div className="col-span-2 flex flex-col gap-2">
          <EncoderStatusDisplay />
          <JetCalibrationPanel />
          <div id="video-capture-container">{/* Detection images injected here */}</div>
        </div>
      </div>
      <div className="w-full">
        <DetectionPairDisplay />
      </div>
    </div>
  );
};

export default SortPage;
