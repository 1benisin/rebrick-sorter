// /api/hardware/sort/route.ts

import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log('sort part', body);

    return new NextResponse('part recieved to sort', { status: 200 });
  } catch (error) {
    console.error(error);
    return new NextResponse('Internal Error' + JSON.stringify(error), { status: 500 });
  }
}
