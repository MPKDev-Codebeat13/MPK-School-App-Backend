import mongoose, { Document, Schema } from 'mongoose'

export interface IMessage extends Document {
  _id: mongoose.Types.ObjectId
  sender: mongoose.Types.ObjectId
  senderName: string
  senderEmail: string
  senderProfilePicture?: string
  content: string
  timestamp: Date
  room: 'public' | 'private'
  isPrivate: boolean
  recipients?: mongoose.Types.ObjectId[]
  replyTo?: mongoose.Types.ObjectId
  deletedFor?: string[]
  createdAt: Date
  updatedAt: Date
}

const messageSchema = new Schema<IMessage>(
  {
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    senderName: { type: String, required: true },
    senderEmail: { type: String, required: true },
    senderProfilePicture: { type: String },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    room: {
      type: String,
      enum: ['public', 'private'],
      required: true,
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    recipients: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    replyTo: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
    },
    deletedFor: [
      {
        type: String,
      },
    ],
  },
  {
    timestamps: true,
  }
)

// Index for efficient querying
messageSchema.index({ room: 1, timestamp: -1 })
messageSchema.index({ sender: 1, timestamp: -1 })

const Message = mongoose.model<IMessage>('Message', messageSchema)

export default Message
