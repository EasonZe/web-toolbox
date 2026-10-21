import type { UnityAsset } from "./game-asset-types";

export type UnityTreeNode = {
  id: string;
  path: string;
  name: string;
  parent: string | null;
  asset?: UnityAsset;
  children: UnityTreeNode[];
};
export type UnityAssetTree = {
  roots: UnityTreeNode[];
  nodes: Map<string, UnityTreeNode>;
  assetNodes: Map<string, UnityTreeNode>;
};
export type UnityTreeCount = { total: number; selected: number };
export type UnityTreeRow = { node: UnityTreeNode; depth: number; position: number; siblings: number; expanded: boolean };

export function isUnityFolder(node: UnityTreeNode) {
  return node.children.length > 0 || node.asset?.kind === "文件夹";
}
export function buildUnityAssetTree(assets: readonly UnityAsset[]): UnityAssetTree {
  const roots: UnityTreeNode[] = [], nodes = new Map<string, UnityTreeNode>(), assetNodes = new Map<string, UnityTreeNode>();
  for (const asset of assets) {
    const segments = asset.path.split("/");
    let parent: UnityTreeNode | undefined;
    for (let i = 0; i < segments.length; i++) {
      const path = segments.slice(0, i + 1).join("/"), id = path.toLocaleLowerCase();
      let node = nodes.get(id);
      if (!node) {
        node = { id, path, name: segments[i], parent: parent?.id ?? null, children: [] };
        nodes.set(id, node);
        if (parent) parent.children.push(node);
        else roots.push(node);
      }
      if (i === segments.length - 1) { node.asset = asset; assetNodes.set(asset.guid, node); }
      parent = node;
    }
  }
  const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
  const compare = (a: UnityTreeNode, b: UnityTreeNode) => Number(isUnityFolder(b)) - Number(isUnityFolder(a)) || collator.compare(a.name, b.name);
  roots.sort(compare);
  for (const node of nodes.values()) node.children.sort(compare);
  return { roots, nodes, assetNodes };
}
export function unityTreeCounts(tree: UnityAssetTree, eligible: ReadonlySet<string>, selected: ReadonlySet<string>) {
  const counts = new Map<string, UnityTreeCount>();
  // Parents are inserted before children, so reverse insertion order is bottom-up.
  for (const node of [...tree.nodes.values()].reverse()) {
    const included = !!node.asset && eligible.has(node.asset.guid);
    let total = included ? 1 : 0, checked = included && selected.has(node.asset!.guid) ? 1 : 0;
    for (const child of node.children) { const count = counts.get(child.id)!; total += count.total; checked += count.selected; }
    counts.set(node.id, { total, selected: checked });
  }
  return counts;
}
export function unityTreeDefaultExpanded(tree: UnityAssetTree, activeId: string) {
  const expanded = new Set(tree.roots.filter(isUnityFolder).map((node) => node.id));
  let parent = tree.assetNodes.get(activeId)?.parent;
  while (parent) { expanded.add(parent); parent = tree.nodes.get(parent)?.parent; }
  return expanded;
}
export function unityTreeRows(tree: UnityAssetTree, counts: ReadonlyMap<string, UnityTreeCount>, expanded: ReadonlySet<string>, filtered = false, searchCollapsed: ReadonlySet<string> = new Set()): UnityTreeRow[] {
  const result: UnityTreeRow[] = [];
  const roots = tree.roots.filter((node) => counts.get(node.id)?.total);
  const pending = roots.map((node, i) => ({ node, depth: 0, position: i + 1, siblings: roots.length })).reverse();
  while (pending.length) {
    const current = pending.pop()!, node = current.node;
    const open = isUnityFolder(node) && (filtered ? !searchCollapsed.has(node.id) : expanded.has(node.id));
    result.push({ ...current, expanded: open });
    if (!open) continue;
    const children = node.children.filter((child) => counts.get(child.id)?.total);
    for (let i = children.length - 1; i >= 0; i--) pending.push({ node: children[i], depth: current.depth + 1, position: i + 1, siblings: children.length });
  }
  return result;
}
export function unityTreeAssetIds(node: UnityTreeNode, eligible: ReadonlySet<string>) {
  const result: string[] = [], pending = [node];
  while (pending.length) {
    const next = pending.pop()!;
    if (next.asset && eligible.has(next.asset.guid)) result.push(next.asset.guid);
    pending.push(...next.children);
  }
  return result;
}
