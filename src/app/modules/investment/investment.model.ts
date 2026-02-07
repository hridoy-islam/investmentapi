/* eslint-disable @typescript-eslint/no-this-alias */
import { Schema, model } from "mongoose";
import { TInvestment } from "./investment.interface";

const investmentSchema = new Schema(
  {
    title: { type: String, required: true },
    image: { type: String },
    details: { type: String ,default:''},
    currencyType: { type: String, required: true,default:"GBP" },
    action: { typr: String },
    projectAmount: { type: Number, required: true, default: 0 },
    saleAmount: { type: Number },
    paidAmount: { type: Number, default: 0 },
    adminCost: { type: Number },
    isCapitalRaise: { type: Boolean, default: false },
    documents: [{ type: Schema.Types.Mixed }],
    projectDuration: { type: Number , default: 0},
    installmentNumber: { type: Number , default: 0},
    totalAmountPaid: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["active", "block"],
      default: "active",
    },
  },
  { timestamps: true },
);

export const Investment = model<TInvestment>("Investment", investmentSchema);
