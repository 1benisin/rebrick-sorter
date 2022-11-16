//
import * as automl from '@tensorflow/tfjs-automl';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-cpu';
import { loadGraphModel } from '@tensorflow/tfjs-converter';
import axios from 'axios';
import { DEV_MODE, LOAD_MODELS, LOAD_HAND_MODEL } from './globalConfig';

let handModel = null;
let detectionModel = null;
let classificationModel = null;
let labels = [];
const labelToBinMapping = [];

// takes a 299 x 299 canvase of a part
// returns classification
export const classify = async (canvas) => {
  if (!classificationModel) {
    alert('No Classification Model Loaded');
    return;
  }
  const imgTensor = tf.browser.fromPixels(canvas);
  const normalized = tf.div(imgTensor, tf.scalar(255));

  const recast = tf.cast(normalized, 'float32');
  const reshaped = tf.expandDims(recast);

  const result = await classificationModel.predict(reshaped);

  const resultArray = result.arraySync();
  imgTensor.dispose();
  normalized.dispose();
  recast.dispose();
  reshaped.dispose();
  result.dispose();
  return resultArray[0];
};

// take a displayCtx.getImageData
// returns detections
export const detect = async (imageData) => {
  if (!LOAD_MODELS && DEV_MODE) {
    alert('No Detection Model Loaded');
    return null;
  }
  try {
    const options = { score: 0.5, iou: 0.5, topk: 5 };
    const predictions = await detectionModel.detect(imageData, options);
    return predictions;
  } catch (err) {
    console.error(err);
  }
};

// export const getBinFromLabelIndex = (idx) => {
//   if (!labelToBinMapping.length) {
//     alert('No labelToBinMapping');
//     return;
//   }
//   // const binOf100 = idx % 100;
//   // const sort1Bin = Math.floor(binOf100 / 10);
//   // const sort2Bin = binOf100 % 10;
//   const [sort1Bin, sort2Bin] = labelToBinMapping[idx];
//   return [sort1Bin, sort2Bin];
// };

// export const getLabels = () => {
//   if (!labels.length) {
//     alert('No Classification Labels Loaded');
//     return;
//   }
//   return labels;
// };

// // -- gets hand model predictions
// export const asyncDetect = async (img) => {
//   if (!LOAD_HAND_MODEL && DEV_MODE) {
//     console.log('detection failed. no hand model');
//     return null;
//   }
//   try {
//     const options = { score: 0.5, iou: 0.5, topk: 5 };
//     const predictions = await handModel.detect(img, options);
//     return predictions;
//   } catch (err) {
//     console.error(err);
//   }
// };

// ------------------ LOADERS ------------------

// // ---------------- load Classification model
// (async () => {
//   // to prevent time consuming model loading while developing
//   if (!LOAD_MODELS) {
//     console.log('CLASSIFY MODEL NOT LOADED');
//     return null;
//   }

//   if (!classificationModel) {
//     const startTime = Date.now();
//     try {
//       // load labels
//       const modelLabels = await fetch(
//         process.cwd() + '/models/all_classes/labels.json'
//       );
//       // let modelLabels = await fetch('/models/all_color/label-index_mainsort_subsort.json');
//       labels = await modelLabels.json();
//       console.log('labels', labels);

//       // for (const labelToBinMap of modelLabels) {
//       //   labels.push(labelToBinMap[2])
//       // }
//       // console.log('labels', labels);

//       // load labelToBinMapping
//       // for (const key in modelLabels) {
//       //   if (Object.hasOwnProperty.call(modelLabels, key)) {
//       //     const label = modelLabels[key];
//       //     labels[label.index] = key;
//       //     labelToBinMapping[label.index] = [label.mainsort, label.subsort];
//       //   }
//       // }

//       // classificationModel = await automl.loadImageClassification('/models/all_color/model.json');
//       classificationModel = await loadGraphModel(process.cwd() + '/models/all_classes/model.json');
//       console.log(
//         'CLASSIFICATION MODEL LOADED',
//         Date.now() - startTime,
//         'ms',
//         classificationModel
//       );
//       // prime model with inital prediction
//       const zeros = tf.zeros([1, 299, 299, 3]);
//       classificationModel.predict(zeros);
//     } catch (error) {
//       console.log(error);
//     }
//   }
// })();

// // ---------------- load Detection model
// (async () => {
//   // to prevent time consuming model loading while developing
//   if (!LOAD_MODELS) {
//     console.log('CONVEYOR MODEL NOT LOADED');
//     return null;
//   }

//   if (!detectionModel) {
//     const startTime = Date.now();
//     try {
//       // load model
//       detectionModel = await automl.loadObjectDetection(
//         '/models/tf_js-detection_with_sm_20211124050117-2021-11-26T18:33:55.790970Z/model.json'
//       );

//       // // prime model
//       // const img = new Image();
//       // img.width = 299;
//       // img.height = 299;
//       // img.src = '/fallback.webp';
//       // const primeCanvas = document.createElement('canvas');
//       // primeCanvas.width = 299;
//       // primeCanvas.height = 299;
//       // const ctx = primeCanvas.getContext('2d');
//       // ctx.drawImage(img, 0, 0, primeCanvas.width, primeCanvas.height);
//       // const result = await detect(primeCanvas);
//       // console.log('prime: ', result);

//       console.log('CONVEYOR MODEL LOADED', Date.now() - startTime, 'ms');
//     } catch (error) {
//       console.log(error);
//     }
//   }
//   return detectionModel;
// })();

// // ---------------- load hand model
// (async () => {
//   // to prevent time consuming model loading while developing
//   if (!LOAD_HAND_MODEL) {
//     console.log('HAND MODEL NOT LOADED');
//     return null;
//   }

//   if (!handModel) {
//     try {
//       // load model
//       handModel = await automl.loadObjectDetection(
//         '/models/tf_js-handheld_detection-2021-08-26/model.json'
//       );

//       // prime model
//       const img = new Image();
//       img.width = 299;
//       img.height = 299;
//       img.src = '/resources/prime_model_image.jpg';
//       const primeCanvas = document.createElement('canvas');
//       primeCanvas.width = 299;
//       primeCanvas.height = 299;
//       const ctx = primeCanvas.getContext('2d');
//       ctx.drawImage(img, 0, 0, primeCanvas.width, primeCanvas.height);
//       await asyncDetect(primeCanvas);

//       console.log('HAND MODEL LOADED');
//     } catch (error) {
//       console.log(error);
//     }
//   }
//   return handModel;
// })();
