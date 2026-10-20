import { spawn } from 'node:child_process'
import { developmentEnvironment } from './convex-environment.mjs'

developmentEnvironment()
console.log(`Using Convex development backend: ${process.env.CONVEX_URL}`)
const child = spawn('bun', ['--bun', 'vite', 'dev', ...process.argv.slice(2)], {
  stdio: 'inherit', env: process.env,
})
child.on('error', () => {
  console.error('Could not start Vite. Ensure Bun is installed.')
  process.exitCode = 1
})
child.on('exit', code => { process.exitCode = code ?? 1 })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
