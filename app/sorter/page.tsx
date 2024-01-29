"use client";
import { Code } from "lucide-react";
import { Heading } from "@/components/heading";
import Camera from "@/components/camera";
import SorterControllerButton from "@/components/sorter-controller-button";

const SortPage = () => {
  return (
    <div>
      <h1>Sorter</h1>
      <div className="px-4 lg:px-8">
        <Camera />
        <div className="flex justify-center mt-4">
          <SorterControllerButton />
        </div>
      </div>
    </div>
  );
};

export default SortPage;
