# JWEB agent entrypoint

For JWEB code changes, preserve the current architecture and use the repository's existing tests/tools rather than inventing parallel systems.

## Pushzip requests

If the user asks for a **pushzip**, **push ZIP**, **push package**, or a package that will commit/push `main`, read these first:

1. `tools/jweb-pushzip/GPT-ENTRYPOINT.md`
2. `tools/jweb-pushzip/DOCTRINE.md`
3. `tools/jweb-pushzip/README.md`

Do not invent a new Windows deployment script when the canonical tooling can express the cut. New reusable failure lessons belong back in the pushzip tooling/doctrine.

The operator uses Windows `cmd.exe`. A delivered pushzip must always include its one-line Downloads extract/run command.
