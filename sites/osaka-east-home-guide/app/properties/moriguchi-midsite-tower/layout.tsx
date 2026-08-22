import type { Metadata } from "next";
import "../city-tower-furukawabashi/property.css";
import "../showcase.css";
import "../catalog.css";
export const metadata:Metadata={title:"守口 Midsite Tower｜大阪东线置业研究所",description:"站前塔楼、挂牌、修缮、通勤、体育设施与投资价值研究。"};
export default function Layout({children}:Readonly<{children:React.ReactNode}>){return children;}
