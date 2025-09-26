import mongoose, { Schema, Document } from 'mongoose'

export interface IAiResponse extends Document {
  userId: mongoose.Types.ObjectId
  question: string
  answer: string
  apiUsed: string
  createdAt: Date
}

const AiResponseSchema: Schema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  question: {
    type: String,
    required: true,
  },
  answer: {
    type: String,
    required: true,
  },
  apiUsed: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
})

export default mongoose.model<IAiResponse>('AiResponse', AiResponseSchema)
