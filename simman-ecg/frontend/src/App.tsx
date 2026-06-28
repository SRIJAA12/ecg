// src/App.tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import UnifiedDashboard from "./pages/UnifiedDashboard";
import "./styles/global.css";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<UnifiedDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
