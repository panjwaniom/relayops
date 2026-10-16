import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { getToken } from "./api";
import Layout from "./components/Layout";
import { Cursor, ToastHost } from "./components/ui";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Integrations from "./pages/Integrations";
import IntegrationDetail from "./pages/IntegrationDetail";
import Jobs from "./pages/Jobs";
import JobDetail from "./pages/JobDetail";
import Activity from "./pages/Activity";
import Settings from "./pages/Settings";

function Guard({ children }: { children: JSX.Element }) {
  const loc = useLocation();
  const [ok] = useState(() => !!getToken());
  if (!ok) return <Navigate to="/login" state={{ from: loc }} replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <>
      <Cursor />
      <ToastHost />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Guard><Dashboard /></Guard>} />
          <Route path="/integrations" element={<Guard><Integrations /></Guard>} />
          <Route path="/integrations/:id" element={<Guard><IntegrationDetail /></Guard>} />
          <Route path="/jobs" element={<Guard><Jobs /></Guard>} />
          <Route path="/jobs/:id" element={<Guard><JobDetail /></Guard>} />
          <Route path="/activity" element={<Guard><Activity /></Guard>} />
          <Route path="/settings" element={<Guard><Settings /></Guard>} />
        </Routes>
      </BrowserRouter>
    </>
  );
}
