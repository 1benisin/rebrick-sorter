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

export const findPositionAtTime = (
  startPos: number,
  startTime: number,
  endTime: number,
  speedQueue: {
    time: number;
    speed: number;
  }[],
) => {
  let remainingTime = endTime - startTime;
  if (remainingTime < 0) {
    console.warn('findPositionAtTime: startTime is after endTime'); // sanity check
    return startPos;
  }
  let endPos = startPos;

  for (let i = 0; i < speedQueue.length; i++) {
    // exit condition
    if (remainingTime <= 1) break;

    const { speed, time: speedStart } = speedQueue[i];
    let { time: speedEnd } = speedQueue[i + 1] || {};

    // if no next speed change use 5 minutes from now as the end time
    speedEnd = speedEnd || Date.now() + 5 * 60 * 1000;

    // use later start time
    const start = speedStart > startTime ? speedStart : startTime;

    let timeTraveled = speedEnd - start;
    // if speed ended before the start time of the part timeTraveled will be negative
    // -clamp the time traveled to 0 cause it has no effect on the position
    timeTraveled = timeTraveled < 0 ? 0 : timeTraveled > remainingTime ? remainingTime : timeTraveled;
    let distanceTraveled = timeTraveled * speed;

    remainingTime -= timeTraveled;
    endPos += distanceTraveled;
  }

  return endPos;
};
