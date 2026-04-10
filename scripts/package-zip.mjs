import { mkdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zip from 'bestzip'

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
const zipName = `${safeName}-v${version}.zip`

await mkdir(releaseDir, { recursive: true })

await zip({
  cwd: distDir,
  source: ['.'],
  destination: path.join(releaseDir, zipName),
})

console.log(`Packaged release/${zipName}`)
