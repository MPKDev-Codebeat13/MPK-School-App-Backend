import { FastifyInstance } from 'fastify'
import { getAllUsers } from '../controllers/chat.controller'
import { saveMessage, getMessages } from '../controllers/chatMessage.controller'
import { authenticate } from '../middleware/auth'
import * as fs from 'fs'
import * as path from 'path'

export default async function chatRoutes(fastify: FastifyInstance) {
  fastify.get('/chat/users', { preHandler: authenticate, handler: getAllUsers })
  fastify.post('/chat/messages', {
    preHandler: authenticate,
    handler: saveMessage,
  })
  fastify.get('/chat/messages', {
    preHandler: authenticate,
    handler: getMessages,
  })

  fastify.delete('/chat/messages/:id', {
    preHandler: authenticate,
    handler: async (request: any, reply: any) => {
      try {
        const { id } = request.params
        console.log('[DEBUG] Delete message request:', {
          id,
          userId: request.user.id,
          userRole: request.user.role,
        })

        const Message = (await import('../models/message.model')).default
        const message = await Message.findById(id)

        if (!message) {
          console.log('[DEBUG] Message not found:', id)
          return reply.code(404).send({ error: 'Message not found' })
        }

        console.log('[DEBUG] Message found:', {
          messageId: message._id,
          senderId: message.sender._id,
          senderIdString: message.sender._id.toString(),
        })

        // Allow delete if sender is user or user is admin or teacher
        if (
          message.sender._id.toString() !== request.user.id.toString() &&
          request.user.role !== 'Admin' &&
          request.user.role !== 'Teacher'
        ) {
          console.log('[DEBUG] Unauthorized delete attempt:', {
            messageSender: message.sender._id.toString(),
            requestUser: request.user.id,
            userRole: request.user.role,
          })
          return reply.code(403).send({ error: 'Unauthorized' })
        }

        const deleteResult = await Message.findByIdAndDelete(id)
        console.log('[DEBUG] Delete result:', deleteResult)

        reply.send({ message: 'Message deleted' })
      } catch (error) {
        console.error('[ERROR] Failed to delete message:', error)
        reply
          .code(500)
          .send({
            error: 'Failed to delete message',
            details: (error as Error).message,
          })
      }
    },
  })
}
