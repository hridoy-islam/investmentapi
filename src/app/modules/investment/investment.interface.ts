/* eslint-disable no-unused-vars */
import { Types } from "mongoose";

export interface TInvestment {
  title: string;
  image: string;
  details: string;
  documents: any[];
  status: string;
  action: string;
  currencyType: string;
  projectAmount: Number;
  paidAmount: Number;
  adminCost: Number;
  isCapitalRaise: boolean;
  projectDuration: number;
  installmentNumber: number;
  totalAmountPaid: number;
}
