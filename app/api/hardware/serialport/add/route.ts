// /api/hardware/serialport/add/route.ts

import { NextResponse } from 'next/server';
import SerialPortManager from '@/lib/hardware/serialPortManager';

export async function POST(req: Request) {
  try {
    // get request body parameters
    const { portName, portPath } = await req.json();

    if (!portName || !portPath) {
      return new NextResponse('Missing portName or portPath on body', { status: 400 });
    }

    const serialPortManager = SerialPortManager.getInstance();

    // Directly use the static method from SerialPortManager if it's a singleton with static methods
    // await serialPortManager.addDevice(portName, portPath);

    return new NextResponse('Device succesfully added', { status: 200 });
  } catch (error) {
    console.error(error);
    return new NextResponse('Internal Error' + JSON.stringify(error), { status: 500 });
  }
}
