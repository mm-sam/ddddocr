<template>
  <section class="py-16 sm:py-20">
    <div class="max-w-6xl mx-auto px-4 sm:px-6">
      <h2 class="text-2xl sm:text-3xl font-bold text-center text-gray-900 mb-12">核心功能</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div v-for="feature in features" :key="feature.title"
             class="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
          <div class="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center mb-4">
            <i :class="feature.icon" class="text-2xl text-blue-600"></i>
          </div>
          <h3 class="text-lg font-semibold text-gray-900 mb-2">{{ feature.title }}</h3>
          <p class="text-gray-600 text-sm leading-relaxed">{{ feature.description }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
const features = [
  {
    icon: 'ri-text',
    title: 'OCR 识别',
    description: '支持多种验证码识别，内建官方模型与旧模型，可导入自定义训练模型',
  },
  {
    icon: 'ri-focus-3-line',
    title: '目标检测',
    description: '416×416 anchor-free 检测器，返回边界框坐标',
  },
  {
    icon: 'ri-drag-move-2-line',
    title: '滑块匹配',
    description: '模板匹配与像素差异比对，纯影像处理无需神经网络',
  },
  {
    icon: 'ri-robot-2-line',
    title: 'MCP 协议',
    description: '支持 Model Context Protocol，AI Agent 可直接调用',
  },
]
</script>
