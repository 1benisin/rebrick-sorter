// /api/brickognize/route.ts

import axios, { AxiosResponse } from "axios";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    // Get the imageURI from the request body

    const { imageURI } = await req.json();
    if (!imageURI) {
      return new NextResponse("imageURI is required", { status: 400 });
    }

    const dataURLToBlob = async (imageURI: string): Promise<Blob> => {
      return fetch(imageURI)
        .then((res) => res.blob())
        .catch((error) => {
          console.error("Conversion to blob failed:", error);
          throw error;
        });
    };

    // convert imageURI to Blob
    const imageBlob = await dataURLToBlob(imageURI);

    // Create FormData and append the image Blob
    const formData: FormData = new FormData();
    formData.append("query_image", imageBlob, "query_image.jpg");

    // Set up the request configuration
    const config = {
      method: "post",
      url: "https://api.brickognize.com/predict/",
      headers: { "Content-Type": "multipart/form-data" },
      data: formData,
    };

    // Send the request to the Brickognize API
    const response: AxiosResponse = await axios(config);

    console.log("Brickognize response:", response.data);

    // Send the response back to the client
    return NextResponse.json(response.data);
  } catch (error) {
    console.error("Error forwarding request to Brickognize:", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
