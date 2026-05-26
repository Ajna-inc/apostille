import fs from 'node:fs'
import path from 'node:path'

/**
 * Demo portrait loader.
 *
 * Reads JPEG files from `backend/assets/portraits/` once at startup,
 * base64-encodes them, and exposes them as data URIs (for SD-JWT `picture`
 * claims) or raw buffers (for mDL `portrait` byte strings).
 *
 * The mDL `buildMdocNamespaces` helper already strips a leading
 * `data:image/...;base64,` prefix and decodes back to Buffer, so callers can
 * pass the same data URI to both pipelines.
 */

const PORTRAITS_DIR = path.resolve(__dirname, '../../../assets/portraits')

interface LoadedPortrait {
  dataUri: string
  bytes: Buffer
}

const cache = new Map<string, LoadedPortrait>()

function loadOnce(persona: string): LoadedPortrait | undefined {
  const cached = cache.get(persona)
  if (cached) return cached

  const file = path.join(PORTRAITS_DIR, `${persona}.jpg`)
  if (!fs.existsSync(file)) return undefined

  const bytes = fs.readFileSync(file)
  const dataUri = `data:image/jpeg;base64,${bytes.toString('base64')}`
  const entry: LoadedPortrait = { dataUri, bytes }
  cache.set(persona, entry)
  return entry
}

/**
 * Return a `data:image/jpeg;base64,...` data URI for the given persona, or
 * `undefined` if no portrait file exists. Suitable for SD-JWT VC `picture`
 * claims and JSON-LD `image` fields.
 */
export function getPortraitDataUri(persona: string): string | undefined {
  return loadOnce(persona.toLowerCase())?.dataUri
}

/**
 * Return raw JPEG bytes for the given persona. Suitable for the ISO 18013-5
 * mDL `portrait` byte-string element. Returns `undefined` if no portrait
 * exists.
 */
export function getPortraitBytes(persona: string): Buffer | undefined {
  return loadOnce(persona.toLowerCase())?.bytes
}
