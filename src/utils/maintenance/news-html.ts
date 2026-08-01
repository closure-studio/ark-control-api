import { parse, parseFragment } from "parse5";
import type { DefaultTreeAdapterTypes } from "parse5";
import * as v from "valibot";

import { NewsDetailSchema, type NewsDetail } from "../../schemas/maintenance/announcements";

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;

const IGNORED_TEXT_TAGS = new Set(["script", "style", "noscript"]);

export function parseNewsDetail(id: string, url: string, html: string): NewsDetail {
  const document = parse(html);
  const titleElement =
    findFirstElement(document, (element) => element.tagName === "h1") ??
    findFirstElement(document, (element) => hasClassFragment(element, "title")) ??
    findFirstElement(document, (element) => element.tagName === "title");
  const contentElement =
    findFirstElement(document, (element) => element.tagName === "article") ??
    findFirstElement(document, (element) => element.tagName === "main") ??
    findFirstElement(document, (element) => hasClassFragment(element, "content")) ??
    findFirstElement(document, (element) => element.tagName === "body");

  const rawTitle = titleElement ? textContent(titleElement) : "";
  const embeddedContent = extractEmbeddedParagraphText(html);
  const rawContent = contentElement ? textContent(contentElement) : "";
  const title = normalizeText(rawTitle.replace(/\s*-\s*明日方舟\s*$/, ""));
  const content = normalizeText(rawContent || embeddedContent || textContent(document));

  return v.parse(NewsDetailSchema, { id, url, title, content });
}

function extractEmbeddedParagraphText(html: string): string {
  let best = "";
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const script = match[1];
    if (!script) continue;

    const fragment = parseFragment(decodeEmbeddedMarkup(script));
    const paragraphText = collectElements(fragment)
      .filter((element) => element.tagName === "p")
      .map((element) => textContent(element))
      .join(" ");
    if (paragraphText.length > best.length) best = paragraphText;
  }
  return best;
}

function decodeEmbeddedMarkup(value: string): string {
  return value
    .replaceAll("\\u003c", "<")
    .replaceAll("\\u003e", ">")
    .replaceAll("\\u0026", "&")
    .replaceAll('\\"', '"');
}

function collectElements(root: Node): Element[] {
  const elements: Element[] = [];
  visit(root, (node) => {
    if (isElement(node)) elements.push(node);
  });
  return elements;
}

function findFirstElement(root: Node, predicate: (element: Element) => boolean): Element | null {
  let match: Element | null = null;
  visit(root, (node) => {
    if (match === null && isElement(node) && predicate(node)) match = node;
  });
  return match;
}

function visit(node: Node, callback: (node: Node) => void): void {
  callback(node);
  if (!hasChildren(node)) return;
  for (const child of node.childNodes) visit(child, callback);
}

function textContent(node: Node): string {
  if (isTextNode(node)) return node.value;
  if (isElement(node) && IGNORED_TEXT_TAGS.has(node.tagName)) return "";
  if (!hasChildren(node)) return "";
  return node.childNodes.map(textContent).join(" ");
}

function isElement(node: Node): node is Element {
  return "tagName" in node;
}

function isTextNode(node: Node): node is DefaultTreeAdapterTypes.TextNode {
  return node.nodeName === "#text" && "value" in node;
}

function hasChildren(node: Node): node is DefaultTreeAdapterTypes.ParentNode {
  return "childNodes" in node;
}

function getAttribute(element: Element, name: string): string | null {
  return element.attrs.find((attribute) => attribute.name === name)?.value ?? null;
}

function hasClassFragment(element: Element, fragment: string): boolean {
  return getAttribute(element, "class")?.toLowerCase().includes(fragment) ?? false;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
