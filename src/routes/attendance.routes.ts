import { FastifyInstance } from 'fastify'
import {
  getAttendanceRecords,
  createAttendanceRecord,
  deleteAttendanceRecord,
  getAttendanceRecordById,
} from '../controllers/attendance.controller'

async function attendanceRoutes(fastify: FastifyInstance) {
  fastify.get('/list', getAttendanceRecords)
  fastify.post('/create', createAttendanceRecord)
  fastify.delete('/:id', deleteAttendanceRecord)
  fastify.get('/:id', getAttendanceRecordById)
}

export default attendanceRoutes
