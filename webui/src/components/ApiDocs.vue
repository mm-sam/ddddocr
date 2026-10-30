<script setup>
import { ref } from 'vue'

const copiedKey = ref('')
let copyTimer = null

async function copyCode(key, text) {
  try {
    await navigator.clipboard.writeText(text)
    copiedKey.value = key
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => {
      copiedKey.value = ''
    }, 1500)
  } catch {
    copiedKey.value = ''
  }
}

const parameters = [
  {
    name: 'image',
    type: 'string',
    required: true,
    description: '要识别的图片，base64 编码（不要加 data:image/png;base64, 前缀）',
  },
  { name: 'png_fix', type: 'bool', required: false, description: '为 true 时支持透明黑色背景的 PNG 图片' },
  { name: 'probability', type: 'bool', required: false, description: '是否返回概率信息' },
  { name: 'length', type: 'number', required: false, description: '期望的字符数，超过时丢弃峰值概率最低的片段' },
  { name: 'charset_range', type: 'string', required: false, description: '限定字符范围。0-7 对应内建字符集，其他值为自定义字符集' },
  {
    name: 'color_filter',
    type: 'string / array',
    required: false,
    description: '颜色过滤，例如 "red" 或 ["red", "blue"] 或 HSV 范围',
  },
]

const examples = [
  {
    key: 'basic',
    title: '基础调用',
    code: 'curl -X POST "http://127.0.0.1:8000/ocr" \\\n     -H "Content-Type: application/json" \\\n     -d \'{"image": "iVBORw0KGgoAAAANS..."}\'',
  },
  {
    key: 'color',
    title: '带颜色过滤',
    code: 'curl -X POST "http://127.0.0.1:8000/ocr" \\\n     -H "Content-Type: application/json" \\\n     -d \'{"image": "iVBORw0KGgoAAAANS...", "color_filter": "blue"}\'',
  },
  {
    key: 'length',
    title: '指定字符长度与字符集',
    code: 'curl -X POST "http://127.0.0.1:8000/ocr" \\\n     -H "Content-Type: application/json" \\\n     -d \'{"image": "iVBORw0KGgoAAAANS...", "length": 4, "charset_range": "5"}\'',
  },
]

const responseSample = '{\n  "code": 200,\n  "msg": "success",\n  "data": {\n    "text": "Ab3x",\n    "probability": null\n  }\n}'

const endpoints = [
  { path: '/status', method: 'GET', description: '服务状态' },
  { path: '/det', method: 'POST', description: '目标检测' },
  { path: '/slide_match', method: 'POST', description: '滑块匹配' },
  { path: '/slide_comparison', method: 'POST', description: '滑块坑位比对' },
  { path: '/docs', method: 'GET', description: 'Swagger UI' },
  { path: '/mcp', method: 'POST', description: 'MCP 协议' },
]

function methodClass(method) {
  return method === 'GET' ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'
}
</script>

<template>
  <section id="api" class="py-16 sm:py-20 bg-white">
    <div class="max-w-6xl mx-auto px-4 sm:px-6">
      <h2 class="text-2xl sm:text-3xl font-bold text-center text-gray-900 mb-4">API 快速开始</h2>
      <p class="text-center text-gray-600 mb-12 max-w-xl mx-auto">通过 REST API 快速集成验证码识别能力到你的应用中</p>

      <!-- OCR Endpoint -->
      <div class="mb-12">
        <div class="flex items-center gap-3 mb-4">
          <span class="inline-flex items-center px-3 py-1 rounded-md bg-green-50 text-green-700 text-sm font-semibold">POST</span>
          <code class="text-lg font-mono font-semibold text-gray-900">/ocr</code>
          <span class="text-sm text-gray-500">Content-Type: application/json</span>
        </div>

        <!-- Parameters Table -->
        <div class="overflow-x-auto mb-8">
          <table class="w-full text-sm text-left border border-gray-200 rounded-lg overflow-hidden">
            <thead class="bg-gray-50 text-gray-600 uppercase text-xs tracking-wider">
              <tr>
                <th class="px-4 py-3">参数</th>
                <th class="px-4 py-3">类型</th>
                <th class="px-4 py-3">必填</th>
                <th class="px-4 py-3">说明</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <tr v-for="(param, index) in parameters" :key="param.name" :class="index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'">
                <td class="px-4 py-3 font-mono text-blue-600">{{ param.name }}</td>
                <td class="px-4 py-3 text-gray-600">{{ param.type }}</td>
                <td class="px-4 py-3" :class="param.required ? 'text-green-600' : 'text-gray-400'">
                  {{ param.required ? '✅' : '—' }}
                </td>
                <td class="px-4 py-3 text-gray-600">{{ param.description }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- curl Examples -->
        <h3 class="text-lg font-semibold text-gray-900 mb-4">调用示例</h3>
        <div class="space-y-4">
          <div v-for="example in examples" :key="example.key">
            <p class="text-sm text-gray-500 mb-2">{{ example.title }}</p>
            <div class="relative group">
              <pre class="bg-gray-900 text-green-400 rounded-lg p-4 overflow-x-auto text-sm leading-relaxed"><code>{{ example.code }}</code></pre>
              <button
                type="button"
                class="absolute top-3 right-3 text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                title="复制"
                @click="copyCode(example.key, example.code)"
              >
                <i :class="copiedKey === example.key ? 'ri-check-line text-lg text-green-400' : 'ri-file-copy-line text-lg'"></i>
              </button>
            </div>
          </div>
        </div>

        <!-- Response -->
        <h3 class="text-lg font-semibold text-gray-900 mt-8 mb-4">响应格式</h3>
        <div class="relative group">
          <pre class="bg-gray-900 text-green-400 rounded-lg p-4 overflow-x-auto text-sm leading-relaxed"><code>{{ responseSample }}</code></pre>
          <button
            type="button"
            class="absolute top-3 right-3 text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
            title="复制"
            @click="copyCode('response', responseSample)"
          >
            <i :class="copiedKey === 'response' ? 'ri-check-line text-lg text-green-400' : 'ri-file-copy-line text-lg'"></i>
          </button>
        </div>
      </div>

      <!-- Other Endpoints -->
      <h3 class="text-lg font-semibold text-gray-900 mb-4">其他端点</h3>
      <div class="overflow-x-auto">
        <table class="w-full text-sm text-left border border-gray-200 rounded-lg overflow-hidden">
          <thead class="bg-gray-50 text-gray-600 uppercase text-xs tracking-wider">
            <tr>
              <th class="px-4 py-3">端点</th>
              <th class="px-4 py-3">方法</th>
              <th class="px-4 py-3">说明</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="(endpoint, index) in endpoints" :key="endpoint.path" :class="index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'">
              <td class="px-4 py-3 font-mono text-blue-600">{{ endpoint.path }}</td>
              <td class="px-4 py-3">
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold" :class="methodClass(endpoint.method)">
                  {{ endpoint.method }}
                </span>
              </td>
              <td class="px-4 py-3 text-gray-600">{{ endpoint.description }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
