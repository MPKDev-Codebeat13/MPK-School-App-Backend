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

    const lessonPlans = await LessonPlan.find({})
      .populate('teacher', 'fullName email')
      .lean()

    reply.send({ lessonPlans })
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

    const attendances = await Attendance.find({})
      .populate('babysitter', 'fullName email')
      .lean()

    reply.send({ attendances })
  } catch (error) {
    reply.code(500).send({ error: 'Failed to fetch attendances' })
  }
}
