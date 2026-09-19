// 端到端数据链路验证（AC1/AC4）：用真实会话文件跑新的提取层。
// 会话文件是磁盘格式（{id,name,arguments}），内存/渲染层是规范格式（{toolCallId,toolName,input}）——
// 这里按 session-reader 的方式做同样的映射，验证的是渲染链路上的真实输入形态。
// 运行：node --experimental-strip-types .trellis/tasks/09-19-clickable-file-paths/research/verify-e2e.mjs
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { extractTurnWrittenFiles } = await jiti.import("@/lib/turn-written-files.ts");

const SESSION = process.argv[2] ??
  `${process.env.HOME}/.pi/agent/sessions/--home-xupeng-dev-personal-forked-agegr-pi-web--/2026-09-18T06-02-15-877Z_01a0b31b-c1c4-70fe-9c01-21d8ed51577c.jsonl`;
const CWD = "/home/xupeng/dev/personal/forked/agegr-pi-web";

const toolCalls = [];
const toolResults = new Map();
for (const line of readFileSync(SESSION, "utf8").split("\n")) {
  if (!line.trim()) continue;
  let entry;
  try { entry = JSON.parse(line); } catch { continue; }
  const m = entry.message;
  if (!m) continue;
  if (m.role === "assistant") {
    for (const b of m.content ?? []) {
      if (b.type !== "toolCall") continue;
      toolCalls.push({ type: "toolCall", toolCallId: b.id, toolName: b.name, input: b.arguments });
    }
  } else if (m.role === "toolResult") {
    toolResults.set(m.toolCallId, { ...m, toolCallId: m.toolCallId });
  }
}

const files = extractTurnWrittenFiles(toolCalls, toolResults, CWD);
console.log(`toolCalls=${toolCalls.length}  toolResults=${toolResults.size}  extracted=${files.length}\n`);
for (const f of files) {
  const stats = f.added === undefined ? "" : `  +${f.added}/-${f.removed ?? 0}`;
  console.log(`${(f.origin ?? "?").padEnd(20)} ${(f.operation ?? "-").padEnd(6)} ${f.filePath.replace(CWD + "/", "")}${stats}`);
}
const byOrigin = {};
for (const f of files) byOrigin[f.origin] = (byOrigin[f.origin] ?? 0) + 1;
console.log("\norigin 分布:", JSON.stringify(byOrigin));
