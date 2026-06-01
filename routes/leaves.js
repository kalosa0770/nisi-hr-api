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

    if (type === "Annual Leave" && employee.leaveBalance < calculatedDays) {
      return res.status(400).json({
        success: false,
        message: `Insufficient leave wallet space. Request requires ${calculatedDays} days, but only ${employee.leaveBalance} days remain.`
      });
    }

    const employeeName = `${employee.firstName} ${employee.lastName}`;

    const newLeave = new Leave({
      employeeId,
      name: employeeName,
      type,
      days: calculatedDays,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      reason,
      status: "Pending"
    });

    const savedLeave = await newLeave.save();

    // ✨ Notification creation pipeline removed successfully.

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
    const { status } = req.body; 

    if (!["Approved", "Rejected", "Pending"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid evaluation target status parameters passed." });
    }

    const leaveDoc = await Leave.findById(id);
    if (!leaveDoc) {
      return res.status(404).json({ success: false, message: "Leave allocation log node not found." });
    }

    if (leaveDoc.status !== "Pending" && status !== "Pending") {
      return res.status(400).json({ success: false, message: "This allocation record tracking window has already been locked and finalized." });
    }

    const previousStatus = leaveDoc.status;

    if (status === "Approved" && previousStatus === "Pending") {
      const employee = await Employee.findById(leaveDoc.employeeId);
      if (!employee) {
        return res.status(404).json({ success: false, message: "Associated employee structural identity node vanished." });
      }

      if (leaveDoc.type === "Annual Leave") {
        if (employee.leaveBalance < leaveDoc.days) {
          return res.status(400).json({ 
            success: false, 
            message: `Approval failed. Employee leave wallet balance (${employee.leaveBalance} days) is insufficient for this request (${leaveDoc.days} days).` 
          });
        }
        employee.leaveBalance -= leaveDoc.days;
      }

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

    leaveDoc.status = status;
    const updatedLeave = await leaveDoc.save();

    // ✨ Review verification notification log trigger removed.

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
      return res.status(400).json({ success: false, message: "Missing required employee information." });
    }

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ success: false, message: "Employee not found." });
    }

    const businessDays = calculateBusinessDays(startDate, endDate);
    if (businessDays <= 0) {
      return res.status(400).json({ success: false, message: "Calculated duration is invalid." });
    }

    // 🔒 RESILIENT PROTECTION: Check timeline overlaps matching BOTH Approved and Pending entries
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
        message: `The requested leave period is already booked.`
      });
    }

    if (leaveType === "Annual Leave" && employee.leaveBalance < businessDays) {
      return res.status(400).json({ 
        success: false,
        message: `Insufficient leave balances remaining.` 
      });
    }

    // Deduct from wallet if running an annual allocation tracking variable
    if (leaveType === "Annual Leave") {
      employee.leaveBalance -= businessDays;
    }

    const employeeName = `${employee.firstName} ${employee.lastName}`;

    const generalizedHistoryNode = {
      type: leaveType,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      days: businessDays, 
      calculatedDays: businessDays,
      reason: reason || "Administrative Direct Entry Log",
      status: "Approved"
    };

    employee.leaveHistory.push(generalizedHistoryNode);
    await employee.save();

    const manualLeaveRecord = new Leave({
      employeeId: employee._id,
      name: employeeName,
      type: leaveType,
      days: businessDays,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      reason: reason || "Administrative Direct Entry Log",
      status: "Approved" 
    });

    await manualLeaveRecord.save();

    // ✨ Administrative override ledger log dispatch removed completely.

    res.status(201).json({ 
      success: true, 
      message: `Manual leave record created successfully.` 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;