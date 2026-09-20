import { describe, it, expect } from 'vitest'
import { parseSSE, resolveConfig, chat } from './provider'

const stream = (chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(c) { chunks.forEach((s) => c.enqueue(new TextEncoder().encode(s))); c.close() },
  })

describe('@abhinavakhil/penna-ai', () => {
  it('parses SSE deltas across chunk boundaries', async () => {
    const s = stream([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\ndata: {"choices":[{"delta":{"con',
      'tent":"lo"}}]}\n\n: keepalive\n\ndata: [DONE]\n\n',
    ])
    let out = ''
    for await (const d of parseSSE(s)) out += d
    expect(out).toBe('Hello')
  })
  it('resolves groq defaults and rejects hosted for now', () => {
    const c = resolveConfig({ apiKey: 'k' })
    expect(c.baseUrl).toBe('https://api.groq.com/openai/v1')
    expect(c.model).toMatch(/llama/)
    expect(() => resolveConfig({ provider: 'penna' })).toThrow(/coming soon/)
    expect(() => resolveConfig({ provider: 'groq' })).toThrow(/apiKey/)
  })
  it('sends an OpenAI-style request and surfaces HTTP errors', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fetchMock = (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401, statusText: 'Unauthorized' })
    }) as unknown as typeof fetch
    const gen = chat({ apiKey: 'x', fetch: fetchMock }, [{ role: 'user', content: 'hi' }])
    await expect(gen.next()).rejects.toThrow(/bad key/)
    expect(calls[0].url).toBe('https://api.groq.com/openai/v1/chat/completions')
    expect(JSON.parse(calls[0].init.body as string).stream).toBe(true)
  })
})
