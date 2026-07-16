import type { Metadata } from "next";
import { AtlasExplorer } from "@/components/atlas-explorer";

export const metadata: Metadata = {
  title: "Interactive Atlas",
  description: "Explore sourced volcanoes, earthquakes, plate boundaries, and tsunami sources around the Pacific.",
};

export default function AtlasPage() {
  return <AtlasExplorer />;
}
