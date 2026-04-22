const BASE = "http://localhost:3001";

export interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

export const fetchUsers = async (): Promise<User[]> => {
  const res = await fetch(`${BASE}/users`);
  const json = await res.json() as { data: User[] };
  return json.data;
};

export const createUser = async (data: { name: string; email: string }): Promise<User> => {
  const res = await fetch(`${BASE}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = await res.json() as { data: User };
  return json.data;
};

export const deleteUser = async (id: string): Promise<void> => {
  await fetch(`${BASE}/users/${id}`, { method: "DELETE" });
};
