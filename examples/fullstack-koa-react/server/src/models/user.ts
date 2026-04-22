import mongoose from "mongoose";
import type { KoaInterface } from "@kb-skills/core";

export interface IUser {
  name: string;
  email: string;
  role: string;
  createdAt?: Date;
}

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  role: { type: String, enum: ["admin", "user"], default: "user" },
  createdAt: { type: Date, default: Date.now },
});

export const User = mongoose.model<IUser>("User", userSchema);
