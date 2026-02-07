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
import { currency } from "../types/currency";

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


// export const updateInvestmentIntoDB = async (
//   id: string,
//   payload: TUpdateInvestmentPayload
// ) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const investment = await Investment.findById(id).session(session);
//     if (!investment) {
//       throw new AppError(httpStatus.NOT_FOUND, "Investment not found");
//     }

//     if (payload?.saleAmount && isNaN(payload.saleAmount)) {
//       throw new AppError(httpStatus.BAD_REQUEST, "Invalid saleAmount");
//     }

//     const updates: Partial<TInvestment> = {};
//     let logMessage = "";
//     let updatedprojectAmount: number | undefined;

//     // Handle projectAmount update
//     // if (payload.projectAmount) {
//     //   const previousAmount = investment.projectAmount;
//     //   updatedprojectAmount = Number(
//     //     (previousAmount + payload.projectAmount).toFixed(2)
//     //   );
//     //   updates.projectAmount = updatedprojectAmount;
//     //   logMessage = `Investment Raised capital`;
//     // }

//     if (
//   payload.projectAmount !== undefined &&
//   !payload.saleAmount
// ) {
//   if (payload.isCapitalRaise) {
//     const previousAmount = investment.projectAmount;
//     updatedprojectAmount = Number(
//       (Number(previousAmount) + Number(payload.projectAmount)).toFixed(2)
//     );
//     updates.projectAmount = updatedprojectAmount;
//     logMessage = `Investment Raised capital`;
//   } else {
//     updates.projectAmount = payload.projectAmount;
//   }
// }


//     // Handle saleAmount and profit distribution
//     if (payload.saleAmount) {
//       const saleAmount = Number(payload.saleAmount.toFixed(2));
//       const initialInvestment = Number(investment.projectAmount.toFixed(2));
//       const grossProfit = Number((saleAmount - initialInvestment).toFixed(2));

//       const adminCostRate = investment.adminCost || 0;
//       const adminCost = Number(
//         (grossProfit * (adminCostRate as any / 100)).toFixed(2)
//       );
//       const netProfit = Number((grossProfit - adminCost).toFixed(2));

//       const currentMonth = moment().format("YYYY-MM");
//       const now = new Date();

//       // Step 1: First create just the CMV/SALE log
//       const cmvLog = {
//         type: "saleDeclared",
//         message: `CMV / SALE`,
//         metadata: {
//           amount: saleAmount,
//         },
//         createdAt: new Date(now.getTime() + 1),
//       };

//       // Create or find global transaction
//       let globalTransaction = await Transaction.findOne({
//         investmentId: id,
//         investorId: null,
//         month: currentMonth,
//       }).session(session);

//       if (!globalTransaction) {
//         globalTransaction = new Transaction({
//           investmentId: id,
//           investorId: null,
//           month: currentMonth,
//           profit: 0,
//           monthlyTotalDue: 0,
//           monthlyTotalPaid: 0,
//           status: "due",
//           logs: [cmvLog],
//         });
//       } else {
//         globalTransaction.logs.push(cmvLog);
//       }

//       // Save to get the actual _id for the cmvLog
//       await globalTransaction.save({ session });

//       // Reload to get the generated _id for the log
//       globalTransaction = await Transaction.findById(
//         globalTransaction._id
//       ).session(session);
//       if (!globalTransaction) {
//         throw new AppError(
//           httpStatus.INTERNAL_SERVER_ERROR,
//           "Global transaction not found after saving CMV log"
//         );
//       }
//       const savedCmvLog =
//         globalTransaction.logs[globalTransaction.logs.length - 1];

//       // Step 2: Now create Gross Profit log with reference to CMV log
//       const grossProfitLog = {
//         type: "grossProfit",
//         message: `Gross Profit for sale (RefID: ${savedCmvLog._id})`,
//         metadata: {
//           amount: grossProfit,
//           saleAmount: saleAmount,
//           refId: savedCmvLog._id,
//         },
//         createdAt: new Date(now.getTime() + 2),
//       };

//       if (!globalTransaction) {
//         throw new AppError(
//           httpStatus.INTERNAL_SERVER_ERROR,
//           "Global transaction not found when adding gross profit log"
//         );
//       }
//       globalTransaction.logs.push(grossProfitLog);
//       await globalTransaction.save({ session });

//       // Reload to get the generated _id for the grossProfitLog
//       globalTransaction = await Transaction.findById(
//         globalTransaction._id
//       ).session(session);
//       if (!globalTransaction) {
//         throw new AppError(
//           httpStatus.INTERNAL_SERVER_ERROR,
//           "Global transaction not found after saving gross profit log"
//         );
//       }
//       const savedGrossProfitLog =
//         globalTransaction.logs[globalTransaction.logs.length - 1];

//       // Step 3: Create Admin Cost log with reference to Gross Profit log
//       const adminCostLog = {
//         type: "adminCostDeclared",
//         message: `Admin Cost ${adminCostRate}% for ${investment.title} (RefID: ${savedGrossProfitLog._id})`,
//         metadata: {
//           investmentId: id,
//           adminCostRate,
//           amount: adminCost,
//           cmv: saleAmount,
//           refId: savedGrossProfitLog._id,
//         },
//         createdAt: new Date(now.getTime() + 3),
//       };

//       let savedAdminCostLog: any = null;

//       if (globalTransaction) {
//         globalTransaction.logs.push(adminCostLog);
//         await globalTransaction.save({ session });

//         globalTransaction = await Transaction.findById(
//           globalTransaction._id
//         ).session(session);
//         if (!globalTransaction) {
//           throw new AppError(
//             httpStatus.INTERNAL_SERVER_ERROR,
//             "Global transaction not found after saving admin cost log"
//           );
//         }

//         savedAdminCostLog =
//           globalTransaction.logs[globalTransaction.logs.length - 1];
//       } else {
//         throw new AppError(
//           httpStatus.INTERNAL_SERVER_ERROR,
//           "Global transaction not found when adding admin cost log"
//         );
//       }

//       // Step 4: Create Net Profit log with reference to Admin Cost log
//       const netProfitLog = {
//         type: "netProfit",
//         message: `Net Profit Allocated for ${investment.title}(RefID: ${savedAdminCostLog._id})`,
//         metadata: {
//           amount: netProfit,
//           refId: savedAdminCostLog._id,
//         },
//         createdAt: new Date(now.getTime() + 4),
//       };

//       globalTransaction.logs.push(netProfitLog);
//       await globalTransaction.save({ session });

//       // Reload to get the generated _id for the netProfitLog
//       globalTransaction = await Transaction.findById(
//         globalTransaction._id
//       ).session(session);
//       if (!globalTransaction) {
//         throw new AppError(
//           httpStatus.INTERNAL_SERVER_ERROR,
//           "Global transaction not found after saving net profit log"
//         );
//       }
//       const savedNetProfitLog =
//         globalTransaction.logs[globalTransaction.logs.length - 1];

//       // Process participants with proper log references
//       const participants = await InvestmentParticipant.find({
//         investmentId: id,
//         status: "active",
//       }).session(session);

//       const participantUpdates = [];
//       const investorTxnPromises = [];
//       const agentTxnPromises = [];

//       for (const participant of participants) {
//         const investorSharePercent = Number(((100 * participant.amount) / initialInvestment).toFixed(2));
//         const investorNetProfit = Number(
//           ((netProfit * investorSharePercent) / 100).toFixed(2)
//         );

//         participant.totalDue = Number(
//           (participant.totalDue + investorNetProfit).toFixed(2)
//         );

//         const investmentMonth = moment(participant.createdAt).format("YYYY-MM");
//         const lastUpdateMonth = participant.amountLastUpdatedAt
//           ? moment(participant.amountLastUpdatedAt).format("YYYY-MM")
//           : null;

//         const shouldUpdateAmount =
//           currentMonth !== investmentMonth && currentMonth !== lastUpdateMonth;
//         if (shouldUpdateAmount) {
//           participant.amount = Number(participant.totalDue.toFixed(2));
//           participant.amountLastUpdatedAt = new Date();
//         }
//         participantUpdates.push(participant.save({ session }));

//         const investor = await User.findById(participant.investorId)
//           .session(session)
//           .lean();
//         const investorName = investor?.name || "Investor";

//         const profitLog = {
//           type: "profitDistributed",
//           message: `Profit Distributed to ${investorName} for ${investorSharePercent}% share`,
//           metadata: {
//             netProfit,
//             amount: investorNetProfit,
//             sharePercentage: investorSharePercent,
//             investorName,
//             refId: savedNetProfitLog._id,
//           },
//           createdAt: new Date(),
//         };

//         let investorTxn = await Transaction.findOne({
//           investmentId: id,
//           investorId: participant.investorId,
//           month: currentMonth,
//         }).session(session);

//         if (!investorTxn) {
//           investorTxn = new Transaction({
//             investmentId: id,
//             investorId: participant.investorId,
//             month: currentMonth,
//             profit: investorNetProfit,
//             monthlyTotalDue: investorNetProfit,
//             monthlyTotalPaid: 0,
//             monthlyTotalAgentDue: 0,
//             monthlyTotalAgentPaid: 0,
//             status: "due",
//             logs: [profitLog],
//           });
//         } else {
//           investorTxn.logs.push(profitLog);
//           investorTxn.profit = Number(
//             (investorTxn.profit + investorNetProfit).toFixed(2)
//           );
//           investorTxn.monthlyTotalDue = Number(
//             (investorTxn.monthlyTotalDue + investorNetProfit).toFixed(2)
//           );

//           investorTxn.status = "partial";
//         }
//         investorTxnPromises.push(investorTxn.save({ session }));

//         // Agent Commission Logic
//         if (investor?.agent && participant.agentCommissionRate > 0) {
//           const agent = await User.findById(investor.agent)
//             .session(session)
//             .lean();
//           if (agent) {
//             const agentCommissionRate = participant.agentCommissionRate;
//             const commissionBase =
//               grossProfit * (investorSharePercent / 100) - investorNetProfit;
//             const commission = Number(
//               (commissionBase * (agentCommissionRate / 100)).toFixed(2)
//             );

//             if (commission > 0) {
//               const commissionLog = {
//                 type: "commissionCalculated",
//                 message: `Commission distributed to Agent ${agent.name} for ${investorName}'s profit`,
//                 metadata: {
//                   agentId: agent._id,
//                   agentName: agent.name,
//                   investorId: investor._id,
//                   investorName,
//                   amount: commission,
//                   investorSharePercent,
//                   investorNetProfit,
//                   investmentId: id,
//                   investmentName: investment.title,
//                   refId: savedNetProfitLog._id,
//                 },
//                 createdAt: new Date(),
//               };

//               let agentTxn = await AgentTransaction.findOne({
//                 investmentId: id,
//                 investorId: investor._id,
//                 agentId: agent._id,
//                 month: currentMonth,
//               }).session(session);

//               if (!agentTxn) {
//                 agentTxn = new AgentTransaction({
//                   investmentId: id,
//                   investorId: investor._id,
//                   agentId: agent._id,
//                   month: currentMonth,
//                   commissionDue: commission,
//                   profit: commission,
//                   commissionPaid: 0,
//                   status: "due",
//                   logs: [commissionLog],
//                   paymentLog: [],
//                 });
//               } else {
//                 agentTxn.logs.push(commissionLog);
//                 // Update due and profit
//                 agentTxn.commissionDue = Number(
//                   (agentTxn.commissionDue + commission).toFixed(2)
//                 );
//                 agentTxn.profit = Number(
//                   ((agentTxn.profit || 0) + commission).toFixed(2)
//                 );

//                 // Recalculate status properly after due is updated
//                 if (agentTxn.commissionDue === 0) {
//                   agentTxn.status = "paid";
//                 } else if (agentTxn.commissionPaid === 0) {
//                   agentTxn.status = "due";
//                 } else {
//                   agentTxn.status = "partial";
//                 }
//               }

//               // ✅ Ensure commission log is also pushed to investor transaction
//               let investorTransaction = await Transaction.findOne({
//                 investmentId: id,
//                 investorId: investor._id,
//                 month: currentMonth,
//               }).session(session);

//               if (investorTransaction) {
//                 investorTransaction.logs.push({
//                   ...commissionLog,
//                   createdAt: new Date(), // ensure consistent timestamps
//                 });

//                 investorTxnPromises.push(investorTransaction.save({ session }));
//               }

//               // ✅ Save the agentTxn as part of the same batch
//               agentTxnPromises.push(agentTxn.save({ session }));

//               // ✅ Save/update agentSummary
//               let agentSummary = await AgentCommission.findOne({
//                 agentId: agent._id,
//                 investorId: investor._id,
//               }).session(session);

//               if (!agentSummary) {
//                 agentSummary = new AgentCommission({
//                   agentId: agent._id,
//                   investorId: investor._id,
//                   totalCommissionDue: commission,
//                   totalCommissionPaid: 0,
//                 });
//               } else {
//                 agentSummary.totalCommissionDue = Number(
//                   (agentSummary.totalCommissionDue + commission).toFixed(2)
//                 );
//               }
//               await agentSummary.save({ session });
//             }
//           }
//         }
//       }

//       await Promise.all([
//         ...participantUpdates,
//         ...investorTxnPromises,
//         ...agentTxnPromises,
//       ]);
//     }

//     if (logMessage) {
//       const currentMonth = moment().format("YYYY-MM");
//       const logEntry = {
//         type: "investmentUpdated",
//         message: logMessage,
//         metadata: {
//           amount: payload.projectAmount,
//           UpdateAmount: updatedprojectAmount,
//         },
//         createdAt: new Date(),
//       };

//       let logTransaction = await Transaction.findOne({
//         investmentId: id,
//         investorId: null,
//         month: currentMonth,
//       }).session(session);

//       if (logTransaction) {
//         logTransaction.logs.push(logEntry);
//       } else {
//         logTransaction = new Transaction({
//           investmentId: id,
//           investorId: null,
//           month: currentMonth,
//           profit: 0,
//           monthlyTotalDue: 0,
//           monthlyTotalPaid: 0,
//           status: "due",
//           logs: [logEntry],
//         });
//       }
//       await logTransaction.save({ session });
//     }

//     const updatableFields = [
//       "status",
//       "saleAmount",
//       "adminCost",
//       "details",
//       "title",
//       "image",
//       "documents",
//     ];
//     for (const field of updatableFields) {
//       if (field in payload && (payload as any)[field] !== undefined) {
//         (updates as any)[field] = (payload as any)[field];
//       }
//     }

//     const updatedInvestment = await Investment.findByIdAndUpdate(id, updates, {
//       new: true,
//       runValidators: true,
//       session,
//     });

//     await session.commitTransaction();
//     return updatedInvestment;
//   } catch (error) {
//     await session.abortTransaction();
//     throw error;
//   } finally {
//     session.endSession();
//   }
// };


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
    const currencyType = investment.currencyType || 'GBP';

    if (payload?.saleAmount && isNaN(payload.saleAmount)) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid saleAmount");
    }

    // --- NEW: Handle "updateDetail" action ---
    if (payload.action === "updateDetail") {
      const updates: Partial<TInvestment> = {};
      const detailFields = ["title", "adminCost", "details", "documents", "image","currencyType","installmentNumber","projectDuration"];
      
      for (const field of detailFields) {
        if (field in payload && (payload as any)[field] !== undefined) {
          (updates as any)[field] = (payload as any)[field];
        }
      }

      const updatedInvestment = await Investment.findByIdAndUpdate(id, updates, {
        new: true,
        runValidators: true,
        session,
      });

      await session.commitTransaction();
      return updatedInvestment;
    }

    const updates: Partial<TInvestment> = {};
    let logMessage = "";
    let updatedprojectAmount: number | undefined;

    // --- Logic 1: Handle projectAmount update (Capital Raise) ---
    if (payload.projectAmount !== undefined && !payload.saleAmount) {
      if (payload.isCapitalRaise) {
        const previousAmount = investment.projectAmount;
        updatedprojectAmount = Number(
          (Number(previousAmount) + Number(payload.projectAmount)).toFixed(2)
        );
        updates.projectAmount = updatedprojectAmount;
        logMessage = `Investment Raised capital`;

        if (updatedprojectAmount > 0) {
          const participants = await InvestmentParticipant.find({
            investmentId: id,
            status: "active",
          }).session(session);

          if (participants.length > 0) {
            const shareUpdates = participants.map((participant) => {
              if (participant.amount > 0) {
                participant.projectShare = Number(
                  ((participant.amount / updatedprojectAmount!) * 100).toFixed(2)
                );
                return participant.save({ session });
              }
              return Promise.resolve();
            });
            await Promise.all(shareUpdates);
          }
        }
      } else {
        updates.projectAmount = payload.projectAmount;
      }
    }

    // --- Logic 2: Handle saleAmount and profit distribution ---
    if (payload.saleAmount) {
      // 1. Fetch participants
      const participants = await InvestmentParticipant.find({
        investmentId: id,
        status: "active",
      }).session(session);

      // 2. Calculate Total Due and Total Paid from Participants
      let totalPaidByInvestors = 0;

      const totalDueInstallment = participants.reduce((sum, participant) => {
        const paid = participant.installmentPaidAmount || 0;
        totalPaidByInvestors += paid; // Sum up what has actually been paid
        const due = (participant.amount || 0) - paid;
        return sum + (due > 0 ? due : 0);
      }, 0);

      const saleAmount = Number(payload.saleAmount.toFixed(2));
      const projectAmount = Number((investment.projectAmount || 0).toFixed(2));

      // 3. Calculate Gross Profit based on Deduct Outstanding Logic
      // Check payload for flag, default to TRUE (standard behavior) if undefined
      const deductOutstanding = (payload as any).deductOutstanding !== false; 
      let grossProfit = 0;

      if (deductOutstanding) {
        // Scenario A: Deduct Outstanding Amount
        // Math: (Sale - Outstanding) - Paid  === Sale - (Outstanding + Paid) === Sale - ProjectAmount
        grossProfit = Number((saleAmount - projectAmount).toFixed(2));
      } else {
        // Scenario B: Ignore Outstanding (Profit based on actual cash in)
        // Math: Sale - Paid
        grossProfit = Number((saleAmount - totalPaidByInvestors).toFixed(2));
      }

      // 4. Admin Cost Calculation
      const adminCostRate = investment.adminCost || 0;
      const adminCost = Number(
        (grossProfit * ((adminCostRate as any) / 100)).toFixed(2)
      );
      
      // 5. Calculate distributable amount BEFORE agent commissions (for share calculation)
      const profitBeforeCommission = Number((grossProfit - adminCost).toFixed(2));
const netProfit = Number((grossProfit - adminCost).toFixed(2));
      const currentMonth = moment().format("YYYY-MM");
      const now = new Date();

      // --- LOGGING (Project Level) ---
      const cmvLog = {
        type: "saleDeclared",
        message: `CMV / SALE`,
        metadata: { 
          amount: saleAmount, 
          projectAmount: projectAmount,
          totalPaidByInvestors: totalPaidByInvestors,
          deductOutstanding: deductOutstanding
        },
        createdAt: new Date(now.getTime() + 1),
      };

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
      await globalTransaction.save({ session });

      globalTransaction = await Transaction.findById(globalTransaction._id).session(session);
      if (!globalTransaction) {
        throw new AppError(
          httpStatus.INTERNAL_SERVER_ERROR,
          "Global transaction not found after saving CMV log"
        );
      }
      const savedCmvLog = globalTransaction.logs[globalTransaction.logs.length - 1];

      const grossProfitLog = {
        type: "grossProfit",
        message: `Gross Profit for sale`,
        metadata: { 
          amount: grossProfit, 
          saleAmount: saleAmount, 
          projectAmount: projectAmount,
          totalPaidByInvestors: totalPaidByInvestors,
          calculationMethod: deductOutstanding ? 'sale_minus_project_amount' : 'sale_minus_paid_amount',
          refId: savedCmvLog._id 
        },
        createdAt: new Date(now.getTime() + 2),
      };
      globalTransaction.logs.push(grossProfitLog);
      await globalTransaction.save({ session });

      globalTransaction = await Transaction.findById(globalTransaction._id).session(session);
      if (!globalTransaction) {
        throw new AppError(
          httpStatus.INTERNAL_SERVER_ERROR,
          "Global transaction not found after saving gross profit log"
        );
      }
      const savedGrossProfitLog = globalTransaction.logs[globalTransaction.logs.length - 1];

      const adminCostLog = {
        type: "adminCostDeclared",
        message: `Admin Cost ${adminCostRate}% for ${investment.title}`,
        metadata: { investmentId: id, adminCostRate, amount: adminCost, cmv: saleAmount, refId: savedGrossProfitLog._id, currencyType },
        createdAt: new Date(now.getTime() + 3),
      };
      globalTransaction.logs.push(adminCostLog);
      await globalTransaction.save({ session });

      globalTransaction = await Transaction.findById(globalTransaction._id).session(session);
      if (!globalTransaction) {
        throw new AppError(
          httpStatus.INTERNAL_SERVER_ERROR,
          "Global transaction not found after saving admin cost log"
        );
      }
      const savedAdminCostLog = globalTransaction.logs[globalTransaction.logs.length - 1];

     // --- Process Participants ---
      const participantUpdates = [];
      const investorTxnPromises = [];
      const agentTxnPromises = [];
      let totalAgentCommissions = 0; // Just for tracking/logging purposes

      for (const participant of participants) {
        // 1. Calculate Payment Ratio
        const baseSharePercent = participant.projectShare || 0;
        const effectiveSharePercent = Number((baseSharePercent).toFixed(2));
        
        // 2. Calculate Gross Investor Share (from the full Net Profit)
        const rawInvestorShareAmount = Number(((netProfit * effectiveSharePercent) / 100).toFixed(2));

        const investor = await User.findById(participant.investorId).session(session).lean();
        const investorName = investor?.name || "Investor";

        let agentCommission = 0;
        let finalInvestorProfit = rawInvestorShareAmount;
        let agentDoc = null;
        let commissionLog = null;

        // 3. Calculate Agent Commission (Split from Investor Share)
        if (investor?.agent && participant.agentCommissionRate > 0 && rawInvestorShareAmount > 0) {
          const agent = await User.findById(investor.agent).session(session).lean();
          if (agent) {
            agentDoc = agent;
            const agentCommissionRate = participant.agentCommissionRate;
            
            // Calculate Commission
            agentCommission = Number((rawInvestorShareAmount * (agentCommissionRate / 100)).toFixed(2));
            
            // Add to total (for reference only, not for deduction from netProfit)
            totalAgentCommissions += agentCommission;
            
            // DEDUCT Commission from Investor's Raw Share
            finalInvestorProfit = Number((rawInvestorShareAmount - agentCommission).toFixed(2));

            // Create Commission Log Object
            commissionLog = {
                type: "commissionCalculated",
                message: `Agent ${agentDoc.name} Commission from ${investorName}'s profit`,
                metadata: {
                  agentId: agentDoc._id,
                  agentName: agentDoc.name,
                  investorId: investor?._id,
                  investorName,
                  amount: agentCommission,
                  investorSharePercent: effectiveSharePercent,
                  investorNetProfit: finalInvestorProfit,
                  investmentId: id,
                  investmentName: investment.title,
                  currencyType
                },
                createdAt: new Date(),
            };
          }
        }

        // 4. Update Due Amount with the Final Profit
        participant.totalDue = Number((participant.totalDue + finalInvestorProfit).toFixed(2));

        const investmentMonth = moment(participant.createdAt).format("YYYY-MM");
        const lastUpdateMonth = participant.amountLastUpdatedAt
          ? moment(participant.amountLastUpdatedAt).format("YYYY-MM")
          : null;

        if (currentMonth !== investmentMonth && currentMonth !== lastUpdateMonth) {
          participant.amount = Number(participant.totalDue.toFixed(2));
          participant.amountLastUpdatedAt = new Date();
        }
        participantUpdates.push(participant.save({ session }));

        // 5. Create Profit Log Object
        const shareMessage = `${effectiveSharePercent}% share`;
        const profitLog = {
          type: "profitDistributed",
          message: `${investorName} Profit for ${shareMessage}`,
          metadata: {
            baseNetProfit: netProfit, // Total Pot
            amount: finalInvestorProfit, // What Investor Gets
            rawShare: rawInvestorShareAmount, // Share before agent cut
            agentDeduction: agentCommission, // Agent Cut
            sharePercentage: effectiveSharePercent,
            investorName,
            currencyType
          },
          createdAt: new Date(new Date().getTime() + 1),
        };

        // 6. Handle Investor Transaction
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
            profit: 0,
            monthlyTotalDue: 0,
            monthlyTotalPaid: 0,
            status: "due",
            logs: [],
          });
        }

        // Push Commission Log FIRST, then Profit Log
        if (commissionLog) {
            investorTxn.logs.push(commissionLog);
        }
        investorTxn.logs.push(profitLog);

        // Update Totals
        investorTxn.profit = Number((investorTxn.profit + finalInvestorProfit).toFixed(2));
        investorTxn.monthlyTotalDue = Number((investorTxn.monthlyTotalDue + finalInvestorProfit).toFixed(2));
        investorTxn.status = "partial";
        
        investorTxnPromises.push(investorTxn.save({ session }));

        // 7. Handle Agent Transaction & Summary
        if (agentDoc && agentCommission > 0 && commissionLog) {
          let agentTxn = await AgentTransaction.findOne({
            investmentId: id,
            investorId: investor?._id,
            agentId: agentDoc._id,
            month: currentMonth,
          }).session(session);

          if (!agentTxn) {
            agentTxn = new AgentTransaction({
              investmentId: id,
              investorId: investor?._id,
              agentId: agentDoc._id,
              month: currentMonth,
              commissionDue: agentCommission,
              profit: agentCommission,
              commissionPaid: 0,
              status: "due",
              logs: [commissionLog],
              paymentLog: [],
            });
          } else {
            agentTxn.logs.push(commissionLog);
            agentTxn.commissionDue = Number((agentTxn.commissionDue + agentCommission).toFixed(2));
            agentTxn.profit = Number(((agentTxn.profit || 0) + agentCommission).toFixed(2));
            if (agentTxn.commissionDue === 0) agentTxn.status = "paid";
            else if (agentTxn.commissionPaid === 0) agentTxn.status = "due";
            else agentTxn.status = "partial";
          }

          agentTxnPromises.push(agentTxn.save({ session }));

          let agentSummary = await AgentCommission.findOne({
            agentId: agentDoc._id,
            investorId: investor?._id,
          }).session(session);

          if (!agentSummary) {
            agentSummary = new AgentCommission({
              agentId: agentDoc._id,
              investorId: investor?._id,
              totalCommissionDue: agentCommission,
              totalCommissionPaid: 0,
            });
          } else {
            agentSummary.totalCommissionDue = Number((agentSummary.totalCommissionDue + agentCommission).toFixed(2));
          }
          await agentSummary.save({ session });
        }
      }

      // --- LOG GLOBAL NET PROFIT ---
      // FIX: Use 'netProfit' (Gross - Admin). Do NOT subtract agent commissions from this global number.
      const netProfitLog = {
        type: "netProfit",
        message: `Net Profit for ${investment.title}`,
        metadata: { 
          amount: netProfit, // This is the full pie
          totalAgentCommissions, // Just for info
          refId: savedAdminCostLog._id, 
          currencyType 
        },
        createdAt: new Date(now.getTime() + 4),
      };
      
      if (!globalTransaction) {
        throw new AppError(
          httpStatus.INTERNAL_SERVER_ERROR,
          "Global transaction not found when adding net profit log"
        );
      }
      
      globalTransaction.logs.push(netProfitLog);
      await globalTransaction.save({ session });

      await Promise.all([ ...participantUpdates, ...investorTxnPromises, ...agentTxnPromises]);
    }

    // --- Logic 3: General Updates ---
    if (logMessage) {
      const currentMonth = moment().format("YYYY-MM");
      const logEntry = {
        type: "investmentUpdated",
        message: logMessage,
        metadata: { amount: payload.projectAmount, UpdateAmount: updatedprojectAmount },
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

    const updatableFields = ["status", "saleAmount", "adminCost", "details", "title", "image", "documents", "currencyType", "installmentNumber","projectDuration"];
    for (const field of updatableFields) {
      if (field in payload && (payload as any)[field] !== undefined) {
        (updates as any)[field] = (payload as any)[field];
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

const addInstallment = async (payload: {
  participantId: string;
  investmentId: string;
  amount: number;
}) => {
  const { participantId, investmentId, amount } = payload;

  if (amount <= 0) {
    throw new AppError(httpStatus.BAD_REQUEST, "Amount must be greater than 0");
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // 1. Fetch the Participant
    const participant = await InvestmentParticipant.findOne({
      _id: participantId,
      investmentId: investmentId,
    }).populate('investorId').session(session);

    if (!participant) {
      throw new AppError(httpStatus.NOT_FOUND, "Investment Participant not found");
    }

    // 2. VALIDATION: Check if amount exceeds the Total Investment Amount
    // We check if (Current Paid + New Amount) > Total Committed Amount
    const currentPaid = participant.installmentPaidAmount || 0;
    const committedAmount = participant.amount;

    if (currentPaid + amount > committedAmount) {
      const remaining = committedAmount - currentPaid;
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Payment exceeds investment amount. Remaining balance is ${remaining}`
      );
    }

    // 3. Update Investment Participant
    // Increment installmentNumber and installmentPaidAmount
    // We also update totalPaid as it usually reflects the sum of installments
    const updatedParticipant = await InvestmentParticipant.findByIdAndUpdate(
      participantId,
      {
        $inc: {
          installmentNumber: 1,
          installmentPaidAmount: amount,
          totalPaid: amount, 
        },
        $set: {
            amountLastUpdatedAt: new Date()
        }
      },
      { new: true, session }
    );

    // 4. Update Investment Model
    // Increment totalAmountPaid
    const updatedInvestment = await Investment.findByIdAndUpdate(
      investmentId,
      {
        $inc: { totalAmountPaid: amount },
      },
      { new: true, session }
    );

    if (!updatedInvestment) {
      throw new AppError(httpStatus.NOT_FOUND, "Investment project not found");
    }

   
    const currentDate = new Date();
    const currentMonth = currentDate.toLocaleString('default', { month: 'short', year: 'numeric' }); 

    await Transaction.findOneAndUpdate(
      {
        investorId: participant.investorId,
        investmentId: investmentId,
        month: currentMonth,
      },
      {
        $inc: { 
            monthlyTotalPaid: amount 
        },
        $setOnInsert: {
             profit: 0, // Required by schema, strict init to 0
             status: "paid"
        },
        $push: {
         
          logs: {
            type: "installment", 
            message: `${(participant as any)?.investorId?.name}'s Installment of ${amount} ${updatedInvestment.currencyType || 'GBP'} received`,
            metadata: {
              amount: amount,
              previousPaid: currentPaid,
              newTotalPaid: currentPaid + amount
            },
            createdAt: new Date(),
          },
          
         
        },
      },
      { upsert: true, new: true, session }
    );

    await session.commitTransaction();
    session.endSession();

    return {
      participant: updatedParticipant,
      investment: updatedInvestment,
    };

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

export const InvestmentServices = {
  getAllInvestmentFromDB,
  getSingleInvestmentFromDB,
  updateInvestmentIntoDB,
  createInvestmentIntoDB,
  addInstallment
};
