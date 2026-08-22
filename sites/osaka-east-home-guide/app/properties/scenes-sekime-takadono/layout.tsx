import type { Metadata } from "next";
import "../city-tower-furukawabashi/property.css";
import "../showcase.css";

export const metadata: Metadata = {
  title: "Scenes 关目高殿｜大阪东线置业研究所",
  description: "Scenes 关目高殿 Square Garden 的户型价格、设计、停车、通勤、体育设施与投资价值研究。",
};

export default function PropertyLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
