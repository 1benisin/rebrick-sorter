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

export const findPositionAtTime = (startPos: number, startTime: number, endTime: number, conveyorSpeed: number) => {
  let timeDiff = endTime - startTime;
  return startPos - conveyorSpeed * timeDiff;
};
