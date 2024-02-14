// /api/arduino/route.ts

import { NextResponse } from 'next/server';
import SerialPortManager from '@/lib/hardware/serialPortManager';
import { ArduinoDeviceCommand, ArduinoCommands } from '@/types/arduinoCommands.d';
import { validateOrReject } from 'class-validator';

export async function POST(req: Request) {
  try {
    // get the body of the request
    const arduinoDeviceCommand: ArduinoDeviceCommand = await req.json();
    // validate the request body
    await validateOrReject(arduinoDeviceCommand);
    // get the singleton instance of the SerialPortManager
    const serialPortManager = SerialPortManager.getInstance();

    // if commad is SETUP, initialize the serial ports
    if (arduinoDeviceCommand.command === ArduinoCommands.SETUP) {
      const ports = await serialPortManager.init();
      if (ports.some((p) => p.status === 'fail')) {
        // retrun fail response with results
        return new NextResponse('SETUP failed: ' + JSON.stringify(ports), { status: 500 });
      }
      return new NextResponse('SETUP success', { status: 200 });
    }

    // any other arduion command send to the arduino
    serialPortManager.sendCommandToDevice(arduinoDeviceCommand);

    return new NextResponse(`Command: ${arduinoDeviceCommand.command} - send to: ${arduinoDeviceCommand.arduinoPath}`, { status: 200 });
  } catch (error) {
    console.error(error);
    return new NextResponse('Internal Error' + JSON.stringify(error), { status: 500 });
  }
}
