# GPT entrypoint — JWEB pushzips

Read this before building any JWEB pushzip. The goal is for a fresh model to produce the same hardened package on the first attempt.

## Default decision

Use **v2 built-in packages**. They do not need a cut-specific applicator.

- **overlay** — default for narrow changes and whenever `main` is moving. Ship only changed final files plus explicit deletions. This preserves unrelated concurrent work automatically.
- **exact-release** — use only when a broad coordinated rewrite truly needs an exact complete repository tree. It still pins the reviewed base and stages only the computed diff.
- **legacy applicator** — compatibility only. Use it only when the change genuinely cannot be expressed as final file bytes + deletions.

`package-builder.mjs` creates the v2 package directory from an exact base tree and candidate tree. The runtime transaction lives in `runner.mjs`.

## Non-negotiable operator shape

- Windows `cmd.exe`, not PowerShell.
- ZIP contains one top-level package directory.
- Root launcher is `PUSH-*.cmd`.
- Launcher resolves its own directory with `%~dp0` and delegates to a real `.mjs` file.
- **No inline `node -e` JavaScript in batch files.**
- **Do not enable delayed expansion.** `!` in JavaScript or data is otherwise eaten by `cmd.exe`.
- No nested ZIPs and no package-time downloads.
- Always give the user the ZIP **and** the one-line Downloads extract/`cd /d`/`call` command.

## Transaction shape

1. Fresh-clone remote `main` into a disposable worktree.
2. Require exact reviewed `expectedSha`; never auto-rebase or overwrite a newer head.
3. Verify `CNAME` is **exact bytes** `jweb.dev` — no newline, no `findstr /x` approximation.
4. Verify payload/release hashes and base guards before mutation.
5. Apply only final bytes/deletions from the manifest. Prefer this over text patching.
6. Run focused PRE/POST checks. Existing baseline debt is compared, not magically declared green.
7. Require cut-specific tests to pass.
8. Verify the working set and staged set are exactly the manifest. Deletions count.
9. `git diff --cached --check`.
10. Fetch/recheck `origin/main` immediately before commit.
11. Show the exact changes, then 5→1 countdown; Ctrl+C is the abort mechanism. Do not ask the operator to type `PUSH`.
12. One commit, one push. Preserve the worktree on failure.

## Windows / newline lessons already paid for

- Git for Windows may check LF blobs out as CRLF. Do not make an LF-only string replacer the deployment mechanism. V2 packages copy complete final files, so line-ending interpretation is not part of application.
- If a legacy textual mutation is unavoidable, normalize `\r\n` to `\n` only for matching and restore the file's original EOL convention on write.
- Package helpers and validation must use Node built-ins or dependencies already present in the repository. Do not assume global `typescript`, npm installs, or any undeclared package.
- Smoke package helpers from paths containing spaces.

## Moving-main rule

When another commit lands while a cut is being prepared:

- inspect/diff it;
- if disjoint, rebuild/rebase the package against the new head and preserve it;
- if overlapping, reconcile deliberately;
- never teach the operator-side package to auto-merge live `main`.

Overlay packages are preferred for this exact reason.

## Validation claims

Say what actually ran. Distinguish author-local checks from clean-clone integration checks. A package should be smoke-tested with the exact packaged bytes before delivery, including additions/deletions and protected unrelated directories when relevant.

## Build a package

Create an authoring spec (`jweb.pushzip-authoring.v1`) and run:

```text
node tools/jweb-pushzip/package-builder.mjs build path/to/cut-spec.json /path/to/output
node /path/to/output/PACKAGE/bootstrap/jweb-pushzip-runner.mjs verify-package /path/to/output/PACKAGE
```

Then ZIP the single package directory. See `README.md` for the spec fields and examples.
