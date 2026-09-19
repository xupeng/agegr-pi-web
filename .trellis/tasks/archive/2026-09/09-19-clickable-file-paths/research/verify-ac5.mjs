import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createJiti } from "jiti";

const jiti = createJiti("/home/xupeng/dev/personal/forked/agegr-pi-web/.trellis/tasks/09-19-clickable-file-paths/research/verify-e2e.mjs", { tsconfigPaths: true });
const { extractTrellisWrittenFiles } = await jiti.import("@/lib/written-file-sources.ts");

const ROOT = `${process.env.HOME}/.pi/agent/sessions`;
const MAX32 = 32;
let runs = 0, runsOver32 = 0, cappedPaths = 0, fullPaths = 0, worst = null;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p);
    else if (name.endsWith(".jsonl")) scanFile(p);
  }
}

function scanFile(p) {
  let text; try { text = readFileSync(p, "utf8"); } catch { return; }
  for (const line of text.split("\n")) {
    if (!line.includes("trellis-subagent-progress")) continue;
    let entry; try { entry = JSON.parse(line); } catch { continue; }
    const details = entry.message?.details;
    if (!details?.runs) continue;
    for (const run of details.runs) {
      runs++;
      const tools = Array.isArray(run.tools) ? run.tools : [];
      // 模拟旧解码器：只看末 32 条
      const capped = tools.slice(-MAX32);
      const count = (arr) => {
        const s = new Set();
        for (const t of arr) {
          if (t?.status !== "succeeded") continue;
          if (!["write", "edit"].includes(String(t.name))) continue;
          try { const a = JSON.parse(t.args); const f = a.path ?? a.file_path; if (typeof f === "string") s.add(f); } catch {}
        }
        return s.size;
      };
      const c = count(capped), f = count(tools);
      cappedPaths += c; fullPaths += f;
      if (tools.length > MAX32) {
        runsOver32++;
        if (!worst || (f - c) > worst.delta) worst = { file: p.split("/").slice(-1)[0], tools: tools.length, capped: c, full: f, delta: f - c };
      }
    }
  }
}
walk(ROOT);
console.log(`扫描 trellis runs: ${runs}`);
console.log(`tools.length > 32 的 run: ${runsOver32}`);
console.log(`末32条截断方式可见的不同路径数: ${cappedPaths}`);
console.log(`全量提取得到的不同路径数:     ${fullPaths}`);
console.log(`最坏一例: ${JSON.stringify(worst)}`);
