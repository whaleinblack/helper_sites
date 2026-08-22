import type { Metadata } from "next";
import "../city-tower-furukawabashi/property.css";
import "../showcase.css";
import "../catalog.css";
export const metadata:Metadata={title:"Proud 关目｜大阪东线置业研究所",description:"品牌中古、面积、管理、通勤、体育设施与投资价值研究。"};
export default function Layout({children}:Readonly<{children:React.ReactNode}>){return children;}
