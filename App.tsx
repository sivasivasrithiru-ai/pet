
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Settings, 
  Power, 
  Lock, 
  Unlock, 
  History, 
  Play, 
  RefreshCw, 
  ShieldAlert,
  Cookie,
  Activity,
  ChevronRight,
  Sparkles,
  BrainCircuit,
  Terminal
} from 'lucide-react';
import { GateMode } from './types';
import { serialService } from './services/serialService';
import { GoogleGenAI } from "@google/genai";

// Environment variable defaults
const ENV_TITLE = process.env.VITE_APP_TITLE || 'SNACKTIME-PET';
const DEFAULT_LIMIT = Number(process.env.VITE_DEFAULT_VISIT_LIMIT) || 3;
const DEFAULT_LOCK_TIME = Number(process.env.VITE_DEFAULT_LOCK_TIME) || 1;

interface Visit {
  id: number;
  time: string;
  count: number;
}

const App: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [currentMode, setCurrentMode] = useState<GateMode>(GateMode.AUTO);
  
  // Visit Limit State & Ref for real-time math accuracy
  const [visitLimit, setVisitLimit] = useState(DEFAULT_LIMIT);
  const visitLimitRef = useRef(DEFAULT_LIMIT); 
  
  const [limitInput, setLimitInput] = useState(DEFAULT_LIMIT);
  const [lockTime, setLockTime] = useState(DEFAULT_LOCK_TIME);
  const [logs, setLogs] = useState<string[]>([]);
  const [visitHistory, setVisitHistory] = useState<Visit[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [count, setCount] = useState(0);
  const [activeTab, setActiveTab] = useState<'history' | 'console' | 'ai'>('history');

  // AI Logic State
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const logEndRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(0);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [new Date().toLocaleTimeString() + ': ' + msg, ...prev].slice(0, 50));
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Handle visit history updates when count changes
  useEffect(() => {
    if (count > prevCount.current) {
      const newVisit: Visit = {
        id: Date.now(),
        time: new Date().toLocaleTimeString(),
        count: count
      };
      setVisitHistory(prev => [newVisit, ...prev].slice(0, 20));
      addLog(`Visit recorded: ${count} of ${visitLimitRef.current}`);
    } else if (count === 0 && prevCount.current !== 0) {
      addLog('Tracker reset to zero');
    }
    prevCount.current = count;
  }, [count, addLog]);

  const handleConnect = async () => {
    if (isConnected) {
      await serialService.disconnect();
      setIsConnected(false);
      addLog('Disconnected');
    } else {
      const success = await serialService.connect();
      if (success) {
        setIsConnected(true);
        addLog('Secure Link Established');
        
        serialService.readLoop(
          (data) => {
            const msg = data.trim();
            if (msg.includes('REMAINING:')) {
              const parts = msg.split(':');
              if (parts.length > 1) {
                const remaining = parseInt(parts[1]);
                if (!isNaN(remaining)) {
                  const currentLimit = visitLimitRef.current;
                  const inferredCount = currentLimit - remaining;
                  setCount(Math.max(0, inferredCount));
                  if (remaining === 0) setIsLocked(true);
                }
              }
            } 
            else if (msg === 'LOCKED') setIsLocked(true);
            else if (msg === 'UNLOCKED' || msg === 'AUTO UNLOCKED') {
              setIsLocked(false);
              setCount(0);
            }
            addLog(`Device: ${msg}`);
          },
          (error) => {
            console.error('Serial Error:', error);
            setIsConnected(false);
            addLog(`Error: ${error.message || 'Connection lost'}`);
          }
        );
      }
    }
  };

  const generateAiTip = async () => {
    if (!process.env.API_KEY) {
      setAiInsight("API Key missing. Please configure 'API_KEY' in your environment.");
      setActiveTab('ai');
      return;
    }

    setIsAiLoading(true);
    setActiveTab('ai');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `
        You are an expert pet health and behavior assistant for SNACKTIME-PET.
        Analyze these recent activity metrics:
        - Current pet visits today: ${count}
        - Daily limit set: ${visitLimit}
        - Recent logs: ${logs.slice(0, 5).join(' | ')}
        
        Provide a very short, supportive tip (max 2 sentences) about the pet's snacking frequency or health.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });

      setAiInsight(response.text || "No insights available at this time.");
    } catch (error) {
      console.error("AI Error:", error);
      setAiInsight("Unable to connect to Pet Intelligence. Please check your API key.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const sendCommand = async (cmd: string) => {
    if (!isConnected) {
      addLog('Notice: Connect device first');
      return;
    }
    try {
      await serialService.sendCommand(cmd);
      addLog(`Command Sent: ${cmd}`);
      if (cmd === 'AUTO') setCurrentMode(GateMode.AUTO);
      if (cmd === 'MANUAL') setCurrentMode(GateMode.MANUAL);
      if (cmd === 'NORMAL') setCurrentMode(GateMode.NORMAL);
      if (cmd === 'UNLOCK') {
        setIsLocked(false);
        setCount(0);
      }
    } catch (error) {
      setIsConnected(false);
      addLog('Transmission failed');
    }
  };

  const handleUpdateLimit = () => {
    const val = Math.max(1, limitInput);
    setVisitLimit(val);
    visitLimitRef.current = val;
    sendCommand(`LIMIT ${val}`);
  };

  const handleUpdateLockTime = () => sendCommand(`LOCKTIME ${lockTime}`);

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center max-w-6xl mx-auto font-sans">
      {/* Header */}
      <header className="w-full flex justify-between items-center mb-8 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-3 rounded-2xl text-white shadow-lg shadow-blue-200">
            <Cookie size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">{ENV_TITLE}</h1>
            <p className="text-sm text-slate-500 flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`}></span>
              {isConnected ? "System Connected" : "Connection Pending"}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={generateAiTip}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl font-bold transition-all bg-indigo-50 text-indigo-600 border border-indigo-100 hover:bg-indigo-100"
          >
            <Sparkles size={18} />
            <span className="hidden md:inline">AI Insight</span>
          </button>
          <button 
            onClick={handleConnect}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all shadow-md active:scale-95 ${
              isConnected 
              ? "bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200" 
              : "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200"
            }`}
          >
            <Power size={18} />
            {isConnected ? "Disconnect" : "Connect"}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full">
        {/* Left Column - Controls */}
        <div className="lg:col-span-8 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatusTile title="Status" value={isLocked ? "LOCKED" : "READY"} icon={isLocked ? <Lock size={16}/> : <Unlock size={16}/>} color={isLocked ? "text-rose-500 bg-rose-50" : "text-emerald-500 bg-emerald-50"} />
            <StatusTile title="Mode" value={currentMode} color="text-blue-600 bg-blue-50" />
            <StatusTile title="Snacks" value={`${count} / ${visitLimit}`} color="text-slate-800 bg-slate-50" sub={`${Math.round((count/visitLimit)*100)}% Used`} />
            <StatusTile title="Cooldown" value={`${lockTime}m`} color="text-slate-600 bg-slate-50" />
          </div>

          <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
            <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800 mb-8">
              <Settings size={20} className="text-slate-400" />
              Device Controls
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <ModeSelector label="Auto" active={currentMode === GateMode.AUTO} onClick={() => sendCommand('AUTO')} desc="IR Active" />
              <ModeSelector label="Manual" active={currentMode === GateMode.MANUAL} onClick={() => sendCommand('MANUAL')} desc="Button Only" />
              <ModeSelector label="Normal" active={currentMode === GateMode.NORMAL} onClick={() => sendCommand('NORMAL')} desc="Balanced" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-6 border-t border-slate-50">
              <LargeButton icon={<Play size={20} />} label="Dispense / Open" primary onClick={() => sendCommand('OPEN')} disabled={isLocked || currentMode === GateMode.AUTO} />
              <LargeButton icon={<RefreshCw size={20} />} label="Reset Counter" onClick={() => sendCommand('UNLOCK')} />
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
            <h2 className="text-lg font-bold mb-8 flex items-center gap-2 text-slate-800"><ShieldAlert size={20} className="text-rose-400" /> Policy Configuration</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-3">
                <label className="text-sm font-bold text-slate-500 uppercase tracking-wider block">Daily Snack Limit</label>
                <div className="flex gap-3">
                  <input type="number" value={limitInput} onChange={(e) => setLimitInput(parseInt(e.target.value) || 1)} className="w-full bg-slate-50 border border-slate-200 px-5 py-3 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold" />
                  <button onClick={handleUpdateLimit} className="bg-slate-900 text-white px-6 rounded-2xl font-bold hover:bg-black transition-colors">Set</button>
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-sm font-bold text-slate-500 uppercase tracking-wider block">Lockout Duration</label>
                <div className="flex gap-3">
                  <input type="number" value={lockTime} onChange={(e) => setLockTime(parseInt(e.target.value) || 1)} className="w-full bg-slate-50 border border-slate-200 px-5 py-3 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold" />
                  <button onClick={handleUpdateLockTime} className="bg-slate-900 text-white px-6 rounded-2xl font-bold hover:bg-black transition-colors">Set</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Data & Intelligence */}
        <div className="lg:col-span-4 flex flex-col h-full min-h-[500px]">
          <div className="bg-white border border-slate-100 rounded-[2rem] shadow-sm flex flex-col h-full overflow-hidden">
            <div className="flex p-2 bg-slate-50 border-b border-slate-100 overflow-x-auto scrollbar-hide">
              <TabButton active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<History size={14}/>} label="Visits" />
              <TabButton active={activeTab === 'console'} onClick={() => setActiveTab('console')} icon={<Terminal size={14}/>} label="Logs" />
              <TabButton active={activeTab === 'ai'} onClick={() => setActiveTab('ai')} icon={<BrainCircuit size={14}/>} label="AI Tips" />
            </div>

            <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
              {activeTab === 'history' && (
                <div className="space-y-3">
                  {visitHistory.length === 0 ? <p className="text-center py-20 text-slate-400 italic text-sm">No activity detected yet.</p> : 
                    visitHistory.map((v) => (
                      <div key={v.id} className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                        <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xs">#{v.count}</div>
                        <div className="flex-1 text-sm font-bold text-slate-800">Visit Registered <p className="text-[10px] text-slate-400 font-medium uppercase">{v.time}</p></div>
                        <ChevronRight size={14} className="text-slate-300" />
                      </div>
                    ))
                  }
                </div>
              )}
              {activeTab === 'console' && (
                <div className="font-mono text-[11px] space-y-2">
                  {logs.length === 0 ? <p className="text-center py-20 text-slate-400 italic">No logs available.</p> : 
                    logs.map((log, i) => <div key={i} className="text-slate-600 border-l-2 border-slate-100 pl-3"><span className="text-slate-300 mr-2">{log.split(': ')[0]}</span>{log.split(': ').slice(1).join(': ')}</div>)
                  }
                </div>
              )}
              {activeTab === 'ai' && (
                <div className="space-y-4">
                  {isAiLoading ? (
                    <div className="space-y-4 py-10">
                      <div className="h-4 bg-indigo-50 animate-pulse rounded-full w-3/4 mx-auto"></div>
                      <div className="h-4 bg-indigo-50 animate-pulse rounded-full w-1/2 mx-auto"></div>
                    </div>
                  ) : aiInsight ? (
                    <div className="bg-indigo-50/50 p-6 rounded-3xl border border-indigo-100 relative">
                      <Sparkles className="absolute -right-2 -top-2 text-indigo-100 w-12 h-12" />
                      <p className="text-indigo-900 font-medium leading-relaxed italic text-sm">"{aiInsight}"</p>
                      <button onClick={generateAiTip} className="mt-4 text-[10px] font-bold text-indigo-400 hover:text-indigo-600 uppercase flex items-center gap-1">
                        <RefreshCw size={10} /> Get New Tip
                      </button>
                    </div>
                  ) : (
                    <div className="text-center py-10 px-4">
                      <BrainCircuit size={40} className="mx-auto text-indigo-200 mb-4" />
                      <p className="text-slate-500 text-sm mb-6">Want to know if your pet is over-snacking? Our AI can analyze their patterns.</p>
                      <button onClick={generateAiTip} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold text-sm hover:bg-indigo-700 transition-all">Generate Analysis</button>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-[10px] font-bold text-slate-300 uppercase tracking-widest">
              Live Feed
              <button onClick={() => { setLogs([]); setVisitHistory([]); setAiInsight(null); }} className="text-slate-400 hover:text-rose-500">Clear All</button>
            </div>
          </div>
        </div>
      </div>
      <footer className="mt-12 text-center text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em] mb-8">
        {ENV_TITLE} Dashboard &bull; AI Powered Pet Care
      </footer>
    </div>
  );
};

const TabButton = ({ active, onClick, icon, label }: any) => (
  <button onClick={onClick} className={`flex items-center gap-2 px-4 py-3 rounded-2xl font-bold text-xs transition-all flex-shrink-0 ${active ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
    {icon} {label}
  </button>
);

const StatusTile = ({ title, value, icon, color, sub }: any) => (
  <div className={`p-5 rounded-3xl border border-slate-100 ${color}`}>
    <span className="text-[10px] font-bold opacity-60 uppercase tracking-widest block mb-1">{title}</span>
    <div className="flex items-center gap-2 font-black text-lg">{icon}{value}</div>
    {sub && <p className="text-[10px] font-bold opacity-40 mt-1">{sub}</p>}
  </div>
);

const ModeSelector = ({ label, active, onClick, desc }: any) => (
  <button onClick={onClick} className={`p-6 rounded-3xl text-left border-2 flex flex-col gap-1 ${active ? "bg-blue-600 border-blue-600 text-white shadow-lg" : "bg-white border-slate-100 text-slate-600 hover:bg-blue-50/50"}`}>
    <span className="font-black text-base">{label} Mode</span>
    <span className={`text-[10px] font-bold ${active ? "text-blue-100" : "text-slate-400"}`}>{desc}</span>
  </button>
);

const LargeButton = ({ icon, label, primary, onClick, disabled }: any) => (
  <button disabled={disabled} onClick={onClick} className={`flex items-center justify-center gap-3 py-5 px-8 rounded-3xl font-black text-sm transition-all active:scale-95 disabled:opacity-50 ${primary ? "bg-blue-600 text-white shadow-lg hover:bg-blue-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
    {icon}{label}
  </button>
);

export default App;
