// src/App.jsx
import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import axios from "axios";
import WebGLMandalaGenerator from "./components/WebGLMandalaGenerator";
import { supabase } from "./supabaseClient";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// ---------- GUARD ----------
function AuthorizationGuard({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    const check = async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        setUser(null);
        setHasAccess(false);
        setLoading(false);
        return;
      }

      // Verifica se o usuário está "active" na tabela user_access
      const email = session.session.user.email;
      const res = await fetch(`${API}/user-status/${email}`);
      const json = await res.json();
      setUser(session.session.user);
      setHasAccess(json.status === "active");
      setLoading(false);
    };
    check();
  }, []);

  if (loading) return <p style={{ padding: 32 }}>Verificando acesso...</p>;
  if (!user) return <LoginScreen />;
  if (!hasAccess)
    return (
      <div style={{ padding: 32 }}>
        <h2>Acesso negado</h2>
        <p>Entre em contato para liberar seu acesso.</p>
      </div>
    );

  return children;
}

// ---------- LOGIN ----------
function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const login = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return setError(error.message);
    window.location.reload(); // força nova verificação
  };

  return (
    <div style={{ padding: 32, maxWidth: 320, margin: "auto", marginTop: "20vh" }}>
      <h2>Login obrigatório</h2>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <input
        placeholder="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: "100%", marginBottom: 8 }}
      />
      <input
        type="password"
        placeholder="senha"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ width: "100%", marginBottom: 8 }}
      />
      <button onClick={login} style={{ width: "100%" }}>
        Entrar
      </button>
    </div>
  );
}

// ---------- HOME ----------
const Home = () => {
  useEffect(() => {
    axios.get(`${API}/`).then((r) => console.log(r.data.message));
  }, []);
  return <WebGLMandalaGenerator />;
};

// ---------- APP ----------
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <AuthorizationGuard>
              <Home />
            </AuthorizationGuard>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}