import type { Metadata } from "next";
import "../city-tower-furukawabashi/property.css";
import "../showcase.css";
import "../catalog.css";
export const metadata:Metadata={title:"City House 新森｜大阪东线置业研究所",description:"站距、公园、户型、停车、通勤、体育设施与投资价值研究。"};
export default function Layout({children}:Readonly<{children:React.ReactNode}>){return children;}
