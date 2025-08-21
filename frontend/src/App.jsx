// src/App.jsx
import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import "./App.css"; // mantém seus estilos atuais

// ---------- COMPONENTE LOGIN ----------
function LoginBox() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user));
  }, []);

  const login = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return alert(error.message);
    setUser(data.user);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setData(null);
  };

  const fetchProtected = async () => {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch("https://<seu-backend>.onrender.com/api/protected", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    setData(json);
  };

  if (user) {
    return (
      <div style={{ position: "fixed", top: 10, right: 10, zIndex: 9999, background: "#fff", padding: 8, borderRadius: 4 }}>
        <small>Olá, {user.email}</small>
        <button onClick={logout}>sair</button>
        <button onClick={fetchProtected} style={{ marginLeft: 8 }}>dados</button>
        {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", top: 10, right: 10, zIndex: 9999, background: "#fff", padding: 8, borderRadius: 4 }}>
      <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input type="password" placeholder="senha" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button onClick={login}>entrar</button>
    </div>
  );
}

// ---------- APP PRINCIPAL ----------
export default function App() {
  // seu código da mandala aqui
  // (mantido para não quebrar o visual)

  return (
    <>
      <LoginBox />
      {/* aqui você coloca o restante da sua interface */}
      <div className="mandala-container">
        <h1>Prévia em tempo real</h1>
        <p>Sua mandala sendo gerada...</p>
        {/* componentes da mandala */}
      </div>
    </>
  );
}