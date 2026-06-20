<template>
  <div class="game-view">
    <GameHeader
      :state="state"
      :days-left="daysLeft"
      :profit="profit"
      :theme="theme"
      @back="$emit('back')"
      @toggle-theme="$emit('toggle-theme')"
    />

    <div class="game-body">
      <aside class="sidebar">
        <div class="trainee-grid">
          <TraineeCard
            v-for="t in activeTrainees"
            :key="t.id"
            :trainee="t"
            :score="calcScore(t)"
          />
        </div>
      </aside>

      <main class="main-panel">
        <SchedulePanel
          :trainees="activeTrainees"
          :schedule="state.schedule"
          :can-end="canEndDay"
          @set="(id, act) => $emit('set-schedule', id, act)"
          @clear="$emit('clear-schedule')"
          @end-day="$emit('end-day')"
        />
        <DayLog :logs="state.logs" />
      </main>

      <aside class="right-panel">
        <ChallengePanel
          :current-challenge="state.currentChallenge"
          :signups="state.challengeSignups"
          :days-until="daysUntilChallenge"
          :can-signup="canChallengeSignup"
          :available-phase="availableChallengePhase"
          :history="state.challengeHistory"
          @open-challenge="showChallenge = true"
          @start-signup="onStartChallengeSignup"
        />
        <GroupsPanel
          :groups="state.groups"
          :trainees="state.trainees"
          :money="state.money"
          @release="(id) => $emit('release-single', id)"
        />
        <RelationshipPanel
          :trainees="state.trainees"
          :relationships="state.relationships"
        />
      </aside>
    </div>

    <RatingModal
      v-if="state.pendingRating && state.gameStatus === 'playing'"
      :results="ratingResults"
      @close="$emit('dismiss-rating')"
      @debut="showDebut = true"
    />

    <DebutModal
      v-if="showDebut"
      :candidates="ratingResults"
      @close="showDebut = false"
      @confirm="onDebut"
    />

    <EventModal
      v-if="state.pendingEvent"
      :event="state.pendingEvent"
      @resolve="(keep) => $emit('resolve-poaching', keep)"
    />

    <GameOverModal
      v-if="state.gameStatus !== 'playing'"
      :status="state.gameStatus"
      :state="state"
      :profit="profit"
      @back="$emit('back')"
    />

    <ChallengeModal
      v-if="showChallenge"
      :challenge="state.currentChallenge"
      :signups="state.challengeSignups"
      :eligible-trainees="eligibleChallengeTrainees"
      :calc-score="calcScore"
      :money="state.money"
      @close="showChallenge = false"
      @signup="onSignupChallenge"
      @cancel-signup="onCancelSignupChallenge"
      @start="onStartChallenge"
      @settle="onSettleChallenge"
    />

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import GameHeader from './GameHeader.vue'
import TraineeCard from './TraineeCard.vue'
import SchedulePanel from './SchedulePanel.vue'
import DayLog from './DayLog.vue'
import GroupsPanel from './GroupsPanel.vue'
import RelationshipPanel from './RelationshipPanel.vue'
import ChallengePanel from './ChallengePanel.vue'
import ChallengeModal from './ChallengeModal.vue'
import RatingModal from './RatingModal.vue'
import DebutModal from './DebutModal.vue'
import EventModal from './EventModal.vue'
import GameOverModal from './GameOverModal.vue'
import { GAME_CONFIG } from '../config/gameConfig'

const props = defineProps({
  state: Object,
  activeTrainees: Array,
  daysLeft: Number,
  profit: Number,
  theme: String,
  canEndDay: Boolean,
  ratingResults: Array,
  calcScore: Function,
  getAvailablePhase: Function,
  getEligible: Function,
  canSignup: Function,
  daysUntilChallenge: Function,
})

const emit = defineEmits([
  'back',
  'toggle-theme',
  'set-schedule',
  'clear-schedule',
  'end-day',
  'dismiss-rating',
  'debut',
  'resolve-poaching',
  'release-single',
  'start-challenge-signup',
  'signup-challenge',
  'cancel-signup-challenge',
  'start-challenge',
  'settle-challenge',
])

const showDebut = ref(false)
const showChallenge = ref(false)
const toast = ref('')

const daysUntilChallenge = computed(() => 
  props.daysUntilChallenge ? props.daysUntilChallenge() : 0
)

const canChallengeSignup = computed(() => 
  props.canSignup ? props.canSignup() : false
)

const availableChallengePhase = computed(() => 
  props.getAvailablePhase ? props.getAvailablePhase() : null
)

const eligibleChallengeTrainees = computed(() => {
  if (!props.getEligible || !props.state?.currentChallenge) return []
  return props.getEligible(props.state.currentChallenge.phaseId)
})

function onStartChallengeSignup() {
  const phase = availableChallengePhase.value
  if (!phase) return
  emit('start-challenge-signup', phase.id, (result) => {
    if (result?.success) {
      showChallenge.value = true
    } else if (result?.message) {
      showToast(result.message)
    }
  })
}

function onSignupChallenge(traineeId) {
  emit('signup-challenge', traineeId, (result) => {
    if (!result?.success && result?.message) {
      showToast(result.message)
    }
  })
}

function onCancelSignupChallenge(traineeId) {
  emit('cancel-signup-challenge', traineeId)
}

function onStartChallenge() {
  emit('start-challenge', (result) => {
    if (!result?.success && result?.message) {
      showToast(result.message)
    }
  })
}

function onSettleChallenge() {
  emit('settle-challenge', (result) => {
    if (result?.success) {
      showChallenge.value = false
      showToast('奖励已领取！')
    } else if (result?.message) {
      showToast(result.message)
    }
  })
}

function showToast(msg) {
  toast.value = msg
  setTimeout(() => { toast.value = '' }, 2500)
}

function onDebut(memberIds, groupName) {
  emit('debut', memberIds, groupName, (result) => {
    if (result?.success) {
      showDebut.value = false
      toast.value = '出道成功！'
      setTimeout(() => { toast.value = '' }, 2500)
    } else if (result?.message) {
      toast.value = result.message
      setTimeout(() => { toast.value = '' }, 3000)
    }
  })
}
</script>

<style scoped>
.game-view {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.game-body {
  display: grid;
  grid-template-columns: 1fr 1.1fr 0.9fr;
  gap: 1rem;
  padding: 1rem;
  flex: 1;
}

@media (max-width: 1100px) {
  .game-body {
    grid-template-columns: 1fr;
  }
}

.sidebar .trainee-grid {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.main-panel,
.right-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.toast {
  position: fixed;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-card);
  border: 1px solid var(--accent);
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  z-index: 200;
  box-shadow: var(--shadow);
}
</style>
