import { FastifyRequest, FastifyReply } from 'fastify'
import User, { IUser } from '../models/user.model'
import LessonPlan from '../models/lessonPlan.model'
import Message from '../models/message.model'
import AiResponse from '../models/aiResponse.model'
import * as bcrypt from 'bcryptjs'
import * as jwt from 'jsonwebtoken'
import {
  generateVerificationToken,
  sendVerificationEmail,
  generateResetToken,
  sendResetEmail,
} from '../utils/email'
import * as fs from 'fs'
import * as path from 'path'

export const signup = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    console.log('[DEBUG] [START] Signup controller called. Body:', request.body)

    // Input validation and sanitization
    const { fullName, email, password, role, grade, section, subject } =
      request.body as any

    if (!fullName || !email || !password || !role) {
      return reply
        .code(400)
        .send({ error: 'Full name, email, password, and role are required' })
    }

    // Validate subject only for roles that require it
    if (
      (role === 'Teacher' || role === 'Department') &&
      (!subject || subject.trim() === '')
    ) {
      return reply
        .code(400)
        .send({ error: 'Subject is required for teachers and departments' })
    }

    // Validate section for Babysitter
    if (role === 'Babysitter' && (!section || section.trim() === '')) {
      return reply
        .code(400)
        .send({ error: 'Section is required for babysitters' })
    }

    const trimmedEmail = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return reply.code(400).send({ error: 'Invalid email format' })
    }

    if (password.length < 6) {
      return reply
        .code(400)
        .send({ error: 'Password must be at least 6 characters long' })
    }

    const trimmedFullName = fullName.trim()
    if (trimmedFullName.length < 2) {
      return reply
        .code(400)
        .send({ error: 'Full name must be at least 2 characters long' })
    }

    // File upload validation
    let profilePicture = ''
    if ((request as any).file) {
      const file = (request as any).file
      const maxSize = 5 * 1024 * 1024 // 5MB

      if (file.size > maxSize) {
        return reply
          .code(400)
          .send({ error: 'Profile picture must be less than 5MB' })
      }

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

    const existingUser = await User.findOne({ email: trimmedEmail })
    if (existingUser) {
      return reply.code(400).send({ error: 'User already exists' })
    }
    const verificationToken = generateVerificationToken()
    const userData: any = {
      fullName: trimmedFullName,
      email: trimmedEmail,
      password,
      role: role as IUser['role'],
      grade,
      section,
      profilePicture,
      verificationToken,
      verificationTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    }

    // Only set subject for roles that require it
    if (role === 'Teacher' || role === 'Department') {
      // Map subject values to updated names
      let mappedSubject = subject
      if (subject === 'Computer Science') {
        mappedSubject = 'IT'
      } else if (subject === 'Physical Education') {
        mappedSubject = 'HPE'
      }
      userData.subject = mappedSubject
    }

    const user = new User(userData)
    await user.save()

    console.log('[DEBUG] [END] Signup controller: User created:', user.email)

    // Send response immediately without waiting for email
    reply.code(201).send({
      message:
        'User created successfully. Please check your email to verify your account.',
      redirectTo: `/check-email?email=${encodeURIComponent(trimmedEmail)}`,
      user: {
        id: user._id,
        fullName: trimmedFullName,
        email: trimmedEmail,
        role,
        grade,
        section,
        subject,
        profilePicture,
      },
    })

    // Send verification email asynchronously after response is sent
    setImmediate(async () => {
      try {
        await sendVerificationEmail(user.email, verificationToken)
        user.verificationEmailSent = true
        await user.save()
        console.log(
          '[DEBUG] Verification email sent successfully to:',
          user.email
        )
      } catch (emailError) {
        const err = emailError as Error
        console.error(
          '[DEBUG] Failed to send verification email during signup:',
          err
        )
        // Email failed, but user was already created successfully
      }
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

    // Generate access token with user data
    const tokenPayload: any = {
      id: user._id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
      profilePicture: user.profilePicture,
    }

    // Include OAuth profile data in JWT token for OAuth users
    if (user.isOAuth) {
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
        section: user.section,
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
        section: user.section,
        subject: user.subject,
        profilePicture: user.profilePicture,
      },
    })
  } catch (error) {
    console.error('[DEBUG] [ERROR] getProfile controller:', error)
    reply.code(500).send({ error: 'Profile fetch failed' })
  }
}

export const checkVerificationStatus = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const { email } = request.body as any

    if (!email) {
      return reply.code(400).send({ error: 'Email is required' })
    }

    const user = await User.findOne({ email })
    if (!user) {
      return reply.code(404).send({ error: 'User not found' })
    }

    reply.send({ isVerified: user.isVerified })
  } catch (error) {
    console.error('[DEBUG] [ERROR] checkVerificationStatus controller:', error)
    reply.code(500).send({ error: 'Check verification status failed' })
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

    // Check cooldown: prevent resending within 1 minute
    if (user.lastVerificationEmailSent) {
      const timeSinceLastSent =
        Date.now() - user.lastVerificationEmailSent.getTime()
      const cooldownPeriod = 60 * 1000 // 1 minute
      if (timeSinceLastSent < cooldownPeriod) {
        const remainingTime = Math.ceil(
          (cooldownPeriod - timeSinceLastSent) / 1000
        )
        return reply.code(429).send({
          error: `Please wait ${remainingTime} seconds before requesting another verification email`,
        })
      }
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
    const userId = (request as any).user?.id
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
    let section = user.section
    let subject = user.subject

    // Input validation and sanitization
    // Handle fullName from FormData or JSON
    let fullNameValue = body.fullName
    if (fullNameValue) {
      if (typeof fullNameValue === 'object' && fullNameValue.value) {
        fullNameValue = fullNameValue.value
      }
      const trimmedName = fullNameValue.trim()
      if (trimmedName.length < 2) {
        return reply
          .code(400)
          .send({ error: 'Full name must be at least 2 characters long' })
      }
      fullName = trimmedName
    }

    if (body.role) {
      let roleValue = body.role
      if (typeof body.role === 'object' && body.role.value) {
        roleValue = body.role.value
      }
      if (
        ![
          'Student',
          'Teacher',
          'Department',
          'Parent',
          'Admin',
          'Babysitter',
        ].includes(roleValue)
      ) {
        return reply.code(400).send({ error: 'Invalid role' })
      }
      role = roleValue
    }

    if (body.grade) {
      let gradeValue = body.grade
      if (typeof body.grade === 'object' && body.grade.value) {
        gradeValue = body.grade.value
      }
      if (
        gradeValue &&
        (typeof gradeValue !== 'string' || gradeValue.length > 20)
      ) {
        return reply.code(400).send({ error: 'Invalid grade' })
      }
      grade = gradeValue
    }

    if (body.section) {
      let sectionValue = body.section
      if (typeof body.section === 'object' && body.section.value) {
        sectionValue = body.section.value
      }
      if (
        sectionValue &&
        (typeof sectionValue !== 'string' || sectionValue.length > 10)
      ) {
        return reply.code(400).send({ error: 'Invalid section' })
      }
      section = sectionValue
    }

    if (body.subject) {
      let subjectValue = body.subject
      if (typeof body.subject === 'object' && body.subject.value) {
        subjectValue = body.subject.value
      }
      if (
        subjectValue &&
        (typeof subjectValue !== 'string' || subjectValue.length > 50)
      ) {
        return reply.code(400).send({ error: 'Invalid subject' })
      }
      // Map subject values to updated names
      if (subjectValue === 'Computer Science') {
        subjectValue = 'IT'
      } else if (subjectValue === 'Physical Education') {
        subjectValue = 'HPE'
      }
      subject = subjectValue
    }

    // Handle avatar upload with validation
    if ((request as any).file) {
      const file = (request as any).file
      const maxSize = 5 * 1024 * 1024 // 5MB
      const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
      ]

      if (file.size > maxSize) {
        return reply
          .code(400)
          .send({ error: 'Profile picture must be less than 5MB' })
      }

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
    if (role !== user.role) user.role = role as IUser['role']
    if (grade !== user.grade) user.grade = grade
    if (section !== user.section) user.section = section
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
        section: user.section,
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
    await Message.deleteMany({ sender: userId })
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

export const forgotPassword = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    console.log('[DEBUG] [START] forgotPassword controller called')
    const { email } = request.body as any

    if (!email) {
      return reply.code(400).send({ error: 'Email is required' })
    }

    const trimmedEmail = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return reply.code(400).send({ error: 'Invalid email format' })
    }

    const user = await User.findOne({ email: trimmedEmail })
    if (!user) {
      // For security, don't reveal if email exists
      return reply.send({
        message:
          'If an account with that email exists, a reset link has been sent.',
      })
    }

    // Generate reset token
    const resetToken = generateResetToken()
    user.resetPasswordToken = resetToken
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour
    await user.save()

    console.log('[DEBUG] Reset token generated for:', trimmedEmail)

    // Send reset email asynchronously
    setImmediate(async () => {
      try {
        await sendResetEmail(user.email, resetToken)
        console.log('[DEBUG] Reset email sent successfully to:', user.email)
      } catch (emailError) {
        console.error('[DEBUG] Failed to send reset email:', emailError)
      }
    })

    reply.send({
      message:
        'If an account with that email exists, a reset link has been sent.',
    })
  } catch (error) {
    console.error('[DEBUG] [ERROR] forgotPassword controller:', error)
    reply.code(500).send({ error: 'Forgot password failed' })
  }
}

export const resetPassword = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    console.log('[DEBUG] [START] resetPassword controller called')
    const { token, newPassword } = request.body as any

    if (!token || !newPassword) {
      return reply
        .code(400)
        .send({ error: 'Token and new password are required' })
    }

    if (newPassword.length < 6) {
      return reply
        .code(400)
        .send({ error: 'Password must be at least 6 characters long' })
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() },
    })

    if (!user) {
      return reply.code(400).send({ error: 'Invalid or expired reset token' })
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10)
    user.password = hashedPassword
    user.resetPasswordToken = undefined
    user.resetPasswordExpires = undefined
    await user.save()

    console.log('[DEBUG] [END] Password reset successfully for:', user.email)
    reply.send({ message: 'Password reset successfully' })
  } catch (error) {
    console.error('[DEBUG] [ERROR] resetPassword controller:', error)
    reply.code(500).send({ error: 'Password reset failed' })
  }
}

export const setPasswordAfterOAuth = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    console.log('[DEBUG] [START] setPasswordAfterOAuth controller called')
    const userId = (request as any).user?.id
    const { password } = request.body as any

    if (!password) {
      return reply.code(400).send({ error: 'Password is required' })
    }

    if (password.length < 6) {
      return reply
        .code(400)
        .send({ error: 'Password must be at least 6 characters long' })
    }

    const user = await User.findById(userId)
    if (!user) {
      return reply.code(404).send({ error: 'User not found' })
    }

    // Only allow OAuth users who don't have a password set yet
    if (!user.isOAuth) {
      return reply
        .code(400)
        .send({ error: 'This endpoint is only for OAuth users' })
    }

    if (user.password) {
      return reply
        .code(400)
        .send({ error: 'Password already set for this user' })
    }

    // Hash and set password
    const hashedPassword = await bcrypt.hash(password, 10)
    user.password = hashedPassword
    await user.save()

    console.log(
      '[DEBUG] [END] Password set successfully for OAuth user:',
      user.email
    )
    reply.send({ message: 'Password set successfully' })
  } catch (error) {
    console.error('[DEBUG] [ERROR] setPasswordAfterOAuth controller:', error)
    reply.code(500).send({ error: 'Failed to set password' })
  }
}
