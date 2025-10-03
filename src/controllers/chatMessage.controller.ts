import { FastifyRequest, FastifyReply } from 'fastify'
import mongoose from 'mongoose'
import Message from '../models/message.model'

export const saveMessage = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const { content, timestamp, room, isPrivate, recipients, replyTo } =
      request.body as any

    const message = new Message({
      sender: new mongoose.Types.ObjectId((request as any).user.id),
      content,
      timestamp,
      room,
      isPrivate,
      recipients: recipients
        ? recipients.map((r: string) => new mongoose.Types.ObjectId(r))
        : undefined,
      replyTo: replyTo ? new mongoose.Types.ObjectId(replyTo) : undefined,
    })

    await message.save()

    await message.populate('sender', '_id fullName email profilePicture')
    if (message.replyTo) {
      await message.populate({
        path: 'replyTo',
        populate: {
          path: 'sender',
          select: '_id fullName email profilePicture',
        },
        select: 'content timestamp',
      })
    }

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
    const { room, limit = 50, before, withUser } = request.query as any
    console.log('[DEBUG] getMessages called:', {
      room,
      limit,
      before,
      withUser,
      user: (request as any).user,
    })

    const query: any = { room }
    if (before) {
      query.timestamp = { $lt: new Date(before) }
    }

    // Simplified: just query by room, no private/public distinction

    console.log('[DEBUG] Query:', query)
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

    console.log('[DEBUG] Found messages:', messages.length)
    // Return messages in ascending order (oldest first)
    const result = messages.reverse()
    console.log('[DEBUG] Returning messages:', result.length)
    reply.send({ messages: result })
  } catch (error) {
    console.error('[ERROR] getMessages error:', error)
    reply.code(500).send({ error: 'Failed to fetch messages' })
  }
}
