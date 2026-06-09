import React, { useState, useEffect, useRef } from "react";

// Lista de exchanges (usando logos locais do admin)
const EXCHANGES = [
  { id: 'binance',  name: 'Binance',        icon: '/admin/assets/logos/binance.png',   passphrase: false, uid: false },
  { id: 'bybit',    name: 'Bybit',          icon: '/admin/assets/logos/bybit.png',     passphrase: false, uid: false },
  { id: 'okx',      name: 'OKX',            icon: '/admin/assets/logos/okx.png',       passphrase: true,  uid: false },
  { id: 'kucoin',   name: 'KuCoin',         icon: '/admin/assets/logos/kucoin.png',    passphrase: true,  uid: false },
  { id: 'mexc',     name: 'MEXC',           icon: '/admin/assets/logos/mexc.png',      passphrase: false, uid: false },
  { id: 'gateio',   name: 'Gate.io',        icon: '/admin/assets/logos/gateio.png',    passphrase: false, uid: false },
  { id: 'kraken',   name: 'Kraken',         icon: '/admin/assets/logos/kraken.png',    passphrase: false, uid: false },
  { id: 'coinbase', name: 'Coinbase',       icon: '/admin/assets/logos/coinbase.png',  passphrase: false, uid: false },
  { id: 'bitget',   name: 'Bitget',         icon: '/admin/assets/logos/bitget.png',    passphrase: true,  uid: false },
  { id: 'bitmart',  name: 'BitMart',        icon: '/admin/assets/logos/bitmart.png',   passphrase: false, uid: true, uidLabel: 'Memo (UID)', uidHint: 'Encontre em Perfil → Account Settings → Account ID.' },
  { id: 'novadax',  name: 'NovaDAX',        icon: '/admin/assets/logos/novadax.png',   passphrase: false, uid: false },
  { id: 'mercado',  name: 'Mercado Bitcoin',icon: '/admin/assets/logos/mercado.png',   passphrase: false, uid: false },
];


// Painéis possíveis
type Panel = 'qrLogin' | 'form' | 'success' | 'expired' | 'invalid' | 'revoked';

const API_BASE = 'https://api.mex.app.br/api/v1';

const ConnectPage: React.FC = () => {
  // Painel atual
  const [panel, setPanel] = useState<Panel>('form');
  // Exchange selecionada
  const [selected, setSelected] = useState<string | null>(null);
  // Sessão/token
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  // QR
  const [qrImg, setQrImg] = useState<string>('');
  const [qrStatus, setQrStatus] = useState<string>('Aguardando leitura…');
  // Badge sessão
  const [userName, setUserName] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  // Sidebar
  const [connectedExchanges, setConnectedExchanges] = useState<any[]>([]);
  const [sidebarLoading, setSidebarLoading] = useState<boolean>(false);
  // Formulário
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [uid, setUid] = useState('');
  // Alertas
  const [alert, setAlert] = useState<string>('');
  // Polling
  const pollTimer = useRef<number|null>(null);
  const qrPollTimer = useRef<number|null>(null);

  // Utilitário: buscar params da URL
  function getTokenFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('token');
  }

  // Carregar exchanges conectadas (sidebar)
  async function loadConnectedExchanges(token: string) {
    setSidebarLoading(true);
    try {
      const res = await fetch(`${API_BASE}/connect/session/${token}/data`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setConnectedExchanges(data.connected_exchanges || []);
    } catch {
      setConnectedExchanges([]);
    } finally {
      setSidebarLoading(false);
    }
  }

  // Ativar sessão: mostra sidebar, badge, carrega dados
  function activateSession(token: string, name: string|null, email: string|null) {
    setSessionToken(token);
    setUserName(name || '');
    setUserEmail(email || '');
    setPanel('form');
    loadConnectedExchanges(token);
  }

  // QR login flow
  async function startQrLoginFlow() {
    setPanel('qrLogin');
    setQrStatus('Gerando QR Code…');
    setQrImg('');
    if (qrPollTimer.current) clearInterval(qrPollTimer.current);
    try {
      const res = await fetch(`${API_BASE}/auth/web-session`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Erro ao criar sessão');
      const qrToken = data.token;
      const qrUrl = data.qr_url;
      setQrImg('https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=0&data=' + encodeURIComponent(qrUrl));
      setQrStatus('Aguardando leitura pelo app…');
      qrPollTimer.current = setInterval(async () => {
        try {
          const r = await fetch(`${API_BASE}/auth/web-session/${qrToken}`);
          if (!r.ok) { clearInterval(qrPollTimer.current!); setPanel('invalid'); return; }
          const s = await r.json();
          if (s.status === 'approved' && s.connect_token) {
            clearInterval(qrPollTimer.current!);
            activateSession(s.connect_token, s.user_name || null, s.user_email || null);
            setPanel('form');
          } else if (s.status === 'expired') {
            clearInterval(qrPollTimer.current!);
            setQrStatus('QR Code expirado. Clique em "Gerar novo QR".');
          }
        } catch {}
      }, 2500);
    } catch (e: any) {
      setQrStatus(e.message || 'Erro ao gerar QR Code');
    }
  }

  // Polling de status da sessão
  async function checkStatus(initial: boolean) {
    if (!sessionToken) return;
    try {
      const res = await fetch(`${API_BASE}/connect/session/${sessionToken}`);
      if (!res.ok) { if (initial) setPanel('invalid'); return; }
      const data = await res.json();
      if (data.status === 'completed') { clearInterval(pollTimer.current!); setPanel('success'); return; }
      if (data.status === 'expired')   { clearInterval(pollTimer.current!); setPanel('expired'); return; }
      if (data.status === 'revoked')   { clearInterval(pollTimer.current!); setPanel('revoked'); return; }
      if (initial) { setPanel('form'); pollTimer.current = setInterval(() => checkStatus(false), 2500); }
    } catch { if (initial) setPanel('invalid'); }
  }

  // Logout
  async function handleLogout() {
    if (!window.confirm('Encerrar esta sessão web?\n\nVocê precisará escanear um novo QR code para reconectar.')) return;
    try { await fetch(`${API_BASE}/connect/session/${sessionToken}/end`, { method: 'DELETE' }); } catch {}
    setSessionToken(null);
    setUserName('');
    setUserEmail('');
    setConnectedExchanges([]);
    setPanel('qrLogin');
    setAlert('');
    if (pollTimer.current) clearInterval(pollTimer.current);
    if (qrPollTimer.current) clearInterval(qrPollTimer.current);
    startQrLoginFlow();
  }

  // Envio do formulário
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAlert('');
    if (!selected) { setAlert('Selecione uma exchange antes de continuar.'); return; }
    if (!apiKey.trim() || !apiSecret.trim()) { setAlert('Preencha a API Key e o API Secret.'); return; }
    const exc = EXCHANGES.find(e => e.id === selected);
    if (!exc) { setAlert('Selecione uma exchange válida.'); return; }
    if (exc.passphrase && !passphrase.trim()) { setAlert('Esta exchange requer uma Passphrase.'); return; }
    if (exc.uid && !uid.trim()) { setAlert('Esta exchange requer um ' + (exc.uidLabel || 'Memo (UID)') + '.'); return; }
    try {
      const body: any = { exchange_type: exc.id, api_key: apiKey.trim(), api_secret: apiSecret.trim() };
      if (passphrase) body.passphrase = passphrase.trim();
      if (uid) body.uid = uid.trim();
      const res = await fetch(`${API_BASE}/connect/session/${sessionToken}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setAlert(data.error || 'Erro ao conectar exchange. Tente novamente.');
        return;
      }
      if (pollTimer.current) clearInterval(pollTimer.current);
      loadConnectedExchanges(sessionToken!);
      setPanel('success');
    } catch {
      setAlert('Erro de conexão. Verifique sua internet e tente novamente.');
    }
  }

  // Conectar outra exchange
  function connectAnother() {
    setApiKey(''); setApiSecret(''); setPassphrase(''); setUid(''); setSelected(null); setAlert(''); setPanel('form');
    if (sessionToken) { if (pollTimer.current) clearInterval(pollTimer.current); pollTimer.current = setInterval(() => checkStatus(false), 2500); }
  }

  // Novo QR após revogado
  function handleNewQr() { startQrLoginFlow(); }

  // Efeito inicial: token na URL ativa sessão, senão QR
  useEffect(() => {
    const token = getTokenFromUrl();
    if (token) {
      setSessionToken(token);
      activateSession(token, null, null);
      checkStatus(true);
    } else {
      startQrLoginFlow();
    }
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      if (qrPollTimer.current) clearInterval(qrPollTimer.current);
    };
    // eslint-disable-next-line
  }, []);

  // Renderização dos painéis
    return (
      <div className="connect-page" style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 8px 52px' }}>
        <header className="page-header" style={{ marginBottom: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <a href="/admin" className="logo" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div className="logo-mark" style={{ width: 34, height: 34, background: 'linear-gradient(135deg, var(--primary) 0%, #5244d4 100%)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(109,93,245,.25)' }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="18" height="18" rx="4" fill="#fff"/>
                <path d="M5.5 9L8 11.5L13 6.5" stroke="#6d5df5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="logo-text" style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.5px', color: 'var(--text)' }}>mex<span style={{ color: 'var(--primary)' }}>.app.br</span></div>
          </a>
          {sessionToken && (
            <div className="header-session visible" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="header-user" style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'right', lineHeight: 1.4 }}>
                <strong style={{ display: 'block', color: 'var(--text)', fontWeight: 600, fontSize: 13 }}>{userName}</strong>
                <span>{userEmail}</span>
              </div>
              <button className="btn-end-session" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid var(--border-mid)', borderRadius: 8, color: 'var(--text3)', fontSize: 12, fontWeight: 500, padding: '6px 12px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', transition: 'border-color .18s, color .18s, background .18s', whiteSpace: 'nowrap' }} onClick={handleLogout}>Encerrar sessão</button>
            </div>
          )}
        </header>
        <div className={`app-layout${sessionToken ? ' with-sidebar' : ''}`} style={{ width: '100%', maxWidth: sessionToken ? 940 : 460, display: 'flex', flexDirection: sessionToken ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          {/* Sidebar */}
          {sessionToken && (
            <aside className="sidebar visible" style={{ display: 'flex', flexDirection: 'column', width: 264, flexShrink: 0, gap: 10 }}>
              <div className="sb-card">
                <p className="sb-section-label">Exchanges conectadas</p>
                <div className="sb-list">
                  {sidebarLoading ? (
                    <div className="sb-loading"><div className="spinner-sm"></div><span>Carregando…</span></div>
                  ) : connectedExchanges.length === 0 ? (
                    <p className="sb-empty">Nenhuma exchange conectada ainda.<br/>Use o formulário ao lado.</p>
                  ) : connectedExchanges.map((exc, i) => (
                    <div className="sb-item" key={i}>
                      <img className="sb-item-icon" src={`/admin/assets/logos/${exc.exchange_type}.png`} alt={exc.display_name} />
                      <div className="sb-item-info">
                        <div className="sb-item-name">{exc.display_name}</div>
                        <div className="sb-item-type">{exc.exchange_type}</div>
                      </div>
                      <div className={`sb-item-dot${exc.is_active ? '' : ' inactive'}`} title={exc.is_active ? 'Ativa' : 'Inativa'}></div>
                    </div>
                  ))}
                </div>
                <button className="sb-add-btn" onClick={() => setPanel('form')}>Conectar nova exchange</button>
              </div>
            </aside>
          )}
          {/* Main column */}
          <div className="main-col" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', justifyContent: 'center' }}>
            <section className="card" id="mainCard" style={{ width: '100%', maxWidth: 420, boxShadow: '0 4px 24px rgba(109,93,245,.08)', border: '1px solid #eceef5', borderRadius: 20 }}>
              <div className="card-top-bar"></div>
              <div className="card-body">
                {/* Painel QR Login */}
                {panel === 'qrLogin' && (
                  <div className="panel qr-panel active">
                    <div className="panel-header">
                      <p className="eyebrow">Autenticação web</p>
                      <p className="panel-title">Escaneie com o app</p>
                      <p className="panel-sub">Abra o MEX no celular e escaneie para autenticar.</p>
                    </div>
                    <div className="qr-wrap"><img src={qrImg} alt="QR Code de autenticação" /></div>
                    <div className="qr-steps">
                      <div className="qr-step"><div className="qr-step-num">1</div><span>Abra o app <strong style={{color:'var(--text)'}}>MEX</strong> no celular</span></div>
                      <div className="qr-step"><div className="qr-step-num">2</div><span>Toque em <strong style={{color:'var(--text)'}}>Exchanges → Web</strong></span></div>
                      <div className="qr-step"><div className="qr-step-num">3</div><span>Aponte a câmera para o QR Code acima</span></div>
                    </div>
                    <div className="qr-status"><div className="status-dot"></div><span>{qrStatus}</span></div>
                    <button className="btn-ghost" onClick={startQrLoginFlow}>Gerar novo QR</button>
                  </div>
                )}
                {/* Painel Sucesso */}
                {panel === 'success' && (
                  <div className="panel state-panel active">
                    <div className="state-icon-wrap success">
                      <svg viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <p className="state-title">Exchange conectada!</p>
                    <p className="state-sub">Credenciais salvas com segurança. Conecte mais uma ou feche esta aba.</p>
                    <div className="state-actions">
                      <button className="btn-ghost" onClick={connectAnother}>Conectar outra exchange</button>
                      <button className="btn-ghost" onClick={()=>window.close()}>Fechar aba</button>
                    </div>
                  </div>
                )}
                {/* Painel Expirado */}
                {panel === 'expired' && (
                  <div className="panel state-panel active">
                    <div className="state-icon-wrap warn">
                      <svg viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    </div>
                    <p className="state-title">Sessão expirada</p>
                    <p className="state-sub">Este QR Code não é mais válido. Abra o app MEX e gere um novo.</p>
                  </div>
                )}
                {/* Painel Inválido */}
                {panel === 'invalid' && (
                  <div className="panel state-panel active">
                    <div className="state-icon-wrap danger">
                      <svg viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    </div>
                    <p className="state-title">Link inválido</p>
                    <p className="state-sub">Este link não é válido ou expirou. Abra o app MEX e gere um novo QR code.</p>
                  </div>
                )}
                {/* Painel Revogado */}
                {panel === 'revoked' && (
                  <div className="panel state-panel active">
                    <div className="state-icon-wrap warn">
                      <svg viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    </div>
                    <p className="state-title">Sessão encerrada</p>
                    <p className="state-sub">O app MEX encerrou esta sessão web. Escaneie um novo QR code para continuar.</p>
                    <div className="state-actions">
                      <button className="btn-ghost" onClick={handleNewQr}>Novo QR Code</button>
                    </div>
                  </div>
                )}
                {/* Painel Formulário */}
                {panel === 'form' && (
                  <>
                  {/* Badge sessão */}
                  {sessionToken && (
                    <div className="session-badge visible">
                      <svg viewBox="0 0 24 24"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
                      <span>Sessão: {sessionToken.slice(0,8)}…</span>
                    </div>
                  )}
                  {/* Alerta de erro */}
                  {alert && (
                    <div className="alert error visible" role="alert">
                      <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      <span>{alert}</span>
                    </div>
                  )}
                  <h2 className="panel-title">Conectar exchange</h2>
                  <p className="panel-sub">Selecione a exchange e cole suas chaves de API.</p>
                  <div className="exchange-grid">
                    {EXCHANGES.map(exc => (
                      <button key={exc.id} className={`exc-btn${selected===exc.id?' selected':''}`} onClick={()=>setSelected(exc.id)}>
                        <img src={exc.icon} alt={exc.name} className="exc-btn-img" />
                        <div className="exc-name">{exc.name}</div>
                      </button>
                    ))}
                  </div>
                  <div className="divider"></div>
                  <form autoComplete="off" className="connect-form" onSubmit={handleSubmit}>
                    <div className="field">
                      <label htmlFor="apiKey">API Key *</label>
                      <div className="input-wrap">
                        <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
                        <textarea id="apiKey" placeholder="Cole sua API Key aqui" rows={2} spellCheck={false} autoCorrect="off" autoCapitalize="off" value={apiKey} onChange={e=>setApiKey(e.target.value)} />
                      </div>
                    </div>
                    <div className="field">
                      <label htmlFor="apiSecret">API Secret *</label>
                      <div className="input-wrap">
                        <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        <textarea id="apiSecret" placeholder="Cole seu API Secret aqui" rows={2} spellCheck={false} autoCorrect="off" autoCapitalize="off" value={apiSecret} onChange={e=>setApiSecret(e.target.value)} />
                      </div>
                    </div>
                    {/* Passphrase se necessário */}
                    {selected && EXCHANGES.find(e=>e.id===selected)?.passphrase && (
                      <div className="field">
                        <label htmlFor="passphrase">Passphrase *</label>
                        <div className="input-wrap">
                          <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',width:14,height:14}}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                          <input type="password" id="passphrase" placeholder="Passphrase da exchange" autoComplete="off" value={passphrase} onChange={e=>setPassphrase(e.target.value)} />
                        </div>
                        <p className="hint">Esta exchange exige uma passphrase além da API Key e Secret.</p>
                      </div>
                    )}
                    {/* UID se necessário */}
                    {selected && EXCHANGES.find(e=>e.id===selected)?.uid && (
                      <div className="field">
                        <label htmlFor="uid">{EXCHANGES.find(e=>e.id===selected)?.uidLabel || 'Memo (UID)'} *</label>
                        <div className="input-wrap">
                          <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',width:14,height:14}}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                          <input type="text" id="uid" inputMode="numeric" placeholder={`Cole seu ${EXCHANGES.find(e=>e.id===selected)?.uidLabel || 'Memo (UID)'}`} autoComplete="off" value={uid} onChange={e=>setUid(e.target.value)} />
                        </div>
                        <p className="hint">{EXCHANGES.find(e=>e.id===selected)?.uidHint || 'Número de identificação da sua conta.'}</p>
                      </div>
                    )}
                    <button className="btn-primary" type="submit">Conectar exchange</button>
                    <div className="security-notice">
                      <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                      <p>Chaves criptografadas de ponta a ponta. O MEX nunca solicita permissão de saque.</p>
                    </div>
                  </form>
                </>
              )}
            </div>
          </section>
          <p className="page-footer" style={{ marginTop: 32, textAlign: 'center', color: '#23272f', fontSize: 15 }}>
            mex.app.br &nbsp;·&nbsp; <a href="https://mex.app.br/privacy-policy" target="_blank">Privacidade</a> &nbsp;·&nbsp; <a href="https://mex.app.br/terms" target="_blank">Termos</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ConnectPage;
