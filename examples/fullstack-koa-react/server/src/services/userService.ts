import { User } from "../models/user";

export const findAllUsers = async () => User.find().lean();

export const findUserById = async (id: string) => User.findById(id).lean();

export const createUser = async (data: { name: string; email: string; role?: string }) =>
  User.create(data);

export const updateUser = async (
  id: string,
  data: Partial<{ name: string; email: string; role: string }>,
) => User.findByIdAndUpdate(id, data, { new: true }).lean();

export const deleteUser = async (id: string) => User.findByIdAndDelete(id);
