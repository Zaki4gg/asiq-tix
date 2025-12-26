<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  max: { type: Number, default: 20 },
  initial: { type: Number, default: 1 },
  title: { type: String, default: 'Pilih jumlah tiket' }
})

const emit = defineEmits(['close', 'confirm'])

const maxSafe = computed(() => Math.max(1, Number(props.max || 1)))

function clamp(v) {
  const n = Number.parseInt(String(v), 10)
  if (!Number.isFinite(n)) return 1
  return Math.min(Math.max(1, n), maxSafe.value)
}

const qty = ref(1)

watch(
  () => props.open,
  (v) => {
    if (v) qty.value = clamp(props.initial)
  }
)

watch(
  () => props.max,
  () => {
    qty.value = clamp(qty.value)
  }
)

const canMinus = computed(() => qty.value > 1)
const canPlus = computed(() => qty.value < maxSafe.value)

function minus() {
  if (canMinus.value) qty.value -= 1
}
function plus() {
  if (canPlus.value) qty.value += 1
}

function onInput(e) {
  qty.value = clamp(e.target.value)
}

function close() {
  emit('close')
}

function confirm() {
  emit('confirm', qty.value)
}
</script>

<template>
  <div v-if="open" class="modal-backdrop" @click.self="close">
    <div class="modal">
      <div class="card">
        <header class="head">
          <h2>{{ title }}</h2>
          <p class="sub">Masukkan jumlah tiket yang ingin dibeli.</p>
        </header>

        <div class="body">
          <div class="qty-row">
            <button class="step" type="button" :disabled="!canMinus" @click="minus">−</button>

            <input
              class="qty"
              type="number"
              inputmode="numeric"
              min="1"
              :max="maxSafe"
              :value="qty"
              @input="onInput"
              @keydown.enter.prevent="confirm"
            />

            <button class="step" type="button" :disabled="!canPlus" @click="plus">+</button>
          </div>

          <p class="hint">Maksimum: <strong>{{ maxSafe }}</strong> tiket per transaksi.</p>
        </div>

        <footer class="foot">
          <button class="btn ghost" type="button" @click="close">Batal</button>
          <button class="btn primary" type="button" @click="confirm">Lanjutkan</button>
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(4, 6, 16, 0.78);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2200;
}
.modal {
  max-width: 420px;
  width: 92%;
}
.card {
  background: #0b1020;
  border-radius: 18px;
  border: 1px solid #252b3b;
  box-shadow: 0 18px 45px rgba(0, 0, 0, 0.6);
  padding: 16px;
  color: #e9edf7;
}
.head h2 {
  font-size: 1.05rem;
  margin: 0;
}
.sub {
  margin: 6px 0 0;
  font-size: 0.85rem;
  color: #9aa4c6;
}
.body {
  margin-top: 14px;
}
.qty-row {
  display: grid;
  grid-template-columns: 44px 1fr 44px;
  gap: 10px;
  align-items: center;
}
.qty {
  width: 100%;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid #394158;
  background: #0a0f1e;
  color: #e9edf7;
  font-size: 1rem;
  text-align: center;
  outline: none;
}
.step {
  height: 44px;
  border-radius: 12px;
  border: 1px solid #394158;
  background: transparent;
  color: #e9edf7;
  font-size: 1.2rem;
  cursor: pointer;
}
.step:disabled {
  opacity: 0.5;
  cursor: default;
}
.hint {
  margin: 10px 0 0;
  font-size: 0.85rem;
  color: #9aa4c6;
}
.foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.btn {
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 0.85rem;
  border: 1px solid transparent;
  cursor: pointer;
}
.btn.primary {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}
.btn.ghost {
  background: transparent;
  border-color: #394158;
  color: #e9edf7;
}
</style>
