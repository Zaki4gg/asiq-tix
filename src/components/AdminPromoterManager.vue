<script setup>
import { ref, computed, onMounted } from 'vue'
import { ethers } from 'ethers'
import { useMetamask } from '@/composables/useMetamask'
import { ASIQTIX_TICKETS_ABI } from '@/abi/asiqtixTicketsSimpleV3'

const { account, connect, ensureChain } = useMetamask()

const CONTRACT_ADDRESS = import.meta.env.VITE_TICKETS_CONTRACT || ''
const AMOY_RPC = import.meta.env.VITE_POLYGON_AMOY_RPC || 'https://rpc-amoy.polygon.technology'
const EXPLORER_BASE = 'https://amoy.polygonscan.com'

// ---- state
const inputAddr = ref('')
const normalizedAddr = ref('')
const status = ref(null) // null | boolean
const owner = ref('')

const loadingOwner = ref(false)
const loadingCheck = ref(false)
const loadingWrite = ref(false)

const err = ref('')
const info = ref('')
const txHash = ref('')

// ---- computed links
const addrLink = computed(() =>
  normalizedAddr.value ? `${EXPLORER_BASE}/address/${normalizedAddr.value}` : ''
)
const contractLink = computed(() =>
  CONTRACT_ADDRESS ? `${EXPLORER_BASE}/address/${CONTRACT_ADDRESS}` : ''
)
const ownerLink = computed(() =>
  owner.value ? `${EXPLORER_BASE}/address/${owner.value}` : ''
)
const txLink = computed(() => (txHash.value ? `${EXPLORER_BASE}/tx/${txHash.value}` : ''))

const isOwnerWallet = computed(() => {
  if (!owner.value || !account.value) return false
  return owner.value.toLowerCase() === account.value.toLowerCase()
})

function normalizeAddress (v) {
  const s = String(v || '').trim()
  if (!s) return ''
  try {
    return ethers.getAddress(s)
  } catch {
    return ''
  }
}

let _readProvider
function readProvider () {
  if (_readProvider) return _readProvider
  _readProvider = new ethers.JsonRpcProvider(AMOY_RPC)
  return _readProvider
}
function readContract () {
  if (!CONTRACT_ADDRESS) throw new Error('VITE_TICKETS_CONTRACT belum diset (.env).')
  return new ethers.Contract(CONTRACT_ADDRESS, ASIQTIX_TICKETS_ABI, readProvider())
}

async function loadOwner () {
  err.value = ''
  owner.value = ''
  if (!CONTRACT_ADDRESS) {
    err.value = 'Alamat kontrak (VITE_TICKETS_CONTRACT) belum dikonfigurasi.'
    return
  }
  loadingOwner.value = true
  try {
    const c = readContract()
    owner.value = await c.owner()
  } catch (e) {
    console.error(e)
    err.value = e?.reason || e?.message || 'Gagal mengambil owner kontrak.'
  } finally {
    loadingOwner.value = false
  }
}

async function checkStatus () {
  err.value = ''
  info.value = ''
  txHash.value = ''
  status.value = null

  const addr = normalizeAddress(inputAddr.value)
  normalizedAddr.value = addr

  if (!addr) {
    err.value = 'Alamat wallet tidak valid.'
    return
  }

  loadingCheck.value = true
  try {
    const c = readContract()
    const ok = await c.isPromoter(addr)
    status.value = !!ok
  } catch (e) {
    console.error(e)
    err.value = e?.reason || e?.message || 'Gagal mengecek status promotor.'
  } finally {
    loadingCheck.value = false
  }
}

async function setPromoter (active) {
  err.value = ''
  info.value = ''
  txHash.value = ''

  const addr = normalizeAddress(inputAddr.value)
  normalizedAddr.value = addr
  if (!addr) {
    err.value = 'Alamat wallet tidak valid.'
    return
  }
  if (!window?.ethereum) {
    err.value = 'MetaMask tidak terdeteksi. Untuk write contract Anda harus memakai MetaMask.'
    return
  }
  if (!CONTRACT_ADDRESS) {
    err.value = 'Alamat kontrak (VITE_TICKETS_CONTRACT) belum dikonfigurasi.'
    return
  }

  const actionLabel = active ? 'Add Promoter' : 'Remove Promoter'
  const ok = window.confirm(
    `${actionLabel}\n\nTarget:\n${addr}\n\nLanjutkan transaksi di MetaMask?`
  )
  if (!ok) return

  loadingWrite.value = true
  try {
    // pastikan wallet connect
    if (!account.value) await connect()

    // pastikan chain amoy
    await ensureChain('amoy')

    const provider = new ethers.BrowserProvider(window.ethereum)
    const signer = await provider.getSigner()
    const c = new ethers.Contract(CONTRACT_ADDRESS, ASIQTIX_TICKETS_ABI, signer)

    const tx = await c.setPromoter(addr, !!active)
    txHash.value = tx.hash
    info.value = 'Transaksi terkirim. Menunggu konfirmasi…'
    await tx.wait()
    info.value = 'Sukses. Status promotor sudah diperbarui.'

    await checkStatus()
  } catch (e) {
    console.error(e)
    err.value = e?.reason || e?.shortMessage || e?.message || 'Transaksi gagal.'
  } finally {
    loadingWrite.value = false
  }
}

onMounted(() => {
  loadOwner()
})
</script>

<template>
  <section class="pm-wrap">
    <header class="pm-head">
      <h2>Manajemen Promotor (On-chain)</h2>
      <button class="pm-btn pm-ghost" @click="loadOwner" :disabled="loadingOwner">
        {{ loadingOwner ? 'Loading…' : 'Reload Owner' }}
      </button>
    </header>

    <div class="pm-meta">
      <div class="pm-row" v-if="CONTRACT_ADDRESS">
        <span class="pm-k">Contract</span>
        <a class="pm-mono pm-link" :href="contractLink" target="_blank" rel="noreferrer">
          {{ CONTRACT_ADDRESS }}
        </a>
      </div>

      <div class="pm-row" v-if="owner">
        <span class="pm-k">Owner</span>
        <a class="pm-mono pm-link" :href="ownerLink" target="_blank" rel="noreferrer">
          {{ owner }}
        </a>
        <span class="pm-pill" :class="isOwnerWallet ? 'pm-green' : 'pm-gray'">
          {{ isOwnerWallet ? 'Wallet = Owner' : 'Wallet ≠ Owner' }}
        </span>
      </div>

      <p class="pm-hint" v-if="owner && !isOwnerWallet">
        Catatan: <span class="pm-mono">setPromoter</span> biasanya hanya bisa dipanggil oleh
        <span class="pm-mono">owner</span>. Jika wallet Anda bukan owner, transaksi kemungkinan
        <span class="pm-mono">revert</span>.
      </p>
    </div>

    <div class="pm-form">
      <label class="pm-lbl">Wallet Address</label>
      <input
        v-model="inputAddr"
        class="pm-inp pm-mono"
        placeholder="0x..."
        autocomplete="off"
        spellcheck="false"
      />

      <div class="pm-actions">
        <button class="pm-btn pm-primary" @click="checkStatus" :disabled="loadingCheck">
          {{ loadingCheck ? 'Checking…' : 'Check (Read)' }}
        </button>

        <button class="pm-btn pm-primary" @click="setPromoter(true)" :disabled="loadingWrite">
          {{ loadingWrite ? 'Processing…' : 'Add Promoter (Write)' }}
        </button>

        <button class="pm-btn pm-ghost" @click="setPromoter(false)" :disabled="loadingWrite">
          Remove Promoter (Write)
        </button>
      </div>

      <p v-if="err" class="pm-err">{{ err }}</p>
      <p v-if="info" class="pm-ok">{{ info }}</p>

      <div v-if="normalizedAddr" class="pm-result">
        <div class="pm-row">
          <span class="pm-k">Address</span>
          <a class="pm-mono pm-link" :href="addrLink" target="_blank" rel="noreferrer">
            {{ normalizedAddr }}
          </a>
        </div>

        <div class="pm-row" v-if="status !== null">
          <span class="pm-k">Status</span>
          <span class="pm-pill" :class="status ? 'pm-green' : 'pm-gray'">
            {{ status ? 'PROMOTOR' : 'BUKAN PROMOTOR' }}
          </span>
        </div>

        <div class="pm-row" v-if="txHash">
          <span class="pm-k">Tx</span>
          <a class="pm-mono pm-link" :href="txLink" target="_blank" rel="noreferrer">
            {{ txHash }}
          </a>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.pm-wrap {
  background: rgba(15, 19, 27, 0.92);
  border-radius: 18px;
  border: 1px solid rgba(255,255,255,0.10);
  padding: 16px 18px;
}

.pm-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.pm-meta { display: grid; gap: 8px; margin: 8px 0 14px; }
.pm-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }

.pm-k { width: 76px; color: rgba(255,255,255,0.65); font-size: 12px; }
.pm-link { color: inherit; text-decoration: underline; opacity: 0.95; }

.pm-hint { margin: 6px 0 0; color: rgba(255,255,255,0.65); font-size: 12px; line-height: 1.35; }

.pm-form { display: grid; gap: 10px; }
.pm-lbl { font-size: 12px; color: rgba(255,255,255,0.65); }

.pm-inp {
  width: 100%;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(0,0,0,0.18);
  padding: 10px 12px;
  color: rgba(255,255,255,0.92);
  outline: none;
}
.pm-inp:focus { border-color: rgba(255,255,255,0.22); }

.pm-actions { display: flex; flex-wrap: wrap; gap: 10px; }

.pm-btn {
  border: 0;
  border-radius: 12px;
  padding: 10px 12px;
  font-weight: 700;
  cursor: pointer;
}
.pm-btn:disabled { opacity: 0.55; cursor: not-allowed; }

.pm-primary { background: #f4f1de; color: #0f131b; }
.pm-ghost {
  background: rgba(244, 241, 222, 0.18);
  color: #f4f1de;
  border: 1px solid rgba(244, 241, 222, 0.25);
}

.pm-ok { color: #bbf7d0; font-size: 14px; margin: 0; }
.pm-err { color: #fecaca; font-size: 14px; margin: 0; }

.pm-result { margin-top: 4px; display: grid; gap: 10px; }

.pm-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.pm-green { background: rgba(34, 197, 94, 0.12); color: #bbf7d0; }
.pm-gray { background: rgba(148, 163, 184, 0.16); color: #e5e7eb; }

.pm-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 11px;
}
</style>
