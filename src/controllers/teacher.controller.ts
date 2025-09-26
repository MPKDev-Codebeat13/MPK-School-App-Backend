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
          // Use a text generation model that supports text generation, e.g. "gpt2" is not ideal for chat completions
          // Adjusted to use the text generation endpoint properly
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
            prompt: prompt,
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

    if (!generatedContent) {
      return reply.code(500).send({
        error:
          'All AI services are currently unavailable. Please try again later or contact support.',
        details: errorMessages,
      })
    }

    // Create lesson plan record
    const lessonPlan = new LessonPlan({
      title: `AI Generated Lesson Plan - ${topic}`,
      description: generatedContent,
      subject,
      grade,
      teacher: user.id,
      type: 'ai',
    })

    await lessonPlan.save()

    reply.send({
      message: 'AI lesson plan generated successfully',
      lessonPlan,
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
