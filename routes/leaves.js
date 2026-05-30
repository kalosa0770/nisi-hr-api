import express from 'express';
import Leave from "../models/Leave.js";
import Employee from "../models/Employee.js";

const router = express.Router();

/**
 * Helper Utility: Calculate business days between two dates
 * automatically filtering out Saturdays and Sundays.
 */
const calculateBusinessDays = (start, end) => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  let count = 0;
  const curDate = new Date(startDate.getTime());
  
  while (curDate <= endDate) {
    const dayOfWeek = curDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Skip Sunday (0) and Saturday (6)
      count++;
    }
    curDate.setDate(curDate.getDate() + 1);
  }
  return count;
};

// =========================================================
// ROUTE:   GET /api/leaves
// DESC:    Retrieve all corporate leave registration applications
// =========================================================
router.get("/", async (req, res) => {
  try {
    const leaves = await Leave.find().sort({ createdAt: -1 });
    res.status(200).json(leaves);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =========================================================
// ROUTE:   POST /api/leaves
// DESC:    File/Request a new leave allocation cycle (Standard Flow)
// =========================================================
router.post("/", async (req, res) => {
  try {
    const { employeeId, type, startDate, endDate, reason } = req.body;

    if (!employeeId || !type || !startDate || !endDate) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing parameters. Employee link, leave type, and timeline bounds are required." 
      });
    }

    // Unified to findById to align with the frontend MongoDB Object ID context references
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ 
        success: false, 
        message: `Identity sync error. No active worker found with database key: ${employeeId}` 
      });
    }

    const calculatedDays = calculateBusinessDays(startDate, endDate);
    if (calculatedDays <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Timeline error. Date range must contain active business production days." 
      });
    }

    // Verify timeline overlaps
    const overlappingLeave = await Leave.findOne({
      employeeId,
      status: { $in: ["Pending", "Approved"] },
      $or: [
        { startDate: { $lte: new Date(endDate) }, endDate: { $gte: new Date(startDate) } }
      ]
    });

    if (overlappingLeave) {
      return res.status(409).json({
        success: false,
        message: "Timeline conflict. The employee already has a pending or approved allocation for these dates."
      });
    }

    // Enforce balance checks early if filing standard annual leave requests upfront
    if (type === "Annual Leave" && employee.leaveBalance < calculatedDays) {
      return res.status(400).json({
        success: false,
        message: `Insufficient leave wallet space. Request requires ${calculatedDays} days, but only ${employee.leaveBalance} days remain.`
      });
    }

    const newLeave = new Leave({
      employeeId,
      name: `${employee.firstName} ${employee.lastName}`,
      type,
      days: calculatedDays,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      reason,
      status: "Pending"
    });

    const savedLeave = await newLeave.save();
    res.status(201).json({ success: true, data: savedLeave });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =========================================================
// ROUTE:   PATCH /api/leaves/:id
// DESC:    Approve or Reject an active timeline balance request (State Syncing)
// =========================================================
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // Expects "Approved" or "Rejected"

    if (!["Approved", "Rejected", "Pending"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid evaluation target status parameters passed." });
    }

    // Find document first to read current fields before mutation
    const leaveDoc = await Leave.findById(id);
    if (!leaveDoc) {
      return res.status(404).json({ success: false, message: "Leave allocation log node not found." });
    }

    // Prevent re-processing already finalized allocation chains
    if (leaveDoc.status !== "Pending" && status !== "Pending") {
      return res.status(400).json({ success: false, message: "This allocation record tracking window has already been locked and finalized." });
    }

    // State Transition: If moving from Pending to Approved, apply changes to the Employee core record
    if (status === "Approved" && leaveDoc.status === "Pending") {
      const employee = await Employee.findById(leaveDoc.employeeId);
      if (!employee) {
        return res.status(404).json({ success: false, message: "Associated employee structural identity node vanished." });
      }

      // Enforce strict checks for annual leave deductions
      if (leaveDoc.type === "Annual Leave") {
        if (employee.leaveBalance < leaveDoc.days) {
          return res.status(400).json({ 
            success: false, 
            message: `Approval failed. Employee leave wallet balance (${employee.leaveBalance} days) is insufficient for this request (${leaveDoc.days} days).` 
          });
        }
        employee.leaveBalance -= leaveDoc.days;
      }

      // Append clean log data to employee context history array for profile views
      employee.leaveHistory.push({
        type: leaveDoc.type,
        startDate: leaveDoc.startDate,
        endDate: leaveDoc.endDate,
        calculatedDays: leaveDoc.days,
        reason: leaveDoc.reason || "Standard Portal Application",
        status: "Approved"
      });

      await employee.save();
    }

    // Commit changes to the root Leave document 
    leaveDoc.status = status;
    const updatedLeave = await leaveDoc.save();

    res.status(200).json({ success: true, data: updatedLeave });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =========================================================
// ROUTE:   POST /api/leaves/book-manual
// DESC:    Direct HR Portal Administrative Override Overwrite Engine
// =========================================================
router.post('/book-manual', async (req, res) => {
  try {
    const { employeeId, leaveType, startDate, endDate, reason } = req.body;

    if (!employeeId || !leaveType || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: "Missing explicit logging arguments inside request body payload." });
    }

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ success: false, message: "Employee profile entity node not discovered." });
    }

    const businessDays = calculateBusinessDays(startDate, endDate);
    if (businessDays <= 0) {
      return res.status(400).json({ success: false, message: "Calculated cycle result is 0 business production execution units." });
    }

    if (leaveType === "Annual Leave" && employee.leaveBalance < businessDays) {
      return res.status(400).json({ 
        success: false,
        message: `Insufficient leave balance. Selected duration requires ${businessDays} days, but employee only has ${employee.leaveBalance} remaining.` 
      });
    }

    // Process annual leave ledger changes immediately
    if (leaveType === "Annual Leave") {
      employee.leaveBalance -= businessDays;
    }

    // Record data directly onto employee profile document data node
    employee.leaveHistory.push({
      type: leaveType,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      calculatedDays: businessDays,
      reason: reason || "Administrative Direct Entry Log",
      status: "Approved"
    });

    await employee.save();

    // Generate matching baseline document in the leaves collection for macro analytical visibility
    const manualLeaveRecord = new Leave({
      employeeId: employee._id,
      name: `${employee.firstName} ${employee.lastName}`,
      type: leaveType,
      days: businessDays,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      reason: reason || "Administrative Direct Entry Log",
      status: "Approved" // Instantly executed status flag matching direct admin injection bounds
    });

    await manualLeaveRecord.save();

    res.status(201).json({ 
      success: true, 
      message: `Absence recorded: ${businessDays} working days successfully parsed and adjusted.` 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;