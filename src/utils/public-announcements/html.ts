import { parse, parseFragment, type DefaultTreeAdapterTypes } from "parse5";

type Node = DefaultTreeAdapterTypes.Node;
function text(node: Node): string {
  if ("value" in node) return node.value;
  if ("tagName" in node && ["script", "style", "nav", "noscript"].includes(node.tagName)) return "";
  if (!("childNodes" in node)) return "";
  const content = node.childNodes.map(text).join("");
  return "tagName" in node && /^(p|div|h[1-6]|li|br|section)$/.test(node.tagName)
    ? `\n${content}\n`
    : content;
}
function elements(node: Node): DefaultTreeAdapterTypes.Element[] {
  return [
    ...("tagName" in node ? [node] : []),
    ...("childNodes" in node ? node.childNodes.flatMap(elements) : [])
  ];
}
export function announcementHtml(html: string) {
  const all = elements(parse(html));
  const title = text(
    all.find((e) => e.tagName === "h1") ??
      all.find((e) => e.tagName === "title") ??
      parseFragment("")
  )
    .trim()
    .slice(0, 300);
  const body =
    all.find((e) => e.tagName === "article") ??
    all.find((e) =>
      e.attrs.some((a) => a.name === "class" && /news.*content|article.*content/.test(a.value))
    ) ??
    all.find((e) => e.tagName === "main");
  let content = body ? text(body) : "";
  if (!content.trim()) {
    for (const script of all.filter((e) => e.tagName === "script")) {
      const raw = script.childNodes
        .map((n) => ("value" in n ? n.value : ""))
        .join("")
        .replaceAll("\\u003c", "<")
        .replaceAll("\\u003e", ">")
        .replaceAll("\\u0026", "&")
        .replaceAll('\\"', '"');
      const candidate = elements(parseFragment(raw))
        .filter((e) => e.tagName === "p")
        .map(text)
        .join("\n");
      if (candidate.length > content.length) content = candidate;
    }
  }
  if (!title || !content.trim()) throw new Error("unsupported article layout");
  const time = all.find((e) => e.tagName === "time");
  const published =
    time?.attrs.find((a) => a.name === "datetime")?.value ?? (time ? text(time) : "");
  const publishedAt = /^\d{4}-\d{2}-\d{2}/.exec(published)?.[0] ?? null;
  return {
    title,
    lines: content
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean),
    publishedAt
  };
}
