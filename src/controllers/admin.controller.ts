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

    if (request.raw.aborted) {
      console.log('[DEBUG] Request aborted by client')
      return reply.code(499).send({ error: 'Client closed request' })
    }

    const { page, limit } = request.query as { page?: string; limit?: string }

    const pageNum = Math.max(parseInt(page || '1', 10), 1)
    const limitNum = Math.min(Math.max(parseInt(limit || '50', 10), 1), 100)
    const skip = (pageNum - 1) * limitNum

    console.log('[DEBUG] Attendance Pagination:', { pageNum, limitNum, skip })

    let attendances, total
    try {
      ;[attendances, total] = await Promise.all([
        Attendance.find({})
          .sort({ date: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        Attendance.countDocuments({}),
      ])
    } catch (dbError) {
      console.error('[Admin:getAllAttendances] DB error:', dbError)
      return reply.code(500).send({ error: 'Database error' })
    }

    if (request.raw.aborted) {
      console.log('[DEBUG] Request aborted before sending response')
      return reply.code(499).send({ error: 'Client closed request' })
    }

    // Calculate statistics for each record
    const attendancesWithStats = attendances.map((record: any) => {
      const students = record.students || []
      const totalStudents = students.length

      const presentCount = students.filter((s: any) => s.present).length
      const absentCount = students.filter((s: any) => s.absent).length
      const uniformCount = students.filter((s: any) => s.uniform).length
      const noUniformCount = totalStudents - uniformCount
      const hwCount = students.filter((s: any) => !s.noHW).length
      const noHwCount = students.filter((s: any) => s.noHW).length
      const cwCount = students.filter((s: any) => !s.noCW).length
      const noCwCount = students.filter((s: any) => s.noCW).length

      return {
        ...record,
        stats: {
          totalStudents,
          presentCount,
          absentCount,
          uniformCount,
          noUniformCount,
          hwCount,
          noHwCount,
          cwCount,
          noCwCount,
        },
      }
    })

    reply.type('application/json').send({
      attendances: attendancesWithStats,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    })
  } catch (error) {
    console.error('[Admin:getAllAttendances] Unexpected error:', error)
    reply.code(500).send({ error: 'Failed to fetch attendances' })
  }
}
