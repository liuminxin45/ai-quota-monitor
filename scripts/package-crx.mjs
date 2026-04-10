import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import crx3 from 'crx3'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const distDir = path.join(rootDir, 'dist')
const releaseDir = path.join(rootDir, 'release')
const manifestPath = path.join(distDir, 'manifest.json')

if (!existsSync(manifestPath)) {
  throw new Error('dist/manifest.json not found. Run `npm run build` first.')
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const safeName = String(manifest.name ?? 'extension')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
const version = String(manifest.version ?? '0.0.0')
const baseName = `${safeName}-v${version}`

await mkdir(releaseDir, { recursive: true })

let tempDir
let keyPath = process.env.CRX_PRIVATE_KEY_PATH

if (process.env.CRX_PRIVATE_KEY) {
  tempDir = await mkdtemp(path.join(tmpdir(), 'ai-monitor-crx-'))
  keyPath = path.join(tempDir, 'extension.pem')
  await writeFile(keyPath, normalizePem(process.env.CRX_PRIVATE_KEY), 'utf8')
}

if (!keyPath) {
  console.warn('CRX_PRIVATE_KEY was not provided. The generated .crx will use a transient signing key.')
}

await crx3([manifestPath], {
  keyPath,
  crxPath: path.join(releaseDir, `${baseName}.crx`),
  zipPath: path.join(releaseDir, `${baseName}.zip`),
})

if (tempDir) {
  await rm(tempDir, { recursive: true, force: true })
}

console.log(`Packaged release/${baseName}.crx`)
console.log(`Packaged release/${baseName}.zip`)

function normalizePem(value) {
  return value.replace(/\r\n/g, '\n').trimEnd() + '\n'
}
