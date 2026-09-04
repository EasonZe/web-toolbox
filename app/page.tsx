import { HomeScrollRestorer } from "./components/home-scroll-restorer";
import { ToolSearchGrid } from "./components/tool-search-grid";

export default function Home() {
  return (
    <main className="home-shell">
      <HomeScrollRestorer />
      <header className="home-header">
        <h1>多功能工具箱</h1>
        <p>有问题意见反馈请加QQ2459366392。</p>
      </header>

      <ToolSearchGrid />

      <footer className="site-footer">
        <p className="site-footer-meta">
          <span>© 2026 Eason. All Rights Reserved.</span>
          <span className="site-footer-separator" aria-hidden="true">/</span>
          <a href="/rss.xml">RSS</a>
          <span className="site-footer-separator" aria-hidden="true">/</span>
          <a href="/sitemap.xml">Sitemap</a>
        </p>
      </footer>
    </main>
  );
}
