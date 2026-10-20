/**
 * 全局 fetch 拦截：在浏览器/Docker 环境中，所有跨域请求自动走思源内核
 * /api/network/forwardProxy，绕过 CORS。
 *
 * 与参考插件（limitRssForwardProxyPatched）思路一致，但使用思源 SDK 调用。
 * 仅在非 Electron 环境下注入，Electron 原生 fetch 不受 CORS 限制，无需 patch。
 */

const __PATCHED_KEY = "__aiRssCorsPatched";

export function patchFetchIf_needed(): void {
    if (window[__PATCHED_KEY as any]) return;
    // Electron 本身无 CORS 限制，保留原生 fetch 以支持真正的流式输出
    if (/Electron/i.test(navigator.userAgent)) return;
    (window as any)[__PATCHED_KEY] = true;

    const nativeFetch = window.fetch.bind(window);

    function sameOrigin(url: string): boolean {
        try {
            const u = new URL(url, location.href);
            return u.origin === location.origin;
        } catch {
            return true;
        }
    }

    /** 调用思源内核 forwardProxy，返回标准 Response */
    async function proxyFetch(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
        const isRequest = typeof Request !== "undefined" && input instanceof Request;
        const url = typeof input === "string" ? input : (input as any).url;
        if (!url || !/^https?:/i.test(url)) {
            return nativeFetch(input, init);
        }

        const method = ((init.method || (isRequest && (input as Request).method) || "GET") as string)
            .toUpperCase();
        const headers: Record<string, string> = {};
        // 合并 Request 对象 headers 和 init.headers
        const mergeHeaders = (h: HeadersInit | undefined) => {
            if (!h) return;
            if (typeof Headers !== "undefined" && h instanceof Headers) {
                h.forEach((v, k) => { headers[k] = v; });
            } else if (Array.isArray(h)) {
                h.forEach((p) => { if (p && p.length === 2) headers[p[0]] = p[1]; });
            } else if (typeof h === "object") {
                Object.keys(h as Record<string, unknown>).forEach((k) => {
                    const val = (h as Record<string, unknown>)[k];
                    if (val != null) headers[k] = String(val);
                });
            }
        };
        mergeHeaders(isRequest ? (input as Request).headers : init.headers);

        let body: string | null = null;
        if (init.body != null) {
            body = typeof init.body === "string" ? init.body : String(init.body);
        } else if (isRequest) {
            try { body = await (input as Request).clone().text(); } catch { body = null; }
        }

        // 检测是否需要流式响应（SSE / streaming）
        const contentType = headers["content-type"] || headers["Content-Type"] || "";
        const wantsStream = /text\/event-stream/i.test(contentType) ||
            (/application\/json/i.test(contentType) && body && /"stream"\s*:\s*true/.test(body));

        const timeout = 60_000; // 60s timeout for AI calls

        // 方案 A：直接调用 siyuan.api.forwardProxy（同步 API，最快）
        const siyuan = (window as any).siyuan;
        let proxyResult: any;
        try {
            if (siyuan?.api?.forwardProxy) {
                proxyResult = await siyuan.api.forwardProxy(url, {
                    method,
                    timeout,
                    contentType: contentType || "application/json",
                    headers: Object.keys(headers).map((k) => ({ [k]: headers[k] })),
                    payload: body ?? undefined,
                });
            }
        } catch { /* fall through to fallback */ }

        // 方案 B：通过 fetchSyncPost SDK 调用
        if (!proxyResult || !proxyResult.code) {
            const { fetchSyncPost } = await import("siyuan");
            try {
                proxyResult = await fetchSyncPost("/api/network/forwardProxy", {
                    url,
                    method,
                    timeout,
                    contentType: contentType || "application/json",
                    headers: Object.keys(headers).map((k) => ({ [k]: headers[k] })),
                    payload: body ?? undefined,
                });
            } catch {
                return nativeFetch(input, init);
            }
        }

        if (!proxyResult || proxyResult.code !== 0) {
            throw new Error((proxyResult && proxyResult.msg) || "forwardProxy failed");
        }

        const data = proxyResult.data || {};
        const status = Number(data.status) || 200;
        const respHeaders = new Headers();
        const rawHeaders: Record<string, unknown> = data.headers || {};
        Object.keys(rawHeaders).forEach((k) => {
            const v = rawHeaders[k];
            if (Array.isArray(v)) {
                v.forEach((x) => { try { respHeaders.append(k, String(x)); } catch { /* ignore */ } });
            } else if (v != null) {
                try { respHeaders.set(k, String(v)); } catch { /* ignore */ }
            }
        });

        // 删除 hop-by-hop headers
        ["content-length", "content-encoding", "transfer-encoding", "connection"].forEach((k) => {
            try { respHeaders.delete(k); } catch { /* ignore */ }
        });

        const respContentType = String(data.contentType || respHeaders.get("Content-Type") || "");

        if (status === 204 || status === 304) {
            return new Response(null, { status, headers: respHeaders });
        }

        const text = data.body == null ? "" : String(data.body);

        if (!wantsStream) {
            return new Response(text, { status, headers: respHeaders });
        }

        // 流式响应：分块返回，模拟 SSE 流
        const encoder = new TextEncoder();
        const parts: Uint8Array[] = [];
        const CHUNK = 512;
        for (let i = 0; i < text.length; i += CHUNK) {
            parts.push(encoder.encode(text.slice(i, i + CHUNK)));
        }
        let idx = 0;
        const stream = new ReadableStream({
            async pull(controller) {
                if (idx >= parts.length) {
                    controller.close();
                    return;
                }
                controller.enqueue(parts[idx++]);
                // 小延迟模拟流式效果（每 8ms 释放一块）
                if (idx < parts.length) {
                    await new Promise((r) => setTimeout(r, 8));
                }
            },
        });
        return new Response(stream, { status, headers: respHeaders });
    }

    window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const url = typeof input === "string" ? input : ((input as any).url as string | undefined);
        if (!url || sameOrigin(url)) {
            return nativeFetch(input, init);
        }
        return proxyFetch(input, init || {});
    } as typeof fetch;
}
