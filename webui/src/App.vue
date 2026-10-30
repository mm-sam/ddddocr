<script setup>
import SiteHeader from './components/SiteHeader.vue'
import HeroSection from './components/HeroSection.vue'
import OcrPlayground from './components/OcrPlayground.vue'
import FeaturesSection from './components/FeaturesSection.vue'
import ApiDocs from './components/ApiDocs.vue'
import SiteFooter from './components/SiteFooter.vue'
</script>

<template>
  <SiteHeader />
  <main>
    <HeroSection />
    <OcrPlayground />
    <FeaturesSection />
    <ApiDocs />
  </main>
  <SiteFooter />
</template>
