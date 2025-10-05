import { FastifyInstance } from 'fastify'
import {
  createLessonPlan,
  generateAILessonPlan,
  getTeacherLessonPlans,
  submitLessonPlan,
  deleteLessonPlan,
  getLessonPlanById,
  updateLessonPlan,
} from '../controllers/teacher.controller'
import { authenticate } from '../middleware/auth'

export default async function teacherRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate)

  fastify.post('/lesson-plans', createLessonPlan)
  fastify.post('/lesson-plans/generate-ai', generateAILessonPlan)
  fastify.post('/lesson-plans/:id/submit', submitLessonPlan)
  fastify.delete('/lesson-plans/:id', deleteLessonPlan)
  fastify.get('/lesson-plans', getTeacherLessonPlans)
  fastify.get('/lesson-plans/:id', { compress: false }, getLessonPlanById)
  fastify.put('/lesson-plans/:id', updateLessonPlan)
}
