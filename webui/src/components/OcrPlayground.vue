<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

const fileInput = ref(null)
const previewUrl = ref('')
const fileName = ref('')
const imageB64 = ref('')
const pngFix = ref(false)
const probability = ref(false)
const loading = ref(false)
const dragging = ref(false)
const result = ref(null)
const error = ref('')

// 递增请求序号：旧请求的响应返回时若序号已过期就丢弃，避免覆盖新结果
let requestSeq = 0

function resetPreview() {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
  }
  previewUrl.value = ''
}

function invalidateRequest() {
  requestSeq += 1
  loading.value = false
}

function handleFile(file) {
  if (!file) return
  if (!file.type.startsWith('image/')) {
    // 非图片文件：清空预览与结果，只保留提示
    resetPreview()
    fileName.value = ''
    imageB64.value = ''
    result.value = null
    invalidateRequest()
    error.value = '请选择图片文件 (PNG / JPG / WEBP ...)'
    return
  }
  invalidateRequest()
  error.value = ''
  result.value = null
  resetPreview()
  previewUrl.value = URL.createObjectURL(file)
  fileName.value = file.name || 'pasted-image'
  imageB64.value = ''

  const seq = requestSeq
  const reader = new FileReader()
  reader.onload = () => {
    if (seq !== requestSeq) return
    const dataUrl = String(reader.result || '')
    const comma = dataUrl.indexOf(',')
    imageB64.value = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  }
  reader.onerror = () => {
    if (seq !== requestSeq) return
    error.value = '读取图片失败'
  }
  reader.readAsDataURL(file)
}

function openPicker() {
  fileInput.value?.click()
}

function onFileChange(event) {
  const file = event.target.files?.[0]
  if (file) handleFile(file)
  event.target.value = ''
}

function onDragOver() {
  dragging.value = true
}

function onDragLeave() {
  dragging.value = false
}

function onDrop(event) {
  // 同時阻止冒泡與預設行為，避免外層點擊處理或瀏覽器直接開啟檔案
  event.preventDefault()
  event.stopPropagation()
  dragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) handleFile(file)
}

function onPaste(event) {
  let file = null
  const files = event.clipboardData?.files
  if (files && files.length > 0) {
    file = files[0]
  }
  if (!file && event.clipboardData?.items) {
    for (const item of event.clipboardData.items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        file = item.getAsFile()
        break
      }
    }
  }
  if (file) {
    event.preventDefault()
    handleFile(file)
  }
}

function clearAll() {
  invalidateRequest()
  resetPreview()
  fileName.value = ''
  imageB64.value = ''
  result.value = null
  error.value = ''
}

async function recognize() {
  if (!imageB64.value) {
    error.value = '请先选择或粘贴一张图片'
    return
  }
  const seq = ++requestSeq
  loading.value = true
  error.value = ''
  result.value = null
  try {
    const response = await fetch('/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: imageB64.value,
        png_fix: pngFix.value,
        probability: probability.value,
      }),
    })
    if (seq !== requestSeq) return
    // 先取原始文本再自行解析，避免非 JSON 响应（如 5xx HTML）直接抛出解析异常
    const raw = await response.text()
    let payload = null
    if (raw) {
      try {
        payload = JSON.parse(raw)
      } catch {
        throw new Error(`响应不是合法 JSON (HTTP ${response.status})`)
      }
    }
    if (seq !== requestSeq) return
    if (!response.ok || !payload || payload.code !== 200) {
      error.value = payload?.msg || `请求失败 (HTTP ${response.status})`
      return
    }
    result.value = payload.data
  } catch (err) {
    if (seq !== requestSeq) return
    error.value = `请求失败：${err instanceof Error ? err.message : String(err)}`
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

function formatProbability(value) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

onMounted(() => {
  window.addEventListener('paste', onPaste)
})

onBeforeUnmount(() => {
  window.removeEventListener('paste', onPaste)
  invalidateRequest()
  resetPreview()
})
</script>

<template>
  <section id="playground" class="py-16 sm:py-20 bg-white border-y border-gray-200">
    <div class="max-w-6xl mx-auto px-4 sm:px-6">
      <h2 class="text-2xl sm:text-3xl font-bold text-center text-gray-900 mb-4">在线识别</h2>
      <p class="text-center text-gray-600 mb-12 max-w-2xl mx-auto">
        拖放、点选或直接按 <kbd class="px-1.5 py-0.5 rounded border border-gray-300 bg-gray-50 text-xs font-mono">Ctrl</kbd>
        + <kbd class="px-1.5 py-0.5 rounded border border-gray-300 bg-gray-50 text-xs font-mono">V</kbd>
        粘贴验证码，即时调用 <code class="font-mono text-sm bg-gray-100 px-1 rounded">POST /ocr</code> 识别
      </p>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- 上传 / 预览 -->
        <div>
          <div
            class="relative rounded-xl border-2 border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center text-center p-8 min-h-[260px]"
            :class="dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50/50'"
            @click="openPicker"
            @dragover.prevent="onDragOver"
            @dragenter.prevent="onDragOver"
            @dragleave.prevent="onDragLeave"
            @drop.prevent="onDrop"
          >
            <input ref="fileInput" type="file" accept="image/*" class="hidden" @click.stop @change="onFileChange" />

            <template v-if="previewUrl">
              <img :src="previewUrl" :alt="fileName" class="max-h-56 max-w-full rounded-lg shadow-sm bg-white object-contain" />
              <p class="mt-3 text-xs text-gray-500 break-all">{{ fileName }}</p>
            </template>
            <template v-else>
              <i class="ri-image-add-line text-5xl text-blue-500"></i>
              <p class="mt-4 font-medium text-gray-700">拖放图片到这里，或点击选择文件</p>
              <p class="mt-1 text-sm text-gray-500">也可以直接粘贴剪贴板中的图片</p>
            </template>
          </div>

          <div class="mt-4 flex flex-wrap items-center gap-4">
            <label class="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input v-model="pngFix" type="checkbox" class="w-4 h-4 accent-blue-600" />
              png_fix
            </label>
            <label class="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input v-model="probability" type="checkbox" class="w-4 h-4 accent-blue-600" />
              probability
            </label>
          </div>

          <div class="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              class="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white font-medium shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              :disabled="loading || !imageB64"
              @click="recognize"
            >
              <i :class="loading ? 'ri-loader-4-line animate-spin' : 'ri-scan-2-line'"></i>
              {{ loading ? '识别中…' : '识别' }}
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white text-gray-700 font-medium border border-gray-300 shadow-sm hover:bg-gray-50 transition-colors"
              @click="clearAll"
            >
              <i class="ri-delete-bin-line"></i>
              清除
            </button>
          </div>
        </div>

        <!-- 结果 -->
        <div class="rounded-xl border border-gray-200 bg-gray-50 p-6 min-h-[260px] flex flex-col">
          <div class="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            <i class="ri-file-text-line text-base"></i>
            识别结果
          </div>

          <div v-if="error" class="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-3">
            <i class="ri-error-warning-line text-lg shrink-0"></i>
            <span class="break-all">{{ error }}</span>
          </div>

          <div v-else-if="loading" class="flex-1 flex flex-col items-center justify-center text-gray-500">
            <i class="ri-loader-4-line text-3xl animate-spin"></i>
            <p class="mt-3 text-sm">正在识别…</p>
          </div>

          <div v-else-if="result" class="flex-1">
            <p class="text-3xl sm:text-4xl font-bold font-mono text-gray-900 break-all">{{ result.text }}</p>
            <div v-if="probability && result.probability" class="mt-6">
              <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">probability</p>
              <pre class="bg-gray-900 text-green-400 rounded-lg p-3 overflow-x-auto text-xs leading-relaxed max-h-52">{{ formatProbability(result.probability) }}</pre>
            </div>
          </div>

          <div v-else class="flex-1 flex flex-col items-center justify-center text-gray-400">
            <i class="ri-timer-line text-3xl"></i>
            <p class="mt-3 text-sm">上传图片后点击「识别」</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
