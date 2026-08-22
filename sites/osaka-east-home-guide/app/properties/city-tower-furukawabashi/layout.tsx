import type { Metadata } from "next";
import "./property.css";

export const metadata: Metadata = {
  title: "City Tower 古川桥｜大阪东线置业研究所",
  description: "City Tower 古川桥的户型价格、设计、停车、通勤、周边体育设施与投资价值研究。",
};

export default function PropertyLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
