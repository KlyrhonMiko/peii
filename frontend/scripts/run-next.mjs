import { spawn } from "node:child_process"
import { dirname, resolve } from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import nextEnv from "@next/env"

const frontendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const rootDirectory = resolve(frontendDirectory, "..")
nextEnv.loadEnvConfig(rootDirectory)

const nextCli = createRequire(import.meta.url).resolve("next/dist/bin/next")
const child = spawn(process.execPath, [nextCli, ...process.argv.slice(2)], {
  cwd: frontendDirectory,
  env: process.env,
  stdio: "inherit",
})

child.on("error", (error) => {
  console.error("Unable to start Next.js:", error.message)
  process.exitCode = 1
})

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exitCode = code ?? 1
})
