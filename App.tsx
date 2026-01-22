
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
  ChevronRight
} from 'lucide-react';
import { GateMode } from './types';
import { serialService } from './services/serialService';

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
  const [activeTab, setActiveTab] = useState<'history' | 'console'>('history');

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
            
            // Logic Fix: Parse 'REMAINING:X' and calculate count based on current visitLimitRef
            if (msg.includes('REMAINING:')) {
              const parts = msg.split(':');
              if (parts.length > 1) {
                const remaining = parseInt(parts[1]);
                if (!isNaN(remaining)) {
                  // Always use visitLimitRef.current to ensure we don't use the stale default
                  const currentLimit = visitLimitRef.current;
                  const inferredCount = currentLimit - remaining;
                  setCount(Math.max(0, inferredCount));
                  
                  if (remaining === 0) {
                    setIsLocked(true);
                  }
                }
              }
            } 
            else if (msg === 'LOCKED') {
              setIsLocked(true);
            } 
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
    visitLimitRef.current = val; // Update ref immediately for the readLoop calculation
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

        <button 
          onClick={handleConnect}
          className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all shadow-md active:scale-95 ${
            isConnected 
            ? "bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200" 
            : "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200"
          }`}
        >
          <Power size={18} />
          {isConnected ? "Disconnect" : "Connect Device"}
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full">
        {/* Left Column - Controls & Status */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Main Status Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatusTile 
              title="Current Status" 
              value={isLocked ? "LOCKED" : "READY"} 
              icon={isLocked ? <Lock size={16}/> : <Unlock size={16}/>}
              color={isLocked ? "text-rose-500 bg-rose-50" : "text-emerald-500 bg-emerald-50"}
            />
            <StatusTile 
              title="Mode" 
              value={currentMode} 
              color="text-blue-600 bg-blue-50"
            />
            <StatusTile 
              title="Visit Tracker" 
              value={`${count} / ${visitLimit}`} 
              color="text-slate-800 bg-slate-50"
              sub={`Capacity: ${Math.round((count / visitLimit) * 100)}%`}
            />
            <StatusTile 
              title="Lock Delay" 
              value={`${lockTime}m`} 
              color="text-slate-600 bg-slate-50"
            />
          </div>

          {/* Operation Hub */}
          <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800">
                <Settings size={20} className="text-slate-400" />
                Control Dashboard
              </h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <ModeSelector 
                label="Auto" 
                active={currentMode === GateMode.AUTO} 
                onClick={() => sendCommand('AUTO')}
                desc="IR Sensor Active"
              />
              <ModeSelector 
                label="Manual" 
                active={currentMode === GateMode.MANUAL} 
                onClick={() => sendCommand('MANUAL')}
                desc="Remote Only"
              />
              <ModeSelector 
                label="Normal" 
                active={currentMode === GateMode.NORMAL} 
                onClick={() => sendCommand('NORMAL')}
                desc="Mixed Mode"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-6 border-t border-slate-50">
              <LargeButton 
                icon={<Play size={20} />} 
                label="Trigger Gate Open" 
                primary
                onClick={() => sendCommand('OPEN')}
                disabled={isLocked || currentMode === GateMode.AUTO}
              />
              <LargeButton 
                icon={<RefreshCw size={20} />} 
                label="Reset System" 
                onClick={() => sendCommand('UNLOCK')}
              />
            </div>
          </div>

          {/* Configuration */}
          <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
            <h2 className="text-lg font-bold mb-8 flex items-center gap-2 text-slate-800">
              <ShieldAlert size={20} className="text-rose-400" />
              Safety Thresholds
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-3">
                <label className="text-sm font-bold text-slate-500 uppercase tracking-wider block">Visit Limit</label>
                <div className="flex gap-3">
                  <input 
                    type="number" min="1" max="100"
                    value={limitInput}
                    onChange={(e) => setLimitInput(parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-50 border border-slate-200 px-5 py-3 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                  />
                  <button onClick={handleUpdateLimit} className="bg-slate-900 text-white px-6 rounded-2xl font-bold hover:bg-black transition-colors">Apply</button>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-bold text-slate-500 uppercase tracking-wider block">Lockout Time (Mins)</label>
                <div className="flex gap-3">
                  <input 
                    type="number" min="1" max="120"
                    value={lockTime}
                    onChange={(e) => setLockTime(parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-50 border border-slate-200 px-5 py-3 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                  />
                  <button onClick={handleUpdateLockTime} className="bg-slate-900 text-white px-6 rounded-2xl font-bold hover:bg-black transition-colors">Apply</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Visit List & Logs */}
        <div className="lg:col-span-4 flex flex-col h-full min-h-[500px]">
          <div className="bg-white border border-slate-100 rounded-[2rem] shadow-sm flex flex-col h-full overflow-hidden">
            <div className="flex p-2 bg-slate-50 border-b border-slate-100">
              <button 
                onClick={() => setActiveTab('history')}
                className={`flex-1 py-3 rounded-2xl font-bold text-sm transition-all ${activeTab === 'history' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}
              >
                Visit History
              </button>
              <button 
                onClick={() => setActiveTab('console')}
                className={`flex-1 py-3 rounded-2xl font-bold text-sm transition-all ${activeTab === 'console' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}
              >
                Console
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
              {activeTab === 'history' ? (
                <div className="space-y-3">
                  {visitHistory.length === 0 ? (
                    <div className="text-center py-20 text-slate-400 italic text-sm">No visits recorded.</div>
                  ) : (
                    visitHistory.map((v) => (
                      <div key={v.id} className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                        <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xs">#{v.count}</div>
                        <div className="flex-1">
                          <p className="font-bold text-slate-800 text-sm">Pet Entry Detected</p>
                          <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">{v.time}</p>
                        </div>
                        <ChevronRight size={14} className="text-slate-300" />
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="font-mono text-[11px] space-y-2">
                  {logs.length === 0 ? (
                    <p className="text-center text-slate-400 py-20">Console idle...</p>
                  ) : (
                    logs.map((log, i) => (
                      <div key={i} className="text-slate-600 border-l-2 border-slate-100 pl-3 leading-relaxed">
                        <span className="text-slate-300 mr-2">{log.split(': ')[0]}</span>
                        <span className={log.includes('Command') ? 'text-blue-500 font-bold' : log.includes('Error') ? 'text-rose-500' : ''}>
                          {log.split(': ').slice(1).join(': ')}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Live Feed</span>
              <button onClick={() => { setLogs([]); setVisitHistory([]); }} className="text-[10px] font-bold text-slate-400 hover:text-rose-500 transition-colors uppercase">Reset Display</button>
            </div>
          </div>
        </div>
      </div>

      <footer className="mt-12 text-center text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em] mb-8">
        {ENV_TITLE} Interface &bull; Hardware v1.0 &bull; Secure Bluetooth Link
      </footer>
    </div>
  );
};

/* Helper Components */

const StatusTile = ({ title, value, icon, color, sub }: any) => (
  <div className={`p-5 rounded-3xl transition-all hover:scale-[1.02] border border-slate-100 ${color}`}>
    <span className="text-[10px] font-bold opacity-60 uppercase tracking-widest block mb-1">{title}</span>
    <div className="flex items-center gap-2 font-black text-lg">
      {icon}
      {value}
    </div>
    {sub && <p className="text-[10px] font-bold opacity-40 mt-1">{sub}</p>}
  </div>
);

const ModeSelector = ({ label, active, onClick, desc }: any) => (
  <button 
    onClick={onClick}
    className={`p-6 rounded-3xl text-left transition-all border-2 flex flex-col gap-1 relative overflow-hidden group ${
      active 
      ? "bg-blue-600 border-blue-600 text-white shadow-xl shadow-blue-200" 
      : "bg-white border-slate-100 text-slate-600 hover:border-blue-100 hover:bg-blue-50/50"
    }`}
  >
    <span className="font-black text-base tracking-tight">{label} Mode</span>
    <span className={`text-[10px] font-bold ${active ? "text-blue-100" : "text-slate-400"}`}>{desc}</span>
    {active && <div className="absolute top-2 right-3 w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
  </button>
);

const LargeButton = ({ icon, label, primary, onClick, disabled }: any) => (
  <button 
    disabled={disabled}
    onClick={onClick}
    className={`flex items-center justify-center gap-3 py-5 px-8 rounded-3xl font-black text-sm transition-all active:scale-95 disabled:opacity-50 disabled:grayscale ${
      primary 
      ? "bg-blue-600 text-white shadow-xl shadow-blue-100 hover:bg-blue-700" 
      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
    }`}
  >
    {icon}
    {label}
  </button>
);

export default App;
