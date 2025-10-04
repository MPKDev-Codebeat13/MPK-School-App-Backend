import { FastifyInstance } from 'fastify'
import {
  getAttendanceRecords,
  createAttendanceRecord,
  deleteAttendanceRecord,
  getAttendanceRecordById,
} from '../controllers/attendance.controller'

async function attendanceRoutes(fastify: FastifyInstance) {
  fastify.get('/', getAttendanceRecords)
  fastify.post('/', createAttendanceRecord)
  fastify.delete('/:id', deleteAttendanceRecord)
  fastify.get('/:id', getAttendanceRecordById)
}

export default attendanceRoutes
