import { useState } from 'react'
import { supabase } from './supabaseClient'

export default function TestLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState(null)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const login = async () => {
    const { data: res, error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) return setError(err.message)
    setToken(res.session.access_token)
    setError(null)
  }

  const callProtected = async () => {
    const res = await fetch('https://<seu-backend>.onrender.com/api/protected', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = await res.json()
    setData(json)
  }

  return (
    <div style={{ padding: 32 }}>
      <h2>Teste de Login</h2>
      <input placeholder="email" onChange={e => setEmail(e.target.value)} />
      <input type="password" placeholder="senha" onChange={e => setPassword(e.target.value)} />
      <button onClick={login}>Entrar</button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {token && (
        <>
          <button onClick={callProtected}>Acessar rota protegida</button>
          {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
        </>
      )}
    </div>
  )
}