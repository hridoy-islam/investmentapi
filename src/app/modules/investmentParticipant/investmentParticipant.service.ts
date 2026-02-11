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
import { currency } from "../types/currency";

const createInvestmentParticipantIntoDB = async (
  payload: TInvestmentParticipant,
) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { investorId, investmentId, amount, agentCommissionRate } = payload;

    if (!investorId || !investmentId || !amount) {
      throw new AppError(httpStatus.BAD_REQUEST, "Missing required fields");
    }

    const investment = await Investment.findById(investmentId).session(session);
    if (!investment) {
      throw new AppError(httpStatus.NOT_FOUND, "Investment not found");
    }

    const investor = await User.findById(investorId).session(session);
    if (!investor) {
      throw new AppError(httpStatus.NOT_FOUND, "Investor not found");
    }

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
    ]).session(session);

    const totalInvestedSoFar = aggregation[0]?.totalInvested || 0;
    // Ensure we handle potential string/number mismatch for projectAmount
    const projectCap = Number(investment.projectAmount);
    const remainingAmount = projectCap - totalInvestedSoFar;

    // ✅ Guard: Prevent over-investment
    if (amount > remainingAmount) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Investment failed. Only ${remainingAmount} remains. You are trying to invest ${amount}.`,
      );
    }

    // Check if participant already exists
    let participant = await InvestmentParticipant.findOne({
      investorId,
      investmentId,
    }).session(session);

    if (!participant) {
      // 🟢 Create new participant (Pass session array)
      const newParticipants = await InvestmentParticipant.create(
        [
          {
            ...payload,
            totalDue: amount,
            totalPaid: 0,
            agentCommissionRate,
            status: "active",
          },
        ],
        { session },
      );
      participant = newParticipants[0];

      const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"

      // Create Transaction Log
      await Transaction.create(
        [
          {
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
                note: `${investor.name} as investor has been added`,
                metadata: {
                  investorId,
                  investmentId,
                  investorName: investor.name,
                  investmentName: investment.title,
                  amount,
                },
              },
            ],
          },
        ],
        { session },
      );
    } else {
      // 🟡 Update existing participant
      participant.amount += amount;
      participant.totalDue += amount;
      await participant.save({ session });
    }

    await Investment.findByIdAndUpdate(
      investmentId,
      {
        $inc: { totalAmountPaid: amount }, // Increment by the new amount invested
      },
      { new: true, session },
    );

    await session.commitTransaction();
    session.endSession();

    return participant;
  } catch (error: any) {
    await session.abortTransaction();
    session.endSession();

    console.error("Error in createInvestmentParticipantIntoDB:", error);

    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to create or update InvestmentParticipant",
    );
  }
};

const getAllInvestmentParticipantFromDB = async (
  query: Record<string, unknown>,
) => {
  const InvestmentParticipantQuery = new QueryBuilder(
    InvestmentParticipant.find()
      .populate("investorId")
      .populate("investmentId"),
    query,
  )
    .search(InvestmentParticipantSearchableFields)
    .filter(query)
    .sort()
    .paginate()
    .fields();

  const meta = await InvestmentParticipantQuery.countTotal();
  const result = await InvestmentParticipantQuery.modelQuery;

  const updates: Promise<any>[] = [];

  for (const participant of result) {
    const investment = participant.investmentId as any;

    if (
      investment &&
      typeof participant.amount === "number" &&
      participant.amount > 0
    ) {
      const totalPaid = Number(investment.totalAmountPaid) || 0;
      const participantAmount = Number(participant.amount) || 0;

      let calculatedShare = 0;

      if (totalPaid === 0) {
        calculatedShare = 100;
      } else {
        calculatedShare = Number(
          ((participantAmount * 100) / totalPaid).toFixed(2),
        );
      }

      // Only update if value changed (optional optimization)
      if (participant.projectShare !== calculatedShare) {
        participant.projectShare = calculatedShare;

        updates.push(
          InvestmentParticipant.findByIdAndUpdate(
            (participant as any)._id,
            { projectShare: calculatedShare },
            { new: true },
          ),
        );
      }
    }
  }

  if (updates.length > 0) {
    await Promise.all(updates);
  }

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

// export const updateInvestmentParticipantIntoDB = async (
//   id: string,
//   payload: Partial<TInvestmentParticipant> // Ensure interface has projectShare if using TS types
// ) => {
//   const investmentParticipant = await InvestmentParticipant.findById(id);

//   if (!investmentParticipant) {
//     throw new AppError(httpStatus.NOT_FOUND, "InvestmentParticipant not found");
//   }

//   const hasAmount =
//     payload.amount !== undefined && typeof payload.amount === "number";

//   // Round payload.amount if present
//   if (hasAmount) {
//     payload.amount = Math.round((payload as any)?.amount * 100) / 100;
//   }

//   // Fetch Investment (Needed for validation AND share calculation)
//   const investment = await Investment.findById(
//     investmentParticipant.investmentId
//   );
//   if (!investment) {
//     throw new AppError(httpStatus.NOT_FOUND, "Investment not found");
//   }

//   // Guard: Check if adding amount would exceed project's projectAmount
//   if (hasAmount) {
//     const allParticipants = await InvestmentParticipant.find({
//       investmentId: investmentParticipant.investmentId,
//     });

//     const currentTotalInvested = allParticipants.reduce(
//       (total, participant) => total + participant.amount,
//       0
//     );

//     const participantCurrentAmount = investmentParticipant.amount;
//     const newTotalInvested =
//       currentTotalInvested - participantCurrentAmount + (payload as any).amount;

//     if (newTotalInvested > Number(investment.projectAmount)) {
//       throw new AppError(
//         httpStatus.BAD_REQUEST,
//         `Cannot invest £${payload.amount}. It would exceed the required £${investment.projectAmount}. Current invested: £${currentTotalInvested}`
//       );
//     }
//   }

//   // Update investment participant amounts
//   if (hasAmount) {
//     investmentParticipant.amount =
//       Math.round((investmentParticipant.amount + payload.amount!) * 100) / 100;
//     investmentParticipant.totalDue =
//       Math.round((investmentParticipant.totalDue + payload.amount!) * 100) / 100;

//     // ✅ NEW LOGIC: Recalculate Project Share based on CURRENT Amount Required
//     // This locks the percentage based on the investment size AT THE TIME of adding funds.
//     if (Number(investment.projectAmount) > 0) {
//       investmentParticipant.projectShare = Number(
//         ((investmentParticipant.amount / Number(investment.projectAmount)) * 100).toFixed(4) // Using 4 decimals for precision
//       );
//     }
//   }

//   // Round participant values
//   investmentParticipant.amount =
//     Math.round(investmentParticipant.amount * 100) / 100;
//   investmentParticipant.totalDue =
//     Math.round(investmentParticipant.totalDue * 100) / 100;

//   // Update paymentLog if amount changed
//   if (
//     hasAmount &&
//     payload.amount !== 0 && // Skip log if amount is 0
//     !(payload.status === "block" && payload.totalDue === 0)
//   ) {
//     // Fetch investor separately
//     const investor = await User.findById(investmentParticipant.investorId);
//     const investorName = investor ? investor.name : "Investor";

//     const monthlyTransaction = await Transaction.findOne({
//       investmentId: investmentParticipant.investmentId,
//       investorId: investmentParticipant.investorId,
//     });

//     if (monthlyTransaction) {
//       monthlyTransaction.paymentLog.push({
//         transactionType: "investmentUpdated",
//         dueAmount: 0,
//         paidAmount: 0,
//         status: "partial",
//         note: `${investorName} made an additional investment in the project. New Share: ${investmentParticipant.projectShare}%`,
//         metadata: {
//           amount: payload.amount,
//           newShare: investmentParticipant.projectShare
//         },
//       });

//       monthlyTransaction.status = "partial";

//       await monthlyTransaction.save();
//     }
//   }

//   // Apply other payload updates
//   for (const key in payload) {
//     if (key !== "amount") {
//       (investmentParticipant as any)[key] = (payload as any)[key];
//     }
//   }

//   // Handle project closure
//   if (
//     payload.status === "block" &&
//     payload.totalDue === 0 &&
//     payload.totalPaid &&
//     payload.totalPaid > 0
//   ) {
//     const investmentId = investmentParticipant.investmentId;
//     const investorId = investmentParticipant.investorId;

//     if (payload.amount !== undefined) {
//       investmentParticipant.amount = 0;
//       investmentParticipant.projectShare = 0; // ✅ Reset share on exit
//     }

//     const investor = await User.findById(investorId);

//     // Find all transactions for this investor & investment
//     const transactions = await Transaction.find({
//       investmentId,
//       investorId,
//     }).sort({ createdAt: 1 });

//     if (transactions && transactions.length > 0) {
//       const roundedPaid = Math.round(payload.totalPaid * 100) / 100;

//       // Step 1: Zero out all dues
//       for (const tx of transactions) {
//         tx.monthlyTotalDue = 0;
//       }

//       // Step 2: Add totalPaid to the last (most recent) transaction
//       const lastTx = transactions[transactions.length - 1];
//       lastTx.monthlyTotalPaid =
//         Math.round((lastTx.monthlyTotalPaid + roundedPaid) * 100) / 100;
//       lastTx.status = "paid";

//       // Step 3: Push closing log once
//       lastTx.paymentLog.push({
//         transactionType: "closeProject",
//         dueAmount: 0,
//         paidAmount: roundedPaid,
//         status: "paid",
//         note: "Project closed and fully paid",
//         metadata: {
//           investmentId,
//           investorId,
//           investorName: investor?.name || "Investor",
//           amount: roundedPaid,
//         },
//       });

//       // Save all updated transactions
//       await Promise.all(transactions.map((tx) => tx.save()));
//     }
//   }

//   const result = await investmentParticipant.save();
//   return result;
// };

export const updateInvestmentParticipantIntoDB = async (
  id: string,
  payload: Partial<TInvestmentParticipant>,
) => {
  const investmentParticipant = await InvestmentParticipant.findById(id);
  if (!investmentParticipant) {
    throw new AppError(httpStatus.NOT_FOUND, "InvestmentParticipant not found");
  }

  const hasAmount =
    payload.amount !== undefined && typeof payload.amount === "number";

  // Round payload.amount if present (treat as increment)
  if (hasAmount) {
    payload.amount = Math.round(payload.amount! * 100) / 100;
  }

  // Fetch Investment
  const investment = await Investment.findById(
    investmentParticipant.investmentId,
  );
  if (!investment) {
    throw new AppError(httpStatus.NOT_FOUND, "Investment not found");
  }
  const currencyType = investment.currencyType || "GBP";
  const currencySymbol =
    currency[currencyType as keyof typeof currency]?.symbol || "£";
  const projectAmount = Number(investment.projectAmount);

  // Validate if adding this increment would exceed project limit
  if (hasAmount) {
    const allParticipants = await InvestmentParticipant.find({
      investmentId: investment._id,
    });

    const currentTotalInvested = allParticipants.reduce(
      (total, participant) => total + participant.amount,
      0,
    );

    const newTotalInvested = currentTotalInvested + payload.amount!;

    if (newTotalInvested > projectAmount) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Cannot add ${currencySymbol}${payload.amount}. It would exceed the project limit of ${currencySymbol}${projectAmount}. Current total: £${currentTotalInvested}`,
      );
    }
  }

  // Update amounts if payload includes an increment
  if (hasAmount) {
    // 1️⃣ Update this participant amount
    investmentParticipant.amount =
      Math.round((investmentParticipant.amount + payload.amount!) * 100) / 100;

    investmentParticipant.totalDue =
      Math.round((investmentParticipant.totalDue + payload.amount!) * 100) /
      100;

    await investmentParticipant.save();

    // 2️⃣ Get all participants of this investment
    const participants = await InvestmentParticipant.find({
      investmentId: investment._id,
    });

    // 3️⃣ Recalculate total paid dynamically
    const newTotalPaid = participants.reduce(
      (sum, p) => sum + (p.amount || 0),
      0,
    );

    // 4️⃣ Update investment totalAmountPaid
    investment.totalAmountPaid = newTotalPaid;
    await investment.save();

    // 5️⃣ Recalculate share for ALL participants
    const shareUpdates = participants.map((p) => {
      const newShare =
        newTotalPaid > 0
          ? parseFloat(((p.amount / newTotalPaid) * 100).toFixed(2))
          : 0;

      return InvestmentParticipant.findByIdAndUpdate(p._id, {
        projectShare: newShare,
      });
    });

    await Promise.all(shareUpdates);
  }

  // Apply non-amount fields from payload
  for (const key in payload) {
    if (key !== "amount") {
      (investmentParticipant as any)[key] = (payload as any)[key];
    }
  }

  // Log investment update (only for positive increments, not closures)
  if (
    hasAmount &&
    payload.amount! > 0 &&
    !(payload.status === "block" && payload.totalDue === 0)
  ) {
    const investor = await User.findById(investmentParticipant.investorId);
    const investorName = investor?.name || "Investor";

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
        note: `${investorName} made an additional investment in the project.`,
        metadata: {
          amount: payload.amount,
          newShare: investmentParticipant.projectShare,
        },
      });

      monthlyTransaction.status = "partial";
      await monthlyTransaction.save();
    }
  }

  // Handle project closure
  if (
    payload.status === "block" &&
    payload.totalDue === 0 &&
    payload.totalPaid !== undefined &&
    payload.totalPaid > 0
  ) {
    const investmentId = investmentParticipant.investmentId;
    const investorId = investmentParticipant.investorId;

    // Reset financials on exit
    investmentParticipant.amount = 0;
    investmentParticipant.projectShare = 0;

    const investor = await User.findById(investorId);
    const transactions = await Transaction.find({
      investmentId,
      investorId,
    }).sort({ createdAt: 1 });

    if (transactions.length > 0) {
      const roundedPaid = Math.round(payload.totalPaid * 100) / 100;

      // Zero out all dues
      for (const tx of transactions) {
        tx.monthlyTotalDue = 0;
      }

      // Add payout to last transaction
      const lastTx = transactions[transactions.length - 1];
      lastTx.monthlyTotalPaid =
        Math.round((lastTx.monthlyTotalPaid + roundedPaid) * 100) / 100;
      lastTx.status = "paid";

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

      await Promise.all(transactions.map((tx) => tx.save()));
    }
  }

  // Final rounding before save
  investmentParticipant.amount =
    Math.round(investmentParticipant.amount * 100) / 100;
  investmentParticipant.totalDue =
    Math.round(investmentParticipant.totalDue * 100) / 100;

  const result = await investmentParticipant.save();
  return result;
};

export const InvestmentParticipantServices = {
  getAllInvestmentParticipantFromDB,
  getSingleInvestmentParticipantFromDB,
  updateInvestmentParticipantIntoDB,
  createInvestmentParticipantIntoDB,
};
