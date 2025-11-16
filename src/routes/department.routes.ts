import { FastifyInstance } from 'fastify'
import {
  getLessonPlansBySubject,
  acceptLessonPlan,
  rejectLessonPlan,
  getLessonPlanById,
  getRejectionReasons,
  markRejectionReasonResolved,
} from '../controllers/department.controller'
import { authenticate } from '../middleware/auth'

export default async function departmentRoutes(fastify: FastifyInstance) {
  fastify.get('/lesson-plans', {
    preHandler: authenticate,
    handler: getLessonPlansBySubject,
    compress: false,
  })
  fastify.get('/lesson-plans/:id', {
    preHandler: authenticate,
    handler: getLessonPlanById,
    compress: false,
  })
  fastify.post('/lesson-plans/:id/accept', {
    preHandler: authenticate,
    handler: acceptLessonPlan,
  })
  fastify.post('/lesson-plans/:id/reject', {
    preHandler: authenticate,
    handler: rejectLessonPlan,
  })
  fastify.get('/rejection-reasons', {
    preHandler: authenticate,
    handler: getRejectionReasons,
    compress: false,
  })
  fastify.put('/rejection-reasons/:id/resolve', {
    preHandler: authenticate,
    handler: markRejectionReasonResolved,
  })
  // Removed unaccept route as per user request
  // Removed unreject route as per user request
}
