import Link from "next/link";
import type { ReactNode } from "react";

export function UtilityShell({ title, description, children, className = "" }: { title: string; description: string; children: ReactNode; className?: string }) {
  return <main className={`tool-shell utility-shell${className ? ` ${className}` : ""}`}>
    <Link className="back-link" href="/"><span aria-hidden="true">←</span> 多功能工具箱</Link>
    <header className="tool-header"><h1>{title}</h1><p>{description}</p></header>
    <section className="converter-card utility-card">{children}</section>
  </main>;
}
