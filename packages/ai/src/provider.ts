export type Provider = 'groq' | 'openai' | 'gemini' | 'mistral' | 'together' | 'openrouter' | 'ollama' | 'openai-compatible' | 'penna'

export interface AIConfig {
  /** Which backend. `groq` is free (console.groq.com). `penna` (hosted, no key) is reserved for a later release. */
  provider?: Provider
  apiKey?: string
  /** Override the endpoint; required for `openai-compatible`. */
  baseUrl?: string
  model?: string
  temperature?: number
  maxTokens?: number
  /** Extra headers, e.g. for a proxy. */
  headers?: Record<string, string>
  /** Route requests through your own server (recommended in production so the key never ships to the browser). */
  fetch?: typeof fetch
}

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

// OpenAI-compatible chat endpoints and a sensible free/cheap default model for each.
const PRESETS: Record<Exclude<Provider, 'openai-compatible' | 'penna'>, { baseUrl: string; model: string }> = {
  groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash' },
  mistral: { baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-latest' },
  together: { baseUrl: 'https://api.together.xyz/v1', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct:free' },
  ollama: { baseUrl: 'http://localhost:11434/v1', model: 'llama3.2' },
}

export function resolveConfig(cfg: AIConfig) {
  const provider = cfg.provider ?? 'groq'
  if (provider === 'penna') throw new Error('[penna/ai] Hosted Penna AI is coming soon. Use provider: "groq" with a free key from console.groq.com for now.')
  const preset = provider === 'openai-compatible' ? null : PRESETS[provider]
  const baseUrl = (cfg.baseUrl ?? preset?.baseUrl)?.replace(/\/$/, '')
  if (!baseUrl) throw new Error('[penna/ai] baseUrl is required for provider "openai-compatible"')
  const model = cfg.model ?? preset?.model
  if (!model) throw new Error('[penna/ai] model is required for provider "openai-compatible"')
  if (!cfg.apiKey && provider !== 'ollama' && provider !== 'openai-compatible') throw new Error(`[penna/ai] apiKey is required for provider "${provider}"`)
  return { provider, baseUrl, model, apiKey: cfg.apiKey, temperature: cfg.temperature ?? 0.5, maxTokens: cfg.maxTokens ?? 1024, headers: cfg.headers ?? {}, fetch: cfg.fetch ?? globalThis.fetch.bind(globalThis) }
}

/** Parse an OpenAI-style SSE stream, yielding text deltas. */
export async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') return
      try {
        const json = JSON.parse(data)
        const delta = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.text
        if (delta) yield delta as string
      } catch { /* ignore keepalive / partial lines */ }
    }
  }
}

/** Stream a chat completion. Yields text chunks. Throws with a readable message on HTTP errors. */
export async function* chat(cfg: AIConfig, messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<string> {
  const c = resolveConfig(cfg)
  const res = await c.fetch(`${c.baseUrl}/chat/completions`, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', ...(c.apiKey ? { authorization: `Bearer ${c.apiKey}` } : {}), ...c.headers },
    body: JSON.stringify({ model: c.model, messages, temperature: c.temperature, max_tokens: c.maxTokens, stream: true }),
  })
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`
    try { const j = await res.json(); msg = j.error?.message ?? msg } catch { /* noop */ }
    throw new Error(`[penna/ai] ${msg}`)
  }
  if (!res.body) throw new Error('[penna/ai] empty response body')
  yield* parseSSE(res.body)
}

export async function complete(cfg: AIConfig, messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
  let out = ''
  for await (const chunk of chat(cfg, messages, signal)) out += chunk
  return out
}
