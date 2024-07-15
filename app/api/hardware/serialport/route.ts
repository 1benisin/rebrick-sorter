// app/api/hardware/serialport/route.ts

// /api/hardware/serialport/route.ts

import { NextResponse } from 'next/server';
import SerialPortManager from '@/lib/hardware/serialPortManager';

// get a list of all serial ports
export async function GET() {
  try {
    // get the singleton instance of the SerialPortManager
    const serialPortManager = SerialPortManager.getInstance();
    const ports = await serialPortManager.listSerialPorts(); // Use listSerialPorts to get all ports
    // map the ports to a new array of ArduinoPortType objects
    const arduinoPorts: string[] = ports.map((port) => port.path);

    // Optionally, perform any additional filtering if needed

    return new NextResponse(JSON.stringify(arduinoPorts), { status: 200 });
  } catch (error) {
    console.error(error);
    return new NextResponse('Internal Server Error' + JSON.stringify(error), { status: 500 });
  }
}
