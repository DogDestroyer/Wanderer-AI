/**
 * Next.js 16 does not allow both middleware.ts and proxy.ts to exist
 * in the src/ directory simultaneously. Since we use a route-group layout
 * for auth instead of either file, we simply delete the empty middleware.ts
 * stub before each build.
 */
import { unlinkSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const target = join(root, 'src', 'middleware.ts')

if (existsSync(target)) {
  unlinkSync(target)
  console.log('✓ Removed src/middleware.ts (superseded by proxy.ts convention)')
}
