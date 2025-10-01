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

  // Listen for premature close or abort events on the request
  let requestAborted = false
  request.raw.on('close', () => {
    requestAborted = true
    console.warn('Request stream closed prematurely')
  })
  request.raw.on('aborted', () => {
    requestAborted = true
    console.warn('Request aborted by client')
  })

  try {
    // Try OpenAI first
    if (process.env.OPENAI_API_KEY) {
      try {
        const openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        })
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: 1000,
          temperature: 0.7,
        })
        generatedContent = completion.choices[0].message.content
      } catch (error: any) {
        console.error('OpenAI failed:', error)
        if (error.status === 429) {
          errorMessages.push('OpenAI: Quota exceeded')
        } else {
          errorMessages.push(`OpenAI: ${error.message || 'Unknown error'}`)
        }
      }
    } else {
      errorMessages.push('OpenAI API key not configured')
    }

    // If OpenAI failed or not configured, try DeepSeek
    if (!generatedContent) {
      if (process.env.DEEPSEEK_API_KEY) {
        try {
          const deepSeekResponse = await fetch(
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
                  {
                    role: 'user',
                    content: prompt,
                  },
                ],
                max_tokens: 1000,
                temperature: 0.7,
              }),
            }
          )

          if (deepSeekResponse.ok) {
            const deepSeekData = await deepSeekResponse.json()
            generatedContent = deepSeekData.choices[0].message.content
          } else {
            console.error(
              'DeepSeek API error:',
              deepSeekResponse.status,
              deepSeekResponse.statusText
            )
            if (deepSeekResponse.status === 402) {
              errorMessages.push('DeepSeek: Payment required')
            } else {
              errorMessages.push(
                `DeepSeek: ${deepSeekResponse.status} ${deepSeekResponse.statusText}`
              )
            }
          }
        } catch (error: any) {
          console.error('DeepSeek failed:', error)
          errorMessages.push(`DeepSeek: ${error.message || 'Unknown error'}`)
        }
      } else {
        errorMessages.push('DeepSeek API key not configured')
      }
    }

    // If DeepSeek failed or not configured, try Hugging Face
    if (!generatedContent) {
      if (process.env.HUGGINGFACE_API_KEY) {
        try {
          const response = await fetch(
            'https://api-inference.huggingface.co/models/gpt2',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                inputs: prompt,
                parameters: {
                  max_new_tokens: 1000,
                  temperature: 0.7,
                },
              }),
            }
          )

          if (!response.ok) {
            throw new Error(
              `Hugging Face API error: ${response.status} ${response.statusText}`
            )
          }

          const data = await response.json()
          if (
            Array.isArray(data) &&
            data.length > 0 &&
            data[0].generated_text
          ) {
            generatedContent = data[0].generated_text
          } else {
            throw new Error('Invalid response from Hugging Face API')
          }
        } catch (error: any) {
          console.error('Hugging Face failed:', error)
          errorMessages.push(
            `Hugging Face: ${error.message || 'Unknown error'}`
          )
        }
      } else {
        errorMessages.push('Hugging Face API key not configured')
      }
    }

    // If Hugging Face failed or not configured, try Cohere
    if (!generatedContent) {
      if (process.env.COHERE_API_KEY) {
        try {
          const response = await cohere.generate({
            model: 'command',
            prompt: `${systemPrompt}\n\n${prompt}`,
            maxTokens: 1000,
            temperature: 0.7,
          })
          generatedContent = response.generations[0].text
        } catch (error: any) {
          console.error('Cohere failed:', error)
          errorMessages.push(`Cohere: ${error.message || 'Unknown error'}`)
        }
      } else {
        errorMessages.push('Cohere API key not configured')
      }
    }

    if (requestAborted) {
      console.warn('Request aborted before AI response could be sent')
      return
    }

    if (!generatedContent) {
      return reply.code(500).send({
        error:
          'All AI services are currently unavailable. Please try again later or contact support.',
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
    if (!requestAborted) {
      reply.code(500).send({ error: 'Failed to generate AI response' })
    }
  }
}
