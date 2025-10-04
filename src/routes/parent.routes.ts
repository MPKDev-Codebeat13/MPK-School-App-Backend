import { FastifyInstance } from 'fastify'
import { aiAssistantQuery } from '../controllers/parent.controller'
import { authenticate } from '../middleware/auth'

async function parentRoutes(fastify: FastifyInstance) {
  fastify.post('/ai-assistant', {
    preHandler: authenticate,
    compress: false,
    handler: aiAssistantQuery,
  })
}
export default parentRoutes
