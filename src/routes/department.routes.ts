import { FastifyInstance } from 'fastify'
import {
  getLessonPlansBySubject,
  acceptLessonPlan,
  rejectLessonPlan,
  getLessonPlanById,
} from '../controllers/department.controller'
import { authenticate } from '../middleware/auth'

export default async function departmentRoutes(fastify: FastifyInstance) {
  fastify.get('/lesson-plans', {
    preHandler: authenticate,
    handler: getLessonPlansBySubject,
  })
  fastify.get('/lesson-plans/:id', {
    preHandler: authenticate,
    handler: getLessonPlanById,
  })
  fastify.post('/lesson-plans/:id/accept', {
    preHandler: authenticate,
    handler: acceptLessonPlan,
  })
  fastify.post('/lesson-plans/:id/reject', {
    preHandler: authenticate,
    handler: rejectLessonPlan,
  })
  // Removed unaccept route as per user request
  // Removed unreject route as per user request
}
