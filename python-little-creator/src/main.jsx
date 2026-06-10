import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import Editor from '@monaco-editor/react'
import lessons from './data/lessons.json'
import projects from './data/projects.json'
import towerLevels from './data/towerLevels.json'
import { AI_TYPES, buildAiMessages, getAiTypeLabel, getThinkPrompt } from './utils/aiPrompts'
import {
  AI_MODE_STORAGE_KEY,
  DEEPSEEK_BASE_URL_STORAGE_KEY,
  DEEPSEEK_API_KEY_STORAGE_KEY,
  DEEPSEEK_MODEL_STORAGE_KEY,
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_MODEL,
  callDeepSeek,
  describeDeepSeekFailure,
  getTodayUsage,
  incrementTodayUsage,
  maskApiKey,
  normalizeBaseUrl,
  saveAiFeedback,
  testDeepSeekKey,
  validateApiKey,
  validateBaseUrl,
} from './utils/deepseekClient'
import { explainPythonError } from './utils/errorExplainer'
import './styles.css'

const STORAGE_KEY = 'python-little-creator:v3'
const STAGE_TWO_STORAGE_KEY = 'python-little-creator:v2'
const LEGACY_STORAGE_KEY = 'python-little-creator:v1'
const PYODIDE_VERSION = '0.26.4'
const MAX_OUTPUT_LINES = 100
const RUN_TIMEOUT_MS = 8000
const TEMP_CHALLENGE_PREFIX = 'plc_temp_challenge_lesson_'
const PROJECT_PROGRESS_STORAGE_KEY = 'plc_project_progress'
const TOWER_PROGRESS_STORAGE_KEY = 'plc_tower_progress'
const CURRENT_PROJECT_STORAGE_KEY = 'plc_current_project_id'
const CURRENT_TOWER_STORAGE_KEY = 'plc_current_tower_id'
const LEARNING_MODE_STORAGE_KEY = 'plc_learning_mode'
const LEARNING_PROFILE_STORAGE_KEY = 'plc_learning_profile'

const coachExampleStyles = ['生活版', '游戏版', 'Minecraft版', '英语单词版', '勇者战斗版']
const profileConceptRules = [
  { key: 'print', labels: ['print', '输出'] },
  { key: 'input', labels: ['input', '输入'] },
  { key: 'variable', labels: ['变量'] },
  { key: 'if', labels: ['if', 'elif', 'else', '判断'] },
  { key: 'for', labels: ['for', 'range', '循环'] },
  { key: 'list', labels: ['list', '列表'] },
  { key: 'dict', labels: ['dict', '字典'] },
  { key: 'function', labels: ['def', '函数'] },
  { key: 'return', labels: ['return'] },
  { key: 'while', labels: ['while', 'break'] },
]

const availableLessons = lessons.filter((lesson) => lesson.status === 'available')
const badgeDefinitions = [
  { id: 'first-code', title: '第一行代码', lessonId: 'lesson-01-hello' },
  { id: 'card-designer', title: '名片设计师', lessonId: 'lesson-02-card' },
  { id: 'variable-star', title: '变量小达人', lessonId: 'lesson-03-variables' },
  { id: 'condition-helper', title: '判断小能手', lessonId: 'lesson-07-weather' },
  { id: 'loop-star', title: '循环小达人', lessonId: 'lesson-09-countdown' },
  { id: 'game-maker', title: '小游戏创造师', lessonId: 'lesson-12-quiz' },
]

const projectBadgeDefinitions = [
  { id: 'project-intro', title: '小小介绍官', projectId: 'project-1-intro-bot' },
  { id: 'project-word', title: '单词小助手', projectId: 'project-2-word-helper' },
  { id: 'project-calc', title: '生活计算师', projectId: 'project-3-life-calculator' },
  { id: 'project-checkin', title: '打卡小管家', projectId: 'project-4-task-checkin' },
  { id: 'project-quiz', title: '闯关设计师', projectId: 'project-5-quiz-game' },
  { id: 'project-box', title: '宝箱探险家', projectId: 'project-6-random-box' },
  { id: 'project-story', title: '故事冒险家', projectId: 'project-7-text-adventure' },
  { id: 'project-helper', title: 'Python 小创造师', projectId: 'project-8-python-helper' },
]

const towerBadgeDefinitions = [
  { id: 'tower-say', title: '勇者开口啦', towerId: 'tower-1' },
  { id: 'tower-attack', title: '连击新手', towerId: 'tower-2' },
  { id: 'tower-variable', title: '变量勇者', towerId: 'tower-3' },
  { id: 'tower-input', title: '输入指挥官', towerId: 'tower-4' },
  { id: 'tower-if', title: '判断小队长', towerId: 'tower-5' },
  { id: 'tower-loop', title: '连击高手', towerId: 'tower-6' },
  { id: 'tower-hp', title: '血量观察员', towerId: 'tower-7' },
  { id: 'tower-bag', title: '背包管理员', towerId: 'tower-8' },
  { id: 'tower-dict', title: '怪物资料师', towerId: 'tower-9' },
  { id: 'tower-def', title: '技能创造师', towerId: 'tower-10' },
  { id: 'tower-return', title: '伤害计算师', towerId: 'tower-11' },
  { id: 'tower-random', title: '宝箱探险家', towerId: 'tower-12' },
]

const learningStages = [
  {
    id: 1,
    range: [1, 12],
    title: '我会让电脑听我说话',
    goal: '学会输出、变量、输入、判断、循环和简单计分。',
    canDo: ['自我介绍机器人', '夸夸机器人', '简单问答游戏'],
  },
  {
    id: 2,
    range: [13, 24],
    title: '我会做生活小工具',
    goal: '学会列表、字典、函数和简单菜单。',
    canDo: ['任务打卡系统', '菜单小助手', '简单记账本'],
  },
  {
    id: 3,
    range: [25, 36],
    title: '我会做自己的小作品',
    goal: '学会字符串处理、找 Bug、random 和综合应用。',
    canDo: ['故事生成器', '问卷机', '学习计划表', 'Python 小助手'],
  },
  {
    id: 4,
    range: [37, 60],
    title: '我能写更完整的小程序',
    goal: '学会 len、strip、lower、in、列表进阶、字典进阶、函数参数、return、while、break。',
    canDo: ['背单词机', '猜数字游戏', '勇者塔战斗逻辑', '积分系统'],
  },
]

const finalLearningGoals = [
  '看懂简单 Python 程序',
  '自己写输入、判断和循环',
  '用列表和字典保存资料',
  '用函数整理重复代码',
  '做一个简单小游戏',
  '做一个背单词小助手',
  '做一个任务打卡系统',
  '做一个简单的勇者战斗程序',
]

const milestoneRoute = [
  { afterLesson: 10, title: '聊天机器人作品' },
  { afterLesson: 20, title: '任务打卡助手' },
  { afterLesson: 30, title: '背单词小老师' },
  { afterLesson: 40, title: '背包系统' },
  { afterLesson: 50, title: '怪物资料卡' },
  { afterLesson: 60, title: '毕业作品' },
]

function readStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {}
  } catch {
    return {}
  }
}

function loadSavedState() {
  const saved = readStorage(STORAGE_KEY)
  const stageTwo = readStorage(STAGE_TWO_STORAGE_KEY)
  const legacy = readStorage(LEGACY_STORAGE_KEY)

  return {
    completedLessons: saved.completedLessons || stageTwo.completedLessons || [],
    currentLessonId:
      saved.currentLessonId || stageTwo.currentLessonId || legacy.currentLessonId || availableLessons[0].id,
    lessonCodeMap: saved.lessonCodeMap || stageTwo.lessonCodeMap || legacy.codeByLesson || {},
    runCountMap: saved.runCountMap || stageTwo.runCountMap || {},
    checkPassedMap: saved.checkPassedMap || stageTwo.checkPassedMap || {},
    lessonInputMap: saved.lessonInputMap || {},
    earnedBadges: saved.earnedBadges || [],
    lastStudyAt: saved.lastStudyAt || null,
  }
}

function saveState(nextState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState))
}

function countOutputLines(output) {
  return output.split(/\r?\n/).filter((line) => line.trim().length > 0).length
}

function limitOutputLines(text) {
  const lines = text.split(/\r?\n/)
  if (lines.length <= MAX_OUTPUT_LINES) {
    return text
  }

  return `${lines.slice(0, MAX_OUTPUT_LINES).join('\n')}\n\n输出太多，已帮你截断前 100 行。`
}

function describeRule(rule) {
  if (rule.type === 'run_success') return '代码需要成功运行'
  if (rule.type === 'output_contains') return `输出需要包含“${rule.value}”`
  if (rule.type === 'code_contains') return `代码需要包含“${rule.value}”`
  if (rule.type === 'code_not_contains') return `代码不能包含“${rule.value}”`
  if (rule.type === 'output_line_count_at_least') return `输出至少 ${rule.value} 行`
  if (rule.type === 'code_contains_any') return `代码需要包含其中一个：${rule.value.join('、')}`
  if (rule.type === 'actionIncludes') return `画面动作需要包含 ${rule.actionType}`
  if (rule.type === 'minActions') return `${rule.actionType} 动作至少 ${rule.value} 次`
  if (rule.type === 'starsAtLeast') return `至少获得 ${rule.value} 颗星星`
  return '未知检查规则'
}

function evaluateRule(rule, code, runResult) {
  if (rule.type === 'run_success') return runResult.ok
  if (rule.type === 'output_contains') return runResult.output.includes(rule.value)
  if (rule.type === 'code_contains') return code.includes(rule.value)
  if (rule.type === 'code_not_contains') return !code.includes(rule.value)
  if (rule.type === 'output_line_count_at_least') return countOutputLines(runResult.output) >= rule.value
  if (rule.type === 'code_contains_any') return rule.value.some((keyword) => code.includes(keyword))
  if (rule.type === 'actionIncludes') {
    return runResult.towerActions?.some((action) => (
      action.type === rule.actionType && (!rule.textIncludes || action.text?.includes(rule.textIncludes))
    ))
  }
  if (rule.type === 'minActions') {
    return (runResult.towerActions || []).filter((action) => action.type === rule.actionType).length >= rule.value
  }
  if (rule.type === 'starsAtLeast') {
    return (runResult.towerActions || []).filter((action) => action.type === 'star').length >= rule.value
  }
  return false
}

function formatStudyTime(value) {
  if (!value) return '暂无记录'

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function normalizeProject(project) {
  return {
    ...project,
    concept: project.skills.join(' / '),
    story: project.scene,
    explanation: `这是一个项目作品，会用到：${project.skills.join('、')}。`,
    modifyTask: project.requirements.join('；'),
    challengeTask: project.challenge,
    hint: project.hint,
    sampleInput: project.inputMock || '',
  }
}

function normalizeTowerLevel(level) {
  return {
    ...level,
    concept: level.skill,
    story: level.scene,
    explanation: level.explain,
    modifyTask: level.modifyTask.join('；'),
    challengeTask: level.tasks.join('；'),
    hint: level.hint,
  }
}

function getInitialTowerState(level) {
  return {
    hero: { ...level.hero },
    monster: { ...level.monster },
    speech: '',
    score: null,
    item: '',
    logs: ['勇者进入了这一层。'],
    notice: '运行代码后，战斗日志会记录动作。',
  }
}

function applyTowerActions(level, actions) {
  const state = getInitialTowerState(level)
  const logs = [...state.logs]

  actions.forEach((action) => {
    if (action.type === 'say') {
      state.speech = action.text
      logs.push(`勇者说：${action.text}`)
    }
    if (action.type === 'attack') {
      const damage = Number(state.hero.attack || 1)
      state.monster.hp = Math.max(0, Number(state.monster.hp || 0) - damage)
      logs.push(`勇者攻击，怪物受到 ${damage} 点伤害。`)
    }
    if (action.type === 'heal') {
      const amount = Number(action.amount ?? 2)
      state.hero.hp = Math.min(Number(state.hero.maxHp || state.hero.hp), Number(state.hero.hp || 0) + amount)
      logs.push(`勇者恢复 ${amount} 点 HP。`)
    }
    if (action.type === 'coin') {
      const amount = Number(action.amount ?? 1)
      state.hero.coins = Number(state.hero.coins || 0) + amount
      logs.push(`获得 ${amount} 枚金币。`)
    }
    if (action.type === 'star') {
      state.hero.stars = Number(state.hero.stars || 0) + 1
      logs.push('获得 1 颗星。')
    }
    if (action.type === 'score') {
      state.score = action.value
      logs.push(`当前分数：${action.value}`)
    }
    if (action.type === 'damage') {
      logs.push(`计算出的伤害是：${action.value}`)
    }
    if (action.type === 'status') {
      logs.push(`勇者 HP：${state.hero.hp}，怪物 HP：${state.monster.hp}，金币：${state.hero.coins}。`)
    }
    if (action.type === 'item') {
      state.item = action.value
      logs.push(`获得物品：${action.value}`)
    }
  })

  state.logs = logs
  state.notice = logs[logs.length - 1]
  return state
}

function readLearningProfile() {
  const saved = readStorage(LEARNING_PROFILE_STORAGE_KEY)
  return profileConceptRules.reduce((profile, rule) => ({
    ...profile,
    [rule.key]: {
      practiceCount: Number(saved[rule.key]?.practiceCount || 0),
      lastSeen: saved[rule.key]?.lastSeen || '',
      notes: saved[rule.key]?.notes || '',
    },
  }), {})
}

function inferProfileKey(item) {
  const text = [
    item?.title,
    item?.concept,
    item?.syntaxFocus,
    item?.skill,
    item?.skills?.join(' '),
    item?.explanation,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return profileConceptRules.find((rule) => (
    rule.labels.some((label) => text.includes(label.toLowerCase()))
  ))?.key || 'print'
}

function getModuleName(mode) {
  if (mode === 'projects') return '项目创造营'
  if (mode === 'games') return 'Python 勇者塔'
  if (mode === 'coach') return 'AI 学习教练'
  return '基础训练营'
}

function buildCoachMessages({
  type,
  style,
  projectIdea,
  moduleName,
  lesson,
  code,
  output,
  friendlyError,
  checkResult,
  runCount,
  profileNote,
}) {
  const system = [
    '你是“Python 小小创造师”的 AI 学习教练，服务 8-10 岁孩子和家长。',
    '你不是聊天机器人，也不是答案机器。',
    '不要直接给出完整可复制答案，不替孩子完成作业。',
    '如果必须举例，只给很短的关键片段；代码不要超过要求行数。',
    '优先用“你可以检查……”“你可以试着……”“想一想……”来引导。',
    '一次只解决一个重点，语言温和、具体、鼓励，不要打分，不要批评孩子。',
  ].join('\n')

  const sharedContext = [
    `当前模块：${moduleName}`,
    `当前课程：${lesson?.title || '未选择课程'}`,
    `知识点：${lesson?.concept || lesson?.syntaxFocus || lesson?.skill || lesson?.skills?.join('、') || 'Python 基础'}`,
    `当前任务：${lesson?.goal || lesson?.challengeTask || lesson?.tasks?.join('；') || '完成当前练习'}`,
    `当前代码：\n${code || '还没有代码'}`,
    `最近输出：\n${output || '还没有运行输出'}`,
    `最近错误：\n${friendlyError?.originalError || '没有错误'}`,
    `本地错误提示：${friendlyError?.simpleExplanation || '没有本地错误提示'}`,
    `检查任务：${checkResult ? (checkResult.passed ? '已通过' : `未通过：${checkResult.failedRules?.join('；') || checkResult.message}`) : '还没有检查'}`,
    `本课运行次数：${runCount}`,
    `本地学习画像备注：${profileNote || '暂无'}`,
  ].join('\n\n')

  const taskPrompts = {
    diagnose: [
      '请判断孩子可能掌握了什么、哪里还没真正理解。',
      '输出格式必须是：',
      '理解比较好：',
      '- ...',
      '可能还需要练：',
      '- ...',
      '下一步建议：',
      '- ...',
      '控制在 200 字以内，不要直接给答案。',
    ].join('\n'),
    example: [
      `请用“${style}”重新解释同一个知识点。`,
      '输出必须包含：一个简单故事、一个小代码例子、一个提问。',
      '代码例子不超过 8 行，不要引入当前课程之后太多新知识。',
      '不要给当前任务的完整答案。',
    ].join('\n'),
    exercise: [
      '请根据当前知识点和孩子最近表现，只生成 1 个定向小练习。',
      '输出格式必须是：',
      '练习目标：',
      '任务：',
      '提示：',
      '完成后问自己：',
      '练习要小，能在当前编辑器里完成，不直接给完整答案。',
    ].join('\n'),
    projectPlan: [
      `孩子想做一个：${projectIdea || '自己的小项目'}`,
      '请只帮孩子拆步骤，不要写完整代码。',
      '输出格式必须是：',
      '项目目标：',
      '第一步：',
      '第二步：',
      '第三步：',
      '最简单版本：',
      '以后可以升级：',
      '可能会用到的 Python 本领：',
      '鼓励孩子先做最简单版本。',
    ].join('\n'),
  }

  return [
    { role: 'system', content: system },
    { role: 'user', content: `${sharedContext}\n\n本次请求：\n${taskPrompts[type]}` },
  ]
}

function App() {
  const savedState = useMemo(loadSavedState, [])
  const safeInitialLesson = lessons.find(
    (lesson) => lesson.id === savedState.currentLessonId && lesson.status === 'available',
  )
  const [currentLessonId, setCurrentLessonId] = useState(safeInitialLesson?.id || availableLessons[0].id)
  const currentLesson = lessons.find((lesson) => lesson.id === currentLessonId) || availableLessons[0]
  const [learningMode, setLearningMode] = useState(() => {
    const savedMode = localStorage.getItem(LEARNING_MODE_STORAGE_KEY) || 'lessons'
    return savedMode === 'games' ? 'lessons' : savedMode
  })
  const [currentProjectId, setCurrentProjectId] = useState(
    () => localStorage.getItem(CURRENT_PROJECT_STORAGE_KEY) || projects[0].id,
  )
  const [currentTowerId, setCurrentTowerId] = useState(
    () => localStorage.getItem(CURRENT_TOWER_STORAGE_KEY) || towerLevels[0].id,
  )
  const currentProject = projects.find((project) => project.id === currentProjectId) || projects[0]
  const currentTower = towerLevels.find((level) => level.id === currentTowerId) || towerLevels[0]
  const isProjectMode = learningMode === 'projects'
  const isTowerMode = learningMode === 'games'
  const isCoachMode = learningMode === 'coach'
  const activeItem = isTowerMode ? normalizeTowerLevel(currentTower) : (isProjectMode ? normalizeProject(currentProject) : currentLesson)
  const [completedLessons, setCompletedLessons] = useState(savedState.completedLessons)
  const [lessonCodeMap, setLessonCodeMap] = useState(savedState.lessonCodeMap)
  const [runCountMap, setRunCountMap] = useState(savedState.runCountMap)
  const [checkPassedMap, setCheckPassedMap] = useState(savedState.checkPassedMap)
  const [lessonInputMap, setLessonInputMap] = useState(savedState.lessonInputMap)
  const [earnedBadges, setEarnedBadges] = useState(savedState.earnedBadges)
  const [lastStudyAt, setLastStudyAt] = useState(savedState.lastStudyAt)
  const [newBadge, setNewBadge] = useState(null)
  const [output, setOutput] = useState('')
  const [interactiveEvents, setInteractiveEvents] = useState([])
  const [friendlyError, setFriendlyError] = useState(null)
  const [errorHintLevel, setErrorHintLevel] = useState(1)
  const [checkResult, setCheckResult] = useState(null)
  const [lessonNotice, setLessonNotice] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [pythonLoadStatus, setPythonLoadStatus] = useState('idle')
  const [pythonLoadProgress, setPythonLoadProgress] = useState(0)
  const [pythonLoadMessage, setPythonLoadMessage] = useState('Python 小助手正在准备中……')
  const [savedApiKey, setSavedApiKey] = useState(() => localStorage.getItem(DEEPSEEK_API_KEY_STORAGE_KEY) || '')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [deepSeekBaseUrl, setDeepSeekBaseUrl] = useState(() => (
    localStorage.getItem(DEEPSEEK_BASE_URL_STORAGE_KEY) || DEFAULT_DEEPSEEK_BASE_URL
  ))
  const [deepSeekModel, setDeepSeekModel] = useState(() => (
    localStorage.getItem(DEEPSEEK_MODEL_STORAGE_KEY) || DEFAULT_DEEPSEEK_MODEL
  ))
  const [apiStatusMessage, setApiStatusMessage] = useState('')
  const [apiTestStatus, setApiTestStatus] = useState('')
  const [aiMode, setAiMode] = useState(() => localStorage.getItem(AI_MODE_STORAGE_KEY) || 'child')
  const [aiUsageCount, setAiUsageCount] = useState(() => getTodayUsage())
  const [aiThinkingRequest, setAiThinkingRequest] = useState(null)
  const [aiPanel, setAiPanel] = useState(null)
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [aiFeedbackMessage, setAiFeedbackMessage] = useState('')
  const [learningProfile, setLearningProfile] = useState(readLearningProfile)
  const [coachStyle, setCoachStyle] = useState(coachExampleStyles[0])
  const [coachProjectIdea, setCoachProjectIdea] = useState('')
  const [coachResult, setCoachResult] = useState(null)
  const [isCoachLoading, setIsCoachLoading] = useState(false)
  const [tempChallenge, setTempChallenge] = useState(() => (
    localStorage.getItem(`${TEMP_CHALLENGE_PREFIX}${isProjectMode ? currentProjectId : currentLessonId}`) || ''
  ))
  const [projectProgress, setProjectProgress] = useState(() => readStorage(PROJECT_PROGRESS_STORAGE_KEY))
  const [towerProgress, setTowerProgress] = useState(() => readStorage(TOWER_PROGRESS_STORAGE_KEY))
  const [towerActions, setTowerActions] = useState([])
  const [towerState, setTowerState] = useState(() => getInitialTowerState(currentTower))
  const pyodideRef = useRef(null)
  const pyodideLoadingPromiseRef = useRef(null)
  const pythonLoadTimersRef = useRef([])
  const runTokenRef = useRef(0)

  const completedProjectCount = projects.filter((project) => projectProgress[project.id]?.completed).length
  const projectProgressPercent = Math.round((completedProjectCount / projects.length) * 100)
  const completedTowerCount = towerLevels.filter((level) => towerProgress[level.id]?.completed).length
  const towerProgressPercent = Math.round((completedTowerCount / towerLevels.length) * 100)
  const currentLessonIndex = availableLessons.findIndex((lesson) => lesson.id === currentLesson.id)
  const coreLessons = availableLessons.filter((lesson) => lesson.type !== 'milestoneProject')
  const completedCoreCount = coreLessons.filter((lesson) => completedLessons.includes(lesson.id)).length
  const coreProgressPercent = Math.round((completedCoreCount / coreLessons.length) * 100)
  const currentProjectIndex = projects.findIndex((project) => project.id === currentProject.id)
  const currentTowerIndex = towerLevels.findIndex((level) => level.id === currentTower.id)
  const currentLessonNumber = currentLesson.type === 'milestoneProject'
    ? currentLesson.afterLesson
    : Math.max(1, coreLessons.findIndex((lesson) => lesson.id === currentLesson.id) + 1)
  const currentLessonLabel = currentLesson.type === 'milestoneProject'
    ? `阶段作品 · 第 ${currentLesson.afterLesson} 课后`
    : `第 ${currentLessonNumber} 课`
  const currentStage = learningStages.find(
    (stage) => currentLessonNumber >= stage.range[0] && currentLessonNumber <= stage.range[1],
  ) || learningStages[0]
  const stageTotal = currentStage.range[1] - currentStage.range[0] + 1
  const stageCurrent = Math.min(stageTotal, Math.max(1, currentLessonNumber - currentStage.range[0] + 1))
  const stageCompletedCount = coreLessons.filter((lesson, index) => {
    const lessonNumber = index + 1
    return lessonNumber >= currentStage.range[0]
      && lessonNumber <= currentStage.range[1]
      && completedLessons.includes(lesson.id)
  }).length
  const stageProgressPercent = Math.round((stageCompletedCount / stageTotal) * 100)
  const nextLesson = availableLessons[currentLessonIndex + 1]
  const nextProject = projects[currentProjectIndex + 1]
  const nextTower = towerLevels[currentTowerIndex + 1]
  const isCurrentCompleted = isProjectMode
    ? Boolean(projectProgress[currentProject.id]?.completed)
    : (isTowerMode ? Boolean(towerProgress[currentTower.id]?.completed) : completedLessons.includes(currentLesson.id))
  const currentCode = lessonCodeMap[activeItem.id] ?? activeItem.starterCode
  const currentInput = lessonInputMap[activeItem.id] ?? activeItem.sampleInput ?? ''
  const projectRunCount = projectProgress[currentProject.id]?.runCount || 0
  const towerRunCount = towerProgress[currentTower.id]?.runCount || 0
  const totalRunCount = Object.values(runCountMap).reduce((sum, count) => sum + count, 0)
    + Object.values(projectProgress).reduce((sum, progress) => sum + (progress.runCount || 0), 0)
    + Object.values(towerProgress).reduce((sum, progress) => sum + (progress.runCount || 0), 0)
  const activeRunCount = isTowerMode ? towerRunCount : (isProjectMode ? projectRunCount : (runCountMap[currentLesson.id] || 0))
  const needsInput = activeItem.checkRules?.some((rule) => rule.type === 'code_contains' && rule.value === 'input')
    || currentCode.includes('input(')

  useEffect(() => {
    saveState({
      completedLessons,
      currentLessonId,
      lessonCodeMap,
      runCountMap,
      checkPassedMap,
      lessonInputMap,
      earnedBadges,
      lastStudyAt,
    })
  }, [
    completedLessons,
    currentLessonId,
    lessonCodeMap,
    runCountMap,
    checkPassedMap,
    lessonInputMap,
    earnedBadges,
    lastStudyAt,
  ])

  useEffect(() => {
    setTempChallenge(localStorage.getItem(`${TEMP_CHALLENGE_PREFIX}${currentLesson.id}`) || '')
    setAiThinkingRequest(null)
    setAiFeedbackMessage('')
  }, [currentLesson.id])

  useEffect(() => {
    localStorage.setItem(PROJECT_PROGRESS_STORAGE_KEY, JSON.stringify(projectProgress))
  }, [projectProgress])

  useEffect(() => {
    localStorage.setItem(TOWER_PROGRESS_STORAGE_KEY, JSON.stringify(towerProgress))
  }, [towerProgress])

  useEffect(() => {
    localStorage.setItem(LEARNING_PROFILE_STORAGE_KEY, JSON.stringify(learningProfile))
  }, [learningProfile])

  useEffect(() => {
    localStorage.setItem(LEARNING_MODE_STORAGE_KEY, learningMode)
    localStorage.setItem(CURRENT_PROJECT_STORAGE_KEY, currentProjectId)
    localStorage.setItem(CURRENT_TOWER_STORAGE_KEY, currentTowerId)
    setTempChallenge(localStorage.getItem(`${TEMP_CHALLENGE_PREFIX}${activeItem.id}`) || '')
    setAiThinkingRequest(null)
    setAiFeedbackMessage('')
    setCoachResult(null)
    if (learningMode === 'games') {
      setTowerActions([])
      setTowerState(getInitialTowerState(currentTower))
    }
  }, [learningMode, currentProjectId, currentTowerId, activeItem.id])

  useEffect(() => {
    getPyodide().catch(() => {
      // The status card shows the friendly error. Reading lessons and editing code still work.
    })

    return () => {
      clearPythonLoadTimers()
    }
  }, [])

  function clearPythonLoadTimers() {
    pythonLoadTimersRef.current.forEach((timerId) => window.clearTimeout(timerId))
    pythonLoadTimersRef.current = []
  }

  function startPythonLoadProgress() {
    clearPythonLoadTimers()
    setPythonLoadStatus('loading')
    setPythonLoadProgress(15)
    setPythonLoadMessage('Python 小助手正在准备中……')

    pythonLoadTimersRef.current = [
      window.setTimeout(() => {
        setPythonLoadProgress(35)
        setPythonLoadMessage('第一次打开可能会慢一点。')
      }, 2000),
      window.setTimeout(() => {
        setPythonLoadProgress(65)
        setPythonLoadMessage('准备好后就能运行代码啦。')
      }, 6000),
      window.setTimeout(() => {
        setPythonLoadStatus('slow')
        setPythonLoadProgress(90)
        setPythonLoadMessage('Python 小助手还在准备中，第一次会久一点。')
      }, 12000),
      window.setTimeout(() => {
        setPythonLoadStatus('slow')
        setPythonLoadProgress(90)
        setPythonLoadMessage('还在准备中，可以先看看今天目标。')
      }, 45000),
    ]
  }

  async function getPyodide() {
    if (pyodideRef.current) {
      setPythonLoadStatus('ready')
      setPythonLoadProgress(100)
      setPythonLoadMessage('Python 小助手准备完成')
      return pyodideRef.current
    }

    if (pyodideLoadingPromiseRef.current) {
      return pyodideLoadingPromiseRef.current
    }

    startPythonLoadProgress()
    pyodideLoadingPromiseRef.current = import(
      /* @vite-ignore */ `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.mjs`
    )
      .then((module) => module.loadPyodide({
        indexURL: `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`,
      }))
      .then((pyodide) => {
        pyodideRef.current = pyodide
        clearPythonLoadTimers()
        setPythonLoadStatus('ready')
        setPythonLoadProgress(100)
        setPythonLoadMessage('Python 小助手准备完成')
        return pyodide
      })
      .catch((error) => {
        pyodideLoadingPromiseRef.current = null
        clearPythonLoadTimers()
        setPythonLoadStatus('error')
        setPythonLoadProgress(0)
        setPythonLoadMessage('Python 加载失败，请检查网络后重试。')
        throw error
      })

    return pyodideLoadingPromiseRef.current
  }

  async function executePython(code) {
    const stdout = []
    const stderr = []
    const currentInteractiveEvents = []
    let currentTowerActions = []
    const inputQueue = currentInput.split(/\r?\n/)
    let inputIndex = 0

    try {
      const pyodide = await getPyodide()

      pyodide.setStdout({ batched: (text) => stdout.push(text) })
      pyodide.setStderr({ batched: (text) => stderr.push(text) })
      pyodide.setStdin({
        stdin: () => {
          if (inputIndex >= inputQueue.length || (inputQueue.length === 1 && inputQueue[0] === '')) {
            throw new Error('模拟输入不够了：请在模拟输入区为每一次 input() 准备一行内容。')
          }

          const nextInput = inputQueue[inputIndex]
          inputIndex += 1
          return nextInput
        },
      })

      window.plcInteractive = {
        pop: (message) => currentInteractiveEvents.push({ type: 'pop', message: String(message) }),
        ask: (message) => {
          const question = String(message)
          const answer = window.prompt(question) ?? ''
          currentInteractiveEvents.push({
            type: 'ask',
            message: answer ? `问题：${question}\n回答：${answer}` : `问题：${question}\n没有输入内容`,
          })
          return answer
        },
        showList: (message) => currentInteractiveEvents.push({ type: 'list', message: String(message) }),
        star: () => currentInteractiveEvents.push({ type: 'star', message: '获得一颗星星！' }),
        success: (message) => currentInteractiveEvents.push({ type: 'success', message: String(message) }),
        fail: (message) => currentInteractiveEvents.push({ type: 'fail', message: String(message) }),
      }

      const interactivePrelude = `
from js import plcInteractive

def pop(message):
    plcInteractive.pop(str(message))
    print(message)

def ask(message):
    answer = plcInteractive.ask(str(message))
    print(str(message) + " " + str(answer))
    return str(answer)

def show_list(items):
    text = "、".join([str(item) for item in items])
    plcInteractive.showList(text)
    print(text)

def star():
    plcInteractive.star()
    print("获得一颗星星！")

def success(message):
    plcInteractive.success(str(message))
    print(message)

def fail(message):
    plcInteractive.fail(str(message))
    print(message)
`

      const towerPrelude = isTowerMode ? `
tower_actions = []

def say(text):
    tower_actions.append({"type": "say", "text": str(text)})
    print(text)

def attack():
    tower_actions.append({"type": "attack"})
    print("勇者攻击")

def heal(amount=2):
    tower_actions.append({"type": "heal", "amount": amount})
    print("恢复", amount)

def gain_coin(amount):
    tower_actions.append({"type": "coin", "amount": amount})
    print("获得金币", amount)

def star():
    tower_actions.append({"type": "star"})
    print("获得一颗星星！")

def show_score(score):
    tower_actions.append({"type": "score", "value": score})
    print("分数", score)

def show_damage(amount):
    tower_actions.append({"type": "damage", "value": amount})
    print("伤害", amount)

def show_status():
    tower_actions.append({"type": "status"})
    print("显示状态")
` : ''

      const runPromise = pyodide.runPythonAsync(`${interactivePrelude}\n${towerPrelude}\n${code}`)
      const timeoutPromise = new Promise((_, reject) => {
        window.setTimeout(() => {
          reject(new Error('运行时间有点久：程序可能进入了很长的循环，请检查循环条件。'))
        }, RUN_TIMEOUT_MS)
      })

      await Promise.race([runPromise, timeoutPromise])
      const cleanOutput = stdout.join('\n').trim()
      const cleanError = stderr.join('\n').trim()
      const rawOutput = [cleanOutput, cleanError].filter(Boolean).join('\n').trim()
      if (isTowerMode) {
        const actionsProxy = pyodide.globals.get('tower_actions')
        currentTowerActions = actionsProxy.toJs({ dict_converter: Object.fromEntries })
        actionsProxy.destroy?.()
      }

      return {
        ok: cleanError.length === 0,
        output: limitOutputLines(rawOutput),
        error: cleanError,
        interactiveEvents: currentInteractiveEvents,
        towerActions: currentTowerActions,
        friendlyError: cleanError ? explainPythonError(cleanError, code, activeItem) : null,
      }
    } catch (error) {
      const message = error.message || String(error)
      const rawOutput = [stdout.join('\n').trim(), message].filter(Boolean).join('\n').trim()

      return {
        ok: false,
        output: limitOutputLines(rawOutput),
        error: message,
        interactiveEvents: currentInteractiveEvents,
        towerActions: currentTowerActions,
        friendlyError: explainPythonError(message, code, activeItem),
      }
    }
  }

  function touchStudyTime() {
    setLastStudyAt(new Date().toISOString())
  }

  function updateCode(nextCode) {
    setLessonCodeMap((previous) => ({
      ...previous,
      [activeItem.id]: nextCode || '',
    }))
    setCheckResult(null)
    setFriendlyError(null)
    setInteractiveEvents([])
    setTowerActions([])
    if (isTowerMode) setTowerState(getInitialTowerState(currentTower))
    setErrorHintLevel(1)
    touchStudyTime()
  }

  function updateInput(nextInput) {
    setLessonInputMap((previous) => ({
      ...previous,
      [activeItem.id]: nextInput,
    }))
    setCheckResult(null)
    setFriendlyError(null)
    setInteractiveEvents([])
    setTowerActions([])
    if (isTowerMode) setTowerState(getInitialTowerState(currentTower))
    setErrorHintLevel(1)
    touchStudyTime()
  }

  function saveApiKey() {
    const validation = validateApiKey(apiKeyInput)
    if (!validation.ok) {
      setApiStatusMessage(validation.message)
      return
    }

    localStorage.setItem(DEEPSEEK_API_KEY_STORAGE_KEY, validation.value)
    setSavedApiKey(validation.value)
    setApiKeyInput('')
    setApiTestStatus('')
    setApiStatusMessage('API Key 已保存到本机浏览器。')
  }

  function clearApiKey() {
    localStorage.removeItem(DEEPSEEK_API_KEY_STORAGE_KEY)
    setSavedApiKey('')
    setApiKeyInput('')
    setApiTestStatus('')
    setApiStatusMessage('本机 API Key 已清除。')
  }

  function saveBaseUrl() {
    const validation = validateBaseUrl(deepSeekBaseUrl)
    if (!validation.ok) {
      setApiStatusMessage(validation.message)
      return
    }

    localStorage.setItem(DEEPSEEK_BASE_URL_STORAGE_KEY, validation.value)
    setDeepSeekBaseUrl(validation.value)
    setApiTestStatus('')
    setApiStatusMessage(validation.message)
  }

  function restoreDefaultBaseUrl() {
    localStorage.removeItem(DEEPSEEK_BASE_URL_STORAGE_KEY)
    setDeepSeekBaseUrl(DEFAULT_DEEPSEEK_BASE_URL)
    setApiTestStatus('')
    setApiStatusMessage('API 地址已恢复为默认 DeepSeek 官方地址。')
  }

  function changeDeepSeekModel(nextModel) {
    setDeepSeekModel(nextModel)
    localStorage.setItem(DEEPSEEK_MODEL_STORAGE_KEY, nextModel)
    setApiTestStatus('')
  }

  async function testApiKey() {
    const keyToTest = apiKeyInput.trim() || savedApiKey
    const validation = validateApiKey(keyToTest)
    if (!validation.ok) {
      setApiStatusMessage(validation.message)
      return
    }

    const baseUrlValidation = validateBaseUrl(deepSeekBaseUrl)
    if (!baseUrlValidation.ok) {
      setApiStatusMessage(baseUrlValidation.message)
      return
    }
    if (baseUrlValidation.value !== normalizeBaseUrl(deepSeekBaseUrl)) {
      localStorage.setItem(DEEPSEEK_BASE_URL_STORAGE_KEY, baseUrlValidation.value)
      setDeepSeekBaseUrl(baseUrlValidation.value)
    }

    setApiTestStatus('正在测试连接...')
    setApiStatusMessage('')
    try {
      await testDeepSeekKey({
        apiKey: validation.value,
        baseUrl: baseUrlValidation.value,
        model: deepSeekModel,
      })
      setApiTestStatus('连接成功，AI 助教可以使用。')
    } catch (error) {
      setApiTestStatus(describeDeepSeekFailure(error))
    }
  }

  function changeAiMode(nextMode) {
    setAiMode(nextMode)
    localStorage.setItem(AI_MODE_STORAGE_KEY, nextMode)
  }

  function openAiRequest(type) {
    if (!savedApiKey) {
      setAiPanel(null)
      setApiStatusMessage('请先在 AI 助教设置里保存 DeepSeek API Key。')
      return
    }

    if (type === AI_TYPES.error && !friendlyError) {
      setAiPanel({
        type,
        content: '还没有发现错误。可以先运行代码，看到本地提示后再问 AI。',
      })
      return
    }

    const thinkPrompt = getThinkPrompt(type)
    if (thinkPrompt) {
      setAiThinkingRequest({ type, ...thinkPrompt })
      return
    }

    runAiRequest(type)
  }

  async function runAiRequest(type) {
    const baseUrlValidation = validateBaseUrl(deepSeekBaseUrl)
    if (!baseUrlValidation.ok) {
      setApiStatusMessage(baseUrlValidation.message)
      return
    }
    if (baseUrlValidation.value !== normalizeBaseUrl(deepSeekBaseUrl)) {
      localStorage.setItem(DEEPSEEK_BASE_URL_STORAGE_KEY, baseUrlValidation.value)
      setDeepSeekBaseUrl(baseUrlValidation.value)
      setApiStatusMessage(baseUrlValidation.message)
    }

    setAiThinkingRequest(null)
    setIsAiLoading(true)
    setAiFeedbackMessage('')
    setAiPanel({
      type,
      content: 'AI 助教正在整理提示...',
    })

    try {
      const messages = buildAiMessages({
        type,
        mode: aiMode,
        lesson: activeItem,
        code: currentCode,
        errorText: friendlyError?.originalError || output,
      })
      const content = await callDeepSeek({
        apiKey: savedApiKey,
        baseUrl: baseUrlValidation.value,
        model: deepSeekModel,
        messages,
      })
      const nextUsageCount = incrementTodayUsage()
      setAiUsageCount(nextUsageCount)
      setAiPanel({ type, content })
    } catch (error) {
      setAiPanel({
        type,
        content: `AI 请求失败了。主课程仍然可以正常使用。\n${describeDeepSeekFailure(error)}`,
      })
    } finally {
      setIsAiLoading(false)
    }
  }

  function addTempChallenge() {
    if (!aiPanel?.content || aiPanel.type !== AI_TYPES.challenge) return

    localStorage.setItem(`${TEMP_CHALLENGE_PREFIX}${activeItem.id}`, aiPanel.content)
    setTempChallenge(aiPanel.content)
  }

  function clearTempChallenge() {
    localStorage.removeItem(`${TEMP_CHALLENGE_PREFIX}${activeItem.id}`)
    setTempChallenge('')
  }

  function recordAiFeedback(helpful) {
    if (!aiPanel) return

    saveAiFeedback({
      lessonId: activeItem.id,
      type: aiPanel.type,
      helpful,
      createdAt: new Date().toISOString(),
    })
    setAiFeedbackMessage(helpful ? '已记录：这个提示有帮助。' : '可以换个方式再问一次，或者先看本地提示和课程讲解。')
  }

  function updateLearningProfile(note = '') {
    const profileKey = inferProfileKey(activeItem)
    setLearningProfile((previous) => ({
      ...previous,
      [profileKey]: {
        practiceCount: Number(previous[profileKey]?.practiceCount || 0) + 1,
        lastSeen: new Date().toISOString(),
        notes: note || previous[profileKey]?.notes || '',
      },
    }))
  }

  async function runCoachRequest(type) {
    if (!savedApiKey) {
      setCoachResult({
        type: 'notice',
        title: '先保存 API Key',
        content: '请先在右侧“AI 小老师”的设置里保存 DeepSeek API Key。没有 Key 时，课程、运行和本地报错提示仍然可以正常使用。',
      })
      return
    }

    if (type === 'projectPlan' && !coachProjectIdea.trim()) {
      setCoachResult({
        type: 'notice',
        title: '先写一个小想法',
        content: '请先写下“我想做一个什么”，比如背单词机、任务打卡器、猜数字游戏。',
      })
      return
    }

    const baseUrlValidation = validateBaseUrl(deepSeekBaseUrl)
    if (!baseUrlValidation.ok) {
      setCoachResult({
        type: 'notice',
        title: 'AI 地址需要检查',
        content: baseUrlValidation.message,
      })
      return
    }
    if (baseUrlValidation.value !== normalizeBaseUrl(deepSeekBaseUrl)) {
      localStorage.setItem(DEEPSEEK_BASE_URL_STORAGE_KEY, baseUrlValidation.value)
      setDeepSeekBaseUrl(baseUrlValidation.value)
    }

    const profileKey = inferProfileKey(activeItem)
    setIsCoachLoading(true)
    setCoachResult({
      type,
      title: 'AI 学习教练正在思考',
      content: '正在根据当前课程、代码和检查结果整理建议……',
    })

    try {
      const content = await callDeepSeek({
        apiKey: savedApiKey,
        baseUrl: baseUrlValidation.value,
        model: deepSeekModel,
        maxTokens: type === 'diagnose' ? 420 : 680,
        messages: buildCoachMessages({
          type,
          style: coachStyle,
          projectIdea: coachProjectIdea.trim(),
          moduleName: getModuleName(learningMode),
          lesson: activeItem,
          code: currentCode,
          output,
          friendlyError,
          checkResult,
          runCount: activeRunCount,
          profileNote: learningProfile[profileKey]?.notes,
        }),
      })
      const nextUsageCount = incrementTodayUsage()
      setAiUsageCount(nextUsageCount)
      setCoachResult({
        type,
        title: type === 'diagnose'
          ? '看看我哪里没懂'
          : (type === 'example'
          ? `换个例子讲给我听 · ${coachStyle}`
          : (type === 'exercise' ? '给我一个定向小练习' : '帮我拆一个小项目')),
        content,
      })
      updateLearningProfile(type === 'diagnose' ? content.slice(0, 180) : `AI 学习教练：${type}`)
    } catch (error) {
      setCoachResult({
        type: 'error',
        title: 'AI 学习教练暂时没有连上',
        content: `不用担心，主课程仍然可以继续学习。\n${describeDeepSeekFailure(error)}`,
      })
    } finally {
      setIsCoachLoading(false)
    }
  }

  function resetCode() {
    setLessonCodeMap((previous) => ({
      ...previous,
      [activeItem.id]: activeItem.starterCode,
    }))
    setLessonInputMap((previous) => ({
      ...previous,
      [activeItem.id]: activeItem.sampleInput || '',
    }))
    setOutput('')
    setInteractiveEvents([])
    setTowerActions([])
    if (isTowerMode) setTowerState(getInitialTowerState(currentTower))
    setFriendlyError(null)
    setErrorHintLevel(1)
    setCheckResult(null)
    touchStudyTime()
  }

  function selectLesson(lesson) {
    if (lesson.status === 'locked') {
      setLessonNotice('这一关还在准备中')
      return
    }

    setLearningMode('lessons')
    setCurrentLessonId(lesson.id)
    setOutput('')
    setInteractiveEvents([])
    setTowerActions([])
    setTowerState(getInitialTowerState(currentTower))
    setFriendlyError(null)
    setErrorHintLevel(1)
    setCheckResult(null)
    setLessonNotice('')
    touchStudyTime()
  }

  function selectProject(project) {
    setLearningMode('projects')
    setCurrentProjectId(project.id)
    setOutput('')
    setInteractiveEvents([])
    setTowerActions([])
    setTowerState(getInitialTowerState(currentTower))
    setFriendlyError(null)
    setErrorHintLevel(1)
    setCheckResult(null)
    setLessonNotice('')
    touchStudyTime()
  }

  function selectTower(level) {
    setLearningMode('games')
    setCurrentTowerId(level.id)
    setOutput('')
    setInteractiveEvents([])
    setTowerActions([])
    setTowerState(getInitialTowerState(level))
    setFriendlyError(null)
    setErrorHintLevel(1)
    setCheckResult(null)
    setLessonNotice('')
    touchStudyTime()
  }

  function switchLearningMode(nextMode) {
    setLearningMode(nextMode)
    setOutput('')
    setInteractiveEvents([])
    setTowerActions([])
    if (nextMode === 'games') setTowerState(getInitialTowerState(currentTower))
    setFriendlyError(null)
    setErrorHintLevel(1)
    setCheckResult(null)
    setLessonNotice('')
    touchStudyTime()
  }

  async function runCode() {
    const runToken = runTokenRef.current + 1
    runTokenRef.current = runToken
    setIsRunning(true)
    setInteractiveEvents([])
    setTowerActions([])
    if (isTowerMode) setTowerState(getInitialTowerState(currentTower))
    setOutput(
      pythonLoadStatus === 'loading' || pythonLoadStatus === 'slow' || pythonLoadStatus === 'idle'
        ? 'Python 正在准备中，请稍等一下……加载完成后会继续运行当前代码。'
        : '',
    )
    setFriendlyError(null)
    setErrorHintLevel(1)
    setCheckResult(null)
    if (isTowerMode) {
      setTowerProgress((previous) => ({
        ...previous,
        [currentTower.id]: {
          ...previous[currentTower.id],
          runCount: (previous[currentTower.id]?.runCount || 0) + 1,
        },
      }))
    } else if (isProjectMode) {
      setProjectProgress((previous) => ({
        ...previous,
        [currentProject.id]: {
          ...previous[currentProject.id],
          runCount: (previous[currentProject.id]?.runCount || 0) + 1,
        },
      }))
    } else {
      setRunCountMap((previous) => ({
        ...previous,
        [currentLesson.id]: (previous[currentLesson.id] || 0) + 1,
      }))
    }
    touchStudyTime()

    const result = await executePython(currentCode)
    if (runTokenRef.current === runToken) {
      setOutput(result.output || '代码运行完成，没有输出。')
      setInteractiveEvents(result.interactiveEvents || [])
      setTowerActions(result.towerActions || [])
      if (isTowerMode) setTowerState(applyTowerActions(currentTower, result.towerActions || []))
      setFriendlyError(result.friendlyError || null)
      setIsRunning(false)
    }

    return result
  }

  function awardBadgesFor(completedIds) {
    const badgesToAdd = badgeDefinitions.filter(
      (badge) => completedIds.includes(badge.lessonId) && !earnedBadges.includes(badge.id),
    )
    if (badgesToAdd.length === 0) return

    setEarnedBadges((previous) => [...previous, ...badgesToAdd.map((badge) => badge.id)])
    setNewBadge(badgesToAdd[0])
    window.setTimeout(() => setNewBadge(null), 3200)
  }

  async function checkTask() {
    setIsChecking(true)
    setCheckResult(null)

    const runResult = await runCode()
    const failedRules = activeItem.checkRules
      .filter((rule) => !evaluateRule(rule, currentCode, runResult))
      .map(describeRule)

    if (failedRules.length === 0) {
      if (isTowerMode) {
        setTowerProgress((previous) => ({
          ...previous,
          [currentTower.id]: {
            ...previous[currentTower.id],
            completed: true,
            completedAt: previous[currentTower.id]?.completedAt || new Date().toISOString(),
            runCount: previous[currentTower.id]?.runCount || 1,
          },
        }))
        setCheckResult({
          passed: true,
          message: activeItem.successMessage,
          failedRules: [],
        })
        setIsChecking(false)
        return
      }

      if (isProjectMode) {
        setProjectProgress((previous) => ({
          ...previous,
          [currentProject.id]: {
            ...previous[currentProject.id],
            completed: true,
            completedAt: previous[currentProject.id]?.completedAt || new Date().toISOString(),
            runCount: previous[currentProject.id]?.runCount || 1,
          },
        }))
        setCheckResult({
          passed: true,
          message: activeItem.successMessage,
          failedRules: [],
        })
        setIsChecking(false)
        return
      }

      const nextCompleted = completedLessons.includes(currentLesson.id)
        ? completedLessons
        : [...completedLessons, currentLesson.id]

      setCompletedLessons(nextCompleted)
      awardBadgesFor(nextCompleted)
      setCheckPassedMap((previous) => ({
        ...previous,
        [currentLesson.id]: true,
      }))
      updateLearningProfile('检查任务通过')
      setCheckResult({
        passed: true,
        message: activeItem.successMessage,
        failedRules: [],
      })
    } else {
      if (!isProjectMode && !isTowerMode) {
        setCheckPassedMap((previous) => ({
          ...previous,
          [currentLesson.id]: false,
        }))
      }
      setCheckResult({
        passed: false,
        message: activeItem.hint,
        failedRules,
      })
    }

    setIsChecking(false)
  }

  function goNextLesson() {
    if (!isCurrentCompleted) return
    if (isTowerMode) {
      if (nextTower) selectTower(nextTower)
      return
    }
    if (isProjectMode) {
      if (nextProject) selectProject(nextProject)
      return
    }
    if (nextLesson) selectLesson(nextLesson)
  }

  return (
    <div className="app-shell">
      {newBadge && (
        <div className="badge-toast" role="status">
          获得徽章：{newBadge.title}
        </div>
      )}

      <aside className="lesson-list" aria-label="课程目录">
        <div className="brand">
          <span className="brand-mark">Py</span>
          <div>
            <h1>Python 小小创造师</h1>
            <p>MVP 第 3 阶段</p>
          </div>
        </div>

        <div className="progress-card">
          <div className="progress-copy">
            <span>当前进度</span>
            <strong>
              {isTowerMode
                ? `已完成 ${completedTowerCount} / ${towerLevels.length} 层`
                : (isProjectMode
                ? `已完成 ${completedProjectCount} / ${projects.length} 个项目`
                : (isCoachMode ? 'AI 学习教练' : `${currentLessonLabel} / 60`))}
            </strong>
          </div>
          {!isProjectMode && !isTowerMode && !isCoachMode && (
            <div className="progress-stage-line">阶段：第 {currentStage.id} 阶段</div>
          )}
          {isCoachMode && (
            <div className="progress-stage-line">正在看：{currentLessonLabel} · {currentLesson.concept}</div>
          )}
          <div
            className="progress-track"
            aria-label={isTowerMode
              ? `已完成 ${completedTowerCount} / ${towerLevels.length} 层`
              : (isProjectMode
              ? `已完成 ${completedProjectCount} / ${projects.length} 个项目`
              : `已完成 ${completedCoreCount} / ${coreLessons.length} 课`)}
          >
            <div style={{ width: `${isTowerMode ? towerProgressPercent : (isProjectMode ? projectProgressPercent : coreProgressPercent)}%` }} />
          </div>
        </div>

        <div className="camp-switch" aria-label="学习入口">
          <button
            className={learningMode === 'lessons' ? 'active' : ''}
            onClick={() => switchLearningMode('lessons')}
            type="button"
          >
            <strong>基础训练营</strong>
            <span>第 1-60 课：学习 Python 本领</span>
          </button>
          <button
            className={learningMode === 'projects' ? 'active' : ''}
            onClick={() => switchLearningMode('projects')}
            type="button"
          >
            <strong>项目创造营</strong>
            <span>用 Python 本领做作品</span>
          </button>
          <button
            className={learningMode === 'coach' ? 'active' : ''}
            onClick={() => switchLearningMode('coach')}
            type="button"
          >
            <strong>AI 学习教练</strong>
            <span>发现哪里没懂，换种方式讲</span>
          </button>
        </div>

        <details className="sidebar-details">
          <summary>学习地图</summary>
          <section className="learning-map-card" aria-label="学习地图">
            <div className="learning-map-header">
              <span>学习地图</span>
              <strong>
                {isCoachMode ? 'AI 学习教练' : (isTowerMode ? 'Python 勇者塔' : (isProjectMode ? '项目创造营' : `第 ${currentStage.id} 阶段`))}
              </strong>
            </div>

            {isCoachMode ? (
              <div className="learning-map-body">
                <h2>AI 学习教练</h2>
                <p>帮你发现哪里没懂，换一种方式讲，再给你一个小练习。</p>
                <div className="map-can-do">
                  <span>能帮你</span>
                  <p>诊断薄弱点、换例子、出小练习、拆项目步骤。</p>
                </div>
              </div>
            ) : isTowerMode ? (
              <div className="learning-map-body">
                <h2>Python 勇者塔目标</h2>
                <p>用 Python 语法控制勇者打怪、回血、得金币和闯关。</p>
                <div className="map-can-do">
                  <span>能练</span>
                  <p>变量、if、for、list、dict、def、return、random。</p>
                </div>
              </div>
            ) : isProjectMode ? (
              <div className="learning-map-body">
                <h2>项目创造营目标</h2>
                <p>把学过的 Python 本领用起来，做自己的小工具和小作品。</p>
                <div className="map-can-do">
                  <span>能做</span>
                  <p>自我介绍机器人、背单词小助手、任务打卡系统、问答闯关游戏。</p>
                </div>
              </div>
            ) : (
              <div className="learning-map-body">
                <div className="map-progress-row">
                  <span>当前进度：{currentLessonLabel} / 60</span>
                  <span>阶段进度：{stageCurrent} / {stageTotal}</span>
                </div>
                <div className="map-progress-track" aria-label={`第 ${currentStage.id} 阶段已完成 ${stageCompletedCount} / ${stageTotal}`}>
                  <div style={{ width: `${stageProgressPercent}%` }} />
                </div>

                <h2>{currentStage.title}</h2>
                <p>{currentStage.goal}</p>
                <div className="map-can-do">
                  <span>学完这段能做</span>
                  <p>{currentStage.canDo.join('、')}。</p>
                </div>

                <details className="map-final-goals">
                  <summary>阶段作品路线</summary>
                  <ol>
                    {milestoneRoute.map((milestone) => (
                      <li key={milestone.afterLesson}>第{milestone.afterLesson}课：获得{milestone.title}</li>
                    ))}
                  </ol>
                </details>

                <details className="map-final-goals">
                  <summary>学完 60 课你能做到什么</summary>
                  <ol>
                    {finalLearningGoals.map((goal) => (
                      <li key={goal}>{goal}</li>
                    ))}
                  </ol>
                </details>
              </div>
            )}
          </section>
        </details>

        <details className="sidebar-details">
          <summary>学习记录</summary>
          <section className="study-card" aria-label="学习记录">
            <dl>
              <div>
                <dt>{isCoachMode ? '当前观察' : (isTowerMode ? '当前楼层' : (isProjectMode ? '当前项目' : '当前关卡'))}</dt>
                <dd>{activeItem.title}</dd>
              </div>
              <div>
                <dt>总运行次数</dt>
                <dd>{totalRunCount}</dd>
              </div>
              <div>
                <dt>{isTowerMode ? '本层运行' : (isProjectMode ? '本项目运行' : '本关运行')}</dt>
                <dd>{activeRunCount}</dd>
              </div>
              <div>
                <dt>{isTowerMode ? '当前目标' : (isProjectMode ? '当前目标' : (isCoachMode ? '当前目标' : '当前阶段'))}</dt>
                <dd>{isTowerMode ? '闯塔练习' : (isProjectMode ? '做小作品' : (isCoachMode ? '查漏补缺' : `第 ${currentStage.id} 阶段`))}</dd>
              </div>
              <div>
                <dt>最近学习</dt>
                <dd>{formatStudyTime(lastStudyAt)}</dd>
              </div>
            </dl>
          </section>
        </details>

        {lessonNotice && <div className="lesson-notice">{lessonNotice}</div>}

        <nav className="lesson-nav">
          {learningMode === 'lessons' && lessons.map((lesson, index) => {
            const isActive = lesson.id === currentLesson.id
            const isCompleted = completedLessons.includes(lesson.id)
            const isMilestone = lesson.type === 'milestoneProject'
            const lessonNumber = isMilestone
              ? lesson.afterLesson
              : coreLessons.findIndex((coreLesson) => coreLesson.id === lesson.id) + 1
            const className = [
              'lesson-item',
              isMilestone ? 'milestone-item' : '',
              isActive ? 'active' : '',
              lesson.status === 'locked' ? 'locked' : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <button className={className} key={lesson.id} onClick={() => selectLesson(lesson)} type="button">
                <span className="lesson-number">{isMilestone ? '作品' : String(lessonNumber).padStart(2, '0')}</span>
                <span className="lesson-title">
                  {lesson.title}
                  <small>{lesson.status === 'locked' ? lesson.comingSoonText : (isMilestone ? `第 ${lesson.afterLesson} 课后` : lesson.concept)}</small>
                </span>
                {isCompleted && <span className="done-mark">✓</span>}
              </button>
            )
          })}
          {learningMode === 'projects' && projects.map((project, index) => {
            const isActive = project.id === currentProject.id
            const isCompleted = Boolean(projectProgress[project.id]?.completed)
            const className = ['lesson-item', 'project-item', isActive ? 'active' : ''].filter(Boolean).join(' ')

            return (
              <button className={className} key={project.id} onClick={() => selectProject(project)} type="button">
                <span className="lesson-number">P{index + 1}</span>
                <span className="lesson-title">
                  {project.title}
                  <small>{project.level} · 建议学完第 {project.recommendedAfterLesson} 关</small>
                </span>
                {isCompleted && <span className="done-mark">✓</span>}
              </button>
            )
          })}
          {learningMode === 'games' && towerLevels.map((level, index) => {
            const isActive = level.id === currentTower.id
            const isCompleted = Boolean(towerProgress[level.id]?.completed)
            const className = ['lesson-item', 'tower-item', isActive ? 'active' : ''].filter(Boolean).join(' ')

            return (
              <button className={className} key={level.id} onClick={() => selectTower(level)} type="button">
                <span className="lesson-number">T{index + 1}</span>
                <span className="lesson-title">
                  {level.title}
                  <small>{level.syntaxFocus}</small>
                </span>
                {isCompleted && <span className="done-mark">✓</span>}
              </button>
            )
          })}
          {learningMode === 'coach' && (
            <div className="coach-nav-note">
              <strong>AI 学习教练</strong>
              <span>当前会结合 {currentLessonLabel}、你的代码、运行结果和检查结果来给建议。</span>
            </div>
          )}
        </nav>
      </aside>

      <main className="task-panel">
        <section className="task-card">
          {isCoachMode ? (
            <>
              <p className="eyebrow">AI 学习教练 · 当前观察 {currentLessonLabel}</p>
              <h2>AI 学习教练</h2>
              <p className="project-subtitle">不直接给答案，只帮你发现下一步怎么练。</p>

              <div className="coach-context-card">
                <div>
                  <span>当前课程</span>
                  <strong>{currentLesson.title}</strong>
                </div>
                <div>
                  <span>知识点</span>
                  <strong>{currentLesson.concept}</strong>
                </div>
                <div>
                  <span>运行 / 检查</span>
                  <strong>{activeRunCount} 次 · {checkResult ? (checkResult.passed ? '已通过' : '还要练') : '未检查'}</strong>
                </div>
              </div>

              <div className="coach-grid" aria-label="AI 学习教练功能">
                <article className="coach-card">
                  <h3>看看我哪里没懂</h3>
                  <p>根据当前代码、运行结果和检查任务，帮你找一个最值得练的地方。</p>
                  <button onClick={() => runCoachRequest('diagnose')} type="button" disabled={isCoachLoading}>
                    开始诊断
                  </button>
                </article>

                <article className="coach-card">
                  <h3>换个例子讲给我听</h3>
                  <p>同一个知识点，可以换成生活、游戏或 Minecraft 风格再讲一次。</p>
                  <label>
                    <span>例子风格</span>
                    <select value={coachStyle} onChange={(event) => setCoachStyle(event.target.value)}>
                      {coachExampleStyles.map((style) => (
                        <option value={style} key={style}>{style}</option>
                      ))}
                    </select>
                  </label>
                  <button onClick={() => runCoachRequest('example')} type="button" disabled={isCoachLoading}>
                    换个例子
                  </button>
                </article>

                <article className="coach-card">
                  <h3>给我一个定向小练习</h3>
                  <p>只出一个小练习，适合在右侧编辑器里自己完成。</p>
                  <button onClick={() => runCoachRequest('exercise')} type="button" disabled={isCoachLoading}>
                    生成小练习
                  </button>
                </article>

                <article className="coach-card">
                  <h3>帮我拆一个小项目</h3>
                  <p>把想做的作品拆成几步，先做最简单版本，不直接写完整代码。</p>
                  <label>
                    <span>我想做一个</span>
                    <input
                      value={coachProjectIdea}
                      onChange={(event) => setCoachProjectIdea(event.target.value)}
                      placeholder="比如：背单词机、任务打卡器"
                    />
                  </label>
                  <button onClick={() => runCoachRequest('projectPlan')} type="button" disabled={isCoachLoading}>
                    拆成步骤
                  </button>
                </article>
              </div>

              <div className="coach-safe-note">
                AI 学习教练只会给提示、例子和步骤，不会替你写完整答案。先自己试，再来问它。
              </div>

              {coachResult && (
                <section className={`coach-result-card ${coachResult.type}`}>
                  <div>
                    <strong>{coachResult.title}</strong>
                    {isCoachLoading && <span>生成中...</span>}
                  </div>
                  <p>{coachResult.content}</p>
                </section>
              )}
            </>
          ) : isTowerMode ? (
            <>
              <p className="eyebrow">Python 勇者塔 · 第 {currentTower.floor || currentTowerIndex + 1} 层 · {currentTower.syntaxFocus}</p>
              <h2>{currentTower.title}</h2>
              <p className="project-subtitle">{currentTower.scene}</p>

              <div className="tower-stage-card">
                <div className="tower-title-row">
                  <div>
                    <strong>第 {currentTower.floor || currentTowerIndex + 1} 层战斗</strong>
                    <span>{towerState.notice}</span>
                  </div>
                  <div className="tower-reward-row">
                    <span>金币 {towerState.hero.coins}</span>
                    <span>星星 {towerState.hero.stars}</span>
                  </div>
                </div>

                <div className="tower-battle-row" aria-label="Python 勇者塔战斗画面">
                  <article className="tower-fighter-card hero">
                    <span className="tower-avatar">🛡️</span>
                    <div>
                      <h3>{towerState.hero.name}</h3>
                      <p>等级 {towerState.hero.level} · 攻击 {towerState.hero.attack}</p>
                    </div>
                    <div className="tower-hp-line">
                      <span>HP {towerState.hero.hp} / {towerState.hero.maxHp}</span>
                      <div className="tower-hp-track">
                        <div
                          className="tower-hp-fill hero"
                          style={{ width: `${Math.max(0, Math.min(100, (towerState.hero.hp / towerState.hero.maxHp) * 100))}%` }}
                        />
                      </div>
                    </div>
                  </article>

                  <div className="tower-vs">VS</div>

                  <article className="tower-fighter-card monster">
                    <span className="tower-avatar">{towerState.monster.emoji || '👾'}</span>
                    <div>
                      <h3>{towerState.monster.name}</h3>
                      <p>攻击 {towerState.monster.attack}</p>
                    </div>
                    <div className="tower-hp-line">
                      <span>HP {towerState.monster.hp} / {towerState.monster.maxHp}</span>
                      <div className="tower-hp-track">
                        <div
                          className="tower-hp-fill monster"
                          style={{ width: `${Math.max(0, Math.min(100, (towerState.monster.hp / towerState.monster.maxHp) * 100))}%` }}
                        />
                      </div>
                    </div>
                  </article>
                </div>

                {towerState.speech && <div className="tower-speech">勇者说：{towerState.speech}</div>}

                <div className="tower-log">
                  <div className="tower-log-title">
                    <strong>战斗日志</strong>
                    {towerState.score !== null && <span>分数：{towerState.score}</span>}
                    {towerState.item && <span>物品：{towerState.item}</span>}
                  </div>
                  <ol>
                    {towerState.logs.slice(-8).map((log, index) => (
                      <li key={`${log}-${index}`}>{log}</li>
                    ))}
                  </ol>
                </div>
              </div>

              <div className="task-section task-goal-section">
                <h3>闯塔目标</h3>
                <p>{currentTower.goal}</p>
              </div>

              <div className="learning-section project-steps-section">
                <h3>真正学习的 Python 本领</h3>
                <p>{currentTower.explain}</p>
              </div>

              <div className="learning-section practice-section">
                <h3>本层任务</h3>
                <ol>
                  {currentTower.tasks.map((task) => (
                    <li key={task}>{task}</li>
                  ))}
                </ol>
              </div>

              <div className="task-section task-modify-section">
                <h3>改一改任务</h3>
                <ul>
                  {currentTower.modifyTask.map((task) => (
                    <li key={task}>{task}</li>
                  ))}
                </ul>
              </div>

              {tempChallenge && (
                <div className="temp-challenge-card">
                  <div>
                    <h3>我的临时挑战</h3>
                    <button className="text-button" onClick={clearTempChallenge} type="button">
                      清除
                    </button>
                  </div>
                  <p>{tempChallenge}</p>
                </div>
              )}

              <div className="interactive-preview">
                <h3>勇者塔动作函数</h3>
                <p>
                  可以用 say("台词")、attack()、heal()、gain_coin(1)、star()、show_score(score)、show_damage(damage)、show_status() 控制战斗反馈。
                  这些函数负责画面变化，真正要练的是本层的 Python 语法。
                </p>
              </div>

              <div className="learning-section">
                <h3>讲给爸爸妈妈听</h3>
                <ul>
                  {currentTower.parentQuestions.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
              </div>

              <div className="hint-box">
                <span>提示</span>
                <p>{currentTower.hint}</p>
              </div>
            </>
          ) : isProjectMode ? (
            <>
              <p className="eyebrow">项目创造营 · 项目 {currentProjectIndex + 1} · {currentProject.level}</p>
              <h2>{currentProject.title}</h2>
              <p className="project-subtitle">{currentProject.subtitle}</p>

              <div className="project-meta-card">
                <span>建议学完第 {currentProject.recommendedAfterLesson} 关后尝试</span>
                <span>用到本领：{currentProject.skills.join('、')}</span>
              </div>

              <div className="task-section task-goal-section">
                <h3>项目目标</h3>
                <p>{currentProject.goal}</p>
              </div>

              <div className="task-section">
                <h3>生活场景</h3>
                <p>{currentProject.scene}</p>
              </div>

              <div className="learning-section project-steps-section">
                <h3>分步骤做作品</h3>
                <ol>
                  {currentProject.steps.map((step) => (
                    <li key={step.title}>
                      <strong>{step.title}</strong>
                      <span>{step.description}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="learning-section practice-section">
                <h3>任务要求</h3>
                <ol>
                  {currentProject.requirements.map((requirement) => (
                    <li key={requirement}>{requirement}</li>
                  ))}
                </ol>
              </div>

              <div className="task-section task-challenge-section">
                <h3>拓展挑战</h3>
                <p>{currentProject.challenge}</p>
              </div>

              {tempChallenge && (
                <div className="temp-challenge-card">
                  <div>
                    <h3>我的临时挑战</h3>
                    <button className="text-button" onClick={clearTempChallenge} type="button">
                      清除
                    </button>
                  </div>
                  <p>{tempChallenge}</p>
                </div>
              )}

              <div className="learning-section">
                <h3>家长提问</h3>
                <ul>
                  {currentProject.parentQuestions.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
              </div>

              <div className="learning-section compact">
                <h3>作品展示引导</h3>
                <p>{currentProject.showcasePrompt}</p>
              </div>

              <div className="learning-section">
                <h3>拓展玩法</h3>
                <ul>
                  {currentProject.extensionIdeas.map((idea) => (
                    <li key={idea}>{idea}</li>
                  ))}
                </ul>
              </div>

              <div className="interactive-preview">
                <h3>互动函数</h3>
                <p>
                  项目创造营可以使用 ask("问题") 弹窗输入、pop("内容") 显示提示、show_list(列表) 展示清单、star() 加星、success("内容") 和 fail("内容") 展示反馈。
                  运行后，右侧会用互动卡片展示结果，让作品更像小应用。
                </p>
              </div>

              <div className="hint-box">
                <span>提示</span>
                <p>{currentProject.hint}</p>
              </div>
            </>
          ) : (
            <>
              <p className="eyebrow">{currentLessonLabel} · {currentLesson.concept}</p>
              <h2>{currentLesson.title}</h2>

              <div className="lesson-flow" aria-label="本课学习步骤">
                {(currentLesson.type === 'milestoneProject'
                  ? ['看作品目标', '想一想功能', '修改代码', '运行作品', '检查作品']
                  : ['阅读目标', '修改代码', '点击运行', '完成挑战', '检查任务']
                ).map((step, index) => (
                  <span key={step}>{index + 1}. {step}</span>
                ))}
              </div>

              <div className="task-section task-goal-section">
                <h3>{currentLesson.type === 'milestoneProject' ? '项目目标' : '今天目标'}</h3>
                <p>{currentLesson.goal}</p>
              </div>

              <div className="task-section task-follow-section">
                <h3>{currentLesson.type === 'milestoneProject' ? '我会用到哪些本领' : '跟着做'}</h3>
                {currentLesson.type === 'milestoneProject' ? (
                  <ul>
                    {currentLesson.skills?.map((skill) => (
                      <li key={skill}>{skill}</li>
                    ))}
                  </ul>
                ) : (
                  <p>{currentLesson.explanation}</p>
                )}
              </div>

              <div className="task-section task-modify-section">
                <h3>{currentLesson.type === 'milestoneProject' ? '思考问题' : '改一改任务'}</h3>
                {currentLesson.type === 'milestoneProject' ? (
                  <ul>
                    {currentLesson.thinkingQuestions?.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ul>
                ) : (
                  <p>{currentLesson.modifyTask}</p>
                )}
              </div>

              <div className="task-section task-check-section">
                <h3>{currentLesson.type === 'milestoneProject' ? '完成要求' : '检查任务'}</h3>
                {currentLesson.type === 'milestoneProject' ? (
                  <ul>
                    {currentLesson.completionRequirements?.map((requirement) => (
                      <li key={requirement}>{requirement}</li>
                    ))}
                  </ul>
                ) : (
                  <p>{currentLesson.challengeTask}</p>
                )}
                <span>完成后，去右侧点击“检查任务”。</span>
              </div>

              {currentLesson.type === 'milestoneProject' && (
                <div className="task-section task-challenge-section">
                  <h3>改一改挑战</h3>
                  <p>{currentLesson.challengeTask}</p>
                </div>
              )}

              {tempChallenge && (
                <div className="temp-challenge-card">
                  <div>
                    <h3>我的临时挑战</h3>
                    <button className="text-button" onClick={clearTempChallenge} type="button">
                      清除
                    </button>
                  </div>
                  <p>{tempChallenge}</p>
                </div>
              )}

              {currentLesson.story && (
                <details className="lesson-fold">
                  <summary>故事引入</summary>
                  <p>{currentLesson.story}</p>
                </details>
              )}

              {currentLesson.keyPoints?.length > 0 && (
                <details className="lesson-fold">
                  <summary>本关重点</summary>
                  <ul>
                    {currentLesson.keyPoints.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </details>
              )}

              {currentLesson.hint && (
                <details className="lesson-fold">
                  <summary>提示</summary>
                  <p>{currentLesson.hint}</p>
                </details>
              )}

              {currentLesson.practiceTasks?.length > 0 && (
                <details className="lesson-fold">
                  <summary>多练几次</summary>
                  <ol>
                    {currentLesson.practiceTasks.map((task) => (
                      <li key={task}>{task}</li>
                    ))}
                  </ol>
                  {currentLesson.observeQuestion && <p>{currentLesson.observeQuestion}</p>}
                </details>
              )}

              {currentLesson.commonMistakes?.length > 0 && (
                <details className="lesson-fold">
                  <summary>常见错误</summary>
                  <div className="mistake-list">
                    {currentLesson.commonMistakes.map((mistake) => (
                      <article className="mistake-item" key={mistake.wrongCode}>
                        <code>{mistake.wrongCode}</code>
                        <p><strong>为什么错：</strong>{mistake.explanation}</p>
                        <p><strong>怎么修：</strong>{mistake.fixTip}</p>
                      </article>
                    ))}
                  </div>
                </details>
              )}

              {(currentLesson.reviewQuestion || currentLesson.reviewQuestions?.length > 0 || currentLesson.explainToParent) && (
                <details className="lesson-fold">
                  <summary>讲给爸爸妈妈听</summary>
                  {currentLesson.explainToParent && <p>{currentLesson.explainToParent}</p>}
                  {currentLesson.reviewQuestion && <p>{currentLesson.reviewQuestion}</p>}
                  {currentLesson.reviewQuestions?.length > 0 && (
                    <ul>
                      {currentLesson.reviewQuestions.map((question) => (
                        <li key={question}>{question}</li>
                      ))}
                    </ul>
                  )}
                </details>
              )}
            </>
          )}
        </section>
      </main>

      <section className="workspace" aria-label="代码编辑器和输出结果">
        <div className="toolbar">
          <div>
            <strong>代码编辑器</strong>
            <span>已运行 {activeRunCount} 次</span>
          </div>
          <div className={`python-status-card ${pythonLoadStatus}`}>
            <div className="python-status-copy">
              <strong>Python 小助手</strong>
              <span>
                {pythonLoadMessage}
                {pythonLoadStatus === 'ready' ? ' ✅' : ''}
              </span>
            </div>
            <div className="python-progress-track" aria-label={`Python 加载进度 ${pythonLoadProgress}%`}>
              <div style={{ width: `${pythonLoadProgress}%` }} />
            </div>
            <em>{pythonLoadStatus === 'ready' ? '准备完成' : '准备中'}</em>
            {pythonLoadStatus === 'error' && (
              <button className="python-retry-button" onClick={() => getPyodide()} type="button">
                重新加载 Python
              </button>
            )}
          </div>
          <div className="actions">
            <button className="reset-button" onClick={resetCode} type="button">
              重置代码
            </button>
            <button className="check-button" onClick={checkTask} type="button" disabled={isRunning || isChecking}>
              {isChecking ? '检查中...' : '检查任务'}
            </button>
            <button className="run-button" onClick={runCode} type="button" disabled={isRunning || isChecking}>
              {isRunning ? '运行中...' : '运行代码'}
            </button>
            <button
              className="next-button"
              onClick={goNextLesson}
              type="button"
              disabled={!isCurrentCompleted || (isTowerMode ? !nextTower : (isProjectMode ? !nextProject : !nextLesson))}
            >
              {isTowerMode ? '下一层' : (isProjectMode ? '下一项目' : '下一关')}
            </button>
          </div>
        </div>

        <div className="editor-wrap">
          <Editor
            height="100%"
            defaultLanguage="python"
            theme="vs-dark"
            value={currentCode}
            onChange={updateCode}
            options={{
              fontSize: 15,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              tabSize: 4,
              padding: { top: 16 },
            }}
          />
        </div>

        <div className="result-grid">
          {needsInput && (
            <label className="input-panel">
              <span className="panel-title">模拟输入</span>
              <textarea
                value={currentInput}
                onChange={(event) => updateInput(event.target.value)}
                placeholder="每一次 input() 读取一行。多个 input() 请写多行。"
                rows={4}
              />
            </label>
          )}

          <div className="output-panel">
            <div className="panel-title">输出结果</div>
            <pre>{output || '点击运行代码后，这里会显示 Python 输出。'}</pre>
          </div>

          {interactiveEvents.length > 0 && (
            <div className="interactive-output-panel">
              <div className="panel-title">互动弹窗结果</div>
              <div className="interactive-event-list">
                {interactiveEvents.map((event, index) => (
                  <div className={`interactive-event ${event.type}`} key={`${event.type}-${index}`}>
                    <span>
                      {event.type === 'star' ? '★' : ''}
                      {event.type === 'success' ? '✓' : ''}
                      {event.type === 'fail' ? '!' : ''}
                      {event.type === 'pop' ? 'i' : ''}
                      {event.type === 'ask' ? '?' : ''}
                      {event.type === 'list' ? '≡' : ''}
                    </span>
                    <p>{event.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={checkResult?.passed ? 'check-panel passed' : 'check-panel'}>
            <div className="panel-title">检查结果</div>
            {friendlyError && (
              <div className="friendly-error-card">
                <div className="friendly-error-heading">
                  <span>小错误被发现啦</span>
                  <div>
                    <strong>{friendlyError.errorType}</strong>
                    {friendlyError.lineNumber && <em>第 {friendlyError.lineNumber} 行</em>}
                  </div>
                </div>
                <h3>{friendlyError.friendlyTitle}</h3>
                <p>{friendlyError.simpleExplanation}</p>
                {friendlyError.lessonHint && <p className="lesson-error-hint">{friendlyError.lessonHint}</p>}

                <div className="hint-steps">
                  <p><strong>提示 1：</strong>{friendlyError.hintLevel1}</p>
                  {errorHintLevel >= 2 && <p><strong>提示 2：</strong>{friendlyError.hintLevel2}</p>}
                  {errorHintLevel >= 3 && <p><strong>提示 3：</strong>{friendlyError.hintLevel3}</p>}
                </div>

                {errorHintLevel < 3 && (
                  <button
                    className="hint-more-button"
                    onClick={() => setErrorHintLevel((level) => Math.min(level + 1, 3))}
                    type="button"
                  >
                    {errorHintLevel === 1 ? '再给我一点提示' : '我想看更具体的提示'}
                  </button>
                )}

                <div className="local-first-note">
                  <span>先看本地提示，还是不明白再问 AI。</span>
                  <button onClick={() => openAiRequest(AI_TYPES.error)} type="button" disabled={isAiLoading || !savedApiKey}>
                    AI 帮我看看错误
                  </button>
                </div>

                <p className="encouragement">{friendlyError.encouragement}</p>

                <details className="raw-error">
                  <summary>查看原始错误</summary>
                  <pre>{friendlyError.originalError}</pre>
                </details>
              </div>
            )}
            {!checkResult && <p>点击检查任务后，这里会显示通关结果。</p>}
            {checkResult && (
              <>
                <p>{checkResult.message}</p>
                {checkResult.failedRules.length > 0 && (
                  <ul>
                    {checkResult.failedRules.map((rule) => (
                      <li key={rule}>{rule}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <details className="ai-assistant-panel" open={Boolean(aiThinkingRequest || aiPanel)}>
            <summary className="ai-main-summary">AI 小老师</summary>
            <div className="ai-content">
              <section className="ai-actions-panel">
                <div className="ai-action-copy">
                  <strong>需要时再打开</strong>
                  <span>先自己试一试，再请 AI 给一点提示。</span>
                </div>
                <div className="ai-action-buttons">
                  <button
                    onClick={() => openAiRequest(AI_TYPES.error)}
                    type="button"
                    disabled={isAiLoading || !friendlyError}
                  >
                    帮我看看错误
                  </button>
                  <button onClick={() => openAiRequest(AI_TYPES.explain)} type="button" disabled={isAiLoading}>
                    给我一点提示
                  </button>
                  <button onClick={() => openAiRequest(AI_TYPES.challenge)} type="button" disabled={isAiLoading}>
                    给我一个挑战
                  </button>
                  <button onClick={() => openAiRequest(AI_TYPES.parentReview)} type="button" disabled={isAiLoading}>
                    给家长的问题
                  </button>
                </div>
              </section>

              <details className="ai-settings">
                <summary className="ai-settings-summary">
                  <span>AI 助教设置</span>
                  <em>{savedApiKey ? `已保存 Key · ${aiMode === 'parent' ? '家长模式' : '孩子模式'}` : '未保存 API Key'}</em>
                </summary>

                <div className="ai-settings-body">
                  <div className="ai-settings-header">
                    <div>
                      <strong>AI 助教设置</strong>
                      <span>API Key 只保存在本机浏览器。</span>
                    </div>
                    <span className="ai-mode-pill">{aiMode === 'parent' ? '家长模式' : '孩子模式'}</span>
                  </div>

                  <div className="ai-key-row">
                    <input
                      value={apiKeyInput}
                      onChange={(event) => setApiKeyInput(event.target.value)}
                      placeholder={savedApiKey ? `已保存：${maskApiKey(savedApiKey)}` : '输入 DeepSeek API Key'}
                      type="password"
                      autoComplete="off"
                    />
                    <button onClick={saveApiKey} type="button">保存</button>
                    <button className="secondary-action" onClick={testApiKey} type="button">测试连接</button>
                    <button className="danger-action" onClick={clearApiKey} type="button" disabled={!savedApiKey && !apiKeyInput}>
                      清除
                    </button>
                  </div>

                  <label className="ai-model-row">
                    <span>模型</span>
                    <select value={deepSeekModel} onChange={(event) => changeDeepSeekModel(event.target.value)}>
                      <option value="deepseek-chat">deepseek-chat</option>
                      <option value="deepseek-reasoner">deepseek-reasoner</option>
                    </select>
                  </label>

                  <details className="ai-advanced-settings">
                    <summary>高级设置：API 地址</summary>
                    <p>
                      一般不用修改。默认使用 DeepSeek 官方地址。如果浏览器无法直接请求 DeepSeek，或者你以后使用自己的转发服务，可以在这里填写自定义地址。
                    </p>
                    <div className="ai-key-row">
                      <input
                        value={deepSeekBaseUrl}
                        onChange={(event) => setDeepSeekBaseUrl(event.target.value)}
                        placeholder={DEFAULT_DEEPSEEK_BASE_URL}
                        type="url"
                      />
                      <button onClick={saveBaseUrl} type="button">保存 API 地址</button>
                      <button className="secondary-action" onClick={restoreDefaultBaseUrl} type="button">
                        恢复默认 API 地址
                      </button>
                    </div>
                    <p>
                      如果你以后使用自己的转发服务，可以把 API 地址改成你的转发地址。比如 Cloudflare Worker 或 Vercel Function 地址。当前项目不会自动创建转发服务。
                    </p>
                    <p>家庭自用通常保持默认 DeepSeek 官方地址即可。</p>
                  </details>

                  <div className="ai-mode-row" aria-label="AI 模式选择">
                    <label>
                      <input
                        checked={aiMode === 'child'}
                        onChange={() => changeAiMode('child')}
                        type="radio"
                        name="ai-mode"
                      />
                      孩子模式
                    </label>
                    <label>
                      <input
                        checked={aiMode === 'parent'}
                        onChange={() => changeAiMode('parent')}
                        type="radio"
                        name="ai-mode"
                      />
                      家长模式
                    </label>
                  </div>

                  <p className="ai-usage">今天已使用 AI 助教：{aiUsageCount} 次</p>
                  {aiUsageCount > 20 && (
                    <p className="ai-warning">今天已经问了很多次 AI 啦。可以先试着自己改一改，再继续问。</p>
                  )}
                  {apiStatusMessage && <p className="ai-status">{apiStatusMessage}</p>}
                  {apiTestStatus && <p className="ai-status">{apiTestStatus}</p>}
                  <p className="ai-safe-note">
                    Key 只保存在当前浏览器本地，不会写入项目代码，也不会保存到 GitHub。使用 AI 功能时，当前代码、错误信息和课程任务会发送给 DeepSeek 用于生成提示。请不要在公共电脑保存 API Key。
                  </p>
                </div>
              </details>

              {aiThinkingRequest && (
                <section className="think-card">
                  <h3>{aiThinkingRequest.title}</h3>
                  <p>{aiThinkingRequest.content}</p>
                  <div>
                    <button onClick={() => runAiRequest(aiThinkingRequest.type)} type="button" disabled={isAiLoading}>
                      {aiThinkingRequest.confirmLabel}
                    </button>
                    <button
                      className="secondary-action"
                      onClick={() => setAiThinkingRequest(null)}
                      type="button"
                      disabled={isAiLoading}
                    >
                      {aiThinkingRequest.cancelLabel}
                    </button>
                  </div>
                </section>
              )}

              {aiPanel && (
                <section className="ai-result-card">
                  <div className="ai-result-heading">
                    <span>{getAiTypeLabel(aiPanel.type)}</span>
                    {isAiLoading && <em>生成中...</em>}
                  </div>
                  <p>{aiPanel.content}</p>
                  <div className="ai-result-actions">
                    {aiPanel.type === AI_TYPES.challenge && !isAiLoading && (
                      <button onClick={addTempChallenge} type="button">加入本关临时挑战</button>
                    )}
                    {!isAiLoading && (
                      <>
                        <button className="secondary-action" onClick={() => recordAiFeedback(true)} type="button">
                          有帮助
                        </button>
                        <button className="secondary-action" onClick={() => recordAiFeedback(false)} type="button">
                          没看懂
                        </button>
                        <button className="secondary-action" onClick={() => setAiPanel(null)} type="button">
                          关闭
                        </button>
                      </>
                    )}
                  </div>
                  {aiFeedbackMessage && <p className="ai-feedback-message">{aiFeedbackMessage}</p>}
                </section>
              )}
            </div>
          </details>
        </div>
      </section>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
