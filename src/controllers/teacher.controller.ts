import { FastifyReply, FastifyRequest } from 'fastify'
import LessonPlan from '../models/lessonPlan.model'
import OpenAI from 'openai'
import { CohereClient } from 'cohere-ai'

const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY,
})

export async function createLessonPlan(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const user = (request as any).user
    if (!user || user.role !== 'Teacher') {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const { title, description, subject, grade, type } = request.body as any

    if (!title || !description || !subject || !grade || !type) {
      return reply.code(400).send({ error: 'All fields are required' })
    }

    const lessonPlan = new LessonPlan({
      title,
      description,
      subject,
      grade,
      teacher: user.id,
      type,
    })

    await lessonPlan.save()

    reply.code(201).send({
      message: 'Lesson plan created successfully',
      lessonPlan,
    })
  } catch (error) {
    console.error('Error creating lesson plan:', error)
    reply.code(500).send({ error: 'Failed to create lesson plan' })
  }
}

export async function generateAILessonPlan(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const user = (request as any).user
    if (!user || user.role !== 'Teacher') {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const { grade, topic, subject } = request.body as any

    if (!grade || !topic || !subject) {
      return reply
        .code(400)
        .send({ error: 'Grade, topic, and subject are required' })
    }

    const prompt = `Create a detailed lesson plan for Grade ${grade} students on the topic "${topic}" in ${subject}. Include learning objectives, materials needed, step-by-step activities, and assessment methods.`

    let generatedContent: string | null = null
    let errorMessages: string[] = []

    // Helper function to add timeout to promises with AbortController for fetch
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

    // Prepare all AI service promises
    const aiPromises: Promise<{ content: string | null; service: string }>[] =
      []

    // OpenAI
    if (process.env.OPENAI_API_KEY) {
      const openaiPromise = (async () => {
        try {
          const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
          })
          const completion = await withTimeout(
            openai.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content:
                    'You are a helpful assistant that creates detailed lesson plans for teachers. Create a comprehensive lesson plan with objectives, materials, activities, and assessment.',
                },
                {
                  role: 'user',
                  content: prompt,
                },
              ],
              max_tokens: 1000,
              temperature: 0.7,
            }),
            30000 // 30 second timeout
          )
          return {
            content: completion.choices[0]?.message?.content || null,
            service: 'OpenAI',
          }
        } catch (error: any) {
          console.error('OpenAI failed:', error)
          return { content: null, service: 'OpenAI' }
        }
      })()
      aiPromises.push(openaiPromise)
    } else {
      errorMessages.push('OpenAI API key not configured')
    }

    // DeepSeek
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
                    content:
                      'You are a helpful assistant that creates detailed lesson plans for teachers. Create a comprehensive lesson plan with objectives, materials, activities, and assessment.',
                  },
                  {
                    role: 'user',
                    content: prompt,
                  },
                ],
                max_tokens: 500,
                temperature: 0.7,
              }),
              signal: abortController.signal,
            }
          ).then(async (response) => {
            if (!response.ok) {
              throw new Error(
                `API error: ${response.status} ${response.statusText}`
              )
            }
            const data = await response.json()
            return data.choices[0]?.message?.content || null
          })

          const content = await withTimeout(promise, 30000, abortController)
          return { content, service: 'DeepSeek' }
        } catch (error: any) {
          console.error('DeepSeek failed:', error)
          return { content: null, service: 'DeepSeek' }
        }
      })()
      aiPromises.push(deepSeekPromise)
    } else {
      errorMessages.push('DeepSeek API key not configured')
    }

    // Cohere
    if (process.env.COHERE_API_KEY) {
      const coherePromise = (async () => {
        try {
          const promise = cohere
            .chat({
              model: 'command-r-plus',
              message: prompt,
              maxTokens: 500,
              temperature: 0.7,
            })
            .then((response) => response.text || null)

          const content = await withTimeout(promise, 30000)
          return { content, service: 'Cohere' }
        } catch (error: any) {
          console.error('Cohere failed:', error)
          return { content: null, service: 'Cohere' }
        }
      })()
      aiPromises.push(coherePromise)
    } else {
      errorMessages.push('Cohere API key not configured')
    }

    // Wait for the first successful result
    if (aiPromises.length > 0) {
      try {
        const results = await Promise.allSettled(aiPromises)
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value.content) {
            generatedContent = result.value.content
            console.log(`AI generation succeeded with ${result.value.service}`)
            break
          }
        }
      } catch (error) {
        console.error('Error in parallel AI calls:', error)
      }
    }

    if (!generatedContent || !generatedContent.trim()) {
      return reply.code(500).send({
        error:
          'All AI services are currently unavailable or timed out. Please try again later or contact support.',
        details: errorMessages,
      })
    }

    reply.send({
      message: 'AI lesson plan generated successfully',
      title: `AI Generated Lesson Plan - ${topic}`,
      description: generatedContent.trim(),
      subject,
      grade,
      type: 'ai',
    })
  } catch (error) {
    console.error('Error generating AI lesson plan:', error)
    reply.code(500).send({ error: 'Failed to generate AI lesson plan' })
  }
}

export async function submitLessonPlan(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const user = (request as any).user
    if (!user || user.role !== 'Teacher') {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const { id } = request.params as any

    const lessonPlan = await LessonPlan.findOne({ _id: id, teacher: user.id })
    if (!lessonPlan) {
      return reply.code(404).send({ error: 'Lesson plan not found' })
    }

    if (lessonPlan.status !== 'pending') {
      return reply
        .code(400)
        .send({ error: 'Lesson plan is not in pending status' })
    }

    lessonPlan.status = 'pending' // Keep as pending but mark as submitted for review
    await lessonPlan.save()

    reply.send({ message: 'Lesson plan submitted for review', lessonPlan })
  } catch (error) {
    console.error('Error submitting lesson plan:', error)
    reply.code(500).send({ error: 'Failed to submit lesson plan' })
  }
}

export async function deleteLessonPlan(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const user = (request as any).user
    if (!user || user.role !== 'Teacher') {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const { id } = request.params as any

    const lessonPlan = await LessonPlan.findOne({ _id: id, teacher: user.id })
    if (!lessonPlan) {
      return reply.code(404).send({ error: 'Lesson plan not found' })
    }

    await LessonPlan.findByIdAndDelete(id)

    reply.send({ message: 'Lesson plan deleted successfully' })
  } catch (error) {
    console.error('Error deleting lesson plan:', error)
    reply.code(500).send({ error: 'Failed to delete lesson plan' })
  }
}

export async function getTeacherLessonPlans(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const user = (request as any).user
    if (!user || user.role !== 'Teacher') {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const { subject } = request.query as any
    const query: any = { teacher: user.id }
    if (subject && subject !== 'All') {
      query.subject = subject
    }

    const lessonPlans = await LessonPlan.find(query)
      .sort({ createdAt: -1 })
      .lean()

    reply.send({ lessonPlans })
  } catch (error) {
    console.error('Error fetching teacher lesson plans:', error)
    reply.code(500).send({ error: 'Failed to fetch lesson plans' })
  }
}

export async function getLessonPlanById(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const user = (request as any).user
    if (!user || user.role !== 'Teacher') {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const { id } = request.params as any

    const lessonPlan = await LessonPlan.findOne({ _id: id, teacher: user.id })
      .populate('teacher', 'fullName email')
      .lean()

    if (!lessonPlan) {
      return reply.code(404).send({ error: 'Lesson plan not found' })
    }

    reply.send({ lessonPlan })
  } catch (error) {
    console.error('Error fetching lesson plan:', error)
    reply.code(500).send({ error: 'Failed to fetch lesson plan' })
  }
}

export async function updateLessonPlan(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const user = (request as any).user
    if (!user || user.role !== 'Teacher') {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const { id } = request.params as any
    const { title, description, subject, grade, type } = request.body as any

    if (!title || !description || !subject || !grade || !type) {
      return reply.code(400).send({ error: 'All fields are required' })
    }

    const lessonPlan = await LessonPlan.findOne({ _id: id, teacher: user.id })
    if (!lessonPlan) {
      return reply.code(404).send({ error: 'Lesson plan not found' })
    }

    lessonPlan.title = title
    lessonPlan.description = description
    lessonPlan.subject = subject
    lessonPlan.grade = grade
    lessonPlan.type = type

    await lessonPlan.save()

    reply.send({
      message: 'Lesson plan updated successfully',
      lessonPlan,
    })
  } catch (error) {
    console.error('Error updating lesson plan:', error)
    reply.code(500).send({ error: 'Failed to update lesson plan' })
  }
}
