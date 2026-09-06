# JWEB agent entrypoint

For JWEB code changes, preserve the current architecture and use the repository's existing tests/tools rather than inventing parallel systems.

## Pushzip requests

If the user asks for a **pushzip**, **push ZIP**, **push package**, or a package that will commit/push `main`, read these first:

1. `tools/jweb-pushzip/GPT-ENTRYPOINT.md`
2. `tools/jweb-pushzip/DOCTRINE.md`
3. `tools/jweb-pushzip/README.md`

Do not invent a new Windows deployment script when the canonical tooling can express the cut. New reusable failure lessons belong back in the pushzip tooling/doctrine.

The operator uses Windows `cmd.exe`. A delivered pushzip must always include its one-line Downloads extract/run command.

## Visual / artistic work

Before inventing one-off screenshot or debug-render code, read `tools/visual-harness/GPT-ENTRYPOINT.md`.

The harness is a normal implementation tool, not only a bug-hunt tool. Use REAL CITY mode (`?visualProbe=1` / `window.__debug.visualProbe.install()`) when a change depends on neighboring architecture, actual streaming/publication, materials, lighting, post-processing, or player-scale context. Use `captureArtPass()` while iterating on composition, massing, facade language, materials/color, circulation legibility, and general visual readability. Use generator specimens or direct geometry fixtures when the full city would only add noise.
