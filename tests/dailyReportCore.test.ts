import { test } from "node:test";
import assert from "node:assert/strict";
import {
    articleSetHash,
    buildDeepDiveBatches,
    buildDeepDivePrompt,
    buildPanoramaPrompt,
    composeFinalReport,
    fallbackSelect,
    mapBatchCitations,
    runWithConcurrency,
    selectTopArticles,
    splitPanoramaArticles,
} from "../src/dailyReportCore.ts";

test("buildPanoramaPrompt 每篇一行紧凑元数据且相同标题去重", () => {
    const arts = [
        { id: "a1", title: "标题 A", source: "源1", category: "科技" },
        { id: "a2", title: "标题 A ", source: "源2", category: "科技" },
        { id: "a3", title: "标题 B", source: "源3", category: "财经" },
    ];
    const p = buildPanoramaPrompt("2026-08-07", arts);
    assert.equal(p.lineCount, 2);
    assert.ok(p.prompt.includes("编号：1"));
    assert.ok(p.prompt.includes("编号：3"));
    assert.ok(p.prompt.includes("标题 B"));
    assert.ok(p.estimateChars > 0);
});

test("splitPanoramaArticles 超长时按字符切块且不丢文章", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
        id: `a${i}`, title: `标题${i}`, source: "源", category: "分类",
    }));
    const chunks = splitPanoramaArticles(many, 100);
    assert.ok(chunks.length >= 2);
    assert.deepEqual(chunks.flat().map((a) => a.id), many.map((a) => a.id));
});

test("selectTopArticles 解析多种编号格式并忽略非法/元数据行", () => {
    const arts = Array.from({ length: 10 }, (_, i) => ({
        id: `a${i}`, title: `T${i}`, source: "源", category: "分类",
    }));
    const text = [
        "- 3 值得深读",
        "12. 超出范围",
        "[5]",
        "编号：7 | 分类：x | 来源：y | 标题：z",
        "99",
    ].join("\n");
    const sel = selectTopArticles(text, arts, 3);
    assert.deepEqual(sel.map((a) => a.id), ["a2", "a4"]);
});

test("selectTopArticles 空结果时回退为分类均匀抽样", () => {
    const arts = Array.from({ length: 8 }, (_, i) => ({
        id: `a${i}`, title: `T${i}`, source: "源", category: i % 2 ? "B" : "A",
    }));
    const sel = selectTopArticles("没有任何编号的正文", arts, 5);
    assert.ok(sel.length > 0);
    assert.ok(sel.length <= 5);
});

test("fallbackSelect 确定性且覆盖多个分类", () => {
    const mixed = [
        { id: "a", title: "a", source: "s", category: "A" },
        { id: "b", title: "b", source: "s", category: "B" },
        { id: "c", title: "c", source: "s", category: "A" },
        { id: "d", title: "d", source: "s", category: "B" },
    ];
    assert.deepEqual(fallbackSelect(mixed, 2).map((a) => a.id).sort(), ["a", "b"]);
});

test("buildDeepDiveBatches 按批次大小切分", () => {
    assert.deepEqual(buildDeepDiveBatches([1, 2, 3, 4, 5], 2).map((b) => b.length), [2, 2, 1]);
    assert.deepEqual(buildDeepDiveBatches([1, 2, 3], 0).flat(), [1, 2, 3]);
});

test("buildDeepDivePrompt 包含批次信息与文章内容", () => {
    const batch = [{
        id: "x1", title: "文章一", source: "源", category: "科技",
        link: "https://example.com/1", description: "这是摘要内容",
    }];
    const p = buildDeepDivePrompt("2026-08-07", batch, 0);
    assert.ok(p.includes("第 1 批"));
    assert.ok(p.includes("文章一"));
    assert.ok(p.includes("这是摘要内容"));
});

test("mapBatchCitations 把批次内编号映射为文章链接", () => {
    const batch = [
        { id: "x1", title: "t", source: "s", category: "c" },
        { id: "x2", title: "t", source: "s", category: "c" },
        { id: "x3", title: "t", source: "s", category: "c" },
    ];
    assert.equal(mapBatchCitations("[1] 标题", batch), "[↗︎](article:x1) 标题");
    assert.equal(mapBatchCitations("跳过 [9]", batch), "跳过 [9]");
});

test("composeFinalReport 拼接全景、深读与跳过提示", () => {
    const md = composeFinalReport(
        "全景内容",
        [{ articles: [], markdown: "### 摘要\n[↗︎](article:x2)" }],
        { skipped: ["x9"] },
    );
    assert.ok(md.includes("## 今日速览"));
    assert.ok(md.includes("## 重点文章摘要"));
    assert.ok(md.includes("1 篇文章深读失败已跳过"));
});

test("articleSetHash 与顺序无关且集合不同则不同", () => {
    assert.equal(articleSetHash([{ id: "b" }, { id: "a" }]), articleSetHash([{ id: "a" }, { id: "b" }]));
    assert.notEqual(articleSetHash([{ id: "a" }]), articleSetHash([{ id: "b" }]));
});

test("runWithConcurrency 全部执行且并发受限", async () => {
    let active = 0;
    let maxActive = 0;
    const out = await runWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (v) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 5));
        active -= 1;
        return v * 2;
    });
    assert.deepEqual(out, [2, 4, 6, 8, 10, 12]);
    assert.ok(maxActive <= 2);
});
