import { create } from "zustand";
import { fetchUsers, createUser, deleteUser, type User } from "../api/users";

interface UserStore {
  users: User[];
  loading: boolean;
  error: string | null;
  loadUsers: () => Promise<void>;
  addUser: (data: { name: string; email: string }) => Promise<void>;
  removeUser: (id: string) => Promise<void>;
}

export const useUserStore = create<UserStore>((set) => ({
  users: [],
  loading: false,
  error: null,

  loadUsers: async () => {
    set({ loading: true, error: null });
    try {
      const users = await fetchUsers();
      set({ users, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  addUser: async (data) => {
    const user = await createUser(data);
    set((state) => ({ users: [...state.users, user] }));
  },

  removeUser: async (id) => {
    await deleteUser(id);
    set((state) => ({ users: state.users.filter((u) => u._id !== id) }));
  },
}));
