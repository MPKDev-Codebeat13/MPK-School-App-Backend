import { Schema, model, Document } from 'mongoose'

export interface AttendanceDocument extends Document {
  date: Date
  grade: string
  section: string
  studentCount: number
  students: {
    name: string
    gender: string
    present: boolean
    absent: boolean
    uniform: boolean
    noHW: boolean
    noCW: boolean
  }[]
}

const AttendanceSchema = new Schema<AttendanceDocument>({
  date: { type: Date, default: Date.now },
  grade: { type: String, required: true },
  section: { type: String, required: true },
  studentCount: { type: Number, required: true },
  students: [
    {
      name: { type: String, required: true },
      gender: { type: String, required: true },
      present: { type: Boolean, required: true, default: false },
      absent: { type: Boolean, required: true, default: false },
      uniform: { type: Boolean, required: true, default: false },
      noHW: { type: Boolean, required: true, default: false },
      noCW: { type: Boolean, required: true, default: false },
    },
  ],
})

const Attendance = model<AttendanceDocument>('Attendance', AttendanceSchema)

export default Attendance
