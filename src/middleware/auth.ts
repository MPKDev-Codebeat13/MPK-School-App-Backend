import { FastifyRequest, FastifyReply } from 'fastify'
import * as jwt from 'jsonwebtoken'
import User from '../models/user.model'

export const authenticate = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const authHeader = request.headers.authorization
    if (!authHeader) return reply.code(401).send({ error: 'No token provided' })
    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any
    const user = await User.findById(decoded.id)
    if (!user) return reply.code(401).send({ error: 'User not found' })
    ;(request as any).user = {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      subject: user.subject,
      grade: user.grade,
    }
  } catch (error) {
    return reply.code(401).send({ error: 'Invalid token' })
  }
}
