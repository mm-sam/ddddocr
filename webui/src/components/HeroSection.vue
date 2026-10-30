<template>
  <section class="relative overflow-hidden">
    <div class="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-gray-50 -z-10"></div>
    <div class="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28 text-center">
      <h1 class="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900 leading-tight">
        通用验证码识别工具
      </h1>
      <p class="mt-6 text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
        基于 <span class="font-semibold text-gray-800">Rust</span> 构建，不依赖 OpenCV，跨平台运行，提供 REST API 与 MCP 协议
      </p>
      <div class="mt-10 flex flex-wrap items-center justify-center gap-4">
        <a href="#playground"
           class="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-blue-600 text-white font-medium shadow-sm hover:bg-blue-700 transition-colors">
          <i class="ri-rocket-line"></i>
          快速开始
        </a>
        <a href="/docs"
           class="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-white text-blue-600 font-medium border border-blue-200 shadow-sm hover:bg-blue-50 transition-colors">
          <i class="ri-book-open-line"></i>
          API 文档
        </a>
        <a href="https://github.com/86maid/ddddocr" target="_blank" rel="noopener"
           class="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-white text-gray-700 font-medium border border-gray-300 shadow-sm hover:bg-gray-50 transition-colors">
          <i class="ri-github-fill"></i>
          GitHub
        </a>
      </div>
    </div>
  </section>
</template>
