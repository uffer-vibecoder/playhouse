import type { Metadata } from "next";
import Contents from "@/components/Contents";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: SITE.name,
  description: SITE.description,
};

export default function Home() {
  return <Contents />;
}
