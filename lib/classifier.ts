// Classifier.ts

import axios, { AxiosResponse } from "axios";

export const CLASSIFICATION_DIMENSIONS = {
  width: 299,
  height: 299,
};

export default class Classifier {
  constructor() {
    // Initialize the classifier
  }

  public static async classify(imageURI: string): Promise<string> {
    try {
      // Send the request to your Next.js server's API route with the image URI
      const response: AxiosResponse = await axios.post("/api/brickognize", {
        imageURI: imageURI,
      });

      console.log("Server response:", response.data);

      // Handle the server response as needed
      return response.data;
    } catch (error) {
      console.error("Error sending image to server:", error);
      throw error;
    }
  }
}
