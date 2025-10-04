import { FastifyInstance } from 'fastify'
import {
  getAttendanceRecords,
  createAttendanceRecord,
  deleteAttendanceRecord,
  getAttendanceRecordById,
} from '../controllers/attendance.controller'
import { authenticate } from '../middleware/auth'

async function attendanceRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate)

  fastify.get('/', getAttendanceRecords)
  fastify.post('/', createAttendanceRecord)
  fastify.delete('/:id', deleteAttendanceRecord)
  fastify.get('/:id', getAttendanceRecordById)
}

export default attendanceRoutes
