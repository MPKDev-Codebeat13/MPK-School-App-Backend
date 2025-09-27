import { FastifyInstance } from 'fastify'
import {
  signup,
  login,
  getProfile,
  resendVerificationEmail,
  changePassword,
  updateUser,
  deleteUser,
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

  // Google OAuth start
  fastify.get('/google', async (request, reply) => {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI ||
      'https://mym-nexus.onrender.com/api/auth/google/callback'
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
          `${
            process.env.SERVER_URL || 'http://localhost:4000'
          }/api/auth/google/callback`,
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
        user = await User.create({
          fullName: profile.name,
          email: profile.email,
          role: '', // Don't set default role, let user choose in CompleteProfile
          profilePicture: profile.picture || '',
          isVerified: true, // OAuth users are already verified by Google
          isOAuth: true,
        })
        console.log('[DEBUG] New OAuth user created:', profile.email)
      } else {
        // Existing OAuth user - ensure verified
        if (user.isOAuth && !user.isVerified) {
          user.isVerified = true
          user.verificationToken = undefined
          user.verificationTokenExpires = undefined
          await user.save()
          console.log(
            '[DEBUG] Marked existing OAuth user as verified:',
            user.email
          )
        }
        console.log('[DEBUG] Existing OAuth user found:', user.email)
      }
      // Generate JWT
      const jwtToken = jwt.sign(
        { id: user._id, email: user.email, role: user.role },
        process.env.JWT_SECRET as string,
        { expiresIn: '1d' }
      )

      // Redirect to frontend with token and user data
      const frontendUrl = `${
        process.env.CLIENT_URL || 'https://mymnexus.netlify.app'
      }/oauth-callback?accessToken=${jwtToken}&user=${encodeURIComponent(
        JSON.stringify(user)
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
}
