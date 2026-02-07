/* eslint-disable @typescript-eslint/no-explicit-any */
import express from "express";
import auth from "../../middlewares/auth";
import { upload } from "../../utils/multer";
import { InvestmentControllers } from "./investment.controller";
// import auth from '../../middlewares/auth';

const router = express.Router();
router.get(
  "/",
  // auth("admin", "agent", "investor"),
  InvestmentControllers.getAllInvestment
);
router.post(
  "/",
  // auth("admin", "agent", "investor"),
  InvestmentControllers.InvestmentCreate
);
router.get(
  "/:id",
  auth("admin", "agent", "investor"),

  InvestmentControllers.getSingleInvestment
);

router.patch(
  "/:id",
  auth("admin", "agent", "investor"),

  InvestmentControllers.updateInvestment
);

router.post(
  "/:id/installment",
  auth("admin", "agent"),
  InvestmentControllers.addInstallment
);

export const InvestmentRoutes = router;
