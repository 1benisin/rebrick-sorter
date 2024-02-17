// /api/hardware/sort/route.ts

import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    return new NextResponse('setup hardware success', { status: 200 });
  } catch (error) {
    console.error(error);
    return new NextResponse('Internal Error' + JSON.stringify(error), { status: 500 });
  }
}
