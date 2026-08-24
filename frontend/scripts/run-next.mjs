import { spawn } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import nextEnv from "@next/env"

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
nextEnv.loadEnvConfig(rootDirectory)

const nextCli = resolve(rootDirectory, "frontend/node_modules/next/dist/bin/next")
const child = spawn(process.execPath, [nextCli, ...process.argv.slice(2)], {
  env: process.env,
  stdio: "inherit",
})

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exitCode = code ?? 1
})
