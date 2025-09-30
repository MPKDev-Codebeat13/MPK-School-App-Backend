import { FastifyReply, FastifyRequest } from 'fastify'
import User from '../models/user.model'
import LessonPlan from '../models/lessonPlan.model'
import Attendance from '../models/attendance.model'

export async function getAllUsers(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const user = (request as any).user
    if (!user || user.role !== 'Admin') {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const users = await User.find({}, 'fullName email role').lean()
    reply.type('application/json').send({ users })
  } catch (error) {
    console.error('[Admin:getAllUsers] Error:', error)
    reply.code(500).send({ error: 'Failed to fetch users' })
  }
}

export async function getAllLessonPlans(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const user = (request as any).user
    if (!user || user.role !== 'Admin') {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    if (request.raw.aborted) {
      console.log('[DEBUG] Request aborted by client')
      return reply.code(499).send({ error: 'Client closed request' })
    }

    const { page, limit } = request.query as { page?: string; limit?: string }

    const pageNum = Math.max(parseInt(page || '1', 10), 1)
    const limitNum = Math.min(Math.max(parseInt(limit || '50', 10), 1), 100)
    const skip = (pageNum - 1) * limitNum

    console.log('[DEBUG] Pagination:', { pageNum, limitNum, skip })

    let lessonPlans, total
    try {
      ;[lessonPlans, total] = await Promise.all([
        LessonPlan.find({})
          .populate('teacher', 'fullName email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        LessonPlan.countDocuments({}),
      ])
    } catch (dbError) {
      console.error('[Admin:getAllLessonPlans] DB error:', dbError)
      return reply.code(500).send({ error: 'Database error' })
    }

    if (request.raw.aborted) {
      console.log('[DEBUG] Request aborted before sending response')
      return reply.code(499).send({ error: 'Client closed request' })
    }

    reply.type('application/json').send({
      lessonPlans,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    })
  } catch (error) {
    console.error('[Admin:getAllLessonPlans] Unexpected error:', error)
    reply.code(500).send({ error: 'Failed to fetch lesson plans' })
  }
}

export async function getAllAttendances(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const user = (request as any).user
    if (!user || user.role !== 'Admin') {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const attendances = await Attendance.find({}).lean()
    reply.type('application/json').send({ attendances })
  } catch (error) {
    console.error('[Admin:getAllAttendances] Error:', error)
    reply.code(500).send({ error: 'Failed to fetch attendances' })
  }
}
