import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import UserList from "./pages/UserList";

const App: React.FC = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<UserList />} />
    </Routes>
  </BrowserRouter>
);

export default App;
