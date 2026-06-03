export const DEEPSEEK_API_KEY_STORAGE_KEY = 'plc_deepseek_api_key'
export const DEEPSEEK_BASE_URL_STORAGE_KEY = 'plc_deepseek_base_url'
export const DEEPSEEK_MODEL_STORAGE_KEY = 'plc_deepseek_model'
export const AI_MODE_STORAGE_KEY = 'plc_ai_mode'
export const AI_FEEDBACK_STORAGE_KEY = 'plc_ai_feedback'

export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat'

function dateStamp(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getDailyUsageKey(date = new Date()) {
  return `plc_ai_usage_${dateStamp(date)}`
}

export function getTodayUsage() {
  const value = Number(localStorage.getItem(getDailyUsageKey()) || 0)
  return Number.isFinite(value) ? value : 0
}

export function incrementTodayUsage() {
  const nextValue = getTodayUsage() + 1
  localStorage.setItem(getDailyUsageKey(), String(nextValue))
  return nextValue
}

export function maskApiKey(key) {
  if (!key) return ''
  if (key.length <= 8) return '已保存'
  return `${key.slice(0, 3)}...${key.slice(-4)}`
}

export function validateApiKey(value) {
  const trimmed = value.trim()
  if (!trimmed) {
    return { ok: false, value: '', message: 'API Key 不能为空。' }
  }
  if (trimmed.length < 20) {
    return { ok: false, value: trimmed, message: '这个 Key 看起来不太完整。' }
  }
  return { ok: true, value: trimmed, message: '' }
}

export function normalizeBaseUrl(baseUrl) {
  const value = (baseUrl || DEFAULT_DEEPSEEK_BASE_URL).trim()
  return value.replace(/\/+$/, '')
}

export function validateBaseUrl(value) {
  const trimmed = value.trim()
  if (!trimmed) {
    return { ok: false, value: '', message: 'API 地址不能为空。' }
  }
  if (/\s/.test(trimmed)) {
    return { ok: false, value: trimmed, message: 'API 地址里不能有空格。' }
  }
  if (!/^https?:\/\//.test(trimmed)) {
    return { ok: false, value: trimmed, message: 'API 地址需要以 http:// 或 https:// 开头。' }
  }

  const normalized = normalizeBaseUrl(trimmed)
  if (/\/chat\/completions$/i.test(normalized)) {
    return {
      ok: true,
      value: normalized.replace(/\/chat\/completions$/i, ''),
      message: '这里建议填写 Base URL，不需要包含 /chat/completions，已帮你修正。',
    }
  }

  return { ok: true, value: normalized, message: 'API 地址已保存。' }
}

export function describeDeepSeekFailure(error) {
  const message = error?.message || String(error)
  if (/401|403/.test(message)) {
    return '连接失败，可能是 API Key 不正确或没有权限。'
  }
  if (/402|429/.test(message)) {
    return '连接失败，可能是账户额度不足或已达到限制。'
  }
  if (/cors|failed to fetch|networkerror|network/i.test(message)) {
    return '浏览器可能无法直接请求当前 API 地址。你可以继续使用本地规则提示，或以后配置一个 Cloudflare Worker / Vercel Function 转发地址。'
  }
  return '连接失败，请检查 API 地址、API Key、账户额度和网络连接。'
}

export function saveAiFeedback(feedback) {
  let current = []
  try {
    current = JSON.parse(localStorage.getItem(AI_FEEDBACK_STORAGE_KEY)) || []
  } catch {
    current = []
  }

  localStorage.setItem(AI_FEEDBACK_STORAGE_KEY, JSON.stringify([...current, feedback]))
}

export async function callDeepSeek({ apiKey, baseUrl, model = DEFAULT_DEEPSEEK_MODEL, messages, maxTokens = 520 }) {
  const endpoint = `${normalizeBaseUrl(baseUrl)}/chat/completions`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: messages.system },
        { role: 'user', content: messages.user },
      ],
      temperature: 0.4,
      max_tokens: maxTokens,
    }),
  })

  if (!response.ok) {
    throw new Error(`DeepSeek 请求失败：${response.status}`)
  }

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content?.trim()
  if (!content) {
    throw new Error('DeepSeek 没有返回可显示的内容。')
  }

  return content
}

export async function testDeepSeekKey({ apiKey, baseUrl, model }) {
  return callDeepSeek({
    apiKey,
    baseUrl,
    model,
    maxTokens: 80,
    messages: {
      system: '你是一个简短的连接测试助手，只回复“连接成功”。',
      user: '请确认连接是否成功。',
    },
  })
}
