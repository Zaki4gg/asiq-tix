<template>
  <div v-if="open" class="modal" @click.self="emitClose">
    <div class="modal-card">
      <button class="modal-x" aria-label="Close" @click="emitClose">×</button>
      <h3 class="title">{{ isEdit ? 'Edit Event' : 'Create Event' }}</h3>
      <form class="form" @submit.prevent="onSubmit">
        <div class="scroll">
          <div class="field">
            <label>Judul</label>
            <input v-model.trim="form.title" required placeholder="Judul event" />
          </div>
          <div class="field">
            <label>Tanggal & Waktu</label>
            <input type="datetime-local" v-model="form.date_local" step="60" required />
            <small>Disimpan sebagai UTC (timestamptz) di backend</small>
          </div>
          <div class="field">
            <label>Venue</label>
            <input v-model.trim="form.venue" required placeholder="Lokasi/venue" />
          </div>
          <div class="field">
            <label>Deskripsi</label>
            <textarea v-model.trim="form.description" rows="4" placeholder="Deskripsi singkat"></textarea>
          </div>
          <div class="row">
            <div class="field">
              <label>Harga (POL)</label>
              <input type="number" step="0.000001" min="0" v-model.number="form.price_pol" required />
            </div>
            <div class="field">
              <label>Total Tiket</label>
              <input type="number" min="0" v-model.number="form.total_tickets" required />
            </div>
            <div class="field chk">
              <label><input type="checkbox" v-model="form.listed" /> Publikasikan (listed)</label>
            </div>
          </div>
          <div class="field">
            <label>Poster (opsional)</label>
            <input type="file" accept="image/*" @change="onPickFile" />
            <small v-if="imageName">Dipilih: {{ imageName }}</small>
            <div v-if="previewUrl || form.image_url" class="img-preview" :style="{ backgroundImage: `url(${previewUrl || form.image_url})` }"></div>
          </div>
          <p v-if="status" :class="['status', statusType]">{{ status }}</p>
        </div>
        <div class="actions-bar">
          <button type="button" class="btn ghost" @click="emitClose">Cancel</button>
          <button type="submit" class="btn primary" :disabled="submitting">
            <span v-if="submitting">⏳ {{ isEdit ? 'Updating…' : 'Creating…' }}</span>
            <span v-else>{{ isEdit ? 'Save' : 'Create' }}</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'

type EventRow = {
  id?: string
  title: string
  date_iso: string
  venue: string
  description?: string
  image_url?: string | null
  price_pol: number
  total_tickets: number
  listed: boolean
}

const props = defineProps<{
  open: boolean
  initial?: Partial<EventRow> | null
  mode?: 'create' | 'edit'
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created', row: EventRow): void
  (e: 'updated', row: EventRow): void
}>()

const isEdit = computed(() => (props.mode || 'create') === 'edit')

const API_BASE = (import.meta.env?.VITE_API_BASE || 'http://localhost:3001').replace(/\/+$/,'')
function walletAddr(): string {
  return (localStorage.getItem('walletAddress') || '').toLowerCase()
}
async function api(path: string, init?: RequestInit) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`
  const headers: Record<string, string> = { ...(init?.headers as any || {}), 'x-wallet-address': walletAddr() }
  if (init?.body && !(init?.body instanceof FormData)) headers['Content-Type'] = headers['Content-Type'] || 'application/json'
  const res = await fetch(url, { ...init, headers })
  const text = await res.text().catch(()=>'')
  const data = text ? (()=>{ try { return JSON.parse(text) } catch { return { message: text } } })() : {}
  if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`)
  return data
}
function toUtcIsoFromLocal(local: string): string {
  const d = new Date(local)
  if (isNaN(d.getTime())) throw new Error('Tanggal tidak valid')
  return d.toISOString()
}
function toLocalInputFromIso(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2,'0')
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

const form = ref({
  title: '',
  date_local: '',
  venue: '',
  description: '',
  price_pol: 0,
  total_tickets: 0,
  listed: true,
  image_url: '' as string | null
})

const imageFile = ref<File | null>(null)
const imageName = ref('')
const previewUrl = ref('')
const submitting = ref(false)
const status = ref('')
const statusType = ref<'success'|'error'|''>('')

function setStatus(msg: string, type: 'success'|'error'|'') {
  status.value = msg
  statusType.value = type
  setTimeout(()=>{ status.value=''; statusType.value='' }, 4000)
}
function resetFilePreview() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
  imageFile.value = null
  imageName.value = ''
}
function hydrateFromInitial() {
  const init = props.initial || {}
  form.value.title = init.title || ''
  form.value.date_local = toLocalInputFromIso(init.date_iso)
  form.value.venue = init.venue || ''
  form.value.description = init.description || ''
  form.value.price_pol = Number(init.price_pol || 0)
  form.value.total_tickets = Number(init.total_tickets || 0)
  form.value.listed = init.listed ?? true
  form.value.image_url = (init.image_url as any) || ''
  resetFilePreview()
}
watch(() => props.open, (v) => { if (v) hydrateFromInitial() })
watch(() => props.initial, () => { if (props.open) hydrateFromInitial() })

function onPickFile(e: Event) {
  const f = (e.target as HTMLInputElement)?.files?.[0] || null
  imageFile.value = f
  imageName.value = f?.name || ''
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = f ? URL.createObjectURL(f) : ''
}
function emitClose() {
  resetFilePreview()
  emit('close')
}
async function uploadImageIfAny(): Promise<string | null> {
  if (!imageFile.value) return form.value.image_url || null
  const fd = new FormData()
  fd.append('file', imageFile.value)
  const up = await api('/api/upload', { method: 'POST', body: fd })
  const url = up?.url
  if (!url || !/^https?:\/\//i.test(url)) throw new Error('Upload gagal: URL tidak valid dari server')
  return url
}
async function onSubmit() {
  if (!form.value.title || !form.value.date_local || !form.value.venue) {
    setStatus('Lengkapi minimal judul, tanggal, dan venue.', 'error'); return
  }
  submitting.value = true
  try {
    const image_url = await uploadImageIfAny()
    const payload = {
      title: form.value.title,
      date_iso: toUtcIsoFromLocal(form.value.date_local),
      venue: form.value.venue,
      description: form.value.description || '',
      image_url: image_url || null,
      price_pol: Number(form.value.price_pol) || 0,
      total_tickets: Number(form.value.total_tickets) || 0,
      listed: !!form.value.listed
    }
    if (isEdit.value) {
      const id = (props.initial?.id as string) || ''
      if (!id) throw new Error('ID event tidak ditemukan.')
      const row = await api(`/api/events/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
      setStatus('Event berhasil diperbarui.', 'success')
      emit('updated', row)
    } else {
      const row = await api('/api/events', { method: 'POST', body: JSON.stringify(payload) })
      setStatus('Event berhasil dibuat.', 'success')
      emit('created', row)
      form.value = { title:'', date_local:'', venue:'', description:'', price_pol:0, total_tickets:0, listed:true, image_url:'' }
      resetFilePreview()
    }
    setTimeout(emitClose, 300)
  } catch (e: any) {
    setStatus(String(e?.message || e), 'error')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.modal{
  position: fixed; inset: 0; background: rgba(0,0,0,.45);
  z-index: 1400; display:grid; place-items:center; padding: 16px;
  overflow: hidden;
}
.modal-card{
  position: relative;
  width: 100%; max-width: 620px;
  background:#F4F1DE; color:#232747;
  border: 1px solid #232747; border-radius: 14px; padding: 16px 16px 0;
  box-shadow: 0 18px 40px rgba(0,0,0,.45);
  display: flex; flex-direction: column;
  max-height: 86vh;
  overflow: hidden;
}
.title{ margin: 0 0 12px; font-weight: 800; color:#232747 }
.modal-x{
  position: absolute; top: 10px; right: 10px;
  width: 36px; height: 36px; border-radius: 10px;
  border: 1px solid #232747; background: #232747; color:#F4F1DE;
  font-size: 22px; line-height: 0; cursor: pointer;
}

.form{ display:flex; flex-direction:column; flex:1 1 auto; min-height:0 }
.scroll{ flex:1 1 auto; min-height:0; overflow:auto; padding-right:4px; padding-bottom:96px }
.field{ display:flex; flex-direction:column; gap:6px; color:#232747 }
.field.chk{ justify-content:flex-end }
.field input[type="text"],
.field input[type="datetime-local"],
.field input[type="number"],
.field textarea{ background:#ffffff; color:#232747; border:1px solid #232747; border-radius:10px; padding:10px 12px; outline:none }
.field input[type="file"]{ padding:10px; background:#ffffff; color:#232747; border:1px dashed #232747; border-radius:10px }
.img-preview{ width:100%; height:180px; background-size:cover; background-position:center; border-radius:12px; border:1px solid #232747 }

.status{ margin-top:6px; padding:8px 10px; border-radius:8px; border:1px solid transparent; font-size:14px }
.status.success{ background:#e8f7ee; color:#0e6a3b; border-color:#c9eed9 }
.status.error{ background:#fdecea; color:#9f3a38; border-color:#f5c6cb }

.actions-bar{
  position: absolute; left: 0; right: 0; bottom: 0;
  display:flex; justify-content:flex-end; gap:10px;
  padding:12px 16px 14px;
  background:#F4F1DE;
  border-top: 1px solid #232747;
  z-index: 10;
}
.btn{ padding:10px 14px; border-radius: 10px; border:1px solid transparent; cursor:pointer }
.btn.ghost{ background:#F4F1DE; color:#232747; border:1px solid #232747 }
.btn.primary{ background:#232747; color:#F4F1DE; border:1px solid #232747 }

.row{ display:grid; grid-template-columns: 1fr 1fr auto; gap:12px }
</style>

