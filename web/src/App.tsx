import React, { useState, useEffect } from "react";
import {
  getAuthToken,
  setAuthToken,
  clearAuthToken,
} from "./services/httpClient";
import { AuthPage } from "./features/auth/AuthPage";
import Dashboard from "./features/dashboard/Dashboard";
import { PublicSharePage } from "./features/share/PublicSharePage";
import { BackendStatusMonitor } from "./components/BackendStatusMonitor";
import { DeviceActivatePage } from "./features/device/DeviceActivatePage";
import "./App.css";
import "../lib/tailwind.css";

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!getAuthToken());

  useEffect(() => {
    // Optional: validate token validity on mount?
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

  const isSharePage = window.location.pathname.startsWith("/s/");
  const isActivatePage = window.location.pathname.startsWith("/activate");
  console.log("Current path:", window.location.pathname, "IsActivate:", isActivatePage);

  if (isSharePage) {
    return <PublicSharePage />;
  }

  if (isActivatePage) {
    // Requires login to activate device
    if (!isAuthenticated) {
      return <AuthPage onLogin={handleLogin} />;
    }
    return <DeviceActivatePage />;
  }

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
