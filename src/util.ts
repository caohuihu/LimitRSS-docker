/**
 * 工具函数
 */

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function genId(prefix = ""): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const H = String(d.getHours()).padStart(2, "0");
    const M = String(d.getMinutes()).padStart(2, "0");
    const S = String(d.getSeconds()).padStart(2, "0");
    let r = "";
    for (let i = 0; i < 7; i++) r += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    return `${prefix}${y}${m}${dd}${H}${M}${S}-${r}`;
}

/** 本地日期键（YYYY-MM-DD），日报与统计共用，保证两侧口径一致 */
export function dateKey(ts: number): string {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

/**
 * 浏览器/Docker 模式（https 应用）下，把 http:// 资源 URL 升级为 https://，
 * 避免 <img> 等直接加载被浏览器的混合内容策略拦截；fetch 类请求走代理不受影响。
 * 非 https 环境（如 Electron）原样返回。
 */
export function secureResourceUrl(url: string): string {
    if (typeof location !== "undefined" && location.protocol === "https:" && /^http:\/\//i.test(url)) {
        return url.replace(/^http:\/\//i, "https://");
    }
    return url;
}
