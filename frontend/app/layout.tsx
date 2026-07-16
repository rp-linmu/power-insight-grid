import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";

import TradingDayBar from "../components/TradingDayBar";
import { getTradingContext } from "../lib/api";

export const metadata: Metadata = {
  title: "电力交易信息门户",
  description: "面向电力市场披露、政策解读与预测分析的一体化门户。",
};


export default async function RootLayout({ children }: { children: ReactNode }) {
  const tradingContext = await getTradingContext();
  return (
    <html lang="zh-CN">
      <body>
        <div className="shell">
          <header className="topbar">
            <div className="brand">Power Insight Grid</div>
            <nav className="nav">
              <Link href="/">首页</Link>
              <Link href="/spot">现货模块</Link>
              <Link href="/midterm">中长期模块</Link>
              <Link href="/policies">政策文件</Link>
              <Link href="/topology">网架拓扑</Link>
              <Link href="/data-acquisition">数据获取</Link>
              <Link href="/imports">导入管理</Link>
            </nav>
          </header>
          <Suspense
            fallback={
              <div className="trading-day-bar trading-day-loading">
                <strong>交易日</strong>
                <span>正在读取数据状态...</span>
              </div>
            }
          >
            <TradingDayBar initialContext={tradingContext} />
          </Suspense>
          {children}
          <footer className="footer">本地辅助决策系统，支持数据导入、预测分析、政策下载与多轮问答。</footer>
        </div>
      </body>
    </html>
  );
}
