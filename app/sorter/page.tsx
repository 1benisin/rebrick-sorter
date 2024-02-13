'use client';

import SorterControllerButton from '@/components/SortProcessCtrlButton';
import DualVideo from '@/components/DualVideo';
import DetectionPairDisplay from '@/components/DetectionPairDisplay';

const SortPage = () => {
  return (
    <div>
      <h1>Sorter</h1>
      <SorterControllerButton />
      <div className="px-4 flex">
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
