import { useEffect, useState } from 'react';
import serviceManager from '@/lib/services/ServiceManager';
import { ServiceName } from '@/lib/services/Service.interface';
import { BackToFrontEvents } from '@/types/socketMessage.type';

const SorterPositionDisplay = () => {
  const [sorterPositions, setSorterPositions] = useState<number[]>([1, 1, 1, 1]); // Initial positions at bin 1
  const socket = serviceManager.getService(ServiceName.SOCKET);

  useEffect(() => {
    if (!socket) return;

    const handleSorterMoved = (data: { sorter: number; bin: number }) => {
      setSorterPositions((prev) => {
        const newPositions = [...prev];
        newPositions[data.sorter] = data.bin;
        return newPositions;
      });
    };

    socket.on(BackToFrontEvents.SORTER_POSITION_UPDATE, handleSorterMoved);

    return () => {
      socket.off(BackToFrontEvents.SORTER_POSITION_UPDATE, handleSorterMoved);
    };
  }, [socket]);

  return (
    <div className="flex items-center justify-center gap-4 rounded-lg bg-gray-100 p-4">
      {sorterPositions.map((position, index) => (
        <div key={index} className="flex flex-col items-center">
          {/* display A B C D */}
          <div className="text-lg font-bold">{String.fromCharCode(65 + index)}</div>
          <div className="text-xl font-semibold">{position}</div>
        </div>
      ))}
    </div>
  );
};

export default SorterPositionDisplay;
