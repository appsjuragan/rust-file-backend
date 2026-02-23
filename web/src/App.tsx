import React, { useState, useEffect } from "react";
import {
  getAuthToken,
  setAuthToken,
  clearAuthToken,
} from "./services/httpClient";
import { AuthPage } from "./features/auth/AuthPage";
import Dashboard from "./features/dashboard/Dashboard";
import { BackendStatusMonitor } from "./components/BackendStatusMonitor";
import "./App.css";
import "../lib/tailwind.css";

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!getAuthToken());

  useEffect(() => {
    // Optional: validate token validity on mount?
    // keeping it simple as per original logic which just checked existence
  }, []);

  const handleLogin = (token: string) => {
    setAuthToken(token);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    clearAuthToken();
    setIsAuthenticated(false);
    // Clean up local storage
    localStorage.removeItem("currentFolder");
    localStorage.removeItem("username");
    localStorage.removeItem("theme");
  };

  return (
    <div className="app-root">
      {isAuthenticated ? (
        <>
          <Dashboard onLogout={handleLogout} />
          <BackendStatusMonitor onLogout={handleLogout} />
        </>
      ) : (
        <AuthPage onLogin={handleLogin} />
      )}
    </div>
  );
}

export default App;
