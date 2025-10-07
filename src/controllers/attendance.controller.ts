import { FastifyReply, FastifyRequest } from 'fastify'
import Attendance from '../models/attendance.model'

export async function getAttendanceRecords(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    if (request.raw.aborted) {
      console.log('[DEBUG] Request aborted by client')
      return reply.code(499).send({ error: 'Client closed request' })
    }

    const { page, limit } = request.query as { page?: string; limit?: string }

    const pageNum = Math.max(parseInt(page || '1', 10), 1)
    const limitNum = Math.min(Math.max(parseInt(limit || '50', 10), 1), 100)
    const skip = (pageNum - 1) * limitNum

    console.log('[DEBUG] Attendance Pagination:', { pageNum, limitNum, skip })

    // Filter records based on user role
    let filter: any = {}
    const user = (request as any).user
    if (user.role === 'Babysitter') {
      filter.email = user.email
    }
    // Add more role-based filters here if needed

    let records, total
    try {
      ;[records, total] = await Promise.all([
        Attendance.find(filter)
          .sort({ date: -1 })
          .skip(skip)
          .limit(limitNum)
          .exec(),
        Attendance.countDocuments(filter),
      ])
    } catch (dbError) {
      console.error('[Attendance:getAttendanceRecords] DB error:', dbError)
      return reply.code(500).send({ error: 'Database error' })
    }

    if (request.raw.aborted) {
      console.log('[DEBUG] Request aborted before sending response')
      return reply.code(499).send({ error: 'Client closed request' })
    }

    // Calculate statistics for each record
    const recordsWithStats = records.map((record: any) => {
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

      const recordObj = record.toObject()
      // Remove students array to reduce response size for list view
      delete recordObj.students

      return {
        ...recordObj,
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
      records: recordsWithStats,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    })
  } catch (error) {
    console.error('[Attendance:getAttendanceRecords] Unexpected error:', error)
    reply.status(500).send({ error: 'Failed to fetch attendance records' })
  }
}

export async function createAttendanceRecord(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const { studentCount, students, grade, section } = request.body as {
      studentCount: number
      students: {
        name: string
        gender: string
        present: boolean
        absent: boolean
        uniform: boolean
        noHW: boolean
        noCW: boolean
      }[]
      grade: string
      section: string
    }

    if (
      !studentCount ||
      !students ||
      !Array.isArray(students) ||
      students.length > studentCount ||
      !grade ||
      !section
    ) {
      return reply.status(400).send({ error: 'Invalid attendance data' })
    }

    // Check if user has permission to create for this grade/section
    const user = (request as any).user
    if (
      user.role === 'Babysitter' &&
      (grade !== user.grade || section !== user.section)
    ) {
      return reply.status(403).send({ error: 'Access denied' })
    }
    const attendance = new Attendance({
      email: user.email,
      studentCount,
      students,
      grade,
      section,
    })

    await attendance.save()

    reply.status(201).send({ message: 'Attendance record created', attendance })
  } catch (error) {
    reply.status(500).send({ error: 'Failed to create attendance record' })
  }
}

export async function deleteAttendanceRecord(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const { id } = request.params as { id: string }

    if (!id) {
      return reply
        .status(400)
        .send({ error: 'Attendance record ID is required' })
    }

    const deletedRecord = await Attendance.findById(id)

    if (!deletedRecord) {
      return reply.status(404).send({ error: 'Attendance record not found' })
    }

    // Check if user has access to this record
    const user = (request as any).user
    if (user.role === 'Babysitter' && deletedRecord.email !== user.email) {
      return reply.status(403).send({ error: 'Access denied' })
    }

    await Attendance.findByIdAndDelete(id)

    reply.send({ message: 'Attendance record deleted successfully' })
  } catch (error) {
    reply.status(500).send({ error: 'Failed to delete attendance record' })
  }
}

export async function getAttendanceRecordById(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const { id } = request.params as { id: string }

    if (!id) {
      return reply
        .status(400)
        .send({ error: 'Attendance record ID is required' })
    }

    const record = await Attendance.findById(id)

    if (!record) {
      return reply.status(404).send({ error: 'Attendance record not found' })
    }

    // Check if user has access to this record
    const user = (request as any).user
    if (user.role === 'Babysitter' && record.email !== user.email) {
      return reply.status(403).send({ error: 'Access denied' })
    }

    // Calculate statistics for the record
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

    const recordWithStats = {
      ...record.toObject(),
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

    reply.send({ record: recordWithStats })
  } catch (error) {
    reply.status(500).send({ error: 'Failed to fetch attendance record' })
  }
}
