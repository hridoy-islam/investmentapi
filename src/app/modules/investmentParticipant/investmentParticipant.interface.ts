import { Types } from "mongoose";



export interface TInvestmentParticipant {
  investorId: Types.ObjectId; // or string
  investmentId: Types.ObjectId; // or string
  rate: number;
  amount: number;
  status: "active" | "block";
  totalDue: number;
  totalPaid: number;
  createdAt?: Date;
  updatedAt?: Date;
  agentCommissionRate:Number;
    projectShare: Number;
     installmentNumber: number;
  installmentPaidAmount: number;

}