import { app, BrowserWindow, Menu, nativeImage, Tray, WebContentsView, ipcMain, session, shell } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import type { MenuItemConstructorOptions } from 'electron'

const require = createRequire(import.meta.url)
const { autoUpdater } = require('electron-updater') as typeof import('electron-updater')
import type { SiteConfig, SiteStatus, UpdateStatusEvent, ViewBounds } from '../../src/shared/contracts.js'
import { SiteStore } from './site-store.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

if (process.platform === 'win32' && os.release().startsWith('6.1')) {
  app.disableHardwareAcceleration()
}

if (process.platform === 'win32') {
  app.setAppUserModelId('com.relaydesk.app')
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

type SiteViewRecord = {
  config: SiteConfig
  view: WebContentsView
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let siteStore: SiteStore
let activeSiteId: string | null = null
let attachedView: WebContentsView | null = null
let viewBounds: ViewBounds = { x: 280, y: 0, width: 720, height: 640 }
let viewVisible = true
const siteViews = new Map<string, SiteViewRecord>()
let updateStatus: UpdateStatusEvent = { status: 'idle' }

const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')
const repositoryUrl = 'https://github.com/Zhqiankun/RelayDesk'

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function quitApplication() {
  isQuitting = true
  app.quit()
}

function createTray() {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'relaydesk.ico')
    : path.join(process.env.APP_ROOT, 'build', 'relaydesk.ico')
  const icon = nativeImage.createFromPath(iconPath)
  if (icon.isEmpty()) {
    console.warn(`[RelayDesk] Tray icon could not be loaded: ${iconPath}`)
    return
  }

  tray = new Tray(icon)
  tray.setToolTip('RelayDesk')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 RelayDesk', click: showMainWindow },
    { type: 'separator' },
    { label: '退出 RelayDesk', click: quitApplication },
  ]))
  tray.on('click', () => {
    if (mainWindow?.isVisible()) mainWindow.hide()
    else showMainWindow()
  })
}

function isHttpUrl(value: string): boolean {
  return value.startsWith('https://') || value.startsWith('http://')
}

function normalizeCcSwitchUrl(value: string): string | null {
  const lowerValue = value.toLowerCase()
  const supportedSchemes = ['ccswitch:', 'cc-switch:', 'cc_switch:']
  const scheme = supportedSchemes.find(candidate => lowerValue.startsWith(candidate))
  return scheme ? `ccswitch:${value.slice(scheme.length)}` : null
}

function isCcSwitchUrl(value: string): boolean {
  return normalizeCcSwitchUrl(value) !== null
}

function createApplicationMenu() {
  const template: MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        { label: '关闭窗口', role: 'close' },
        { label: '退出 RelayDesk', click: quitApplication },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' },
      ],
    },
    {
      label: '查看',
      submenu: [
        { label: '重新加载', role: 'reload' },
        { label: '强制重新加载', role: 'forceReload' },
        { type: 'separator' },
        { label: '开发者工具', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '实际大小', role: 'resetZoom' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { type: 'separator' },
        { label: '全屏', role: 'togglefullscreen' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', role: 'minimize' },
        { label: '缩放', role: 'zoom' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: 'RelayDesk 项目主页',
          click: () => void shell.openExternal(repositoryUrl).catch(() => undefined),
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function sendToRenderer(channel: string, ...args: unknown[]) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

function sendSiteStatus(id: string, status: SiteStatus, message?: string) {
  sendToRenderer('site:status', { id, status, message })
}

function sendUpdateStatus(event: UpdateStatusEvent) {
  updateStatus = event
  sendToRenderer('app:update-status', event)
}

function configureAutoUpdater() {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => sendUpdateStatus({ status: 'checking' }))
  autoUpdater.on('update-available', info => {
    sendUpdateStatus({ status: 'available', version: info.version })
    void autoUpdater.downloadUpdate().catch(() => undefined)
  })
  autoUpdater.on('update-not-available', info => {
    sendUpdateStatus({ status: 'not-available', version: info.version })
  })
  autoUpdater.on('download-progress', progress => {
    sendUpdateStatus({ status: 'downloading', percent: Math.round(progress.percent) })
  })
  autoUpdater.on('update-downloaded', info => {
    sendUpdateStatus({ status: 'downloaded', version: info.version, percent: 100 })
  })
  autoUpdater.on('error', error => {
    sendUpdateStatus({ status: 'error', message: error instanceof Error ? error.message : '更新检查失败。' })
  })
}

async function checkForUpdates() {
  if (!app.isPackaged) {
    sendUpdateStatus({ status: 'not-available', message: '开发模式不检查更新。' })
    return
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    sendUpdateStatus({ status: 'error', message: error instanceof Error ? error.message : '更新检查失败。' })
  }
}

function installUpdate() {
  if (updateStatus.status !== 'downloaded') return
  autoUpdater.quitAndInstall()
}

async function openNativeProtocol(url: string) {
  try {
    const normalizedUrl = normalizeCcSwitchUrl(url)
    if (!normalizedUrl) throw new Error('不受支持的 CC Switch 协议地址。')
    await shell.openExternal(normalizedUrl)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The native protocol could not be opened.'
    sendToRenderer('native:protocol-error', message)
  }
}

function createSiteView(config: SiteConfig): SiteViewRecord {
  const siteSession = session.fromPartition(`persist:relaydesk-${config.id}`)
  const view = new WebContentsView({
    webPreferences: {
      session: siteSession,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })
  const contents = view.webContents

  contents.setWindowOpenHandler(({ url }) => {
    if (isCcSwitchUrl(url)) {
      void openNativeProtocol(url)
      return { action: 'deny' }
    }
    if (isHttpUrl(url)) return { action: 'allow' }
    return { action: 'deny' }
  })

  contents.on('will-navigate', (event, url) => {
    if (isCcSwitchUrl(url)) {
      event.preventDefault()
      void openNativeProtocol(url)
      return
    }
    if (!isHttpUrl(url)) event.preventDefault()
  })

  contents.on('did-start-loading', () => sendSiteStatus(config.id, 'loading'))
  contents.on('did-stop-loading', () => sendSiteStatus(config.id, 'online'))
  contents.on('did-finish-load', () => sendSiteStatus(config.id, 'online'))
  contents.on('did-fail-load', (_event, errorCode, errorDescription, _validatedURL, isMainFrame) => {
    if (isMainFrame && errorCode !== -3) {
      sendSiteStatus(config.id, 'error', errorDescription)
    }
  })

  void contents.loadURL(config.url).catch(error => {
    const message = error instanceof Error ? error.message : 'The site could not be loaded.'
    sendSiteStatus(config.id, 'error', message)
  })

  return { config, view }
}

function detachActiveView() {
  const window = mainWindow
  const view = attachedView
  attachedView = null
  if (!window || window.isDestroyed() || !view) return
  window.contentView.removeChildView(view)
}

function attachActiveView() {
  const window = mainWindow
  if (!window || window.isDestroyed() || !activeSiteId || !viewVisible) return
  const record = siteViews.get(activeSiteId)
  if (!record) return

  if (attachedView !== record.view) {
    detachActiveView()
    window.contentView.addChildView(record.view)
    attachedView = record.view
  }
  record.view.setBounds(viewBounds)
}

function syncSiteViews(sites: SiteConfig[]) {
  const nextIds = new Set(sites.map(site => site.id))
  for (const [id, record] of siteViews) {
    const nextSite = sites.find(site => site.id === id)
    if (!nextIds.has(id) || !nextSite?.enabled) {
      if (attachedView === record.view) detachActiveView()
      if (!record.view.webContents.isDestroyed()) record.view.webContents.close()
      siteViews.delete(id)
    }
  }

  for (const site of sites) {
    const existing = siteViews.get(site.id)
    if (!existing) continue
    const urlChanged = existing.config.url !== site.url
    existing.config = site
    if (urlChanged) {
      void existing.view.webContents.loadURL(site.url).catch(error => {
        const message = error instanceof Error ? error.message : 'The site could not be loaded.'
        sendSiteStatus(site.id, 'error', message)
      })
    }
  }

  for (const site of sites) {
    if (site.enabled && !siteViews.has(site.id)) {
      siteViews.set(site.id, createSiteView(site))
    }
  }
}

async function activateSite(id: string | null) {
  if (id && !siteStore.list().some(site => site.id === id && site.enabled)) return
  activeSiteId = id
  viewVisible = true
  if (!id) {
    detachActiveView()
    return
  }

  if (!siteViews.has(id)) {
    const config = siteStore.list().find(site => site.id === id)
    if (config) siteViews.set(id, createSiteView(config))
  }
  attachActiveView()
}

function registerIpcHandlers() {
  ipcMain.handle('sites:list', () => siteStore.list())

  ipcMain.handle('sites:save', async (_event, value: unknown) => {
    if (!Array.isArray(value)) throw new Error('Sites must be an array.')
    const saved = await siteStore.replace(value as SiteConfig[])
    syncSiteViews(saved)
    if (activeSiteId && !saved.some(site => site.id === activeSiteId && site.enabled)) {
      await activateSite(null)
    }
    return saved
  })

  ipcMain.handle('workspace:activate', async (_event, id: unknown) => {
    if (id !== null && typeof id !== 'string') throw new Error('Invalid site id.')
    await activateSite(id)
  })

  ipcMain.handle('workspace:set-bounds', (_event, value: unknown) => {
    if (!value || typeof value !== 'object') return
    const candidate = value as Partial<ViewBounds>
    const nextBounds: ViewBounds = {
      x: Math.max(0, Math.round(Number(candidate.x) || 0)),
      y: Math.max(0, Math.round(Number(candidate.y) || 0)),
      width: Math.max(1, Math.round(Number(candidate.width) || 1)),
      height: Math.max(1, Math.round(Number(candidate.height) || 1)),
    }
    viewBounds = nextBounds
    attachedView?.setBounds(viewBounds)
  })

  ipcMain.handle('workspace:set-visible', (_event, visible: unknown) => {
    viewVisible = Boolean(visible)
    if (viewVisible) attachActiveView()
    else detachActiveView()
  })

  ipcMain.handle('workspace:reload', (_event, id: unknown) => {
    if (typeof id !== 'string') throw new Error('Invalid site id.')
    siteViews.get(id)?.view.webContents.reload()
  })

  ipcMain.handle('app:update-check', () => checkForUpdates())
  ipcMain.handle('app:update-install', () => installUpdate())
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'RelayDesk',
    minWidth: 980,
    minHeight: 640,
    width: 1320,
    height: 820,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (VITE_DEV_SERVER_URL) mainWindow.loadURL(VITE_DEV_SERVER_URL)
  else mainWindow.loadFile(indexHtml)

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('close', event => {
    if (isQuitting) return
    event.preventDefault()
    mainWindow?.hide()
  })

  mainWindow.on('minimize', event => {
    if (isQuitting) return
    event.preventDefault()
    mainWindow?.hide()
  })

  mainWindow.on('closed', () => {
    detachActiveView()
    siteViews.clear()
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  siteStore = new SiteStore(app.getPath('userData'))
  await siteStore.load()
  configureAutoUpdater()
  registerIpcHandlers()
  createApplicationMenu()
  createTray()
  createWindow()
  syncSiteViews(siteStore.list())
})

app.on('window-all-closed', () => {
  if (isQuitting || process.platform === 'darwin') app.quit()
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', () => {
  tray?.destroy()
  tray = null
})

app.on('second-instance', () => {
  if (!mainWindow) return
  showMainWindow()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
    syncSiteViews(siteStore.list())
  }
  else mainWindow?.focus()
})
