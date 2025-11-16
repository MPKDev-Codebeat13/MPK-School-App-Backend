import mongoose, { Schema, Document } from 'mongoose'

export interface IRejectionReason extends Document {
  lessonPlanId: mongoose.Types.ObjectId
  teacherId: mongoose.Types.ObjectId
  reason: string
  highlightedText?: string
  status: 'active' | 'resolved'
  createdAt: Date
  updatedAt: Date
}

const RejectionReasonSchema: Schema = new Schema(
  {
    lessonPlanId: {
      type: Schema.Types.ObjectId,
      ref: 'LessonPlan',
      required: true,
    },
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
    highlightedText: {
      type: String,
      required: false,
    },
    status: {
      type: String,
      enum: ['active', 'resolved'],
      default: 'active',
    },
  },
  {
    timestamps: true,
  }
)

export default mongoose.model<IRejectionReason>(
  'RejectionReason',
  RejectionReasonSchema
)
