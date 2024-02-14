// /api/arduino/route.ts

import { NextResponse, Ne } from 'next/server';
import SerialPortManager from '@/lib/hardware/serialPortManager';

export async function POST(req: Request) {
  try {
    // get the singleton instance of the SerialPortManager
    const serialPortManager = SerialPortManager.getInstance();
    const ports = await serialPortManager.init();
    // if any ports have a staus of fail
    if (ports.some((p) => p.status === 'fail')) {
      return new NextResponse(JSON.stringify(ports), { status: 500 });
    }
    return new NextResponse('setup hardware success', { status: 200 });
  } catch (error) {
    console.error(error);
    return new NextResponse('Internal Error' + JSON.stringify(error), { status: 500 });
  }
}
