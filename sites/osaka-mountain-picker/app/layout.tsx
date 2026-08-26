import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: '下一座山 · 大阪発',
  description: '从大阪出发，用路线难度、交通、气候与实时天气筛选下一座山。',
  openGraph: {
    title: '下一座山 · 大阪発',
    description: '以大阪站为起点，四季筛选关西与近郊登山路线。',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: '下一座山 · 大阪発',
    description: '山域、路线、交通、气候与 14 日天气的可解释规划工具。',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
