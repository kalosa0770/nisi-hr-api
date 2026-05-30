import mongoose from 'mongoose';

const LeaveSchema = new mongoose.Schema({
  // Using String to stay backward-compatible with your existing custom ID node structures,
  // but adding an index for ultra-fast queries when filtering logs by worker.
  employeeId: { 
    type: String, 
    required: true,
    index: true 
  },
  name: { 
    type: String, 
    required: true 
  },
  type: { 
    type: String, 
    enum: [
      'Annual Leave', 
      'Sick Leave', 
      'Maternity Leave', 
      'Paternity Leave', 
      'Compassionate Leave', // Aligned to match form/controller string parameters
      'Unpaid Leave'          // Added to prevent validation blocks during payroll deductions
    ], 
    default: 'Annual Leave' 
  },
  days: { 
    type: Number, 
    required: true,
    min: [1, 'Leave duration cannot be less than 1 business production unit.']
  },
  startDate: { 
    type: Date, 
    required: true 
  },
  endDate: { 
    type: Date, 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['Pending', 'Approved', 'Rejected'], 
    default: 'Pending' 
  },
  reason: { 
    type: String,
    trim: true
  }
}, { 
  timestamps: true // Automatically captures createdAt (submission date) and updatedAt (approval date)
});

// Compound index optimization to prevent overlapping double-bookings at the database validation layer
LeaveSchema.index({ employeeId: 1, startDate: 1, endDate: 1 });

export default mongoose.models.Leave || mongoose.model('Leave', LeaveSchema);