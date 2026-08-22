import type { Metadata } from "next";
import "../city-tower-furukawabashi/property.css";
import "../showcase.css";

export const metadata: Metadata = {
  title: "Wellith 大日｜大阪东线置业研究所",
  description: "Wellith 大日的户型价格、公共空间、停车、通勤、体育设施与投资价值研究。",
};

export default function PropertyLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
