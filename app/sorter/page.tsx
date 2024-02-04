'use client';

import Video from '@/components/Video';
import SorterControllerButton from '@/components/sorterControllerButton';
import DetectionDisplay from '@/components/DetectionDisplay';

const SortPage = () => {
  return (
    <div>
      <h1>Sorter</h1>
      <div className="px-4 lg:px-8">
        <Video />
        <div className="flex justify-center mt-4">
          <SorterControllerButton />
        </div>

        <DetectionDisplay />
      </div>
    </div>
  );
};

export default SortPage;
