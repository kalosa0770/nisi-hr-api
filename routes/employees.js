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

    // 2. Prevent Duplicate Identity Records (Using exact trim/case-insensitive parameters)
    const existingEmployee = await Employee.findOne({
      $or: [
        { email: { $regex: new RegExp(`^${email.trim()}$`, "i") } },
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
      finalEmployeeId = `MHR-${String(count + 1).padStart(3, "0")}`;
    } else {
      finalEmployeeId = finalEmployeeId.trim().toUpperCase();
    }

    // 4. Instantiate and Save the New Record Node
    const newEmployee = new Employee({
      employeeId: finalEmployeeId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase().trim(),
      phone,
      jobTitle,
      department,
      joiningDate: joiningDate || new Date(),
      nrcNumber: nrcNumber.trim(),
      zraTpin: zraTpin.trim(),
      napsaNumber: napsaNumber.trim(),
      nhimaNumber: nhimaNumber.trim(),
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
      message: "Employee successfully registered in Nissi HR systems.",
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

// =========================================================
// ROUTE:   GET /api/employees
// DESC:    Retrieve all active database personnel nodes
// =========================================================
router.get("/", async (req, res) => {
  try {
    const employees = await Employee.find().sort({ createdAt: -1 });
    res.status(200).json(employees);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =========================================================
// ROUTE:   GET /api/employees/:employeeId
// DESC:    Sync worker profile context by Custom String Identifier
// AXIOS:   Matches the exact row layout link in your UI Drawer
// =========================================================
router.get("/:employeeId", async (req, res) => {
  try {
    const { employeeId } = req.params;

    if (!employeeId) {
      return res.status(400).json({ success: false, message: "Employee ID parameter is required." });
    }

    const cleanId = employeeId.trim();

    // Try finding by custom tracking string string (case-insensitive) OR standard MongoDB hex ObjectId
    const employee = await Employee.findOne({
      $or: [
        { employeeId: { $regex: new RegExp(`^${cleanId}$`, "i") } },
        // Safely check ObjectId only if cleanId matches standard 24-character hex format
        ...(cleanId.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: cleanId }] : [])
      ]
    });

    if (!employee) {
      console.log(`[Lookup Fail] No employee node matches token: "${cleanId}"`);
      return res.status(404).json({ 
        success: false, 
        message: `Identity Sync Error: Worker node "${cleanId}" not found in corporate registers.` 
      });
    }

    // Explicitly return the raw object block to fulfill direct frontend state mappings
    res.status(200).json(employee);
  } catch (error) {
    console.error("Error fetching individual identity node vectors:", error);
    res.status(500).json({ 
      success: false, 
      message: "Error fetching individual identity node vectors.", 
      error: error.message 
    });
  }
});

export default router;