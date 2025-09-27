import * as crypto from 'crypto'
import nodemailer from 'nodemailer'

export const generateVerificationToken = (): string => {
  return crypto.randomBytes(32).toString('hex')
}


// Create SendGrid transporter
export const createTransporter = () => {
  const sendGridKey = process.env.SENDGRID_API_KEY

  if (!sendGridKey) {
    throw new Error(
      'SendGrid credentials not configured. Please set SENDGRID_API_KEY in your environment variables.'
    )
  }

  return nodemailer.createTransport({
    service: 'SendGrid',
    auth: {
      user: 'apikey', // This is required, literally the string 'apikey'
      pass: sendGridKey,
    },
  })
}

export const sendVerificationEmail = async (
  email: string,
  token: string
): Promise<void> => {
  const clientUrl = process.env.CLIENT_URL || 'https://mymnexus.netlify.app'
  const verificationUrl = `${clientUrl}/verify-email?token=${token}`

  const transporter = createTransporter()

  const mailOptions = {
    from: process.env.EMAIL_FROM || 'noreply@mymnexus.com',
    to: email,
    subject: 'Verify Your Email - MYM Nexus',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h2 style="color: #333; text-align: center;">Welcome to MYM Nexus!</h2>
          <p style="color: #666; line-height: 1.6;">Please verify your email address by clicking the button below:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
              Verify Email
            </a>
          </div>
          <p style="color: #666; line-height: 1.6;">If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="word-break: break-all; background-color: #f0f0f0; padding: 10px; border-radius: 4px; font-family: monospace; color: #333;">${verificationUrl}</p>
          <p style="color: #666; line-height: 1.6;">This link will expire in 24 hours.</p>
          <p style="color: #666; line-height: 1.6;">If you didn't create an account, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">MYM Nexus - School Management Platform</p>
        </div>
      </div>
    `,
  }

  try {
    await transporter.sendMail(mailOptions)
    console.log(`[EMAIL] Verification email sent to ${email}`)
  } catch (error) {
    console.error('[EMAIL] Failed to send verification email:', error)
    throw error
  }
}
