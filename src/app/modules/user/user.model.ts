/* eslint-disable @typescript-eslint/no-this-alias */
import bcrypt from "bcrypt";
import mongoose, { Schema, model } from "mongoose";
import config from "../../config";
import { UserStatus } from "./user.constant";
import { TUser, UserModel } from "./user.interface";

const userSchema = new Schema<TUser, UserModel>(
  {
    name: { type: String },
    email: {
      type: String,
      required: true,
      unique: true,
    },
   dateOfBirth:{type: Date},
    password: {
      type: String,
      required: true,
      select: 0,
    },
    role: {
      type: String,
      enum: ["user", "admin", "agent", "investor"],
    },
    status: {
      type: String,
      enum: UserStatus,
      default: "active",
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    agent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    authorized: {
      type: Boolean,
      default: false,
    },
    address: {
      type: String,
    },
    image: {
      type: String,
    },
    phone: {
      type: String,
    },
    googleUid: {
      type: String,
    },
    otp: {
      type: String,
    },
    refreshToken: {
      type: String,
      select: false,
    },
    otpExpiry: {
      type: Date,
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
    isValided: {
      type: Boolean,
      default: false,
    },
    isCompleted: {
      type: Boolean,
      default: false,
    },
    userAgentInfo: {
      type: [
        {
          browser: {
            name: { type: String },
            version: { type: String },
          },
          os: {
            name: { type: String },
            version: { type: String },
          },
          device: {
            model: { type: String },
            type: { type: String },
            vendor: { type: String },
          },
          cpu: {
            architecture: { type: String },
          },
          ipAddress: {
            type: String,
            required: true,
          },
          macAddress: {
            type: String,
            required: true,
          },
          timestamp: {
            type: Date,
            default: Date.now,
          },
        },
      ],
      default: [],
      select: false,
    },

    passport: { type: [String], default: [] },
    proofOfAddress: { type: [String], default: [] },
    photoId: { type: [String], default: [] },
  },
  {
    timestamps: true,
  }
);

userSchema.statics.hashPassword = async function (
  plainTextPassword: string
): Promise<string> {
  try {
    const hashedPassword = await bcrypt.hash(
      plainTextPassword,
      Number(config.bcrypt_salt_rounds)
    );
    return hashedPassword;
  } catch (error) {
    throw new Error("Error while hashing the password");
  }
};

userSchema.pre("save", async function (next) {
  const user = this as TUser & mongoose.Document; // doc
  if (user.isModified("password")) {
    user.password = await bcrypt.hash(
      user?.password,
      Number(config.bcrypt_salt_rounds)
    );
  }
  next();
});

// set '' after saving password
userSchema.post("save", function (doc, next) {
  doc.password = "";
  next();
});

userSchema.statics.isUserExists = async function (email: string) {
  return await User.findOne({ email }).select("+password");
};

userSchema.statics.isPasswordMatched = async function (
  plainTextPassword,
  hashedPassword
) {
  return await bcrypt.compare(plainTextPassword, hashedPassword);
};

userSchema.statics.isJWTIssuedBeforePasswordChanged = function (
  passwordChangedTimestamp: Date,
  jwtIssuedTimestamp: number
) {
  const passwordChangedTime =
    new Date(passwordChangedTimestamp).getTime() / 1000;
  return passwordChangedTime > jwtIssuedTimestamp;
};

export const User = model<TUser, UserModel>("User", userSchema);
