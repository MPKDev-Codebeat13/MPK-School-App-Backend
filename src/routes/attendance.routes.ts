import { FastifyInstance } from 'fastify'
import {
  getAttendanceRecords,
  createAttendanceRecord,
  deleteAttendanceRecord,
  getAttendanceRecordById,
} from '../controllers/attendance.controller'

async function attendanceRoutes(fastify: FastifyInstance) {
  fastify.get('/babysitter/attendance', getAttendanceRecords)
  fastify.post('/babysitter/attendance', createAttendanceRecord)
  fastify.delete('/babysitter/attendance/:id', deleteAttendanceRecord)
  fastify.get('/babysitter/attendance/:id', getAttendanceRecordById)
}

export default attendanceRoutes
