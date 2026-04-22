import React, { useEffect, useState } from "react";
import { useUserStore } from "../store/userStore";
import UserCard from "../components/UserCard";

const UserList: React.FC = () => {
  const { users, loading, error, loadUsers, addUser, removeUser } = useUserStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) return;
    await addUser({ name, email });
    setName("");
    setEmail("");
  };

  const handleDelete = async (id: string) => {
    await removeUser(id);
  };

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto", padding: "24px" }}>
      <h1>Users</h1>

      <form onSubmit={handleSubmit} style={{ marginBottom: "24px" }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          style={{ marginRight: "8px", padding: "6px" }}
          aria-label="User name"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          type="email"
          style={{ marginRight: "8px", padding: "6px" }}
          aria-label="User email"
        />
        <button type="submit" style={{ padding: "6px 16px" }}>
          Add User
        </button>
      </form>

      {users.length === 0 ? (
        <p style={{ color: "#999" }}>No users yet. Add one above!</p>
      ) : (
        users.map((user) => (
          <UserCard key={user._id} user={user} onDelete={handleDelete} />
        ))
      )}
    </div>
  );
};

export default UserList;
