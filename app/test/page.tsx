// app/test/page.tsx

'use client';

import { useSocket } from '@/hooks/useSocket';
import StatusIndicator from '@/components/StatusIndicator';

export default function Test() {
  const { status, socket, transport } = useSocket();

  return <StatusIndicator />;
}
