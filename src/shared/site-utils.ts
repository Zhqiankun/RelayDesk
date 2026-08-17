import type { SiteConfig } from './contracts'

export const DEFAULT_SITE_ICON = '↗'

export function isValidSiteUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function normalizeSite(site: SiteConfig): SiteConfig {
  return {
    id: site.id,
    name: site.name.trim(),
    url: site.url.trim(),
    icon: site.icon?.trim() || DEFAULT_SITE_ICON,
    shortcut: site.shortcut?.trim() || undefined,
    enabled: site.enabled !== false,
  }
}

export function createSiteId(): string {
  return `site-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
