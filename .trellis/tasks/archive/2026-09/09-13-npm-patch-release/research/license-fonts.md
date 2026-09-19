# Cascadia Code 字体许可核实（2026-09-13）

> 独立 check 已重新从公开 HTTPS 获取 exact Fontsource 5.3.0 tgz、Microsoft LICENSE 与 Google OFL，重验四字体逐字节和完整许可文本匹配；两新增许可文件无内容变更，在新私有 npm ci 重建的最终 tgz 中完整包含，并通过生产HTTP逐字节校验。证据：发布根 `check/{fontsource.tgz,google-OFL.txt,microsoft-LICENSE.txt,artifact-audit.json}`。未来主commit必须纳入两个许可文件，详见 `check-report.md`；旧pnpm tgz已作废。

本文件记录 0.9.3 发布产物中自带字体（`public/fonts/*.woff2`）的许可证追溯证据，
用于解除此前 “字体再分发许可未证实” 的 publish 阻塞。只读核实，未改字体或业务。

## 结论

- 四个 woff2 均为 **Cascadia Code** 的 latin 子集（normal，权重 400/500/600/700）。
- 许可：**SIL Open Font License 1.1**。
- 版权声明：`Copyright (c) 2019 - Present, Microsoft Corporation, with Reserved Font Name Cascadia Code.`
- OFL 允许把字体随软件打包再分发，条件是在每份副本中包含上述版权声明与许可证文本。
  原仓库 MIT 许可证不覆盖第三方字体，因此本次新增字体许可材料是必要的（用户已批准扩围）。

## 精确二进制来源（按 SHA-256 逐字节匹配）

下载 `@fontsource/cascadia-code@5.3.0`（registry.npmjs.org）解包后比对：

| 本仓库文件 | Fontsource 5.3.0 `files/` | SHA-256 |
|---|---|---|
| `public/fonts/cascadia-code-latin-400-normal.woff2` | 一致 | `923fd5a61f1618f4597422b66172d0d8615577f81eb9382724390ec8cb8bfd5d` |
| `public/fonts/cascadia-code-latin-500-normal.woff2` | 一致 | `d4994c01c11d6b9a49a2b44e0a3711934c99a35268ab9303a7b9dcc30495341e` |
| `public/fonts/cascadia-code-latin-600-normal.woff2` | 一致 | `be5e5cbe3958e21cf2c7404e09853dcc83cf667e71327264274dd26fc8d92d9b` |
| `public/fonts/cascadia-code-latin-700-normal.woff2` | 一致 | `db2452f9551ba42a0b2b5ef27a3e9438737922fbdaabd71a2446eaf96fe81ad9` |

Fontsource 元数据 `metadata.json` 声明 `license.type=OFL-1.1`，`source=https://github.com/google/fonts`。

## 可核对的上游 URL

- Microsoft 上游许可：<https://raw.githubusercontent.com/microsoft/cascadia-code/main/LICENSE>
- Google Fonts 同字体 OFL：<https://raw.githubusercontent.com/google/fonts/main/ofl/cascadiacode/OFL.txt>
- Google Fonts 元数据：<https://raw.githubusercontent.com/google/fonts/main/ofl/cascadiacode/METADATA.pb>
- Fontsource 包：<https://www.npmjs.com/package/@fontsource/cascadia-code>

Microsoft 与 Google Fonts 两份文本去除行尾（MS 用 CRLF、Google 用 LF）后逐字节相同，
均为上面同一版权声明 + 完整 OFL 1.1。

## 本任务新增的许可材料

| 文件 | 说明 | SHA-256 |
|---|---|---|
| `public/fonts/LICENSE-cascadia-code.txt` | Google Fonts OFL 文本逐字节副本（LF） | `82c05d6c53dfa0c9025985c19e371810020b74ed2c61d51d370f2a8ab2506d52` |
| `public/fonts/NOTICE.txt` | 来源、匹配哈希、上游/许可证 URL 的说明 | `9834f87fdc368ab330c20814c78e032ae3e73dd86b6603ae1e38a2ab50b574db` |

两者都位于 `files: ["public", ...]` 白名单内，随包发布。

## 其他自带素材

- `public/icons/catppuccin/*.svg` 已自带 `public/icons/catppuccin/LICENSE`（MIT, 2023
  Catppuccin / thang-nm），无需新增。
- Oxanium 与 LXGW WenKai Screen 在运行时从外部 CDN（fonts.googleapis.com / jsdelivr）
  加载，**不随包再分发**，本包内无对应字体文件。

## 范围说明

本次仅做可核对的许可证来源追溯与必要文本补齐，不构成完整法律审计。
