import httpStatus from "http-status";
import QueryBuilder from "../../builder/QueryBuilder";

import AppError from "../../errors/AppError";
import { TInvestmentParticipant } from "./investmentParticipant.interface";
import moment from "moment";
import { InvestmentParticipant } from "./investmentParticipant.model";
import { InvestmentParticipantSearchableFields } from "./investmentParticipant.constant";
import { Transaction } from "../transactions/transactions.model";
import { Investment } from "../investment/investment.model";
import mongoose from "mongoose";
import { User } from "../user/user.model";

const createInvestmentParticipantIntoDB = async (
  payload: TInvestmentParticipant
) => {
  try {
    const { investorId, investmentId, amount, agentCommissionRate } = payload;

    if (!investorId || !investmentId || !amount) {
      throw new AppError(httpStatus.BAD_REQUEST, "Missing required fields");
    }

    // ✅ Get the investment/project
    const investment = await Investment.findById(investmentId);
    if (!investment) {
      throw new AppError(httpStatus.NOT_FOUND, "Investment not found");
    }

    const investor = await User.findById(investorId);
    if (!investor) {
      throw new AppError(httpStatus.NOT_FOUND, "Investor not found");
    }

    // ✅ Calculate total invested so far in this project
    const aggregation = await InvestmentParticipant.aggregate([
      {
        $match: {
          investmentId: new mongoose.Types.ObjectId(investmentId),
        },
      },
      {
        $group: {
          _id: null,
          totalInvested: { $sum: "$amount" },
        },
      },
    ]);

    const totalInvestedSoFar = aggregation[0]?.totalInvested || 0;
    const remainingAmount =
      Number(investment.amountRequired) - totalInvestedSoFar;

    // ✅ Guard: Prevent over-investment
    if (amount > remainingAmount) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Only £${remainingAmount} left to invest in this project`
      );
    }

    // Check if participant already exists
    let participant = await InvestmentParticipant.findOne({
      investorId,
      investmentId,
    });

    if (!participant) {
      // Create new participant
      participant = await InvestmentParticipant.create({
        ...payload,
        totalDue: amount,
        totalPaid: 0,
        agentCommissionRate,
        status: "active",
      });

      const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"

      await Transaction.create({
        month: currentMonth,
        investorId,
        investmentId,
        profit: 0,
        monthlyTotalDue: 0,
        monthlyTotalPaid: 0,
        status: "due",
        paymentLog: [
          {
            transactionType: "investment",
            dueAmount: amount,
            paidAmount: 0,
            status: "due",
            note: `Initial investment added.`,
            metadata: {
              investorId,
              investmentId,
              investorName: investor.name,
              investmenName: investment.title,
              amount,
            },
          },
        ],
      });
    } else {
      // Updating an existing participant
      participant.amount += amount;
      participant.totalDue += amount;
      await participant.save();
    }

    return participant;
  } catch (error: any) {
    console.error("Error in createOrUpdateInvestmentParticipant:", error);

    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to create or update InvestmentParticipant"
    );
  }
};

const getAllInvestmentParticipantFromDB = async (
  query: Record<string, unknown>
) => {
  const InvestmentParticipantQuery = new QueryBuilder(
    InvestmentParticipant.find()
      .populate("investorId")
      .populate("investmentId"),
    query
  )
    .search(InvestmentParticipantSearchableFields)
    .filter(query)
    .sort()
    .paginate()
    .fields();

  const meta = await InvestmentParticipantQuery.countTotal();
  const result = await InvestmentParticipantQuery.modelQuery;

  return {
    meta,
    result,
  };
};

const getSingleInvestmentParticipantFromDB = async (id: string) => {
  const result = await InvestmentParticipant.findById(id)
    .populate("investorId")
    .populate("investmentId");
  return result;
};

const updateInvestmentParticipantIntoDB = async (
  id: string,
  payload: Partial<TInvestmentParticipant>
) => {
  const investmentParticipant = await InvestmentParticipant.findById(id);

  if (!investmentParticipant) {
    throw new AppError(httpStatus.NOT_FOUND, "InvestmentParticipant not found");
  }

  const hasAmount =
    payload.amount !== undefined && typeof payload.amount === "number";
  const hasAgentCommissionRate = payload.agentCommissionRate !== undefined;

  // Round payload.amount if present
  if (hasAmount) {
    payload.amount = Math.round((payload as any)?.amount * 100) / 100;
  }

  // Guard: Check if adding amount would exceed project's amountRequired
  if (hasAmount) {
    const investment = await Investment.findById(
      investmentParticipant.investmentId
    );
    if (!investment) {
      throw new AppError(httpStatus.NOT_FOUND, "Investment not found");
    }

    const allParticipants = await InvestmentParticipant.find({
      investmentId: investmentParticipant.investmentId,
    });

    const currentTotalInvested = allParticipants.reduce(
      (total, participant) => total + participant.amount,
      0
    );

    const participantCurrentAmount = investmentParticipant.amount;
    const newTotalInvested =
      currentTotalInvested - participantCurrentAmount + (payload as any).amount;

    if (newTotalInvested > Number(investment.amountRequired)) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Cannot invest £${payload.amount}. It would exceed the required £${investment.amountRequired}. Current invested: £${currentTotalInvested}`
      );
    }
  }

  const previousAmount = investmentParticipant.amount;

  // Update investment participant amounts
  if (hasAmount) {
    investmentParticipant.amount =
      Math.round((investmentParticipant.amount + payload.amount!) * 100) / 100;
    investmentParticipant.totalDue =
      Math.round((investmentParticipant.totalDue + payload.amount!) * 100) /
      100;
  }

  // Round participant values
  investmentParticipant.amount =
    Math.round(investmentParticipant.amount * 100) / 100;
  investmentParticipant.totalDue =
    Math.round(investmentParticipant.totalDue * 100) / 100;

  // Update paymentLog if amount changed
  if (
    hasAmount &&
    payload.amount !== 0 && // Skip log if amount is 0
    !(payload.status === "block" && payload.totalDue === 0)
  ) {
    const updatedAmount = investmentParticipant.amount;

    // Fetch investor separately
    const investor = await User.findById(investmentParticipant.investorId);
    const investorName = investor ? investor.name : "Investor";

    const monthlyTransaction = await Transaction.findOne({
      investmentId: investmentParticipant.investmentId,
      investorId: investmentParticipant.investorId,
    });

    if (monthlyTransaction) {
      monthlyTransaction.paymentLog.push({
        transactionType: "investmentUpdated",
        dueAmount: 0,
        paidAmount: 0,
        status: "partial",
        note: `${investorName} made an additional investment in the project`,
        metadata: { amount: payload.amount },
      });

      monthlyTransaction.status = "partial";

      await monthlyTransaction.save();
    }
  }

  // Apply other payload updates
  for (const key in payload) {
    if (key !== "amount") {
      (investmentParticipant as any)[key] = (payload as any)[key];
    }
  }

  // Handle project closure
  if (
  payload.status === "block" &&
  payload.totalDue === 0 &&
  payload.totalPaid &&
  payload.totalPaid > 0
) {
  const investmentId = investmentParticipant.investmentId;
  const investorId = investmentParticipant.investorId;

  if (payload.amount !== undefined) {
    investmentParticipant.amount = 0;
  }

  const investor = await User.findById(investorId);

  // Find all transactions for this investor & investment
  const transactions = await Transaction.find({
    investmentId,
    investorId,
  }).sort({ createdAt: 1 }); // Ensure chronological order

  if (transactions && transactions.length > 0) {
    const roundedPaid = Math.round(payload.totalPaid * 100) / 100;

    // Step 1: Zero out all dues
    for (const tx of transactions) {
      tx.monthlyTotalDue = 0;
    }

    // Step 2: Add totalPaid to the last (most recent) transaction
    const lastTx = transactions[transactions.length - 1];
    lastTx.monthlyTotalPaid =
      Math.round((lastTx.monthlyTotalPaid + roundedPaid) * 100) / 100;
    lastTx.status = "paid";

    // Step 3: Push closing log once
    lastTx.paymentLog.push({
      transactionType: "closeProject",
      dueAmount: 0,
      paidAmount: roundedPaid,
      status: "paid",
      note: "Project closed and fully paid",
      metadata: {
        investmentId,
        investorId,
        investorName: investor?.name || "Investor",
        amount: roundedPaid,
      },
    });

    // Save all updated transactions
    await Promise.all(transactions.map((tx) => tx.save()));
  }
}

  const result = await investmentParticipant.save();
  return result;
};

export const InvestmentParticipantServices = {
  getAllInvestmentParticipantFromDB,
  getSingleInvestmentParticipantFromDB,
  updateInvestmentParticipantIntoDB,
  createInvestmentParticipantIntoDB,
};
