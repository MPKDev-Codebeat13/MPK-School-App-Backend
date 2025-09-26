import { FastifyRequest, FastifyReply } from 'fastify'
import User from '../models/user.model'
import LessonPlan from '../models/lessonPlan.model'
import Message from '../models/message.model'
import AiResponse from '../models/aiResponse.model'
import * as bcrypt from 'bcryptjs'
import * as jwt from 'jsonwebtoken'
import {
  generateVerificationToken,
  sendVerificationEmail,
} from '../utils/email'
import * as fs from 'fs'
import * as path from 'path'

export const signup = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    console.log('[DEBUG] [START] Signup controller called. Body:', request.body)
    let profilePicture = ''
    if (
      (request as any).file &&
      ((request as any).file.tempFilePath || (request as any).file.path)
    ) {
      // If file is uploaded via multipart/form-data
      const file = (request as any).file
      const timestamp = Date.now()
      const uploadPath = path.join(
        __dirname,
        '..',
        '..',
        'uploads',
        `profile_${timestamp}_${file.filename}`
      )

      // Ensure uploads directory exists
      const uploadsDir = path.dirname(uploadPath)
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true })
      }

      // Save file synchronously
      const filePath = file.tempFilePath || file.path
      if (filePath) {
        const buffer = fs.readFileSync(filePath)
        fs.writeFileSync(uploadPath, buffer)
        profilePicture = `/uploads/profile_${timestamp}_${file.filename}`
        // Clean up temp file
        try {
          fs.unlinkSync(filePath)
        } catch (err) {
          console.warn('[DEBUG] Failed to delete temp file:', err)
        }
      }
    }
    const { fullName, email, password, role, grade, subject } =
      request.body as any
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return reply.code(400).send({ error: 'User already exists' })
    }
    const verificationToken = generateVerificationToken()
    const user = new User({
      fullName,
      email,
      password,
      role,
      grade,
      subject,
      profilePicture,
      verificationToken,
      verificationTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    })
    await user.save()

    // Don't send verification email during signup
    // It will be sent when user reaches check-email page
    console.log(
      '[DEBUG] Verification email will be sent when user reaches check-email page'
    )

    console.log('[DEBUG] [END] Signup controller: User created:', user.email)
    reply.code(201).send({
      message:
        'User created successfully. Please check your email to verify your account.',
      redirectTo: '/check-email',
      user: {
        id: user._id,
        fullName,
        email,
        role,
        grade,
        subject,
        profilePicture,
      },
    })
  } catch (error) {
    console.error('[DEBUG] [ERROR] Signup controller:', error)
    reply.code(500).send({ error: 'Signup failed' })
  }
}

export const login = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    console.log('[DEBUG] [START] Login controller called. Body:', request.body)
    const { email, password } = request.body as any
    const user = await User.findOne({ email })
    if (!user) {
      console.log(
        '[DEBUG] [END] Login controller: Invalid credentials (user not found)'
      )
      return reply.code(400).send({ error: 'Invalid credentials' })
    }

    // Handle OAuth users
    if (user.isOAuth) {
      // OAuth users can only login if they have set a password
      if (!user.password) {
        console.log(
          '[DEBUG] [END] Login controller: OAuth user without password tried to login'
        )
        return reply.code(400).send({
          error: 'Please use Google OAuth to login, or set a password first',
        })
      }
    }

    // Check if user has a password (should always be true for non-OAuth users)
    if (!user.password) {
      console.log('[DEBUG] [END] Login controller: User has no password')
      return reply.code(400).send({ error: 'Invalid credentials' })
    }

    const valid = await user.comparePassword(password)
    if (!valid) {
      console.log(
        '[DEBUG] [END] Login controller: Invalid credentials (wrong password)'
      )
      return reply.code(400).send({ error: 'Invalid credentials' })
    }

    // Check if user is verified
    if (!user.isVerified) {
      console.log('[DEBUG] [END] Login controller: User not verified')
      return reply.code(403).send({
        error: 'Please verify your email before logging in',
        redirectTo: '/check-email',
        email: user.email,
      })
    }

    // Generate access token with OAuth profile data if applicable
    const tokenPayload: any = {
      id: user._id,
      email: user.email,
      role: user.role,
    }

    // Include OAuth profile data in JWT token for OAuth users
    if (user.isOAuth) {
      tokenPayload.fullName = user.fullName
      tokenPayload.name = user.fullName
      tokenPayload.picture = user.profilePicture
      tokenPayload.profilePic = user.profilePicture
      tokenPayload.avatar = user.profilePicture
      tokenPayload.isOAuth = true
    }

    const accessToken = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET as string,
      { expiresIn: '1d' }
    )

    // Generate refresh token (30 days)
    const refreshToken = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET as string,
      { expiresIn: '30d' }
    )

    // Store refresh token in user
    user.refreshTokens.push(refreshToken)
    await user.save()

    console.log(
      '[DEBUG] [END] Login controller: Login successful for',
      user.email
    )
    reply.send({
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        grade: user.grade,
        subject: user.subject,
        profilePicture: user.profilePicture,
        isVerified: user.isVerified,
      },
    })
  } catch (error) {
    console.error('[DEBUG] [ERROR] Login controller:', error)
    reply.code(500).send({ error: 'Login failed' })
  }
}

export const getProfile = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    console.log(
      '[DEBUG] [START] getProfile controller called. User:',
      (request as any).user
    )
    const userId = (request as any).user?.id
    const user = await User.findById(userId)
    if (!user) {
      console.log('[DEBUG] [END] getProfile controller: User not found')
      return reply.code(404).send({ error: 'User not found' })
    }
    console.log('[DEBUG] [END] getProfile controller: User found', user.email)
    reply.send({
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        grade: user.grade,
        subject: user.subject,
        profilePicture: user.profilePicture,
      },
    })
  } catch (error) {
    console.error('[DEBUG] [ERROR] getProfile controller:', error)
    reply.code(500).send({ error: 'Profile fetch failed' })
  }
}

export const resendVerificationEmail = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    console.log(
      '[DEBUG] [START] resendVerificationEmail controller called. Body:',
      request.body
    )
    const { email } = request.body as any

    if (!email) {
      console.log('[DEBUG] resendVerificationEmail: Email is required')
      return reply.code(400).send({ error: 'Email is required' })
    }

    const user = await User.findOne({ email })
    if (!user) {
      console.log(
        '[DEBUG] resendVerificationEmail: User not found for email:',
        email
      )
      return reply.code(404).send({ error: 'User not found' })
    }

    if (user.isVerified) {
      console.log(
        '[DEBUG] resendVerificationEmail: User already verified:',
        email
      )
      return reply.code(400).send({ error: 'User is already verified' })
    }

    // Generate new verification token
    const verificationToken = generateVerificationToken()
    console.log(
      '[DEBUG] resendVerificationEmail: Generated new token for:',
      email
    )

    // Update user with new token and expiration
    user.verificationToken = verificationToken
    user.verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    await user.save()
    console.log(
      '[DEBUG] resendVerificationEmail: User updated with new token:',
      email
    )

    // Send verification email
    try {
      await sendVerificationEmail(user.email, verificationToken)
      user.verificationEmailSent = true
      await user.save()
      console.log('[DEBUG] Verification email sent successfully to:', email)
    } catch (emailError) {
      const err = emailError as Error
      console.error('[DEBUG] Failed to send verification email:', err)
      return reply.code(500).send({
        error: 'Failed to send verification email',
        details:
          process.env.NODE_ENV === 'development' ? err.message : undefined,
      })
    }

    reply.send({ message: 'Verification email sent successfully' })
  } catch (error) {
    const err = error as Error
    console.error('[DEBUG] [ERROR] resendVerificationEmail controller:', err)
    console.error('[DEBUG] Controller error details:', {
      message: err.message,
      stack: err.stack,
      code: (err as any).code,
    })
    return reply.code(500).send({
      error: 'Resend verification failed',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    })
  }
}

export const changePassword = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    console.log('[DEBUG] [START] changePassword controller called')
    const userId  = (request as any).user?.id
    const { currentPassword, newPassword } = request.body as any

    if (!newPassword) {
      return reply.code(400).send({ error: 'New password is required' })
    }

    if (newPassword.length < 6) {
      return reply
        .code(400)
        .send({ error: 'New password must be at least 6 characters long' })
    }

    const user = await User.findById(userId)
    if (!user) {
      return reply.code(404).send({ error: 'User not found' })
    }

    // Handle OAuth users differently
    if (user.isOAuth) {
      // For OAuth users, if they don't have a password set yet, allow setting one
      if (!user.password) {
        console.log('[DEBUG] OAuth user setting password for first time')
      } else {
        // If they have a password, verify current password
        if (!currentPassword) {
          return reply.code(400).send({
            error:
              'Current password is required for OAuth users who have set a password',
          })
        }
        const valid = await bcrypt.compare(currentPassword, user.password)
        if (!valid) {
          return reply
            .code(400)
            .send({ error: 'Current password is incorrect' })
        }
      }
    } else {
      // For regular users, always require current password
      if (!currentPassword) {
        return reply.code(400).send({ error: 'Current password is required' })
      }
      if (!user.password) {
        return reply.code(400).send({ error: 'User password not found' })
      }
      const valid = await bcrypt.compare(currentPassword, user.password)
      if (!valid) {
        return reply.code(400).send({ error: 'Current password is incorrect' })
      }
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10)
    user.password = hashedPassword
    await user.save()

    console.log(
      '[DEBUG] [END] changePassword: Password changed successfully for user:',
      user.email
    )
    reply.send({ message: 'Password changed successfully' })
  } catch (error) {
    console.error('[DEBUG] [ERROR] changePassword controller:', error)
    reply.code(500).send({ error: 'Password change failed' })
  }
}

export const updateUser = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    console.log('[DEBUG] [START] updateUser controller called')
    const userId = (request as any).user?.id

    if (!userId) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }

    const user = await User.findById(userId)
    if (!user) {
      return reply.code(404).send({ error: 'User not found' })
    }

    const body = request.body as any
    let fullName = user.fullName
    let profilePicture = user.profilePicture
    let role = user.role
    let grade = user.grade
    let subject = user.subject

    // Handle multipart fields or JSON
    if (body.fullName) {
      if (typeof body.fullName === 'object' && body.fullName.value) {
        fullName = body.fullName.value
      } else if (typeof body.fullName === 'string') {
        fullName = body.fullName
      }
    }

    if (body.role) {
      if (typeof body.role === 'object' && body.role.value) {
        role = body.role.value
      } else if (typeof body.role === 'string') {
        role = body.role
      }
    }

    if (body.grade) {
      if (typeof body.grade === 'object' && body.grade.value) {
        grade = body.grade.value
      } else if (typeof body.grade === 'string') {
        grade = body.grade
      }
    }

    if (body.subject) {
      if (typeof body.subject === 'object' && body.subject.value) {
        subject = body.subject.value
      } else if (typeof body.subject === 'string') {
        subject = body.subject
      }
    }

    // Handle avatar upload
    if ((request as any).file) {
      const file = (request as any).file
      const timestamp = Date.now()
      const filename = `profile_${timestamp}_${file.filename || 'avatar.jpg'}`
      const uploadPath = path.join(__dirname, '..', '..', 'uploads', filename)

      // Ensure uploads directory exists
      const uploadsDir = path.dirname(uploadPath)
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true })
      }

      // Save file synchronously
      const filePath = file.tempFilePath || file.path
      if (filePath) {
        const buffer = fs.readFileSync(filePath)
        fs.writeFileSync(uploadPath, buffer)
        profilePicture = `/uploads/${filename}`
        // Clean up temp file
        try {
          fs.unlinkSync(filePath)
        } catch (err) {
          console.warn('[DEBUG] Failed to delete temp file:', err)
        }
      }
    }

    // Update user fields
    if (fullName !== user.fullName) user.fullName = fullName
    if (profilePicture !== user.profilePicture)
      user.profilePicture = profilePicture
    if (role !== user.role) user.role = role
    if (grade !== user.grade) user.grade = grade
    if (subject !== user.subject) user.subject = subject

    await user.save()

    console.log(
      '[DEBUG] [END] updateUser: User updated successfully:',
      user.email
    )
    reply.send({
      message: 'User updated successfully',
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        grade: user.grade,
        subject: user.subject,
        profilePicture: user.profilePicture,
        isVerified: user.isVerified,
      },
    })
  } catch (error) {
    console.error('[DEBUG] [ERROR] updateUser controller:', error)
    reply.code(500).send({ error: 'User update failed' })
  }
}

export const deleteUser = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    console.log('[DEBUG] [START] deleteUser controller called')
    const userId = (request as any).user?.id

    const user = await User.findById(userId)
    if (!user) {
      return reply.code(404).send({ error: 'User not found' })
    }

    // Delete associated data
    if (user.role === 'Teacher') {
      await LessonPlan.deleteMany({ teacher: userId })
      console.log('[DEBUG] Deleted lesson plans for teacher:', user.email)
    }
    await Message.deleteMany({ 'sender._id': userId })
    console.log('[DEBUG] Deleted messages for user:', user.email)
    await AiResponse.deleteMany({ userId: userId })
    console.log('[DEBUG] Deleted AI responses for user:', user.email)

    // Delete user
    await User.findByIdAndDelete(userId)

    console.log(
      '[DEBUG] [END] deleteUser: User and associated data deleted successfully:',
      user.email
    )
    reply.send({ message: 'User deleted successfully' })
  } catch (error) {
    console.error('[DEBUG] [ERROR] deleteUser controller:', error)
    reply.code(500).send({ error: 'User deletion failed' })
  }
}
