import { FastifyRequest, FastifyReply } from 'fastify'
import User from '../models/user.model'

export const getAllUsers = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const users = await User.find({}, '_id fullName email')
    reply.send({ users })
  } catch (error) {
    reply.code(500).send({ error: 'Failed to fetch users' })
  }
}
