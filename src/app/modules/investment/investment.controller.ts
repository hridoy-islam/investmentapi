import { RequestHandler } from "express";
import catchAsync from "../../utils/catchAsync";
import sendResponse from "../../utils/sendResponse";
import httpStatus from "http-status";
import { InvestmentServices } from "./investment.service";

const InvestmentCreate = catchAsync(async (req, res) => {
  const result = await InvestmentServices.createInvestmentIntoDB(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Investment created successfully",
    data: result,
  });
});

const getAllInvestment: RequestHandler = catchAsync(async (req, res) => {
  const result = await InvestmentServices.getAllInvestmentFromDB(req.query);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Investment retrived succesfully",
    data: result,
  });
});
const getSingleInvestment = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await InvestmentServices.getSingleInvestmentFromDB(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Investment is retrieved succesfully",
    data: result,
  });
});

const updateInvestment = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await InvestmentServices.updateInvestmentIntoDB(id, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Investment is updated succesfully",
    data: result,
  });
});
const addInstallment = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { participantId, amount } = req.body;

  const result = await InvestmentServices.addInstallment({
    investmentId: id,
    participantId,
    amount,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Installment recorded successfully",
    data: result,
  });
});
export const InvestmentControllers = {
  getAllInvestment,
  getSingleInvestment,
  updateInvestment,
  InvestmentCreate,
  addInstallment
};
