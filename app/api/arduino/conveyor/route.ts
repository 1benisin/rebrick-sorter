// /api/arduino/conveyor/route.ts

import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    console.log(' conveyor API called');
    // get the body of the request
    const { test } = await req.json();
    console.log('time elapsed:', Date.now() - test);
    // send test back as a response
    return new NextResponse(JSON.stringify({ test }), { status: 200 });
  } catch (error) {
    console.error(error);
    return new NextResponse('Internal Error' + JSON.stringify(error), { status: 500 });
  }
}
