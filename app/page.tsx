import Image from "next/image";
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

      <section className="author-card" aria-label="关于 Eason">
        <Image
          src="https://user15484.cn.imgto.link/public/20260824/03-default-no-bg-2.avif"
          alt="Eason 的头像"
          width={76}
          height={76}
          unoptimized
          loading="lazy"
          referrerPolicy="no-referrer"
        />
        <div className="author-card-copy">
          <span>我的卡片</span>
          <h2>Eason</h2>
          <p>一个零手工纯AI开发小白</p>
        </div>
        <a href="https://easonzhan.xyz/" target="_blank" rel="noopener noreferrer">
          我的博客 <span aria-hidden="true">↗</span>
        </a>
      </section>

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
