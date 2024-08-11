"use strict";
// lib/utils.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.findPositionAtTime = exports.getFormattedTime = exports.absoluteUrl = exports.cn = void 0;
const clsx_1 = require("clsx");
const tailwind_merge_1 = require("tailwind-merge");
function cn(...inputs) {
    return (0, tailwind_merge_1.twMerge)((0, clsx_1.clsx)(inputs));
}
exports.cn = cn;
function absoluteUrl(path) {
    return `${process.env.NEXT_PUBLIC_APP_URL}${path}`;
}
exports.absoluteUrl = absoluteUrl;
function getFormattedTime(fromAccuracy, toAccuracy, timeToFormatt) {
    const date = timeToFormatt ? new Date(timeToFormatt) : new Date();
    const timeComponents = {
        hr: date.getHours().toString().padStart(2, '0'),
        min: date.getMinutes().toString().padStart(2, '0'),
        sec: date.getSeconds().toString().padStart(2, '0'),
        ms: date.getMilliseconds().toString().padStart(3, '0'),
    };
    const unitOrder = ['hr', 'min', 'sec', 'ms'];
    const fromIndex = unitOrder.indexOf(fromAccuracy);
    const toIndex = unitOrder.indexOf(toAccuracy);
    if (fromIndex === -1 || toIndex === -1 || fromIndex > toIndex) {
        throw new Error('Invalid accuracy settings');
    }
    const selectedUnits = unitOrder.slice(fromIndex, toIndex + 1);
    const formattedTimeParts = selectedUnits.map((unit) => timeComponents[unit]);
    return formattedTimeParts.join(unitOrder.indexOf(toAccuracy) >= 2 ? ':' : '.');
}
exports.getFormattedTime = getFormattedTime;
const findPositionAtTime = (startPos, startTime, endTime, speedQueue) => {
    let remainingTime = endTime - startTime;
    if (remainingTime < 0) {
        console.warn('findPositionAtTime: startTime is after endTime'); // sanity check
        return startPos;
    }
    let endPos = startPos;
    for (let i = 0; i < speedQueue.length; i++) {
        // exit condition
        if (remainingTime <= 1)
            break;
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
exports.findPositionAtTime = findPositionAtTime;
