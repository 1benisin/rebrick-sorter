import Image from 'next/image';
import { useState, useEffect } from 'react';

export default function ImageWithFallback({ alt, src, ...props }) {
  const [error, setError] = useState(null);

  useEffect(() => {
    setError(null);
  }, [src]);

  return (
    <Image
      alt={alt}
      onError={setError}
      src={error ? '/fallback.webp' : src}
      {...props}
    />
  );
}
