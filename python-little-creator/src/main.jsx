import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import Editor from '@monaco-editor/react'
import lessons from './data/lessons.json'
import './styles.css'

const STORAGE_KEY = 'python-little-creator:v3'
const STAGE_TWO_STORAGE_KEY = 'python-little-creator:v2'
const LEGACY_STORAGE_KEY = 'python-little-creator:v1'
const PYODIDE_VERSION = '0.26.4'
const MAX_OUTPUT_LINES = 100
const RUN_TIMEOUT_MS = 8000

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

function explainPythonError(message) {
  if (!message) return ''
  if (message.includes('SyntaxError')) return '代码格式可能有问题，请检查是不是少了引号、括号或冒号。'
  if (message.includes('NameError')) return '这个名字 Python 还不认识，可能是变量名写错了，或者前面没有创建它。'
  if (message.includes('TypeError')) return '这里可能把文字和数字混在一起计算了，Python 有点分不清。'
  if (message.includes('IndentationError')) return '缩进可能不对，代码要像排队一样对齐。'
  if (message.includes('ValueError')) return '输入内容可能不适合转换成数字，比如 int() 需要输入数字。'
  if (message.includes('模拟输入不够')) return message
  return '代码运行时遇到问题了，可以先检查引号、括号、冒号、变量名和缩进。'
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
  const [friendlyError, setFriendlyError] = useState('')
  const [checkResult, setCheckResult] = useState(null)
  const [lessonNotice, setLessonNotice] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [pyodideStatus, setPyodideStatus] = useState('等待加载')
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
        friendlyError: cleanError ? explainPythonError(cleanError) : '',
      }
    } catch (error) {
      const message = error.message || String(error)
      const rawOutput = [stdout.join('\n').trim(), message].filter(Boolean).join('\n').trim()

      return {
        ok: false,
        output: limitOutputLines(rawOutput),
        error: message,
        friendlyError: explainPythonError(message),
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
    setFriendlyError('')
    touchStudyTime()
  }

  function updateInput(nextInput) {
    setLessonInputMap((previous) => ({
      ...previous,
      [currentLesson.id]: nextInput,
    }))
    setCheckResult(null)
    touchStudyTime()
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
    setFriendlyError('')
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
    setFriendlyError('')
    setCheckResult(null)
    setLessonNotice('')
    touchStudyTime()
  }

  async function runCode() {
    const runToken = runTokenRef.current + 1
    runTokenRef.current = runToken
    setIsRunning(true)
    setOutput('')
    setFriendlyError('')
    setCheckResult(null)
    setRunCountMap((previous) => ({
      ...previous,
      [currentLesson.id]: (previous[currentLesson.id] || 0) + 1,
    }))
    touchStudyTime()

    const result = await executePython(currentCode)
    if (runTokenRef.current === runToken) {
      setOutput(result.output || '代码运行完成，没有输出。')
      setFriendlyError(result.friendlyError || '')
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

          <div className="hint-box">
            <span>提示</span>
            <p>{currentLesson.hint}</p>
          </div>
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
              <div className="friendly-error">
                <strong>小提示</strong>
                <p>{friendlyError}</p>
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
        </div>
      </section>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
