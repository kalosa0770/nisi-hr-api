import express from 'express';
import Employee from "../models/Employee.js";

const router = express.Router();

// =========================================================
// ROUTE:   POST /api/employees
// DESC:    Register a new employee with statutory validation
// ACCESS:  Private / Corporate Admin
// =========================================================
router.post("/", async (req, res) => {
  try {
    const {
      employeeId,
      firstName,
      lastName,
      email,
      phone,
      jobTitle,
      department,
      joiningDate,
      nrcNumber,
      zraTpin,
      napsaNumber,
      nhimaNumber,
      bankDetails,
      compensation
    } = req.body;

    // 1. Strict Validation Check for Mandatory Fields
    if (!firstName || !lastName || !email || !nrcNumber || !zraTpin || !napsaNumber || !nhimaNumber) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing parameters. All core personal identity and statutory fields are mandatory." 
      });
    }

    // 2. Prevent Duplicate Identity Records (NRC, TPIN, Emails must be unique)
    const existingEmployee = await Employee.findOne({
      $or: [
        { email: email.toLowerCase() },
        { nrcNumber: nrcNumber.trim() },
        { zraTpin: zraTpin.trim() }
      ]
    });

    if (existingEmployee) {
      return res.status(409).json({
        success: false,
        message: "Registration conflict. An employee with this Email, NRC, or ZRA TPIN already exists."
      });
    }

    // 3. Fallback Auto-ID Generation logic if employeeId wasn't passed manually
    let finalEmployeeId = employeeId;
    if (!finalEmployeeId) {
      const count = await Employee.countDocuments();
      // Generates a streamlined sequencing tag (e.g., MHR-0011)
      finalEmployeeId = `MHR-${String(count + 1).padStart(3, "0")}`;
    }

    // 4. Instantiate and Save the New Record Node
    const newEmployee = new Employee({
      employeeId: finalEmployeeId,
      firstName,
      lastName,
      email,
      phone,
      jobTitle,
      department,
      joiningDate: joiningDate || new Date(),
      nrcNumber,
      zraTpin,
      napsaNumber,
      nhimaNumber,
      bankDetails,
      compensation: {
        basicSalary: compensation?.basicSalary || 0,
        allowances: {
          housing: compensation?.allowances?.housing || 0,
          transport: compensation?.allowances?.transport || 0,
          medical: compensation?.allowances?.medical || 0,
          otherAllowances: compensation?.allowances?.otherAllowances || 0
        }
      }
    });

    const savedEmployee = await newEmployee.save();

    res.status(201).json({
      success: true,
      message: "Employee successfully registered in Misi HR systems.",
      data: savedEmployee
    });

  } catch (error) {
    console.error("Error creating employee payload:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error processing compilation parameters.",
      error: error.message
    });
  }
});

// Quick GET route helper to match the fetch request inside your EmployeesContent frontend component
router.get("/", async (req, res) => {
  try {
    const employees = await Employee.find().sort({ createdAt: -1 });
    res.status(200).json(employees);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;