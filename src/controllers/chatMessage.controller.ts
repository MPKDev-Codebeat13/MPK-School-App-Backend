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

    const query: any = { room }
    if (before) {
      query.timestamp = { $lt: new Date(before) }
    }

    // For public room, only show non-private messages
    if (room === 'public') {
      query.isPrivate = false
    } else if (room === 'private') {
      // For private room, only show messages where user is sender or recipient
      const userId = new mongoose.Types.ObjectId((request as any).user.id)
      if (withUser) {
        // Filter for conversation between current user and withUser
        const withUserId = new mongoose.Types.ObjectId(withUser)
        query.$or = [
          { sender: userId, recipients: { $in: [withUserId] } },
          { sender: withUserId, recipients: { $in: [userId] } }
        ]
      } else {
        query.$or = [
          { sender: userId },
          { recipients: { $in: [userId] } }
        ]
      }
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
