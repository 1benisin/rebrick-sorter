// /api/arduino/route.ts

import { NextResponse } from 'next/server';
import SerialPortManager from '@/lib/hardware/serialPortManager';

enum ArduinoCommands {
  SETUP = 'setup',
}

export async function POST(req: Request) {
  try {
    console.log(' conveyor API called');
    // get the body of the request
    // const { command } = await req.json();
    // console.log('command', command);

    const results = await SerialPortManager.init();

    console.log('serial port status:', SerialPortManager.getAllDeviceStatus());

    // console.log('serial port status:', SerialPortManager.portStatuses);

    return new NextResponse('success', { status: 200 });
  } catch (error) {
    console.error(error);
    return new NextResponse('Internal Error' + JSON.stringify(error), { status: 500 });
  }
}
