import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import Editor from '@monaco-editor/react'
import lessons from './data/lessons.json'
import { AI_TYPES, buildAiMessages, getAiTypeLabel, getThinkPrompt } from './utils/aiPrompts'
import {
  AI_MODE_STORAGE_KEY,
  DEEPSEEK_API_KEY_STORAGE_KEY,
  callDeepSeek,
  getTodayUsage,
  incrementTodayUsage,
  maskApiKey,
  saveAiFeedback,
  testDeepSeekKey,
  validateApiKey,
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

const availableLessons = lessons.filter((lesson) => lesson.status === 'available')
const badgeDefinitions = [
  { id: 'first-code', title: '第一行代码', lessonId: 'lesson-01-hello' },
  { id: 'card-designer', title: '名片设计师', lessonId: 'lesson-02-card' },
  { id: 'variable-star', title: '变量小达人', lessonId: 'lesson-03-variables' },
  { id: 'condition-helper', title: '判断小能手', lessonId: 'lesson-07-weather' },
  { id: 'loop-star', title: '循环小达人', lessonId: 'lesson-09-countdown' },
  { id: 'game-maker', title: '小游戏创造师', lessonId: 'lesson-12-quiz' },
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
  return '未知检查规则'
}

function evaluateRule(rule, code, runResult) {
  if (rule.type === 'run_success') return runResult.ok
  if (rule.type === 'output_contains') return runResult.output.includes(rule.value)
  if (rule.type === 'code_contains') return code.includes(rule.value)
  if (rule.type === 'code_not_contains') return !code.includes(rule.value)
  if (rule.type === 'output_line_count_at_least') return countOutputLines(runResult.output) >= rule.value
  if (rule.type === 'code_contains_any') return rule.value.some((keyword) => code.includes(keyword))
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

function App() {
  const savedState = useMemo(loadSavedState, [])
  const safeInitialLesson = lessons.find(
    (lesson) => lesson.id === savedState.currentLessonId && lesson.status === 'available',
  )
  const [currentLessonId, setCurrentLessonId] = useState(safeInitialLesson?.id || availableLessons[0].id)
  const currentLesson = lessons.find((lesson) => lesson.id === currentLessonId) || availableLessons[0]
  const [completedLessons, setCompletedLessons] = useState(savedState.completedLessons)
  const [lessonCodeMap, setLessonCodeMap] = useState(savedState.lessonCodeMap)
  const [runCountMap, setRunCountMap] = useState(savedState.runCountMap)
  const [checkPassedMap, setCheckPassedMap] = useState(savedState.checkPassedMap)
  const [lessonInputMap, setLessonInputMap] = useState(savedState.lessonInputMap)
  const [earnedBadges, setEarnedBadges] = useState(savedState.earnedBadges)
  const [lastStudyAt, setLastStudyAt] = useState(savedState.lastStudyAt)
  const [newBadge, setNewBadge] = useState(null)
  const [output, setOutput] = useState('')
  const [friendlyError, setFriendlyError] = useState(null)
  const [errorHintLevel, setErrorHintLevel] = useState(1)
  const [checkResult, setCheckResult] = useState(null)
  const [lessonNotice, setLessonNotice] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [pyodideStatus, setPyodideStatus] = useState('等待加载')
  const [savedApiKey, setSavedApiKey] = useState(() => localStorage.getItem(DEEPSEEK_API_KEY_STORAGE_KEY) || '')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiStatusMessage, setApiStatusMessage] = useState('')
  const [apiTestStatus, setApiTestStatus] = useState('')
  const [aiMode, setAiMode] = useState(() => localStorage.getItem(AI_MODE_STORAGE_KEY) || 'child')
  const [aiUsageCount, setAiUsageCount] = useState(() => getTodayUsage())
  const [aiThinkingRequest, setAiThinkingRequest] = useState(null)
  const [aiPanel, setAiPanel] = useState(null)
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [aiFeedbackMessage, setAiFeedbackMessage] = useState('')
  const [tempChallenge, setTempChallenge] = useState(() => (
    localStorage.getItem(`${TEMP_CHALLENGE_PREFIX}${currentLessonId}`) || ''
  ))
  const pyodideRef = useRef(null)
  const runTokenRef = useRef(0)

  const completedAvailableCount = availableLessons.filter((lesson) => completedLessons.includes(lesson.id)).length
  const progressPercent = Math.round((completedAvailableCount / availableLessons.length) * 100)
  const currentLessonIndex = availableLessons.findIndex((lesson) => lesson.id === currentLesson.id)
  const nextLesson = availableLessons[currentLessonIndex + 1]
  const isCurrentCompleted = completedLessons.includes(currentLesson.id)
  const currentCode = lessonCodeMap[currentLesson.id] ?? currentLesson.starterCode
  const currentInput = lessonInputMap[currentLesson.id] ?? currentLesson.sampleInput ?? ''
  const totalRunCount = Object.values(runCountMap).reduce((sum, count) => sum + count, 0)
  const needsInput = currentLesson.checkRules?.some((rule) => rule.type === 'code_contains' && rule.value === 'input')
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

  async function getPyodide() {
    if (pyodideRef.current) {
      return pyodideRef.current
    }

    setPyodideStatus('正在加载 Python 环境，请稍等')
    const module = await import(
      /* @vite-ignore */ `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.mjs`
    )
    pyodideRef.current = await module.loadPyodide({
      indexURL: `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`,
    })
    setPyodideStatus('Python 环境已就绪')
    return pyodideRef.current
  }

  async function executePython(code) {
    const stdout = []
    const stderr = []
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

      const runPromise = pyodide.runPythonAsync(code)
      const timeoutPromise = new Promise((_, reject) => {
        window.setTimeout(() => {
          reject(new Error('运行时间有点久：程序可能进入了很长的循环，请检查循环条件。'))
        }, RUN_TIMEOUT_MS)
      })

      await Promise.race([runPromise, timeoutPromise])
      const cleanOutput = stdout.join('\n').trim()
      const cleanError = stderr.join('\n').trim()
      const rawOutput = [cleanOutput, cleanError].filter(Boolean).join('\n').trim()

      return {
        ok: cleanError.length === 0,
        output: limitOutputLines(rawOutput),
        error: cleanError,
        friendlyError: cleanError ? explainPythonError(cleanError, code, currentLesson) : null,
      }
    } catch (error) {
      const message = error.message || String(error)
      const rawOutput = [stdout.join('\n').trim(), message].filter(Boolean).join('\n').trim()

      return {
        ok: false,
        output: limitOutputLines(rawOutput),
        error: message,
        friendlyError: explainPythonError(message, code, currentLesson),
      }
    }
  }

  function touchStudyTime() {
    setLastStudyAt(new Date().toISOString())
  }

  function updateCode(nextCode) {
    setLessonCodeMap((previous) => ({
      ...previous,
      [currentLesson.id]: nextCode || '',
    }))
    setCheckResult(null)
    setFriendlyError(null)
    setErrorHintLevel(1)
    touchStudyTime()
  }

  function updateInput(nextInput) {
    setLessonInputMap((previous) => ({
      ...previous,
      [currentLesson.id]: nextInput,
    }))
    setCheckResult(null)
    setFriendlyError(null)
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

  async function testApiKey() {
    const keyToTest = apiKeyInput.trim() || savedApiKey
    const validation = validateApiKey(keyToTest)
    if (!validation.ok) {
      setApiStatusMessage(validation.message)
      return
    }

    setApiTestStatus('正在测试连接...')
    setApiStatusMessage('')
    try {
      await testDeepSeekKey(validation.value)
      setApiTestStatus('连接测试成功。')
    } catch {
      setApiTestStatus('测试失败。请检查 Key 是否复制完整、账户是否有额度、网络是否正常，或浏览器是否阻止请求。')
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
        lesson: currentLesson,
        code: currentCode,
        errorText: friendlyError?.originalError || output,
      })
      const content = await callDeepSeek({ apiKey: savedApiKey, messages })
      const nextUsageCount = incrementTodayUsage()
      setAiUsageCount(nextUsageCount)
      setAiPanel({ type, content })
    } catch {
      setAiPanel({
        type,
        content: 'AI 请求失败了。主课程仍然可以正常使用，请检查 Key、额度、网络或浏览器请求限制。',
      })
    } finally {
      setIsAiLoading(false)
    }
  }

  function addTempChallenge() {
    if (!aiPanel?.content || aiPanel.type !== AI_TYPES.challenge) return

    localStorage.setItem(`${TEMP_CHALLENGE_PREFIX}${currentLesson.id}`, aiPanel.content)
    setTempChallenge(aiPanel.content)
  }

  function clearTempChallenge() {
    localStorage.removeItem(`${TEMP_CHALLENGE_PREFIX}${currentLesson.id}`)
    setTempChallenge('')
  }

  function recordAiFeedback(helpful) {
    if (!aiPanel) return

    saveAiFeedback({
      lessonId: currentLesson.id,
      type: aiPanel.type,
      helpful,
      createdAt: new Date().toISOString(),
    })
    setAiFeedbackMessage(helpful ? '已记录：这个提示有帮助。' : '可以换个方式再问一次，或者先看本地提示和课程讲解。')
  }

  function resetCode() {
    setLessonCodeMap((previous) => ({
      ...previous,
      [currentLesson.id]: currentLesson.starterCode,
    }))
    setLessonInputMap((previous) => ({
      ...previous,
      [currentLesson.id]: currentLesson.sampleInput || '',
    }))
    setOutput('')
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

    setCurrentLessonId(lesson.id)
    setOutput('')
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
    setOutput('')
    setFriendlyError(null)
    setErrorHintLevel(1)
    setCheckResult(null)
    setRunCountMap((previous) => ({
      ...previous,
      [currentLesson.id]: (previous[currentLesson.id] || 0) + 1,
    }))
    touchStudyTime()

    const result = await executePython(currentCode)
    if (runTokenRef.current === runToken) {
      setOutput(result.output || '代码运行完成，没有输出。')
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
    const failedRules = currentLesson.checkRules
      .filter((rule) => !evaluateRule(rule, currentCode, runResult))
      .map(describeRule)

    if (failedRules.length === 0) {
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
        message: currentLesson.successMessage,
        failedRules: [],
      })
    } else {
      setCheckPassedMap((previous) => ({
        ...previous,
        [currentLesson.id]: false,
      }))
      setCheckResult({
        passed: false,
        message: currentLesson.hint,
        failedRules,
      })
    }

    setIsChecking(false)
  }

  function goNextLesson() {
    if (!nextLesson || !isCurrentCompleted) return
    selectLesson(nextLesson)
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
            <span>学习进度</span>
            <strong>已完成 {completedAvailableCount} / {availableLessons.length} 关</strong>
          </div>
          <div className="progress-track" aria-label={`已完成 ${completedAvailableCount} / ${availableLessons.length} 关`}>
            <div style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        <section className="study-card" aria-label="学习记录">
          <div className="study-title">学习记录</div>
          <dl>
            <div>
              <dt>当前关卡</dt>
              <dd>{currentLesson.title}</dd>
            </div>
            <div>
              <dt>总运行次数</dt>
              <dd>{totalRunCount}</dd>
            </div>
            <div>
              <dt>本关运行</dt>
              <dd>{runCountMap[currentLesson.id] || 0}</dd>
            </div>
            <div>
              <dt>徽章</dt>
              <dd>{earnedBadges.length} / {badgeDefinitions.length}</dd>
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
          </div>
        </section>

        {lessonNotice && <div className="lesson-notice">{lessonNotice}</div>}

        <nav className="lesson-nav">
          {lessons.map((lesson, index) => {
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
        </nav>
      </aside>

      <main className="task-panel">
        <section className="task-card">
          <p className="eyebrow">第 {currentLessonIndex + 1} 关 · {currentLesson.concept}</p>
          <h2>{currentLesson.title}</h2>

          <div className="task-section">
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

          <div className="task-section">
            <h3>改一改任务</h3>
            <p>{currentLesson.modifyTask}</p>
          </div>

          <div className="task-section">
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
            <div className="learning-section">
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
        </section>
      </main>

      <section className="workspace" aria-label="代码编辑器和输出结果">
        <div className="toolbar">
          <div>
            <strong>代码编辑器</strong>
            <span>{pyodideStatus} · 已运行 {runCountMap[currentLesson.id] || 0} 次</span>
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
            <button className="next-button" onClick={goNextLesson} type="button" disabled={!isCurrentCompleted || !nextLesson}>
              下一关
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
              <section className="ai-settings">
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
                  AI 请求只会发送当前关卡、当前代码和必要错误信息，不会发送完整课程库或学习记录。
                </p>
              </section>

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
