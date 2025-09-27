import mongoose, { Document, Schema } from 'mongoose'
import * as bcrypt from 'bcryptjs'

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId
  fullName: string
  email: string
  password?: string
  role?:
    | 'Student'
    | 'Teacher'
    | 'Babysitter'
    | 'Admin'
    | 'Parent'
    | 'Department'
  profilePicture?: string

  grade?: string
  subject?: string
  department?: string
  isVerified: boolean
  isOAuth?: boolean
  verificationToken?: string
  verificationTokenExpires?: Date
  resetPasswordToken?: string
  resetPasswordExpires?: Date
  verificationEmailSent?: boolean
  lastVerificationEmailSent?: Date
  refreshTokens: string[]
  createdAt: Date
  updatedAt: Date
  comparePassword(candidatePassword: string): Promise<boolean>
}

const userSchema = new Schema<IUser>(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: function (this: IUser) {
        return !this.isOAuth
      },
    },
    role: {
      type: String,
      enum: [
        'Student',
        'Teacher',
        'Babysitter',
        'Admin',
        'Parent',
        'Department',
        '',
      ],
      required: function (this: IUser) {
        return !this.isOAuth // Only required if not OAuth user
      },
    },
    profilePicture: {
      type: String,
      default: '',
    },
    grade: {
      type: String,
      trim: true,
    },
    subject: {
      type: String,
      trim: true,
    },
    department: {
      type: String,
      trim: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isOAuth: {
      type: Boolean,
      default: false,
    },
    verificationToken: String,
    verificationTokenExpires: Date,
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    verificationEmailSent: {
      type: Boolean,
      default: false,
    },
    lastVerificationEmailSent: Date,
    refreshTokens: [
      {
        type: String,
      },
    ],
  },
  {
    timestamps: true,
  }
)

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next()

  try {
    const salt = await bcrypt.genSalt(12)
    this.password = await bcrypt.hash(this.password, salt)
    next()
  } catch (error) {
    next(error as Error)
  }
})

// Compare password method
userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  if (!this.password) return false
  return bcrypt.compare(candidatePassword, this.password)
}

// Remove password from JSON output
userSchema.methods.toJSON = function () {
  const userObject = this.toObject()
  delete userObject.password
  delete userObject.refreshTokens
  delete userObject.verificationToken
  delete userObject.verificationTokenExpires
  delete userObject.resetPasswordToken
  delete userObject.resetPasswordExpires
  return userObject
}

const User = mongoose.model<IUser>('User', userSchema)

export default User
