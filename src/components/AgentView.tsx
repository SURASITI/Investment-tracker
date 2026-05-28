import React, { useState, useEffect } from 'react';
import { PortfolioItem } from '../types';
import { cn } from '../lib/utils';
import { 
  Bot, 
  Send, 
  Zap, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  Globe,
  Loader2,
  CheckCircle2,
  Settings,
  X,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';

interface AgentReport {
  newsSummary: string;
  topPerformers: { ticker: string; change: string; reason: string }[];
  bottomPerformers: { ticker: string; change: string; reason: string }[];
  riskAssessment: { ticker: string; riskLevel: 'High' | 'Medium' | 'Low'; reason: string }[];
  timestamp: string;
}

export const AgentView = ({ portfolio }: { portfolio: PortfolioItem[] }) => {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<AgentReport | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [telegramConfig, setTelegramConfig] = useState({ token: '', chatId: '' });
  const [status, setStatus] = useState<string>('');
  const [autoMode, setAutoMode] = useState(false);

  useEffect(() => {
    // Check if we should run automatically today
    const checkAutoRun = async () => {
      if (!autoMode || loading || report) return;

      const lastRun = localStorage.getItem('agent_last_run');
      const today = new Date().toDateString();

      if (lastRun !== today) {
        const now = new Date();
        // Only run auto after 8 AM (user specified "every day", usually implies morning)
        if (now.getHours() >= 8) {
          setStatus('Auto-mode: Starting scheduled run...');
          await runAgent();
          localStorage.setItem('agent_last_run', today);
          await sendToTelegram();
          setStatus('Auto-mode: Daily task completed.');
        }
      }
    };

    const interval = setInterval(checkAutoRun, 1000 * 60 * 15); // Check every 15 mins
    checkAutoRun();
    return () => clearInterval(interval);
  }, [autoMode, portfolio, loading, report]);

  useEffect(() => {
    // Load cached report if it exists and is from today
    const cachedReport = localStorage.getItem('agent_report_cache');
    const cacheDate = localStorage.getItem('agent_report_date');
    const today = new Date().toDateString();

    if (cachedReport && cacheDate === today) {
      try {
        setReport(JSON.parse(cachedReport));
        setStatus('Loaded today\'s analysis from cache.');
      } catch (e) {
        console.error('Failed to parse cached report');
      }
    }

    const fetchConfig = async () => {
      if (auth.currentUser) {
        const docRef = doc(db, 'users', auth.currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().telegram) {
          setTelegramConfig(docSnap.data().telegram);
        }
      }
    };
    fetchConfig();
  }, []);

  const saveSettings = async () => {
    if (auth.currentUser) {
      const trimmedConfig = {
        token: telegramConfig.token.trim(),
        chatId: telegramConfig.chatId.trim()
      };
      await setDoc(doc(db, 'users', auth.currentUser.uid), {
        telegram: trimmedConfig
      }, { merge: true });
      setTelegramConfig(trimmedConfig);
      setShowSettings(false);
    }
  };

  const runAgent = async () => {
    if (portfolio.length === 0) {
      setStatus('Your portfolio is empty. Add transactions first.');
      return;
    }

    setLoading(true);
    setStatus('Analyzing news and performance...');
    
    try {
      const tickers = portfolio.map(p => p.ticker).join(', ');
      
      const response = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers })
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error?.includes('Quota')) {
          setStatus(`⚠️ ${data.error}`);
        } else {
          throw new Error(data.error || 'Failed to run agent analysis');
        }
        return;
      }
      
      const newReport = { 
        newsSummary: data.newsSummary || 'No summary available.',
        topPerformers: Array.isArray(data.topPerformers) ? data.topPerformers : [],
        bottomPerformers: Array.isArray(data.bottomPerformers) ? data.bottomPerformers : [],
        riskAssessment: Array.isArray(data.riskAssessment) ? data.riskAssessment : [],
        timestamp: new Date().toLocaleString() 
      };

      setReport(newReport);
      localStorage.setItem('agent_report_cache', JSON.stringify(newReport));
      localStorage.setItem('agent_report_date', new Date().toDateString());
      
      setStatus('Report generated successfully.');
    } catch (error) {
      console.error(error);
      const errMsg = error instanceof Error ? error.message : String(error);
      setStatus(`❌ ${errMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const sendToTelegram = async () => {
    if (!report || !telegramConfig.token || !telegramConfig.chatId) {
      setStatus('Missing Telegram configuration. Please check settings.');
      return;
    }

    setStatus('Sending to Telegram...');
    try {
      let cleanToken = telegramConfig.token.trim();
      if (cleanToken.toLowerCase().startsWith('bot')) {
        cleanToken = cleanToken.substring(3);
      }
      const cleanChatId = telegramConfig.chatId.trim();

      const escapeHTML = (str: string) => str.replace(/[&<>"']/g, (m) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[m as keyof typeof m] || m));
      
      const text = `🚀 <b>รายงานรายวันจาก AI หุ้น</b>\n` +
        `📅 ${escapeHTML(report.timestamp)}\n\n` +
        `📰 <b>สรุปข่าวล่าสุด:</b>\n${escapeHTML(report.newsSummary)}\n\n` +
        `📈 <b>หุ้นที่มีผลงานดีสุด:</b>\n${(report.topPerformers || []).map(p => `• <b>${escapeHTML(p.ticker)}</b>: ${escapeHTML(p.change)} - ${escapeHTML(p.reason)}`).join('\n')}\n\n` +
        `📉 <b>หุ้นที่มีผลงานแย่สุด:</b>\n${(report.bottomPerformers || []).map(p => `• <b>${escapeHTML(p.ticker)}</b>: ${escapeHTML(p.change)} - ${escapeHTML(p.reason)}`).join('\n')}\n\n` +
        `⚠️ <b>ความเสี่ยง:</b>\n${(report.riskAssessment || []).map(p => `• <b>${escapeHTML(p.ticker)}</b> (${escapeHTML(p.riskLevel)}): ${escapeHTML(p.reason)}`).join('\n')}`;

      const res = await fetch(`https://api.telegram.org/bot${cleanToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: cleanChatId,
          text: text,
          parse_mode: 'HTML'
        })
      });

      let result;
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        result = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`Telegram API returned non-JSON response: ${text.slice(0, 100)}...`);
      }

      if (res.ok && result.ok) {
        setStatus('✅ Message sent to Telegram!');
      } else {
        let errorMsg = result.description || 'Unknown error';
        if (res.status === 403) {
          errorMsg = "Bot was blocked or user hasn't started the bot. Please send /start to your bot in Telegram.";
        } else if (res.status === 404) {
          errorMsg = "Invalid Bot Token. Please check your Telegram Bot Token in Settings.";
        } else if (res.status === 400 && errorMsg.includes('chat not found')) {
          errorMsg = "Chat ID not found. Make sure the Chat ID is correct and the bot has access to it.";
        }
        throw new Error(`Telegram rejected message: ${errorMsg}`);
      }
    } catch (error) {
      console.error('Telegram error:', error);
      setStatus('❌ ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Bot className="w-6 h-6 text-emerald-500" />
              <h2 className="text-2xl font-bold text-white">AI Agent Team</h2>
            </div>
            <p className="text-slate-400 text-sm">Automated analysis, risk assessment, and Telegram updates.</p>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setAutoMode(!autoMode)}
              className={cn(
                "px-4 py-3 rounded-2xl border transition-all flex items-center gap-2 font-bold text-xs uppercase tracking-widest",
                autoMode ? "bg-emerald-500 border-emerald-500 text-slate-950" : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
              )}
            >
              <RefreshCw className={cn("w-4 h-4", autoMode && "animate-spin-slow")} />
              {autoMode ? 'Auto-Mode ON' : 'Auto-Mode OFF'}
            </button>
            <button 
              onClick={() => setShowSettings(true)}
              className="p-3 bg-slate-800 hover:bg-slate-700 rounded-2xl transition-colors text-slate-300"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button 
              onClick={runAgent}
              disabled={loading}
              className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-2xl transition-all flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
              {report ? 'อัปเดตการวิเคราะห์' : 'เริ่มการทำงาน AI'}
            </button>
          </div>
        </div>

        {status && (
          <div className={cn(
            "p-3 rounded-xl mb-6 text-xs font-semibold flex items-center gap-2",
            status.includes('Error') || status.includes('❌') ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" : 
            status.includes('sent') || status.includes('✅') ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
            "bg-blue-500/10 text-blue-400 border border-blue-500/20"
          )}>
            {status}
          </div>
        )}

        <AnimatePresence>
          {report && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Summary */}
              <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50">
                <div className="flex items-center gap-2 mb-4">
                  <Globe className="w-5 h-5 text-blue-400" />
                  <h3 className="font-bold text-white uppercase tracking-wider text-xs">สรุปข่าวสารตลาดหุ้น</h3>
                </div>
                <p className="text-slate-300 leading-relaxed text-sm">{report.newsSummary}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Performance */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">หุ้นที่ทำผลงานดีที่สุด</h4>
                  </div>
                  <div className="space-y-2">
                    {(report.topPerformers || []).map((p, i) => (
                      <div key={i} className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 flex justify-between items-center">
                        <div>
                          <span className="font-bold text-emerald-400 mr-2">{p.ticker}</span>
                          <span className="text-xs text-slate-500">{p.reason}</span>
                        </div>
                        <span className="text-xs font-mono text-emerald-500 font-bold">{p.change}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 px-2 pt-2">
                    <TrendingDown className="w-4 h-4 text-rose-400" />
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">หุ้นที่ทำผลงานแย่ที่สุด</h4>
                  </div>
                  <div className="space-y-2">
                    {(report.bottomPerformers || []).map((p, i) => (
                      <div key={i} className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 flex justify-between items-center">
                        <div>
                          <span className="font-bold text-rose-400 mr-2">{p.ticker}</span>
                          <span className="text-xs text-slate-500">{p.reason}</span>
                        </div>
                        <span className="text-xs font-mono text-rose-400 font-bold">{p.change}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Risks */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">การประเมินความเสี่ยง</h4>
                  </div>
                  <div className="space-y-3">
                    {(report.riskAssessment || []).map((p, i) => (
                      <div key={i} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-bold text-white">{p.ticker}</span>
                          <span className={cn(
                            "px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase",
                            p.riskLevel === 'High' ? "bg-rose-500/10 text-rose-500" :
                            p.riskLevel === 'Medium' ? "bg-amber-500/10 text-amber-500" :
                            "bg-emerald-500/10 text-emerald-500"
                          )}>
                            {p.riskLevel} Risk
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">{p.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-center pt-4">
                <button 
                  onClick={sendToTelegram}
                  className="px-8 py-4 bg-blue-500 hover:bg-blue-400 text-white font-bold rounded-2xl transition-all flex items-center gap-3 shadow-lg shadow-blue-500/20"
                >
                  <Send className="w-5 h-5" />
                  ส่งรายงานไปที่ Telegram
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
              onClick={() => setShowSettings(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
            >
              <button 
                onClick={() => setShowSettings(false)}
                className="absolute right-6 top-6 text-slate-500 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
              
              <h3 className="text-xl font-bold text-white mb-6">Agent Settings</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Telegram Bot Token</label>
                  <input 
                    type="password"
                    value={telegramConfig.token}
                    onChange={(e) => setTelegramConfig({ ...telegramConfig, token: e.target.value })}
                    placeholder="Enter Bot Token"
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Telegram Chat ID</label>
                  <input 
                    type="text"
                    value={telegramConfig.chatId}
                    onChange={(e) => setTelegramConfig({ ...telegramConfig, chatId: e.target.value })}
                    placeholder="Enter Chat ID"
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all text-sm"
                  />
                </div>
                
                <button 
                  onClick={saveSettings}
                  className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-2xl transition-all mt-4"
                >
                  Save Settings
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
