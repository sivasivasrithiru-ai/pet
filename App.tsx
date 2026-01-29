
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
  ChevronRight,
  Sparkles,
  BrainCircuit,
  Terminal,
  AlertCircle,
  Clock
} from 'lucide-react';
import { GateMode } from './types';
import { serialService } from './services/serialService';
import { GoogleGenAI } from "@google/genai";

const ENV_TITLE = process.env.VITE_APP_TITLE || 'SNACKTIME-PET';
const DEFAULT_LIMIT = Number(process.env.VITE_DEFAULT_VISIT_LIMIT) || 5;
const DEFAULT_LOCK_TIME = Number(process.env.VITE_DEFAULT_LOCK_TIME) || 30;

interface Visit {
  id: number;
  time: string;
  count: number;
}

const App: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [currentMode, setCurrentMode] = useState<GateMode>(GateMode.AUTO);
  const [visitLimit, setVisitLimit] = useState(DEFAULT_LIMIT);
  const [limitInput, setLimitInput] = useState(DEFAULT_LIMIT);
  
  const [lockDuration, setLockDuration] = useState(DEFAULT_LOCK_TIME);
  const [lockDurationInput, setLockDurationInput] = useState(DEFAULT_LOCK_TIME);
  const [lastSnackTime, setLastSnackTime] = useState<number | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  const [logs, setLogs] = useState<string[]>([]);
  const [visitHistory, setVisitHistory] = useState<Visit[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [count, setCount] = useState(0);
  const [activeTab, setActiveTab] = useState<'history' | 'console' | 'ai'>('history');
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isSerialSupported, setIsSerialSupported] = useState(true);

  const visitLimitRef = useRef(DEFAULT_LIMIT); 
  const prevCount = useRef(0);

  useEffect(() => {
    if (!('serial' in navigator)) {
      setIsSerialSupported(false);
    }
  }, []);

  useEffect(() => {
    if (lastSnackTime && lockDuration > 0) {
      const interval = setInterval(() => {
        const now = Date.now();
        const elapsedSeconds = Math.floor((now - lastSnackTime) / 1000);
        const totalCooldownSeconds = lockDuration * 60;
        const remaining = totalCooldownSeconds - elapsedSeconds;

        if (remaining <= 0) {
          setCooldownSeconds(0);
          clearInterval(interval);
        } else {
          setCooldownSeconds(remaining);
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [lastSnackTime, lockDuration]);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [new Date().toLocaleTimeString() + ': ' + msg, ...prev].slice(0, 30));
  }, []);

  useEffect(() => {
    if (count > prevCount.current) {
      const now = Date.now();
      setLastSnackTime(now);
      const newVisit: Visit = {
        id: now,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        count: count
      };
      setVisitHistory(prev => [newVisit, ...prev].slice(0, 20));
      addLog(`Visit recorded: ${count}/${visitLimitRef.current}`);
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
                  setCount(Math.max(0, visitLimitRef.current - remaining));
                  if (remaining === 0) setIsLocked(true);
                }
              }
            } 
            else if (msg === 'LOCKED') setIsLocked(true);
            else if (msg === 'UNLOCKED') {
              setIsLocked(false);
              setCount(0);
              setLastSnackTime(null);
              setCooldownSeconds(0);
            }
            addLog(`Device: ${msg}`);
          },
          (error) => {
            setIsConnected(false);
            addLog(`Error: ${error.message || 'Connection lost'}`);
          }
        );
      }
    }
  };

  const formatCooldown = (seconds: number) => {
    if (seconds <= 0) return "READY";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  const generateAiTip = async () => {
    if (!process.env.API_KEY) {
      setAiInsight("AI insights unavailable at this moment.");
      setActiveTab('ai');
      return;
    }

    setIsAiLoading(true);
    setActiveTab('ai');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `You are a pet behavior expert for ${ENV_TITLE}. Analysis: ${count}/${visitLimit} snacks today. Current interval lock: ${lockDuration} minutes. History: ${logs.slice(0, 3).join('; ')}. Give a 1-sentence tip about pet patience or schedule.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });
      
      setAiInsight(response.text || "Keep consistency in your pet's feeding schedule.");
    } catch (err) {
      setAiInsight("Pet Intelligence offline. Please try again later.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const sendCommand = async (cmd: string) => {
    if (!isConnected) return;
    try {
      await serialService.sendCommand(cmd);
      addLog(`Cmd: ${cmd}`);
      if (['AUTO', 'MANUAL', 'NORMAL'].includes(cmd)) setCurrentMode(cmd as GateMode);
    } catch (err) {
      addLog('Send failed');
    }
  };

  const isCooldownActive = cooldownSeconds > 0;
  const canDispense = isConnected && !isLocked && !isCooldownActive;

  if (!isSerialSupported) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 max-w-sm">
          <AlertCircle size={64} className="mx-auto text-rose-500 mb-6" />
          <h1 className="text-2xl font-black text-slate-900 mb-4">Unsupported Browser</h1>
          <p className="text-slate-500 mb-8 leading-relaxed">Web Serial is required for mobile control. Please use <strong>Chrome on Android</strong>. iOS browsers (Safari/Chrome) do not support this feature.</p>
          <div className="bg-slate-50 p-4 rounded-2xl text-xs font-mono text-slate-400">
            Feature: navigator.serial [MISSING]
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center max-w-6xl mx-auto font-sans pb-24 md:pb-8">
      {/* Header with better alignment */}
      <header className="w-full flex flex-row justify-between items-center mb-6 bg-white p-5 rounded-[1.5rem] shadow-sm border border-slate-100 h-20">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2.5 rounded-xl text-white shadow-lg shadow-blue-200 flex items-center justify-center">
            <Cookie size={20} />
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg font-black tracking-tight text-slate-900 leading-none">{ENV_TITLE}</h1>
            <div className="flex items-center gap-1.5 mt-1">
              <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
              <p className={`text-[10px] font-bold uppercase tracking-wider ${isConnected ? 'text-green-500' : 'text-slate-400'}`}>
                {isConnected ? "Connected" : "Offline"}
              </p>
            </div>
          </div>
        </div>
        <button 
          onClick={handleConnect}
          className={`h-11 px-6 rounded-xl font-black text-xs transition-all active:scale-95 flex items-center justify-center ${
            isConnected ? "bg-rose-50 text-rose-600 border border-rose-100" : "bg-blue-600 text-white shadow-md shadow-blue-100"
          }`}
        >
          {isConnected ? "DISCONNECT" : "CONNECT DEVICE"}
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 w-full items-start">
        {/* Left Column: Controls and Status */}
        <div className="md:col-span-7 space-y-6">
          {/* Status Grid - Fixed for Alignment */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <StatusTile 
              label="Gate Safety" 
              value={isLocked ? "LOCKED" : "READY"} 
              color={isLocked ? "bg-rose-50 text-rose-600 border-rose-100" : "bg-emerald-50 text-emerald-600 border-emerald-100"} 
              icon={<ShieldAlert size={14} />}
            />
            <StatusTile 
              label="Dispensed" 
              value={`${count}/${visitLimit}`} 
              color="bg-slate-900 text-white border-slate-800" 
              icon={<Cookie size={14} />}
            />
            <StatusTile 
              label="Wait Time" 
              value={formatCooldown(cooldownSeconds)} 
              color={isCooldownActive ? "bg-amber-50 text-amber-600 border-amber-100" : "bg-slate-50 text-slate-400 border-slate-200"} 
              icon={<Clock size={14} />}
              className="col-span-2 lg:col-span-1"
            />
          </div>

          {/* Main Control Panel */}
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <Settings size={14} /> Master Controls
              </h2>
              <div className="h-px flex-1 mx-4 bg-slate-50" />
            </div>
            
            <div className="grid grid-cols-3 gap-2 mb-4">
              <ModeButton label="Auto" active={currentMode === GateMode.AUTO} onClick={() => sendCommand('AUTO')} />
              <ModeButton label="Manual" active={currentMode === GateMode.MANUAL} onClick={() => sendCommand('MANUAL')} />
              <ModeButton label="Normal" active={currentMode === GateMode.NORMAL} onClick={() => sendCommand('NORMAL')} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <ActionButton 
                icon={isCooldownActive ? <Clock size={18}/> : <Play size={18}/>} 
                label={isCooldownActive ? `Cooldown: ${formatCooldown(cooldownSeconds)}` : "Release Snack"} 
                primary={!isCooldownActive} 
                onClick={() => sendCommand('OPEN')} 
                disabled={!canDispense} 
              />
              <ActionButton 
                icon={<RefreshCw size={18}/>} 
                label="Reset Lock" 
                onClick={() => sendCommand('UNLOCK')} 
                disabled={!isConnected}
              />
            </div>
          </div>

          {/* Policies Grid - Balanced height alignment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PolicyCard 
              title="Quota Policy" 
              label="Max Daily Count"
              icon={<ShieldAlert size={14} />}
              value={limitInput}
              onChange={(v) => setLimitInput(v)}
              onSave={() => { setVisitLimit(limitInput); visitLimitRef.current = limitInput; sendCommand(`LIMIT ${limitInput}`); }}
            />
            <PolicyCard 
              title="Delay Policy" 
              label="Minutes Gap"
              icon={<Clock size={14} />}
              value={lockDurationInput}
              onChange={(v) => setLockDurationInput(v)}
              onSave={() => { setLockDuration(lockDurationInput); sendCommand(`LOCKTIME ${lockDurationInput}`); }}
            />
          </div>
        </div>

        {/* Right Column: Information & Logs */}
        <div className="md:col-span-5 h-[500px] md:h-[634px]">
          <div className="bg-white h-full border border-slate-100 rounded-[2rem] shadow-sm flex flex-col overflow-hidden">
            <div className="flex p-2 bg-slate-50/50 border-b border-slate-100">
              <TabBtn active={activeTab === 'history'} onClick={() => setActiveTab('history')} label="History" />
              <TabBtn active={activeTab === 'console'} onClick={() => setActiveTab('console')} label="Logs" />
              <TabBtn active={activeTab === 'ai'} onClick={() => setActiveTab('ai')} label="AI Insight" />
            </div>

            <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
              {activeTab === 'history' && (
                <div className="space-y-2">
                  {visitHistory.map((v) => (
                    <div key={v.id} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50/50 border border-slate-100 transition-all hover:bg-slate-50">
                      <div className="flex items-center gap-3">
                        <div className="bg-white p-2 rounded-lg shadow-sm">
                          <Cookie size={14} className="text-blue-500" />
                        </div>
                        <span className="text-xs font-black text-slate-900 uppercase">Snack #{v.count}</span>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase bg-white px-2 py-1 rounded-md border border-slate-100">{v.time}</span>
                    </div>
                  ))}
                  {visitHistory.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center py-20 opacity-30">
                      <History size={48} className="mb-4" />
                      <p className="text-xs font-black uppercase tracking-widest">No Activity Yet</p>
                    </div>
                  )}
                </div>
              )}
              
              {activeTab === 'console' && (
                <div className="font-mono text-[10px] space-y-1.5 p-2 bg-slate-900 text-slate-400 rounded-xl min-h-full">
                  {logs.map((log, i) => (
                    <div key={i} className="flex gap-3 py-1 border-b border-slate-800 last:border-0">
                      <span className="text-emerald-500 shrink-0">➜</span>
                      <span>{log}</span>
                    </div>
                  ))}
                  {logs.length === 0 && <div className="text-slate-600 italic">Waiting for connection...</div>}
                </div>
              )}
              
              {activeTab === 'ai' && (
                <div className="h-full flex flex-col items-center justify-center text-center p-6">
                  {isAiLoading ? (
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
                      <span className="text-indigo-400 font-black text-[10px] uppercase tracking-[0.2em]">Analyzing Pet Behavior...</span>
                    </div>
                  ) : aiInsight ? (
                    <div className="bg-indigo-50/50 p-6 rounded-3xl border border-indigo-100 w-full relative group">
                       <div className="absolute -top-3 -left-3 bg-indigo-600 text-white p-2 rounded-xl shadow-lg shadow-indigo-200">
                        <Sparkles size={16} />
                      </div>
                      <p className="text-indigo-900 text-sm font-semibold leading-relaxed mb-6 mt-2">"{aiInsight}"</p>
                      <button 
                        onClick={generateAiTip} 
                        className="bg-white text-indigo-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border border-indigo-100 shadow-sm transition-all hover:shadow-md active:scale-95"
                      >
                        New Insight
                      </button>
                    </div>
                  ) : (
                    <div className="max-w-xs">
                      <div className="bg-indigo-50 w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                        <BrainCircuit size={40} className="text-indigo-600" />
                      </div>
                      <h3 className="text-lg font-black text-slate-900 mb-2">Behavior Analysis</h3>
                      <p className="text-slate-500 text-xs mb-8 leading-relaxed">Unlock smart insights about your pet's snacking patterns powered by AI.</p>
                      <button 
                        onClick={generateAiTip} 
                        className="w-full bg-indigo-600 text-white h-14 rounded-2xl font-black text-xs uppercase shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-2"
                      >
                        <Sparkles size={16} /> Get Insights
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Sticky AI Button */}
      <button 
        onClick={generateAiTip}
        className="fixed bottom-6 right-6 md:hidden bg-indigo-600 text-white w-14 h-14 rounded-2xl shadow-2xl flex items-center justify-center animate-bounce shadow-indigo-200 border-4 border-white z-50"
      >
        <Sparkles size={24} />
      </button>
    </div>
  );
};

const StatusTile = ({ label, value, color, icon, className = "" }: any) => (
  <div className={`p-4 rounded-2xl border-2 flex flex-col items-center justify-center text-center transition-all ${color} ${className}`}>
    <div className="flex items-center gap-1.5 opacity-60 mb-2">
      {icon}
      <span className="text-[9px] font-black uppercase tracking-widest leading-none">{label}</span>
    </div>
    <span className="text-base font-black leading-none">{value}</span>
  </div>
);

const PolicyCard = ({ title, label, icon, value, onChange, onSave }: any) => (
  <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col h-full">
    <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
      {icon} {title}
    </h2>
    <div className="mt-auto space-y-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-black text-slate-400 uppercase pl-1">{label}</label>
        <div className="flex gap-2">
          <input 
            type="number" 
            value={value} 
            onChange={(e) => onChange(parseInt(e.target.value) || 0)}
            className="flex-1 bg-slate-50 border border-slate-100 px-4 py-3 rounded-xl font-bold text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full"
          />
          <button 
            onClick={onSave}
            className="bg-slate-900 text-white px-5 rounded-xl font-black text-[10px] uppercase shadow-sm transition-all active:scale-95 hover:bg-slate-800"
          >
            Update
          </button>
        </div>
      </div>
    </div>
  </div>
);

const ModeButton = ({ label, active, onClick }: any) => (
  <button 
    onClick={onClick} 
    className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-2 ${
      active 
        ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100 scale-[1.02]" 
        : "bg-slate-50 border-slate-50 text-slate-400 hover:border-slate-200"
    }`}
  >
    {label}
  </button>
);

const ActionButton = ({ icon, label, primary, onClick, disabled }: any) => (
  <button 
    disabled={disabled} 
    onClick={onClick} 
    className={`flex items-center justify-center gap-3 h-14 px-6 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed ${
      primary 
        ? "bg-blue-600 text-white shadow-xl shadow-blue-100" 
        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
    }`}
  >
    {icon} 
    <span className="truncate">{label}</span>
  </button>
);

const TabBtn = ({ active, onClick, label }: any) => (
  <button 
    onClick={onClick} 
    className={`flex-1 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
      active 
        ? "bg-white text-blue-600 shadow-md shadow-slate-200/50" 
        : "text-slate-400 hover:text-slate-600"
    }`}
  >
    {label}
  </button>
);

export default App;
