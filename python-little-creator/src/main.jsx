import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import Editor from '@monaco-editor/react'
import lessons from './data/lessons.json'
import projects from './data/projects.json'
import gameLevels from './data/gameLevels.json'
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
const GAME_PROGRESS_STORAGE_KEY = 'plc_game_progress'
const CURRENT_PROJECT_STORAGE_KEY = 'plc_current_project_id'
const CURRENT_GAME_STORAGE_KEY = 'plc_current_game_id'
const LEARNING_MODE_STORAGE_KEY = 'plc_learning_mode'

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

const gameBadgeDefinitions = [
  { id: 'game-hello', title: '小小问候官', gameId: 'game-1-hello' },
  { id: 'game-sequence', title: '顺序行动员', gameId: 'game-2-sequence' },
  { id: 'game-variable', title: '变量魔法师', gameId: 'game-3-variable' },
  { id: 'game-input', title: '输入小信使', gameId: 'game-4-input' },
  { id: 'game-if', title: '判断小队长', gameId: 'game-5-if-else' },
  { id: 'game-loop', title: '循环小跑者', gameId: 'game-6-loop' },
  { id: 'game-npc', title: 'NPC 好朋友', gameId: 'game-7-npc' },
  { id: 'game-list', title: '句子收藏家', gameId: 'game-8-list' },
  { id: 'game-star', title: '星星挑战者', gameId: 'game-9-star' },
  { id: 'game-def', title: '函数小法师', gameId: 'game-10-def' },
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
    return runResult.gameActions?.some((action) => (
      action.type === rule.actionType && (!rule.textIncludes || action.text?.includes(rule.textIncludes))
    ))
  }
  if (rule.type === 'minActions') {
    return (runResult.gameActions || []).filter((action) => action.type === rule.actionType).length >= rule.value
  }
  if (rule.type === 'starsAtLeast') {
    return (runResult.gameActions || []).filter((action) => action.type === 'star').length >= rule.value
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

function normalizeGameLevel(level) {
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

function getInitialGameState(level) {
  return {
    player: { ...level.playerStart },
    stars: 0,
    speech: '',
    score: null,
    item: '',
    notice: '运行代码后，小农场会动起来。',
  }
}

function applyGameActions(level, actions) {
  const state = getInitialGameState(level)
  const blocked = new Set((level.obstacles || []).map((item) => `${item.x},${item.y}`))

  actions.forEach((action) => {
    if (action.type === 'move') {
      const next = { ...state.player }
      if (action.direction === 'right') next.x += 1
      if (action.direction === 'left') next.x -= 1
      if (action.direction === 'up') next.y -= 1
      if (action.direction === 'down') next.y += 1

      if (next.x < 1 || next.x > 6 || next.y < 1 || next.y > 6 || blocked.has(`${next.x},${next.y}`)) {
        state.notice = '这里过不去'
      } else {
        state.player = next
        state.notice = `向${action.direction}移动了一步`
      }
    }
    if (action.type === 'say') {
      state.speech = action.text
      state.notice = '角色说话了'
    }
    if (action.type === 'star') {
      state.stars += 1
      state.notice = '获得一颗星星'
    }
    if (action.type === 'score') {
      state.score = action.value
      state.notice = `当前分数：${action.value}`
    }
    if (action.type === 'item') {
      state.item = action.value
      state.notice = `获得物品：${action.value}`
    }
  })

  return state
}

function App() {
  const savedState = useMemo(loadSavedState, [])
  const safeInitialLesson = lessons.find(
    (lesson) => lesson.id === savedState.currentLessonId && lesson.status === 'available',
  )
  const [currentLessonId, setCurrentLessonId] = useState(safeInitialLesson?.id || availableLessons[0].id)
  const currentLesson = lessons.find((lesson) => lesson.id === currentLessonId) || availableLessons[0]
  const [learningMode, setLearningMode] = useState(() => localStorage.getItem(LEARNING_MODE_STORAGE_KEY) || 'lessons')
  const [currentProjectId, setCurrentProjectId] = useState(
    () => localStorage.getItem(CURRENT_PROJECT_STORAGE_KEY) || projects[0].id,
  )
  const [currentGameId, setCurrentGameId] = useState(
    () => localStorage.getItem(CURRENT_GAME_STORAGE_KEY) || gameLevels[0].id,
  )
  const currentProject = projects.find((project) => project.id === currentProjectId) || projects[0]
  const currentGame = gameLevels.find((level) => level.id === currentGameId) || gameLevels[0]
  const isProjectMode = learningMode === 'projects'
  const isGameMode = learningMode === 'games'
  const activeItem = isGameMode ? normalizeGameLevel(currentGame) : (isProjectMode ? normalizeProject(currentProject) : currentLesson)
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
  const [pythonLoadMessage, setPythonLoadMessage] = useState('Python 未准备')
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
  const [tempChallenge, setTempChallenge] = useState(() => (
    localStorage.getItem(`${TEMP_CHALLENGE_PREFIX}${isProjectMode ? currentProjectId : currentLessonId}`) || ''
  ))
  const [projectProgress, setProjectProgress] = useState(() => readStorage(PROJECT_PROGRESS_STORAGE_KEY))
  const [gameProgress, setGameProgress] = useState(() => readStorage(GAME_PROGRESS_STORAGE_KEY))
  const [gameActions, setGameActions] = useState([])
  const [gameState, setGameState] = useState(() => getInitialGameState(currentGame))
  const pyodideRef = useRef(null)
  const pyodideLoadingPromiseRef = useRef(null)
  const pythonLoadTimersRef = useRef([])
  const runTokenRef = useRef(0)

  const completedAvailableCount = availableLessons.filter((lesson) => completedLessons.includes(lesson.id)).length
  const progressPercent = Math.round((completedAvailableCount / availableLessons.length) * 100)
  const completedProjectCount = projects.filter((project) => projectProgress[project.id]?.completed).length
  const projectProgressPercent = Math.round((completedProjectCount / projects.length) * 100)
  const completedGameCount = gameLevels.filter((level) => gameProgress[level.id]?.completed).length
  const gameProgressPercent = Math.round((completedGameCount / gameLevels.length) * 100)
  const currentLessonIndex = availableLessons.findIndex((lesson) => lesson.id === currentLesson.id)
  const currentProjectIndex = projects.findIndex((project) => project.id === currentProject.id)
  const currentGameIndex = gameLevels.findIndex((level) => level.id === currentGame.id)
  const nextLesson = availableLessons[currentLessonIndex + 1]
  const nextProject = projects[currentProjectIndex + 1]
  const nextGame = gameLevels[currentGameIndex + 1]
  const isCurrentCompleted = isProjectMode
    ? Boolean(projectProgress[currentProject.id]?.completed)
    : (isGameMode ? Boolean(gameProgress[currentGame.id]?.completed) : completedLessons.includes(currentLesson.id))
  const currentCode = lessonCodeMap[activeItem.id] ?? activeItem.starterCode
  const currentInput = lessonInputMap[activeItem.id] ?? activeItem.sampleInput ?? ''
  const projectRunCount = projectProgress[currentProject.id]?.runCount || 0
  const gameRunCount = gameProgress[currentGame.id]?.runCount || 0
  const totalRunCount = Object.values(runCountMap).reduce((sum, count) => sum + count, 0)
    + Object.values(projectProgress).reduce((sum, progress) => sum + (progress.runCount || 0), 0)
    + Object.values(gameProgress).reduce((sum, progress) => sum + (progress.runCount || 0), 0)
  const activeRunCount = isGameMode ? gameRunCount : (isProjectMode ? projectRunCount : (runCountMap[currentLesson.id] || 0))
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
    localStorage.setItem(GAME_PROGRESS_STORAGE_KEY, JSON.stringify(gameProgress))
  }, [gameProgress])

  useEffect(() => {
    localStorage.setItem(LEARNING_MODE_STORAGE_KEY, learningMode)
    localStorage.setItem(CURRENT_PROJECT_STORAGE_KEY, currentProjectId)
    localStorage.setItem(CURRENT_GAME_STORAGE_KEY, currentGameId)
    setTempChallenge(localStorage.getItem(`${TEMP_CHALLENGE_PREFIX}${activeItem.id}`) || '')
    setAiThinkingRequest(null)
    setAiFeedbackMessage('')
    if (learningMode === 'games') {
      setGameActions([])
      setGameState(getInitialGameState(currentGame))
    }
  }, [learningMode, currentProjectId, currentGameId, activeItem.id])

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
    setPythonLoadMessage('正在连接 Python 运行环境……')

    pythonLoadTimersRef.current = [
      window.setTimeout(() => {
        setPythonLoadProgress(35)
        setPythonLoadMessage('正在下载运行文件，第一次可能会久一点……')
      }, 2000),
      window.setTimeout(() => {
        setPythonLoadProgress(65)
        setPythonLoadMessage('正在初始化 Python……')
      }, 6000),
      window.setTimeout(() => {
        setPythonLoadStatus('slow')
        setPythonLoadProgress(90)
        setPythonLoadMessage('Python 加载较慢，可能是网络访问运行环境较慢。第一次加载会久一点，后面浏览器缓存后通常会更快。')
      }, 12000),
      window.setTimeout(() => {
        setPythonLoadStatus('slow')
        setPythonLoadProgress(90)
        setPythonLoadMessage('Python 加载时间较长。可以继续等待，或之后考虑把 Pyodide 放到本地 public/pyodide/ 目录。')
      }, 45000),
    ]
  }

  async function getPyodide() {
    if (pyodideRef.current) {
      setPythonLoadStatus('ready')
      setPythonLoadProgress(100)
      setPythonLoadMessage('Python 已准备好，可以运行代码啦')
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
        setPythonLoadMessage('Python 已准备好，可以运行代码啦')
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
    let currentGameActions = []
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

      const gamePrelude = isGameMode ? `
game_actions = []

def move(direction):
    game_actions.append({"type": "move", "direction": str(direction)})
    print("move", direction)

def say(text):
    game_actions.append({"type": "say", "text": str(text)})
    print(text)

def star():
    game_actions.append({"type": "star"})
    print("获得一颗星星！")

def show_score(score):
    game_actions.append({"type": "score", "value": score})
    print("分数", score)

def show_item(item):
    game_actions.append({"type": "item", "value": str(item)})
    print("获得", item)
` : ''

      const runPromise = pyodide.runPythonAsync(`${interactivePrelude}\n${gamePrelude}\n${code}`)
      const timeoutPromise = new Promise((_, reject) => {
        window.setTimeout(() => {
          reject(new Error('运行时间有点久：程序可能进入了很长的循环，请检查循环条件。'))
        }, RUN_TIMEOUT_MS)
      })

      await Promise.race([runPromise, timeoutPromise])
      const cleanOutput = stdout.join('\n').trim()
      const cleanError = stderr.join('\n').trim()
      const rawOutput = [cleanOutput, cleanError].filter(Boolean).join('\n').trim()
      if (isGameMode) {
        const actionsProxy = pyodide.globals.get('game_actions')
        currentGameActions = actionsProxy.toJs({ dict_converter: Object.fromEntries })
        actionsProxy.destroy?.()
      }

      return {
        ok: cleanError.length === 0,
        output: limitOutputLines(rawOutput),
        error: cleanError,
        interactiveEvents: currentInteractiveEvents,
        gameActions: currentGameActions,
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
        gameActions: currentGameActions,
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
    setGameActions([])
    if (isGameMode) setGameState(getInitialGameState(currentGame))
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
    setGameActions([])
    if (isGameMode) setGameState(getInitialGameState(currentGame))
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
    setGameActions([])
    if (isGameMode) setGameState(getInitialGameState(currentGame))
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
    setGameActions([])
    setGameState(getInitialGameState(currentGame))
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
    setGameActions([])
    setGameState(getInitialGameState(currentGame))
    setFriendlyError(null)
    setErrorHintLevel(1)
    setCheckResult(null)
    setLessonNotice('')
    touchStudyTime()
  }

  function selectGame(level) {
    setLearningMode('games')
    setCurrentGameId(level.id)
    setOutput('')
    setInteractiveEvents([])
    setGameActions([])
    setGameState(getInitialGameState(level))
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
    setGameActions([])
    if (nextMode === 'games') setGameState(getInitialGameState(currentGame))
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
    setGameActions([])
    if (isGameMode) setGameState(getInitialGameState(currentGame))
    setOutput(
      pythonLoadStatus === 'loading' || pythonLoadStatus === 'slow' || pythonLoadStatus === 'idle'
        ? 'Python 正在准备中，请稍等一下……加载完成后会继续运行当前代码。'
        : '',
    )
    setFriendlyError(null)
    setErrorHintLevel(1)
    setCheckResult(null)
    if (isGameMode) {
      setGameProgress((previous) => ({
        ...previous,
        [currentGame.id]: {
          ...previous[currentGame.id],
          runCount: (previous[currentGame.id]?.runCount || 0) + 1,
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
      setGameActions(result.gameActions || [])
      if (isGameMode) setGameState(applyGameActions(currentGame, result.gameActions || []))
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
      if (isGameMode) {
        setGameProgress((previous) => ({
          ...previous,
          [currentGame.id]: {
            ...previous[currentGame.id],
            completed: true,
            completedAt: previous[currentGame.id]?.completedAt || new Date().toISOString(),
            runCount: previous[currentGame.id]?.runCount || 1,
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
      setCheckResult({
        passed: true,
        message: activeItem.successMessage,
        failedRules: [],
      })
    } else {
      if (!isProjectMode) {
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
    if (isGameMode) {
      if (nextGame) selectGame(nextGame)
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
            <span>{isGameMode ? '游戏进度' : (isProjectMode ? '项目进度' : '学习进度')}</span>
            <strong>
              {isGameMode
                ? `已完成 ${completedGameCount} / ${gameLevels.length} 个关卡`
                : (isProjectMode
                ? `已完成 ${completedProjectCount} / ${projects.length} 个项目`
                : `已完成 ${completedAvailableCount} / ${availableLessons.length} 关`)}
            </strong>
          </div>
          <div
            className="progress-track"
            aria-label={isGameMode
              ? `已完成 ${completedGameCount} / ${gameLevels.length} 个关卡`
              : (isProjectMode
              ? `已完成 ${completedProjectCount} / ${projects.length} 个项目`
              : `已完成 ${completedAvailableCount} / ${availableLessons.length} 关`)}
          >
            <div style={{ width: `${isGameMode ? gameProgressPercent : (isProjectMode ? projectProgressPercent : progressPercent)}%` }} />
          </div>
        </div>

        <div className="camp-switch" aria-label="学习入口">
          <button
            className={learningMode === 'lessons' ? 'active' : ''}
            onClick={() => switchLearningMode('lessons')}
            type="button"
          >
            <strong>基础训练营</strong>
            <span>第 1-36 关：学习 Python 本领</span>
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
            className={learningMode === 'games' ? 'active' : ''}
            onClick={() => switchLearningMode('games')}
            type="button"
          >
            <strong>游戏闯关营</strong>
            <span>用 Python 控制小农场画面</span>
          </button>
        </div>

        <section className="study-card" aria-label="学习记录">
          <div className="study-title">学习记录</div>
          <dl>
            <div>
              <dt>{isGameMode ? '当前游戏' : (isProjectMode ? '当前项目' : '当前关卡')}</dt>
              <dd>{activeItem.title}</dd>
            </div>
            <div>
              <dt>总运行次数</dt>
              <dd>{totalRunCount}</dd>
            </div>
            <div>
              <dt>{isGameMode ? '本游戏运行' : (isProjectMode ? '本项目运行' : '本关运行')}</dt>
              <dd>{activeRunCount}</dd>
            </div>
            <div>
              <dt>徽章</dt>
              <dd>{earnedBadges.length + completedProjectCount + completedGameCount} / {badgeDefinitions.length + projectBadgeDefinitions.length + gameBadgeDefinitions.length}</dd>
            </div>
            <div>
              <dt>最近学习</dt>
              <dd>{formatStudyTime(lastStudyAt)}</dd>
            </div>
          </dl>
        </section>

        <section className="badge-card" aria-label="已获得徽章">
          <div className="study-title">我的徽章</div>
          <div className="badge-list">
            {badgeDefinitions.map((badge) => {
              const earned = earnedBadges.includes(badge.id)
              return (
                <span className={earned ? 'badge earned' : 'badge'} key={badge.id}>
                  {earned ? '✓ ' : ''}{badge.title}
                </span>
              )
            })}
            {projectBadgeDefinitions.map((badge) => {
              const earned = Boolean(projectProgress[badge.projectId]?.completed)
              return (
                <span className={earned ? 'badge earned project-badge' : 'badge project-badge'} key={badge.id}>
                  {earned ? '✓ ' : ''}{badge.title}
                </span>
              )
            })}
            {gameBadgeDefinitions.map((badge) => {
              const earned = Boolean(gameProgress[badge.gameId]?.completed)
              return (
                <span className={earned ? 'badge earned game-badge' : 'badge game-badge'} key={badge.id}>
                  {earned ? '✓ ' : ''}{badge.title}
                </span>
              )
            })}
          </div>
        </section>

        {lessonNotice && <div className="lesson-notice">{lessonNotice}</div>}

        <nav className="lesson-nav">
          {learningMode === 'lessons' && lessons.map((lesson, index) => {
            const isActive = lesson.id === currentLesson.id
            const isCompleted = completedLessons.includes(lesson.id)
            const className = [
              'lesson-item',
              isActive ? 'active' : '',
              lesson.status === 'locked' ? 'locked' : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <button className={className} key={lesson.id} onClick={() => selectLesson(lesson)} type="button">
                <span className="lesson-number">{String(index + 1).padStart(2, '0')}</span>
                <span className="lesson-title">
                  {lesson.title}
                  <small>{lesson.status === 'locked' ? lesson.comingSoonText : lesson.concept}</small>
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
          {learningMode === 'games' && gameLevels.map((level, index) => {
            const isActive = level.id === currentGame.id
            const isCompleted = Boolean(gameProgress[level.id]?.completed)
            const className = ['lesson-item', 'game-item', isActive ? 'active' : ''].filter(Boolean).join(' ')

            return (
              <button className={className} key={level.id} onClick={() => selectGame(level)} type="button">
                <span className="lesson-number">G{index + 1}</span>
                <span className="lesson-title">
                  {level.title}
                  <small>{level.syntaxFocus}</small>
                </span>
                {isCompleted && <span className="done-mark">✓</span>}
              </button>
            )
          })}
        </nav>
      </aside>

      <main className="task-panel">
        <section className="task-card">
          {isGameMode ? (
            <>
              <p className="eyebrow">游戏闯关营 · 小农场第 {currentGameIndex + 1} 关 · {currentGame.syntaxFocus}</p>
              <h2>{currentGame.title}</h2>
              <p className="project-subtitle">{currentGame.scene}</p>

              <div className="game-stage-card">
                <div className="game-hud">
                  <span>⭐ {gameState.stars}</span>
                  {gameState.score !== null && <span>分数：{gameState.score}</span>}
                  {gameState.item && <span>物品：{gameState.item}</span>}
                  <strong>{gameState.notice}</strong>
                </div>
                <div className="farm-grid" aria-label="Python 小农场画面">
                  {Array.from({ length: 36 }, (_, index) => {
                    const x = (index % 6) + 1
                    const y = Math.floor(index / 6) + 1
                    const obstacle = currentGame.obstacles?.find((item) => item.x === x && item.y === y)
                    const isPlayer = gameState.player.x === x && gameState.player.y === y
                    const isNpc = currentGame.npcPosition.x === x && currentGame.npcPosition.y === y
                    const isGoal = x === 6 && y === 1
                    return (
                      <div className={obstacle ? 'farm-cell blocked' : 'farm-cell'} key={`${x}-${y}`}>
                        {isPlayer && <span className="farm-player">🧒</span>}
                        {isNpc && !isPlayer && <span>🧑‍🌾</span>}
                        {obstacle?.type === 'tree' && <span>🌳</span>}
                        {obstacle?.type === 'house' && <span>🏠</span>}
                        {obstacle?.type === 'fence' && <span>🪵</span>}
                        {isGoal && !isPlayer && !isNpc && !obstacle && <span>⭐</span>}
                      </div>
                    )
                  })}
                </div>
                {gameState.speech && <div className="game-speech">🧒：{gameState.speech}</div>}
              </div>

              <div className="task-section task-goal-section">
                <h3>游戏任务</h3>
                <p>{currentGame.goal}</p>
              </div>

              <div className="learning-section project-steps-section">
                <h3>真正学习的 Python 本领</h3>
                <p>{currentGame.explain}</p>
              </div>

              <div className="learning-section practice-section">
                <h3>任务要求</h3>
                <ol>
                  {currentGame.tasks.map((task) => (
                    <li key={task}>{task}</li>
                  ))}
                </ol>
              </div>

              <div className="learning-section">
                <h3>改一改任务</h3>
                <ul>
                  {currentGame.modifyTask.map((task) => (
                    <li key={task}>{task}</li>
                  ))}
                </ul>
              </div>

              <div className="interactive-preview">
                <h3>游戏函数只负责画面反馈</h3>
                <p>
                  可以用 move("right")、say("你好")、star()、show_score(score)、show_item("苹果") 控制画面。
                  真正要练的是字符串、变量、if、for、list 和 def。
                </p>
              </div>

              <div className="learning-section">
                <h3>家长提问</h3>
                <ul>
                  {currentGame.parentQuestions.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
              </div>

              <div className="hint-box">
                <span>提示</span>
                <p>{currentGame.hint}</p>
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
              <p className="eyebrow">第 {currentLessonIndex + 1} 关 · {currentLesson.concept}</p>
              <h2>{currentLesson.title}</h2>

              <div className="task-section task-goal-section">
                <h3>今天目标</h3>
                <p>{currentLesson.goal}</p>
              </div>

              <div className="task-section">
                <h3>故事引入</h3>
                <p>{currentLesson.story}</p>
              </div>

              <div className="task-section">
                <h3>简单讲解</h3>
                <p>{currentLesson.explanation}</p>
              </div>

              <div className="task-section task-modify-section">
                <h3>改一改任务</h3>
                <p>{currentLesson.modifyTask}</p>
              </div>

              <div className="task-section task-challenge-section">
                <h3>挑战任务</h3>
                <p>{currentLesson.challengeTask}</p>
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

              <div className="hint-box">
                <span>提示</span>
                <p>{currentLesson.hint}</p>
              </div>

              {currentLesson.keyPoints?.length > 0 && (
                <div className="learning-section">
                  <h3>本关重点</h3>
                  <ul>
                    {currentLesson.keyPoints.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </div>
              )}

              {currentLesson.observeQuestion && (
                <div className="learning-section compact">
                  <h3>观察一下</h3>
                  <p>{currentLesson.observeQuestion}</p>
                </div>
              )}

              {currentLesson.practiceTasks?.length > 0 && (
                <div className="learning-section practice-section">
                  <h3>多练几次</h3>
                  <ol>
                    {currentLesson.practiceTasks.map((task) => (
                      <li key={task}>{task}</li>
                    ))}
                  </ol>
                </div>
              )}

              {currentLesson.commonMistakes?.length > 0 && (
                <div className="learning-section">
                  <h3>常见小错误</h3>
                  <div className="mistake-list">
                    {currentLesson.commonMistakes.map((mistake) => (
                      <article className="mistake-item" key={mistake.wrongCode}>
                        <code>{mistake.wrongCode}</code>
                        <p><strong>为什么错：</strong>{mistake.explanation}</p>
                        <p><strong>怎么修：</strong>{mistake.fixTip}</p>
                      </article>
                    ))}
                  </div>
                </div>
              )}

              {currentLesson.reviewQuestion && (
                <div className="learning-section compact">
                  <h3>复习问题</h3>
                  <p>{currentLesson.reviewQuestion}</p>
                </div>
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
              <strong>Python 状态</strong>
              <span>
                {pythonLoadMessage}
                {pythonLoadStatus === 'ready' ? ' ✅' : ''}
              </span>
            </div>
            <div className="python-progress-track" aria-label={`Python 加载进度 ${pythonLoadProgress}%`}>
              <div style={{ width: `${pythonLoadProgress}%` }} />
            </div>
            <em>{pythonLoadProgress}%</em>
            {pythonLoadStatus === 'error' && (
              <button className="python-retry-button" onClick={() => getPyodide()} type="button">
                重新加载 Python
              </button>
            )}
          </div>
          <div className="actions">
            <button className="secondary" onClick={resetCode} type="button">
              重置代码
            </button>
            <button className="secondary" onClick={checkTask} type="button" disabled={isRunning || isChecking}>
              {isChecking ? '检查中...' : '检查任务'}
            </button>
            <button onClick={runCode} type="button" disabled={isRunning || isChecking}>
              {isRunning ? '运行中...' : '运行代码'}
            </button>
            <button
              className="next-button"
              onClick={goNextLesson}
              type="button"
              disabled={!isCurrentCompleted || (isGameMode ? !nextGame : (isProjectMode ? !nextProject : !nextLesson))}
            >
              {isGameMode ? '下一游戏' : (isProjectMode ? '下一项目' : '下一关')}
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

          <div className="ai-assistant-panel">
            <div className="panel-title">家庭版 AI 助教</div>
            <div className="ai-content">
              <section className="ai-actions-panel">
                <div className="ai-action-copy">
                  <strong>AI 助教提示</strong>
                  <span>先自己想，再让 AI 给一点提示。</span>
                </div>
                <div className="ai-action-buttons">
                  <button
                    onClick={() => openAiRequest(AI_TYPES.error)}
                    type="button"
                    disabled={isAiLoading || !friendlyError}
                  >
                    AI 帮我看看错误
                  </button>
                  <button onClick={() => openAiRequest(AI_TYPES.explain)} type="button" disabled={isAiLoading}>
                    AI 讲讲这段代码
                  </button>
                  <button onClick={() => openAiRequest(AI_TYPES.challenge)} type="button" disabled={isAiLoading}>
                    AI 给我一个小挑战
                  </button>
                  <button onClick={() => openAiRequest(AI_TYPES.parentReview)} type="button" disabled={isAiLoading}>
                    AI 生成家长复盘问题
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
          </div>
        </div>
      </section>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
