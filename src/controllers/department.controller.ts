import { FastifyReply, FastifyRequest } from 'fastify'
import LessonPlan from '../models/lessonPlan.model'
import RejectionReason from '../models/rejectionReason.model'

export async function getLessonPlansBySubject(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const user = (request as any).user
    if (!user || user.role !== 'Department') {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const { subject } = request.query as any
    const query: any = { status: { $in: ['pending', 'accepted', 'rejected'] } }
    if (subject) {
      query.subject = subject
    }

    const lessonPlans = await LessonPlan.find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .maxTimeMS(5000)
      .lean()

    reply.send({ lessonPlans })
  } catch (error) {
    reply.code(500).send({ error: 'Failed to fetch lesson plans' })
  }
}

export async function acceptLessonPlan(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const user = (request as any).user
    if (!user || user.role !== 'Department') {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const { id } = request.params as any
    const lessonPlan = await LessonPlan.findById(id)
    if (!lessonPlan) {
      return reply.code(404).send({ error: 'Lesson plan not found' })
    }

    // Check if the subject matches the user's subject (if user has subject)
    if (user.subject && lessonPlan.subject !== user.subject) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    lessonPlan.status = 'accepted'
    await lessonPlan.save()

    reply.send({ message: 'Lesson plan accepted' })
  } catch (error) {
    reply.code(500).send({ error: 'Failed to accept lesson plan' })
  }
}

export async function rejectLessonPlan(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const user = (request as any).user
    if (!user || user.role !== 'Department') {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const { id } = request.params as any
    const { reason, highlightedText } = request.body as any

    const lessonPlan = await LessonPlan.findById(id)
    if (!lessonPlan) {
      return reply.code(404).send({ error: 'Lesson plan not found' })
    }

    // Check if the subject matches the user's subject (if user has subject)
    if (user.subject && lessonPlan.subject !== user.subject) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    lessonPlan.status = 'rejected'
    await lessonPlan.save()

    // Save rejection reason
    const rejectionReason = new RejectionReason({
      lessonPlanId: lessonPlan._id,
      teacherId: lessonPlan.teacher,
      reason: reason,
      highlightedText: highlightedText,
      status: 'active',
    })
    await rejectionReason.save()

    reply.send({ message: 'Lesson plan rejected' })
  } catch (error) {
    reply.code(500).send({ error: 'Failed to reject lesson plan' })
  }
}

export async function getLessonPlanById(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const user = (request as any).user
    if (!user || (user.role !== 'Department' && user.role !== 'Admin')) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const { id } = request.params as any
    const lessonPlan = await LessonPlan.findById(id)
      .populate('teacher', 'fullName email')
      .lean()

    if (!lessonPlan) {
      return reply.code(404).send({ error: 'Lesson plan not found' })
    }

    if (
      user.role === 'Department' &&
      user.subject &&
      lessonPlan.subject !== user.subject
    ) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    reply.send(lessonPlan)
  } catch (error) {
    reply.code(500).send({ error: 'Failed to fetch lesson plan' })
  }
}

export async function getRejectionReasons(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const user = (request as any).user
    if (
      !user ||
      (user.role !== 'Department' &&
        user.role !== 'Admin' &&
        user.role !== 'Teacher')
    ) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    let query: any = {}
    if (user.role === 'Teacher') {
      query.teacherId = user._id
    }

    const rejectionReasons = await RejectionReason.find(query)
      .populate('lessonPlanId', 'title')
      .populate('teacherId', 'fullName email')
      .sort({ createdAt: -1 })
      .lean()

    const formattedReasons = rejectionReasons.map((reason: any) => ({
      _id: reason._id,
      lessonPlanId: reason.lessonPlanId
        ? (reason.lessonPlanId as any)._id
        : null,
      lessonPlanTitle: reason.lessonPlanId
        ? (reason.lessonPlanId as any).title
        : 'Unknown Lesson Plan',
      teacherName: reason.teacherId
        ? (reason.teacherId as any).fullName
        : 'Unknown Teacher',
      teacherEmail: reason.teacherId
        ? (reason.teacherId as any).email
        : 'Unknown Email',
      reason: reason.reason,
      highlightedText: reason.highlightedText,
      createdAt: reason.createdAt,
      status: reason.status,
    }))

    reply.send({ rejectionReasons: formattedReasons })
  } catch (error) {
    reply.code(500).send({ error: 'Failed to fetch rejection reasons' })
  }
}

export async function markRejectionReasonResolved(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const user = (request as any).user
    if (!user || (user.role !== 'Department' && user.role !== 'Admin')) {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const { id } = request.params as any
    const rejectionReason = await RejectionReason.findById(id)
    if (!rejectionReason) {
      return reply.code(404).send({ error: 'Rejection reason not found' })
    }

    rejectionReason.status = 'resolved'
    await rejectionReason.save()

    reply.send({ message: 'Rejection reason marked as resolved' })
  } catch (error) {
    reply
      .code(500)
      .send({ error: 'Failed to mark rejection reason as resolved' })
  }
}
