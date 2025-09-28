import { FastifyRequest, FastifyReply } from 'fastify'
import Message from '../models/message.model'

export const saveMessage = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const { content, timestamp, room, isPrivate, recipients, replyTo } =
      request.body as any

    const message = new Message({
      sender: (request as any).user.id,
      content,
      timestamp,
      room,
      isPrivate,
      recipients,
      replyTo,
    })

    await message.save()

    reply.code(201).send({ message })
  } catch (error) {
    reply.code(500).send({ error: 'Failed to save message' })
  }
}

export const getMessages = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const { room, limit = 50, before } = request.query as any

    const query: any = { room }
    if (before) {
      query.timestamp = { $lt: new Date(before) }
    }

    // For private room, only show messages where user is sender or recipient
    if (room === 'private') {
      query.$or = [
        { sender: (request as any).user.id },
        { recipients: (request as any).user.id }
      ]
    }

    const messages = await Message.find(query)
      .populate('sender', '_id fullName email profilePicture')
      .populate({
        path: 'replyTo',
        populate: {
          path: 'sender',
          select: '_id fullName email profilePicture',
        },
        select: 'content timestamp',
      })
      .sort({ timestamp: -1 })
      .limit(Number(limit))
      .lean()

    // Return messages in ascending order (oldest first)
    reply.send(messages.reverse())
  } catch (error) {
    reply.code(500).send({ error: 'Failed to fetch messages' })
  }
}
