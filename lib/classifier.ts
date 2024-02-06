// Classifier.ts

import axios, { AxiosResponse } from 'axios';
import { brickognizeResponseSchema, BrickognizeResponse } from '@/types';

export const CLASSIFICATION_DIMENSIONS = {
  width: 299,
  height: 299,
};

export default class Classifier {
  constructor() {
    // Initialize the classifier
  }

  public static async classify(imageURI: string): Promise<BrickognizeResponse> {
    try {
      // Send the request to your Next.js server's API route with the image URI
      const response: AxiosResponse = await axios.post('/api/brickognize', {
        imageURI: imageURI,
      });
      // validate the response
      const brickognizeResponse = brickognizeResponseSchema.parse(response.data);

      // Handle the server response as needed
      return brickognizeResponse;
    } catch (error) {
      console.error('Error sending image to Brickognize:', error);
      throw error;
    }
  }
}
