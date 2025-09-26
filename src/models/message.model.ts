import mongoose, { Document, Schema } from 'mongoose'

export interface IMessage extends Document {
  _id: mongoose.Types.ObjectId
  sender: {
    _id: mongoose.Types.ObjectId
    fullName: string
    email: string
    profilePicture?: string
  }
  content: string
  timestamp: Date
  room: 'public' | 'private'
  isPrivate: boolean
  recipients?: mongoose.Types.ObjectId[]
  replyTo?: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const messageSchema = new Schema<IMessage>(
  {
    sender: {
      _id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      fullName: { type: String, required: true },
      email: { type: String, required: true },
      profilePicture: { type: String },
    },
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
  },
  {
    timestamps: true,
  }
)

// Index for efficient querying
messageSchema.index({ room: 1, timestamp: -1 })
messageSchema.index({ 'sender._id': 1, timestamp: -1 })

const Message = mongoose.model<IMessage>('Message', messageSchema)

export default Message
