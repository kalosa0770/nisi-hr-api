import express from 'express';
import mongoose from 'mongoose';
import Employee from "../models/Employee.js";
import Leave from "../models/Leave.js";

const router = express.Router();

// =========================================================
// 🗄️ LIGHTWEIGHT STATE REGISTRY SCHEMA
// =========================================================
const NotificationStateSchema = new mongoose.Schema({
  // Stores the original _id of the Employee, Leave, or Payroll document
  targetReferenceId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  status: { 
    type: String, 
    enum: ['active', 'archived', 'deleted'], 
    default: 'active' 
  }
}, { timestamps: true });

const NotificationState = mongoose.models.NotificationState || mongoose.model('NotificationState', NotificationStateSchema);

// Dynamically target model to avoid early evaluation initialization crashes
const getPayrollHistoryModel = () => mongoose.models.PayrollHistory;

// =========================================================
// ROUTE:   GET /api/notifications
// DESC:    Dynamically compute notification state engines from models
// =========================================================
router.get('/', async (req, res) => {
  try {
    const { date, month } = req.query;
    let matchStage = {};

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      matchStage.createdAt = { $gte: startOfDay, $lte: endOfDay };
    } else if (month) {
      const [year, monthIndex] = month.split('-');
      const startOfMonth = new Date(parseInt(year), parseInt(monthIndex) - 1, 1);
      const endOfMonth = new Date(parseInt(year), parseInt(monthIndex), 0, 23, 59, 59, 999);
      matchStage.createdAt = { $gte: startOfMonth, $lte: endOfMonth };
    }

    // Pipeline Stage: Looks up user view modifications (archived/deleted) 
    const lookupStateRegistryPipeline = [
      {
        $lookup: {
          from: 'notificationstates',
          localField: '_id',
          foreignField: 'targetReferenceId',
          as: 'userState'
        }
      },
      {
        $addFields: {
          stateDoc: { $arrayElemAt: ['$userState', 0] }
        }
      },
      // 🔒 Filter out items soft-deleted by the user
      {
        $match: {
          'stateDoc.status': { $ne: 'deleted' }
        }
      }
    ];

    // -----------------------------------------------------
    // STREAM 1: Employees -> "Employee Registration"
    // -----------------------------------------------------
    const employeeStream = await Employee.aggregate([
      { $match: matchStage },
      ...lookupStateRegistryPipeline,
      {
        $project: {
          _id: 1,
          type: { $literal: 'Employee Registration' },
          title: { $literal: 'New Employee Registered' },
          message: { 
            $concat: [
              'New profile system node provisioned for ', '$firstName', ' ', '$lastName', 
              ' assigned under corporate tracking identifier: ', { $ifNull: ['$employeeId', 'N/A'] }, '.'
            ] 
          },
          priority: { $literal: 'low' },
          read: { $eq: ['$stateDoc.status', 'archived'] },
          createdAt: 1
        }
      }
    ]);

    // -----------------------------------------------------
    // STREAM 2: Leaves -> "Audit"
    // -----------------------------------------------------
    const leaveStream = await Leave.aggregate([
      { $match: matchStage },
      ...lookupStateRegistryPipeline,
      {
        $project: {
          _id: 1,
          type: { $literal: 'Audit' },
          title: { $concat: ['Leave Request Status: ', '$status'] },
          message: { 
            $concat: [
              '$name', ' requested "', '$type', '" spanning ', 
              { $toString: '$days' }, ' business timeline units. Current verification state marked as: ', '$status', '.'
            ] 
          },
          priority: {
            $cond: { if: { $eq: ['$status', 'Pending'] }, then: 'medium', else: 'low' }
          },
          read: { $eq: ['$stateDoc.status', 'archived'] },
          createdAt: 1
        }
      }
    ]);

    // -----------------------------------------------------
    // STREAM 3: Payroll -> "System"
    // -----------------------------------------------------
    const PayrollHistory = getPayrollHistoryModel();
    let payrollStream = [];
    if (PayrollHistory) {
      payrollStream = await PayrollHistory.aggregate([
        { $match: matchStage },
        ...lookupStateRegistryPipeline,
        {
          $project: {
            _id: 1,
            type: { $literal: 'System' },
            title: { $concat: ['Payroll Compiled: ', '$monthYear'] },
            message: {
              $concat: [
                'Automated computational run executed safely for ', 
                { $toString: '$summaryTotals.headcount' }, 
                ' worker nodes. Gross allocation footprint: ZK ', 
                { $toString: '$summaryTotals.totalGrossPay' }
              ]
            },
            priority: { $literal: 'high' },
            read: { $eq: ['$stateDoc.status', 'archived'] },
            createdAt: 1
          }
        }
      ]);
    }

    // Combine streams and sort chronologically
    const dynamicFeedStream = [
      ...employeeStream,
      ...leaveStream,
      ...payrollStream
    ].sort((alpha, beta) => new Date(beta.createdAt) - new Date(alpha.createdAt));

    res.status(200).json(dynamicFeedStream);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =========================================================
// ROUTE:   PATCH /api/notifications/:id/read
// DESC:    Upsert an archive state for a dynamic document ID securely
// =========================================================
router.patch('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid notification structural id format.' });
    }

    // 🛠️ FIX: Correct instantiation using the 'new' keyword
    const objectId = new mongoose.Types.ObjectId(id);

    const updatedState = await NotificationState.findOneAndUpdate(
      { targetReferenceId: objectId },
      { $set: { status: 'archived' } },
      { upsert: true, new: true, runValidators: true }
    );

    return res.status(200).json({ success: true, state: updatedState });
  } catch (error) {
    // 🔒 GUARD: Intercept parallel double-click upsert duplicate key collisions (E11000)
    if (error.code === 11000 || error.message?.includes('E11000')) {
      const fallbackDoc = await NotificationState.findOne({ targetReferenceId: req.params.id });
      return res.status(200).json({ success: true, state: fallbackDoc, note: "Race conditions handled gracefully." });
    }

    console.error('Notification read patch failed:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// =========================================================
// ROUTE:   DELETE /api/notifications/:id
// DESC:    Upsert a hidden/deleted state parameter for an ID
// =========================================================
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid reference id format.' });
    }

    const objectId = new mongoose.Types.ObjectId(id);

    await NotificationState.findOneAndUpdate(
      { targetReferenceId: objectId },
      { status: 'deleted' },
      { upsert: true, new: true }
    );

    res.status(200).json({ success: true, message: "Log purged permanently from terminal feed." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =========================================================
// ROUTE:   POST /api/notifications/clear-read
// DESC:    Flush all current read entries into hidden states
// =========================================================
router.post('/clear-read', async (req, res) => {
  try {
    await NotificationState.updateMany(
      { status: 'archived' },
      { status: 'deleted' }
    );

    res.status(200).json({ success: true, message: "All read notification state references hidden." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;