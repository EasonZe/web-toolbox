"use client";
import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { TbCube, TbFile, TbFileCode, TbFolder, TbFolderOpen, TbMusic, TbPhoto } from "react-icons/tb";
import type { UnityAsset } from "../lib/game-asset-types";
import { fileSize } from "../lib/local-files";
import { buildUnityAssetTree, isUnityFolder, unityTreeAssetIds, unityTreeCounts, unityTreeDefaultExpanded, unityTreeRows, type UnityTreeNode } from "../lib/unity-asset-tree";

const rowHeight = 44, visibleCount = Math.ceil(540 / rowHeight) + 12;
export function UnityAssetTree({ assets, filteredIds, filterKey, activeId, selected, busy, onActivate, onSelect, children }: {
  assets: UnityAsset[];
  filteredIds: ReadonlySet<string>;
  filterKey: string;
  activeId: string;
  selected: ReadonlySet<string>;
  busy: boolean;
  onActivate: (guid: string) => void;
  onSelect: (guids: string[], checked: boolean) => void;
  children?: (parts: { tree: ReactNode; controls: ReactNode }) => ReactNode;
}) {
  const tree = useMemo(() => buildUnityAssetTree(assets), [assets]);
  const [expanded, setExpanded] = useState(() => unityTreeDefaultExpanded(tree, activeId));
  const [searchState, setSearchState] = useState<{ key: string; collapsed: Set<string> }>({ key: filterKey, collapsed: new Set() });
  const [focusId, setFocusId] = useState(""), [scrollTop, setScrollTop] = useState(0);
  const viewport = useRef<HTMLDivElement>(null), elements = useRef(new Map<string, HTMLDivElement>());
  const counts = useMemo(() => unityTreeCounts(tree, filteredIds, selected), [tree, filteredIds, selected]);
  const searchCollapsed = useMemo(() => searchState.key === filterKey ? searchState.collapsed : new Set<string>(), [searchState, filterKey]);
  const rows = useMemo(() => unityTreeRows(tree, counts, expanded, !!filterKey, searchCollapsed), [tree, counts, expanded, filterKey, searchCollapsed]);
  const indexes = useMemo(() => new Map(rows.map((row, i) => [row.node.id, i])), [rows]);
  const start = Math.min(Math.max(0, Math.floor(scrollTop / rowHeight) - 6), Math.max(0, rows.length - visibleCount));
  const end = Math.min(rows.length, start + visibleCount), focused = indexes.has(focusId) ? focusId : rows[0]?.node.id;
  function toggle(node: UnityTreeNode) {
    if (filterKey) setSearchState(() => { const next = new Set(searchCollapsed); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return { key: filterKey, collapsed: next }; });
    else setExpanded((old) => { const next = new Set(old); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next; });
  }
  function choose(node: UnityTreeNode) {
    if (busy) return;
    const count = counts.get(node.id)!;
    onSelect(unityTreeAssetIds(node, filteredIds), count.selected !== count.total);
  }
  function focusRow(index: number) {
    const row = rows[index], container = viewport.current;
    if (!row || !container) return;
    const top = index * rowHeight;
    if (top < container.scrollTop) container.scrollTop = top;
    else if (top + rowHeight > container.scrollTop + container.clientHeight) container.scrollTop = top + rowHeight - container.clientHeight;
    setScrollTop(container.scrollTop); setFocusId(row.node.id);
    requestAnimationFrame(() => elements.current.get(row.node.id)?.focus({ preventScroll: true }));
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>, index: number) {
    if (event.target !== event.currentTarget) return;
    const { node, expanded: open } = rows[index], folder = isUnityFolder(node);
    switch (event.key) {
      case "ArrowDown": focusRow(Math.min(rows.length - 1, index + 1)); break;
      case "ArrowUp": focusRow(Math.max(0, index - 1)); break;
      case "Home": focusRow(0); break;
      case "End": focusRow(rows.length - 1); break;
      case "ArrowRight": if (folder && !open) toggle(node); else if (open && rows[index + 1]?.node.parent === node.id) focusRow(index + 1); break;
      case "ArrowLeft": if (folder && open) toggle(node); else if (node.parent) focusRow(indexes.get(node.parent) ?? index); break;
      case " ": choose(node); break;
      case "Enter": if (folder) toggle(node); if (node.asset) onActivate(node.asset.guid); break;
      default: return;
    }
    event.preventDefault();
  }
  const expandable = [...tree.nodes.values()].filter((node) => isUnityFolder(node) && counts.get(node.id)?.total);
  const controls = <div className="unity-tree-toolbar"><div className="utility-actions">
      <button type="button" disabled={!expandable.length} onClick={() => { if (filterKey) setSearchState({ key: filterKey, collapsed: new Set() }); else setExpanded(new Set(expandable.map((node) => node.id))); }}>全部展开</button>
      <button type="button" disabled={!expandable.length} onClick={() => { if (filterKey) setSearchState({ key: filterKey, collapsed: new Set(expandable.map((node) => node.id)) }); else setExpanded(new Set()); }}>全部收起</button>
    </div><p className="utility-muted">勾选文件夹可选择其下资源{filterKey ? "（当前筛选范围）" : ""}。</p></div>;
  const treeView = <div className="unity-tree-workbench">
    <div className="unity-tree-scroll" ref={viewport} role="tree" aria-label="Unity 资源目录树" aria-multiselectable="true" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
      {start > 0 && <div aria-hidden="true" style={{ height: start * rowHeight }} />}
      {rows.slice(start, end).map(({ node, depth, position, siblings, expanded: open }, offset) => {
        const count = counts.get(node.id)!, folder = isUnityFolder(node), checked = count.total > 0 && count.selected === count.total, mixed = count.selected > 0 && !checked;
        const Icon = folder ? open ? TbFolderOpen : TbFolder : node.asset?.kind === "图片" ? TbPhoto : node.asset?.kind === "音频" ? TbMusic : node.asset?.kind === "模型" ? TbCube : node.asset?.kind === "文本" ? TbFileCode : TbFile;
        const active = !!node.asset && node.asset.guid === activeId;
        return <div key={node.id} role="treeitem" aria-level={depth + 1} aria-posinset={position} aria-setsize={siblings} aria-expanded={folder ? open : undefined} aria-selected={active} aria-checked={mixed ? "mixed" : checked} aria-label={`${node.path}，${folder ? "文件夹" : node.asset?.kind ?? "资源"}`} tabIndex={node.id === focused ? 0 : -1}
          className={`unity-tree-row${active ? " is-active" : ""}${folder ? " is-folder" : ""}`} style={{ "--tree-depth": depth } as CSSProperties}
          ref={(element) => { if (element) elements.current.set(node.id, element); else elements.current.delete(node.id); }}
          onFocus={() => setFocusId(node.id)} onKeyDown={(event) => keyboard(event, start + offset)}
          onClick={(event) => { event.currentTarget.focus(); if (node.asset) onActivate(node.asset.guid); else if (folder) toggle(node); }}>
          {folder ? <button type="button" className="unity-tree-toggle" tabIndex={-1} aria-label={`${open ? "收起" : "展开"} ${node.path}`} aria-expanded={open} onClick={(event) => { event.stopPropagation(); elements.current.get(node.id)?.focus(); toggle(node); }}><svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M4 2 9 6 4 10Z" fill="currentColor" /></svg></button> : <span className="unity-tree-toggle-placeholder" aria-hidden="true" />}
          <input type="checkbox" tabIndex={-1} checked={checked} disabled={busy || !count.total} aria-label={`选择 ${node.path}${folder ? "及其子项" : ""}`} ref={(element) => { if (element) element.indeterminate = mixed; }} onClick={(event) => { event.stopPropagation(); elements.current.get(node.id)?.focus(); }} onChange={() => choose(node)} />
          <Icon className="unity-tree-icon" aria-hidden="true" />
          <span className="unity-tree-name" title={node.path}>{node.name}</span>
          <span className="unity-tree-detail">{folder ? `${count.total} 项` : fileSize(node.asset?.size ?? 0)}</span>
        </div>;
      })}
      {end < rows.length && <div aria-hidden="true" style={{ height: (rows.length - end) * rowHeight }} />}
    </div>
    {!rows.length && <div className="utility-empty compact">{assets.length ? "没有匹配的资源。" : "导入后按 Unity 目录层级显示资源。"}</div>}
  </div>;
  return children ? children({ tree: treeView, controls }) : <>{controls}{treeView}</>;
}
