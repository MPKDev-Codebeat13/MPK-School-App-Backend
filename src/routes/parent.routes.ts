import { FastifyInstance } from 'fastify'
import { aiAssistantQuery } from '../controllers/parent.controller'
import { authenticate } from '../middleware/auth'

async function parentRoutes(fastify: FastifyInstance) {
  fastify.post('/parent/ai-assistant', {
    preHandler: authenticate,
    handler: aiAssistantQuery,
  })
}
export default parentRoutes
