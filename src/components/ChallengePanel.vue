<template>
  <div class="challenge-panel card">
    <h3>🏆 训练营挑战赛</h3>

    <div v-if="currentChallenge" class="current-challenge">
      <div class="challenge-name">
        <span class="tier-badge" :class="`tier-${currentChallenge.phaseTier}`">
          T{{ currentChallenge.phaseTier }}
        </span>
        {{ currentChallenge.phaseName }}
      </div>

      <div v-if="currentChallenge.status === 'signup'" class="challenge-status">
        <span class="status signup">报名中</span>
        <span class="signup-count" :class="{ full: isFull }">
          {{ signups.length }}/{{ phaseParticipants }} 人
          <span v-if="isFull" class="full-label">· 已满员</span>
        </span>
      </div>

      <div v-if="currentChallenge.status === 'result'" class="challenge-status">
        <span class="status result">已结束</span>
      </div>

      <button class="btn primary full" @click="$emit('open-challenge')">
        {{ currentChallenge.status === 'signup' ? '查看 / 报名' : '查看结果' }}
      </button>
    </div>

    <div v-else class="no-challenge">
      <p v-if="daysUntil > 0" class="countdown">
        距下一届: <strong>{{ daysUntil }} 天</strong>
      </p>
      <p v-else class="available">
        🎯 新一届挑战赛即将开始！
      </p>
      <button 
        v-if="canSignup && availablePhase" 
        class="btn primary full"
        @click="$emit('start-signup')"
      >
        开启报名
      </button>
    </div>

    <div class="challenge-history" v-if="history && history.length > 0">
      <h4>历史赛事</h4>
      <div class="history-list">
        <div v-for="(h, i) in history.slice(-3).reverse()" :key="i" class="history-item">
          <span class="h-name">{{ h.phaseName }}</span>
          <span class="h-day">第 {{ h.day }} 天</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { GAME_CONFIG } from '../config/gameConfig'

const props = defineProps({
  currentChallenge: Object,
  signups: Array,
  daysUntil: Number,
  canSignup: Boolean,
  availablePhase: Object,
  history: Array,
})

defineEmits(['open-challenge', 'start-signup'])

const phaseParticipants = computed(() => {
  if (!props.currentChallenge) return 0
  const phase = GAME_CONFIG.challenges.phases.find(p => p.id === props.currentChallenge.phaseId)
  return phase?.participants || 0
})

const isFull = computed(() => {
  return phaseParticipants.value > 0 && props.signups.length >= phaseParticipants.value
})
</script>

<style scoped>
.challenge-panel h3 {
  margin-bottom: 1rem;
}

.current-challenge {
  margin-bottom: 1rem;
}

.challenge-name {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.tier-badge {
  font-size: 0.7rem;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  font-weight: 700;
}

.tier-1 {
  background: #e3f2fd;
  color: #1976d2;
}

.tier-2 {
  background: #f3e5f5;
  color: #7b1fa2;
}

.tier-3 {
  background: #fff8e1;
  color: #ffa000;
}

.challenge-status {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  font-size: 0.85rem;
}

.status {
  font-weight: 600;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
}

.status.signup {
  background: #e8f5e9;
  color: #388e3c;
}

.status.result {
  background: #fff3e0;
  color: #f57c00;
}

.signup-count {
  color: var(--text-muted);
}

.signup-count.full {
  color: var(--warning);
  font-weight: 600;
}

.full-label {
  margin-left: 0.25rem;
}

.no-challenge {
  text-align: center;
  padding: 1rem 0;
}

.countdown {
  color: var(--text-secondary);
  margin-bottom: 0.75rem;
}

.countdown strong {
  color: var(--accent);
  font-size: 1.1rem;
}

.available {
  color: var(--success);
  font-weight: 600;
  margin-bottom: 0.75rem;
}

.full {
  width: 100%;
}

.challenge-history {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}

.challenge-history h4 {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-bottom: 0.5rem;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.history-item {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.h-name {
  font-weight: 500;
}

.h-day {
  color: var(--text-muted);
}
</style>
