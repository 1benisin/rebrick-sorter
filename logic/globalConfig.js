//
//

export const DEV_MODE = true;
// don't load model to save time when developing
export const LOAD_HAND_MODEL = false;
export const LOAD_MODELS = true;

//  google cloud storage folder location for collected training images
// - storage
export const DETECT_IMAGE_FOLDER = DEV_MODE ? 'detection_training_images_DEV' : 'detection_training_images';
export const CLASSIFY_IMAGE_FOLDER = DEV_MODE ? 'dev_classify_images' : 'classify_images';
export const TRAINING_SET_FOLDER = DEV_MODE ? 'training_set_DEV' : 'training_set';
export const CONVEYOR_TRAIN_CAT_FOLDER = DEV_MODE ? 'train_category_images_DEV' : 'train_category_images';
//  - firebase
export const CLASSIFY_IMAGE_COLLECTION = DEV_MODE ? 'dev_classificationSet' : 'classificationSet';
export const TRAINING_SET_COLLECTION = DEV_MODE ? 'training_set_DEV' : 'training_set';
export const INVENTORY_ITEM_COLLECTION = DEV_MODE ? 'inventory_item_DEV' : 'inventoryItem';
export const CATEGORY_LABEL_COLLECTION = DEV_MODE ? 'category_labels_DEV' : 'category_labels';
// source to use for video if in Dev Mode
// export const devVideoSrc1 = '/resources/object_detection.mp4';
// export const devVideoSrc2 = '/resources/object_detection_reverse.mp4';
export const devVideoSrc1 = '/resources/calibration.mp4';
export const devVideoSrc2 = '/resources/calibration_reverse.mp4';
// requested mediaStream dimensions
// export const mediaDim = { width: 1920, height: 1080 };
export const mediaDim = { width: 3840, height: 2160 };
// how much to scale down media dimension for object detection
// export const mediaScaler = 4;
// dimensions used with feeding media to object detection model
export const DETECT_DIMENSIONS = { width: 320, height: 180 }; // 320 x 180 or 480 x 270
export const DISPLAY_DIMENSIONS = { width: 320, height: 180 }; // 320 x 180 or 480 x 270
