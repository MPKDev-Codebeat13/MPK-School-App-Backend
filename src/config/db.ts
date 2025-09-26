import mongoose from 'mongoose'

const connectDB = async (): Promise<void> => {
  try {
    const mongoUri = process.env.MONGO_URI
    if (!mongoUri) throw new Error('MONGO_URI not set')
    console.log('Connecting to MongoDB:', mongoUri)
    await mongoose.connect(mongoUri)
    console.log('✅ MongoDB Connected')
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error)
    process.exit(1)
  }
}

export default connectDB
