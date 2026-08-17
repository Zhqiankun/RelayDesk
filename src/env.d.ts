import type { RelayDeskApi } from './shared/contracts'

declare global {
  interface Window {
    relayDesk: RelayDeskApi
  }
}

export {}
