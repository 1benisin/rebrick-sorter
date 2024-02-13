// /api/arduino/route.ts

import { NextResponse } from 'next/server';
// import SerialPortManager from '@/lib/hardware/serialPortManager';
import ArduinoDevice from '@/lib/hardware/arduinoDevice';

enum ArduinoCommands {
  SETUP = 'setup',
}

export async function POST(req: Request) {
  try {
    console.log(' conveyor API called');
    // get the body of the request
    const { command } = await req.json();
    console.log('command', command);

    const device = new ArduinoDevice('/dev/cu.usbmodem1101');
    console.log('device:', device);

    // console.log('serial port status:', SerialPortManager.portStatuses);

    return new NextResponse('success', { status: 200 });
  } catch (error) {
    console.error(error);
    return new NextResponse('Internal Error' + JSON.stringify(error), { status: 500 });
  }
}
