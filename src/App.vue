<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { SiteConfig, SiteStatusEvent, UpdateStatusEvent } from './shared/contracts'
import { createSiteId, DEFAULT_SITE_ICON, isValidSiteUrl } from './shared/site-utils'

type SiteDraft = {
  name: string
  url: string
  icon: string
  enabled: boolean
}

const sites = ref<SiteConfig[]>([])
const activeSiteId = ref<string | null>(null)
const stageRef = ref<HTMLElement | null>(null)
const isLibraryOpen = ref(false)
const isSidebarCollapsed = ref(false)
const editingSiteId = ref<string | null>(null)
const draft = ref<SiteDraft>(emptyDraft())
const formError = ref('')
const toast = ref('')
const siteStatuses = ref<Record<string, SiteStatusEvent>>({})
const failedSiteId = ref<string | null>(null)
const updateStatus = ref<UpdateStatusEvent>({ status: 'idle' })

let stageObserver: ResizeObserver | undefined
let stopStatusListener: (() => void) | undefined
let stopProtocolListener: (() => void) | undefined
let stopUpdateListener: (() => void) | undefined

const activeSite = computed(() => sites.value.find(site => site.id === activeSiteId.value) ?? null)
const activeStatus = computed(() => activeSite.value ? siteStatuses.value[activeSite.value.id] : undefined)
const enabledSites = computed(() => sites.value.filter(site => site.enabled))
const showWorkspaceFallback = computed(() => !isLibraryOpen.value && (!activeSite.value || failedSiteId.value === activeSite.value.id))

function emptyDraft(): SiteDraft {
  return { name: '', url: '', icon: DEFAULT_SITE_ICON, enabled: true }
}

function plainSite(site: SiteConfig): SiteConfig {
  return {
    id: site.id,
    name: site.name,
    url: site.url,
    icon: site.icon,
    shortcut: site.shortcut,
    enabled: site.enabled,
  }
}

function siteOrigin(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function statusLabel(site: SiteConfig): string {
  const status = siteStatuses.value[site.id]?.status ?? 'idle'
  if (status === 'loading') return '加载中'
  if (status === 'online') return '在线'
  if (status === 'error') return '异常'
  return '待命'
}

function notify(message: string) {
  toast.value = message
  window.setTimeout(() => {
    if (toast.value === message) toast.value = ''
  }, 3600)
}

function updateButtonTitle(): string {
  if (updateStatus.value.status === 'downloaded') return '重启并安装更新'
  if (updateStatus.value.status === 'checking') return '正在检查更新'
  if (updateStatus.value.status === 'downloading') return `正在下载更新 ${updateStatus.value.percent ?? 0}%`
  return '检查更新'
}

async function handleUpdateAction() {
  if (updateStatus.value.status === 'downloaded') {
    await window.relayDesk.installUpdate()
    return
  }
  await window.relayDesk.checkForUpdates()
}

function handleUpdateStatus(event: UpdateStatusEvent) {
  updateStatus.value = event
  if (event.status === 'available') notify(`发现 RelayDesk ${event.version ?? '新版本'}，正在下载。`)
  if (event.status === 'downloaded') notify(`RelayDesk ${event.version ?? '新版本'}已下载，点击更新按钮重启安装。`)
  if (event.status === 'not-available' && event.message) notify(event.message)
  if (event.status === 'error') notify(`更新失败：${event.message ?? '请稍后重试。'}`)
}

async function refreshViewBounds() {
  const stage = stageRef.value
  if (!stage) return
  const rect = stage.getBoundingClientRect()
  await window.relayDesk.setViewBounds({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  })
}

async function selectSite(siteId: string) {
  const site = sites.value.find(item => item.id === siteId)
  if (!site || !site.enabled) return
  isLibraryOpen.value = false
  failedSiteId.value = null
  activeSiteId.value = siteId
  await nextTick()
  await refreshViewBounds()
  await window.relayDesk.activateSite(siteId)
}

async function openLibrary() {
  isLibraryOpen.value = true
  formError.value = ''
  await window.relayDesk.setViewVisible(false)
}

async function closeLibrary() {
  isLibraryOpen.value = false
  editingSiteId.value = null
  draft.value = emptyDraft()
  if (activeSiteId.value) {
    await nextTick()
    await refreshViewBounds()
    await window.relayDesk.setViewVisible(true)
  }
}

async function startAdd() {
  editingSiteId.value = null
  draft.value = emptyDraft()
  formError.value = ''
  await openLibrary()
}

async function startEdit(site: SiteConfig) {
  editingSiteId.value = site.id
  draft.value = {
    name: site.name,
    url: site.url,
    icon: site.icon ?? DEFAULT_SITE_ICON,
    enabled: site.enabled,
  }
  formError.value = ''
  await openLibrary()
}

async function saveSite() {
  const name = draft.value.name.trim()
  const url = draft.value.url.trim()
  if (!name) {
    formError.value = '请输入站点名称。'
    return
  }
  if (!isValidSiteUrl(url)) {
    formError.value = '请输入以 http:// 或 https:// 开头的地址。'
    return
  }

  const nextSite: SiteConfig = {
    id: editingSiteId.value ?? createSiteId(),
    name,
    url,
    icon: draft.value.icon.trim() || DEFAULT_SITE_ICON,
    enabled: draft.value.enabled,
  }
  const existingIndex = sites.value.findIndex(site => site.id === nextSite.id)
  const nextSites = existingIndex >= 0
    ? sites.value.map(site => site.id === nextSite.id ? nextSite : site)
    : [...sites.value, nextSite]

  sites.value = await window.relayDesk.saveSites(nextSites.map(plainSite))
  isLibraryOpen.value = false
  editingSiteId.value = null
  draft.value = emptyDraft()
  formError.value = ''

  if (nextSite.enabled) await selectSite(nextSite.id)
  else if (activeSiteId.value) await window.relayDesk.setViewVisible(true)
}

async function removeSite(site: SiteConfig) {
  if (!window.confirm(`从 RelayDesk 移除“${site.name}”？`)) return
  const nextSites = sites.value.filter(item => item.id !== site.id)
  sites.value = await window.relayDesk.saveSites(nextSites.map(plainSite))
  if (activeSiteId.value === site.id) {
    activeSiteId.value = enabledSites.value[0]?.id ?? null
    failedSiteId.value = null
    if (activeSiteId.value) await selectSite(activeSiteId.value)
    else await window.relayDesk.activateSite(null)
  }
  if (editingSiteId.value === site.id) {
    editingSiteId.value = null
    draft.value = emptyDraft()
  }
}

async function moveSite(siteId: string, direction: -1 | 1) {
  const index = sites.value.findIndex(site => site.id === siteId)
  const targetIndex = index + direction
  if (index < 0 || targetIndex < 0 || targetIndex >= sites.value.length) return
  const nextSites = sites.value.map(plainSite)
  const [site] = nextSites.splice(index, 1)
  nextSites.splice(targetIndex, 0, site)
  sites.value = await window.relayDesk.saveSites(nextSites)
}

async function reloadActiveSite() {
  if (!activeSiteId.value) return
  failedSiteId.value = null
  await window.relayDesk.setViewVisible(true)
  await window.relayDesk.reloadSite(activeSiteId.value)
}

async function toggleSiteEnabled(site: SiteConfig) {
  const nextSites = sites.value.map(item => item.id === site.id
    ? { ...plainSite(item), enabled: !item.enabled }
    : plainSite(item))
  sites.value = await window.relayDesk.saveSites(nextSites)
  if (site.id === activeSiteId.value && site.enabled) {
    activeSiteId.value = enabledSites.value[0]?.id ?? null
    if (activeSiteId.value) await selectSite(activeSiteId.value)
    else await window.relayDesk.activateSite(null)
  }
}

onMounted(async () => {
  sites.value = await window.relayDesk.listSites()
  activeSiteId.value = enabledSites.value[0]?.id ?? null
  if (activeSiteId.value) await selectSite(activeSiteId.value)
  else await window.relayDesk.setViewVisible(false)

  stageObserver = new ResizeObserver(() => {
    void refreshViewBounds()
  })
  if (stageRef.value) stageObserver.observe(stageRef.value)

  stopStatusListener = window.relayDesk.onSiteStatus(event => {
    siteStatuses.value = { ...siteStatuses.value, [event.id]: event }
    if (event.status === 'error' && event.id === activeSiteId.value) {
      failedSiteId.value = event.id
      void window.relayDesk.setViewVisible(false)
    }
  })
  stopProtocolListener = window.relayDesk.onNativeProtocolError(message => {
    notify(`未能唤醒 cc switch：${message}`)
  })
  stopUpdateListener = window.relayDesk.onUpdateStatus(handleUpdateStatus)
})

onBeforeUnmount(() => {
  stageObserver?.disconnect()
  stopStatusListener?.()
  stopProtocolListener?.()
  stopUpdateListener?.()
})
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar" :class="{ collapsed: isSidebarCollapsed }" aria-label="站点导航">
      <header class="brand-lockup">
        <span class="brand-mark" aria-hidden="true">R</span>
        <span v-if="!isSidebarCollapsed" class="brand-name">RelayDesk</span>
        <button
          class="sidebar-toggle"
          type="button"
          :aria-expanded="!isSidebarCollapsed"
          :aria-label="isSidebarCollapsed ? '展开侧栏' : '折叠侧栏'"
          :title="isSidebarCollapsed ? '展开侧栏' : '折叠侧栏'"
          @click="isSidebarCollapsed = !isSidebarCollapsed"
        >
          {{ isSidebarCollapsed ? '›' : '‹' }}
        </button>
      </header>

      <div class="sidebar-command">
        <button class="add-site-button" type="button" title="添加站点" @click="startAdd">
          <span aria-hidden="true">+</span>
          <span v-if="!isSidebarCollapsed">添加站点</span>
        </button>
      </div>

      <nav class="site-list" aria-label="已配置站点">
        <button
          v-for="site in sites"
          :key="site.id"
          class="site-row"
          :class="{ active: site.id === activeSiteId, disabled: !site.enabled }"
          type="button"
          :title="isSidebarCollapsed ? `${site.name}（右键删除）` : '右键删除站点'"
          :disabled="!site.enabled"
          @click="selectSite(site.id)"
          @contextmenu.prevent.stop="removeSite(site)"
        >
          <span class="site-glyph" aria-hidden="true">{{ site.icon || DEFAULT_SITE_ICON }}</span>
          <span v-if="!isSidebarCollapsed" class="site-copy">
            <span class="site-name">{{ site.name }}</span>
            <span class="site-origin">{{ siteOrigin(site.url) }}</span>
          </span>
          <span v-if="!isSidebarCollapsed" class="site-status" :class="siteStatuses[site.id]?.status ?? 'idle'">
            <span class="status-dot" aria-hidden="true"></span>
            <span class="visually-hidden">{{ statusLabel(site) }}</span>
          </span>
        </button>
      </nav>

      <footer class="sidebar-footer">
        <button class="text-command" type="button" title="管理站点" @click="openLibrary">
          <span aria-hidden="true">☷</span>
          <span v-if="!isSidebarCollapsed">管理站点</span>
        </button>
        <span v-if="!isSidebarCollapsed">{{ sites.length }} 个站点</span>
      </footer>
    </aside>

    <section class="workspace">
      <header class="workspace-bar">
        <div class="active-context">
          <span class="active-indicator" :class="activeStatus?.status ?? 'idle'"></span>
          <div>
            <p class="eyebrow">当前工作区</p>
            <h1>{{ activeSite?.name ?? '站点工作区' }}</h1>
          </div>
        </div>
        <div class="toolbar">
          <button
            class="icon-button update-button"
            :class="{ ready: updateStatus.status === 'downloaded' }"
            type="button"
            :title="updateButtonTitle()"
            :aria-label="updateButtonTitle()"
            :disabled="updateStatus.status === 'checking' || updateStatus.status === 'downloading'"
            @click="handleUpdateAction"
          >
            {{ updateStatus.status === 'downloaded' ? '↻' : '↓' }}
          </button>
          <button class="icon-button" type="button" title="刷新当前站点" aria-label="刷新当前站点" :disabled="!activeSite" @click="reloadActiveSite">↻</button>
          <button class="icon-button" type="button" title="管理站点" aria-label="管理站点" @click="openLibrary">☷</button>
        </div>
      </header>

      <main ref="stageRef" class="site-stage">
        <section v-if="isLibraryOpen" class="site-library" aria-labelledby="library-title">
          <header class="library-header">
            <div>
              <p class="eyebrow">站点目录</p>
              <h2 id="library-title">{{ editingSiteId ? '编辑站点' : '添加站点' }}</h2>
            </div>
            <button class="close-button" type="button" aria-label="关闭站点管理" title="关闭站点管理" @click="closeLibrary">×</button>
          </header>

          <form class="site-form" @submit.prevent="saveSite">
            <label>
              <span>名称</span>
              <input v-model="draft.name" maxlength="80" autocomplete="off" placeholder="例如：主中转站" />
            </label>
            <label>
              <span>网址</span>
              <input v-model="draft.url" inputmode="url" autocomplete="url" placeholder="https://..." />
            </label>
            <label class="icon-field">
              <span>标记</span>
              <input v-model="draft.icon" maxlength="4" autocomplete="off" />
            </label>
            <label class="switch-row">
              <input v-model="draft.enabled" type="checkbox" />
              <span>显示在工作区</span>
            </label>
            <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
            <div class="form-actions">
              <button class="secondary-button" type="button" @click="closeLibrary">取消</button>
              <button class="primary-button" type="submit">{{ editingSiteId ? '保存修改' : '添加站点' }}</button>
            </div>
          </form>

          <div v-if="sites.length" class="saved-sites" aria-label="站点排序和管理">
            <p class="section-label">已保存</p>
            <article v-for="(site, index) in sites" :key="site.id" class="saved-site-row">
              <span class="saved-index">{{ String(index + 1).padStart(2, '0') }}</span>
              <div class="saved-site-copy">
                <strong>{{ site.name }}</strong>
                <span>{{ siteOrigin(site.url) }}</span>
              </div>
              <div class="saved-site-actions">
                <button type="button" title="上移" aria-label="上移" :disabled="index === 0" @click="moveSite(site.id, -1)">↑</button>
                <button type="button" title="下移" aria-label="下移" :disabled="index === sites.length - 1" @click="moveSite(site.id, 1)">↓</button>
                <button type="button" title="编辑" aria-label="编辑" @click="startEdit(site)">✎</button>
                <button type="button" :title="site.enabled ? '隐藏' : '显示'" :aria-label="site.enabled ? '隐藏' : '显示'" @click="toggleSiteEnabled(site)">{{ site.enabled ? '◉' : '○' }}</button>
                <button class="danger-button" type="button" title="移除" aria-label="移除" @click="removeSite(site)">×</button>
              </div>
            </article>
          </div>
        </section>

        <section v-else-if="showWorkspaceFallback" class="workspace-fallback">
          <div v-if="!sites.length" class="empty-state">
            <span class="empty-mark" aria-hidden="true">R</span>
            <p class="eyebrow">开始设置</p>
            <h2>把常用中转站放进一个窗口。</h2>
            <button class="primary-button" type="button" @click="startAdd">添加第一个站点</button>
          </div>
          <div v-else class="error-state">
            <p class="eyebrow">连接状态</p>
            <h2>这个站点暂时没有打开。</h2>
            <p>{{ activeStatus?.message || '检查网络或站点地址后重试。' }}</p>
            <div class="error-actions">
              <button class="primary-button" type="button" @click="reloadActiveSite">重新加载</button>
              <button class="secondary-button" type="button" @click="activeSite && startEdit(activeSite)">检查地址</button>
            </div>
          </div>
        </section>
      </main>
    </section>

    <p v-if="toast" class="toast" role="status">{{ toast }}</p>
  </div>
</template>
