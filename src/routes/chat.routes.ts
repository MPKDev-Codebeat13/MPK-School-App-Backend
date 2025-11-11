import { FastifyInstance } from 'fastify'
import { getAllUsers } from '../controllers/chat.controller'
import {
  saveMessage,
  getMessages,
  getUnreadMessageCount,
  markMessagesAsRead,
} from '../controllers/chatMessage.controller'
import { authenticate } from '../middleware/auth'
import * as fs from 'fs'
import * as path from 'path'

export default async function chatRoutes(fastify: FastifyInstance) {
  fastify.get('/users', { preHandler: authenticate, handler: getAllUsers })
  fastify.post('/messages', {
    preHandler: authenticate,
    handler: saveMessage,
  })
  fastify.get('/messages', {
    preHandler: authenticate,
    handler: getMessages,
  })

  fastify.get('/messages/unread', {
    preHandler: authenticate,
    handler: getUnreadMessageCount,
  })

  fastify.post('/messages/mark-read', {
    preHandler: authenticate,
    handler: markMessagesAsRead,
  })

  fastify.delete('/messages/:id', {
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
        const message = await Message.findById(id).populate('sender', 'email')

        if (!message) {
          console.log('[DEBUG] Message not found:', id)
          return reply.code(404).send({ error: 'Message not found' })
        }

        console.log('[DEBUG] Message found:', {
          messageId: message._id,
          senderEmail: (message.sender as any).email,
        })

        // Allow delete if sender email matches user email or user is admin or teacher
        if (
          (message.sender as any).email !== request.user.email &&
          request.user.role !== 'Admin' &&
          request.user.role !== 'Teacher'
        ) {
          console.log('[DEBUG] Unauthorized delete attempt:', {
            messageSenderEmail: (message.sender as any).email,
            requestUserEmail: request.user.email,
            userRole: request.user.role,
          })
          return reply.code(403).send({ error: 'Unauthorized' })
        }

        const deleteResult = await Message.findByIdAndDelete(id)
        console.log('[DEBUG] Delete result:', deleteResult)

        reply.send({ message: 'Message deleted' })
      } catch (error) {
        console.error('[ERROR] Failed to delete message:', error)
        reply.code(500).send({
          error: 'Failed to delete message',
          details: (error as Error).message,
        })
      }
    },
  })

  fastify.put('/messages/deleteForMe/:messageId', {
    preHandler: authenticate,
    handler: async (request: any, reply: any) => {
      try {
        const { messageId } = request.params
        const userId = request.user.id

        const Message = (await import('../models/message.model')).default
        const message = await Message.findById(messageId)

        if (!message) {
          console.log('[DEBUG] Message not found:', messageId)
          return reply.code(404).send({ error: 'Message not found' })
        }

        if (message.sender.toString() !== userId) {
          console.log(
            '[DEBUG] Unauthorized deleteForMe attempt by user:',
            userId
          )
          return reply.code(403).send({ error: 'Unauthorized' })
        }

        if (!message.deletedFor) {
          message.deletedFor = []
        }

        if (!message.deletedFor.includes(userId)) {
          message.deletedFor.push(userId)
          await message.save()
          console.log('[DEBUG] Message marked deleted for user:', userId)
        }

        reply.send({ success: true })
      } catch (error) {
        console.error('[ERROR] Failed to delete message for user:', error)
        reply.code(500).send({ error: 'Failed to delete message for you' })
      }
    },
  })
}
