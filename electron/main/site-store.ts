import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { SiteConfig } from '../../src/shared/contracts.js'
import { isValidSiteUrl, normalizeSite } from '../../src/shared/site-utils.js'

const STORE_FILE = 'sites.json'

export class SiteStore {
  private readonly filePath: string
  private sites: SiteConfig[] = []

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, STORE_FILE)
  }

  async load(): Promise<SiteConfig[]> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8')
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      this.sites = parsed.filter(this.isPersistableSite).map(normalizeSite)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[RelayDesk] Could not read site store:', error)
      }
      this.sites = []
    }
    return this.list()
  }

  list(): SiteConfig[] {
    return this.sites.map(site => ({ ...site }))
  }

  async replace(sites: SiteConfig[]): Promise<SiteConfig[]> {
    const normalized = sites
      .map(normalizeSite)
      .filter(this.isPersistableSite)
      .slice(0, 30)
    this.sites = normalized
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    await fs.writeFile(this.filePath, JSON.stringify(this.sites, null, 2), 'utf8')
    return this.list()
  }

  private isPersistableSite(site: unknown): site is SiteConfig {
    if (!site || typeof site !== 'object') return false
    const candidate = site as Partial<SiteConfig>
    return Boolean(
      typeof candidate.id === 'string' &&
      /^[a-z0-9-]{3,80}$/i.test(candidate.id) &&
      typeof candidate.name === 'string' &&
      candidate.name.trim().length > 0 &&
      candidate.name.trim().length <= 80 &&
      typeof candidate.url === 'string' &&
      candidate.url.length <= 2048 &&
      isValidSiteUrl(candidate.url),
    )
  }
}
