import mongoose from 'mongoose'

const connectDB = async (): Promise<void> => {
  try {
    const mongoUri = process.env.MONGO_URI
    if (!mongoUri) throw new Error('MONGO_URI not set')

    console.log('Connecting to MongoDB:', mongoUri)

    // Connect with explicit dbName to force using 'mpk-school' and prevent 'test'
    await mongoose.connect(mongoUri, {
      dbName: 'mpk-school',
    })

    console.log('✅ MongoDB Connected to database: mpk-school')
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error)
    process.exit(1)
  }
}

export default connectDB
