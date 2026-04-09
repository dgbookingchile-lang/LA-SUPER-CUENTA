import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  MessageCircle, Send, Wallet, TrendingUp, TrendingDown,
  Check, X, Loader2, User, Users, RefreshCw, AlertCircle,
  Settings, Star, Building2, History, BookOpen, Trash2, Calendar,
  Download, Activity, Clock, Edit2, Percent, Camera, ImagePlus, CheckCircle2, LayoutDashboard, Briefcase, PlusCircle, BarChart3, Lock, Mail, LogOut
} from 'lucide-react';
import { auth, db, getCollection, getDocRef } from './firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { onSnapshot, addDoc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';

const GEMINI_MODEL = "gemini-2.0-flash";
const PROFILE_COLORS = ['bg-emerald-500', 'bg-amber-500', 'bg-cyan-500', 'bg-pink-500', 'bg-rose-500', 'bg-blue-500'];
const DEFAULT_ACCOUNTS = [
  { id: 'cash_usd', name: 'Efectivo USD', currency: 'USD', balances: { personal: 0, b1: 0 }, color: 'bg-emerald-100 text-emerald-600', icon: '💵' },
  { id: 'cash_bs', name: 'Efectivo BS', currency: 'BS', balances: { personal: 0, b1: 0 }, color: 'bg-orange-100 text-orange-600', icon: '💸' },
  { id: 'bancos_vef', name: 'Bancos Nac.', currency: 'BS', balances: { personal: 0, b1: 0 }, color: 'bg-blue-100 text-blue-600', icon: '🏦' },
  { id: 'binance', name: 'Binance', currency: 'USD', balances: { personal: 0, b1: 0 }, color: 'bg-yellow-100 text-yellow-600', icon: '🪙' }
];

const EMOJI_LIBRARY = [
  '👨‍💻', '🧔', '👩‍💻', '👱', '👦', '👧', '👨‍🚀', '🦸', '🥷', '🕵',
  '👽', '👾', '🤖', '👻', '🤡', '🦁', '🦊', '🦉', '🐶', '🐼',
  '🐱', '🐭', '🐰', '🐻', '🐯', '🚀', '💎', '🔥', '⚡', '👑'
];

export default function App() {
  const [authScreen, setAuthScreen] = useState('loading'); // 'loading' | 'login' | 'register' | 'app'
  const [activeTab, setActiveTab] = useState('chat');
  const [fbUser, setFbUser] = useState(null);

  const [activeAuthorId, setActiveAuthorId] = useState('u1');
  const [userNames, setUserNames] = useState({ u1: 'Dani', u2: 'Ruby' });
  const [userIcons, setUserIcons] = useState({ u1: '👨‍💻', u2: '👩‍💻' });
  const [businesses, setBusinesses] = useState([{ id: 'b1', name: 'Cantina' }]);
  const [activeProfile, setActiveProfile] = useState('consolidado');
  const [exchangeRate, setExchangeRate] = useState(36.50);
  const [spread, setSpread] = useState(0);
  const [showActualUSD, setShowActualUSD] = useState(true);

  // lastUpdate y lastUpdater se almacenan en Firestore y se leen de settingsDoc si se necesitan
  const [toast, setToast] = useState(null);

  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [debts, setDebts] = useState([]);
  const [ratesHistory, setRatesHistory] = useState([]);
  const [messages, setMessages] = useState([
    { id: 1, text: '¡Hola! Bienvenid@ a tu espacio financiero. Selecciona tu perfil y bóveda antes de registrar un movimiento.', sender: 'bot', timestamp: new Date() }
  ]);

  const [isTyping, setIsTyping] = useState(false);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [isLoadingRate, setIsLoadingRate] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [iconSelectorFor, setIconSelectorFor] = useState(null);

  const [tempRate, setTempRate] = useState("36.50");
  const [tempSpread, setTempSpread] = useState("0");
  const [tempUserNames, setTempUserNames] = useState({ u1: 'Dani', u2: 'Ruby' });
  const [tempUserIcons, setTempUserIcons] = useState({ u1: '👨‍💻', u2: '👩‍💻' });
  const [tempBusinesses, setTempBusinesses] = useState([{ id: 'b1', name: 'Cantina' }]);

  const [inputText, setInputText] = useState('');
  const [pendingTransaction, setPendingTransaction] = useState(null);
  const [reportFilter, setReportFilter] = useState('semana');
  const [customDates, setCustomDates] = useState({ start: '', end: '' });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const [debtForm, setDebtForm] = useState({ creditor: '', amount: '', profile: 'personal' });
  const [txToDelete, setTxToDelete] = useState(null);
  const [txToEdit, setTxToEdit] = useState(null);
  const [retroConfig, setRetroConfig] = useState({ isRetro: false, date: '', affectsBalance: true, histRate: null, loading: false });

  const [reviewItems, setReviewItems] = useState([]);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  const currentEffectiveRate = useMemo(() => activeProfile !== 'personal' && activeProfile !== 'consolidado' ? exchangeRate * (1 + spread / 100) : exchangeRate, [activeProfile, exchangeRate, spread]);

  const getProfileName = (id) => {
    if (id === 'personal') return 'Personal';
    const biz = businesses.find(item => item.id === id);
    return biz ? String(biz.name) : 'Desconocido';
  };

  const getAuthorInfo = (authorIdOrName) => {
    const isU2 = authorIdOrName === 'u2' || authorIdOrName === userNames.u2;
    const name = isU2 ? userNames.u2 : userNames.u1;
    const icon = isU2 ? userIcons.u2 : userIcons.u1;
    const colorClass = isU2 ? 'bg-orange-50 text-orange-600 border border-orange-100' : 'bg-purple-50 text-purple-600 border border-purple-100';
    return { id: isU2 ? 'u2' : 'u1', name: String(name), icon: String(icon), initial: String(name).charAt(0).toUpperCase(), colorClass };
  };

  const safeDateSplit = (isoString) => {
    if (!isoString) return '';
    return String(isoString).includes('T') ? String(isoString).split('T')[0] : String(isoString);
  };

  const viewTransactions = useMemo(() => {
    return activeProfile === 'consolidado' ? transactions : transactions.filter(tx => tx.perfil === activeProfile);
  }, [transactions, activeProfile]);

  const totals = useMemo(() => viewTransactions.reduce((acc, curr) => {
    const txDate = new Date(curr.date);
    const now = new Date();
    if (txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear()) {
      acc[curr.type] += curr.amount;
    }
    return acc;
  }, { income: 0, expense: 0 }), [viewTransactions]);

  const getAccountBalance = (acc) => {
    if (activeProfile === 'consolidado') {
      return Object.values(acc.balances || {}).reduce((sum, val) => sum + (val || 0), 0);
    }
    return acc.balances?.[activeProfile] || 0;
  };

  const totalPatrimonio = useMemo(() => accounts.reduce((sum, acc) => sum + getAccountBalance(acc), 0), [accounts, activeProfile]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFbUser(user);
      if (user) {
        setAuthScreen('app');
        localStorage.setItem('f_auth_session', 'active');
      } else {
        setAuthScreen('login');
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!fbUser || authScreen !== 'app') return;
    const unsubTx = onSnapshot(getCollection('transactions'), snap => {
      setTransactions(snap.docs.map(d => {
        const data = d.data();
        if (data.perfil === 'negocio') data.perfil = 'b1';
        return { ...data, fbid: d.id };
      }).sort((a, b) => new Date(b.date) - new Date(a.date)));
    });
    const unsubDebts = onSnapshot(getCollection('debts'), snap => {
      setDebts(snap.docs.map(d => {
        const data = d.data();
        if (data.profile === 'negocio') data.profile = 'b1';
        return { ...data, fbid: d.id };
      }).sort((a, b) => new Date(b.date) - new Date(a.date)));
    });
    const unsubRates = onSnapshot(getCollection('rates_history'), snap => setRatesHistory(snap.docs.map(d => d.data())));
    const unsubState = onSnapshot(getCollection('app_state'), snap => {
      const accDoc = snap.docs.find(d => d.id === 'accounts_doc');
      if (accDoc?.data()?.items) {
        const migratedAccs = accDoc.data().items.map(acc => {
          if (acc.balances) return acc;
          return { ...acc, balances: { personal: acc.balance_personal || 0, b1: acc.balance_negocio || 0 } };
        });
        setAccounts(migratedAccs);
      } else {
        syncAccounts(DEFAULT_ACCOUNTS);
      }
      
      const settingsDoc = snap.docs.find(d => d.id === 'settings_doc')?.data();
      if (settingsDoc) {
        if (settingsDoc.exchangeRate) { setExchangeRate(settingsDoc.exchangeRate); setTempRate(String(settingsDoc.exchangeRate)); }
        if (settingsDoc.spread !== undefined) { setSpread(settingsDoc.spread); setTempSpread(String(settingsDoc.spread)); }
        // last_updated_at and last_updated_by are stored in Firestore but not needed in local state
        if (settingsDoc.userNames) { setUserNames(settingsDoc.userNames); setTempUserNames(settingsDoc.userNames); }
        if (settingsDoc.userIcons) { setUserIcons(settingsDoc.userIcons); setTempUserIcons(settingsDoc.userIcons); }
        if (settingsDoc.businesses && settingsDoc.businesses.length > 0) {
          setBusinesses(settingsDoc.businesses); setTempBusinesses(settingsDoc.businesses);
        }
      }
    });
    return () => { unsubTx(); unsubDebts(); unsubRates(); unsubState(); };
  }, [fbUser, authScreen]);

  useEffect(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), [messages, isTyping, pendingTransaction, isAnalyzingImage]);

  useEffect(() => {
    const lookupRate = async () => {
      if (!retroConfig.isRetro || !retroConfig.date) return;
      setRetroConfig(prev => ({ ...prev, loading: true }));
      const record = ratesHistory.find(r => r.date === retroConfig.date);
      let baseRate = record ? record.rate : Math.max(10, exchangeRate - (Math.floor((new Date() - new Date(retroConfig.date)) / 86400000) * 0.025));
      const finalRate = pendingTransaction?.perfil !== 'personal' ? baseRate * (1 + spread / 100) : baseRate;
      setRetroConfig(prev => ({ ...prev, histRate: parseFloat(finalRate.toFixed(2)), loading: false }));
    };
    lookupRate();
  }, [retroConfig.date, retroConfig.isRetro, ratesHistory, exchangeRate, spread, pendingTransaction?.perfil]);

  const addBotMsg = (text) => setMessages(prev => [...prev, { id: Date.now(), text: String(text), sender: 'bot', timestamp: new Date() }]);
  const showToast = (message, type = 'success') => { setToast({ message: String(message), type }); setTimeout(() => setToast(null), 4000); };
  
  const handleAuth = async (e) => {
    e?.preventDefault();
    setIsAuthenticating(true);
    try {
      if (authScreen === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
        showToast("Sesión iniciada exitosamente", "success");
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
        showToast("Cuenta creada exitosamente", "success");
      }
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setIsAuthenticating(false);
    }
  };

  const signInWithGoogle = async () => {
    setIsAuthenticating(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      showToast("Sesión iniciada exitosamente", "success");
    } catch(error) {
      showToast(error.message, "error");
    } finally {
      setIsAuthenticating(false);
    }
  }

  const handleLogout = async () => {
    await signOut(auth);
    localStorage.removeItem('f_auth_session');
    setShowSettings(false);
  };

  const syncAccounts = (newAccounts) => {
    setAccounts(newAccounts);
    setDoc(getDocRef('app_state', 'accounts_doc'), { items: newAccounts }).catch(console.error);
  };

  const fetchOfficialRate = async (isManualForced = false) => {
    setIsLoadingRate(true);
    try {
      const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
      const data = await res.json();
      if (data?.promedio) {
        const now = new Date().toISOString();
        const updater = isManualForced ? getAuthorInfo(activeAuthorId).name : 'Sistema Auto';
        setDoc(getDocRef('app_state', 'settings_doc'), { exchangeRate: data.promedio, spread, last_updated_at: now, last_updated_by: updater }, { merge: true });
        addDoc(getCollection('rates_history'), { date: now.split('T')[0], rate: data.promedio, timestamp: now });
        if (isManualForced) showToast(`Tasa actualizada: ${data.promedio} VEF/USD`);
        else addBotMsg(`✅ Tasa BCV Oficial sincronizada: ${data.promedio} BS.`);
      }
    } catch (e) {
      if (isManualForced) showToast("Error conectando al BCV.", 'error'); else addBotMsg("⚠ Error conectando al BCV.");
    } finally { setIsLoadingRate(false); }
  };

  const saveSettings = () => {
    const r = parseFloat(tempRate) || exchangeRate;
    const s = parseFloat(tempSpread) || 0;
    
    const finalU1 = tempUserNames.u1.trim().substring(0, 12) || 'Dani';
    const finalU2 = tempUserNames.u2.trim().substring(0, 12) || 'Ruby';
    const finalIcons = { u1: tempUserIcons.u1 || '👨‍💻', u2: tempUserIcons.u2 || '👩‍💻' };
    
    const finalBusinesses = tempBusinesses
      .filter(b => String(b.name).trim() !== '')
      .map(b => ({ ...b, name: String(b.name).trim().substring(0, 18) }));
    if (finalBusinesses.length === 0) finalBusinesses.push({ id: 'b1', name: 'Negocio Principal' });
    
    setDoc(getDocRef('app_state', 'settings_doc'), {
      exchangeRate: r, spread: s, userNames: { u1: finalU1, u2: finalU2 }, userIcons: finalIcons, businesses: finalBusinesses,
      last_updated_at: new Date().toISOString(), last_updated_by: getAuthorInfo(activeAuthorId).name
    }, { merge: true });
    
    setUserNames({ u1: finalU1, u2: finalU2 });
    setUserIcons(finalIcons);
    setBusinesses(finalBusinesses);
    setIconSelectorFor(null);
    
    if (activeProfile !== 'personal' && activeProfile !== 'consolidado' && !finalBusinesses.find(b => b.id === activeProfile)) {
      setActiveProfile('consolidado');
    }
    setShowSettings(false);
    showToast(`Ajustes guardados exitosamente`);
  };

  const fetchGeminiAI = async (prompt, base64Data = null, mimeType = null) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error('VITE_GEMINI_API_KEY no configurada');
    const parts = [{ text: prompt }];
    if (base64Data && mimeType) parts.push({ inlineData: { mimeType, data: base64Data } });
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: "application/json" } })
    });
    if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || (base64Data ? "[]" : "{}");
    try {
      return JSON.parse(rawText);
    } catch (parseErr) {
      console.error('Gemini JSON parse error:', rawText);
      // Try to extract JSON from markdown code blocks
      const match = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) return JSON.parse(match[1].trim());
      throw parseErr;
    }
  };

  const updateAccountBalance = (accId, pKey, amount, operation, accList = accounts) => {
    return accList.map(acc => {
      if (acc.id === accId) {
        const balances = { ...acc.balances };
        let bal = balances[pKey] || 0;
        if (operation === 'set') bal = amount;
        else if (operation === 'add') bal += amount;
        else if (operation === 'subtract') bal -= amount;
        balances[pKey] = bal;
        return { ...acc, balances };
      }
      return acc;
    });
  };

  const clearPendingTx = () => {
    setPendingTransaction(null);
    setRetroConfig({ isRetro: false, date: '', affectsBalance: true, histRate: null, loading: false });
  };

  const handleChatSubmit = async (e) => {
    e?.preventDefault();
    if (!inputText.trim()) return;
    
    const userInput = inputText;
    setMessages(prev => [...prev, { id: Date.now(), text: userInput, sender: 'user', timestamp: new Date() }]);
    setInputText('');
    setIsTyping(true);
    
    const targetProfile = activeProfile === 'consolidado' ? 'personal' : activeProfile;
    const businessListStr = businesses.map(b => `${b.id} (${b.name})`).join(', ');
    
    const prompt = `Eres el asistente financiero "LA SUPER CUENTA". Autor actual: "${getAuthorInfo(activeAuthorId).name}". 
Perfiles válidos: personal, ${businessListStr}. Perfil sugerido por defecto: "${targetProfile}". Tasa actual: ${currentEffectiveRate} BS/USD.
Cuentas disponibles: cash_usd (Efectivo USD), cash_bs (Efectivo BS), bancos_vef (Bancos Nac.), binance (Binance).
Si el usuario menciona una fecha pasada, extráela en formato YYYY-MM-DD.
El usuario dice: "${userInput}"
Responde ÚNICAMENTE un JSON válido (sin markdown, sin explicación): {"monto": number, "moneda": "USD" | "BS", "tipo": "gasto" | "ingreso" | "ajuste_saldo", "cuenta_id": string|null, "categoria": string, "concepto": string, "fecha_pasada": string|null, "perfil_id": string}`;
    
    try {
      const data = await fetchGeminiAI(prompt);
      if (data.monto !== undefined || data.tipo === 'ajuste_saldo') {
        data.perfil = data.perfil_id && (data.perfil_id === 'personal' || businesses.find(b => b.id === data.perfil_id)) ? data.perfil_id : targetProfile;
        setRetroConfig({ isRetro: !!data.fecha_pasada, date: data.fecha_pasada || '', affectsBalance: !data.fecha_pasada, histRate: null, loading: false });
        setPendingTransaction(data);
        addBotMsg(`Detecté ${data.monto} ${data.moneda} (${data.tipo}) para ${getProfileName(data.perfil)}. Revisa y confirma.`);
      } else addBotMsg("No pude interpretar la instrucción.");
    } catch (e) { addBotMsg("Error de IA. Intenta de nuevo."); } finally { setIsTyping(false); }
  };

  const confirmTx = async () => {
    if (!pendingTransaction?.cuenta_id || !fbUser) return;
    const { tipo, cuenta_id, concepto, categoria, perfil, monto, moneda } = pendingTransaction;
    const finalRate = retroConfig.isRetro ? (retroConfig.histRate || currentEffectiveRate) : currentEffectiveRate;
    const amountUSD = moneda === 'BS' ? parseFloat((monto / finalRate).toFixed(2)) : parseFloat(monto);
    
    if (retroConfig.affectsBalance) {
      const operation = tipo === 'ajuste_saldo' ? 'set' : (tipo === 'ingreso' ? 'add' : 'subtract');
      syncAccounts(updateAccountBalance(cuenta_id, perfil, amountUSD, operation));
    }
    
    if (tipo !== 'ajuste_saldo') {
      const txDate = retroConfig.isRetro && retroConfig.date ? new Date(`${retroConfig.date}T12:00:00Z`).toISOString() : new Date().toISOString();
      addDoc(getCollection('transactions'), {
        amount: amountUSD, type: tipo === 'ingreso' ? 'income' : 'expense', category: String(categoria || 'General'), concept: String(concepto || `Movimiento`),
        date: txDate, registration_date: new Date().toISOString(), is_retroactive: retroConfig.isRetro, affects_balance: retroConfig.affectsBalance,
        monto_original: monto, moneda_original: String(moneda), tasa_historica: finalRate, cuenta_id: String(cuenta_id), perfil: String(perfil), author: activeAuthorId
      }).catch(console.error);
    }
    clearPendingTx();
    addBotMsg(`✅ Registro completado.`);
  };

  const confirmDeleteTx = async () => {
    if (!txToDelete || !fbUser) return;
    if (txToDelete.affects_balance !== false && txToDelete.cuenta_id) {
      syncAccounts(updateAccountBalance(txToDelete.cuenta_id, txToDelete.perfil, txToDelete.amount, txToDelete.type === 'expense' ? 'add' : 'subtract'));
    }
    await deleteDoc(getDocRef('transactions', txToDelete.fbid)).catch(console.error);
    addBotMsg(`🗑 Transacción borrada por ${getAuthorInfo(activeAuthorId).name}.`); setTxToDelete(null);
  };

  const confirmEditTx = async () => {
    if (!txToEdit || !fbUser) return;
    const oldTx = txToEdit;
    const newMonto = parseFloat(txToEdit.monto_original) || 0;
    const editRate = oldTx.tasa_historica || currentEffectiveRate || 1;
    const newAmountUSD = oldTx.moneda_original === 'BS' ? parseFloat((newMonto / editRate).toFixed(2)) : newMonto;
    
    if (oldTx.affects_balance !== false) {
      let updatedAccs = [...accounts];
      if (oldTx.cuenta_id) updatedAccs = updateAccountBalance(oldTx.cuenta_id, oldTx.perfil, oldTx.amount, oldTx.type === 'expense' ? 'add' : 'subtract', updatedAccs);
      if (txToEdit.cuenta_id) updatedAccs = updateAccountBalance(txToEdit.cuenta_id, txToEdit.perfil, newAmountUSD, oldTx.type === 'expense' ? 'subtract' : 'add', updatedAccs);
      syncAccounts(updatedAccs);
    }
    
    const { fbid: _ignoreId, ...txWithoutFbid } = oldTx;
    const updatedTx = { ...txWithoutFbid, amount: newAmountUSD, monto_original: newMonto, concept: String(txToEdit.concept), date: new Date(`${txToEdit.dateStr}T12:00:00Z`).toISOString(), author: String(txToEdit.author), cuenta_id: String(txToEdit.cuenta_id), perfil: String(txToEdit.perfil), last_edited_by: activeAuthorId, last_edited_at: new Date().toISOString() };
    await updateDoc(getDocRef('transactions', oldTx.fbid), updatedTx).catch(console.error);
    addBotMsg(`✏ Transacción editada con éxito.`); setTxToEdit(null);
  };

  const handleDebtSubmit = async (e) => {
    e.preventDefault();
    if (!debtForm.creditor || !debtForm.amount || !fbUser) return;
    await addDoc(getCollection('debts'), { creditor: String(debtForm.creditor), amountUSD: parseFloat(debtForm.amount) || 0, profile: String(debtForm.profile), date: new Date().toISOString(), author: activeAuthorId }).catch(console.error);
    setDebtForm({ creditor: '', amount: '', profile: 'personal' });
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = String(reader.result).split(',')[1];
      setIsAnalyzingImage(true);
      addBotMsg('📸 Procesando imagen... Extrayendo datos y segmentando gastos.');
      
      const prompt = `Experto financiero.
      1. Factura: Extrae comercio, monto total y moneda (USD/BS). Retorna 1 objeto.
      2. Chat: Segmenta. Por cada gasto, crea un objeto.
      JSON ARRAY estricto: [{"monto": numero, "moneda": "USD"|"BS", "concepto": "string", "tipo": "gasto", "fecha_pasada": "YYYY-MM-DD"|null}]`;
      
      try {
        const data = await fetchGeminiAI(prompt, base64String, file.type);
        if (Array.isArray(data) && data.length > 0) {
          const preparedItems = data.map((item, i) => ({
            ...item,
            id: `draft_${Date.now()}_${i}`,
            perfil: activeProfile === 'consolidado' ? 'personal' : activeProfile,
            cuenta_id: '',
            dateStr: item.fecha_pasada ? safeDateSplit(item.fecha_pasada) : new Date().toISOString().split('T')[0]
          }));
          setReviewItems(preparedItems);
          addBotMsg(`📊 Extraje ${preparedItems.length} registro(s). Revisa y confirma.`);
        } else addBotMsg("⚠ No logré detectar gastos claros en la imagen.");
      } catch (err) { addBotMsg("🚨 Error procesando la imagen."); } finally { setIsAnalyzingImage(false); e.target.value = ''; }
    };
    reader.readAsDataURL(file);
  };

  const removeReviewItem = id => {
    setReviewItems(prev => prev.filter(i => i.id !== id));
  }
  
  const updateReviewItem = (id, field, value) => {
    setReviewItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  }

  const confirmReviewBatch = async () => {
    if (reviewItems.some(i => !i.cuenta_id)) {
      showToast("Debes seleccionar una cuenta para todos los registros.", 'error'); return;
    }
    let updatedAccs = [...accounts];
    for (const item of reviewItems) {
      const amountUSD = item.moneda === 'BS' ? parseFloat((item.monto / currentEffectiveRate).toFixed(2)) : parseFloat(item.monto);
      updatedAccs = updateAccountBalance(item.cuenta_id, item.perfil, amountUSD, 'subtract', updatedAccs);
      await addDoc(getCollection('transactions'), {
        amount: amountUSD, type: 'expense', category: 'General', concept: String(item.concepto || `Movimiento Extraído`),
        date: new Date(`${item.dateStr}T12:00:00Z`).toISOString(), registration_date: new Date().toISOString(),
        is_retroactive: false, affects_balance: true, monto_original: parseFloat(item.monto), moneda_original: String(item.moneda),
        tasa_historica: currentEffectiveRate, cuenta_id: String(item.cuenta_id), perfil: String(item.perfil), author: activeAuthorId
      }).catch(console.error);
    }
    syncAccounts(updatedAccs);
    addBotMsg(`✅ Se guardaron ${reviewItems.length} registros exitosamente.`);
    setReviewItems([]);
  };

  const reportData = useMemo(() => {
    const today = new Date();
    let start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    let end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    if (reportFilter === 'semana') {
      const day = today.getDay() || 7;
      start = new Date(start);
      start.setDate(start.getDate() - day + 1);
    }
    else if (reportFilter === '15dias') { start = new Date(start); start.setDate(start.getDate() - 15); }
    else if (reportFilter === 'mes') start = new Date(today.getFullYear(), today.getMonth(), 1);
    else if (reportFilter === 'custom') {
      if (customDates.start) start = new Date(`${customDates.start}T00:00:00`);
      if (customDates.end) end = new Date(`${customDates.end}T23:59:59`);
    }
    const periodTxs = viewTransactions.filter(tx => { const d = new Date(tx.date); return d >= start && d <= end && tx.type === 'expense'; });
    
    let totalUSD = 0, sumRates = 0;
    const expenseByProfile = { personal: 0 };
    businesses.forEach(b => expenseByProfile[b.id] = 0);
    
    periodTxs.forEach(tx => {
      totalUSD += tx.amount;
      sumRates += (tx.tasa_historica || exchangeRate);
      expenseByProfile[tx.perfil] = (expenseByProfile[tx.perfil] || 0) + tx.amount;
    });
    
    const rates = periodTxs.map(tx => tx.tasa_historica || exchangeRate);
    const rateVariance = rates.length >= 2 ? ((rates[rates.length-1] - rates[0]) / rates[0]) * 100 : 0;
    const avgDaily = totalUSD / Math.max(1, Math.ceil((Math.min(new Date().getTime(), end.getTime()) - start.getTime()) / 86400000));
    
    return { totalUSD, totalVES: totalUSD * (rates.length ? sumRates / rates.length : exchangeRate), avgDaily, expenseByProfile, rateVariance, txCount: periodTxs.length, periodTxs };
  }, [viewTransactions, reportFilter, customDates, exchangeRate, businesses]);

  const exportCSV = () => {
    const csv = "data:text/csv;charset=utf-8,Fecha,Concepto,Monto_USD,Monto_VES,Perfil\n" + reportData.periodTxs.map(t=>`${new Date(t.date).toLocaleDateString()},${String(t.concept).replace(/,/g,'')},${t.amount.toFixed(2)},${(t.amount*(t.tasa_historica||exchangeRate)).toFixed(2)},${t.perfil}`).join("\n");
    const link = document.createElement("a"); link.href = encodeURI(csv); link.download = `Reporte_${reportFilter}.csv`; link.click();
  };

  const renderTransactionCard = (tx, showActions = false) => {
    const txMontoOrig = tx.monto_original || tx.amount; const isBS = (tx.moneda_original || 'USD') === 'BS';
    const histUSD = isBS ? txMontoOrig / (tx.tasa_historica || exchangeRate) : txMontoOrig;
    const actUSD = isBS ? txMontoOrig / currentEffectiveRate : txMontoOrig;
    const dev = histUSD - actUSD; const isIncome = tx.type === 'income';
    const authorData = getAuthorInfo(tx.author);
    const profileName = getProfileName(tx.perfil);
    return (
      <div key={tx.fbid} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_4px_20px_rgb(0,0,0,0.06)] transition-shadow group mb-3">
        <div className="flex justify-between items-start mb-3">
          <div className="flex gap-3 items-center w-full">
            <div className={`p-2.5 rounded-2xl shrink-0 ${isIncome ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-50 text-slate-500'}`}>
              {isIncome ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-slate-900 tracking-tight leading-none mb-1.5 flex items-center gap-2 truncate">
                <span className="truncate">{String(tx.concept)}</span>
                <span title={authorData.name} className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[10px] shadow-sm ${authorData.colorClass}`}>
                  {authorData.icon}
                </span>
                {activeProfile === 'consolidado' && <span className="text-[8px] font-black uppercase bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md truncate max-w-[60px]">{profileName}</span>}
              </h4>
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400 font-medium tracking-wide">
                {new Date(tx.date).toLocaleDateString()}
                {tx.is_retroactive && <span className="flex items-center gap-0.5 bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-md font-bold"><Clock className="w-2 h-2" /> {new Date(tx.registration_date).toLocaleDateString()}</span>}
                {tx.affects_balance === false && <span className="bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-md font-bold">Sin descuento</span>}
              </div>
            </div>
            {showActions && (
              <div className="flex gap-0.5 opacity-40 group-hover:opacity-100 transition-opacity shrink-0">
                <button type="button" onClick={() => setTxToEdit({...tx, dateStr: safeDateSplit(tx.date)})} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"><Edit2 className="w-4 h-4" /></button>
                <button type="button" onClick={() => setTxToDelete(tx)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-between items-end pt-3 border-t border-slate-50">
          <div>
            <p className="text-xs font-bold text-slate-400">{isIncome ? '+' : '-'} {txMontoOrig.toLocaleString('es-VE')} {tx.moneda_original || 'USD'}</p>
            {isBS && <p className="text-[9px] text-slate-400 font-medium mt-0.5">Hist: {(tx.tasa_historica || exchangeRate).toFixed(2)}</p>}
          </div>
          <div className="text-right">
            <p className={`text-xl font-black tracking-tighter ${isIncome ? 'text-emerald-500' : 'text-slate-900'}`}>{isIncome ? '+' : '-'}${showActualUSD ? actUSD.toFixed(2) : histUSD.toFixed(2)}</p>
            {isBS && Math.abs(dev) > 0.01 && (
              <div className={`flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md mt-1 justify-end ${dev > 0 ? 'text-rose-500 bg-rose-50' : 'text-emerald-500 bg-emerald-50'}`}>
                {dev > 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />} {dev > 0 ? 'Pérdida:' : 'Ganancia:'} ${Math.abs(dev).toFixed(2)}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (authScreen === 'loading') {
    return (
      <div className="flex flex-col h-screen bg-slate-900 items-center justify-center text-white">
        <Star className="w-12 h-12 text-yellow-400 mb-6 animate-pulse" />
        <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
      </div>
    );
  }

  if (authScreen === 'login' || authScreen === 'register') {
    return (
      <div className="flex flex-col h-screen bg-slate-50 max-w-md mx-auto shadow-2xl relative overflow-hidden font-sans">
        {toast && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-4 fade-in duration-300 pointer-events-none w-[90%] max-w-[350px]">
            <div className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl shadow-xl font-black text-[10px] uppercase tracking-widest ${toast.type === 'error' ? 'bg-rose-500 text-white' : 'bg-slate-900 text-white'}`}>
              {toast.type === 'error' ? <AlertCircle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
              <span className="leading-tight">{toast.message}</span>
            </div>
          </div>
        )}
        <div className="flex-1 flex flex-col justify-center px-8 relative z-10">
          <div className="bg-yellow-400 w-16 h-16 rounded-3xl shadow-lg flex items-center justify-center mb-8 rotate-12 mx-auto">
            <Star className="w-8 h-8 text-slate-900 fill-slate-900" />
          </div>
          <div className="text-center mb-10">
            <h1 className="text-3xl font-black tracking-tighter text-slate-900 mb-2">La Super Cuenta</h1>
            <p className="text-sm font-bold text-slate-400">Control total de tus finanzas colaborativas.</p>
          </div>
          <form onSubmit={handleAuth} className="space-y-4 mb-6">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block ml-1">Correo Electrónico</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="correo@gmail.com" className="w-full bg-white p-4 pl-11 rounded-2xl font-bold text-sm text-slate-900 border border-slate-200 outline-none focus:border-slate-400 focus:shadow-sm transition-all" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block ml-1">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="••••••••" className="w-full bg-white p-4 pl-11 rounded-2xl font-bold text-sm text-slate-900 border border-slate-200 outline-none focus:border-slate-400 focus:shadow-sm transition-all" />
              </div>
            </div>
            <button type="submit" disabled={isAuthenticating} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-xl shadow-slate-900/20 active:scale-95 transition-all flex justify-center items-center gap-2 mt-4 disabled:opacity-70">
              {isAuthenticating ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> {authScreen === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}</>}
            </button>
          </form>
          <div className="flex items-center gap-4 mb-6 opacity-60">
            <div className="flex-1 h-px bg-slate-300"></div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">O ingresa con</span>
            <div className="flex-1 h-px bg-slate-300"></div>
          </div>
          <button type="button" onClick={signInWithGoogle} className="w-full bg-white text-slate-700 py-4 rounded-2xl font-black text-sm border border-slate-200 shadow-sm active:scale-95 transition-all flex justify-center items-center gap-3 hover:bg-slate-50">
            <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/><path d="M1 1h22v22H1z" fill="none"/></svg>
            Continuar con Google
          </button>
          <div className="text-center mt-8">
            <button onClick={() => setAuthScreen(authScreen === 'login' ? 'register' : 'login')} className="text-[11px] font-bold text-slate-500 hover:text-slate-900 transition-colors">
              {authScreen === 'login' ? '¿No tienes cuenta? Regístrate aquí' : '¿Ya tienes cuenta? Inicia sesión'}
            </button>
          </div>
        </div>
        <div className="absolute -top-20 -left-20 w-64 h-64 bg-indigo-400 rounded-full blur-[100px] opacity-20 pointer-events-none"></div>
        <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-emerald-400 rounded-full blur-[100px] opacity-20 pointer-events-none"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 max-w-md mx-auto shadow-2xl relative overflow-hidden font-sans border-x border-slate-200">
      {toast && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-4 fade-in duration-300 pointer-events-none w-[90%] max-w-[350px]">
          <div className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl shadow-xl font-black text-[10px] uppercase tracking-widest ${toast.type === 'error' ? 'bg-rose-500 text-white' : 'bg-slate-900 text-white'}`}>
            {toast.type === 'error' ? <AlertCircle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
            <span className="leading-tight">{toast.message}</span>
          </div>
        </div>
      )}

      <header className="bg-white px-6 pt-8 pb-4 z-30 flex flex-col gap-4 border-b border-slate-100 shrink-0 shadow-sm">
        <div className="flex justify-between items-center">
          <div className="flex bg-slate-100 p-1 rounded-full items-center max-w-[75%]">
            <button type="button" onClick={() => setActiveAuthorId('u1')} title={userNames.u1} className={`flex-1 min-w-0 max-w-[110px] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-full transition-all truncate flex items-center justify-center ${activeAuthorId === 'u1' ? 'bg-white shadow-sm text-purple-600' : 'text-slate-400 hover:text-slate-600'}`}>
              <span className="mr-1 text-sm leading-none">{userIcons.u1}</span><span className="truncate">{userNames.u1}</span>
            </button>
            <button type="button" onClick={() => setActiveAuthorId('u2')} title={userNames.u2} className={`flex-1 min-w-0 max-w-[110px] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-full transition-all truncate flex items-center justify-center ${activeAuthorId === 'u2' ? 'bg-white shadow-sm text-orange-600' : 'text-slate-400 hover:text-slate-600'}`}>
              <span className="mr-1 text-sm leading-none">{userIcons.u2}</span><span className="truncate">{userNames.u2}</span>
            </button>
          </div>
          <button type="button" onClick={() => setShowSettings(true)} className="w-9 h-9 flex items-center justify-center bg-slate-50 text-slate-400 rounded-full hover:bg-slate-100 hover:text-slate-900 transition-colors shrink-0">
            <Settings className="w-4 h-4" />
          </button>
        </div>

        <div className="flex justify-between items-end">
          <div>
            <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1.5 flex items-center gap-1">
              La Super Cuenta <Star className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />
            </p>
            <h1 className="text-2xl font-black tracking-tighter text-slate-900 leading-none truncate max-w-[180px]">
              {activeProfile === 'consolidado' ? 'Consolidado' : getProfileName(activeProfile)}
            </h1>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-1.5 mb-1">
              <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Tasa Hoy</p>
              <button type="button" onClick={() => fetchOfficialRate(true)} disabled={isLoadingRate} className="text-slate-300 hover:text-slate-900 transition-colors">
                <RefreshCw className={`w-3 h-3 ${isLoadingRate ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <p className="text-xl font-black text-emerald-500 leading-none tracking-tight">
              {currentEffectiveRate.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-hide snap-x">
          <button type="button" onClick={() => setActiveProfile('consolidado')} className={`shrink-0 flex items-center gap-1.5 px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all snap-start border ${activeProfile === 'consolidado' ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
            <LayoutDashboard className="w-3.5 h-3.5" /> Consolidado
          </button>
          <button type="button" onClick={() => setActiveProfile('personal')} className={`shrink-0 flex items-center gap-1.5 px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all snap-start border ${activeProfile === 'personal' ? 'bg-indigo-500 text-white border-indigo-500 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
            <User className="w-3.5 h-3.5" /> Personal
          </button>
          {businesses.map((b, idx) => (
            <button type="button" key={b.id} onClick={() => setActiveProfile(b.id)} className={`shrink-0 flex items-center gap-1.5 px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all snap-start border ${activeProfile === b.id ? `${PROFILE_COLORS[idx % PROFILE_COLORS.length]} text-white border-transparent shadow-md` : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
              <Building2 className="w-3.5 h-3.5" /> {b.name}
            </button>
          ))}
        </div>
      </header>

      {reviewItems.length > 0 && (
        <div className="absolute inset-0 bg-slate-900/95 backdrop-blur-md z-50 flex flex-col p-4 overflow-hidden">
          <div className="flex justify-between items-center mb-6 pt-4 text-white">
            <div>
              <h3 className="text-xl font-black flex items-center gap-2"><ImagePlus className="w-6 h-6 text-yellow-400" /> Revisión IA</h3>
              <p className="text-xs font-bold text-slate-400 mt-1">Verifica los datos extraídos.</p>
            </div>
            <button type="button" onClick={() => setReviewItems([])} className="p-2 bg-white/10 rounded-full hover:bg-rose-500 transition-colors"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-4 pb-32 scrollbar-hide">
            {reviewItems.map((item, index) => (
              <div key={item.id} className="bg-white rounded-3xl p-5 shadow-xl animate-in fade-in slide-in-from-bottom-4" style={{animationDelay: `${index*100}ms`}}>
                <div className="flex justify-between items-start mb-4">
                  <span className="bg-slate-900 text-white text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-widest">Registro {index + 1}</span>
                  <button type="button" onClick={() => removeReviewItem(item.id)} className="text-rose-500 p-1.5 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="space-y-4">
                  <input value={item.concepto} onChange={e=>updateReviewItem(item.id, 'concepto', e.target.value)} className="w-full text-lg font-black text-slate-800 border-b border-slate-100 focus:border-slate-900 outline-none pb-2 transition-colors" placeholder="Descripción del Gasto" />
                  <div className="flex gap-4">
                    <div className="w-2/3"><label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Monto</label><input type="number" step="0.01" value={item.monto} onChange={e=>updateReviewItem(item.id, 'monto', e.target.value)} className="w-full font-bold text-slate-900 bg-slate-50 border border-slate-100 p-3 rounded-xl outline-none focus:border-slate-300" /></div>
                    <div className="w-1/3"><label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Moneda</label><select value={item.moneda} onChange={e=>updateReviewItem(item.id, 'moneda', e.target.value)} className="w-full font-bold text-slate-900 bg-slate-50 border border-slate-100 p-3 rounded-xl outline-none focus:border-slate-300"><option value="USD">USD</option><option value="BS">BS</option></select></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 flex items-center gap-1 block">Bóveda <AlertCircle className="w-3 h-3 text-rose-500" /></label>
                      <select value={item.cuenta_id} onChange={e=>updateReviewItem(item.id, 'cuenta_id', e.target.value)} className={`w-full font-bold text-xs p-3 rounded-xl outline-none transition-colors border ${!item.cuenta_id ? 'border-rose-400 bg-rose-50 text-rose-700' : 'border-slate-100 bg-slate-50 text-slate-900'}`}><option value="" disabled>Seleccione...</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                    </div>
                    <div><label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Perfil</label><select value={item.perfil} onChange={e=>updateReviewItem(item.id, 'perfil', e.target.value)} className="w-full font-bold text-xs text-slate-900 bg-slate-50 border border-slate-100 p-3 rounded-xl outline-none"><option value="personal">Personal</option>{businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-slate-900 via-slate-900/90 to-transparent">
            <button type="button" onClick={confirmReviewBatch} className="w-full bg-white text-slate-900 font-black uppercase tracking-widest py-4 rounded-2xl shadow-xl flex justify-center items-center gap-2 active:scale-95 transition-all hover:bg-slate-50">
              <Check className="w-5 h-5" /> Guardar Todos ({reviewItems.length})
            </button>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-7 w-full shadow-[0_20px_60px_rgb(0,0,0,0.1)] max-h-[90vh] overflow-y-auto scrollbar-hide relative">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black tracking-tight text-slate-900">Configuración</h3>
              <button type="button" onClick={()=>setShowSettings(false)} className="p-2 bg-slate-50 text-slate-400 rounded-full hover:bg-slate-100 hover:text-slate-900 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="mb-6 pb-6 border-b border-slate-100 relative">
              <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-500" /> Perfiles & Avatares
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Usuario 1</label>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setIconSelectorFor(iconSelectorFor === 'u1' ? null : 'u1')} className="w-12 h-12 shrink-0 rounded-xl bg-purple-50 flex items-center justify-center text-xl border border-purple-100 hover:bg-purple-100 transition-colors shadow-sm">
                      {tempUserIcons.u1}
                    </button>
                    <input type="text" maxLength={12} placeholder="Ej: Dani" value={tempUserNames.u1} onChange={e=>setTempUserNames({...tempUserNames, u1: e.target.value})} className="w-full bg-slate-50 p-3.5 rounded-xl font-bold text-sm text-slate-900 border border-slate-100 outline-none focus:border-indigo-400 focus:bg-white transition-all" />
                  </div>
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Usuario 2</label>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setIconSelectorFor(iconSelectorFor === 'u2' ? null : 'u2')} className="w-12 h-12 shrink-0 rounded-xl bg-orange-50 flex items-center justify-center text-xl border border-orange-100 hover:bg-orange-100 transition-colors shadow-sm">
                      {tempUserIcons.u2}
                    </button>
                    <input type="text" maxLength={12} placeholder="Ej: Gus" value={tempUserNames.u2} onChange={e=>setTempUserNames({...tempUserNames, u2: e.target.value})} className="w-full bg-slate-50 p-3.5 rounded-xl font-bold text-sm text-slate-900 border border-slate-100 outline-none focus:border-indigo-400 focus:bg-white transition-all" />
                  </div>
                </div>
              </div>
              
              {iconSelectorFor && (
                <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-200 animate-in fade-in slide-in-from-top-2">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Selecciona un Avatar</span>
                    <button type="button" onClick={() => setIconSelectorFor(null)} className="text-slate-400"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="grid grid-cols-6 gap-2">
                    {EMOJI_LIBRARY.map(emoji => (
                      <button type="button" key={emoji} onClick={() => { setTempUserIcons({...tempUserIcons, [iconSelectorFor]: emoji}); setIconSelectorFor(null); }} className="text-2xl hover:scale-125 transition-transform p-1 rounded-lg hover:bg-white shadow-sm">
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mb-6 pb-6 border-b border-slate-100">
              <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-emerald-500" /> Entidades de Negocio
              </h4>
              <div className="space-y-3 mb-3">
                {tempBusinesses.map((b, index) => (
                  <div key={b.id} className="flex gap-2 items-center">
                    <input type="text" maxLength={18} placeholder="Nombre del Negocio" value={b.name} onChange={e => {
                      const updated = [...tempBusinesses]; updated[index].name = e.target.value; setTempBusinesses(updated);
                    }} className="flex-1 bg-slate-50 p-3.5 rounded-xl font-bold text-sm text-slate-900 border border-slate-100 outline-none focus:border-emerald-400 focus:bg-white transition-all" />
                    {tempBusinesses.length > 1 && (
                      <button type="button" onClick={() => setTempBusinesses(tempBusinesses.filter(tb => tb.id !== b.id))} className="p-3 text-rose-400 hover:bg-rose-50 rounded-xl transition-colors"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setTempBusinesses([...tempBusinesses, { id: `b${Date.now()}`, name: '' }])} className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1.5 p-2 hover:bg-emerald-50 rounded-lg transition-colors">
                <PlusCircle className="w-3.5 h-3.5" /> Añadir Negocio
              </button>
            </div>

            <div className="space-y-5">
              <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                <Percent className="w-4 h-4 text-amber-500" /> Tasa y Configuración
              </h4>
              <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Tasa BCV Oficial (BS)</label><input type="number" step="0.01" value={tempRate} onChange={e=>setTempRate(e.target.value)} className="w-full bg-slate-50 p-4 rounded-2xl font-black text-2xl text-slate-900 border border-slate-100 outline-none focus:border-slate-300 focus:bg-white transition-all" /></div>
              <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Spread Negocios (%)</label><input type="number" step="0.01" value={tempSpread} onChange={e=>setTempSpread(e.target.value)} className="w-full bg-slate-50 p-4 rounded-2xl font-black text-2xl text-slate-900 border border-slate-100 outline-none focus:border-slate-300 focus:bg-white transition-all" /></div>
              
              <div className="pt-4 grid gap-3">
                <button type="button" onClick={() => fetchOfficialRate(true)} disabled={isLoadingRate} className="w-full flex items-center justify-center gap-2 bg-slate-50 text-slate-600 p-4 rounded-2xl font-bold text-[10px] uppercase tracking-widest hover:bg-slate-100 hover:text-slate-900 transition-colors disabled:opacity-50">
                  {isLoadingRate ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Sincronizar BCV Oficial
                </button>
                <button type="button" onClick={saveSettings} className="w-full bg-slate-900 text-white p-4 rounded-2xl font-black tracking-widest uppercase text-xs hover:bg-slate-800 active:scale-95 transition-all">Guardar Cambios</button>
                
                <button type="button" onClick={handleLogout} className="w-full bg-rose-50 text-rose-600 p-4 rounded-2xl font-black tracking-widest uppercase text-xs hover:bg-rose-100 active:scale-95 transition-all flex items-center justify-center gap-2 mt-4 border border-rose-100">
                  <LogOut className="w-4 h-4" /> Cerrar Sesión
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {txToEdit && (
        <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-[2rem] p-8 w-full shadow-[0_20px_60px_rgb(0,0,0,0.1)]">
            <div className="flex justify-between items-center mb-6"><h3 className="text-lg font-black tracking-tight text-slate-900">Editar Registro</h3><button type="button" onClick={()=>setTxToEdit(null)} className="p-2 bg-slate-50 text-slate-400 rounded-full hover:bg-slate-100 transition-colors"><X className="w-5 h-5" /></button></div>
            <div className="space-y-4">
              <div><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Concepto</label><input value={txToEdit.concept} onChange={e=>setTxToEdit({...txToEdit, concept: e.target.value})} className="w-full bg-slate-50 p-3.5 rounded-xl text-sm font-bold text-slate-900 border border-slate-100 outline-none focus:bg-white focus:border-slate-300 transition-all" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Monto ({txToEdit.moneda_original})</label><input type="number" step="0.01" value={txToEdit.monto_original} onChange={e=>setTxToEdit({...txToEdit, monto_original: e.target.value})} className="w-full bg-slate-50 p-3.5 rounded-xl text-sm font-bold text-slate-900 border border-slate-100 outline-none focus:bg-white focus:border-slate-300 transition-all" /></div>
                <div><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Fecha Real</label><input type="date" value={txToEdit.dateStr} onChange={e=>setTxToEdit({...txToEdit, dateStr: e.target.value})} className="w-full bg-slate-50 p-3.5 rounded-xl text-sm font-bold text-slate-900 border border-slate-100 outline-none focus:bg-white focus:border-slate-300 transition-all" /></div>
              </div>
              <div><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Perfil / Entidad</label><select value={txToEdit.perfil} onChange={e=>setTxToEdit({...txToEdit, perfil: e.target.value})} className="w-full bg-slate-50 p-3.5 rounded-xl text-sm font-bold text-slate-900 border border-slate-100 outline-none focus:bg-white focus:border-slate-300 transition-all"><option value="personal">Personal</option>{businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Bóveda</label><select value={txToEdit.cuenta_id} onChange={e=>setTxToEdit({...txToEdit, cuenta_id: e.target.value})} className="w-full bg-slate-50 p-3.5 rounded-xl text-sm font-bold text-slate-900 border border-slate-100 outline-none focus:bg-white focus:border-slate-300 transition-all">{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
                <div><label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Autor</label><select value={txToEdit.author} onChange={e=>setTxToEdit({...txToEdit, author: e.target.value})} className="w-full bg-slate-50 p-3.5 rounded-xl text-sm font-bold text-slate-900 border border-slate-100 outline-none focus:bg-white focus:border-slate-300 transition-all"><option value="u1">{userNames.u1}</option><option value="u2">{userNames.u2}</option></select></div>
              </div>
              <button type="button" onClick={confirmEditTx} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest mt-4 active:scale-95 transition-transform hover:bg-slate-800">Guardar Cambios</button>
            </div>
          </div>
        </div>
      )}

      {txToDelete && (
        <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-[2rem] p-8 w-full text-center shadow-[0_20px_60px_rgb(0,0,0,0.1)]">
            <div className="bg-rose-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"><Trash2 className="w-8 h-8 text-rose-500" /></div>
            <h3 className="text-xl font-black tracking-tight text-slate-900 mb-2">¿Borrar registro?</h3>
            <p className="text-xs text-slate-500 mb-8 leading-relaxed">Se eliminará permanentemente y el monto será devuelto a tu saldo si afectó bóvedas.</p>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={confirmDeleteTx} className="bg-rose-500 text-white py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest active:scale-95 transition-transform hover:bg-rose-600">Sí, Borrar</button>
              <button type="button" onClick={()=>setTxToDelete(null)} className="bg-slate-50 text-slate-600 py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest active:scale-95 transition-transform hover:bg-slate-100">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-hidden relative">
        <div className={`absolute inset-0 flex flex-col transition-all duration-300 ${activeTab === 'chat' ? 'translate-x-0' : '-translate-x-full opacity-0'}`}>
          <div className="flex-1 overflow-y-auto p-5 space-y-5 pb-40 scrollbar-hide">
            {messages.map(m => (
              <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-4 rounded-3xl text-[13px] leading-relaxed shadow-sm ${m.sender === 'user' ? 'bg-slate-900 text-white rounded-br-sm' : 'bg-white border border-slate-100 text-slate-700 rounded-bl-sm'}`}>
                  {m.text}
                </div>
              </div>
            ))}
            {(isTyping || isAnalyzingImage) && (
              <div className="flex gap-1.5 p-4 bg-white w-fit rounded-3xl rounded-bl-sm border border-slate-100 shadow-sm items-center">
                <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce"></div><div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div><div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                {isAnalyzingImage && <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Visión IA...</span>}
              </div>
            )}
            
            {pendingTransaction && (
              <div className="bg-white p-6 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-slate-100 mt-2">
                <div className="flex justify-between items-start mb-5">
                  <div className="bg-slate-50 p-2 rounded-xl text-slate-500"><Wallet className="w-5 h-5" /></div>
                  <select value={pendingTransaction.perfil} onChange={e => setPendingTransaction({...pendingTransaction, perfil: e.target.value})} className="text-[9px] font-black uppercase text-slate-700 tracking-widest bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 outline-none focus:border-slate-400">
                    <option value="personal">Personal</option>
                    {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <h4 className="text-4xl font-black tracking-tighter mb-1 text-slate-900">{pendingTransaction.tipo === 'gasto' ? '-' : '+'}${pendingTransaction.moneda === 'BS' ? (pendingTransaction.monto / (retroConfig.isRetro ? (retroConfig.histRate||currentEffectiveRate) : currentEffectiveRate)).toFixed(2) : pendingTransaction.monto}</h4>
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-6">{pendingTransaction.concepto} ({pendingTransaction.monto} {pendingTransaction.moneda})</p>
                
                <div className="mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={retroConfig.isRetro} onChange={e => setRetroConfig(p => ({...p, isRetro: e.target.checked}))} className="w-3.5 h-3.5 accent-slate-900 rounded-sm" /> ¿Movimiento pasado?
                  </label>
                  {retroConfig.isRetro && (
                    <div className="mt-4 pl-4 border-l-2 border-slate-200 space-y-3">
                      <input type="date" value={retroConfig.date} onChange={e => setRetroConfig(p => ({...p, date: e.target.value}))} className="w-full bg-white p-3 rounded-xl text-xs font-bold border border-slate-100 outline-none text-slate-700" />
                      <div className="bg-white p-3 rounded-xl text-[10px] font-bold text-slate-500 border border-slate-100 flex justify-between items-center">
                        <span className="uppercase tracking-widest">Tasa Histórica</span>
                        {retroConfig.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span className="text-slate-900">{retroConfig.histRate || currentEffectiveRate} BS</span>}
                      </div>
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-600 cursor-pointer mt-4 pt-4 border-t border-slate-200/60">
                    <input type="checkbox" checked={retroConfig.affectsBalance} onChange={e => setRetroConfig(p => ({...p, affectsBalance: e.target.checked}))} className="w-3.5 h-3.5 accent-slate-900 rounded-sm" /> ¿Descontar del saldo actual?
                  </label>
                </div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3 text-center">Selecciona Bóveda Origen/Destino</p>
                <div className="grid grid-cols-2 gap-2.5 mb-6">
                  {accounts.map(acc => (
                    <button type="button" key={acc.id} onClick={() => setPendingTransaction({...pendingTransaction, cuenta_id: acc.id})} className={`p-3.5 rounded-2xl flex flex-col items-center gap-1.5 transition-all border ${pendingTransaction.cuenta_id === acc.id ? 'border-slate-900 bg-slate-900 text-white shadow-md' : 'border-slate-100 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}>
                      <span className="text-xl">{acc.icon}</span><span className="text-[9px] font-black uppercase tracking-widest text-center">{acc.name}</span>
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={confirmTx} disabled={!pendingTransaction.cuenta_id || (retroConfig.isRetro && !retroConfig.date)} className="bg-emerald-500 text-white py-4 rounded-2xl font-black text-[11px] tracking-widest uppercase disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-emerald-600 active:scale-95 transition-all"><Check className="w-4 h-4" /> Confirmar</button>
                  <button type="button" onClick={clearPendingTx} className="bg-slate-100 text-slate-600 py-4 rounded-2xl font-black text-[11px] tracking-widest uppercase hover:bg-slate-200 active:scale-95 transition-all flex items-center justify-center gap-2"><X className="w-4 h-4" /> Cancelar</button>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          
          <div className="absolute bottom-[90px] left-0 right-0 px-5 pointer-events-none z-10">
            <form onSubmit={handleChatSubmit} className="flex gap-2.5 bg-white/90 backdrop-blur-xl p-2 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-slate-100 pointer-events-auto items-center">
              <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handleImageUpload} className="hidden" />
              <button type="button" onClick={() => fileInputRef.current?.click()} className="p-3 text-slate-400 hover:text-slate-900 hover:bg-slate-50 rounded-full transition-colors flex items-center justify-center shrink-0">
                <Camera className="w-5 h-5" />
              </button>
              <input value={inputText} onChange={e=>setInputText(e.target.value)} placeholder={`Ej: Ayer pagué 10$...`} className="flex-1 bg-transparent px-2 font-bold text-sm text-slate-900 outline-none placeholder:text-slate-400" />
              <button type="submit" className="bg-slate-900 text-white p-3.5 rounded-full shadow-md active:scale-95 transition-transform hover:bg-slate-800 shrink-0">
                <Send className="w-4 h-4 ml-0.5" />
              </button>
            </form>
          </div>
        </div>

        <div className={`absolute inset-0 overflow-y-auto p-6 pb-36 transition-all duration-300 scrollbar-hide ${activeTab === 'dashboard' ? 'translate-x-0' : 'translate-x-full opacity-0'}`}>
          <div className="bg-white p-7 rounded-[2rem] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] mb-6 relative overflow-hidden">
            <div className="absolute -right-6 -top-6 w-32 h-32 bg-slate-50 rounded-full blur-2xl opacity-60"></div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 relative z-10">Patrimonio Neto <span className={activeProfile === 'personal' ? 'text-indigo-400' : (activeProfile==='consolidado'?'text-slate-500':'text-emerald-400')}>[{activeProfile === 'consolidado' ? 'Total' : getProfileName(activeProfile)}]</span></p>
            <h2 className="text-5xl font-black tracking-tighter text-slate-900 mb-6 relative z-10">${totalPatrimonio.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</h2>
            
            <div className="flex gap-4 pt-6 border-t border-slate-50 relative z-10">
              <div className="flex-1">
                <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1.5 flex items-center gap-1"><TrendingUp className="w-3 h-3 text-emerald-500" /> Ingresos Mes</p>
                <p className="text-2xl font-black text-slate-800 tracking-tight">${totals.income.toFixed(0)}</p>
              </div>
              <div className="w-px bg-slate-100"></div>
              <div className="flex-1">
                <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1.5 flex items-center gap-1"><TrendingDown className="w-3 h-3 text-rose-500" /> Gastos Mes</p>
                <p className="text-2xl font-black text-slate-800 tracking-tight">${totals.expense.toFixed(0)}</p>
              </div>
            </div>
          </div>
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 ml-1">Desglose por Bóveda</h3>
          <div className="space-y-3">
            {accounts.map(acc => {
              const usd = getAccountBalance(acc);
              const nat = acc.currency === 'BS' ? usd * currentEffectiveRate : usd;
              return (
                <div key={acc.id} className="bg-white p-4 rounded-[2rem] border border-slate-100 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow group">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl bg-slate-50 border border-slate-100 group-hover:bg-slate-100 transition-colors`}>{acc.icon}</div>
                    <div>
                      <h4 className="font-bold text-slate-900 tracking-tight mb-0.5">{acc.name}</h4>
                      <p className="text-[11px] font-bold text-slate-400">{nat.toLocaleString('es-VE', {minimumFractionDigits: 2})} {acc.currency}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-black text-slate-900 tracking-tighter">${usd.toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">USD</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className={`absolute inset-0 overflow-y-auto p-6 pb-36 transition-all duration-300 scrollbar-hide ${activeTab === 'history' ? 'translate-x-0' : 'translate-x-full opacity-0'}`}>
          <div className="flex justify-between items-end mb-6">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Auditoría <span className={activeProfile === 'personal' ? 'text-indigo-400' : (activeProfile==='consolidado'?'text-slate-500':'text-emerald-400')}>[{activeProfile === 'consolidado' ? 'Total' : getProfileName(activeProfile)}]</span></p>
              <h2 className="text-3xl font-black tracking-tighter text-slate-900">Historial</h2>
            </div>
            <button type="button" onClick={() => setShowActualUSD(!showActualUSD)} className="flex items-center gap-1.5 bg-white px-3 py-2 rounded-xl shadow-sm border border-slate-100 text-[9px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-colors">
              {showActualUSD ? 'Hoy' : 'Orig.'} <RefreshCw className="w-3 h-3 text-slate-400" />
            </button>
          </div>
          <div className="space-y-3">{viewTransactions.map(tx => renderTransactionCard(tx, true))}</div>
        </div>

        <div className={`absolute inset-0 overflow-y-auto p-6 pb-36 transition-all duration-300 scrollbar-hide ${activeTab === 'debts' ? 'translate-x-0' : 'translate-x-full opacity-0'}`}>
          <div className="mb-6">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Cuentas por Pagar</p>
            <h2 className="text-3xl font-black tracking-tighter text-slate-900">Pasivos</h2>
          </div>
          <form onSubmit={handleDebtSubmit} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 mb-6">
            <div className="space-y-4">
              <div><label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">¿A quién le debemos?</label><input value={debtForm.creditor} onChange={e=>setDebtForm({...debtForm, creditor: e.target.value})} className="w-full bg-slate-50 p-3.5 rounded-xl text-sm font-bold text-slate-900 border border-slate-100 outline-none focus:bg-white focus:border-slate-300 transition-all" required /></div>
              <div className="flex gap-4">
                <div className="w-1/2"><label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Monto (USD)</label><input type="number" step="0.01" value={debtForm.amount} onChange={e=>setDebtForm({...debtForm, amount: e.target.value})} className="w-full bg-slate-50 p-3.5 rounded-xl text-sm font-bold text-slate-900 border border-slate-100 outline-none focus:bg-white focus:border-slate-300 transition-all" required /></div>
                <div className="w-1/2"><label className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Responsable</label><select value={debtForm.profile} onChange={e=>setDebtForm({...debtForm, profile: e.target.value})} className="w-full bg-slate-50 p-3.5 rounded-xl text-sm font-bold text-slate-900 border border-slate-100 outline-none focus:bg-white focus:border-slate-300 transition-all"><option value="personal">Personal</option>{businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
              </div>
              <button type="submit" className="w-full bg-slate-900 text-white font-black tracking-widest uppercase text-xs py-4 rounded-2xl active:scale-95 transition-transform hover:bg-slate-800 mt-2">Registrar Deuda</button>
            </div>
          </form>
          <div className="space-y-3">
            {debts.filter(d => activeProfile === 'consolidado' || d.profile === activeProfile).map(debt => {
              const authorData = getAuthorInfo(debt.author);
              return (
              <div key={debt.fbid} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] flex justify-between items-center group">
                <div>
                  <div className="flex gap-2 items-center mb-1.5">
                    <h4 className="font-bold text-slate-900 tracking-tight">{debt.creditor}</h4>
                    <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${debt.profile === 'personal' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>{getProfileName(debt.profile)}</span>
                  </div>
                  <div className="flex gap-1.5 items-center">
                    <span title={authorData.name} className={`w-5 h-5 rounded-full flex justify-center items-center text-[10px] font-black shadow-sm ${authorData.colorClass}`}>{authorData.icon}</span>
                    <p className="text-[10px] text-slate-400 font-medium tracking-wide">{new Date(debt.date).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex gap-3 items-center">
                  <div className="text-right">
                    <p className="text-xl font-black text-rose-500 tracking-tighter">-${debt.amountUSD.toFixed(2)}</p>
                    <p className="text-[9px] font-bold text-slate-400 tracking-widest">≈ {(debt.amountUSD * currentEffectiveRate).toLocaleString('es-VE')} BS</p>
                  </div>
                  <button type="button" onClick={() => deleteDoc(getDocRef('debts', debt.fbid)).catch(console.error)} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all opacity-40 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            )})}
          </div>
        </div>

        <div className={`absolute inset-0 overflow-y-auto p-6 pb-36 transition-all duration-300 scrollbar-hide ${activeTab === 'reports' ? 'translate-x-0' : 'translate-x-full opacity-0'}`}>
          <div className="flex justify-between items-end mb-6">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1"><BarChart3 className="w-3 h-3" /> Analítico <span className={activeProfile === 'personal' ? 'text-indigo-400' : (activeProfile==='consolidado'?'text-slate-500':'text-emerald-400')}>[{activeProfile === 'consolidado' ? 'Total' : getProfileName(activeProfile)}]</span></p>
              <h2 className="text-3xl font-black tracking-tighter text-slate-900">Reportes</h2>
            </div>
            <button type="button" onClick={exportCSV} className="bg-white text-slate-900 border border-slate-200 p-2.5 rounded-xl shadow-sm active:scale-95 flex items-center gap-2 hover:bg-slate-50 transition-colors">
              <Download className="w-4 h-4" /> <span className="text-[9px] font-black uppercase tracking-widest hidden sm:inline">Exportar CSV</span>
            </button>
          </div>
          
          <div className="bg-slate-100 p-1.5 rounded-2xl flex mb-6">
            {['semana', '15dias', 'mes', 'custom'].map(f => (
              <button type="button" key={f} onClick={() => setReportFilter(f)} className={`flex-1 py-2.5 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all ${reportFilter === f ? 'bg-white text-slate-900 shadow-[0_2px_10px_rgb(0,0,0,0.04)]' : 'text-slate-400 hover:text-slate-600'}`}>{f}</button>
            ))}
          </div>
          {reportFilter === 'custom' && (
            <div className="flex gap-3 mb-6 animate-in slide-in-from-top-2">
              <input type="date" value={customDates.start} onChange={e=>setCustomDates(p=>({ ...p, start: e.target.value }))} className="w-1/2 bg-white p-3 rounded-xl text-xs font-bold text-slate-700 border border-slate-100 outline-none focus:border-slate-300" />
              <input type="date" value={customDates.end} onChange={e=>setCustomDates(p=>({ ...p, end: e.target.value }))} className="w-1/2 bg-white p-3 rounded-xl text-xs font-bold text-slate-700 border border-slate-100 outline-none focus:border-slate-300" />
            </div>
          )}
          
          <div className="bg-slate-900 p-7 rounded-[2rem] text-white shadow-[0_20px_40px_rgb(0,0,0,0.1)] mb-6 relative overflow-hidden">
            <Activity className="w-48 h-48 absolute -right-10 -bottom-10 opacity-5" />
            <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2 relative z-10">Gasto Total del Periodo</p>
            <h3 className="text-5xl font-black tracking-tighter mb-2 relative z-10">${reportData.totalUSD.toFixed(2)}</h3>
            <p className="text-[11px] font-bold opacity-70 tracking-widest relative z-10">≈ {reportData.totalVES.toLocaleString('es-VE', {minimumFractionDigits: 2})} BS</p>
          </div>
          
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Promedio Diario</p><p className="text-2xl font-black text-slate-900 tracking-tight">${reportData.avgDaily.toFixed(2)}</p></div>
            <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Variación Tasa</p><p className={`text-2xl font-black tracking-tight ${reportData.rateVariance > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{reportData.rateVariance > 0 ? '+' : ''}{reportData.rateVariance.toFixed(1)}%</p></div>
          </div>
          
          {activeProfile === 'consolidado' && (
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm mb-6">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Distribución Multi-Empresa</p>
              <div className="flex h-4 rounded-full overflow-hidden mb-4">
                <div style={{width: `${reportData.totalUSD === 0 ? 50 : (reportData.expenseByProfile['personal'] / reportData.totalUSD) * 100}%`}} className="bg-indigo-500 transition-all duration-1000"></div>
                {businesses.map((b, idx) => (
                  <div key={b.id} style={{width: `${reportData.totalUSD === 0 ? 0 : (reportData.expenseByProfile[b.id] / reportData.totalUSD) * 100}%`}} className={`${PROFILE_COLORS[idx % PROFILE_COLORS.length]} transition-all duration-1000 border-l border-white/20`}></div>
                ))}
              </div>
              <div className="flex flex-col gap-2 text-[10px] font-black uppercase tracking-widest">
                <div className="flex justify-between items-center"><span className="text-indigo-600 flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-indigo-500"></div>Personal</span><span>${(reportData.expenseByProfile['personal'] || 0).toFixed(0)}</span></div>
                {businesses.map((b, idx) => (
                  <div key={b.id} className="flex justify-between items-center"><span className={`flex items-center gap-1.5 ${PROFILE_COLORS[idx % PROFILE_COLORS.length].replace('bg-', 'text-')}`}><div className={`w-2 h-2 rounded-full ${PROFILE_COLORS[idx % PROFILE_COLORS.length]}`}></div>{b.name}</span><span>${(reportData.expenseByProfile[b.id] || 0).toFixed(0)}</span></div>
                ))}
              </div>
            </div>
          )}
          
          <div className="space-y-3">{reportData.periodTxs.map(tx => renderTransactionCard(tx, false))}</div>
        </div>
      </main>

      <nav className="bg-white/80 backdrop-blur-xl border-t border-slate-100 px-6 py-4 pb-8 flex justify-between items-center z-40 absolute bottom-0 w-full">
        {[ {id: 'chat', icon: MessageCircle, label: 'Chat'}, {id: 'dashboard', icon: Wallet, label: 'Bóvedas'}, {id: 'history', icon: History, label: 'Auditoría'}, {id: 'debts', icon: BookOpen, label: 'Pasivos'}, {id: 'reports', icon: Calendar, label: 'Reportes'} ].map(tab => (
          <button type="button" key={tab.id} onClick={()=>setActiveTab(tab.id)} className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === tab.id ? 'text-slate-900 scale-105' : 'text-slate-400 hover:text-slate-600'}`}>
            <tab.icon className={`w-6 h-6 transition-all ${activeTab === tab.id ? 'stroke-[2.5px]' : 'stroke-2'}`} />
            <div className={`w-1 h-1 rounded-full transition-all ${activeTab === tab.id ? 'bg-slate-900' : 'bg-transparent'}`} />
          </button>
        ))}
      </nav>
    </div>
  );
}
