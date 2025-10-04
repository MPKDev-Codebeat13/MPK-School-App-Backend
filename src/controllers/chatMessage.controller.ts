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

    // Ensure senderName is set, fallback if missing
    const senderName = (request as any).user.fullName || 'Unknown User'
    if (!(request as any).user.fullName) {
      console.warn(
        `[WARN] senderName missing for user ${
          (request as any).user.id
        }, using fallback`
      )
    }

    const message = new Message({
      sender: new mongoose.Types.ObjectId((request as any).user.id),
      senderName,
      senderEmail: (request as any).user.email,
      senderProfilePicture: (request as any).user.profilePicture,
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
    console.error('[ERROR] saveMessage error:', error)
    reply.code(500).send({ error: 'Failed to save message' })
  }
}

export const getMessages = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const { room, limit = 50, before, withUser } = request.query as any
    const currentUserId = (request as any).user.id
    console.log('[DEBUG] getMessages called:', {
      room,
      limit,
      before,
      withUser,
      userId: currentUserId,
    })

    const query: any = { room }
    if (before) {
      query.timestamp = { $lt: new Date(before) }
    }

    // Exclude messages deleted for the current user
    query.deletedFor = { $nin: [(request as any).user.email] }

    console.log('[DEBUG] Executing query:', query)
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

    // Map messages safely with error handling
    let result: any[] = []
    try {
      result = messages
        .reverse()
        .map((msg: any, index: number) => {
          try {
            if (!msg.sender) {
              msg.sender = {
                _id: null,
                fullName: msg.senderName,
                email: msg.senderEmail,
                profilePicture: msg.senderProfilePicture,
              }
            }
            if (msg.replyTo && !msg.replyTo.sender) {
              msg.replyTo.sender = {
                _id: null,
                fullName: msg.replyTo.senderName,
                email: msg.replyTo.senderEmail,
                profilePicture: msg.replyTo.senderProfilePicture,
              }
            }
            const senderId = msg.sender._id?.toString() || null
            const isCurrentUser =
              senderId === currentUserId ||
              msg.sender.email === (request as any).user.email

            return {
              ...msg,
              _id: msg._id.toString(),
              sender: {
                ...msg.sender,
                _id: msg.sender._id?.toString() || null,
              },
              replyTo: msg.replyTo
                ? {
                    ...msg.replyTo,
                    _id: msg.replyTo._id.toString(),
                    sender: msg.replyTo.sender
                      ? {
                          ...msg.replyTo.sender,
                          _id: msg.replyTo.sender._id.toString(),
                        }
                      : null,
                  }
                : undefined,
              recipients: msg.recipients
                ? msg.recipients.map((r: any) => r.toString())
                : msg.recipients,
              deletedFor: msg.deletedFor
                ? msg.deletedFor.map((d: any) => d.toString())
                : msg.deletedFor,
              // Optional: left/right bubble for UI
              position: isCurrentUser ? 'right' : 'left',
            }
          } catch (mapError) {
            console.error('[ERROR] Error mapping message:', msg._id, mapError)
            return null // Skip problematic message
          }
        })
        .filter((msg) => msg !== null)
    } catch (mapError) {
      console.error('[ERROR] Error in message mapping:', mapError)
      result = []
    }

    console.log('[DEBUG] Returning messages:', result.length)

    // Ensure response is sent before any potential stream issues
    try {
      const responseData = { messages: result }
      console.log('[DEBUG] Sending response with', result.length, 'messages')

      // Send response and handle any streaming errors
      await reply.send(responseData)
      console.log('[DEBUG] Response sent successfully')
    } catch (sendError) {
      console.error('[ERROR] Error sending response:', sendError)
      if (!reply.sent) {
        reply.code(500).send({ error: 'Failed to send messages' })
      }
    }
  } catch (error) {
    console.error('[ERROR] getMessages error:', error)
    if (error instanceof Error && error.message?.includes('premature close')) {
      console.log('[INFO] Client disconnected prematurely during processing')
      // Try to send empty response if not already sent
      if (!reply.sent) {
        reply.send({ messages: [] })
      }
    } else {
      if (!reply.sent) {
        reply.code(500).send({ error: 'Failed to fetch messages' })
      }
    }
  }
}

export const deleteMessageForMe = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const { messageId } = request.params as any
    const userId = (request as any).user.id

    const message = await Message.findById(messageId)
    if (!message) {
      return reply.code(404).send({ error: 'Message not found' })
    }

    // Only sender can delete (by id or email)
    if (
      message.sender.toString() !== userId &&
      message.senderEmail !== (request as any).user.email
    ) {
      return reply
        .code(403)
        .send({ error: 'You can only delete your own messages' })
    }

    if (!message.deletedFor?.includes((request as any).user.email)) {
      message.deletedFor = message.deletedFor || []
      message.deletedFor.push((request as any).user.email)
      await message.save()
    }

    reply.send({ success: true })
  } catch (error) {
    console.error('[ERROR] deleteMessageForMe error:', error)
    reply.code(500).send({ error: 'Failed to delete message for you' })
  }
}
