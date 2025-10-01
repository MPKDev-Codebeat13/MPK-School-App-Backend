import { FastifyReply, FastifyRequest } from 'fastify'
import AiResponse from '../models/aiResponse.model'
import OpenAI from 'openai'
import { CohereClient } from 'cohere-ai'

const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY,
})

interface AiAssistantRequest {
  question: string
}

export const aiAssistantQuery = async (
  request: FastifyRequest<{ Body: AiAssistantRequest }>,
  reply: FastifyReply
) => {
  const user = (request as any).user
  const allowedRoles = ['student', 'parent', 'teacher']
  if (!user || !allowedRoles.includes(user.role.toLowerCase())) {
    return reply.code(403).send({ error: 'Forbidden' })
  }

  const { question } = request.body

  if (!question || question.trim() === '') {
    return reply.code(400).send({ error: 'Question is required' })
  }

  const prompt = question.trim()
  const systemPrompt =
    'You are a helpful AI assistant for students, helping with homework, explaining concepts, providing study tips, and answering school-related questions.'

  let generatedContent: string | null = null
  let errorMessages: string[] = []

  const withTimeout = <T>(
    promise: Promise<T>,
    timeoutMs: number,
    abortController?: AbortController
  ): Promise<T> => {
    const timeoutPromise = new Promise<T>((_, reject) =>
      setTimeout(() => {
        if (abortController) abortController.abort()
        reject(new Error('Timeout'))
      }, timeoutMs)
    )
    return Promise.race([promise, timeoutPromise])
  }

  try {
    const aiPromises: Promise<{ content: string | null; service: string }>[] =
      []

    // --- OpenAI ---
    if (process.env.OPENAI_API_KEY) {
      const openaiPromise = (async () => {
        try {
          const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
          const completion = await withTimeout(
            openai.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: systemPrompt,
                },
                { role: 'user', content: prompt },
              ],
              max_tokens: 1000,
              temperature: 0.7,
            }),
            30000
          )
          return {
            content: completion.choices[0]?.message?.content || null,
            service: 'OpenAI',
          }
        } catch (error: any) {
          console.error('OpenAI failed:', error.message || error)
          return { content: null, service: 'OpenAI' }
        }
      })()
      aiPromises.push(openaiPromise)
    } else {
      errorMessages.push('OpenAI API key not configured')
    }

    // --- DeepSeek ---
    if (process.env.DEEPSEEK_API_KEY) {
      const deepSeekPromise = (async () => {
        try {
          const abortController = new AbortController()
          const promise = fetch(
            'https://api.deepseek.com/v1/chat/completions',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
              },
              body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                  {
                    role: 'system',
                    content: systemPrompt,
                  },
                  { role: 'user', content: prompt },
                ],
                max_tokens: 500,
                temperature: 0.7,
              }),
              signal: abortController.signal,
            }
          ).then(async (response) => {
            if (!response.ok) {
              throw new Error(`API error: ${response.status}`)
            }
            const data = await response.json()
            return data.choices[0]?.message?.content || null
          })

          const content = await withTimeout(promise, 30000, abortController)
          return { content, service: 'DeepSeek' }
        } catch (error: any) {
          console.error('DeepSeek failed:', error.message || error)
          return { content: null, service: 'DeepSeek' }
        }
      })()
      aiPromises.push(deepSeekPromise)
    } else {
      errorMessages.push('DeepSeek API key not configured')
    }

    // --- Cohere ---
    if (process.env.COHERE_API_KEY) {
      const coherePromise = (async () => {
        try {
          const response = await withTimeout(
            cohere.chat({
              model: 'command-r-light',
              message: prompt,
              maxTokens: 500,
              temperature: 0.7,
            }),
            30000
          )
          return { content: response.text || null, service: 'Cohere' }
        } catch (error: any) {
          console.error('Cohere failed:', error.message || error)
          return { content: null, service: 'Cohere' }
        }
      })()
      aiPromises.push(coherePromise)
    } else {
      errorMessages.push('Cohere API key not configured')
    }

    // --- Resolve ---
    if (aiPromises.length > 0) {
      const results = await Promise.allSettled(aiPromises)
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.content) {
          generatedContent = result.value.content
          console.log(`✅ AI generation succeeded with ${result.value.service}`)
          break
        }
      }
    }

    if (!generatedContent || !generatedContent.trim()) {
      return reply.code(500).send({
        error:
          'All AI services failed or timed out. Try again later or check API keys.',
        details: errorMessages,
      })
    }

    // Save the response to database
    const aiResponse = new AiResponse({
      userId: user.id,
      question: prompt,
      answer: generatedContent,
      apiUsed: 'AI Service', // Since we don't track which one succeeded, use generic
    })
    await aiResponse.save()

    reply.send({
      message: 'AI response generated successfully',
      answer: generatedContent,
    })
  } catch (error) {
    console.error('Error generating AI response:', error)
    reply.code(500).send({ error: 'Failed to generate AI response' })
  }
}
