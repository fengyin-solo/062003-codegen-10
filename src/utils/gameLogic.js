import { GAME_CONFIG } from '../config/gameConfig'
import { randInt, randFloat, pickRandom, weightedPick, clamp, pairKey } from './random'

const CFG = GAME_CONFIG

export function createInitialGameState() {
  const names = [...CFG.names].sort(() => Math.random() - 0.5)
  const trainees = []
  for (let i = 0; i < CFG.initial.traineeCount; i++) {
    trainees.push(createTrainee(names[i], i))
  }
  return {
    day: 1,
    money: CFG.initial.money,
    fans: CFG.initial.fans,
    totalRevenue: 0,
    totalExpenses: 0,
    trainees,
    groups: [],
    relationships: initRelationships(trainees),
    schedule: {},
    logs: [{ day: 1, text: '事务所成立！五位练习生已就位，三年征途正式开始。' }],
    pendingEvent: null,
    pendingRating: false,
    gameStatus: 'playing',
    lastSingleDay: {},
    currentChallenge: null,
    challengeSignups: [],
    pendingChallengeResult: false,
    lastChallengeDay: 0,
    challengeHistory: [],
  }
}

function createTrainee(name, index) {
  const stats = {}
  for (const key of CFG.stats) {
    stats[key] = randInt(CFG.initial.statMin, CFG.initial.statMax)
  }
  return {
    id: `t${index}_${Date.now()}`,
    name,
    stats,
    fatigue: CFG.initial.fatigue + randInt(-5, 5),
    stress: CFG.initial.stress + randInt(-3, 3),
    status: 'trainee',
    groupId: null,
    illnessDays: 0,
    poachResist: randInt(40, 70),
    fans: 0,
    singlesReleased: 0,
    reputation: 0,
    challengeWins: 0,
    challengeParticipations: 0,
  }
}

function initRelationships(trainees) {
  const rel = {}
  for (let i = 0; i < trainees.length; i++) {
    for (let j = i + 1; j < trainees.length; j++) {
      rel[pairKey(trainees[i].id, trainees[j].id)] = randInt(
        CFG.relationships.initialRange[0],
        CFG.relationships.initialRange[1]
      )
    }
  }
  return rel
}

export function calcTraineeScore(trainee) {
  const w = CFG.rating.scoreWeights
  let score = 0
  for (const key of CFG.stats) {
    score += trainee.stats[key] * w[key]
  }
  const fatiguePenalty = trainee.fatigue > CFG.thresholds.fatigueExhausted ? 0.85 : 1
  const stressPenalty = trainee.stress > CFG.thresholds.stressHigh ? 0.9 : 1
  return Math.round(score * fatiguePenalty * stressPenalty)
}

export function getRelationship(relationships, idA, idB) {
  return relationships[pairKey(idA, idB)] ?? 0
}

export function setRelationship(relationships, idA, idB, value) {
  relationships[pairKey(idA, idB)] = clamp(
    value,
    CFG.relationships.min,
    CFG.relationships.max
  )
}

export function getActiveTrainees(state) {
  return state.trainees.filter((t) => t.status !== 'left')
}

export function getDebutedTrainees(state) {
  return state.trainees.filter((t) => t.status === 'debuted')
}

export function calcProfit(state) {
  return state.totalRevenue - state.totalExpenses
}

export function checkVictory(state) {
  const profit = calcProfit(state)
  const groups = state.groups.length
  const goalsMet =
    groups >= CFG.victory.targetGroups &&
    (!CFG.victory.requirePositiveProfit || profit > 0)

  if (goalsMet) return 'won'

  if (state.day > CFG.victory.totalDays) {
    if (groups < CFG.victory.targetGroups) return 'lost_groups'
    if (CFG.victory.requirePositiveProfit && profit <= 0) return 'lost_profit'
  }
  if (state.money < -20000) return 'lost_bankrupt'
  const active = getActiveTrainees(state)
  if (active.length === 0 && state.groups.length === 0) return 'lost_empty'
  return null
}

function applyRange(val, range, mult = 1) {
  if (!range || range.length < 2) return val
  return val + randInt(Math.round(range[0] * mult), Math.round(range[1] * mult))
}

function getTrainingMultiplier(trainee, partners, relationships) {
  let mult = 1
  if (trainee.fatigue >= CFG.thresholds.fatigueExhausted) mult *= 0.5
  if (trainee.stress >= CFG.thresholds.stressHigh) mult *= 0.8
  if (trainee.stress >= CFG.thresholds.stressBreakdown) mult *= 0

  let synergyCount = 0
  for (const p of partners) {
    const rel = getRelationship(relationships, trainee.id, p.id)
    if (rel >= CFG.relationships.synergyThreshold) synergyCount++
  }
  if (synergyCount > 0) {
    mult *= 1 + CFG.relationships.synergyBonus * Math.min(synergyCount, 2)
  }
  return mult
}

export function processDay(state) {
  const logs = []
  let money = state.money
  let fans = state.fans
  let totalExpenses = state.totalExpenses
  const relationships = { ...state.relationships }
  const trainees = state.trainees.map((t) => ({ ...t, stats: { ...t.stats } }))
  const schedule = state.schedule

  const activityGroups = {}
  for (const [traineeId, activity] of Object.entries(schedule)) {
    if (!activityGroups[activity]) activityGroups[activity] = []
    activityGroups[activity].push(traineeId)
  }

  for (const trainee of trainees) {
    if (trainee.status === 'left') continue

    if (trainee.illnessDays > 0) {
      trainee.illnessDays--
      trainee.fatigue = clamp(trainee.fatigue - 5, 0, 100)
      logs.push({ day: state.day, text: `${trainee.name} 仍在休养中（剩余 ${trainee.illnessDays} 天）。` })
      continue
    }

    if (trainee.fatigue >= CFG.thresholds.fatigueCollapse) {
      trainee.fatigue = applyRange(trainee.fatigue, CFG.activities.rest.fatigue)
      trainee.stress = applyRange(trainee.stress, CFG.activities.rest.stress)
      logs.push({ day: state.day, text: `${trainee.name} 过度疲劳，被迫休息。` })
      continue
    }

    const activityKey = schedule[trainee.id]
    if (!activityKey) {
      logs.push({ day: state.day, text: `${trainee.name} 今日未安排日程。` })
      continue
    }

    const activity = CFG.activities[activityKey]
    if (!activity) continue

    money -= activity.moneyCost
    totalExpenses += activity.moneyCost

    const partners = (activityGroups[activityKey] || [])
      .filter((id) => id !== trainee.id)
      .map((id) => trainees.find((t) => t.id === id))
      .filter(Boolean)

    const mult = getTrainingMultiplier(trainee, partners, relationships)

    if (activity.requiresTraining && trainee.stress >= CFG.thresholds.stressBreakdown) {
      logs.push({ day: state.day, text: `${trainee.name} 压力过大，无法集中精力训练。` })
      trainee.stress = clamp(trainee.stress + randInt(2, 5), 0, 100)
      continue
    }

    for (const [stat, range] of Object.entries(activity.statGain || {})) {
      const gain = randInt(range[0], range[1])
      trainee.stats[stat] = clamp(
        trainee.stats[stat] + Math.round(gain * mult),
        0,
        CFG.thresholds.statCap
      )
    }

    trainee.fatigue = clamp(applyRange(trainee.fatigue, activity.fatigue), 0, 100)
    trainee.stress = clamp(applyRange(trainee.stress, activity.stress), 0, 100)

    if (activity.fansGain) {
      const gained = randInt(activity.fansGain[0], activity.fansGain[1])
      fans += gained
      trainee.fans += Math.round(gained * 0.3)
      logs.push({ day: state.day, text: `${trainee.name} 参与公关，粉丝 +${gained}。` })
    }

    for (const p of partners) {
      const cur = getRelationship(relationships, trainee.id, p.id)
      setRelationship(
        relationships,
        trainee.id,
        p.id,
        cur + randInt(CFG.relationships.trainingTogether[0], CFG.relationships.trainingTogether[1])
      )
    }
  }

  for (let i = 0; i < trainees.length; i++) {
    for (let j = i + 1; j < trainees.length; j++) {
      const a = trainees[i]
      const b = trainees[j]
      if (a.status === 'left' || b.status === 'left') continue

      const key = pairKey(a.id, b.id)
      let rel = relationships[key] ?? 0
      rel += randInt(CFG.relationships.dailyDrift[0], CFG.relationships.dailyDrift[1])
      rel = clamp(rel, CFG.relationships.min, CFG.relationships.max)

      const maxStat = (t) => Math.max(...CFG.stats.map((s) => t.stats[s]))
      const gap = Math.abs(maxStat(a) - maxStat(b))
      if (gap >= CFG.relationships.statGapCompetition) {
        rel -= randInt(2, 6)
        const weaker = maxStat(a) < maxStat(b) ? a : b
        weaker.stress = clamp(
          weaker.stress + randInt(CFG.relationships.competitionStress[0], CFG.relationships.competitionStress[1]),
          0,
          100
        )
        if (rel <= CFG.relationships.competitionThreshold) {
          logs.push({
            day: state.day,
            text: `${weaker.name} 感受到来自 ${weaker === a ? b.name : a.name} 的竞争压力！`,
          })
        }
      }

      relationships[key] = rel
    }
  }

  const dailyCost =
    CFG.dailyCosts.baseOperatingCost +
    trainees.filter((t) => t.status === 'trainee').length * CFG.dailyCosts.perTraineeCost +
    trainees.filter((t) => t.status === 'debuted').length * CFG.dailyCosts.perDebutedCost +
    state.groups.length * CFG.dailyCosts.perGroupCost

  money -= dailyCost
  totalExpenses += dailyCost

  const newDay = state.day + 1
  const pendingRating = state.day % CFG.rating.interval === 0

  let pendingEvent = null
  if (Math.random() < CFG.events.dailyChance) {
    pendingEvent = generateRandomEvent(trainees, state.day)
    if (pendingEvent.type === 'fan_surge') {
      fans += pendingEvent.fansGain
      logs.push({ day: state.day, text: `【${pendingEvent.label}】粉丝 +${pendingEvent.fansGain}！` })
      pendingEvent = null
    } else if (pendingEvent.type === 'inspiration') {
      const target = pendingEvent.target
      const stat = pickRandom(CFG.stats)
      target.stats[stat] = clamp(target.stats[stat] + pendingEvent.statBoost, 0, CFG.thresholds.statCap)
      logs.push({
        day: state.day,
        text: `【${pendingEvent.label}】${target.name} 的${CFG.statLabels[stat]} +${pendingEvent.statBoost}！`,
      })
      pendingEvent = null
    } else if (pendingEvent.type === 'negative_news') {
      fans = Math.max(0, fans - pendingEvent.fansLoss)
      for (const t of trainees) {
        if (t.status !== 'left') {
          t.stress = clamp(t.stress + pendingEvent.stressGain, 0, 100)
        }
      }
      logs.push({
        day: state.day,
        text: `【${pendingEvent.label}】粉丝 -${pendingEvent.fansLoss}，全员压力上升。`,
      })
      pendingEvent = null
    } else if (pendingEvent.type === 'illness') {
      pendingEvent.target.illnessDays = pendingEvent.duration
      pendingEvent.target.stress = clamp(
        pendingEvent.target.stress + pendingEvent.stressGain,
        0,
        100
      )
      logs.push({
        day: state.day,
        text: `【${pendingEvent.label}】${pendingEvent.target.name} 需要休养 ${pendingEvent.duration} 天。`,
      })
      pendingEvent = null
    }
  }

  const nextState = {
    ...state,
    day: newDay,
    money,
    fans,
    totalExpenses,
    trainees,
    relationships,
    schedule: {},
    logs: [...state.logs, ...logs],
    pendingEvent,
    pendingRating,
  }

  const result = checkVictory(nextState)
  if (result) nextState.gameStatus = result

  return nextState
}

function generateRandomEvent(trainees, day) {
  const active = trainees.filter((t) => t.status !== 'left' && t.illnessDays === 0)
  if (active.length === 0) return null

  const types = Object.entries(CFG.events.types).map(([key, val]) => ({
    key,
    ...val,
  }))
  const picked = weightedPick(types)
  const target = pickRandom(active)

  const event = {
    type: picked.key,
    label: picked.label,
    description: picked.description,
    day,
    target,
    resolved: false,
  }

  switch (picked.key) {
    case 'poaching':
      event.successChance = picked.successChance
      break
    case 'illness':
      event.duration = randInt(picked.duration[0], picked.duration[1])
      event.stressGain = randInt(picked.stressGain[0], picked.stressGain[1])
      break
    case 'inspiration':
      event.statBoost = randInt(picked.statBoost[0], picked.statBoost[1])
      break
    case 'negative_news':
      event.fansLoss = randInt(picked.fansLoss[0], picked.fansLoss[1])
      event.stressGain = randInt(picked.stressGain[0], picked.stressGain[1])
      break
    case 'fan_surge':
      event.fansGain = randInt(picked.fansGain[0], picked.fansGain[1])
      break
  }

  return event
}

export function resolvePoachingEvent(state, keepTrainee) {
  const event = state.pendingEvent
  if (!event || event.type !== 'poaching') return state

  const logs = [...state.logs]
  const trainees = state.trainees.map((t) => ({ ...t, stats: { ...t.stats } }))
  const target = trainees.find((t) => t.id === event.target.id)

  if (keepTrainee) {
    const cost = randInt(8000, 15000)
    logs.push({
      day: state.day,
      text: `【挖角危机】你花费 ¥${cost} 成功挽留 ${target.name}！`,
    })
    target.stress = clamp(target.stress + randInt(5, 12), 0, 100)
    return {
      ...state,
      money: state.money - cost,
      totalExpenses: state.totalExpenses + cost,
      trainees,
      logs,
      pendingEvent: null,
    }
  }

  const roll = Math.random()
  const resist = target.poachResist / 100
  if (roll > event.successChance * (1 - resist * 0.5)) {
    logs.push({ day: state.day, text: `【挖角危机】${target.name} 决定留在事务所。` })
    return { ...state, trainees, logs, pendingEvent: null }
  }

  target.status = 'left'
  logs.push({ day: state.day, text: `【挖角危机】${target.name} 被竞争对手挖走，离开了事务所！` })
  const result = checkVictory({ ...state, trainees })
  return {
    ...state,
    trainees,
    logs,
    pendingEvent: null,
    gameStatus: result || state.gameStatus,
  }
}

export function debutGroup(state, memberIds, groupName) {
  const members = state.trainees.filter((t) => memberIds.includes(t.id))
  if (members.length < CFG.rating.minGroupSize || members.length > CFG.rating.maxGroupSize) {
    return { success: false, message: `出道人数需在 ${CFG.rating.minGroupSize}-${CFG.rating.maxGroupSize} 人之间` }
  }

  for (const m of members) {
    if (m.status !== 'trainee') return { success: false, message: `${m.name} 无法出道` }
    if (calcTraineeScore(m) < CFG.rating.debutScoreThreshold) {
      return { success: false, message: `${m.name} 综合评分未达标（需 ≥${CFG.rating.debutScoreThreshold}）` }
    }
    if (m.reputation < CFG.rating.debutReputationThreshold) {
      return { success: false, message: `${m.name} 声望不足（需 ≥${CFG.rating.debutReputationThreshold}）` }
    }
  }

  const groupId = `g_${Date.now()}`
  const trainees = state.trainees.map((t) => {
    if (memberIds.includes(t.id)) {
      return { ...t, status: 'debuted', groupId }
    }
    return t
  })

  const avgStats = {}
  for (const key of CFG.stats) {
    avgStats[key] = Math.round(members.reduce((s, m) => s + m.stats[key], 0) / members.length)
  }

  const groups = [
    ...state.groups,
    {
      id: groupId,
      name: groupName || `${members.map((m) => m.name[0]).join('')}组`,
      memberIds: [...memberIds],
      debutedDay: state.day,
      avgStats,
      totalSales: 0,
      singles: [],
    },
  ]

  const logs = [
    ...state.logs,
    {
      day: state.day,
      text: `🎉 组合「${groupName || groups[groups.length - 1].name}」正式出道！成员：${members.map((m) => m.name).join('、')}`,
    },
  ]

  return {
    success: true,
    state: { ...state, trainees, groups, logs, pendingRating: false },
  }
}

export function releaseSingle(state, groupId) {
  const group = state.groups.find((g) => g.id === groupId)
  if (!group) return { success: false, message: '组合不存在' }

  const lastDay = state.lastSingleDay[groupId] || 0
  if (state.day - lastDay < CFG.single.cooldownDays) {
    return {
      success: false,
      message: `距上次发歌还需 ${CFG.single.cooldownDays - (state.day - lastDay)} 天`,
    }
  }

  if (state.money < CFG.single.creationCost) {
    return { success: false, message: '资金不足' }
  }

  const members = state.trainees.filter((t) => group.memberIds.includes(t.id))
  const statAvg =
    CFG.stats.reduce((s, k) => s + group.avgStats[k], 0) / CFG.stats.length
  const charmAvg = group.avgStats.charm
  const popularity = state.fans + members.reduce((s, m) => s + m.fans, 0)

  const sales = Math.round(
    CFG.single.baseSales +
      statAvg * CFG.single.statWeight * 50 +
      popularity * CFG.single.fansWeight * 0.08 +
      charmAvg * CFG.single.charmWeight * 30 +
      randInt(-200, 400)
  )

  const revenue = sales * CFG.single.revenuePerSale
  const groups = state.groups.map((g) => {
    if (g.id !== groupId) return g
    return {
      ...g,
      totalSales: g.totalSales + sales,
      singles: [
        ...g.singles,
        { day: state.day, sales, revenue, title: `单曲 Vol.${g.singles.length + 1}` },
      ],
    }
  })

  const trainees = state.trainees.map((t) => {
    if (!group.memberIds.includes(t.id)) return t
    return { ...t, singlesReleased: t.singlesReleased + 1, fans: t.fans + Math.round(sales * 0.05) }
  })

  const logs = [
    ...state.logs,
    {
      day: state.day,
      text: `💿 ${group.name} 发行新单曲，销量 ${sales.toLocaleString()}，收入 ¥${revenue.toLocaleString()}！`,
    },
  ]

  return {
    success: true,
    state: {
      ...state,
      money: state.money - CFG.single.creationCost + revenue,
      totalRevenue: state.totalRevenue + revenue,
      totalExpenses: state.totalExpenses + CFG.single.creationCost,
      fans: state.fans + Math.round(sales * 0.02),
      groups,
      trainees,
      logs,
      lastSingleDay: { ...state.lastSingleDay, [groupId]: state.day },
    },
    sales,
    revenue,
  }
}

export function getRatingResults(state) {
  return getActiveTrainees(state)
    .filter((t) => t.status === 'trainee')
    .map((t) => ({
      ...t,
      score: calcTraineeScore(t),
      canDebut:
        calcTraineeScore(t) >= CFG.rating.debutScoreThreshold &&
        t.reputation >= CFG.rating.debutReputationThreshold,
    }))
    .sort((a, b) => b.score - a.score)
}

export function getAvailableChallengePhase(state) {
  const trainees = getActiveTrainees(state).filter((t) => t.status === 'trainee')
  if (trainees.length === 0) return null

  const avgReputation = trainees.reduce((s, t) => s + t.reputation, 0) / trainees.length

  for (let i = CFG.challenges.phases.length - 1; i >= 0; i--) {
    const phase = CFG.challenges.phases[i]
    const eligible = trainees.filter(
      (t) => t.reputation >= phase.minReputation && t.reputation < phase.maxReputation
    )
    if (eligible.length > 0) {
      return phase
    }
  }
  return CFG.challenges.phases[0]
}

export function getEligibleTrainees(state, phaseId) {
  const phase = CFG.challenges.phases.find((p) => p.id === phaseId)
  if (!phase) return []
  return getActiveTrainees(state)
    .filter((t) => t.status === 'trainee')
    .filter((t) => t.reputation >= phase.minReputation && t.reputation < phase.maxReputation)
    .filter((t) => t.illnessDays === 0)
    .sort((a, b) => calcTraineeScore(b) - calcTraineeScore(a))
}

export function canStartChallengeSignup(state) {
  if (state.currentChallenge) return false
  if (state.pendingChallengeResult) return false
  const daysSinceLast = state.day - state.lastChallengeDay
  return daysSinceLast >= CFG.challenges.interval
}

export function getDaysUntilNextChallenge(state) {
  if (state.currentChallenge || state.pendingChallengeResult) return 0
  const daysSinceLast = state.day - state.lastChallengeDay
  return Math.max(0, CFG.challenges.interval - daysSinceLast)
}

export function startChallengeSignup(state, phaseId) {
  const phase = CFG.challenges.phases.find((p) => p.id === phaseId)
  if (!phase) return { success: false, message: '赛事不存在' }
  if (!canStartChallengeSignup(state)) {
    return { success: false, message: '当前无法开启报名' }
  }

  const eligible = getEligibleTrainees(state, phaseId)
  if (eligible.length === 0) {
    return { success: false, message: '没有符合条件的练习生' }
  }

  return {
    success: true,
    state: {
      ...state,
      currentChallenge: {
        phaseId,
        phaseName: phase.name,
        phaseTier: phase.tier,
        status: 'signup',
        participants: [],
      },
      challengeSignups: [],
    },
  }
}

export function signupForChallenge(state, traineeId) {
  if (!state.currentChallenge || state.currentChallenge.status !== 'signup') {
    return { success: false, message: '当前不在报名阶段' }
  }

  const phase = CFG.challenges.phases.find((p) => p.id === state.currentChallenge.phaseId)
  if (!phase) return { success: false, message: '赛事不存在' }

  if (state.challengeSignups.length >= phase.participants) {
    return { success: false, message: `报名人数已满（${phase.participants}人）` }
  }

  const trainee = state.trainees.find((t) => t.id === traineeId)
  if (!trainee) return { success: false, message: '练习生不存在' }
  if (trainee.status !== 'trainee') return { success: false, message: '仅练习生可参赛' }
  if (trainee.illnessDays > 0) return { success: false, message: '休养中无法参赛' }
  if (state.challengeSignups.includes(traineeId)) {
    return { success: false, message: '已报名' }
  }

  if (state.money < CFG.challenges.entryFee) {
    return { success: false, message: '资金不足' }
  }

  if (
    trainee.reputation < phase.minReputation ||
    trainee.reputation >= phase.maxReputation
  ) {
    return { success: false, message: '声望不符合要求' }
  }

  return {
    success: true,
    state: {
      ...state,
      money: state.money - CFG.challenges.entryFee,
      totalExpenses: state.totalExpenses + CFG.challenges.entryFee,
      challengeSignups: [...state.challengeSignups, traineeId],
      logs: [
        ...state.logs,
        { day: state.day, text: `${trainee.name} 报名参加「${state.currentChallenge.phaseName}」！` },
      ],
    },
  }
}

export function cancelChallengeSignup(state, traineeId) {
  if (!state.currentChallenge || state.currentChallenge.status !== 'signup') {
    return { success: false, message: '当前不在报名阶段' }
  }
  if (!state.challengeSignups.includes(traineeId)) {
    return { success: false, message: '未报名' }
  }

  const trainee = state.trainees.find((t) => t.id === traineeId)

  return {
    success: true,
    state: {
      ...state,
      money: state.money + CFG.challenges.entryFee,
      totalExpenses: state.totalExpenses - CFG.challenges.entryFee,
      challengeSignups: state.challengeSignups.filter((id) => id !== traineeId),
      logs: trainee
        ? [
            ...state.logs,
            { day: state.day, text: `${trainee.name} 取消了挑战赛报名。` },
          ]
        : state.logs,
    },
  }
}

function generateNpcParticipants(phase, count) {
  const npcs = []
  const baseNames = [
    '王雨桐', '李诗涵', '张梦瑶', '刘思琪', '陈雨萱',
    '杨紫涵', '黄诗琪', '周佳怡', '吴雨欣', '郑雅文',
    '孙若曦', '朱婉清', '马思远', '胡静怡', '林婉如',
    '徐若琳', '何梦瑶', '罗思琪', '梁婉清', '宋雨桐',
  ]
  const shuffled = [...baseNames].sort(() => Math.random() - 0.5)

  const repRange = [phase.minReputation, Math.min(phase.maxReputation - 1, phase.minReputation + 30)]
  const scoreBase = 35 + phase.tier * 12

  for (let i = 0; i < count; i++) {
    const stats = {}
    for (const key of CFG.stats) {
      stats[key] = randInt(scoreBase - 10, scoreBase + 15)
    }
    const name = shuffled[i % shuffled.length] + (i >= shuffled.length ? String(i - shuffled.length + 2) : '')
    npcs.push({
      id: `npc_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      stats,
      reputation: randInt(repRange[0], repRange[1]),
      isNpc: true,
    })
  }
  return npcs
}

export function startChallenge(state) {
  if (!state.currentChallenge || state.currentChallenge.status !== 'signup') {
    return { success: false, message: '当前不在报名阶段' }
  }
  if (state.challengeSignups.length === 0) {
    return { success: false, message: '至少需要1名练习生报名' }
  }

  const phase = CFG.challenges.phases.find((p) => p.id === state.currentChallenge.phaseId)
  if (!phase) return { success: false, message: '赛事不存在' }

  let playerParticipants = state.challengeSignups.map((id) => {
    const t = state.trainees.find((tr) => tr.id === id)
    return { ...t, score: calcTraineeScore(t), isNpc: false }
  })

  if (playerParticipants.length > phase.participants) {
    playerParticipants = playerParticipants
      .sort((a, b) => b.score - a.score)
      .slice(0, phase.participants)
  }

  const npcCount = phase.participants - playerParticipants.length
  const npcParticipants = generateNpcParticipants(phase, Math.max(0, npcCount)).map((n) => ({
    ...n,
    score: calcTraineeScore(n),
  }))

  const allParticipants = [...playerParticipants, ...npcParticipants]
    .map((p) => ({
      ...p,
      finalScore: p.score + randInt(-8, 12),
    }))
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, phase.participants)

  return {
    success: true,
    state: {
      ...state,
      currentChallenge: {
        ...state.currentChallenge,
        status: 'result',
        participants: allParticipants,
      },
      pendingChallengeResult: true,
    },
  }
}

export function settleChallenge(state) {
  if (!state.currentChallenge || !state.pendingChallengeResult) {
    return { success: false, message: '没有待结算的赛事' }
  }

  const phase = CFG.challenges.phases.find((p) => p.id === state.currentChallenge.phaseId)
  if (!phase) return { success: false, message: '赛事不存在' }

  const maxRank = Object.keys(phase.rewards).length
  const participants = state.currentChallenge.participants
    .slice()
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, phase.participants)

  const logs = [...state.logs]
  let totalMoneyReward = 0
  let totalFansGain = 0

  const trainees = state.trainees.map((t) => ({ ...t, stats: { ...t.stats } }))

  logs.push({
    day: state.day,
    text: `🏆「${state.currentChallenge.phaseName}」结果出炉！`,
  })

  participants.forEach((p, index) => {
    const rank = index + 1
    if (rank > maxRank) return

    const reward = phase.rewards[rank]
    if (!reward) return

    if (!p.isNpc) {
      const trainee = trainees.find((t) => t.id === p.id)
      if (trainee) {
        trainee.reputation += reward.reputation
        trainee.fans += reward.fans
        trainee.challengeParticipations += 1
        if (rank === 1) trainee.challengeWins += 1

        totalMoneyReward += reward.money
        totalFansGain += reward.fans

        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `第${rank}名`
        logs.push({
          day: state.day,
          text: `  ${medal} ${trainee.name}：奖金 ¥${reward.money}，声望 +${reward.reputation}，粉丝 +${reward.fans}`,
        })
      }
    }
  })

  const newChallenge = {
    phaseId: state.currentChallenge.phaseId,
    phaseName: state.currentChallenge.phaseName,
    day: state.day,
    participants: participants.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.finalScore,
      isNpc: p.isNpc,
    })),
  }

  return {
    success: true,
    state: {
      ...state,
      money: state.money + totalMoneyReward,
      totalRevenue: state.totalRevenue + totalMoneyReward,
      fans: state.fans + totalFansGain,
      trainees,
      currentChallenge: null,
      challengeSignups: [],
      pendingChallengeResult: false,
      lastChallengeDay: state.day,
      challengeHistory: [...state.challengeHistory, newChallenge],
      logs,
    },
  }
}
