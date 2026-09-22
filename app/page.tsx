import Image from "next/image";
import { AiOutlineGithub, AiOutlineMail, AiOutlineQq } from "react-icons/ai";
import { FiGlobe } from "react-icons/fi";
import { HomeScrollRestorer } from "./components/home-scroll-restorer";
import { ToolSearchGrid } from "./components/tool-search-grid";

export default function Home() {
  return (
    <main className="home-shell">
      <HomeScrollRestorer />
      <header className="home-header">
        <h1>多功能工具箱</h1>
      </header>

      <ToolSearchGrid />

      <section className="author-card" aria-label="关于 Eason">
        <div className="author-profile">
          <Image
            src="/images/eason-avatar.png"
            alt="Eason 的头像"
            width={72}
            height={72}
            unoptimized
            loading="lazy"
          />
          <div className="author-card-copy">
            <h2>Eason</h2>
            <p>生活明朗万物可爱</p>
          </div>
        </div>
        <nav className="author-links" aria-label="Eason 的个人主页">
          <a href="https://github.com/EasonZe" target="_blank" rel="noopener noreferrer" aria-label="Eason 的 GitHub 主页" title="EasonZe">
            <AiOutlineGithub aria-hidden="true" /><span>GitHub</span>
          </a>
          <a href="https://qm.qq.com/q/7dNxa3Hgt2" target="_blank" rel="noopener noreferrer" aria-label="通过 QQ 联系 Eason" title="24125567">
            <AiOutlineQq aria-hidden="true" /><span>QQ</span>
          </a>
          <a href="mailto:qwas_qweasd@163.com" aria-label="给 Eason 发送邮件" title="qwas_qweasd@163.com">
            <AiOutlineMail aria-hidden="true" /><span>Email</span>
          </a>
          <a href="https://easonzhan.xyz/" target="_blank" rel="noopener noreferrer" aria-label="Eason 的博客" title="Blog">
            <FiGlobe aria-hidden="true" /><span>Blog</span>
          </a>
        </nav>
      </section>

      <footer className="site-footer">
        <p className="site-footer-meta">
          <span>© 2026 Eason · MIT License</span>
          <span className="site-footer-separator" aria-hidden="true">/</span>
          <a href="/rss.xml">RSS</a>
          <span className="site-footer-separator" aria-hidden="true">/</span>
          <a href="/sitemap.xml">Sitemap</a>
        </p>
      </footer>
    </main>
  );
}
