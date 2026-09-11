import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

const require = createRequire(import.meta.url)
const source = process.env.PEII_STARTUP_UNDER_TEST ?? fileURLToPath(new URL("run-next.mjs", import.meta.url))
for (const layout of ["frontend", "app"]) {
  test(`starts the installed CLI in ${layout} layout with root env and provider precedence`, () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "peii-startup-")))
    try {
      const app = join(root, layout)
      mkdirSync(join(app, "scripts"), { recursive: true })
      mkdirSync(join(app, "node_modules", "next", "dist", "bin"), { recursive: true })
      mkdirSync(join(app, "node_modules", "@next"), { recursive: true })
      symlinkSync(dirname(require.resolve("@next/env/package.json")), join(app, "node_modules", "@next", "env"))
      writeFileSync(join(app, "scripts", "run-next.mjs"), readFileSync(source))
      writeFileSync(join(root, ".env"), "PEII_ROOT_TEST=loaded\nPEII_PROVIDER_TEST=file-value\n")
      writeFileSync(join(app, "node_modules", "next", "dist", "bin", "next"), `
        console.log(JSON.stringify({cwd:process.cwd(), root:process.env.PEII_ROOT_TEST,
          provider:process.env.PEII_PROVIDER_TEST, args:process.argv.slice(2)}));
        process.exitCode = 7;
      `)
      const result = spawnSync(process.execPath, [join(app, "scripts", "run-next.mjs"), "--version"], {
        cwd: tmpdir(), encoding: "utf8", env: { PATH: process.env.PATH, PEII_PROVIDER_TEST: "provider-value" },
      })
      assert.equal(result.status, 7, result.stderr)
      const output = JSON.parse(result.stdout.trim().split("\n").at(-1))
      assert.deepEqual(output, { cwd: app, root: "loaded", provider: "provider-value", args: ["--version"] })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
}
