import DOMPurify from "dompurify";
import hljs from "highlight.js";
import { marked } from "marked";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeMermaidSource(text: string): string {
  return escapeHtml(text).replace(/<\/pre/gi, "&lt;/pre");
}

let mermaidReady = false;

/** Render ```mermaid fences after markdown HTML is in the DOM (same flow as imprint desk). */
export async function runMermaidInElement(root: HTMLElement | null): Promise<void> {
  if (!root) return;
  const nodes = root.querySelectorAll<HTMLElement>(".mermaid");
  if (!nodes.length) return;
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
  const { default: mermaid } = await import("mermaid");
  if (!mermaidReady) {
    mermaid.initialize({
      startOnLoad: false,
      theme: "dark",
      flowchart: { useMaxWidth: false },
      sequence: { useMaxWidth: false },
      gantt: { useMaxWidth: false },
    });
    mermaidReady = true;
  }
  for (const node of nodes) {
    const wrap = node.closest(".mermaid-wrap");
    if (wrap instanceof HTMLElement) {
      wrap.dataset.mermaidSource = node.textContent ?? "";
    }
  }
  try {
    await mermaid.run({ nodes: [...nodes], suppressErrors: true });
    for (const wrap of root.querySelectorAll<HTMLElement>(".mermaid-wrap")) {
      if (wrap.querySelector(".error-icon")) {
        const source = wrap.dataset.mermaidSource ?? "";
        wrap.classList.add("mermaid-failed");
        wrap.innerHTML = `<pre class="mermaid-source-fallback">${escapeHtml(source)}</pre>`;
        continue;
      }
      for (const svg of wrap.querySelectorAll<SVGElement>("svg")) {
        svg.removeAttribute("width");
        svg.style.removeProperty("max-width");
      }
    }
  } catch {
    // Keep diagram source visible when syntax fails.
  }
}

marked.use({
  gfm: true,
  breaks: false,
  async: false,
  renderer: {
    code({ text, lang }) {
      if ((lang || "").trim().toLowerCase() === "mermaid") {
        return `<div class="mermaid-wrap"><pre class="mermaid">${escapeMermaidSource(text)}</pre></div>`;
      }
      try {
        const language = lang && hljs.getLanguage(lang) ? lang : null;
        const html = language
          ? hljs.highlight(text, { language }).value
          : hljs.highlightAuto(text).value;
        return `<pre><code class="hljs${language ? ` language-${language}` : ""}">${html}</code></pre>`;
      } catch {
        return `<pre><code class="hljs">${escapeHtml(text)}</code></pre>`;
      }
    },
  },
});

export function injectMatchAnchor(markdown: string, lineStart = 1): string {
  const lines = markdown.split("\n");
  const index = Math.max(0, lineStart - 1);
  if (index >= lines.length) return markdown;
  lines.splice(index, 0, '<span id="doc-anchor" class="doc-match-anchor"></span>');
  return lines.join("\n");
}

export function renderSafeMarkdown(markdown: string, lineStart?: number): string {
  const source = lineStart ? injectMatchAnchor(markdown, lineStart) : markdown;
  const html = String(marked.parse(source));
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["class", "id"],
    FORBID_TAGS: ["script", "iframe", "object", "embed", "style"],
    FORBID_ATTR: ["style", "onerror", "onload", "onclick"],
  });
}

export function searchTerms(query: string): string[] {
  const terms = new Set<string>();
  for (const part of query.trim().toLowerCase().split(/\s+/)) {
    if (part.length >= 2) terms.add(part);
    for (const char of part) {
      if (/[\u4e00-\u9fff]/.test(char)) terms.add(char);
    }
  }
  return [...terms].sort((a, b) => b.length - a.length);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function splitHighlight(text: string, query: string): Array<{ text: string; hit: boolean }> {
  const terms = searchTerms(query);
  if (!terms.length || !text) return [{ text, hit: false }];
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  return text.split(pattern).filter((part) => part !== "").map((part) => ({
    text: part,
    hit: terms.some((term) => part.toLowerCase() === term.toLowerCase()),
  }));
}

function isFenceLine(line: string): boolean {
  return /^(```+|~~~+)\s*[\w-]*\s*$/.test(line.trim());
}

/** Extend a line range so fenced code blocks (e.g. mermaid) are never cut in half. */
export function expandLineRangeForFences(content: string, lineStart: number, lineEnd: number): { lineStart: number; lineEnd: number } {
  const lines = content.split("\n");
  let start0 = Math.max(0, lineStart - 1);
  let end0 = Math.min(lines.length - 1, (lineEnd || lineStart) - 1);
  if (start0 > end0) return { lineStart, lineEnd: lineEnd || lineStart };

  let inFence = false;
  for (let i = 0; i < start0; i += 1) {
    if (isFenceLine(lines[i] ?? "")) inFence = !inFence;
  }
  if (inFence) {
    for (let i = start0 - 1; i >= 0; i -= 1) {
      if (isFenceLine(lines[i] ?? "")) {
        start0 = i;
        break;
      }
    }
  }

  inFence = false;
  for (let i = 0; i <= end0; i += 1) {
    if (isFenceLine(lines[i] ?? "")) inFence = !inFence;
  }
  if (inFence) {
    for (let i = end0 + 1; i < lines.length; i += 1) {
      if (isFenceLine(lines[i] ?? "")) {
        end0 = i;
        break;
      }
    }
  }

  return { lineStart: start0 + 1, lineEnd: end0 + 1 };
}

export function renderDocBody(content: string, lineStart?: number, lineEnd?: number): string {
  if (!lineStart) return renderSafeMarkdown(content);
  const expanded = expandLineRangeForFences(content, lineStart, lineEnd || lineStart);
  lineStart = expanded.lineStart;
  lineEnd = expanded.lineEnd;
  const lines = content.split("\n");
  const start = Math.max(0, lineStart - 1);
  const end = Math.min(lines.length - 1, (lineEnd || lineStart) - 1);
  if (start > end || start >= lines.length) return renderSafeMarkdown(injectMatchAnchor(content, lineStart));
  const before = lines.slice(0, start).join("\n");
  const range = lines.slice(start, end + 1).join("\n");
  const after = lines.slice(end + 1).join("\n");
  return [
    before.trim() ? renderSafeMarkdown(before) : "",
    `<div class="doc-rule-range" id="doc-anchor">${renderSafeMarkdown(range)}</div>`,
    after.trim() ? renderSafeMarkdown(after) : "",
  ].join("");
}

export function headingSection(content: string, heading: string): { start: number; end: number } | null {
  const wanted = heading.trim().toLowerCase();
  if (!wanted) return null;
  const lines = content.split("\n");
  let start = -1;
  let level = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(lines[index]);
    if (!match) continue;
    const title = match[2].replace(/[*_`[\]]/g, "").trim().toLowerCase();
    if (start < 0) {
      if (title === wanted) {
        start = index + 1;
        level = match[1].length;
      }
      continue;
    }
    if (match[1].length <= level) return { start, end: index };
  }
  return start < 0 ? null : { start, end: lines.length };
}

export function highlightTerms(root: HTMLElement, terms: string[]) {
  const unique = [...new Set(terms.map((term) => term.trim()).filter((term) => term.length >= 2))]
    .sort((a, b) => b.length - a.length);
  if (!unique.length) return;
  const pattern = new RegExp(`(${unique.map(escapeRegExp).join("|")})`, "gi");
  const skip = new Set(["SCRIPT", "STYLE", "MARK", "CODE", "PRE"]);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const parent = node.parentElement;
    if (!parent || skip.has(parent.tagName) || !node.nodeValue?.trim()) continue;
    textNodes.push(node);
  }
  for (const node of textNodes) {
    const text = node.nodeValue ?? "";
    pattern.lastIndex = 0;
    if (!pattern.test(text)) continue;
    pattern.lastIndex = 0;
    const span = document.createElement("span");
    const escaped = escapeHtml(text);
    pattern.lastIndex = 0;
    span.innerHTML = escaped.replace(pattern, '<mark class="search-hl">$1</mark>');
    node.replaceWith(...span.childNodes);
  }
}

export function highlightInElement(root: HTMLElement, query: string) {
  highlightTerms(root, searchTerms(query));
}

/** Scroll the doc highlight (.doc-rule-range / #doc-anchor) into view inside a scroll container. */
export function scrollDocAnchorIntoView(root: HTMLElement, scrollContainer?: HTMLElement | null) {
  const anchor = root.querySelector("#doc-anchor");
  if (!anchor) return;
  if (!root.querySelector(".doc-rule-range")) {
    const block =
      anchor.closest("p, li, h1, h2, h3, h4, h5, h6, td, blockquote, pre") || anchor.parentElement;
    block?.classList.add("doc-match-block");
  }
  const target =
    (root.querySelector(".doc-rule-range") as HTMLElement | null) ?? (anchor as HTMLElement);
  const scroller =
    scrollContainer ??
    (root.closest("[data-scrollarea-viewport]") as HTMLElement | null) ??
    (root.closest(".docs-reader") as HTMLElement | null);
  if (!scroller) {
    target.scrollIntoView({ block: "center" });
    return;
  }
  const scrollerRect = scroller.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  scroller.scrollTop += targetRect.top - scrollerRect.top - scroller.clientHeight / 3;
}
