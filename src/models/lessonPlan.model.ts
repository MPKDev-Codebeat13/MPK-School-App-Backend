import mongoose, { Document, Schema } from 'mongoose'

export interface ILessonPlan extends Document {
  title: string
  description: string
  subject: string
  grade: string
  teacher: mongoose.Types.ObjectId
  status: 'draft' | 'pending' | 'accepted' | 'rejected'
  type: 'manual' | 'ai' | 'uploaded'
  createdAt: Date
  updatedAt: Date
}

const lessonPlanSchema = new Schema<ILessonPlan>(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    subject: { type: String, required: true },
    grade: { type: String, required: true },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['draft', 'pending', 'accepted', 'rejected'],
      default: 'draft',
    },
    type: { type: String, enum: ['manual', 'ai', 'uploaded'], required: true },
  },
  { timestamps: true }
)

export default mongoose.model<ILessonPlan>('LessonPlan', lessonPlanSchema)
