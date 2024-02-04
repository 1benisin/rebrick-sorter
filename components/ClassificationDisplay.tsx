// ClassificationDisplay.jsx

import React, { useEffect, useRef } from 'react';
import { sortProcessStore } from '@/stores/sortProcessStore';

const IMAGE_SIZE = 50; // Width of each image in pixels

const ClassificationDisplay = () => {
  const detectionImageURIs = sortProcessStore((state) => state.detectionImageURIs);
  const imagesRef = useRef<(HTMLImageElement | null)[]>([]); // Create an array of refs to store the image elements

  useEffect(() => {
    imagesRef.current = imagesRef.current.slice(-20); // Keep only the refs of the last 20 images

    // Animate existing images to the right
    imagesRef.current.forEach((img, index) => {
      if (img) {
        img.style.transition = 'transform 0.5s ease-out, opacity 0.5s ease-out';
        img.style.transform = `translateX(${IMAGE_SIZE}px)`;
      }
    });

    // Set initial style for the new image to fade in
    if (imagesRef.current[0]) {
      imagesRef.current[0].style.opacity = '0';
      setTimeout(() => {
        imagesRef.current[0]!.style.opacity = '1';
      }, 10); // Start the fade-in shortly after the component updates
    }
  }, [detectionImageURIs.length]);

  return (
    <div className={`flex overflow-x-auto`}>
      {detectionImageURIs
        .slice(-20)
        .reverse()
        .map((uri, index) => (
          <img
            key={uri}
            ref={(el) => (imagesRef.current[index] = el)}
            src={uri}
            alt={`Detection ${index}`}
            className={`transition-all ease-out duration-500 w-12 h-12 object-cover mr-2 min-w-[${IMAGE_SIZE}px]`}
            style={{ opacity: index === 0 ? '0' : '1' }} // New images start with opacity 0
          />
        ))}
    </div>
  );
};

export default ClassificationDisplay;
