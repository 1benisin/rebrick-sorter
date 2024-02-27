import { useContext } from 'react';
import { HardwareContext } from '@/contexts/HardwareContext';

// Hook to use the Hardware context
const useHardware = () => {
  const context = useContext(HardwareContext);
  if (context === undefined) {
    throw new Error('useHardware must be used within a HardwareProvider');
  }
  return context;
};

export default useHardware;

// // Import necessary hooks and Firebase functions
// 'use client';
// import { useState, useEffect } from 'react';
// import axios from 'axios';
// import { HardwareInitDto } from '@/types/hardwareInit.dto';
// import useSettings from './useSettings';
// import { serialPortNames } from '@/types/serialPort.type';
// import useSocket from '@/hooks/useSocket';
// import { SocketAction, SocketMessage } from '@/types/socketMessage.type';

// enum LoadStatus {
//   Loading = 'loading',
//   Loaded = 'loaded',
//   Failed = 'failed',
// }

// const useHardware = () => {
//   const [status, setStatus] = useState<LoadStatus>(LoadStatus.Loading);
//   const { settings } = useSettings();
//   const { socket, status: SocketStatus } = useSocket();

//   useEffect(() => {
//     initHardware();
//   }, [settings, SocketStatus, socket]);

//   const initHardware = async () => {
//     console.log('Initializing Hardware...');
//     setStatus(LoadStatus.Loading);
//     try {
//       if (!settings || SocketStatus === LoadStatus.Failed || !socket) {
//         setStatus(LoadStatus.Failed);
//         return;
//       }

//       // create serial port list
//       const serialPorts = settings.sorters.map((sorter) => ({ name: sorter.name, path: sorter.serialPort }));
//       serialPorts.push({ name: serialPortNames.conveyor_jets, path: settings.conveyorJetsSerialPort });
//       serialPorts.push({ name: serialPortNames.hopper_feeder, path: settings.hopperFeederSerialPort });

//       // create jet positions
//       const jetPositions = settings.sorters.map((sorter) => sorter.jetPosition);

//       // cre
//       const sorterDimensions = settings.sorters.map((sorter) => ({ gridWidth: sorter.gridWidth, gridHeight: sorter.gridHeight }));

//       const hardwareSettings: HardwareInitDto = {
//         defaultConveyorSpeed_PPS: settings.conveyorSpeed_PPS,
//         serialPorts: serialPorts,
//         sorterDimensions: sorterDimensions,
//         jetPositions: jetPositions,
//       };

//       socket.emit(SocketAction.INIT_HARDWARE, hardwareSettings);
//       socket.on(SocketAction.INIT_HARDWARE_SUCCESS, (success: SocketMessage[SocketAction.INIT_HARDWARE_SUCCESS]) => {
//         setStatus(success ? LoadStatus.Loaded : LoadStatus.Failed);
//       });
//       console.log('Hardware initialized');
//     } catch (error) {
//       setStatus(LoadStatus.Failed);
//       console.error('Error initializing hardware:', error);
//     }
//   };

//   return { status, initHardware };
// };

// export default useHardware;
