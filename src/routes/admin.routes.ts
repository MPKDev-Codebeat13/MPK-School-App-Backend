import { FastifyInstance } from 'fastify'
import {
  getAllUsers,
  getAllLessonPlans,
  getAllAttendances,
} from '../controllers/admin.controller'
import { authenticate } from '../middleware/auth'

export default async function adminRoutes(fastify: FastifyInstance) {
  fastify.get('/users', { preHandler: authenticate, handler: getAllUsers })
  fastify.get('/lesson-plans', {
    preHandler: authenticate,
    compress: false,
    handler: getAllLessonPlans,
  })
  fastify.get('/attendances', {
    preHandler: authenticate,
    handler: getAllAttendances,
  })
}
