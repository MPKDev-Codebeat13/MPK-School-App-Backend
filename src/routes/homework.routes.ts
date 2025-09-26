import { FastifyInstance } from 'fastify'
import { aiAssistantQuery } from '../controllers/homework.controller'
import { authenticate } from '../middleware/auth'

async function homeworkRoutes(fastify: FastifyInstance) {
  fastify.post('/homework/chat', {
    preHandler: authenticate,
    handler: aiAssistantQuery,
  })
}
export default homeworkRoutes
