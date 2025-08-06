import httpStatus from "http-status";
import QueryBuilder from "../../builder/QueryBuilder";

import AppError from "../../errors/AppError";

import { Investment } from "./investment.model";
import { TInvestment } from "./investment.interface";
import { InvestmentSearchableFields } from "./investment.constant";
import { Transaction } from "../transactions/transactions.model";
import { InvestmentParticipant } from "../investmentParticipant/investmentParticipant.model";
import moment from "moment";
import { User } from "../user/user.model";
import mongoose from "mongoose";
import { AgentCommission } from "../agent-commission/agent-commission.model";
import { AgentTransaction } from "../agent-transactions/agent-transactions.model";

const createInvestmentIntoDB = async (payload: TInvestment) => {
  try {
    const result = await Investment.create(payload);
    return result;
  } catch (error: any) {
    console.error("Error in createInvestmentIntoDB:", error);

    // Throw the original error or wrap it with additional context
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to create Category"
    );
  }
};

const getAllInvestmentFromDB = async (query: Record<string, unknown>) => {
  const InvestmentQuery = new QueryBuilder(Investment.find(), query)
    .search(InvestmentSearchableFields)
    .filter(query)
    .sort()
    .paginate()
    .fields();

  const meta = await InvestmentQuery.countTotal();
  const result = await InvestmentQuery.modelQuery;

  return {
    meta,
    result,
  };
};

const getSingleInvestmentFromDB = async (id: string) => {
  const result = await Investment.findById(id);
  return result;
};

type TUpdateInvestmentPayload = Partial<TInvestment> & {
  saleAmount?: number;
  adminCostRate?: number;
  saleOperationId?: string;
};

export const updateInvestmentIntoDB = async (
  id: string,
  payload: TUpdateInvestmentPayload
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const investment = await Investment.findById(id).session(session);
    if (!investment) {
      throw new AppError(httpStatus.NOT_FOUND, "Investment not found");
    }

    if (payload?.saleAmount && isNaN(payload.saleAmount)) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid saleAmount");
    }

    const updates: Partial<TInvestment> = {};
    let logMessage = "";
    let updatedAmountRequired: number | undefined;

    // Handle amountRequired update
    // if (payload.amountRequired) {
    //   const previousAmount = investment.amountRequired;
    //   updatedAmountRequired = Number(
    //     (previousAmount + payload.amountRequired).toFixed(2)
    //   );
    //   updates.amountRequired = updatedAmountRequired;
    //   logMessage = `Investment Raised capital`;
    // }

    if (
  payload.amountRequired !== undefined &&
  !payload.saleAmount
) {
  if (payload.isCapitalRaise) {
    const previousAmount = investment.amountRequired;
    updatedAmountRequired = Number(
      (Number(previousAmount) + Number(payload.amountRequired)).toFixed(2)
    );
    updates.amountRequired = updatedAmountRequired;
    logMessage = `Investment Raised capital`;
  } else {
    updates.amountRequired = payload.amountRequired;
  }
}


    // Handle saleAmount and profit distribution
    if (payload.saleAmount) {
      const saleAmount = Number(payload.saleAmount.toFixed(2));
      const initialInvestment = Number(investment.amountRequired.toFixed(2));
      const grossProfit = Number((saleAmount - initialInvestment).toFixed(2));

      const adminCostRate = investment.adminCost || 0;
      const adminCost = Number(
        (grossProfit * (adminCostRate / 100)).toFixed(2)
      );
      const netProfit = Number((grossProfit - adminCost).toFixed(2));

      const currentMonth = moment().format("YYYY-MM");
      const now = new Date();

      // Step 1: First create just the CMV/SALE log
      const cmvLog = {
        type: "saleDeclared",
        message: `CMV / SALE`,
        metadata: {
          amount: saleAmount,
        },
        createdAt: new Date(now.getTime() + 1),
      };

      // Create or find global transaction
      let globalTransaction = await Transaction.findOne({
        investmentId: id,
        investorId: null,
        month: currentMonth,
      }).session(session);

      if (!globalTransaction) {
        globalTransaction = new Transaction({
          investmentId: id,
          investorId: null,
          month: currentMonth,
          profit: 0,
          monthlyTotalDue: 0,
          monthlyTotalPaid: 0,
          status: "due",
          logs: [cmvLog],
        });
      } else {
        globalTransaction.logs.push(cmvLog);
      }

      // Save to get the actual _id for the cmvLog
      await globalTransaction.save({ session });

      // Reload to get the generated _id for the log
      globalTransaction = await Transaction.findById(
        globalTransaction._id
      ).session(session);
      if (!globalTransaction) {
        throw new AppError(
          httpStatus.INTERNAL_SERVER_ERROR,
          "Global transaction not found after saving CMV log"
        );
      }
      const savedCmvLog =
        globalTransaction.logs[globalTransaction.logs.length - 1];

      // Step 2: Now create Gross Profit log with reference to CMV log
      const grossProfitLog = {
        type: "grossProfit",
        message: `Gross Profit for sale (RefID: ${savedCmvLog._id})`,
        metadata: {
          amount: grossProfit,
          saleAmount: saleAmount,
          refId: savedCmvLog._id,
        },
        createdAt: new Date(now.getTime() + 2),
      };

      if (!globalTransaction) {
        throw new AppError(
          httpStatus.INTERNAL_SERVER_ERROR,
          "Global transaction not found when adding gross profit log"
        );
      }
      globalTransaction.logs.push(grossProfitLog);
      await globalTransaction.save({ session });

      // Reload to get the generated _id for the grossProfitLog
      globalTransaction = await Transaction.findById(
        globalTransaction._id
      ).session(session);
      if (!globalTransaction) {
        throw new AppError(
          httpStatus.INTERNAL_SERVER_ERROR,
          "Global transaction not found after saving gross profit log"
        );
      }
      const savedGrossProfitLog =
        globalTransaction.logs[globalTransaction.logs.length - 1];

      // Step 3: Create Admin Cost log with reference to Gross Profit log
      const adminCostLog = {
        type: "adminCostDeclared",
        message: `Admin Cost ${adminCostRate}% for ${investment.title} (RefID: ${savedGrossProfitLog._id})`,
        metadata: {
          investmentId: id,
          adminCostRate,
          amount: adminCost,
          cmv: saleAmount,
          refId: savedGrossProfitLog._id,
        },
        createdAt: new Date(now.getTime() + 3),
      };

      let savedAdminCostLog: any = null;

      if (globalTransaction) {
        globalTransaction.logs.push(adminCostLog);
        await globalTransaction.save({ session });

        globalTransaction = await Transaction.findById(
          globalTransaction._id
        ).session(session);
        if (!globalTransaction) {
          throw new AppError(
            httpStatus.INTERNAL_SERVER_ERROR,
            "Global transaction not found after saving admin cost log"
          );
        }

        savedAdminCostLog =
          globalTransaction.logs[globalTransaction.logs.length - 1];
      } else {
        throw new AppError(
          httpStatus.INTERNAL_SERVER_ERROR,
          "Global transaction not found when adding admin cost log"
        );
      }

      // Step 4: Create Net Profit log with reference to Admin Cost log
      const netProfitLog = {
        type: "netProfit",
        message: `Net Profit Allocated for ${investment.title}(RefID: ${savedAdminCostLog._id})`,
        metadata: {
          amount: netProfit,
          refId: savedAdminCostLog._id,
        },
        createdAt: new Date(now.getTime() + 4),
      };

      globalTransaction.logs.push(netProfitLog);
      await globalTransaction.save({ session });

      // Reload to get the generated _id for the netProfitLog
      globalTransaction = await Transaction.findById(
        globalTransaction._id
      ).session(session);
      if (!globalTransaction) {
        throw new AppError(
          httpStatus.INTERNAL_SERVER_ERROR,
          "Global transaction not found after saving net profit log"
        );
      }
      const savedNetProfitLog =
        globalTransaction.logs[globalTransaction.logs.length - 1];

      // Process participants with proper log references
      const participants = await InvestmentParticipant.find({
        investmentId: id,
        status: "active",
      }).session(session);

      const participantUpdates = [];
      const investorTxnPromises = [];
      const agentTxnPromises = [];

      for (const participant of participants) {
        const investorSharePercent = Number(((100 * participant.amount) / initialInvestment).toFixed(2));
        const investorNetProfit = Number(
          ((netProfit * investorSharePercent) / 100).toFixed(2)
        );

        participant.totalDue = Number(
          (participant.totalDue + investorNetProfit).toFixed(2)
        );

        const investmentMonth = moment(participant.createdAt).format("YYYY-MM");
        const lastUpdateMonth = participant.amountLastUpdatedAt
          ? moment(participant.amountLastUpdatedAt).format("YYYY-MM")
          : null;

        const shouldUpdateAmount =
          currentMonth !== investmentMonth && currentMonth !== lastUpdateMonth;
        if (shouldUpdateAmount) {
          participant.amount = Number(participant.totalDue.toFixed(2));
          participant.amountLastUpdatedAt = new Date();
        }
        participantUpdates.push(participant.save({ session }));

        const investor = await User.findById(participant.investorId)
          .session(session)
          .lean();
        const investorName = investor?.name || "Investor";

        const profitLog = {
          type: "profitDistributed",
          message: `Profit Distributed to ${investorName} for ${investorSharePercent}% share`,
          metadata: {
            netProfit,
            amount: investorNetProfit,
            sharePercentage: investorSharePercent,
            investorName,
            refId: savedNetProfitLog._id,
          },
          createdAt: new Date(),
        };

        let investorTxn = await Transaction.findOne({
          investmentId: id,
          investorId: participant.investorId,
          month: currentMonth,
        }).session(session);

        if (!investorTxn) {
          investorTxn = new Transaction({
            investmentId: id,
            investorId: participant.investorId,
            month: currentMonth,
            profit: investorNetProfit,
            monthlyTotalDue: investorNetProfit,
            monthlyTotalPaid: 0,
            monthlyTotalAgentDue: 0,
            monthlyTotalAgentPaid: 0,
            status: "due",
            logs: [profitLog],
          });
        } else {
          investorTxn.logs.push(profitLog);
          investorTxn.profit = Number(
            (investorTxn.profit + investorNetProfit).toFixed(2)
          );
          investorTxn.monthlyTotalDue = Number(
            (investorTxn.monthlyTotalDue + investorNetProfit).toFixed(2)
          );

          investorTxn.status = "partial";
        }
        investorTxnPromises.push(investorTxn.save({ session }));

        // Agent Commission Logic
        if (investor?.agent && participant.agentCommissionRate > 0) {
          const agent = await User.findById(investor.agent)
            .session(session)
            .lean();
          if (agent) {
            const agentCommissionRate = participant.agentCommissionRate;
            const commissionBase =
              grossProfit * (investorSharePercent / 100) - investorNetProfit;
            const commission = Number(
              (commissionBase * (agentCommissionRate / 100)).toFixed(2)
            );

            if (commission > 0) {
              const commissionLog = {
                type: "commissionCalculated",
                message: `Commission distributed to Agent ${agent.name} for ${investorName}'s profit`,
                metadata: {
                  agentId: agent._id,
                  agentName: agent.name,
                  investorId: investor._id,
                  investorName,
                  amount: commission,
                  investorSharePercent,
                  investorNetProfit,
                  investmentId: id,
                  investmentName: investment.title,
                  refId: savedNetProfitLog._id,
                },
                createdAt: new Date(),
              };

              let agentTxn = await AgentTransaction.findOne({
                investmentId: id,
                investorId: investor._id,
                agentId: agent._id,
                month: currentMonth,
              }).session(session);

              if (!agentTxn) {
                agentTxn = new AgentTransaction({
                  investmentId: id,
                  investorId: investor._id,
                  agentId: agent._id,
                  month: currentMonth,
                  commissionDue: commission,
                  profit: commission,
                  commissionPaid: 0,
                  status: "due",
                  logs: [commissionLog],
                  paymentLog: [],
                });
              } else {
                agentTxn.logs.push(commissionLog);
                // Update due and profit
                agentTxn.commissionDue = Number(
                  (agentTxn.commissionDue + commission).toFixed(2)
                );
                agentTxn.profit = Number(
                  ((agentTxn.profit || 0) + commission).toFixed(2)
                );

                // Recalculate status properly after due is updated
                if (agentTxn.commissionDue === 0) {
                  agentTxn.status = "paid";
                } else if (agentTxn.commissionPaid === 0) {
                  agentTxn.status = "due";
                } else {
                  agentTxn.status = "partial";
                }
              }

              // ✅ Ensure commission log is also pushed to investor transaction
              let investorTransaction = await Transaction.findOne({
                investmentId: id,
                investorId: investor._id,
                month: currentMonth,
              }).session(session);

              if (investorTransaction) {
                investorTransaction.logs.push({
                  ...commissionLog,
                  createdAt: new Date(), // ensure consistent timestamps
                });

                investorTxnPromises.push(investorTransaction.save({ session }));
              }

              // ✅ Save the agentTxn as part of the same batch
              agentTxnPromises.push(agentTxn.save({ session }));

              // ✅ Save/update agentSummary
              let agentSummary = await AgentCommission.findOne({
                agentId: agent._id,
                investorId: investor._id,
              }).session(session);

              if (!agentSummary) {
                agentSummary = new AgentCommission({
                  agentId: agent._id,
                  investorId: investor._id,
                  totalCommissionDue: commission,
                  totalCommissionPaid: 0,
                });
              } else {
                agentSummary.totalCommissionDue = Number(
                  (agentSummary.totalCommissionDue + commission).toFixed(2)
                );
              }
              await agentSummary.save({ session });
            }
          }
        }
      }

      await Promise.all([
        ...participantUpdates,
        ...investorTxnPromises,
        ...agentTxnPromises,
      ]);
    }

    if (logMessage) {
      const currentMonth = moment().format("YYYY-MM");
      const logEntry = {
        type: "investmentUpdated",
        message: logMessage,
        metadata: {
          amount: payload.amountRequired,
          UpdateAmount: updatedAmountRequired,
        },
        createdAt: new Date(),
      };

      let logTransaction = await Transaction.findOne({
        investmentId: id,
        investorId: null,
        month: currentMonth,
      }).session(session);

      if (logTransaction) {
        logTransaction.logs.push(logEntry);
      } else {
        logTransaction = new Transaction({
          investmentId: id,
          investorId: null,
          month: currentMonth,
          profit: 0,
          monthlyTotalDue: 0,
          monthlyTotalPaid: 0,
          status: "due",
          logs: [logEntry],
        });
      }
      await logTransaction.save({ session });
    }

    const updatableFields = [
      "status",
      "saleAmount",
      "adminCost",
      "details",
      "title",
      "image",
      "documents",
    ];
    for (const field of updatableFields) {
      if (field in payload && payload[field] !== undefined) {
        updates[field] = payload[field];
      }
    }

    const updatedInvestment = await Investment.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
      session,
    });

    await session.commitTransaction();
    return updatedInvestment;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

export const InvestmentServices = {
  getAllInvestmentFromDB,
  getSingleInvestmentFromDB,
  updateInvestmentIntoDB,
  createInvestmentIntoDB,
};
