// app/api/hardware/sort/route.ts

// /api/hardware/sort/route.ts

import { NextResponse } from 'next/server';
import HardwareController from '@/lib/hardware/hardwareController';
import { sortPartSchema } from '@/types/sortPart.dto';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const sortPartDto = sortPartSchema.parse(body);
    const hardwareController = HardwareController.getInstance();

    hardwareController.sortPart(sortPartDto);

    return new NextResponse('Part sorted', { status: 200 });
  } catch (error) {
    console.error(error);
    return new NextResponse('Internal Error' + JSON.stringify(error), { status: 500 });
  }
}
