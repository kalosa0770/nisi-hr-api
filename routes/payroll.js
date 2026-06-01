import express from 'express';
import mongoose from 'mongoose';
import Employee from "../models/Employee.js";
import calculateEmployeePayroll from "../utils/payrollEngine.js"; 

const router = express.Router();

// =========================================================
// 🗄️ INLINE PAYROLL HISTORY SCHEMA
// =========================================================
const PayrollHistorySchema = new mongoose.Schema({
  monthYear: { type: String, required: true, unique: true }, 
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

const PayrollHistory = mongoose.models.PayrollHistory || mongoose.model("PayrollHistory", PayrollHistorySchema);

// =========================================================
// 🛠️ UTILITY: COMPUTE PREVIOUS MONTH-YEAR TOKEN STRING (ROBUST)
// =========================================================
const getPreviousMonthYearToken = (currentMonthYearStr) => {
  try {
    const months = [
      "january", "february", "march", "april", "may", "june", 
      "july", "august", "september", "october", "november", "december"
    ];
    
    const [monthName, yearStr] = currentMonthYearStr.trim().toLowerCase().split(/\s+/);
    let monthIndex = months.indexOf(monthName);
    let year = parseInt(yearStr);

    if (monthIndex === -1 || isNaN(year)) return null;

    // Shift context backward cleanly
    if (monthIndex === 0) {
      monthIndex = 11;
      year -= 1;
    } else {
      monthIndex -= 1;
    }

    // Safely reconstruct structural token
    const targetDate = new Date(year, monthIndex, 1);
    return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(targetDate);
  } catch (err) {
    console.error("Failed Parsing Month token vector tracking strings:", err);
    return null;
  }
};


// =========================================================
// ROUTE:   GET /api/payroll/summary
// DESC:    Fetch active run and historical baseline run parameters 
// =========================================================
router.get("/summary", async (req, res) => {
  try {
    const { monthYear } = req.query;

    if (!monthYear) {
      return res.status(400).json({ success: false, message: "monthYear query parameter is required." });
    }

    const historicalRun = await PayrollHistory.findOne({ monthYear: monthYear.trim() });

    if (!historicalRun) {
      return res.status(404).json({ success: false, message: "No active cycle run found for this period." });
    }

    const targetPreviousToken = getPreviousMonthYearToken(monthYear.trim());
    let previousTotals = null;
    
    if (targetPreviousToken) {
      const pastMonthRun = await PayrollHistory.findOne({ monthYear: targetPreviousToken });
      if (pastMonthRun) {
        previousTotals = pastMonthRun.summaryTotals;
      }
    }

    res.status(200).json({
      _id: historicalRun._id,
      monthYear: historicalRun.monthYear,
      summaryTotals: historicalRun.summaryTotals,
      individualLineItems: historicalRun.individualLineItems,
      previousTotals: previousTotals 
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


// =========================================================
// ROUTE:   POST /api/payroll/run
// DESC:    Process calculation matrices and return comparative historical parameters
// =========================================================
router.post("/run", async (req, res) => {
  try {
    const { monthYear } = req.body; 

    if (!monthYear) {
      return res.status(400).json({ success: false, message: "monthYear field is required in request body." });
    }

    const normalizedMonthYear = monthYear.trim();

    // 1. Fetch only active personnel
    const activeEmployees = await Employee.find({ status: "Active" });

    if (activeEmployees.length === 0) {
      return res.status(400).json({ success: false, message: "No active employees found to process." });
    }

    // 2. Map through employees and calculate live balances
    const individualLineItems = activeEmployees.map(employee => {
      const calculations = calculateEmployeePayroll(employee);
      return {
        employeeId: employee._id, 
        name: `${employee.firstName} ${employee.lastName}`,
        jobTitle: employee.jobTitle,
        basicSalary: employee.compensation?.basicSalary || 0,
        ...calculations
      };
    });

    // 3. Reducer with multi-layer parsing fallback mechanics
    const summaryTotals = individualLineItems.reduce((acc, current) => {
      acc.totalGrossPay += current.grossPay || 0;
      acc.totalNetPay += current.netPay || 0;
      
      acc.totalPAYE += current.paye || current.deductions?.paye || 0;
      acc.totalNAPSA += current.napsa || current.deductions?.napsa || 0;
      acc.totalNHIMA += current.nhima || current.deductions?.nhima || 0;
      return acc;
    }, { totalGrossPay: 0, totalNetPay: 0, totalPAYE: 0, totalNAPSA: 0, totalNHIMA: 0 });

    const headcount = activeEmployees.length;

    // Apply currency precision configurations safely
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

    // 4. Atomic upsert into MongoDB
    const updatedHistory = await PayrollHistory.findOneAndUpdate(
      { monthYear: normalizedMonthYear },
      {
        monthYear: normalizedMonthYear,
        summaryTotals: finalSummary,
        individualLineItems
      },
      { new: true, upsert: true }
    );

    // 5. Build dynamic tracking historical lookup arrays
    const targetPreviousToken = getPreviousMonthYearToken(normalizedMonthYear);
    let previousTotals = null;
    
    if (targetPreviousToken) {
      const pastMonthRun = await PayrollHistory.findOne({ monthYear: targetPreviousToken });
      if (pastMonthRun) {
        previousTotals = pastMonthRun.summaryTotals;
      }
    }

    // ✨ System notification tracking code has been cleanly extricated from this scope.

    res.status(200).json({
      _id: updatedHistory._id,
      monthYear: updatedHistory.monthYear,
      summaryTotals: updatedHistory.summaryTotals,
      individualLineItems: updatedHistory.individualLineItems,
      previousTotals: previousTotals
    });

  } catch (error) {
    console.error("Critical Exception processing Calculation Engine Run:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;