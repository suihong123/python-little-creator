const errorTypes = [
  'IndentationError',
  'SyntaxError',
  'NameError',
  'TypeError',
  'ValueError',
  'IndexError',
  'KeyError',
  'ZeroDivisionError',
]

const chinesePunctuation = ['（', '）', '，', '：', '“', '”', '‘', '’']
const pythonKeywords = new Set([
  'and',
  'as',
  'def',
  'else',
  'elif',
  'False',
  'for',
  'if',
  'in',
  'input',
  'int',
  'print',
  'range',
  'return',
  'True',
  'while',
])

function detectErrorType(errorText) {
  return errorTypes.find((type) => errorText.includes(type)) || 'UnknownError'
}

function detectLineNumber(errorText) {
  const matches = [...errorText.matchAll(/line\s+(\d+)/g)]
  if (matches.length === 0) return null
  return Number(matches[matches.length - 1][1])
}

function getLine(code, lineNumber) {
  if (!lineNumber) return ''
  return code.split(/\r?\n/)[lineNumber - 1] || ''
}

function countChar(text, char) {
  return [...text].filter((item) => item === char).length
}

function hasUnpairedQuotes(text) {
  return countChar(text, '"') % 2 === 1 || countChar(text, "'") % 2 === 1
}

function hasUnpairedParentheses(text) {
  return countChar(text, '(') !== countChar(text, ')')
}

function hasChinesePunctuation(text) {
  return chinesePunctuation.some((mark) => text.includes(mark))
}

function hasMissingColon(line) {
  const trimmed = line.trim()
  return /^(if|elif|else|for|while|def)\b/.test(trimmed) && !trimmed.endsWith(':')
}

function hasSingleEqualsInIf(line) {
  const trimmed = line.trim()
  return /^if\b/.test(trimmed) && /[^=!<>]=[^=]/.test(trimmed)
}

function extractNameError(errorText) {
  return errorText.match(/name ['"]([^'"]+)['"] is not defined/)?.[1] || null
}

function extractDefinedNames(code) {
  const names = new Set()
  for (const line of code.split(/\r?\n/)) {
    const assignment = line.match(/^\s*([A-Za-z_]\w*)\s*=/)
    const functionDef = line.match(/^\s*def\s+([A-Za-z_]\w*)\s*\(/)
    for (const match of [assignment, functionDef]) {
      if (match?.[1] && !pythonKeywords.has(match[1])) names.add(match[1])
    }
  }
  return [...names]
}

function levenshtein(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      )
    }
  }
  return matrix[a.length][b.length]
}

function findClosestName(name, code) {
  if (!name) return null
  const candidates = extractDefinedNames(code)
  let best = null
  for (const candidate of candidates) {
    const distance = levenshtein(name, candidate)
    const maxLength = Math.max(name.length, candidate.length)
    const similarity = maxLength === 0 ? 0 : 1 - distance / maxLength
    if (similarity >= 0.65 && (!best || similarity > best.similarity)) {
      best = { name: candidate, similarity }
    }
  }
  return best?.name || null
}

function getLessonContextHint(errorType, lesson) {
  const concept = lesson?.concept || ''
  if (errorType === 'TypeError' && concept.includes('input')) {
    return '这一关正在练 input。input 读到的内容会先当成文字，做数学计算前要特别小心。'
  }
  if (errorType === 'ValueError' && concept.includes('int')) {
    return '这一关正在练 int。只有像 “8” 这样的数字文字，才适合变成数字。'
  }
  if ((errorType === 'SyntaxError' || errorType === 'IndentationError') && concept.includes('if')) {
    return '这一关和判断有关。if、elif、else 后面常常要有冒号，下面的代码也要缩进。'
  }
  if (errorType === 'IndentationError' && (concept.includes('for') || concept.includes('range'))) {
    return '这一关和循环有关。for 下面重复执行的代码，需要整齐地往右缩进。'
  }
  if (errorType === 'IndexError' && concept.includes('list')) {
    return '这一关和列表有关。列表编号从 0 开始，第一个位置不是 1。'
  }
  return ''
}

function getBaseExplanation(errorType) {
  const base = {
    SyntaxError: {
      friendlyTitle: '这一行的符号可能没有配对好',
      simpleExplanation: 'Python 可能在这一行有点看不懂，常见原因是少了引号、括号、冒号，或者用了中文符号。',
      hintLevel1: '先看看出错那一行，符号是不是成双成对。',
      hintLevel2: '重点检查引号、括号、冒号，还有中文符号和英文符号有没有混用。',
      hintLevel3: '把文字用一对英文引号包起来，把括号补完整，再运行试试看。',
    },
    NameError: {
      friendlyTitle: 'Python 找不到这个名字',
      simpleExplanation: '这个名字 Python 还不认识，可能是变量名写错了，或者前面没有创建它。',
      hintLevel1: '先检查变量名是不是前后一模一样。',
      hintLevel2: '看看这个变量是不是已经在前面用 = 创建过。',
      hintLevel3: '把使用变量的地方和创建变量的地方逐字对一遍。',
    },
    TypeError: {
      friendlyTitle: '这里的类型可能不适合一起使用',
      simpleExplanation: '可能把文字和数字放在一起计算了，Python 有点分不清。',
      hintLevel1: '先看看这一行有没有把文字和数字放在一起加减乘除。',
      hintLevel2: '如果用了 input()，它读到的内容通常先是文字。',
      hintLevel3: '如果要做数学计算，想一想是不是需要先用 int() 转成数字。',
    },
    ValueError: {
      friendlyTitle: '这段文字可能不能变成数字',
      simpleExplanation: '你可能把不能变成数字的文字交给了 int()，比如“苹果”。',
      hintLevel1: '先看看模拟输入区里是不是写了数字。',
      hintLevel2: 'int() 更喜欢 8、10、23 这样的数字文字。',
      hintLevel3: '把输入改成数字，再运行试试看。',
    },
    IndentationError: {
      friendlyTitle: '代码排队可能没有对齐',
      simpleExplanation: 'Python 很看重排队整齐。if、for、def 后面的代码通常要往右缩进。',
      hintLevel1: '先看看出错行附近，哪些代码应该属于同一组。',
      hintLevel2: 'if、for、def 下面的代码通常要往右空 4 个空格。',
      hintLevel3: '让同一组代码左边对齐，再运行试试看。',
    },
    IndexError: {
      friendlyTitle: '列表里可能没有这个位置',
      simpleExplanation: '列表像一排小格子，格子的编号从 0 开始。你可能访问了一个不存在的位置。',
      hintLevel1: '先数一数列表里一共有几个内容。',
      hintLevel2: '如果有 2 个内容，能用的位置通常是 0 和 1。',
      hintLevel3: '把中括号里的编号改成列表里真的存在的位置。',
    },
    KeyError: {
      friendlyTitle: '字典里可能没有这个关键词',
      simpleExplanation: '字典像一本小词典，你要查的这个关键词可能不在字典里。',
      hintLevel1: '先看看字典里有哪些 key。',
      hintLevel2: '检查中括号里的文字是不是和字典里的 key 完全一样。',
      hintLevel3: '把查询的关键词改成字典里已经存在的 key。'
    },
    ZeroDivisionError: {
      friendlyTitle: '不能除以 0',
      simpleExplanation: '数学里不能除以 0，Python 也会卡住。',
      hintLevel1: '先看看除号 / 后面的数字是多少。',
      hintLevel2: '如果除号后面是 0，就要换成别的数字。',
      hintLevel3: '让除数不是 0，再运行试试看。',
    },
    UnknownError: {
      friendlyTitle: '小错误被发现啦',
      simpleExplanation: '代码运行时遇到问题了，可以先检查引号、括号、冒号、变量名和缩进。',
      hintLevel1: '先看出错行附近，找一个最可疑的小地方。',
      hintLevel2: '检查符号是不是成对，变量名是不是一致。',
      hintLevel3: '每次只改一个小地方，再运行试试看。',
    },
  }
  return base[errorType] || base.UnknownError
}

function applyPatternHints(explanation, { errorType, errorText, code, errorLine, lesson }) {
  const lineToCheck = errorLine || code
  const lessonHint = getLessonContextHint(errorType, lesson)
  const name = extractNameError(errorText)
  const closestName = findClosestName(name, code)

  if (hasUnpairedQuotes(lineToCheck) || hasUnpairedQuotes(code)) {
    explanation.friendlyTitle = '这一行的文字可能没有关好门'
    explanation.hintLevel1 = '先看看文字两边的引号是不是一左一右都有。'
    explanation.hintLevel2 = '引号要配成一对，就像给文字开门和关门。'
    explanation.hintLevel3 = '把缺少的英文引号补上，再运行试试看。'
  }

  if (hasUnpairedParentheses(lineToCheck) || hasUnpairedParentheses(code)) {
    explanation.hintLevel2 = '小括号要像一对小手一样配成一对，看看是不是少了左括号或右括号。'
  }

  if (hasMissingColon(errorLine)) {
    explanation.hintLevel1 = '这一句后面需要一个冒号 :，它表示下面要开始做这件事。'
    explanation.hintLevel2 = '请看看 if、elif、else、for、while 或 def 这一行最后有没有 :。'
  }

  if (hasSingleEqualsInIf(errorLine) || code.split(/\r?\n/).some(hasSingleEqualsInIf)) {
    explanation.friendlyTitle = 'if 判断里的等号可能写少了'
    explanation.simpleExplanation = '在 if 判断里，问“是不是相等”要用两个等号 ==。'
    explanation.hintLevel1 = '先看看 if 这一行，是不是写成了一个等号 =。'
    explanation.hintLevel2 = '一个等号 = 通常是把东西放进变量盒子里。'
    explanation.hintLevel3 = '判断相等时用 ==，再运行试试看。'
  }

  if (hasChinesePunctuation(code)) {
    explanation.hintLevel2 = 'Python 更喜欢英文符号。请检查是不是用了中文括号、中文冒号或中文引号。'
  }

  if (errorType === 'NameError' && name && closestName) {
    explanation.hintLevel2 = `你是不是想写 ${closestName}？现在写成了 ${name}，变量名要完全一样。`
  }

  if (errorType === 'TypeError' && code.includes('input(') && /[+\-*/]/.test(code)) {
    explanation.hintLevel2 = 'input() 得到的内容，电脑会先当成文字。如果想做数学计算，可以想一想是不是需要 int()。'
  }

  if (errorText.includes('模拟输入不够')) {
    explanation.friendlyTitle = '模拟输入可能不够用'
    explanation.simpleExplanation = '代码里有 input()，但模拟输入区没有准备足够的行数。'
    explanation.hintLevel1 = '每一次 input() 都需要模拟输入区里的一行内容。'
    explanation.hintLevel2 = '数一数代码里有几个 input()，再准备几行输入。'
    explanation.hintLevel3 = '在模拟输入区补上内容后，再运行试试看。'
  }

  if (lessonHint) {
    explanation.lessonHint = lessonHint
  }

  return explanation
}

export function explainPythonError(errorText, code, lesson) {
  const safeErrorText = errorText || ''
  const errorType = detectErrorType(safeErrorText)
  const lineNumber = detectLineNumber(safeErrorText)
  const errorLine = getLine(code, lineNumber)
  const base = getBaseExplanation(errorType)
  const explanation = applyPatternHints(
    {
      errorType,
      lineNumber,
      friendlyTitle: base.friendlyTitle,
      simpleExplanation: base.simpleExplanation,
      hintLevel1: base.hintLevel1,
      hintLevel2: base.hintLevel2,
      hintLevel3: base.hintLevel3,
      encouragement: '报错不是失败，程序员就是这样一点点把代码修好的。',
      originalError: safeErrorText,
    },
    { errorType, errorText: safeErrorText, code, errorLine, lesson },
  )

  return explanation
}
