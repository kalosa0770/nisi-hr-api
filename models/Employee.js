import mongoose from 'mongoose';

const EmployeeSchema = new mongoose.Schema(
  {
    // =========================================================
    // PERSONAL PERSONAL IDENTIFICATION PARAMETERS
    // =========================================================
    employeeId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      // Generates a unique serial number (e.g., MHR-001) if not input manually
    },
    firstName: {
      type: String,
      required: [true, "First name is mandatory"],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, "Last name is mandatory"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Corporate email is mandatory"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    jobTitle: {
      type: String,
      required: true,
      trim: true,
    },
    department: {
      type: String,
      required: true,
      enum: ["Management", "Engineering", "Creative", "Marketing", "Operations"],
    },
    status: {
      type: String,
      enum: ["Active", "Suspended", "Terminated"],
      default: "Active",
    },
    joiningDate: {
      type: Date,
      required: true,
    },

    // =========================================================
    // GOVERNMENT REGULATORY INDICES (Zambian Statutory Identifiers)
    // =========================================================
    nrcNumber: {
      type: String,
      required: [true, "National Registration Card (NRC) number is required"],
      unique: true,
      trim: true, // Format: XXXXXX/XX/X
    },
    zraTpin: {
      type: String,
      required: [true, "ZRA TPIN is mandatory for PAYE submissions"],
      unique: true,
      trim: true, // 10-digit number
    },
    napsaNumber: {
      type: String,
      required: [true, "NAPSA Social Security number is required"],
      unique: true,
      trim: true,
    },
    nhimaNumber: {
      type: String,
      required: [true, "NHIMA National Health Insurance number is required"],
      unique: true,
      trim: true,
    },

    // =========================================================
    // FINANCIAL REMITTANCE VECTOR (Bank Details for EFT File Export)
    // =========================================================
    bankDetails: {
      bankName: { 
        type: String, 
        required: true, 
        enum: ["FNB", "Stanbic", "ABSA", "Standard Chartered", "ZANACO", "Indo Zambia", "Atlas Mara"] 
      },
      branchName: { type: String, required: true },
      branchCode: { type: String, required: true },
      accountNumber: { type: String, required: true, trim: true },
      accountType: { type: String, enum: ["Savings", "Current"], default: "Current" }
    },

    // =========================================================
    // PAYROLL CALCULATION CONSTANTS (Base Financial Values)
    // =========================================================
    compensation: {
      basicSalary: {
        type: Number,
        required: [true, "Base salary parameter is mandatory"],
        min: [0, "Salary cannot be a negative valuation"],
      },
      // Allowances split by category for granular tax evaluation
      allowances: {
        housing: { type: Number, default: 0 },
        transport: { type: Number, default: 0 },
        medical: { type: Number, default: 0 },
        otherAllowances: { type: Number, default: 0 }
      }
    }
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt indices
  }
);

// Virtual parameter to cleanly deliver full name to the client-side tables
EmployeeSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`;
});

const Employee = mongoose.model("Employee", EmployeeSchema);
export default Employee;