// lib/utils.ts

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function absoluteUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_APP_URL}${path}`;
}

type TimeUnit = 'hr' | 'min' | 'sec' | 'ms';

export function getFormattedTime(fromAccuracy: TimeUnit, toAccuracy: TimeUnit, timeToFormatt?: number): string {
  const date = timeToFormatt ? new Date(timeToFormatt) : new Date();
  const timeComponents: Record<TimeUnit, string> = {
    hr: date.getHours().toString().padStart(2, '0'),
    min: date.getMinutes().toString().padStart(2, '0'),
    sec: date.getSeconds().toString().padStart(2, '0'),
    ms: date.getMilliseconds().toString().padStart(3, '0'),
  };

  const unitOrder: TimeUnit[] = ['hr', 'min', 'sec', 'ms'];
  const fromIndex = unitOrder.indexOf(fromAccuracy);
  const toIndex = unitOrder.indexOf(toAccuracy);

  if (fromIndex === -1 || toIndex === -1 || fromIndex > toIndex) {
    throw new Error('Invalid accuracy settings');
  }

  const selectedUnits = unitOrder.slice(fromIndex, toIndex + 1);
  const formattedTimeParts = selectedUnits.map((unit) => timeComponents[unit]);

  return formattedTimeParts.join(unitOrder.indexOf(toAccuracy) >= 2 ? ':' : '.');
}

export type SpeedLogEntry = { time: number; speed: number };

export const findPositionAtTime = (
  startPos: number,
  startTime: number,
  endTime: number,
  speedLog: SpeedLogEntry[], // Use the speed log now
  defaultSpeed: number, // Add a default speed for fallback
): number => {
  if (endTime <= startTime) {
    return startPos; // No time elapsed, no movement
  }

  // Filter relevant log entries and sort them by time
  const relevantEntries = speedLog
    .filter((entry) => entry.time <= endTime) // Include entries up to the end time
    .sort((a, b) => a.time - b.time);

  let currentPos = startPos;
  let lastTime = startTime;
  let lastSpeed = defaultSpeed; // Start with default speed

  // Find the speed active at startTime
  const entryBeforeStart = relevantEntries.filter((entry) => entry.time <= startTime).pop(); // Get the latest entry at or before startTime
  if (entryBeforeStart) {
    lastSpeed = entryBeforeStart.speed;
  } else if (relevantEntries.length > 0 && relevantEntries[0].time > startTime) {
    // If the first log entry is after startTime, we assume default speed until that entry
    lastSpeed = defaultSpeed;
  } else if (relevantEntries.length === 0) {
    // No relevant log entries, use default speed for the whole duration
    lastSpeed = defaultSpeed;
  }

  // Iterate through speed changes between startTime and endTime
  for (const entry of relevantEntries) {
    if (entry.time > lastTime && entry.time <= endTime) {
      // Calculate time elapsed at the previous speed
      const timeDiff = entry.time - lastTime;
      currentPos += lastSpeed * timeDiff; // Update position based on last speed (changed from -= to +=)
      lastTime = entry.time; // Update the time marker
      lastSpeed = entry.speed; // Update the speed for the next interval
    } else if (entry.time > endTime) {
      // This entry is past our target time, stop processing further entries for this calculation
      break;
    } else if (entry.time <= startTime) {
      // This entry is before or at the start time, just update the speed
      lastSpeed = entry.speed;
    }
  }

  // Calculate remaining distance traveled after the last log entry time up to endTime
  if (lastTime < endTime) {
    const remainingTimeDiff = endTime - lastTime;
    currentPos += lastSpeed * remainingTimeDiff; // Changed from -= to +=
  }

  return currentPos;
};

// Helper function to map sorter index to letter
export const getSorterLetter = (index: number | string | undefined): string => {
  if (index === undefined) return '?';
  const numIndex = typeof index === 'string' ? parseInt(index, 10) : index;
  if (isNaN(numIndex) || numIndex < 0 || numIndex > 3) return String(index); // Return original if invalid
  return String.fromCharCode(65 + numIndex); // 65 is ASCII for 'A'
};
