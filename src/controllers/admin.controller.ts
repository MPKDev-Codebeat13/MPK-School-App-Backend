import { FastifyReply, FastifyRequest } from 'fastify'
import User from '../models/user.model'
import LessonPlan from '../models/lessonPlan.model'
import Attendance from '../models/attendance.model'
import { authenticate } from '../middleware/auth'

export async function getAllUsers(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    // Only allow admin users
    const user = (request as any).user
    if (!user || user.role !== 'Admin') {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const users = await User.find({}, 'fullName email role').lean()
    reply.send({ users })
  } catch (error) {
    reply.code(500).send({ error: 'Failed to fetch users' })
  }
}

export async function getAllLessonPlans(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    // Only allow admin users
    const user = (request as any).user
    if (!user || user.role !== 'Admin') {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    // Check if client aborted the request
    if (request.raw.aborted) {
      console.log('[DEBUG] Request aborted by client')
      return reply.code(499).send({ error: 'Client closed request' })
    }

    // Remove this check to avoid premature close error
    // if (request.raw.aborted) {
    //   console.log('[DEBUG] Request aborted before sending response')
    //   return reply.code(499).send({ error: 'Client closed request' })
    // }

    const { page, limit } = request.query as { page?: string; limit?: string }
    console.log('[DEBUG] Query params:', { page, limit })

    let pageNum = page ? parseInt(page, 10) : 1
    let limitNum = limit ? parseInt(limit, 10) : 50
    if (pageNum <= 0) pageNum = 1
    if (limitNum <= 0 || limitNum > 100) limitNum = 50 // Cap limit to prevent large responses
    const skip = (pageNum - 1) * limitNum

    console.log('[DEBUG] Parsed pagination:', { pageNum, limitNum, skip })

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
      console.error('[DEBUG] Database error:', dbError)
      return reply.code(500).send({ error: 'Database error' })
    }

    console.log(
      '[DEBUG] Fetched lesson plans:',
      lessonPlans.length,
      'total:',
      total
    )

    reply.send({
      lessonPlans,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    })
  } catch (error) {
    console.error('[DEBUG] Unexpected error in getAllLessonPlans:', error)
    reply.code(500).send({ error: 'Failed to fetch lesson plans' })
  }
}

export async function getAllAttendances(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    // Only allow admin users
    const user = (request as any).user
    if (!user || user.role !== 'Admin') {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const attendances = await Attendance.find({}).lean()

    reply.send({ attendances })
  } catch (error) {
    reply.code(500).send({ error: 'Failed to fetch attendances' })
  }
}
