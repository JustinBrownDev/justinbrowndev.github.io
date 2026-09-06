# JWEB pushzip tooling

Start with [`GPT-ENTRYPOINT.md`](./GPT-ENTRYPOINT.md). The governing rules are in [`DOCTRINE.md`](./DOCTRINE.md).

The canonical implementation is now **runner v5** plus `package-builder.mjs`.

## Preferred package format: v2

V2 packages use the runner's built-in applicator. Ordinary cuts no longer need a custom source patcher.

`manifest/pushzip.json`:

```json
{
  "schema": "jweb.pushzip-package.v2",
  "label": "JWEB CUT NAME",
  "repoUrl": "https://github.com/JustinBrownDev/justinbrowndev.github.io.git",
  "expectedSha": "40-hex reviewed main SHA",
  "commitMessage": "type: concise checkpoint",
  "applyMode": "overlay",
  "preflightSyntax": [],
  "baselineTests": [],
  "syntax": ["main.js"],
  "tests": ["tests/example-selftest.mjs"],
  "protectedPrefixes": ["tools/visual-harness/"],
  "successNotes": []
}
```

`manifest/files.json` uses exact final bytes/deletions:

```json
{
  "schema": "jweb.pushzip-files.v2",
  "files": [
    {"path":"main.js","operation":"copy","sha256":"...","baseBlob":"..."},
    {"path":"new-file.js","operation":"copy","sha256":"...","baseAbsent":true},
    {"path":"old-file.js","operation":"delete","baseBlob":"..."}
  ]
}
```

`overlay` packages store copy sources under `payload/`. `exact-release` packages store the complete final repository under `release/` and add `releaseTreeSha256` to `pushzip.json`; the changed-path manifest is still exact.

Runner v5 fresh-clones `main`, requires the pinned SHA and exact-byte `jweb.dev` CNAME, validates package/base guards, applies final bytes transactionally, runs the baseline-differential + strict required-test gate, stages exactly the manifest (including deletions), rechecks remote main, counts down 5→1, commits once, and pushes once.

Legacy v1 packages/custom applicators remain supported for old checkpoints, but new packages should use v2 unless there is a real reason not to.

## Canonical builder

`package-builder.mjs` turns an exact base tree + candidate tree into a v2 package directory.

Authoring spec:

```json
{
  "schema": "jweb.pushzip-authoring.v1",
  "name": "JWEB-MY-CUT-R1-SINGLEFILE",
  "launcher": "PUSH-JWEB-MY-CUT.cmd",
  "label": "JWEB MY CUT",
  "mode": "overlay",
  "expectedSha": "40-hex reviewed main SHA",
  "baseRoot": "../base",
  "candidateRoot": "../candidate",
  "copy": ["main.js", "tests/my-cut-selftest.mjs"],
  "delete": [],
  "commitMessage": "refactor: my cut",
  "preflightSyntax": [],
  "baselineTests": [],
  "syntax": ["main.js"],
  "tests": ["tests/my-cut-selftest.mjs"],
  "protectedPrefixes": ["tools/visual-harness/"]
}
```

Build and locally verify package integrity:

```text
node tools/jweb-pushzip/package-builder.mjs build cut-spec.json ./dist
node ./dist/JWEB-MY-CUT-R1-SINGLEFILE/bootstrap/jweb-pushzip-runner.mjs verify-package ./dist/JWEB-MY-CUT-R1-SINGLEFILE
```

For `exact-release`, omit `copy`/`delete`; the builder computes the exact changed-path manifest by comparing the two trees and packages the complete candidate tree.

The builder uses repository Git blob IDs when a `.git` directory is available and otherwise computes Git blob IDs from exact base bytes. This is why the base tree must represent the reviewed commit, not a hand-edited approximation.

## Windows launcher contract

`PUSH-TEMPLATE.cmd` is deliberately boring: `%~dp0`, `where git`, `where node`, then one quoted `.mjs` invocation. No inline JavaScript and no delayed expansion. This avoids the two Windows failures already observed: `!` being consumed by `cmd.exe`, and package paths with spaces being injected into an inline `node -e` expression.

Distribution instructions still use one Downloads one-liner: remove old extracted directory, `tar -xf`, `cd /d`, `call PUSH-....cmd`.
