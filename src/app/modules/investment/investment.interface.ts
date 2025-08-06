/* eslint-disable no-unused-vars */
import { Types } from "mongoose";

export interface TInvestment {
  title: string;
  image: string;
  details: string;
  documents: any[];
  status: string;
  amountRequired:Number;
  adminCost:Number;
  isCapitalRaise: boolean;
}
