// net-check.mjs — 出网能力自检
// 用途：判断「连不上 GitHub」是环境限制还是仓库/凭据问题。
// 用法: node scripts/net-check.mjs
//
// 判读：
//   node 能通 + git 不通  →  git 进程的出网被环境拦，需要换推送方式或提权
//   node 也不通           →  整体出网受限，需要代理
import { request } from "node:https";

const targets = [
  ["GitHub 仓库（HTTPS）", "https://github.com/LZKDreamer/xhs-ai-note.git/info/refs?service=git-upload-pack"],
  ["GitHub 主页", "https://github.com"],
  ["npm registry", "https://registry.npmjs.org/playwright"],
];

function probe(name, url) {
  return new Promise((resolve) => {
    const started = Date.now();
    const req = request(
      url,
      { method: "GET", timeout: 12000, headers: { "User-Agent": "node-net-check" } },
      (res) => {
        res.resume();
        resolve({ name, ok: true, status: res.statusCode, ms: Date.now() - started });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", (e) => {
      resolve({ name, ok: false, error: e.message, ms: Date.now() - started });
    });
    req.end();
  });
}

console.log("=== 出网能力自检 ===\n");
let reachable = 0;
for (const [name, url] of targets) {
  const r = await probe(name, url);
  if (r.ok) {
    reachable++;
    console.log(`  可通  ${String(r.status).padEnd(4)} ${String(r.ms + "ms").padEnd(8)} ${name}`);
  } else {
    console.log(`  不通        ${String(r.ms + "ms").padEnd(8)} ${name}   (${r.error})`);
  }
}
console.log(
  `\n结论：${reachable}/${targets.length} 个目标可达。` +
    (reachable === 0 ? " 需要配置代理才能推送。" : "")
);
