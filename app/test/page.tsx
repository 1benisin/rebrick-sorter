// test/page.tsx
'use client';
import { ArduinoCommands } from '@/types/arduinoCommands.d';

import { Button } from '@/components/ui/button';
import axios from 'axios';

const TestPage = () => {
  const handleTest = async () => {
    // const res = await axios.post('/api/arduino', {
    //   command: ArduinoCommands.SETUP,
    //   arduinoPath: 'test',
    //   data: 'test',
    // });
    try {
      const res = await axios.post('/api/hardware/init');
      console.log(res.data); // Handle response data
    } catch (error) {
      console.error(error); // Handle error
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <Button onClick={handleTest}>Test</Button>
    </div>
  );
};

export default TestPage;
