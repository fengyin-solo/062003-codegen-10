<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal card">
      <h3>🏆 {{ challenge?.phaseName || '训练营挑战赛' }}</h3>

      <div v-if="challenge?.status === 'signup'" class="signup-phase">
        <p class="desc">
          报名费: <strong>¥{{ entryFee }}</strong>
          <span class="reward-hint">· 与AI练习生同台竞技</span>
        </p>

        <div class="phase-info">
          <span class="tier-badge" :class="`tier-${challenge?.phaseTier}`">
            T{{ challenge?.phaseTier }}
          </span>
          <span>声望范围: {{ phase?.minReputation }} - {{ phase?.maxReputation }}</span>
          <span class="slot-info" :class="{ full: isFull }">
            报名进度: {{ signups.length }} / {{ phase?.participants }}
            <span v-if="isFull" class="full-tag">· 已满员</span>
          </span>
        </div>

        <h4>可报名练习生</h4>
        <div class="trainee-list">
          <div
            v-for="t in eligibleTrainees"
            :key="t.id"
            class="trainee-item"
            :class="{ signed: signups.includes(t.id), disabled: !canSignup(t) }"
          >
            <div class="trainee-info">
              <span class="name">{{ t.name }}</span>
              <span class="score">综合 {{ calcScore(t) }} 分</span>
              <span class="rep">声望 {{ t.reputation }}</span>
            </div>
            <div class="actions">
              <button
                v-if="!signups.includes(t.id)"
                class="btn small primary"
                :disabled="!canSignup(t)"
                @click="$emit('signup', t.id)"
              >
                {{ isFull ? '已满员' : '报名' }}
              </button>
              <button
                v-else
                class="btn small ghost"
                @click="$emit('cancel-signup', t.id)"
              >
                取消
              </button>
            </div>
          </div>
          <div v-if="eligibleTrainees.length === 0" class="empty">
            没有符合条件的练习生
          </div>
        </div>

        <p v-if="error" class="error">{{ error }}</p>

        <div class="modal-actions">
          <button 
            class="btn primary" 
            :disabled="signups.length === 0"
            @click="$emit('start')"
          >
            开始比赛 ({{ signups.length }}/{{ phase?.participants }} 人)
          </button>
          <button class="btn ghost" @click="$emit('close')">关闭</button>
        </div>
      </div>

      <div v-if="challenge?.status === 'result'" class="result-phase">
        <p class="desc">比赛结果已出炉！共 {{ phase?.participants }} 人参赛</p>

        <table class="result-table">
          <thead>
            <tr>
              <th>排名</th>
              <th>姓名</th>
              <th>得分</th>
              <th>奖励</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(p, i) in sortedParticipants"
              :key="p.id"
              :class="{ player: !p.isNpc, top3: i < 3 }"
            >
              <td>
                <span v-if="i === 0" class="medal">🥇</span>
                <span v-else-if="i === 1" class="medal">🥈</span>
                <span v-else-if="i === 2" class="medal">🥉</span>
                <span v-else>{{ i + 1 }}</span>
              </td>
              <td>
                {{ p.name }}
                <span v-if="!p.isNpc" class="player-tag">我方</span>
              </td>
              <td><strong>{{ p.finalScore }}</strong></td>
              <td class="reward-cell">
                <template v-if="getReward(i + 1)">
                  <span class="reward-item">💰 {{ getReward(i + 1).money }}</span>
                  <span class="reward-item">⭐ {{ getReward(i + 1).reputation }}</span>
                </template>
                <span v-else class="reward-item muted">—</span>
              </td>
            </tr>
          </tbody>
        </table>

        <div class="modal-actions">
          <button class="btn primary" @click="$emit('settle')">
            领取奖励
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { GAME_CONFIG } from '../config/gameConfig'

const props = defineProps({
  challenge: Object,
  signups: Array,
  eligibleTrainees: Array,
  calcScore: Function,
  money: Number,
})

const emit = defineEmits(['close', 'signup', 'cancel-signup', 'start', 'settle'])

const error = ref('')
const entryFee = GAME_CONFIG.challenges.entryFee

const phase = computed(() => {
  if (!props.challenge) return null
  return GAME_CONFIG.challenges.phases.find(p => p.id === props.challenge.phaseId)
})

const isFull = computed(() => {
  if (!phase.value) return false
  return props.signups.length >= phase.value.participants
})

const sortedParticipants = computed(() => {
  if (!props.challenge?.participants || !phase.value) return []
  return [...props.challenge.participants]
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, phase.value.participants)
})

function canSignup(trainee) {
  if (isFull.value && !props.signups.includes(trainee.id)) return false
  if (props.money < entryFee) return false
  if (trainee.illnessDays > 0) return false
  if (phase.value) {
    return trainee.reputation >= phase.value.minReputation &&
           trainee.reputation < phase.value.maxReputation
  }
  return true
}

function getReward(rank) {
  if (!phase.value) return null
  const maxRank = Object.keys(phase.value.rewards).length
  if (rank < 1 || rank > maxRank) return null
  return phase.value.rewards[rank] || null
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 120;
  padding: 1rem;
}

.modal {
  max-width: 520px;
  width: 100%;
  padding: 1.5rem;
  max-height: 90vh;
  overflow-y: auto;
}

.desc {
  color: var(--text-secondary);
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
}

.reward-hint {
  color: var(--text-muted);
  font-size: 0.8rem;
}

.phase-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
  flex-wrap: wrap;
}

.slot-info {
  color: var(--text-muted);
}

.slot-info.full {
  color: var(--warning);
  font-weight: 600;
}

.full-tag {
  margin-left: 0.25rem;
}

.tier-badge {
  font-size: 0.7rem;
  padding: 0.15rem 0.5rem;
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

h4 {
  font-size: 0.95rem;
  margin-bottom: 0.5rem;
}

.trainee-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-bottom: 1rem;
  max-height: 280px;
  overflow-y: auto;
}

.trainee-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.trainee-item.signed {
  border-color: var(--success);
  background: rgba(46, 160, 67, 0.05);
}

.trainee-item.disabled {
  opacity: 0.5;
}

.trainee-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.85rem;
}

.name {
  font-weight: 600;
}

.score {
  color: var(--text-muted);
}

.rep {
  color: var(--accent);
  font-size: 0.8rem;
}

.btn.small {
  padding: 0.3rem 0.7rem;
  font-size: 0.8rem;
}

.empty {
  text-align: center;
  color: var(--text-muted);
  padding: 1.5rem;
  font-size: 0.9rem;
}

.error {
  color: var(--danger);
  font-size: 0.85rem;
  margin-bottom: 0.75rem;
}

.modal-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  margin-top: 1rem;
}

.result-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1rem;
  font-size: 0.9rem;
}

.result-table th,
.result-table td {
  padding: 0.5rem;
  text-align: left;
  border-bottom: 1px solid var(--border);
}

.result-table tr.player {
  background: var(--accent-soft);
}

.result-table tr.top3 {
  font-weight: 500;
}

.medal {
  font-size: 1.1rem;
}

.player-tag {
  font-size: 0.7rem;
  background: var(--accent);
  color: white;
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  margin-left: 0.35rem;
}

.reward-cell {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.reward-item {
  font-size: 0.8rem;
}

.reward-item.muted {
  color: var(--text-muted);
}
</style>
