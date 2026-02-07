import mongoose, { Schema, model, Types } from "mongoose";


export const PaymentLogSchema = new Schema(
  {
    transactionType: {
      type: String,
      enum: ["investment","investmentUpdated", "profitPayment","closeProject","commissionPayment"],
      required: true,
    },
    dueAmount: { type: Number, required: true },
    paidAmount: { type: Number, required: true },
    status: {
      type: String,
      enum: ["due", "partial", "paid"],
      required: true,
    },
     metadata: { type: Schema.Types.Mixed },
    note: { type: String },
  },
  { timestamps: true }
);

export const TransactionLogSchema = new Schema(
  {
        _id: { type: Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },

    type: {
      type: String,
      enum: [
        "investmentAdded",
        "investmentUpdated",
        "profitDistributed",
        "projectClosed",
        "adminCostDeclared",
        "saleDeclared",
        "commissionCalculated",
        "paymentMade",
        "commissionPaymentMade",
        "grossProfit",
        "netProfit",
        "installment"
      ],
      required: true,
    },
    message: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now },
  },

);




const MonthlyTransactionSchema = new Schema(
  {
    month: { type: String, required: true }, 

    investorId: { type: Types.ObjectId, ref: "User" },
    investmentId: { type: Types.ObjectId, ref: "Investment", required: true },

    profit: { type: Number, required: true },

    monthlyTotalDue: { type: Number,default: 0, required: true },
    monthlyTotalPaid: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["due", "partial", "paid"],
      default: "due",
    },

    paymentLog: {
      type: [PaymentLogSchema],
      default: [],
    },

    logs: {
      type: [TransactionLogSchema],
      default: [],
    },
  },
  { timestamps: true }
);

export const Transaction = model("MonthlyTransactions", MonthlyTransactionSchema);
