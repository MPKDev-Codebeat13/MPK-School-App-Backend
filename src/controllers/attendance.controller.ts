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

    let records, total
    try {
      ;[records, total] = await Promise.all([
        Attendance.find({})
          .sort({ date: -1 })
          .skip(skip)
          .limit(limitNum)
          .exec(),
        Attendance.countDocuments({}),
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

      return {
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

    const attendance = new Attendance({
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

    const deletedRecord = await Attendance.findByIdAndDelete(id)

    if (!deletedRecord) {
      return reply.status(404).send({ error: 'Attendance record not found' })
    }

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
