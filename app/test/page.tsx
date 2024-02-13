// test/page.tsx
'use client';

import { Button } from '@/components/ui/button';
import axios from 'axios';

const TestPage = () => {
  const handleTest = async () => {
    const res = await axios.post('/api/arduino', {
      test: Date.now(),
    });
    console.log(res.data); // Handle response data

    console.log(res.data);
    console.log(Date.now() - res.data.test);
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <Button onClick={handleTest}>Test</Button>
    </div>
  );
};

export default TestPage;
