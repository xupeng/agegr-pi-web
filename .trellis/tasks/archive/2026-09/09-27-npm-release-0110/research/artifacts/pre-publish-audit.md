# Pre-publish audit and smoke (0.11.0) - captured at the script's confirmation prompt

Release point `H` = `92e4cec` (tree `cbbc4dee3435a7599ddf06e0c1303e78840e00f8`).
The script had already bumped `package.json`/`package-lock.json` to 0.11.0 and built
`.next` (webpack production) when this was taken; `BUILD_ID` = `6FDpD8d40wtw2Z-HLJkHs`.

## Archived artifact (outside the checkout)

`/home/xupeng/pi-web-release-artifacts-0.11.0/pack/xup3ng-pi-web-0.11.0.tgz`

- SHA-256: `1c6112e18aafd5d4823a7cca79a9f06bc9a59d80069b1886a06e527c048aa1d4`
- Size: 11 MB; entries: 827 (`.next/**`: 628, fonts: 111).

## Version and entries

| Item | Observed value |
|------|----------------|
| `package.json`, `package-lock.json` (top and root) | 0.11.0 |
| `.next/BUILD_ID` | `6FDpD8d40wtw2Z-HLJkHs` |
| Build version | 0.11.0 embedded in `.next/server/app/page.js` and `.next/server/app/api/app-update/route.js` |
| tgz manifest | `@xup3ng/pi-web@0.11.0`, bin `pi-web` -> `bin/pi-web.js` |

Required entries: `LICENSE`, `README.md`, `bin/pi-web.js`, `next.config.ts`,
`package.json`, and `.next/**`. Font licenses: `public/fonts/LICENSE-cascadia-code.txt`,
`public/fonts/oxanium/LICENSE-oxanium.txt`, `public/fonts/lxgw-wenkai-screen/LICENSE.txt`
and `OFL.txt`. No `.git/`, `.trellis/`, `e2e/`, `test-results/`, `.next/dev/`,
`.env` or `*.js.map` entries.

The audit script initially printed `MISS package.json` because that needle lacked
the `package/` tar prefix; the actual `package/package.json` entry was verified.

## Smoke tests

- Checkout production build (`next start`, port 24141, temporary agent dir): `/` -> 200,
  Cascadia font -> 200 (29 KB), ready in 130 ms.
- Installed archived tarball in a temporary global prefix (`pi-web --port 24144`):
  `/` -> 200, Cascadia font -> 200, LXGW font subset 100 -> 200 (67.8 KB),
  Next.js 16.3.6, ready in 134 ms. Temporary prefix was removed.
- `.next` contained 637 files before and after both smoke runs.

The tarball install used `--registry https://registry.npmmirror.com` because direct
dependency downloads from npmjs stalled locally. Its pinned dependency integrity
remained in the merged lockfile; the smoke test used the archived npmjs package bytes.
