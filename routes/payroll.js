import express from 'express';
import mongoose from 'mongoose';
import Employee from "../models/Employee.js";
import  calculateEmployeePayroll  from "../utils/payrollEngine.js"; // Double check if you named this default or named export

const router = express.Router();

// =========================================================
// 🗄️ INLINE PAYROLL HISTORY SCHEMA
// =========================================================
// Creating a simple history collection so runs are persistent
const PayrollHistorySchema = new mongoose.Schema({
  monthYear: { type: String, required: true, unique: true }, // e.g., "May 2026"
  summaryTotals: {
    totalGrossPay: Number,
    totalNetPay: Number,
    totalPAYE: Number,
    totalNAPSA: Number,
    totalNHIMA: Number,
    totalDeductions: Number,
    averageSalary: Number,
    headcount: Number,
    pipelineProgress: Number,
    steps: {
      attendance: String,
      tax: String,
      disbursement: String
    }
  },
  individualLineItems: [mongoose.Schema.Types.Mixed]
}, { timestamps: true });

// Fallback prevent compile error on hot reloads
const PayrollHistory = mongoose.models.PayrollHistory || mongoose.model("PayrollHistory", PayrollHistorySchema);


// =========================================================
// ROUTE:   GET /api/payroll/summary
// DESC:    Fetch the latest saved payroll run for the dashboard
// =========================================================
router.get("/summary", async (req, res) => {
  try {
    const { monthYear } = req.query; // Reads from fetch params

    if (!monthYear) {
      return res.status(400).json({ success: false, message: "monthYear query parameter is required." });
    }

    // Look for a saved record matching the active month cycle
    const historicalRun = await PayrollHistory.findOne({ monthYear });

    if (!historicalRun) {
      // If it doesn't exist, return a 404 so the frontend falls back to default zero values gracefully
      return res.status(404).json({ success: false, message: "No active cycle run found for this period." });
    }

    res.status(200).json(historicalRun);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


// =========================================================
// ROUTE:   POST /api/payroll/run
// DESC:    Automatically process payroll AND save it to historical collections
// =========================================================
router.post("/run", async (req, res) => {
  try {
    const { monthYear } = req.body; 

    if (!monthYear) {
      return res.status(400).json({ success: false, message: "monthYear field is required in request body." });
    }

    // 1. Fetch only active personnel nodes
    const activeEmployees = await Employee.find({ status: "Active" });

    if (activeEmployees.length === 0) {
      return res.status(400).json({ success: false, message: "No active employees found to process." });
    }

    // 2. Map through employees and calculate live balances
    const individualLineItems = activeEmployees.map(employee => {
      const calculations = calculateEmployeePayroll(employee);
      return {
        employeeId: employee.employeeId,
        name: `${employee.firstName} ${employee.lastName}`,
        jobTitle: employee.jobTitle,
        basicSalary: employee.compensation.basicSalary,
        ...calculations
      };
    });

    // 3. Reduce individual values into your macro dashboard card aggregates
    const summaryTotals = individualLineItems.reduce((acc, current) => {
      acc.totalGrossPay += current.grossPay;
      acc.totalNetPay += current.netPay;
      acc.totalPAYE += current.deductions.paye;
      acc.totalNAPSA += current.deductions.napsa;
      acc.totalNHIMA += current.deductions.nhima;
      return acc;
    }, { totalGrossPay: 0, totalNetPay: 0, totalPAYE: 0, totalNAPSA: 0, totalNHIMA: 0 });

    const totalDeductions = summaryTotals.totalPAYE + summaryTotals.totalSocial + summaryTotals.totalNHIMA;
    const headcount = activeEmployees.length;

    // Apply currency rounding
    const finalSummary = {
      totalGrossPay: Number(summaryTotals.totalGrossPay.toFixed(2)),
      totalNetPay: Number(summaryTotals.totalNetPay.toFixed(2)),
      totalPAYE: Number(summaryTotals.totalPAYE.toFixed(2)),
      totalNAPSA: Number(summaryTotals.totalNAPSA.toFixed(2)),
      totalNHIMA: Number(summaryTotals.totalNHIMA.toFixed(2)),
      totalDeductions: Number((summaryTotals.totalPAYE + summaryTotals.totalNAPSA + summaryTotals.totalNHIMA).toFixed(2)),
      averageSalary: Number((summaryTotals.totalGrossPay / headcount).toFixed(2)),
      headcount,
      pipelineProgress: 100,
      steps: { attendance: 'done', tax: 'done', disbursement: 'done' }
    };

    // 4. UPSERT into MongoDB (Updates if existing run exists, creates new record if not)
    const updatedHistory = await PayrollHistory.findOneAndUpdate(
      { monthYear },
      {
        monthYear,
        summaryTotals: finalSummary,
        individualLineItems
      },
      { new: true, upsert: true }
    );

    // 5. Return the newly processed dynamic data block
    res.status(200).json(updatedHistory);

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;