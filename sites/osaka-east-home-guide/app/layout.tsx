import type { Metadata } from "next";
import "./globals.css";
import "./resolution.css";

export const metadata: Metadata = {
  title: "大阪东线置业研究所｜门真市通勤购房地图",
  description: "大阪谷町线与京阪本线购房区域研究：通勤、房价、楼盘与风险。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
