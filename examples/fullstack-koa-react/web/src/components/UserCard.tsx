import React from "react";
import type { User } from "../api/users";

interface UserCardProps {
  user: User;
  onDelete: (id: string) => void;
}

const UserCard: React.FC<UserCardProps> = ({ user, onDelete }) => {
  const handleDelete = () => onDelete(user._id);

  return (
    <div style={{ border: "1px solid #eee", padding: "12px", borderRadius: "8px", marginBottom: "8px" }}>
      <strong>{user.name}</strong>
      <span style={{ marginLeft: "8px", color: "#666" }}>{user.email}</span>
      <span style={{ marginLeft: "8px", fontSize: "12px", background: "#f0f0f0", padding: "2px 6px", borderRadius: "4px" }}>
        {user.role}
      </span>
      <button
        onClick={handleDelete}
        style={{ marginLeft: "auto", display: "block", color: "red", background: "none", border: "none", cursor: "pointer" }}
        aria-label={`Delete ${user.name}`}
      >
        ✕
      </button>
    </div>
  );
};

export default UserCard;
