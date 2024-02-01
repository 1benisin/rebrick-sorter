export type Detection = {
  imageURI: string;
  timestamp: number;
  centroid: [number, number];
  box: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
};
