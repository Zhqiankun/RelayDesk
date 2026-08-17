export type SiteStatus = 'idle' | 'loading' | 'online' | 'error'

export type SiteConfig = {
  id: string
  name: string
  url: string
  icon?: string
  shortcut?: string
  enabled: boolean
}

export type SiteStatusEvent = {
  id: string
  status: SiteStatus
  message?: string
}

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error'

export type UpdateStatusEvent = {
  status: UpdateStatus
  version?: string
  percent?: number
  message?: string
}

export type ViewBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type RelayDeskApi = {
  listSites: () => Promise<SiteConfig[]>
  saveSites: (sites: SiteConfig[]) => Promise<SiteConfig[]>
  activateSite: (id: string | null) => Promise<void>
  setViewBounds: (bounds: ViewBounds) => Promise<void>
  setViewVisible: (visible: boolean) => Promise<void>
  reloadSite: (id: string) => Promise<void>
  checkForUpdates: () => Promise<void>
  installUpdate: () => Promise<void>
  onSiteStatus: (listener: (event: SiteStatusEvent) => void) => () => void
  onNativeProtocolError: (listener: (message: string) => void) => () => void
  onUpdateStatus: (listener: (event: UpdateStatusEvent) => void) => () => void
}
