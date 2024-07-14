// app/api/hardware/init/route.ts

// // /api/arduino/route.ts

// import { NextResponse } from 'next/server';
// import HardwareController from '@/lib/hardware/hardwareController';
// import { hardwareInitSchema } from '@/types/hardwareInit.dto';

// export async function POST(req: Request) {
//   try {
//     const data: unknown = await req.json();
//     const hardwareSettings = hardwareInitSchema.parse(data);

//     // get the singleton instance of the SerialPortManager
//     const hardwareController = HardwareController.getInstance();
//     await hardwareController.init(hardwareSettings);

//     return new NextResponse('setup hardware success', { status: 200 });
//   } catch (error) {
//     console.error(error);
//     return new NextResponse('Internal Error' + JSON.stringify(error), { status: 500 });
//   }
// }
