import { FastifyInstance } from 'fastify'
import {
  signup,
  login,
  getProfile,
  checkVerificationStatus,
  resendVerificationEmail,
  changePassword,
  updateUser,
  deleteUser,
  forgotPassword,
  resetPassword,
  setPasswordAfterOAuth,
} from '../controllers/auth.controller'
import { authenticate } from '../middleware/auth'
import * as jwt from 'jsonwebtoken'
import {
  generateVerificationToken,
  sendVerificationEmail,
} from '../utils/email'
import User from '../models/user.model'

// Email verification controller
const verifyEmail = async (request: any, reply: any) => {
  try {
    const { token } = request.query as any
    if (!token) {
      return reply.code(400).send({ error: 'Verification token is required' })
    }

    const user = await User.findOne({
      verificationToken: token,
      verificationTokenExpires: { $gt: new Date() },
    })

    if (!user) {
      return reply
        .code(400)
        .send({ error: 'Invalid or expired verification token' })
    }

    // Update user as verified
    user.isVerified = true
    user.verificationToken = undefined
    user.verificationTokenExpires = undefined
    await user.save()

    console.log(`[DEBUG] Email verified for user: ${user.email}`)

    // Return JSON response with verification status
    reply.send({
      message: 'Email verified successfully',
      isVerified: true,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        isOAuth: user.isOAuth,
      },
    })
  } catch (error) {
    console.error('[DEBUG] Email verification error:', error)
    reply.code(500).send({ error: 'Email verification failed' })
  }
}

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/signup', { handler: signup })
  fastify.post('/login', { handler: login })
  fastify.get('/profile', { preHandler: authenticate, handler: getProfile })
  fastify.get('/verify-email', { handler: verifyEmail })
  fastify.post('/resend-verification', { handler: resendVerificationEmail })
  fastify.post('/check-verification-status', {
    handler: checkVerificationStatus,
  })

  // Google OAuth start
  fastify.get('/google', async (request, reply) => {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const redirectUri = process.env.GOOGLE_REDIRECT_URI
    const scope = 'openid profile email'
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code`
    reply.redirect(authUrl)
  })

  // Google OAuth callback handler
  fastify.get('/google/callback', async (request, reply) => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 25000) // 25 second timeout

    try {
      const { code } = request.query as any
      if (!code) {
        return reply.code(400).send({ error: 'Authorization code is required' })
      }

      const tokenUrl = 'https://oauth2.googleapis.com/token'
      const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        code,
        grant_type: 'authorization_code',
        redirect_uri:
          process.env.GOOGLE_REDIRECT_URI ||
          'http://localhost:4000/api/auth/google/callback',
      })
      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
        signal: controller.signal,
      })
      const tokenData = await tokenResponse.json()
      if (!tokenResponse.ok) {
        return reply.code(500).send({ error: 'Token exchange failed' })
      }
      const accessToken = tokenData.access_token

      // Get user info
      const userInfoUrl = 'https://www.googleapis.com/oauth2/v2/userinfo'
      const userResponse = await fetch(userInfoUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      })
      const profile = await userResponse.json()
      if (!userResponse.ok) {
        return reply.code(500).send({ error: 'User info fetch failed' })
      }

      let user = await User.findOne({ email: profile.email })
      if (!user) {
        // Generate verification token for OAuth users
        const verificationToken = generateVerificationToken()
        user = await User.create({
          fullName: profile.name,
          email: profile.email,
          role: '', // Don't set default role, let user choose in CompleteProfile
          profilePicture: profile.picture || '',
          isVerified: false, // OAuth users must verify like regular users
          isOAuth: true,
          verificationToken,
          verificationTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        })
        console.log('[DEBUG] New OAuth user created:', profile.email)

        // Send verification email asynchronously
        const newUser = user
        setImmediate(async () => {
          try {
            await sendVerificationEmail(newUser.email, verificationToken)
            newUser.verificationEmailSent = true
            await newUser.save()
            console.log(
              '[DEBUG] Verification email sent to OAuth user:',
              newUser.email
            )
          } catch (emailError) {
            console.error(
              '[DEBUG] Failed to send verification email to OAuth user:',
              emailError
            )
          }
        })
      } else {
        // Existing OAuth user - check if they need to complete profile
        if (user && user.isOAuth && !user.isVerified) {
          console.log(
            '[DEBUG] Existing OAuth user needs verification and profile completion:',
            user.email
          )
        } else if (user) {
          console.log('[DEBUG] Existing OAuth user found:', user.email)
        }
      }
      // Generate JWT
      if (!user) {
        return reply.code(500).send({ error: 'User creation failed' })
      }
      const jwtToken = jwt.sign(
        { id: user._id, email: user.email, role: user.role },
        process.env.JWT_SECRET as string,
        { expiresIn: '1d' }
      )

      // Redirect to frontend with token and user data
      const frontendUrl = `${
        process.env.CLIENT_URL || 'http://localhost:5173'
      }/oauth-callback?accessToken=${jwtToken}&user=${encodeURIComponent(
        JSON.stringify({
          ...user!.toObject(),
          hasPassword: !!user!.password,
        })
      )}`
      clearTimeout(timeoutId)
      reply.redirect(frontendUrl)
    } catch (error) {
      clearTimeout(timeoutId)
      if ((error as Error).name === 'AbortError') {
        console.error('[DEBUG] OAuth callback timed out')
        return reply.code(408).send({ error: 'Request timeout' })
      }
      console.error('[DEBUG] Google OAuth failed:', error)
      reply.code(500).send({
        error: 'Google OAuth failed',
        details: (error as Error).message,
      })
    }
  })

  // Refresh token endpoint
  fastify.post('/refresh', async (request, reply) => {
    try {
      const { refreshToken } = request.body as any
      if (!refreshToken) {
        return reply.code(400).send({ error: 'Refresh token is required' })
      }

      // Verify refresh token
      let payload: any
      try {
        payload = jwt.verify(refreshToken, process.env.JWT_SECRET as string)
      } catch (err) {
        return reply.code(401).send({ error: 'Invalid refresh token' })
      }

      // Find user and check if refresh token is valid
      const user = await User.findById(payload.id)
      if (!user || !user.refreshTokens.includes(refreshToken)) {
        return reply.code(401).send({ error: 'Invalid refresh token' })
      }

      // Generate new access token and refresh token
      const newAccessToken = jwt.sign(
        { id: user._id, email: user.email, role: user.role },
        process.env.JWT_SECRET as string,
        { expiresIn: '1d' }
      )
      const newRefreshToken = jwt.sign(
        { id: user._id },
        process.env.JWT_SECRET as string,
        { expiresIn: '30d' }
      )

      // Replace old refresh token with new one
      user.refreshTokens = user.refreshTokens.filter((t) => t !== refreshToken)
      user.refreshTokens.push(newRefreshToken)
      await user.save()

      reply.send({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      })
    } catch (error) {
      const err = error as Error
      console.error('[DEBUG] Refresh token error:', err)
      reply.code(500).send({ error: 'Refresh token failed' })
    }
  })

  // User update endpoint
  fastify.put('/user/update', {
    preHandler: authenticate,
    handler: updateUser,
  })

  // User delete endpoint
  fastify.delete('/user/delete', {
    preHandler: authenticate,
    handler: deleteUser,
  })

  // Change password endpoint
  fastify.post('/change-password', {
    preHandler: authenticate,
    handler: changePassword,
  })

  // Auto-verify OAuth user endpoint - DISABLED: OAuth users now use manual verification
  // fastify.post('/auto-verify-oauth', async (request, reply) => {
  //   try {
  //     const { email } = request.body as any
  //     if (!email) {
  //       return reply.code(400).send({ error: 'Email is required' })
  //     }

  //     const user = await User.findOne({ email, isOAuth: true })
  //     if (!user) {
  //       return reply.code(404).send({ error: 'OAuth user not found' })
  //     }

  //     if (user.isVerified) {
  //       return reply.send({ message: 'User already verified' })
  //     }

  //     user.isVerified = true
  //     user.verificationToken = undefined
  //     user.verificationTokenExpires = undefined
  //     await user.save()

  //     console.log(`[DEBUG] OAuth user auto-verified: ${user.email}`)
  //     reply.send({ message: 'OAuth user auto-verified successfully' })
  //   } catch (error) {
  //     console.error('[DEBUG] Auto-verify OAuth error:', error)
  //     reply.code(500).send({ error: 'Auto-verification failed' })
  //   }
  // })

  // Forgot password endpoint
  fastify.post('/forgot-password', { handler: forgotPassword })

  // Reset password endpoint
  fastify.post('/reset-password', { handler: resetPassword })

  // Set password after OAuth endpoint
  fastify.post('/set-password', {
    preHandler: authenticate,
    handler: setPasswordAfterOAuth,
  })
}
