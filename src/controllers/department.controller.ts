import { FastifyReply, FastifyRequest } from 'fastify'
import LessonPlan from '../models/lessonPlan.model'

export async function getLessonPlansBySubject(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const user = (request as any).user
    if (!user || user.role !== 'Department') {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const { subject } = request.query as any
    if (!subject) {
      return reply.code(400).send({ error: 'Subject is required' })
    }

    const lessonPlans = await LessonPlan.find({ subject, status: 'pending' }).lean()

    reply.send({ lessonPlans })
  } catch (error) {
    reply.code(500).send({ error: 'Failed to fetch lesson plans' })
  }
}

export async function acceptLessonPlan(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const user = (request as any).user
    if (!user || user.role !== 'Department') {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const { id } = request.params as any
    const lessonPlan = await LessonPlan.findById(id)
    if (!lessonPlan) {
      return reply.code(404).send({ error: 'Lesson plan not found' })
    }

    // Check if the subject matches the user's subject
    if (lessonPlan.subject !== user.subject) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    lessonPlan.status = 'accepted'
    await lessonPlan.save()

    reply.send({ message: 'Lesson plan accepted' })
  } catch (error) {
    reply.code(500).send({ error: 'Failed to accept lesson plan' })
  }
}

export async function rejectLessonPlan(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const user = (request as any).user
    if (!user || user.role !== 'Department') {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const { id } = request.params as any
    const lessonPlan = await LessonPlan.findById(id)
    if (!lessonPlan) {
      return reply.code(404).send({ error: 'Lesson plan not found' })
    }

    // Check if the subject matches the user's subject
    if (lessonPlan.subject !== user.subject) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    lessonPlan.status = 'rejected'
    await lessonPlan.save()

    reply.send({ message: 'Lesson plan rejected' })
  } catch (error) {
    reply.code(500).send({ error: 'Failed to reject lesson plan' })
  }
}

export async function getLessonPlanById(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const user = (request as any).user
    if (!user || (user.role !== 'Department' && user.role !== 'Admin')) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const { id } = request.params as any
    const lessonPlan = await LessonPlan.findById(id).lean()

    if (!lessonPlan) {
      return reply.code(404).send({ error: 'Lesson plan not found' })
    }

    if (user.role === 'Department' && lessonPlan.subject !== user.subject) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    reply.send(lessonPlan)
  } catch (error) {
    reply.code(500).send({ error: 'Failed to fetch lesson plan' })
  }
}
