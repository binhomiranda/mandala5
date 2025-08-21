// src/App.jsx
import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import axios from "axios";
import WebGLMandalaGenerator from "./components/WebGLMandalaGenerator";
import { supabase } from "./supabaseClient";

//const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || process.env.REACT_APP_BACKEND_URL;
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// ---------- LOGIN ----------
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
    const res = await fetch(`${API}/protected`, {
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

// ---------- HOME ----------
const Home = () => {
  const helloWorldApi = async () => {
    try {
      const response = await axios.get(`${API}/`);
      console.log(response.data.message);
    } catch (e) {
      console.error(e, `errored out requesting /api`);
    }
  };

  useEffect(() => {
    helloWorldApi();
  }, []);

  return <WebGLMandalaGenerator />;
};

// ---------- APP ----------
export default function App() {
  return (
    <div className="App">
      <LoginBox />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}