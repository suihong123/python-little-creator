export const AI_TYPES = {
  error: 'error',
  explain: 'explain',
  challenge: 'challenge',
  parentReview: 'parentReview',
}

const typeLabels = {
  [AI_TYPES.error]: '错误解释',
  [AI_TYPES.explain]: '代码讲解',
  [AI_TYPES.challenge]: '小挑战',
  [AI_TYPES.parentReview]: '家长复盘',
}

export function getAiTypeLabel(type) {
  return typeLabels[type] || 'AI 提示'
}

export function getThinkPrompt(type) {
  if (type === AI_TYPES.error) {
    return {
      title: '先自己想 30 秒',
      content:
        '先看看报错附近的那一行：\n1. 引号、括号有没有成对？\n2. if / for 后面有没有冒号？\n3. 变量名是不是前后一模一样？',
      confirmLabel: '我已经想过了，请 AI 给提示',
      cancelLabel: '我再自己试试',
    }
  }

  if (type === AI_TYPES.explain) {
    return {
      title: '先自己想 30 秒',
      content:
        '先自己说一说：\n这段代码第一步让电脑做什么？\n哪一行是输入？\n哪一行是输出？',
      confirmLabel: '我已经想过了，请 AI 讲解',
      cancelLabel: '我再自己试试',
    }
  }

  if (type === AI_TYPES.challenge) {
    return {
      title: '先自己想 30 秒',
      content:
        '先想想：\n你想把这个程序改成什么主题？\n可以改名字、数字、问题、分数规则或列表内容。',
      confirmLabel: '我已经想过了，请 AI 出挑战',
      cancelLabel: '我再自己试试',
    }
  }

  return null
}

function buildSystemPrompt(type, mode) {
  const effectiveMode = type === AI_TYPES.parentReview ? 'parent' : mode
  const sharedRules = [
    '你是“Python 小小创造师”的家庭版 AI 助教，帮助 8-10 岁、学过 Scratch 的孩子学习 Python。',
    '不要直接给出完整可复制答案。如果必须举例，只给一小段关键片段。',
    '优先让孩子自己修改。多使用“你可以检查……”“你可以试着……”“想一想……”这样的表达。',
    '不要新增孩子没学过的复杂知识点。不要写长篇理论。',
    '如果看到孩子代码里有家庭真实姓名、地址等内容，不要复述隐私，只围绕代码学习给建议。',
  ]

  const modeRules =
    effectiveMode === 'parent'
      ? [
          '当前是家长模式：解释孩子可能卡在哪里，给家长 3 个追问，并说明如何判断孩子是否真懂。',
          '可以稍微详细一点，但总字数不要超过 300 字。',
        ]
      : [
          '当前是孩子模式：语言简单，每次只讲一个重点，不直接给完整答案，多鼓励。',
          '总字数控制在 150-200 字以内。',
        ]

  const typeRules = []
  if (type === AI_TYPES.error) {
    typeRules.push('这次任务是解释错误。只给排查方向和小提示，不直接修完整代码。')
  }
  if (type === AI_TYPES.explain) {
    typeRules.push('这次任务是讲解代码。用孩子能懂的话说明代码在做什么，最多提醒一个可以自己修改的地方。')
  }
  if (type === AI_TYPES.challenge) {
    typeRules.push(
      '这次任务是出一个小挑战。必须严格使用这个格式：\n小挑战：……\n\n你可以先改：\n1. ……\n2. ……\n\n想一想：……',
    )
    typeRules.push('不要输出完整代码，不要把挑战答案写出来。')
  }
  if (type === AI_TYPES.parentReview) {
    typeRules.push('这次任务是生成家长复盘问题。请给家长 3 个短问题和一个观察孩子是否理解的方法。')
  }
  typeRules.push('如果当前是 Python 勇者塔，不要建议 auto_fight、auto_win、next_floor、finish_level 这类自动完成函数。强调勇者塔动作函数只是画面反馈，真正重点是本层 Python 语法。')

  return [...sharedRules, ...modeRules, ...typeRules].join('\n')
}

function buildLessonSummary(lesson) {
  if (lesson.type === 'tower') {
    return [
      '当前模块：Python 勇者塔',
      `当前楼层：第 ${lesson.floor || ''} 层 ${lesson.title}`,
      `真正学习的 Python 本领：${lesson.syntaxFocus || lesson.skill}`,
      '动作函数 say、attack、heal、gain_coin、star、show_score、show_damage、show_status 只是画面反馈，不是本层重点。',
      `闯塔目标：${lesson.goal || '无'}`,
      `楼层场景：${lesson.scene || '无'}`,
      `任务要求：${lesson.tasks?.join('；') || '无'}`,
    ].join('\n')
  }

  if (lesson.type === 'project') {
    return [
      '当前内容类型：项目创造营',
      `当前项目名称：${lesson.title}`,
      `项目目标：${lesson.goal || '无'}`,
      `用到技能：${lesson.skills?.join('、') || lesson.concept || '无'}`,
      `生活场景：${lesson.scene || lesson.story || '无'}`,
      `任务要求：${lesson.requirements?.join('；') || lesson.modifyTask || '无'}`,
      `拓展挑战：${lesson.challenge || lesson.challengeTask || '无'}`,
    ].join('\n')
  }

  return [
    '当前内容类型：基础训练营',
    `课程标题：${lesson.title}`,
    `知识点：${lesson.concept}`,
    `今天目标：${lesson.goal || '无'}`,
    `改一改任务：${lesson.modifyTask || '无'}`,
    `挑战任务：${lesson.challengeTask || '无'}`,
  ].join('\n')
}

export function buildAiMessages({ type, mode, lesson, code, errorText }) {
  const effectiveMode = type === AI_TYPES.parentReview ? 'parent' : mode
  const userParts = [
    `AI 模式：${effectiveMode === 'parent' ? '家长模式' : '孩子模式'}`,
    `功能类型：${getAiTypeLabel(type)}`,
    buildLessonSummary(lesson),
    `当前代码：\n${code || ''}`,
  ]

  if (type === AI_TYPES.error) {
    userParts.push(`当前错误信息：\n${errorText || '没有捕获到错误信息'}`)
  }

  return {
    system: buildSystemPrompt(type, mode),
    user: userParts.join('\n\n'),
  }
}
