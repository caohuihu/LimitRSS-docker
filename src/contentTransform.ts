/**
 * 共享内容转换管线：sanitize / postProcess / 翻译分段（buildTranslatableHtml）。
 * 阅读器（tab.ts）与保存（save.ts）共用同一套分段逻辑，保证翻译段号一致。
 */
import DOMPurify from "dompurify";
import { secureResourceUrl } from "./util";
import { escapeHtml } from "./ui";

export const SANITIZE_CONFIG = {
    ALLOWED_TAGS: ["a", "b", "blockquote", "br", "code", "div", "em", "figure", "figcaption", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "li", "ol", "p", "pre", "span", "strong", "sub", "sup", "table", "tbody", "td", "th", "thead", "tr", "u", "ul"],
    ALLOWED_ATTR: ["href", "title", "alt", "src", "class", "target", "rel"],
};

export function sanitize(html: string): string {
    if (!html) return "";
    return DOMPurify.sanitize(html, SANITIZE_CONFIG) as string;
}

/** 显示端去重：完全相同的文本段落只保留第一处（处理部分源图文重复） */
export function dedupeBodyBlocks(root: HTMLElement) {
    const seen = new Set<string>();
    root.querySelectorAll("p, h1, h2, h3, h4, h5, h6, blockquote, li").forEach((n) => {
        const t = (n.textContent || "").trim().replace(/\s+/g, " ");
        if (t.length < 12) return;
        if (seen.has(t)) {
            n.remove();
            return;
        }
        seen.add(t);
    });
}

export function postProcess(html: string): string {
    const div = document.createElement("div");
    div.innerHTML = html;
    dedupeBodyBlocks(div);
    div.querySelectorAll("a").forEach((a) => { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener noreferrer"); });
    const seenImg = new Set<string>();
    div.querySelectorAll("img").forEach((i) => {
        const rawSrc = i.getAttribute("src") || "";
        // https 应用（浏览器/Docker 模式）下升级 http:// 图片，避免混合内容被拦截
        const src = secureResourceUrl(rawSrc);
        if (rawSrc !== src) i.setAttribute("src", src);
        if (src && seenImg.has(src)) {
            i.remove(); // 相同图片只保留第一张，避免图文重复
            return;
        }
        if (src) seenImg.add(src);
        i.setAttribute("loading", "lazy");
    });
    Array.from(div.querySelectorAll("table")).forEach((table) => {
        if (table.parentElement?.classList.contains("ar-rd__table-scroll")) return;
        const wrapper = document.createElement("div");
        wrapper.className = "ar-rd__table-scroll";
        table.parentNode?.insertBefore(wrapper, table);
        wrapper.appendChild(table);
    });
    return div.innerHTML;
}

export function escapeAttr(s: string): string {
    return escapeHtml(s).replace(/"/g, "&quot;");
}

export function buildTranslatableHtml(sourceHtml: string, startId = 1): { html: string; segments: { id: number; text: string }[] } {
    const root = document.createElement("div");
    root.innerHTML = postProcess(sanitize(sourceHtml));
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const text = node.nodeValue || "";
            const parent = node.parentElement;
            if (!text.trim()) return NodeFilter.FILTER_REJECT;
            if (parent?.closest("code, pre")) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        },
    });
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);

    const segments: { id: number; text: string }[] = [];
    let total = 0;
    nodes.forEach((node) => {
        const text = node.nodeValue || "";
        if (total > 14000) return;
        total += text.length;
        const id = startId + segments.length;
        segments.push({ id, text });
        const wrap = document.createElement("span");
        wrap.className = "ar-rd__translate-segment";
        wrap.dataset.segId = String(id);
        wrap.dataset.original = text;
        // 整段一个文本节点：原文淡出用 CSS 过渡整段完成，避免逐字符建 DOM
        const original = document.createElement("span");
        original.className = "ar-rd__translate-original";
        original.textContent = text;
        wrap.appendChild(original);
        node.parentNode?.replaceChild(wrap, node);
    });

    return { html: root.innerHTML, segments };
}

export function buildTranslatableTitleHtml(title: string): string {
    const text = title || "(无标题)";
    return `<span class="ar-rd__translate-segment" data-seg-id="1" data-original="${escapeAttr(text)}"><span class="ar-rd__translate-original">${escapeHtml(text)}</span></span>`;
}

/**
 * 保存路径：重建"原文 + 斜体译文（同段）"HTML。
 * 段号必须与阅读器翻译流程一致（正文 startId=2，标题为 1）。
 * 每段译文以 <em> 追加在所属块级段落末尾；无译文的段落保留原文。
 */
export function buildInlineTranslatedHtml(sourceHtml: string, translated: Record<string, string>, startId = 2): { html: string; total: number; covered: number } {
    const built = buildTranslatableHtml(sourceHtml, startId);
    const root = document.createElement("div");
    root.innerHTML = built.html;
    const groups = new Map<Element, string[]>();
    let covered = 0;
    built.segments.forEach((s) => {
        const t = translated[String(s.id)];
        if (!t) return;
        const segEl = root.querySelector<HTMLElement>(`.ar-rd__translate-segment[data-seg-id="${s.id}"]`);
        if (!segEl) return;
        covered++;
        const block = segEl.closest("p, li, h1, h2, h3, h4, h5, h6, blockquote, dd, dt, figcaption, td, th") || segEl.parentElement || root;
        const list = groups.get(block);
        if (list) list.push(t);
        else groups.set(block, [t]);
    });
    groups.forEach((texts, block) => {
        const em = document.createElement("em");
        em.textContent = texts.join(" ");
        block.appendChild(document.createTextNode(" "));
        block.appendChild(em);
    });
    // 拆掉分段包装，只保留原文文本
    root.querySelectorAll<HTMLElement>(".ar-rd__translate-segment").forEach((seg) => {
        const orig = seg.querySelector<HTMLElement>(".ar-rd__translate-original");
        const text = orig?.textContent || seg.textContent || "";
        seg.replaceWith(document.createTextNode(text));
    });
    return { html: root.innerHTML, total: built.segments.length, covered };
}
