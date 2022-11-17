import { delay } from './utils';
import { emitTest } from './socketManager';

const detecting = false;

export const start = async (stopCallback) => {
  detecting = true;

  for (let i = 0; i < 10; i++) {
    if (!detecting) return;
    // console.log('detecting ', i);
    emitTest(i);
    await delay(200);
  }

  stop();
  stopCallback();
  // do {
  //   console.log('detecting');
  //   await delay(1000);
  // } while (detecting);
};

export const stop = () => {
  detecting = false;
};

// import util from 'util';
// import { detectConveyorAsync, classify, getLabels, getBinFromLabelIndex } from './modelManager';
// import { distanceBetweenPoints, delay, makeNoise } from '../utils/globalUtils';
// import { DETECT_DIMENSIONS } from '../config/globalConfig';
// import { findScreenEnterAndExitTimes, shiftPointToScreen1Perspective, findCenterTime2 } from './velocityCalibrator';
// import store from '../store';
// import { conveyorOnOff, sorterToOrigin } from './arduinoCommunicator';
// import {
//   setScreen1Part,
//   setScreen2Part,
//   setPairedParts,
//   addToPartsCounted,
//   setSessionStartTime,
//   saveSession,
// } from '../features/sortSessionSlice';
// import { queueNewPart, velocities } from './sorterController';
// import { fetchAllSettings, setAverageCycleTime } from '../features/settingsSlice';
// import { getImageCaptures } from './streamManager';

// const partTemplate = {
//   detections: [],
//   centerTime: null,
//   edgeTimes: null,
//   label: null,
//   labelIndex: null,
//   labelCertainty: null,
//   offScreen: false,
//   stale: false,
//   sortingBin: null, // what sorting bin should it go in
// };
// const detectionTemplate = {
//   classifications: [], // [...{ labelCertainty,labelIndex }]
//   imgUrl: null,
//   centroid: null,
//   captureTime: null,
// };
// const CAPTURE_DIMENSIONS = { width: 299, height: 299 }; // size copped out around part for classification
// let DETECTING = false;
// let scalar = null;
// let parts1 = [];
// let parts2 = [];
// const LOCATION_MARGIN_ERROR = 0.25; // maximum distance that two parts will be grouped - percentage of screen width

// // fetch settings and assign variables we will use
// (async () => {
//   await store.dispatch(fetchAllSettings());
// })();

// export const stopDetecting = () => {
//   sorterToOrigin();
//   store.dispatch(saveSession());
//   DETECTING = false;
// };

// const classifyFromDetection = async (detection, img) => {
//   // get centroid at detection size
//   let { left, top, width, height } = detection.box;
//   const centroid = [left + width / 2, top + height / 2];
//   // turn detection box into a square
//   [left, top, width, height] =
//     width > height
//       ? [left, top - (width - height) / 2, width, width]
//       : [left - (height - width) / 2, top, height, height];
//   // scale up detection to capture img size
//   [left, top, width, height] = [left * scalar, top * scalar, width * scalar, height * scalar];
//   // scale up detection box by 10%. this makes sure we get the whole lego in the crop image
//   const cropMargin = width * 0.1;
//   [left, top, width, height] = [left - cropMargin, top - cropMargin, width + cropMargin * 2, height + cropMargin * 2];

//   // skip detection if edge lies outside of img boundries
//   if (left < 0 || left + width > img.width || top < 0 || top + height > img.height) {
//     return null;
//   }

//   // create cropped imgUrl
//   const cropCanvas = document.createElement('canvas');
//   cropCanvas.width = CAPTURE_DIMENSIONS.width;
//   cropCanvas.height = CAPTURE_DIMENSIONS.height;
//   const ctx = cropCanvas.getContext('2d');
//   ctx.drawImage(img, left, top, width, height, 0, 0, cropCanvas.width, cropCanvas.height);
//   const imgUrl = cropCanvas.toDataURL('image/jpeg', 0.5);
//   // let imageData = ctx.getImageData(60, 60, 200, 100);

//   // CLASSIFY
//   const predictionPromise = classify(cropCanvas);

//   const newDetection = { ...detectionTemplate, imgUrl, classifications: predictionPromise, centroid };
//   return newDetection;
// };

// const detectAndClassify = async (screenNum, img, captureTime) => {
//   // draw calls
//   const displayCanvas = document.getElementById(`displayCanvas${screenNum}`);
//   const displayCtx = displayCanvas.getContext('2d');
//   displayCtx.drawImage(img, 0, 0, img.width, img.height, 0, 0, displayCanvas.width, displayCanvas.height);

//   const imageData = displayCtx.getImageData(0, 0, displayCanvas.width, displayCanvas.height);

//   // get scaling dimensions
//   if (!scalar) scalar = img.width / DETECT_DIMENSIONS.width;

//   // DETECT
//   const detections = await detectConveyorAsync(imageData);

//   // CLASSIFY
//   const newDetections = [];
//   for (const detection of detections) {
//     const classificationResults = await classifyFromDetection(detection, img);
//     // will return null if cropped detection box overlaps outside of screen
//     if (classificationResults) newDetections.push({ ...classificationResults, captureTime });
//   }

//   return newDetections;
// };

// const createCaptures = async (imageCapture1, imageCapture2, msOverCycleTime, cycleDelay) => {
//   try {
//     const captureTime1 = Date.now() - msOverCycleTime;
//     const img1 = await imageCapture1.grabFrame();
//     const captureTime2 = Date.now() - msOverCycleTime;
//     const img2 = await imageCapture2.grabFrame();

//     const detections1 = await detectAndClassify(1, img1, captureTime1);
//     await delay(cycleDelay);
//     const detections2 = await detectAndClassify(2, img2, captureTime2);
//     await delay(cycleDelay);
//     return [detections1, detections2];
//   } catch (error) {
//     console.error(error);
//     stopDetecting();
//     conveyorOnOff();
//   }
// };

// const matchDetectionsToParts = (newDetections, velocity, parts) => {
//   let newParts = [...parts];
//   // see if there is a matching part for each new detection
//   for (const newD of newDetections) {
//     let bestIdx = null;
//     let bestDist = null;
//     // let distFromPrev = null;

//     for (const [i, part] of newParts.entries()) {
//       // find distance between centroids
//       const lastD = part.detections[part.detections.length - 1];
//       const timeBetweenDetections = newD.captureTime - lastD.captureTime;
//       const predictedCentroid = [
//         lastD.centroid[0] + velocity[0] * timeBetweenDetections,
//         lastD.centroid[1] + velocity[1] * timeBetweenDetections,
//       ];
//       const dist = Math.abs(distanceBetweenPoints(predictedCentroid, newD.centroid));
//       // if first or better match
//       if (bestDist === null || dist < bestDist) {
//         bestDist = dist;
//         bestIdx = i;
//       }
//     }

//     const marginOfError = LOCATION_MARGIN_ERROR * DETECT_DIMENSIONS.width;
//     // if no parts to match detection bestDist is null - create new part from detection
//     // or if best match is not within margin of error - create new part from detection
//     if (bestDist === null || bestDist > marginOfError) {
//       const dWithLogDist = { ...newD, closestLastDetection: bestDist };
//       const newPart = { ...partTemplate, detections: [dWithLogDist] };
//       // const newPart = { ...partTemplate, detections: [newD] };
//       newParts = [newPart, ...newParts];
//     } else {
//       // else add detection to best matching parts detections
//       const updatedPart = { ...newParts[bestIdx], detections: [...newParts[bestIdx].detections, newD] };
//       newParts[bestIdx] = updatedPart;
//     }
//   }
//   return newParts;
// };

// const updateParts = (parts, velocity) => {
//   const newParts = [...parts];
//   for (const [i, part] of newParts.entries()) {
//     const lastDetection = part.detections[part.detections.length - 1];
//     const timeElapsed = Date.now() - lastDetection.captureTime;

//     const predictedCentroid = [
//       lastDetection.centroid[0] + velocity[0] * timeElapsed,
//       lastDetection.centroid[1] + velocity[1] * timeElapsed,
//     ];
//     // if part off screen
//     if (
//       predictedCentroid[0] < 0 ||
//       predictedCentroid[0] > DETECT_DIMENSIONS.width ||
//       predictedCentroid[1] < 0 ||
//       predictedCentroid[1] > DETECT_DIMENSIONS.height
//     ) {
//       const centerTime = findCenterTime2(part.detections, [DETECT_DIMENSIONS.width / 2, DETECT_DIMENSIONS.height / 2]);
//       const updatedPart = { ...part, centerTime, offScreen: true };
//       newParts[i] = updatedPart;

//       // if part is far enough away to be stale
//       if (
//         predictedCentroid[0] < -DETECT_DIMENSIONS.width ||
//         predictedCentroid[0] > DETECT_DIMENSIONS.width * 2 ||
//         predictedCentroid[1] < -DETECT_DIMENSIONS.height ||
//         predictedCentroid[1] > DETECT_DIMENSIONS.height * 2
//       ) {
//         newParts[i].stale = true;
//       }
//     }
//   }
//   return newParts;
// };

// const addTopPredictionToPart = async (part) => {
//   // for debugging
//   const classifications = [];

//   // filter out unresolved classification promises
//   const resolvedDetections = part.detections.filter((d) => !util.inspect(d.classifications).includes('pending'));

//   // sum all calassification predictions into combinedClassifications
//   let combinedClassifications = null;
//   for (const d of resolvedDetections) {
//     // resolve classification promise
//     const predictions = await d.classifications;
//     // for debugging
//     classifications.push(predictions);
//     // if first = create array of 0's
//     if (!combinedClassifications) combinedClassifications = new Array(predictions.length).fill(0);

//     for (const [i, prediction] of predictions.entries()) {
//       combinedClassifications[i] += prediction;
//     }
//   }

//   // find top classification result
//   let topCertainty = Math.max(...combinedClassifications);
//   const topIdx = combinedClassifications.indexOf(topCertainty);
//   const [_, topLabel, mappedBin] = getLabels()[topIdx];
//   topCertainty /= resolvedDetections.length;

//   return {
//     ...part,
//     label: topLabel,
//     labelIndex: topIdx,
//     labelCertainty: topCertainty,
//     sortingBin: mappedBin,
//     numOfResolvedClassifications: resolvedDetections.length,
//     // for debugging
//     classifications,
//   };
// };

// const handleMatchingParts = async (p1, p2) => {
//   // loop over parts2 that are offscreen and match them up with parts1 that are offScreen
//   // -relies on the fact that parts1 leave the screen first
//   // match them by closest enter the screen times
//   // -relies on parts entering both screens close to same time - mechanically line up cameras this way

//   const idxsToRemove2 = [];
//   let p1Filtered = [...p1];

//   // LOOP parts2
//   for (const [idx2, part2] of p2.entries()) {
//     // skip parts that haven't moved off screen yet
//     if (part2.centerTime === null) continue; // centerTime is added when part moves off screen

//     let bestMatch = 999999999; // starting high. time dif must be lowest to match
//     let bestIdx1 = null;

//     // LOOP parts1
//     for (const [idx1, part1] of p1Filtered.entries()) {
//       // skip parts that haven't moved off screen yet
//       if (part1.centerTime === null) continue; // centerTime is added when part moves off screen

//       const timeDif = Math.abs(part1.centerTime - part2.centerTime);
//       if (timeDif < 500 && timeDif < bestMatch) {
//         bestMatch = timeDif;
//         bestIdx1 = idx1;
//       }
//     }

//     if (bestIdx1 === null) continue; // if no acceptable part match found then continue

//     idxsToRemove2.push(idx2); // schedule matched part2 for removal
//     let pairedPart = {
//       ...partTemplate,
//       detections: [...part2.detections, ...p1Filtered[bestIdx1].detections],
//       pairedParts: [part2, p1Filtered[bestIdx1]],
//       centerTimeDiff: bestMatch,
//     };
//     // get top predictions
//     pairedPart = await addTopPredictionToPart(pairedPart);
//     // update display state
//     const { pairedParts } = store.getState().sortSession;
//     store.dispatch(setPairedParts([pairedPart, ...pairedParts.slice(0, 10)]));

//     // add sorter move to queue
//     const lastPosition = p1Filtered[bestIdx1].detections[p1Filtered[bestIdx1].detections.length - 1].centroid;
//     const lastTime = p1Filtered[bestIdx1].detections[p1Filtered[bestIdx1].detections.length - 1].captureTime;
//     queueNewPart(lastPosition, lastTime, pairedPart.sortingBin);

//     // add to parts counted
//     store.dispatch(addToPartsCounted({ count: 1, bin: pairedPart.sortingBin }));

//     // filter out  matching indexed part or stale parts
//     const filtered = [];
//     for (const [i, part] of p1Filtered.entries()) {
//       if (i !== bestIdx1 && !part.stale) filtered.push(part);
//     }
//     p1Filtered = filtered;
//   }

//   // filter out any matching indexed parts or stale parts
//   const p2Filtered = p2.filter((p, i) => !idxsToRemove2.includes(i) && !p.stale);
//   return [p1Filtered, p2Filtered];
// };

// let avgCycleLength = null;
// let cycleLengthArray = null;
// let lastCaptureTime = 0;

// const getMsOverNormalCycleLength = () => {
//   const captureTime = Date.now();
//   const lastCycleLength = captureTime - lastCaptureTime;

//   // figure out average cycle length in ms
//   if (!avgCycleLength) {
//     if (cycleLengthArray === null) cycleLengthArray = [];
//     // this will skip first cycle
//     else if (cycleLengthArray.length < 40) {
//       console.log('CycleLength', lastCycleLength);
//       cycleLengthArray.push(lastCycleLength);
//     } else {
//       avgCycleLength = cycleLengthArray.reduce((a, b) => a + b) / cycleLengthArray.length;
//       store.dispatch(setAverageCycleTime(avgCycleLength));
//       console.log('avg Cycle Length:', avgCycleLength);
//     }
//   }

//   // figure out average cycle length in ms
//   let msOverNormalCycleLength = 0;
//   if (avgCycleLength) {
//     msOverNormalCycleLength = lastCycleLength - avgCycleLength;
//     msOverNormalCycleLength = msOverNormalCycleLength > 0 ? msOverNormalCycleLength : 0;
//   }

//   lastCaptureTime = captureTime;
//   return msOverNormalCycleLength;
// };

// let lastCycleDelayAdjust = 0;
export const startDetecting = async (stopCallback) => {
  //   store.dispatch(setSessionStartTime(Date.now()));
  detecting = true;
  //   // get image caputure objects
  //   const [imageCapture1, imageCapture2] = await getImageCaptures();
  while (detecting) {
    try {
      console.log('detecting');
      await delay(200);

      //       // find how many ms over normal cycle length last while loop took
      //       // this is used to try and adjuct captureTimes to account for video feed being delayed when busy
      //       let msOverNormalCycleLength = getMsOverNormalCycleLength();
      //       msOverNormalCycleLength -= lastCycleDelayAdjust;
      //       msOverNormalCycleLength = msOverNormalCycleLength < 0 ? 0 : msOverNormalCycleLength;
      //       lastCycleDelayAdjust = msOverNormalCycleLength;
      //       const delayAdjustment = msOverNormalCycleLength / 6;
      //       await delay(delayAdjustment);
      //       // CAPTURE & DETECT & CLASSIFY
      //       const [detections1, detections2] = await createCaptures(
      //         imageCapture1,
      //         imageCapture2,
      //         msOverNormalCycleLength * 0.6,
      //         delayAdjustment
      //       );
      //       // retrieve potentially updated velocites from sorter controller
      //       const [velocity1, velocity2] = velocities();
      //       // match detections to parts
      //       const partsWithDetections1 = matchDetectionsToParts(detections1, velocity1, parts1);
      //       const partsWithDetections2 = matchDetectionsToParts(detections2, velocity2, parts2);
      //       // display part detections for each screen
      //       store.dispatch(setScreen1Part(partsWithDetections1));
      //       store.dispatch(setScreen2Part(partsWithDetections2));
      //       //   update parts offScreen, stale, and centerTime properties
      //       const partsUpdated1 = updateParts(partsWithDetections1, velocity1);
      //       const partsUpdated2 = updateParts(partsWithDetections2, velocity2);
      //       // combine parts from multiple cameras
      //       // add part to sorter queue
      //       // and filter out matched and stale parts
      //       const [p1s, p2s] = await handleMatchingParts(partsUpdated1, partsUpdated2);
      //       parts1 = p1s;
      //       parts2 = p2s;
      //       // console.log('cycle time', Date.now() - time);
      //       // console.log(msOverNormalCycleLength, 'ms over');
    } catch (error) {
      console.error(error);
      stopCallback();
      break;
    }
  }

  //   imageCapture1.track.stop();
  //   imageCapture2.track.stop();
};
