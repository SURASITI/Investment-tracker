import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  writeBatch,
  Timestamp,
  getDocFromServer
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth, signIn, logOut } from './firebase';
import { AgentView } from './components/AgentView';
import { Transaction, TransactionType, Currency, PortfolioItem } from './types';
import { cn } from './lib/utils';
import { 
  Plus, 
  Search, 
  LogOut, 
  TrendingUp, 
  Filter, 
  Trash2, 
  Edit2, 
  ChevronDown, 
  DollarSign, 
  PieChart, 
  History,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  X,
  FileJson,
  Download,
  Bot
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { ErrorBoundary } from './components/ErrorBoundary';
import { INITIAL_DATA } from './constants/initialData';

const TICKER_DOMAINS: Record<string, string> = {
  AAPL: 'apple.com',
  MSFT: 'microsoft.com',
  GOOGL: 'google.com',
  AMZN: 'amazon.com',
  NVDA: 'nvidia.com',
  META: 'meta.com',
  TSLA: 'tesla.com',
  AMD: 'amd.com',
  PLTR: 'palantir.com',
  SOFI: 'sofi.com',
  ORCL: 'oracle.com',
  RKLB: 'rocketlabusa.com',
  O: 'realtyincome.com',
  VOO: 'vanguard.com',
  JEPQ: 'jpmorgan.com',
  TQQQ: 'proshares.com',
  INTC: 'intel.com',
  MELI: 'mercadolibre.com',
  BLK: 'blackrock.com',
  HOOD: 'robinhood.com',
  ASTS: 'ast-science.com',
  FLNC: 'fluenceenergy.com',
  PATH: 'uipath.com',
  UNH: 'unitedhealthgroup.com',
  BBAI: 'bigbear.ai',
  JMIA: 'jumia.com',
  OSCR: 'hioscar.com',
  VRT: 'vertiv.com',
  MRK: 'merck.com',
  LRCX: 'lamresearch.com',
  HIMS: 'forhims.com',
  ELV: 'elevancehealth.com',
  NNE: 'nano-nuclear.com',
  NOK: 'nokia.com',
  VST: 'vistraenergy.com',
  PL: 'planet.com',
  BMNR: 'biomarin.com',
  STRL: 'sterlingconstructionco.com',
  CLPT: 'clearpointneuro.com',
  APLD: 'applieddigital.com',
  AXON: 'axon.com',
  OSS: 'onestopsystems.com',
  TE: 'te.com',
  SIDU: 'sidusspace.com',
  TEM: 'tempus.com',
  TGLS: 'tecoglass.com',
  RDW: 'redwirespace.com',
  LEU: 'centrusenergy.com',
  EOSE: 'eose.com',
  ONDS: 'ondas.com',
  GEV: 'gevernova.com',
  RBRK: 'rubrik.com',
  CTM: 'castellanomining.com',
  RCAT: 'redcatdevices.com',
  TMDX: 'transmedics.com',
  NVTS: 'navitassemi.com',
};

const TickerLogo = ({ ticker, className }: { ticker: string, className?: string }) => {
  const [sourceIndex, setSourceIndex] = useState(0);
  const domain = TICKER_DOMAINS[ticker?.toUpperCase()];
  
  useEffect(() => {
    setSourceIndex(0);
  }, [ticker]);

  if (!ticker || ticker === '—') return null;

  const t = ticker.toUpperCase();
  const sources = [
    domain ? `https://logo.clearbit.com/${domain}` : null,
    domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128` : null,
    `https://financialmodelingprep.com/image-stock/${t}.png`,
    `https://financialmodelingprep.com/image-stock/${t}.jpg`,
    `https://assets.parqet.com/logos/symbol/${t}?format=png`
  ].filter(Boolean) as string[];

  const colors = [
    'bg-blue-500', 'bg-rose-500', 'bg-emerald-500', 'bg-amber-500', 
    'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-cyan-500',
    'bg-teal-500', 'bg-fuchsia-500', 'bg-violet-500', 'bg-orange-500'
  ];
  let hash = 0;
  for (let i = 0; i < ticker.length; i++) {
    hash = ticker.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = colors[Math.abs(hash) % colors.length];

  if (sourceIndex < sources.length) {
    return (
      <img 
        src={sources[sourceIndex]} 
        alt={ticker}
        onError={() => setSourceIndex(prev => prev + 1)}
        className={cn("rounded-full object-contain bg-white shrink-0 p-0.5", className)}
      />
    );
  }

  return (
    <div className={cn(`flex items-center justify-center rounded-full text-white font-bold tracking-tighter shrink-0 ${color}`, className)}>
      {ticker.slice(0, 2).toUpperCase()}
    </div>
  );
};

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error' | null, message: string }>({ type: null, message: '' });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [activeTab, setActiveTab] = useState<'transactions' | 'portfolio' | 'agent'>('transactions');
  const [searchQuery, setSearchQuery] = useState('');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TransactionType | 'All'>('All');
  const [yearFilter, setYearFilter] = useState<string>('All');
  const [thbRate, setThbRate] = useState(33.5);
  const [showThbConverted, setShowThbConverted] = useState(false);

  // Auth Listener
  useEffect(() => {
    const testConnection = async () => {
      try {
        // Try to fetch a non-existent doc from server to verify connection
        await getDocFromServer(doc(db, '_connection_test_', 'dummy'));
        setConnectionError(null);
      } catch (error) {
        if (error instanceof Error && (error.message.includes('the client is offline') || error.message.includes('Internet connection'))) {
          setConnectionError("Could not reach Cloud Firestore. The app is running in offline mode. If this persists, please check your internet connection or try refreshing.");
        }
      }
    };
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Real-time Data Listener
  useEffect(() => {
    if (!user) {
      setTransactions([]);
      return;
    }

    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log(`Received snapshot with ${snapshot.docs.length} documents`);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Transaction[];
      
      // Sort client-side to avoid needing a composite index
      data.sort((a, b) => {
        const dateA = new Date(a.date.replace(' ', 'T')).getTime();
        const dateB = new Date(b.date.replace(' ', 'T')).getTime();
        return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
      });
      
      setTransactions(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'transactions');
    });

    return () => unsubscribe();
  }, [user]);

  // Portfolio Logic
  const portfolio = useMemo(() => {
    const map = new Map<string, PortfolioItem>();
    
    // Portfolio should always be all-time to show current holdings correctly
    transactions.forEach(r => {
      if (!r.ticker) return;
      
      const normalizedTicker = r.ticker.trim().toUpperCase();
      const normalizedType = r.type?.trim().toLowerCase() || '';
      
      if (!map.has(normalizedTicker)) {
        map.set(normalizedTicker, {
          ticker: normalizedTicker,
          totalCostUSD: 0,
          totalSharesBought: 0,
          totalSellUSD: 0,
          totalSharesSold: 0,
          sharesHeld: 0,
          avgCostPerShare: 0,
          avgSellPerShare: 0,
          realizedPL: 0,
          divNet: 0
        });
      }
      
      const item = map.get(normalizedTicker)!;
      const amount = r.amount || 0;
      const shares = r.shares || 0;
      const usdAmount = r.currency === 'THB' ? amount / thbRate : amount;

      if (normalizedType === 'buy') {
        item.totalCostUSD += usdAmount;
        item.totalSharesBought += shares;
      } else if (normalizedType === 'sell') {
        const sellProceeds = r.amount || (r.price && r.shares ? r.price * r.shares : 0);
        const sellUSD = r.currency === 'THB' ? sellProceeds / thbRate : sellProceeds;
        item.totalSellUSD += sellUSD;
        item.totalSharesSold += shares;
      } else if (normalizedType === 'dividend') {
        item.divNet += usdAmount;
      } else if (normalizedType === 'tax' || normalizedType === 'fee') {
        item.divNet -= Math.abs(usdAmount); // Subtract tax/fee from net dividends
      }
    });

    const results: PortfolioItem[] = [];
    map.forEach(item => {
      item.sharesHeld = item.totalSharesBought - item.totalSharesSold;
      item.avgCostPerShare = item.totalSharesBought > 0 ? item.totalCostUSD / item.totalSharesBought : 0;
      item.avgSellPerShare = item.totalSharesSold > 0 ? item.totalSellUSD / item.totalSharesSold : 0;
      item.realizedPL = item.totalSellUSD - (item.avgCostPerShare * item.totalSharesSold);
      results.push(item);
    });

    // Show any ticker that has had any activity
    return results.filter(r => r.totalCostUSD > 0 || r.totalSellUSD > 0 || r.divNet !== 0);
  }, [transactions, thbRate]);

  const filteredPortfolio = useMemo(() => {
    return portfolio.filter(item => 
      item.ticker.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [portfolio, searchQuery]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const matchesSearch = t.ticker?.toLowerCase().includes(searchQuery.toLowerCase().trim()) || 
                           t.note?.toLowerCase().includes(searchQuery.toLowerCase().trim());
      const normalizedType = t.type?.trim().toLowerCase();
      const matchesType = typeFilter === 'All' || normalizedType === typeFilter.toLowerCase();
      const matchesYear = yearFilter === 'All' || t.date.startsWith(yearFilter);
      return matchesSearch && matchesType && matchesYear;
    });
  }, [transactions, searchQuery, typeFilter, yearFilter]);

  const stats = useMemo(() => {
    let buy = 0;
    let sell = 0;
    let div = 0;
    let tax = 0;
    let fee = 0;

    // Main stats should be all-time to show total portfolio value
    transactions.forEach(t => {
      const amount = t.amount || (t.price && t.shares ? t.price * t.shares : 0);
      const usdAmount = t.currency === 'THB' ? amount / thbRate : amount;
      
      const normalizedType = t.type?.trim().toLowerCase() || '';
      
      if (normalizedType === 'buy') buy += usdAmount;
      else if (normalizedType === 'sell') sell += usdAmount;
      else if (normalizedType === 'dividend') div += usdAmount;
      else if (normalizedType === 'tax') tax += Math.abs(usdAmount);
      else if (normalizedType === 'fee') fee += Math.abs(usdAmount);
    });

    // Formula: Dividend + Buy - Sell - Tax - Fee
    const totalInvested = buy;
    const totalSell = sell;
    const netInvested = buy - sell;
    const totalDiv = portfolio.reduce((s, r) => s + r.divNet, 0);
    return { totalInvested, totalSell, netInvested, totalDiv };
  }, [transactions, portfolio, thbRate]);

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    transactions.forEach(t => {
      const year = t.date.split('-')[0];
      if (year && year.length === 4) years.add(year);
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  const filteredStats = useMemo(() => {
    return filteredTransactions.reduce((acc, t) => {
      const amount = t.amount || (t.price && t.shares ? t.price * t.shares : 0);
      const usdAmount = t.currency === 'THB' ? amount / thbRate : amount;
      
      if (t.type === 'Buy') acc.buy += usdAmount;
      else if (t.type === 'Sell') acc.sell += usdAmount;
      else if (t.type === 'Dividend') acc.dividend += usdAmount;
      else if (t.type === 'Tax' || t.type === 'Fee') acc.fee += usdAmount;
      
      return acc;
    }, { buy: 0, sell: 0, dividend: 0, fee: 0 });
  }, [filteredTransactions, thbRate]);

  const handleImport = async () => {
    if (!user || importing) return;
    
    setImporting(true);
    setImportStatus({ type: null, message: 'Checking for duplicates...' });
    
    try {
      // Create fingerprints for existing transactions to avoid duplicates
      const getFingerprint = (t: any) => `${t.date}|${t.ticker}|${t.type}|${t.amount}|${t.currency}|${t.price}|${t.shares}`;
      
      const existingKeys = new Set(transactions.map(getFingerprint));

      const newItems = INITIAL_DATA.filter(item => {
        const key = getFingerprint(item);
        return !existingKeys.has(key);
      });

      if (newItems.length === 0) {
        setImportStatus({ type: 'success', message: 'All data is already up to date.' });
        setTimeout(() => setImportStatus({ type: null, message: '' }), 5000);
        setImporting(false);
        return;
      }

      console.log(`Starting import of ${newItems.length} new items`);
      setImportStatus({ type: null, message: `Importing ${newItems.length} items...` });
      
      const batchSize = 100;
      for (let i = 0; i < newItems.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = newItems.slice(i, i + batchSize);
        
        chunk.forEach(item => {
          const docRef = doc(collection(db, 'transactions'));
          batch.set(docRef, {
            ...item,
            userId: user.uid,
            createdAt: serverTimestamp()
          });
        });
        
        await batch.commit();
        const progress = Math.min(100, Math.round(((i + chunk.length) / newItems.length) * 100));
        setImportStatus({ type: null, message: `Importing... ${progress}%` });
        console.log(`Imported batch ${i / batchSize + 1}`);
      }
      
      setImportStatus({ type: 'success', message: `Successfully imported ${newItems.length} new items!` });
      setTimeout(() => setImportStatus({ type: null, message: '' }), 5000);
    } catch (error) {
      console.error('Import failed', error);
      setImportStatus({ type: 'error', message: `Import failed: ${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setImporting(false);
    }
  };

  const handleExportCSV = () => {
    if (transactions.length === 0) return;

    const headers = ['Date', 'Type', 'Ticker', 'Amount', 'Currency', 'Price', 'Shares', 'Note'];
    const rows = transactions.map(t => [
      t.date,
      t.type,
      t.ticker || '',
      t.amount || '',
      t.currency,
      t.price || '',
      t.shares || '',
      t.note || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `portfolio_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClearAll = async () => {
    if (!user) return;
    
    setImporting(true);
    setImportStatus({ type: null, message: 'Clearing database...' });
    
    try {
      const batchSize = 100;
      for (let i = 0; i < transactions.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = transactions.slice(i, i + batchSize);
        chunk.forEach(t => {
          batch.delete(doc(db, 'transactions', t.id));
        });
        await batch.commit();
      }
      setImportStatus({ type: 'success', message: 'Database cleared successfully!' });
      setTimeout(() => setImportStatus({ type: null, message: '' }), 5000);
    } catch (error) {
      console.error('Clear failed', error);
      setImportStatus({ type: 'error', message: `Clear failed: ${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setImporting(false);
    }
  };

  const handleManualImport = async (jsonStr: string) => {
    try {
      const data = JSON.parse(jsonStr);
      if (!Array.isArray(data)) throw new Error('Data must be an array of transactions');
      
      setImporting(true);
      setImportStatus({ type: null, message: 'Validating and importing...' });
      
      const batch = writeBatch(db);
      let count = 0;
      
      data.forEach(item => {
        if (!item.date || !item.type || !item.amount || !item.currency) return;
        const docRef = doc(collection(db, 'transactions'));
        batch.set(docRef, {
          ...item,
          userId: user?.uid,
          createdAt: serverTimestamp()
        });
        count++;
      });
      
      await batch.commit();
      setImportStatus({ type: 'success', message: `Successfully imported ${count} items!` });
      setIsImportModalOpen(false);
    } catch (error) {
      setImportStatus({ type: 'error', message: `Import failed: ${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setImporting(false);
    }
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    const formData = new FormData(e.currentTarget);
    const data = {
      userId: user.uid,
      date: formData.get('date') as string,
      type: formData.get('type') as TransactionType,
      ticker: (formData.get('ticker') as string).toUpperCase(),
      amount: parseFloat(formData.get('amount') as string),
      currency: formData.get('currency') as Currency,
      price: formData.get('price') ? parseFloat(formData.get('price') as string) : null,
      shares: formData.get('shares') ? parseFloat(formData.get('shares') as string) : null,
      note: formData.get('note') as string,
      createdAt: serverTimestamp()
    };

    try {
      if (editingTransaction) {
        await updateDoc(doc(db, 'transactions', editingTransaction.id), data);
      } else {
        await addDoc(collection(db, 'transactions'), data);
      }
      setIsModalOpen(false);
      setEditingTransaction(null);
    } catch (error) {
      handleFirestoreError(error, editingTransaction ? OperationType.UPDATE : OperationType.CREATE, 'transactions');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this transaction?')) return;
    try {
      await deleteDoc(doc(db, 'transactions', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `transactions/${id}`);
    }
  };

  const formatDate = (dateStr: string, formatStr: string) => {
    try {
      const date = new Date(dateStr.replace(' ', 'T'));
      if (isNaN(date.getTime())) return 'Invalid Date';
      return format(date, formatStr);
    } catch (e) {
      return 'Invalid Date';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl"
        >
          <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center mx-auto mb-8 rotate-3">
            <TrendingUp className="w-10 h-10 text-emerald-500" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-4">Investment Tracker</h1>
          <p className="text-slate-400 mb-10 leading-relaxed">
            Track your portfolio across currencies with real-time updates and minimal design.
          </p>
          <button
            onClick={async () => {
              try {
                await signIn();
              } catch (error: any) {
                console.error("Login Error:", error);
                alert(`Login failed: ${error.message}\n\nPlease try opening this app in a New Tab or a standard browser (Safari/Chrome). Note: This app requires the domain to be added to Firebase Authorized Domains.`);
              }
            }}
            className="w-full py-4 px-6 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-3"
          >
            <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
            Sign in with Google
          </button>
          
          <div className="mt-8 text-xs text-slate-600">
            <p><strong>Troubleshooting Shared Links:</strong></p>
            <p>1. If you just made code changes, you must click <strong>"Share" &gt; "Update link"</strong> in AI Studio again.</p>
            <p>2. Add the URL domain to <strong>Firebase &gt; Authentication &gt; Settings &gt; Authorized domains</strong>.</p>
            <p>Build Update: {new Date().toLocaleString()}</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-emerald-500/30">
        <AnimatePresence>
          {connectionError && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-rose-500/10 border-b border-rose-500/20 px-4 py-2 text-center"
            >
              <div className="max-w-7xl mx-auto flex items-center justify-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500" />
                <span className="text-xs font-medium text-rose-200">{connectionError}</span>
                <button 
                  onClick={() => window.location.reload()}
                  className="text-[10px] font-bold uppercase tracking-widest text-rose-500 hover:text-rose-400 ml-2 border border-rose-500/30 px-2 py-0.5 rounded-lg"
                >
                  Refresh
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/50">
          <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
                <TrendingUp className="w-6 h-6 text-slate-950" />
              </div>
              <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent hidden xs:block">
                Dime! Tracker
              </h1>

              <div className="h-8 w-px bg-slate-800 mx-1 sm:mx-2 hidden sm:block" />

              <div className="flex items-center gap-2 bg-slate-900/50 px-2 sm:px-3 py-1.5 rounded-xl border border-slate-800/50">
                <span className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-wider">USD/THB</span>
                <div className="flex items-center gap-1">
                  <input 
                    type="number" 
                    value={thbRate}
                    onChange={(e) => setThbRate(parseFloat(e.target.value) || 0)}
                    className="w-10 sm:w-12 bg-transparent text-xs font-bold text-emerald-400 focus:outline-none text-right"
                  />
                  <span className="text-[10px] text-slate-500 font-bold">฿</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden lg:flex flex-col items-end mr-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Database Status</span>
                <span className="text-xs font-mono text-emerald-500 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  {transactions.length} Records | Latest: {transactions.length > 0 ? formatDate(transactions[0].date, 'MMM d, yyyy') : 'None'}
                </span>
              </div>
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-full">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-xs font-medium text-slate-400">Live Sync</span>
              </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleExportCSV}
                    className="p-2 hover:bg-slate-900 rounded-xl transition-colors text-slate-400 hover:text-white"
                    title="Export CSV"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => setIsImportModalOpen(true)}
                    className="p-2 hover:bg-slate-900 rounded-xl transition-colors text-slate-400 hover:text-white"
                    title="Manual Import"
                  >
                    <FileJson className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={logOut}
                    className="p-2 hover:bg-slate-900 rounded-xl transition-colors text-slate-400 hover:text-white"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              <img src={user.photoURL || ''} className="w-9 h-9 rounded-full border border-slate-800" alt="Avatar" />
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-8">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard 
              label="Total Invested" 
              value={`$${stats.totalInvested.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              icon={<DollarSign className="w-5 h-5 text-emerald-500" />}
              trend={showThbConverted ? `≈ ฿${(stats.totalInvested * thbRate).toLocaleString()}` : undefined}
            />
            <StatCard 
              label="Total Sell" 
              value={`$${stats.totalSell.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              icon={<TrendingUp className="w-5 h-5 text-rose-500" />}
              positive={false}
            />
            <StatCard 
              label="Net Invested" 
              value={`$${stats.netInvested.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              icon={<TrendingUp className="w-5 h-5 text-slate-500" />}
            />
            <StatCard 
              label="Net Dividends" 
              value={`$${stats.totalDiv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              icon={<PieChart className="w-5 h-5 text-amber-500" />}
              positive={stats.totalDiv >= 0}
            />
          </div>


          {/* Controls */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input 
                type="text"
                placeholder="Search ticker or notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-slate-900 border border-slate-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all text-sm sm:text-base"
              />
            </div>
            <div className="flex gap-2 items-center overflow-x-auto pb-2 sm:pb-0 no-scrollbar">
              {importStatus.message && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={cn(
                    "text-xs px-3 py-2 rounded-xl flex items-center gap-2 mr-2",
                    importStatus.type === 'success' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                    importStatus.type === 'error' ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" :
                    "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                  )}
                >
                  {importStatus.type === 'success' && <CheckCircle2 className="w-3 h-3" />}
                  {importStatus.type === 'error' && <AlertCircle className="w-3 h-3" />}
                  {!importStatus.type && <RefreshCw className="w-3 h-3 animate-spin" />}
                  {importStatus.message}
                </motion.div>
              )}
              <button 
                onClick={() => setShowThbConverted(!showThbConverted)}
                className={cn(
                  "px-4 py-3 rounded-2xl border transition-all flex items-center gap-2 font-medium",
                  showThbConverted ? "bg-emerald-500 border-emerald-500 text-slate-950" : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                )}
              >
                ฿ THB
              </button>
              <button 
                onClick={handleImport}
                disabled={importing}
                className="px-4 py-3 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white rounded-2xl transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <History className={cn("w-5 h-5", importing && "animate-spin")} />
                {importing ? 'Importing...' : 'Import Data'}
              </button>
              <button 
                onClick={handleClearAll}
                disabled={importing || transactions.length === 0}
                className="px-4 py-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 rounded-2xl transition-all flex items-center gap-2 disabled:opacity-50"
                title="Clear all data"
              >
                <Trash2 className="w-5 h-5" />
                Clear All
              </button>
              <button 
                onClick={() => {
                  setEditingTransaction(null);
                  setIsModalOpen(true);
                }}
                className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-2xl transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20"
              >
                <Plus className="w-5 h-5" />
                Add New
              </button>
            </div>
          </div>

          {/* Filter Bar & Summary */}
          <div className="flex flex-col lg:flex-row gap-4 mb-8 items-start lg:items-center justify-between">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex flex-wrap gap-1.5">
                {(['All', 'Buy', 'Sell', 'Dividend', 'Tax', 'Fee'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setTypeFilter(type)}
                    className={cn(
                      "px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all border",
                      typeFilter === type 
                        ? "bg-emerald-500 border-emerald-500 text-slate-950" 
                        : "bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300"
                    )}
                  >
                    {type}
                  </button>
                ))}
              </div>

              <div className="h-6 w-px bg-slate-800 hidden sm:block" />

              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-500" />
                <select
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-800 text-slate-300 text-xs sm:text-sm font-bold px-3 py-2 rounded-xl focus:outline-none focus:border-emerald-500 transition-all"
                >
                  <option value="All">All Years</option>
                  {availableYears.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            </div>

            {filteredTransactions.length > 0 && (
              <div className="flex flex-wrap gap-3 sm:gap-4 px-3 sm:px-4 py-2 bg-slate-900/50 border border-slate-800/50 rounded-2xl w-full lg:w-auto">
                {filteredStats.buy > 0 && (
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500 uppercase font-bold">Total Buy</span>
                    <span className="text-sm font-mono text-emerald-400">${filteredStats.buy.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {filteredStats.sell > 0 && (
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500 uppercase font-bold">Total Sell</span>
                    <span className="text-sm font-mono text-blue-400">${filteredStats.sell.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {filteredStats.dividend > 0 && (
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500 uppercase font-bold">Total Div</span>
                    <span className="text-sm font-mono text-amber-400">${filteredStats.dividend.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {filteredStats.fee > 0 && (
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500 uppercase font-bold">Total Fee/Tax</span>
                    <span className="text-sm font-mono text-rose-400">${filteredStats.fee.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="w-px h-8 bg-slate-800 mx-2 hidden sm:block" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Count</span>
                  <span className="text-sm font-mono text-white">{filteredTransactions.length} items</span>
                </div>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-slate-900/50 rounded-2xl mb-8 w-fit border border-slate-800/50">
            <button 
              onClick={() => setActiveTab('transactions')}
              className={cn(
                "px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                activeTab === 'transactions' ? "bg-slate-800 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"
              )}
            >
              <History className="w-4 h-4" />
              Transactions
            </button>
            <button 
              onClick={() => setActiveTab('portfolio')}
              className={cn(
                "px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                activeTab === 'portfolio' ? "bg-slate-800 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"
              )}
            >
              <PieChart className="w-4 h-4" />
              Portfolio
            </button>
            <button 
              onClick={() => setActiveTab('agent')}
              className={cn(
                "px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                activeTab === 'agent' ? "bg-emerald-500 text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-300"
              )}
            >
              <Bot className="w-4 h-4" />
              AI Agent Team
            </button>
          </div>

          {/* Content */}
          <AnimatePresence mode="wait">
            {activeTab === 'agent' ? (
              <motion.div
                key="agent"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
              >
                <AgentView portfolio={portfolio} />
              </motion.div>
            ) : activeTab === 'transactions' ? (
              <motion.div 
                key="transactions"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-4"
              >
                <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-slate-900/30 no-scrollbar">
                  <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead>
                      <tr className="border-b border-slate-800">
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Type</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Ticker</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Price/Shares</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {filteredTransactions.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-800/30 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-white">{formatDate(t.date, 'MMM d, yyyy')}</div>
                            <div className="text-[10px] text-slate-500 font-mono uppercase">{formatDate(t.date, 'HH:mm')}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn(
                              "px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                              t.type?.toLowerCase() === 'buy' && "bg-emerald-500/10 text-emerald-500",
                              t.type?.toLowerCase() === 'sell' && "bg-rose-500/10 text-rose-500",
                              t.type?.toLowerCase() === 'dividend' && "bg-amber-500/10 text-amber-500",
                              t.type?.toLowerCase() === 'tax' && "bg-red-500/10 text-red-500",
                              t.type?.toLowerCase() === 'fee' && "bg-slate-500/10 text-slate-500"
                            )}>
                              {t.type}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              {t.ticker && t.ticker !== '—' && (
                                <TickerLogo ticker={t.ticker} className="w-6 h-6 text-[10px]" />
                              )}
                              <div className="text-sm font-bold text-emerald-400 font-mono">{t.ticker || '—'}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className={cn(
                              "text-sm font-bold font-mono",
                              t.type?.toLowerCase() === 'buy' ? "text-emerald-400" : t.type?.toLowerCase() === 'sell' ? "text-rose-400" : "text-white"
                            )}>
                              ${t.amount !== null ? t.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
                            </div>
                            {showThbConverted && t.currency === 'USD' && t.amount !== null && (
                              <div className="text-[10px] text-slate-500 font-mono">≈ ฿{(t.amount * thbRate).toLocaleString()}</div>
                            )}
                            {t.currency === 'THB' && t.amount !== null && (
                              <div className="text-[10px] text-slate-500 font-mono">฿{t.amount.toLocaleString()}</div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-xs text-slate-300 font-mono">
                              {t.price ? `$${t.price.toLocaleString()}` : '—'}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              {t.shares ? `${t.shares.toLocaleString()} shares` : ''}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => {
                                  setEditingTransaction(t);
                                  setIsModalOpen(true);
                                }}
                                className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleDelete(t.id)}
                                className="p-2 hover:bg-red-500/10 rounded-lg text-slate-400 hover:text-red-400"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredTransactions.length === 0 && (
                    <div className="py-20 text-center">
                      <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Search className="w-8 h-8 text-slate-600" />
                      </div>
                      <p className="text-slate-500">No transactions found</p>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="portfolio"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredPortfolio.map((item) => (
                    <div key={item.ticker} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 hover:border-emerald-500/30 transition-all group">
                      <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-3">
                          <TickerLogo ticker={item.ticker} className="w-10 h-10 text-sm shadow-md shadow-black/20" />
                          <div>
                            <h3 className="text-2xl font-bold text-emerald-400 font-mono">{item.ticker}</h3>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Holding: {item.sharesHeld.toLocaleString(undefined, { maximumFractionDigits: 4 })} shares</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Avg Cost</span>
                          <span className="font-mono text-white">${item.avgCostPerShare.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Total Buy</span>
                          <span className="font-mono text-emerald-400">${item.totalCostUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Total Sell</span>
                          <span className="font-mono text-rose-400">${item.totalSellUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Net Dividends</span>
                          <span className="font-mono text-white">
                            {item.divNet >= 0 ? '+' : ''}${item.divNet.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="h-px bg-slate-800" />
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Net Invested</span>
                          <span className="font-mono text-amber-400 font-bold">
                            ${(item.totalCostUSD - item.totalSellUSD).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {portfolio.length === 0 && (
                    <div className="col-span-full py-20 text-center bg-slate-900/30 border border-slate-800 rounded-3xl">
                      <p className="text-slate-500">No portfolio data available</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Modal */}
        <AnimatePresence>
          {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsModalOpen(false)}
                className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden"
              >
                <div className="px-8 py-6 border-b border-slate-800 flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">
                    {editingTransaction ? 'Edit Transaction' : 'Add New Transaction'}
                  </h2>
                  <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-800 rounded-xl transition-colors">
                    <X className="w-5 h-5 text-slate-500" />
                  </button>
                </div>

                <form onSubmit={handleSave} className="p-8 space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Type</label>
                      <select 
                        name="type" 
                        defaultValue={editingTransaction?.type || 'Buy'}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      >
                        <option value="Buy">Buy</option>
                        <option value="Sell">Sell</option>
                        <option value="Dividend">Dividend</option>
                        <option value="Tax">Withholding Tax</option>
                        <option value="Fee">Fee</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ticker</label>
                      <input 
                        name="ticker" 
                        type="text"
                        defaultValue={editingTransaction?.ticker || ''}
                        placeholder="e.g. JEPQ"
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono uppercase"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Amount</label>
                      <input 
                        name="amount" 
                        type="number"
                        step="0.01"
                        required
                        defaultValue={editingTransaction?.amount || ''}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Currency</label>
                      <select 
                        name="currency" 
                        defaultValue={editingTransaction?.currency || 'USD'}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      >
                        <option value="USD">USD</option>
                        <option value="THB">THB</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Price (Optional)</label>
                      <input 
                        name="price" 
                        type="number"
                        step="0.0001"
                        defaultValue={editingTransaction?.price || ''}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Shares (Optional)</label>
                      <input 
                        name="shares" 
                        type="number"
                        step="0.0000001"
                        defaultValue={editingTransaction?.shares || ''}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Date & Time</label>
                    <input 
                      name="date" 
                      type="datetime-local"
                      required
                      defaultValue={editingTransaction?.date || new Date().toISOString().slice(0, 16)}
                      className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Note</label>
                    <input 
                      name="note" 
                      type="text"
                      defaultValue={editingTransaction?.note || ''}
                      placeholder="Add a note..."
                      className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                  </div>

                  <div className="pt-4 flex gap-3">
                    <button 
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="flex-1 py-4 px-6 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-2xl transition-all"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      className="flex-[2] py-4 px-6 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-2xl transition-all shadow-lg shadow-emerald-500/20"
                    >
                      {editingTransaction ? 'Update Transaction' : 'Save Transaction'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Manual Import Modal */}
        <AnimatePresence>
          {isImportModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-3xl p-8 shadow-2xl"
              >
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                    <FileJson className="w-7 h-7 text-emerald-500" />
                    Manual Data Import
                  </h2>
                  <button onClick={() => setIsImportModalOpen(false)} className="p-2 hover:bg-slate-800 rounded-xl transition-colors">
                    <X className="w-6 h-6 text-slate-400" />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl">
                    <p className="text-sm text-slate-400 mb-2">Paste your transaction data in JSON format here. Example:</p>
                    <pre className="text-[10px] text-emerald-500/70 overflow-x-auto">
                      {`[{ "date": "2025-07-02 10:00", "type": "Buy", "ticker": "AAPL", "amount": 150.00, "currency": "USD" }]`}
                    </pre>
                  </div>

                  <textarea 
                    id="manual-import-data"
                    className="w-full h-64 px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono text-sm"
                    placeholder="Paste JSON array here..."
                  />

                  <div className="flex gap-3">
                    <button 
                      onClick={() => setIsImportModalOpen(false)}
                      className="flex-1 py-4 px-6 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-2xl transition-all"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={() => {
                        const textarea = document.getElementById('manual-import-data') as HTMLTextAreaElement;
                        handleManualImport(textarea.value);
                      }}
                      disabled={importing}
                      className="flex-[2] py-4 px-6 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-2xl transition-all shadow-lg shadow-emerald-500/20"
                    >
                      {importing ? 'Importing...' : 'Start Import'}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
  );
}

function StatCard({ label, value, icon, trend, positive }: { label: string, value: string, icon: React.ReactNode, trend?: string, positive?: boolean }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="w-10 h-10 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-center">
          {icon}
        </div>
        {trend && (
          <span className="text-[10px] font-bold text-slate-500 font-mono">{trend}</span>
        )}
      </div>
      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={cn(
        "text-2xl font-bold font-mono",
        positive === true && "text-emerald-400",
        positive === false && "text-red-400",
        positive === undefined && "text-white"
      )}>
        {value}
      </div>
    </div>
  );
}
