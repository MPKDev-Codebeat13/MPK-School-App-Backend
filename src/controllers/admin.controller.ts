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

    const { page, limit } = request.query as { page?: number; limit?: number }
    const pageNum = typeof page === 'number' && page > 0 ? page : 1
    const limitNum = typeof limit === 'number' && limit > 0 ? limit : 50
    const skip = (pageNum - 1) * limitNum

    const [lessonPlans, total] = await Promise.all([
      LessonPlan.find({})
        .populate('teacher', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      LessonPlan.countDocuments({}),
    ])

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
