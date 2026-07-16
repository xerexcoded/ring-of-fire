import type { Metadata } from "next";
import { JourneyExperience } from "@/components/journey-experience";

export const metadata: Metadata = {
  title: "A ring that isn’t a ring",
};

export default function HomePage() {
  return <JourneyExperience />;
}
