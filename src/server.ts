import * as dotenv from 'dotenv'
dotenv.config()
console.log('[DEBUG] Environment variables loaded from .env file')
console.log('[DEBUG] ENV:', {
  MONGO_URI: process.env.MONGO_URI,
  PORT: process.env.PORT,
  CLIENT_URL: process.env.CLIENT_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ? '***configured***' : 'NOT FOUND',
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY
    ? '***configured***'
    : 'NOT FOUND',
  HUGGINGFACE_API_KEY: process.env.HUGGINGFACE_API_KEY
    ? '***configured***'
    : 'NOT FOUND',
  COHERE_API_KEY: process.env.COHERE_API_KEY ? '***configured***' : 'NOT FOUND',
})
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import fastifySocketIO from 'fastify-socket.io'
import rateLimit from '@fastify/rate-limit'
import compress from '@fastify/compress'
import * as jwt from 'jsonwebtoken'
import { Socket } from 'socket.io'
import mongoose from 'mongoose'

import * as path from 'path'
import * as fs from 'fs'
import connectDB from './config/db'
import authRoutes from './routes/auth.routes'
import chatRoutes from './routes/chat.routes'
import adminRoutes from './routes/admin.routes'
import departmentRoutes from './routes/department.routes'
import teacherRoutes from './routes/teacher.routes'
import attendanceRoutes from './routes/attendance.routes'
import parentRoutes from './routes/parent.routes'
import homeworkRoutes from './routes/homework.routes'
import Message from './models/message.model'

const fastify = Fastify({
  logger: process.env.NODE_ENV === 'production' ? require('pino')() : true,
  disableRequestLogging: false,
  requestTimeout: 30000, // 30 second timeout
  connectionTimeout: 30000, // 30 second connection timeout
})

import * as http from 'http'

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[DEBUG] SIGINT received, shutting down gracefully...')
  await fastify.close()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('[DEBUG] SIGTERM received, shutting down gracefully...')
  await fastify.close()
  process.exit(0)
})

const startServer = async () => {
  fastify.addHook('onRequest', async (request, reply) => {
    console.log(`[DEBUG] Incoming request: ${request.method} ${request.url}`)
  })
  try {
    console.log('[DEBUG] Registering multipart plugin...')
    await fastify.register(multipart, { attachFieldsToBody: true })
    // Removed custom JSON body parser to use Fastify's built-in parser
    console.log('[DEBUG] Registering helmet plugin...')
    await fastify.register(helmet)
    console.log('[DEBUG] Registering compress plugin...')
    await fastify.register(compress)
    console.log('[DEBUG] Registering rate-limit plugin...')
    await fastify.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute',
      skipOnError: true,
    })
    console.log(
      '[DEBUG] Registering CORS plugin with origin:',
      process.env.CLIENT_URL
    )
    await fastify.register(cors, {
      origin: [
        process.env.CLIENT_URL || 'https://mymnexus.netlify.app',
        'http://192.168.1.10:5173', // Allow local network access
        'http://192.168.1.9:5173/',
        'http://localhost:5173', // Local development
        'http://127.0.0.1:5173', // Localhost alternative
        'http://192.168.1.9:5173', // Without trailing slash
      ],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    })
    console.log('[DEBUG] Connecting to MongoDB...')
    await connectDB()
    console.log('[DEBUG] MongoDB connection established.')
    const uploadsPath = path.join(__dirname, '..', 'uploads')
    console.log('[DEBUG] Uploads path:', uploadsPath)
    if (!fs.existsSync(uploadsPath)) {
      console.log('[DEBUG] Uploads directory does not exist. Creating...')
      fs.mkdirSync(uploadsPath, { recursive: true })
    }
    console.log('[DEBUG] Registering fastifyStatic for uploads...')
    await fastify.register(fastifyStatic, {
      root: uploadsPath,
      prefix: '/uploads/',
      decorateReply: false,
    })

    console.log('[DEBUG] Registering routes...')
    fastify.register(authRoutes, { prefix: '/api/auth' })
    fastify.register(chatRoutes, { prefix: '/api' })
    fastify.register(adminRoutes, { prefix: '/api/admin' })
    fastify.register(departmentRoutes, { prefix: '/api/department' })
    fastify.register(teacherRoutes, { prefix: '/api/teacher' })
    fastify.register(attendanceRoutes, { prefix: '/api' })
    fastify.register(parentRoutes, { prefix: '/api' })
    fastify.register(homeworkRoutes, { prefix: '/api' })
    fastify.get('/', async () => ({
      message: 'Welcome to the MPK School App API',
    }))
    fastify.get('/health', async () => ({ ok: true }))
    fastify.setNotFoundHandler((_req, reply) => {
      console.log('[DEBUG] 404 Not Found:', _req.url)
      reply.code(404).send({ error: 'Route not found' })
    })
    const port = 4000
    console.log('[DEBUG] Server port:', port)

    // Register fastify-socket.io plugin
    await fastify.register(fastifySocketIO, {
      cors: {
        origin: [
          'http://192.168.1.9:5173/',
          'http://localhost:5173',
          'http://127.0.0.1:5173',
          'http://192.168.1.9:5173',
        ],
        credentials: true,
      },
    })

    // Socket.IO event handlers
    fastify.ready(() => {
      const userSockets = new Map<string, string>() // userId -> socketId

      ;(fastify as any).io.use(
        (socket: Socket, next: (err?: Error) => void) => {
          const token = socket.handshake.auth.token
          if (!token) return next(new Error('Authentication error'))
          try {
            const decoded = jwt.verify(
              token,
              process.env.JWT_SECRET as string
            ) as any
            ;(socket as any).userId = decoded.id
            next()
          } catch (err) {
            next(new Error('Authentication error'))
          }
        }
      )
      ;(fastify as any).io.on('connection', (socket: Socket) => {
        const userId = (socket as any).userId
        userSockets.set(userId, socket.id)
        console.log(`User ${userId} connected with socket ${socket.id}`)

        socket.on('joinRoom', (room: string) => {
          socket.join(room)
          console.log(`User ${userId} joined room ${room}`)
        })

        socket.on('leaveRoom', (room: string) => {
          socket.leave(room)
          console.log(`User ${userId} left room ${room}`)
        })

        socket.on('chatMessage', async (messageData: any) => {
          console.log('Received chatMessage:', messageData)
          try {
            // Save message to database
            const message = new Message({
              sender: messageData.sender,
              content: messageData.content,
              timestamp: messageData.timestamp,
              room: messageData.room,
              isPrivate: messageData.isPrivate,
              recipients: messageData.recipients,
            })
            await message.save()
            console.log('Message saved to DB:', message._id)

            const savedMessage = message.toObject()

            if (messageData.room === 'public') {
              ;(fastify as any).io
                .to('public')
                .emit('chatMessage', savedMessage)
            } else if (
              messageData.room === 'private' &&
              messageData.recipients
            ) {
              messageData.recipients.forEach((recipientId: string) => {
                const recipientSocketId = userSockets.get(recipientId)
                if (recipientSocketId) {
                  ;(fastify as any).io
                    .to(recipientSocketId)
                    .emit('chatMessage', savedMessage)
                }
              })
              // Also send to sender to update with _id
              ;(fastify as any).io
                .to(socket.id)
                .emit('chatMessage', savedMessage)
            }
          } catch (error) {
            console.error('Error saving message:', error)
          }
        })

        socket.on(
          'deleteMessage',
          async (data: { messageId: string; room: string }) => {
            console.log(
              '[DEBUG] deleteMessage event received:',
              data,
              'from user:',
              userId
            )
            try {
              const message = await Message.findById(data.messageId)
              if (!message) {
                console.log('[DEBUG] Message not found:', data.messageId)
                return
              }

              console.log(
                '[DEBUG] Found message:',
                message._id,
                'sender:',
                message.sender._id.toString(),
                'current user:',
                userId
              )

              // Check if user is the sender
              if (message.sender._id.toString() !== userId) {
                console.log('[DEBUG] User is not the sender, cannot delete')
                return
              }

              await Message.findByIdAndDelete(data.messageId)
              console.log(
                '[DEBUG] Message deleted successfully:',
                data.messageId
              )

              if (data.room === 'public') {
                console.log(
                  '[DEBUG] Broadcasting messageDeleted to public room'
                )
                socket.to('public').emit('messageDeleted', data.messageId)
              } else if (data.room === 'private' && message.recipients) {
                console.log(
                  '[DEBUG] Broadcasting messageDeleted to private recipients'
                )
                message.recipients.forEach(
                  (recipientId: mongoose.Types.ObjectId) => {
                    const recipientSocketId = userSockets.get(
                      recipientId.toString()
                    )
                    if (recipientSocketId) {
                      ;(fastify as any).io
                        .to(recipientSocketId)
                        .emit('messageDeleted', data.messageId)
                    }
                  }
                )
              }
            } catch (error) {
              console.error('Error deleting message:', error)
            }
          }
        )

        socket.on('typing', (data: any) => {
          if (data.room === 'public') {
            socket.to('public').emit('userTyping', data.userId)
          } else if (data.room === 'private' && data.recipients) {
            data.recipients.forEach((recipientId: string) => {
              const recipientSocketId = userSockets.get(recipientId.toString())
              if (recipientSocketId) {
                ;(fastify as any).io
                  .to(recipientSocketId)
                  .emit('userTyping', data.userId)
              }
            })
          }
        })

        socket.on('disconnect', () => {
          userSockets.delete(userId)
          console.log(`User ${userId} disconnected`)
        })
      })
    })

    // Start the server
    await fastify.listen({ port, host: '0.0.0.0' })
    console.log(
      `🚀 Server running at http://localhost:${port} (listening on all interfaces)`
    )
  } catch (err) {
    console.error('[DEBUG] Error during server startup:', err)
    fastify.log.error(err)
    if (err instanceof Error && err.stack) {
      console.error('[DEBUG] Error stack:', err.stack)
    }
    process.exit(1)
  }
}

startServer()
