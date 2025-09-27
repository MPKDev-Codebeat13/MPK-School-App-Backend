import * as crypto from 'crypto'
import nodemailer from 'nodemailer'

export const generateVerificationToken = (): string => {
  return crypto.randomBytes(32).toString('hex')
}

export const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  })
}

export const sendVerificationEmail = async (
  email: string,
  token: string
): Promise<void> => {
  const verificationUrl = `${process.env.CLIENT_URL}/verify-email?token=${token}`

  const transporter = createTransporter()

  const mailOptions = {
    from: process.env.EMAIL_USER || 'noreply@mmyschoolapp.com',
    to: email,
    subject: 'Verify Your Email - MYM Nexus',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to MYM Nexus!</h2>
        <p>Please verify your email address by clicking the button below:</p>
        <a href="${verificationUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0;">
          Verify Email
        </a>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p>${verificationUrl}</p>
        <p>This link will expire in 24 hours.</p>
        <p>If you didn't create an account, please ignore this email.</p>
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
