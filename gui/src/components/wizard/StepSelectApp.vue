<script setup>
/**
 * StepSelectApp — App catalog grid with category filter.
 *
 * User picks a known app (pre-configured permissions) or "Custom" for manual setup.
 */
import { ref, computed } from 'vue'
import { wizardApps, sortedCategories, appsByCategory, appIconUrl } from '@/data/appCatalog.js'

var emit = defineEmits(['select'])

var activeCategory = ref('')

var filteredApps = computed(() => {
  if (!activeCategory.value) return wizardApps
  return appsByCategory(activeCategory.value)
})

function selectApp(app) {
  emit('select', { type: 'app', app })
}

function selectCustom() {
  emit('select', { type: 'custom', app: null })
}
</script>

<template>
  <div class="step-select">
    <p class="step-intro">
      Choose an app to connect, or create a custom connection.
    </p>

    <!-- Category filter -->
    <div class="cat-bar">
      <button
        class="cat-pill"
        :class="{ active: !activeCategory }"
        @click="activeCategory = ''"
      >All</button>
      <button
        v-for="[catId, cat] in sortedCategories"
        :key="catId"
        class="cat-pill"
        :class="{ active: activeCategory === catId }"
        @click="activeCategory = catId"
      >{{ cat.label }}</button>
    </div>

    <!-- App grid -->
    <div class="app-grid">
      <button
        v-for="app in filteredApps"
        :key="app.id"
        class="app-card"
        @click="selectApp(app)"
      >
        <div class="app-icon-box">
          <img
            :src="appIconUrl(app.id)"
            :alt="app.name"
            class="app-icon-img"
            @error="$event.target.style.display='none'; $event.target.nextElementSibling.style.display='flex'"
          />
          <span class="app-icon-letter" style="display:none">{{ app.name.charAt(0) }}</span>
        </div>
        <div class="app-meta">
          <span class="app-name">{{ app.name }}</span>
          <span class="app-desc">{{ app.desc }}</span>
        </div>
      </button>
    </div>

    <!-- Custom connection option -->
    <button class="custom-card" @click="selectCustom">
      <div class="custom-icon">
        <img src="/app-icons/custom.png" alt="NWC" class="custom-icon-img" />
      </div>
      <div class="app-meta">
        <span class="app-name">Custom Connection</span>
        <span class="app-desc">Set your own label, permissions, and limits</span>
      </div>
    </button>
  </div>
</template>

<style scoped>
.step-intro {
  font-size: 0.85rem;
  color: #8a8078;
  margin-bottom: 1rem;
}

.cat-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 1rem;
}

.cat-pill {
  padding: 0.3rem 0.65rem;
  font-size: 0.75rem;
  border-radius: 9999px;
  border: 1px solid transparent;
  background: #1a1918;
  color: #8a8078;
  cursor: pointer;
  transition: all 0.15s ease;
}

.cat-pill:hover { color: #c8beb4; }

.cat-pill.active {
  border-color: #f59e0b;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.08);
}

.app-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.app-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0.75rem;
  background: #1a1918;
  border: 1px solid #2a2827;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
  text-align: left;
}

.app-card:hover {
  border-color: #3a3735;
  background: #1f1e1c;
}

.app-icon-box {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: #252321;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.app-icon-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
}

.app-icon-letter {
  font-size: 0.9rem;
  font-weight: 700;
  color: #8a8078;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.app-meta {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  overflow: hidden;
}

.app-name {
  font-size: 0.82rem;
  font-weight: 600;
  color: #e8e0d8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.app-desc {
  font-size: 0.7rem;
  color: #625a52;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.custom-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0.85rem;
  width: 100%;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.06), rgba(245, 158, 11, 0.02));
  border: 1.5px solid rgba(245, 158, 11, 0.3);
  border-radius: 0.5rem;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
}

.custom-card:hover {
  border-color: rgba(245, 158, 11, 0.55);
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(245, 158, 11, 0.04));
  box-shadow: 0 0 12px rgba(245, 158, 11, 0.08);
}

.custom-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.custom-icon-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 8px;
}
</style>
