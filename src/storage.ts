/**
 * 存储层 - 封装 siyuan loadData/saveData
 * 用 Map/Set 做内存索引，提供 reactive 读
 */

import { Plugin } from "siyuan";
import { Article, Category, DailyReportCache, Subscription, Settings, AISettings, KEYS, DEFAULT_SETTINGS, DEFAULT_AI, ArticleExtras, FullTextRecord } from "./types";
import { dateKey } from "./util";

export type StorageEvent =
    | "read" | "star" | "articles" | "subs" | "cats"
    | "settings" | "ai" | "daily" | "extras" | "fulltext";

/** 大字段写盘合并窗口：同一 key 的多次变更只落一次盘 */
const SCHEDULED_SAVE_MS = 800;

export interface ArticleStats {
    total: number;
    totalUnread: number;
    todayUnread: number;
    starred: number;
    dateCount: number;
    /** 每个订阅源的未读文章数 */
    unreadBySub: Map<string, number>;
}

const LEGACY_PLUGIN_STORAGE_DIRS = ["ai-rss"];

type SubscriptionStore = {
    meta?: {
        revision?: number;
        updatedAt?: number;
        clientId?: string;
        clearedAt?: number;
        deletedUrls?: Record<string, number>;
    };
    items: Subscription[];
};

export class Storage {
    private plugin: Plugin;
    private ready: Promise<void>;
    private saveQueues: Map<string, Promise<void>> = new Map();
    private clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    private subStoreMeta: NonNullable<SubscriptionStore["meta"]> = { revision: 0, updatedAt: 0, clientId: this.clientId };

    subs: Subscription[] = [];
    cats: Category[] = [];
    articles: Map<string, Article> = new Map();
    read: Set<string> = new Set();
    star: Set<string> = new Set();
    settings: Settings = DEFAULT_SETTINGS;
    ai: AISettings = DEFAULT_AI;
    dailyReports: Record<string, DailyReportCache> = {};
    /** 按文章 id 拆出的大字段（aiResults/highlights/tags/savedDocId），与 articles 主表分离持久化 */
    extras: Record<string, ArticleExtras> = {};
    /** 按文章 id 拆出的全文记录，与 articles 主表分离持久化 */
    fulltexts: Record<string, FullTextRecord> = {};

    listeners: Set<() => void> = new Set();
    private typeListeners: Map<string, Set<() => void>> = new Map();

    constructor(plugin: Plugin) {
        this.plugin = plugin;
        this.ready = this.load();
    }
    whenReady() { return this.ready; }
    on(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    /** 订阅指定类型事件（旧版 on() 等价于订阅全部事件） */
    onTypes(types: StorageEvent[], fn: () => void) {
        for (const t of types) {
            let set = this.typeListeners.get(t);
            if (!set) { set = new Set(); this.typeListeners.set(t, set); }
            set.add(fn);
        }
        const unsub = () => {
            for (const t of types) this.typeListeners.get(t)?.delete(fn);
        };
        return unsub;
    }
    private emit(type: StorageEvent | "*" = "*") {
        this.listeners.forEach((l) => l());
        if (type !== "*") this.typeListeners.get(type)?.forEach((l) => l());
    }
    private defaultCat(): Category {
        return { id: "c_default", name: "未分类", color: "#94a3b8", sortOrder: 9999, collapsed: false, builtin: true };
    }
    private withDefaultCat(cats: Category[]) {
        const list = cats.some((c) => c.id === "c_default") ? cats.slice() : [...cats, this.defaultCat()];
        return list.sort((a, b) => a.sortOrder - b.sortOrder);
    }

    private async load() {
        const [s, c, a, r, st, sg, ai, dr, ex, ft] = await Promise.all([
            this.loadDataWithLegacyFallback(KEYS.subs),
            this.loadDataWithLegacyFallback(KEYS.cats),
            this.loadDataWithLegacyFallback(KEYS.articles),
            this.loadDataWithLegacyFallback(KEYS.read),
            this.loadDataWithLegacyFallback(KEYS.star),
            this.loadDataWithLegacyFallback(KEYS.settings),
            this.loadDataWithLegacyFallback(KEYS.ai),
            this.loadDataWithLegacyFallback(KEYS.dailyReports),
            this.plugin.loadData(KEYS.extras),
            this.plugin.loadData(KEYS.fulltexts),
        ]);
        const subStore = this.normalizeSubStore(s);
        this.subs = subStore.items;
        this.subStoreMeta = {
            revision: subStore.meta?.revision || 0,
            updatedAt: subStore.meta?.updatedAt || 0,
            clientId: subStore.meta?.clientId || this.clientId,
            clearedAt: subStore.meta?.clearedAt,
            deletedUrls: subStore.meta?.deletedUrls,
        };
        if (Array.isArray(c)) this.cats = this.withDefaultCat(c);
        else this.cats = [this.defaultCat()];
        if (Array.isArray(a)) this.articles = new Map(a.map((x: Article) => [x.id, x]));
        if (Array.isArray(r)) this.read = new Set(r);
        if (Array.isArray(st)) this.star = new Set(st);
        if (sg && typeof sg === "object") {
            this.settings = {
                ...DEFAULT_SETTINGS,
                ...sg,
                general: { ...DEFAULT_SETTINGS.general, ...(sg.general || {}) },
                display: { ...DEFAULT_SETTINGS.display, ...(sg.display || {}) },
                reading: { ...DEFAULT_SETTINGS.reading, ...(sg.reading || {}) },
                save: { ...DEFAULT_SETTINGS.save, ...(sg.save || {}) },
            };
        }
        if (ai && typeof ai === "object") this.ai = { ...DEFAULT_AI, ...ai };
        if (dr && typeof dr === "object" && !Array.isArray(dr)) {
            this.dailyReports = dr as Record<string, DailyReportCache>;
        }
        if (ex && typeof ex === "object" && !Array.isArray(ex)) this.extras = ex;
        if (ft && typeof ft === "object" && !Array.isArray(ft)) this.fulltexts = ft;
        let migratedLegacy = false;
        for (const a of this.articles.values()) {
            a.isRead = this.read.has(a.id);
            a.isStarred = this.star.has(a.id);
            // 旧数据特征：主表数组里直接带大字段（水合前判断，避免把新格式误判为旧格式）
            const hadLegacy = !!(a.fullText || a.aiResults || a.highlights || a.tags || a.savedDocId !== undefined || a.savedAt !== undefined);
            // 从拆分键水合大字段（内存对象形态不变，其他模块零改动）
            const ftRec = this.fulltexts[a.id];
            if (ftRec) { a.fullText = ftRec.text; a.fullTextState = ftRec.state; }
            const exRec = this.extras[a.id];
            if (exRec) {
                a.savedDocId = exRec.savedDocId;
                a.savedAt = exRec.savedAt;
                a.tags = exRec.tags;
                a.aiResults = exRec.aiResults;
                a.highlights = exRec.highlights;
            }
            // 旧数据：大字段仍在主表里 → 拆出来，稍后回写瘦身主表
            if (hadLegacy) {
                this.pullHeavyFields(a);
                migratedLegacy = true;
            }
        }
        if (migratedLegacy) {
            this.scheduleSave(KEYS.articles, this.serializeArticles());
            this.scheduleSave(KEYS.extras, this.extras);
            this.scheduleSave(KEYS.fulltexts, this.fulltexts);
        }
        // 数据加载完成后通知已挂载的 UI 刷新（首次进入时 Tab 可能先于数据就绪渲染）
        this.emit();
    }

    /** 把文章对象上的大字段抽到拆分键；有抽取时返回 true（不产生空记录） */
    private pullHeavyFields(a: Article): boolean {
        let touched = false;
        let ex: ArticleExtras | undefined;
        const getEx = () => ex || (ex = this.extras[a.id] || (this.extras[a.id] = {}));
        if (a.savedDocId !== undefined || a.savedAt !== undefined) {
            getEx().savedDocId = a.savedDocId;
            getEx().savedAt = a.savedAt;
            touched = true;
        }
        if (a.tags) { getEx().tags = a.tags; touched = true; }
        if (a.aiResults) { getEx().aiResults = a.aiResults; touched = true; }
        if (a.highlights) { getEx().highlights = a.highlights; touched = true; }
        if (a.fullText) {
            this.fulltexts[a.id] = { text: a.fullText, state: a.fullTextState };
            touched = true;
        }
        return touched;
    }

    /** articles 主表只持久化轻量字段，大字段由 extras/fulltexts 键承载 */
    private serializeArticles(): Article[] {
        return Array.from(this.articles.values()).map((a) => {
            const { fullText, fullTextState, aiResults, highlights, savedDocId, savedAt, tags, ...rest } = a;
            void fullText; void fullTextState; void aiResults; void highlights; void savedDocId; void savedAt; void tags;
            return rest as Article;
        });
    }

    private async loadDataWithLegacyFallback(key: string): Promise<any> {
        const current = await this.plugin.loadData(key);
        if (current !== undefined && current !== null) return current;
        const legacy = await this.loadLegacyData(key);
        if (legacy !== undefined && legacy !== null) {
            await this.plugin.saveData(key, this.snapshot(legacy));
            console.info(`[ai-rss] migrated legacy data key ${key}`);
            return legacy;
        }
        return current;
    }

    private async loadLegacyData(key: string): Promise<any> {
        for (const dir of LEGACY_PLUGIN_STORAGE_DIRS) {
            const text = await this.getWorkspaceFileText(`/data/storage/petal/${dir}/${key}`);
            if (!text || !text.trim()) continue;
            try {
                const parsed = JSON.parse(text);
                if (parsed && typeof parsed === "object" && "code" in parsed && "msg" in parsed && !("items" in parsed)) continue;
                return parsed;
            } catch {
                return text;
            }
        }
        return undefined;
    }

    private async getWorkspaceFileText(path: string): Promise<string | undefined> {
        try {
            const resp = await fetch("/api/file/getFile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path }),
            });
            if (!resp.ok) return undefined;
            return await resp.text();
        } catch {
            return undefined;
        }
    }

    private snapshot<T>(data: T): T {
        try {
            if (typeof structuredClone === "function") return structuredClone(data);
        } catch { /* fallback */ }
        return JSON.parse(JSON.stringify(data)) as T;
    }

    private async persist(key: string, data: any) {
        const snapshot = this.snapshot(data);
        const prev = this.saveQueues.get(key) || Promise.resolve();
        const next = prev
            .catch(() => undefined)
            .then(async () => {
                await this.plugin.saveData(key, snapshot);
            })
            .catch((e) => {
                console.error("[ai-rss] save", key, e);
            });
        this.saveQueues.set(key, next);
        await next;
        if (this.saveQueues.get(key) === next) this.saveQueues.delete(key);
    }

    private pendingSaves: Map<string, { data: any; timer: number }> = new Map();

    /** 同 key 写合并：窗口内的多次变更只以最终值落盘一次（用于 articles/extras/fulltexts 重键） */
    private scheduleSave(key: string, data: any) {
        const existing = this.pendingSaves.get(key);
        if (existing) {
            existing.data = data;
            return;
        }
        const entry = { data, timer: 0 };
        entry.timer = window.setTimeout(() => {
            this.pendingSaves.delete(key);
            this.persist(key, entry.data).catch(() => { /* */ });
        }, SCHEDULED_SAVE_MS);
        this.pendingSaves.set(key, entry);
    }

    /** 立即落盘所有待合并写入（插件卸载时调用，尽力而为） */
    flushSaves() {
        for (const [key, entry] of this.pendingSaves) {
            window.clearTimeout(entry.timer);
            this.pendingSaves.delete(key);
            this.persist(key, entry.data);
        }
    }

    // ===== subs =====
    private normalizeUrl(url: string) {
        return (url || "").trim().toLowerCase();
    }

    private normalizeSubStore(raw: any): SubscriptionStore {
        const meta = raw && typeof raw === "object" && !Array.isArray(raw) ? raw.meta : undefined;
        const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.items) ? raw.items : []);
        return { meta, items: this.normalizeSubs(list) };
    }

    private normalizeSubs(list: Subscription[]) {
        const byUrl = new Map<string, Subscription>();
        const byId = new Map<string, string>();
        for (const raw of list || []) {
            if (!raw?.id || !raw?.url) continue;
            const now = Date.now();
            const sub: Subscription = {
                ...raw,
                url: raw.url.trim(),
                name: raw.name || raw.url.trim(),
                enabled: raw.enabled !== false,
                errorCount: raw.errorCount || 0,
                sortOrder: Number.isFinite(raw.sortOrder) ? raw.sortOrder : byUrl.size,
                createdAt: raw.createdAt || now,
                updatedAt: raw.updatedAt || raw.createdAt || now,
            };
            if (sub.categoryId) {
                const cat = this.cats.find((c) => c.id === sub.categoryId);
                if (cat) sub.categoryName = cat.name;
            }
            const urlKey = this.normalizeUrl(sub.url);
            const idKey = byId.get(sub.id);
            const key = idKey || urlKey;
            const existed = byUrl.get(key);
            if (!existed || (sub.updatedAt || 0) >= (existed.updatedAt || 0)) {
                const merged: Subscription = existed ? {
                    ...existed,
                    ...sub,
                    id: existed.id || sub.id,
                    createdAt: Math.min(existed.createdAt || sub.createdAt, sub.createdAt || existed.createdAt),
                    sortOrder: Math.min(existed.sortOrder ?? sub.sortOrder, sub.sortOrder ?? existed.sortOrder),
                    categoryId: sub.categoryId ?? existed.categoryId,
                    categoryName: sub.categoryName ?? existed.categoryName,
                    favicon: sub.favicon || existed.favicon,
                    siteUrl: sub.siteUrl || existed.siteUrl,
                    description: sub.description || existed.description,
                } : sub;
                byUrl.set(key, merged);
                byId.set(merged.id, key);
                if (key !== urlKey) byUrl.delete(urlKey);
                byUrl.set(urlKey, merged);
                byId.set(merged.id, urlKey);
            }
        }
        return Array.from(byUrl.values()).sort((a, b) => a.sortOrder - b.sortOrder);
    }

    private makeSubStore(items: Subscription[]): SubscriptionStore {
        const now = Date.now();
        this.subStoreMeta = {
            revision: (this.subStoreMeta.revision || 0) + 1,
            updatedAt: now,
            clientId: this.clientId,
            clearedAt: items.length === 0 ? now : this.subStoreMeta.clearedAt,
            deletedUrls: this.subStoreMeta.deletedUrls,
        };
        return { meta: this.subStoreMeta, items: this.normalizeSubs(items) };
    }

    private async loadLatestSubStore() {
        return this.normalizeSubStore(await this.plugin.loadData(KEYS.subs));
    }

    private async commitSubs(
        mutator: (items: Subscription[]) => Subscription[] | void,
        options: { mergeCurrent?: boolean; emit?: boolean } = {},
    ) {
        const prev = this.saveQueues.get(KEYS.subs) || Promise.resolve();
        let nextItems: Subscription[] = [];
        const next = prev
            .catch(() => undefined)
            .then(async () => {
                const latest = await this.loadLatestSubStore();
                const clearedAt = latest.meta?.clearedAt || 0;
                const deletedUrls = latest.meta?.deletedUrls || {};
                const latestUrls = new Set(latest.items.map((sub) => this.normalizeUrl(sub.url)));
                const current = this.subs.filter((sub) => {
                    const ts = sub.updatedAt || sub.createdAt || 0;
                    const urlKey = this.normalizeUrl(sub.url);
                    if (clearedAt && ts <= clearedAt) return false;
                    if (deletedUrls[urlKey] && !latestUrls.has(urlKey)) return false;
                    return true;
                });
                this.subStoreMeta = {
                    revision: latest.meta?.revision || this.subStoreMeta.revision || 0,
                    updatedAt: latest.meta?.updatedAt || this.subStoreMeta.updatedAt || 0,
                    clientId: latest.meta?.clientId || this.subStoreMeta.clientId || this.clientId,
                    clearedAt: latest.meta?.clearedAt ?? this.subStoreMeta.clearedAt,
                    deletedUrls: { ...(this.subStoreMeta.deletedUrls || {}), ...(latest.meta?.deletedUrls || {}) },
                };
                const base = options.mergeCurrent === false
                    ? latest.items
                    : this.normalizeSubs([...latest.items, ...current]);
                const result = mutator(base.map((sub) => ({ ...sub })));
                nextItems = this.normalizeSubs(result || base);
                const store = this.makeSubStore(nextItems);
                await this.plugin.saveData(KEYS.subs, this.snapshot(store));
                this.subs = store.items;
            })
            .catch((e) => {
                console.error("[ai-rss] save", KEYS.subs, e);
            });
        this.saveQueues.set(KEYS.subs, next);
        await next;
        if (this.saveQueues.get(KEYS.subs) === next) this.saveQueues.delete(KEYS.subs);
        if (options.emit !== false) this.emit("subs");
        return nextItems;
    }

    /** 内部不变量：this.subs 始终按 sortOrder 有序（normalizeSubs 保证），getter 只做浅拷贝 */
    getSubs(): Subscription[] { return this.subs.slice(); }
    getSub(id: string) { return this.subs.find((s) => s.id === id); }
    resolveSubCategoryId(sub: Subscription): string | undefined {
        if (sub.categoryId && this.cats.some((cat) => cat.id === sub.categoryId)) return sub.categoryId;
        if (sub.categoryName) {
            const byName = this.cats.find((cat) => cat.name === sub.categoryName);
            if (byName && byName.id !== "c_default") return byName.id;
        }
        return undefined;
    }
    async upsertSub(s: Subscription) {
        const incoming = { ...s, updatedAt: Date.now() };
        if (incoming.categoryId) {
            const cat = this.cats.find((c) => c.id === incoming.categoryId);
            incoming.categoryName = cat?.name || incoming.categoryName;
        }
        const saved = await this.commitSubs((items) => {
            const urlKey = this.normalizeUrl(incoming.url);
            if (this.subStoreMeta.deletedUrls?.[urlKey]) {
                const nextDeleted = { ...this.subStoreMeta.deletedUrls };
                delete nextDeleted[urlKey];
                this.subStoreMeta.deletedUrls = nextDeleted;
            }
            const i = items.findIndex((x) => x.id === incoming.id || this.normalizeUrl(x.url) === urlKey);
            if (i >= 0) {
                const old = items[i];
                items[i] = {
                    ...old,
                    ...incoming,
                    id: old.id,
                    createdAt: old.createdAt || incoming.createdAt,
                    sortOrder: old.sortOrder ?? incoming.sortOrder,
                };
            } else {
                items.push(incoming);
            }
            return items;
        });
        return saved.find((sub) => sub.id === incoming.id || this.normalizeUrl(sub.url) === this.normalizeUrl(incoming.url));
    }
    async patchSubMeta(id: string, patch: Partial<Subscription>) {
        await this.commitSubs((items) => items.map((sub) => sub.id === id ? { ...sub, ...patch, id: sub.id, url: sub.url, updatedAt: Date.now() } : sub));
    }
    /** 批量更新多个订阅的元数据，只落盘一次并触发一次渲染 */
    async patchSubsMeta(list: { id: string; patch: Partial<Subscription> }[]) {
        if (!list.length) return;
        const now = Date.now();
        await this.commitSubs((items) => items.map((sub) => {
            const p = list.find((x) => x.id === sub.id);
            return p ? { ...sub, ...p.patch, id: sub.id, url: sub.url, updatedAt: now } : sub;
        }));
    }
    async bulkImportSubs(list: Subscription[]) {
        const added: Subscription[] = [];
        await this.commitSubs((items) => {
            const existing = new Set(items.map((sub) => this.normalizeUrl(sub.url)));
            for (const raw of list) {
                const urlKey = this.normalizeUrl(raw.url);
                if (!urlKey || existing.has(urlKey)) continue;
                const sub = { ...raw, url: raw.url.trim(), updatedAt: Date.now() };
                if (sub.categoryId) {
                    const cat = this.cats.find((c) => c.id === sub.categoryId);
                    sub.categoryName = cat?.name || sub.categoryName;
                }
                items.push(sub);
                added.push(sub);
                existing.add(urlKey);
            }
            return items;
        });
        return added;
    }
    async removeSub(id: string) {
        const deletedUrls: string[] = [];
        await this.commitSubs((items) => {
            items.forEach((s) => { if (s.id === id) deletedUrls.push(this.normalizeUrl(s.url)); });
            if (deletedUrls.length) {
                const now = Date.now();
                this.subStoreMeta.deletedUrls = { ...(this.subStoreMeta.deletedUrls || {}) };
                deletedUrls.forEach((url) => this.subStoreMeta.deletedUrls![url] = now);
            }
            return items.filter((s) => s.id !== id);
        });
        this.persistRemovedArticles(new Set([id]));
        this.emit("articles");
    }
    async moveSubs(ids: string[], categoryId?: string) {
        const set = new Set(ids);
        const targetCat = categoryId && categoryId !== "c_default" ? this.cats.find((cat) => cat.id === categoryId) : undefined;
        const target = targetCat?.id;
        const now = Date.now();
        await this.commitSubs((items) => items.map((sub) => set.has(sub.id) ? { ...sub, categoryId: target, categoryName: targetCat?.name, updatedAt: now } : sub));
    }
    async removeSubs(ids: string[]) {
        const set = new Set(ids);
        await this.commitSubs((items) => {
            const now = Date.now();
            this.subStoreMeta.deletedUrls = { ...(this.subStoreMeta.deletedUrls || {}) };
            items.forEach((s) => { if (set.has(s.id)) this.subStoreMeta.deletedUrls![this.normalizeUrl(s.url)] = now; });
            return items.filter((s) => !set.has(s.id));
        });
        this.persistRemovedArticles(set);
        this.emit("articles");
    }
    /** 移除指定订阅源的文章及其大字段，重键走写合并 */
    private persistRemovedArticles(subIds: Set<string>) {
        const removed: string[] = [];
        for (const [aid, a] of this.articles) {
            if (subIds.has(a.subscriptionId)) {
                this.articles.delete(aid);
                this.read.delete(aid);
                this.star.delete(aid);
                removed.push(aid);
            }
        }
        this.persist(KEYS.read, Array.from(this.read));
        this.persist(KEYS.star, Array.from(this.star));
        if (removed.length) {
            for (const aid of removed) {
                delete this.extras[aid];
                delete this.fulltexts[aid];
            }
            this.invalidateSortedArticles();
            this.scheduleSave(KEYS.articles, this.serializeArticles());
            this.scheduleSave(KEYS.extras, this.extras);
            this.scheduleSave(KEYS.fulltexts, this.fulltexts);
        }
    }
    async clearSubscriptions(options: { clearCategories?: boolean } = {}) {
        this.subs = [];
        this.articles.clear();
        this.read.clear();
        this.star.clear();
        this.extras = {};
        this.fulltexts = {};
        this.invalidateSortedArticles();
        await this.commitSubs(() => [], { mergeCurrent: false, emit: false });
        if (options.clearCategories) {
            this.cats = [this.defaultCat()];
            await this.persist(KEYS.cats, this.cats);
        }
        this.persist(KEYS.read, []);
        this.persist(KEYS.star, []);
        this.scheduleSave(KEYS.articles, this.serializeArticles());
        this.emit("articles");
    }

    // ===== cats =====
    /** 内部不变量：this.cats 始终按 sortOrder 有序（upsert/remove/load 维护），getter 只做浅拷贝 */
    getCats(): Category[] { return this.cats.slice(); }
    async upsertCat(c: Category) {
        const old = this.cats.find((x) => x.id === c.id);
        const i = this.cats.findIndex((x) => x.id === c.id);
        if (i >= 0) this.cats[i] = c; else this.cats.push(c);
        this.cats.sort((a, b) => a.sortOrder - b.sortOrder);
        await this.persist(KEYS.cats, this.cats);
        if (old && old.name !== c.name) {
            await this.commitSubs((items) => items.map((sub) => sub.categoryId === c.id ? { ...sub, categoryName: c.name, updatedAt: Date.now() } : sub), { emit: false });
        }
        this.emit("cats");
    }
    async removeCat(id: string) {
        if (this.cats.find((c) => c.id === id)?.builtin) return;
        this.cats = this.cats.filter((c) => c.id !== id);
        await this.persist(KEYS.cats, this.cats);
        await this.commitSubs((items) => items.map((s) => s.categoryId === id ? { ...s, categoryId: undefined, categoryName: undefined, updatedAt: Date.now() } : s), { emit: false });
        this.emit("cats");
    }

    // ===== articles =====
    /** 排序 pubDate 倒序缓存，插入/删除时失效，避免每次 getArticles 全量排序 */
    private sortedArticles: Article[] | null = null;
    /** upsertArticles 内过期清理的限频时间戳 */
    private lastPruneAt = 0;

    getArticles(sid?: string): Article[] {
        let sorted = this.sortedArticles;
        if (!sorted) {
            sorted = Array.from(this.articles.values()).sort((a, b) => b.pubDate - a.pubDate);
            this.sortedArticles = sorted;
        }
        if (sid) return sorted.filter((a) => a.subscriptionId === sid);
        return [...sorted];
    }
    /** 文章集合变动后失效排序缓存 */
    private invalidateSortedArticles() { this.sortedArticles = null; }

    /** 单遍统计：总量/未读/今天/星标/日期数/每订阅未读数，替代 per-sub 的 O(n) 全扫 */
    articleStats(): ArticleStats {
        const now = Date.now();
        const todayCutoff = now - 86400_000;
        const dates = new Set<string>();
        const unreadBySub = new Map<string, number>();
        let total = 0, totalUnread = 0, todayUnread = 0, starred = 0;
        for (const a of this.articles.values()) {
            total++;
            dates.add(dateKey(a.pubDate));
            if (a.isStarred) starred++;
            if (!a.isRead) {
                totalUnread++;
                if (a.pubDate >= todayCutoff) todayUnread++;
                unreadBySub.set(a.subscriptionId, (unreadBySub.get(a.subscriptionId) || 0) + 1);
            }
        }
        return { total, totalUnread, todayUnread, starred, dateCount: dates.size, unreadBySub };
    }
    getArticle(id: string) { return this.articles.get(id); }
    async upsertArticles(list: Omit<Article, "isRead" | "isStarred">[]) {
        for (const incoming of list) {
            const a = incoming as Article;
            const ex = this.articles.get(a.id);
            if (ex) {
                a.isRead = ex.isRead; a.isStarred = ex.isStarred;
                a.savedDocId = ex.savedDocId; a.savedAt = ex.savedAt;
                a.tags = a.tags || ex.tags;
                a.aiResults = a.aiResults || ex.aiResults;
                a.highlights = a.highlights || ex.highlights;
                a.fullText = a.fullText || ex.fullText;
                a.fullTextState = a.fullTextState || ex.fullTextState;
            } else {
                a.isRead = this.read.has(a.id);
                a.isStarred = this.star.has(a.id);
            }
            this.articles.set(a.id, a as Article);
            // 新导入文章若自带大字段（全文/AI 结果等），拆到独立键，保持主表轻量
            this.pullHeavyFields(a);
        }
        // 过期清理最多每小时跑一次（全量清理由 tab 初始化时的 cleanupExpiredArticles 兜底），
        // 避免高频刷新每次 upsert 都全扫文章表
        if (Date.now() - this.lastPruneAt > 3_600_000) {
            this.lastPruneAt = Date.now();
            const removed = this.pruneExpiredArticles(false);
            for (const id of removed) {
                delete this.extras[id];
                delete this.fulltexts[id];
            }
            if (removed.length) this.persist(KEYS.read, Array.from(this.read));
        }
        this.invalidateSortedArticles();
        this.scheduleSave(KEYS.articles, this.serializeArticles());
        this.emit("articles");
    }
    private pruneExpiredArticles(emit = true): string[] {
        const days = Number(this.settings.general.articleRetentionDays ?? DEFAULT_SETTINGS.general.articleRetentionDays);
        if (!Number.isFinite(days) || days <= 0) return [];
        const cutoff = Date.now() - Math.max(1, days) * 86400_000;
        const removed: string[] = [];
        for (const [id, article] of this.articles.entries()) {
            if (article.isStarred || this.star.has(id)) continue;
            const time = article.pubDate || article.fetchedAt || 0;
            if (time && time < cutoff) {
                this.articles.delete(id);
                this.read.delete(id);
                removed.push(id);
            }
        }
        if (removed.length && emit) this.emit("articles");
        return removed;
    }
    async cleanupExpiredArticles() {
        this.lastPruneAt = Date.now();
        const removed = this.pruneExpiredArticles(false);
        for (const id of removed) {
            delete this.extras[id];
            delete this.fulltexts[id];
        }
        let dailyRemoved = 0;
        const cutoff = Date.now() - 30 * 86400_000;
        for (const [date, report] of Object.entries(this.dailyReports)) {
            if (!report?.generatedAt || report.generatedAt < cutoff) {
                delete this.dailyReports[date];
                dailyRemoved++;
            }
        }
        if (!removed.length && !dailyRemoved) return 0;
        this.persist(KEYS.read, Array.from(this.read));
        this.invalidateSortedArticles();
        this.scheduleSave(KEYS.articles, this.serializeArticles());
        if (removed.length) {
            this.scheduleSave(KEYS.extras, this.extras);
            this.scheduleSave(KEYS.fulltexts, this.fulltexts);
        }
        if (dailyRemoved) this.persist(KEYS.dailyReports, this.dailyReports);
        this.emit("articles");
        return removed.length;
    }

    /** 把文章对象当前的字段值同步到 extras 记录（供拆分键持久化） */
    private syncExtras(id: string) {
        const a = this.articles.get(id);
        if (!a) return;
        const ex = this.extras[id] || (this.extras[id] = {});
        ex.savedDocId = a.savedDocId;
        ex.savedAt = a.savedAt;
        ex.tags = a.tags;
        ex.aiResults = a.aiResults;
        ex.highlights = a.highlights;
    }

    async setRead(id: string, v: boolean) {
        const a = this.articles.get(id); if (!a) return;
        a.isRead = v;
        if (v) this.read.add(id); else this.read.delete(id);
        // isRead 加载时由 read 集合推导，无需再写 articles 主表
        await this.persist(KEYS.read, Array.from(this.read));
        this.emit("read");
    }
    async markRead(ids: string[], v = true) {
        const set = new Set(ids);
        let changed = false;
        for (const id of set) {
            const a = this.articles.get(id);
            if (!a || a.isRead === v) continue;
            a.isRead = v;
            if (v) this.read.add(id); else this.read.delete(id);
            changed = true;
        }
        if (!changed) return;
        this.persist(KEYS.read, Array.from(this.read));
        this.emit("read");
    }
    async setStar(id: string, v: boolean) {
        const a = this.articles.get(id); if (!a) return;
        a.isStarred = v;
        if (v) this.star.add(id); else this.star.delete(id);
        // isStarred 加载时由 star 集合推导，无需再写 articles 主表
        await this.persist(KEYS.star, Array.from(this.star));
        this.emit("star");
    }
    /** 批量星标，只落盘一次 star 数组 */
    async markStar(ids: string[], v = true) {
        const set = new Set(ids);
        let changed = false;
        for (const id of set) {
            const a = this.articles.get(id);
            if (!a || a.isStarred === v) continue;
            a.isStarred = v;
            if (v) this.star.add(id); else this.star.delete(id);
            changed = true;
        }
        if (!changed) return;
        this.persist(KEYS.star, Array.from(this.star));
        this.emit("star");
    }
    async setArticleFullText(id: string, fullText?: string | null) {
        const a = this.articles.get(id);
        if (!a) return;
        if (fullText) {
            a.fullText = fullText;
            a.fullTextState = "fetched";
            this.fulltexts[id] = { text: fullText, state: "fetched" };
        } else {
            delete a.fullText;
            delete a.fullTextState;
            delete this.fulltexts[id];
        }
        this.scheduleSave(KEYS.fulltexts, this.fulltexts);
        this.emit("fulltext");
    }

    async setAIResult(id: string, promptId: string, r: any) {
        const a = this.articles.get(id); if (!a) return;
        if (!a.aiResults) a.aiResults = {};
        a.aiResults[promptId] = r;
        this.syncExtras(id);
        this.scheduleSave(KEYS.extras, this.extras);
        this.emit("extras");
    }
    async setSaved(id: string, docId: string) {
        const a = this.articles.get(id); if (!a) return;
        a.savedDocId = docId; a.savedAt = Date.now();
        this.syncExtras(id);
        this.scheduleSave(KEYS.extras, this.extras);
        this.emit("extras");
    }
    async setTags(id: string, tags: string[]) {
        const a = this.articles.get(id); if (!a) return;
        a.tags = tags;
        this.syncExtras(id);
        this.scheduleSave(KEYS.extras, this.extras);
        this.emit("extras");
    }
    async addHighlight(articleId: string, h: any) {
        const a = this.articles.get(articleId); if (!a) return;
        if (!a.highlights) a.highlights = [];
        a.highlights.push(h);
        this.syncExtras(articleId);
        this.scheduleSave(KEYS.extras, this.extras);
        this.emit("extras");
    }
    async removeHighlight(articleId: string, hid: string) {
        const a = this.articles.get(articleId); if (!a?.highlights) return;
        a.highlights = a.highlights.filter((h) => h.id !== hid);
        this.syncExtras(articleId);
        this.scheduleSave(KEYS.extras, this.extras);
        this.emit("extras");
    }

    unreadCount(sid?: string): number {
        let n = 0;
        for (const a of this.articles.values()) {
            if ((!sid || a.subscriptionId === sid) && !a.isRead) n++;
        }
        return n;
    }
    totalUnread(): number { return this.unreadCount(); }

    // ===== settings =====
    getSettings() { return this.settings; }
    async setSettings(s: Settings) {
        this.settings = s;
        await this.persist(KEYS.settings, s);
        this.emit("settings");
    }
    updateSettings(patch: Partial<Settings>, options: { emit?: boolean } = {}) {
        this.settings = { ...this.settings, ...patch };
        this.persist(KEYS.settings, this.settings);
        if (options.emit !== false) this.emit("settings");
    }
    getAI() { return this.ai; }
    async setAI(a: AISettings) {
        this.ai = a;
        await this.persist(KEYS.ai, a);
        this.emit("ai");
    }
    updateAI(patch: Partial<AISettings>) {
        this.ai = { ...this.ai, ...patch };
        this.persist(KEYS.ai, this.ai);
        this.emit("ai");
    }
    getDailyReport(date: string): DailyReportCache | undefined {
        return this.dailyReports[date];
    }
    async saveDailyReport(date: string, report: DailyReportCache) {
        this.dailyReports = { ...this.dailyReports, [date]: report };
        await this.persist(KEYS.dailyReports, this.dailyReports);
        this.emit("daily");
    }
    async removeDailyReport(date: string) {
        if (!this.dailyReports[date]) return;
        const next = { ...this.dailyReports };
        delete next[date];
        this.dailyReports = next;
        await this.persist(KEYS.dailyReports, this.dailyReports);
        this.emit("daily");
    }
}
