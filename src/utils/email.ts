import * as crypto from 'crypto'
import sgMail from '@sendgrid/mail'

export const generateVerificationToken = (): string => {
  return crypto.randomBytes(32).toString('hex')
}

export const sendVerificationEmail = async (
  email: string,
  token: string
): Promise<void> => {
  const verificationUrl = `${process.env.CLIENT_URL}/verify-email?token=${token}`

  // Set SendGrid API key
  sgMail.setApiKey(process.env.SENDGRID_API_KEY as string)

  const msg = {
    to: email,
    from: 'noreply@mymnexus.netlify.app', // Use a verified sender email in SendGrid
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
    await sgMail.send(msg)
    console.log(`[EMAIL] Verification email sent to ${email}`)
  } catch (error) {
    console.error('[EMAIL] Failed to send verification email:', error)
    throw error
  }
}
