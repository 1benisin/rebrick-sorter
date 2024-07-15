// app/test/page.tsx

'use client';
import { Button } from '@/components/ui/button';
import useSocket from '@/hooks/useSocket';

const TestPage = () => {
  const { socket } = useSocket();

  function handleTest() {
    if (!socket || !socket.connected) {
      console.log('Socket not connected', socket?.id);
      return;
    }
    console.log('test', socket.connected, socket.id);
    socket.emit('outer', 'outer');
    socket.emit('abc', 'abc');
  }

  return (
    <div>
      <h1>Test Page</h1>
      <p>{`Active: ${socket?.active}`}</p>
      <Button onClick={handleTest}>Test</Button>
      <p>Socket ID: {socket?.id}</p>
    </div>
  );
};

export default TestPage;
