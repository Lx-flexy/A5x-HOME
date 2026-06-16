import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Bot, Plug, X, Lightbulb, Wind, Zap, Bolt,
  CheckCircle2, AlertCircle, RefreshCw, Link2,
  WifiOff, Wifi, ChevronRight, Send, Trash2,
  MessageSquare, Sliders, Battery, Cpu, Signal,
  Thermometer, Smile,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  connectDexBot, disconnectDexBot,
  getUserDexBots, DexBot as DexBotType,
} from '../../services/dexbotService';
import {
  subscribeToUserDevices, subscribeToOutputs,
  setOutput, Device, DeviceOutputs,
} from '../../services/deviceService';
import DexbotChatService, { ChatMessage, BotLiveData } from '../../services/dexbotChatService';
import { useDeviceStatus } from '../../hooks/useDeviceStatus';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Loader from '../../components/ui/Loader';

// ── Quick commands list ───────────────────────────────────────────────────────
const QUICK_CMDS = [
  'turn on light',
  'turn off light',
  'turn on fan',
  'turn off fan',
  'status',
  'temperature',
];

// ── Toggle ────────────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <label className={`relative inline-flex items-center ${disabled ? 'opacity-40 pointer-events-none' : 'cursor-pointer'}`}>
      <input type="checkbox" className="sr-only peer" checked={checked}
        onChange={e => onChange(e.target.checked)} disabled={disabled} />
      <div className={`w-11 h-6 rounded-full border-2 transition-all duration-200
        ${checked ? 'bg-primary-600 border-primary-600' : 'bg-neutral-200 border-neutral-300'}`} />
      <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200
        ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </label>
  );
}

// ── Control Row ───────────────────────────────────────────────────────────────
function ControlRow({ icon, label, checked, onChange, activeBg, activeColor }: {
  icon: React.ReactNode; label: string; checked: boolean;
  onChange: (v: boolean) => void; activeBg: string; activeColor: string;
}) {
  return (
    <div className={`flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all
      ${checked ? 'border-primary-100 bg-gradient-to-r from-primary-50 to-white' : 'border-neutral-100 bg-white hover:border-neutral-200'}`}>
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${checked ? activeBg : 'bg-neutral-100'}`}>
          <span className={checked ? activeColor : 'text-neutral-400'}>{icon}</span>
        </div>
        <span className="text-sm font-medium text-neutral-800">{label}</span>
      </div>
      <div className="flex items-center gap-2.5">
        <span className={`text-xs font-semibold ${checked ? 'text-primary-600' : 'text-neutral-400'}`}>
          {checked ? 'ON' : 'OFF'}
        </span>
        <Toggle checked={checked} onChange={onChange} />
      </div>
    </div>
  );
}

// ── Device Controls Tab ───────────────────────────────────────────────────────
function DeviceControlPanel({ device, performer }: { device: Device; performer: string }) {
  const [outputs, setOut] = useState<DeviceOutputs | null>(null);
  const { isOnline } = useDeviceStatus(device.deviceId);
  useEffect(() => subscribeToOutputs(device.deviceId, setOut), [device.deviceId]);
  const toggle = useCallback(async (key: keyof DeviceOutputs, val: boolean, label: string) => {
    await setOutput(device.deviceId, key, val, performer, `${label} via Dex Bot`);
  }, [device.deviceId, performer]);
  const o = outputs;
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 p-3.5 bg-neutral-50 rounded-xl border border-neutral-100">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isOnline ? 'bg-primary-600' : 'bg-neutral-300'}`}>
          <Zap size={16} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-neutral-900 truncate">{device.name}</p>
          <p className="text-xs text-neutral-400 truncate">{device.deviceId} · {device.room}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {isOnline ? <Wifi size={13} className="text-success-500" /> : <WifiOff size={13} className="text-neutral-400" />}
          <span className={`text-xs font-semibold ${isOnline ? 'text-success-600' : 'text-neutral-400'}`}>
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Lights</p>
        <div className="space-y-2">
          {(['light1','light2','light3'] as const).map((k,i) => (
            <ControlRow key={k} icon={<Lightbulb size={15}/>} label={`Light ${i+1}`}
              checked={o?.[k]||false} onChange={v=>toggle(k,v,`Light ${i+1} ${v?'ON':'OFF'}`)}
              activeBg="bg-yellow-100" activeColor="text-yellow-600"/>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Fans</p>
        <div className="space-y-2">
          {(['fan1','fan2'] as const).map((k,i) => (
            <ControlRow key={k} icon={<Wind size={15}/>} label={`Fan ${i+1}`}
              checked={o?.[k]||false} onChange={v=>toggle(k,v,`Fan ${i+1} ${v?'ON':'OFF'}`)}
              activeBg="bg-blue-100" activeColor="text-blue-600"/>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">Custom</p>
        <ControlRow icon={<Bolt size={15}/>} label="Custom Device"
          checked={o?.custom1||false} onChange={v=>toggle('custom1',v,`Custom ${v?'ON':'OFF'}`)}
          activeBg="bg-purple-100" activeColor="text-purple-600"/>
      </div>
    </div>
  );
}

// ── Chat Tab ──────────────────────────────────────────────────────────────────
function ChatPanel({ botId, senderName }: { botId: string; senderName: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput]       = useState('');
  const [sending, setSending]   = useState(false);
  const [botData, setBotData]   = useState<BotLiveData>({});
  const [clearing, setClearing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Load history + listen for new messages
    const unsubHistory  = DexbotChatService.listenToHistory(botId, setMessages);
    const unsubResponse = DexbotChatService.listenForResponse(botId, msg => {
      setMessages(prev => {
        if (prev.find(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });
    const unsubBotData = DexbotChatService.listenToBotData(botId, setBotData);
    return () => { unsubHistory(); unsubResponse(); unsubBotData(); };
  }, [botId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    const txt = input.trim();
    if (!txt || sending) return;
    setSending(true);
    setInput('');
    try {
      await DexbotChatService.sendCommand(botId, txt, senderName);
    } catch (e) {
      console.error('[ChatPanel] send error:', e);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function handleClear() {
    setClearing(true);
    await DexbotChatService.clearHistory(botId).catch(() => {});
    setMessages([]);
    setClearing(false);
  }

  function fmtTime(ms: number) {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const emotionEmoji: Record<string, string> = {
    HAPPY: '😊', SAD: '😢', ANGRY: '😠', SURPRISED: '😲',
    NEUTRAL: '😐', SLEEPY: '😴', WINK: '😉',
  };

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 480 }}>
      {/* Bot telemetry strip */}
      {(botData.battery !== undefined || botData.cpu !== undefined || botData.rssi !== undefined || botData.emotion) && (
        <div className="flex items-center gap-4 px-4 py-2.5 bg-neutral-50 border-b border-neutral-100 text-xs text-neutral-500 flex-wrap">
          {botData.emotion && (
            <span className="flex items-center gap-1 font-medium text-neutral-700">
              <Smile size={12}/> {emotionEmoji[botData.emotion] ?? '🤖'} {botData.emotion}
            </span>
          )}
          {botData.battery !== undefined && (
            <span className="flex items-center gap-1"><Battery size={12}/> {botData.battery}%</span>
          )}
          {botData.cpu !== undefined && (
            <span className="flex items-center gap-1"><Cpu size={12}/> {botData.cpu}%</span>
          )}
          {botData.rssi !== undefined && (
            <span className="flex items-center gap-1"><Signal size={12}/> {botData.rssi} dBm</span>
          )}
          {botData.temperature !== undefined && (
            <span className="flex items-center gap-1"><Thermometer size={12}/> {botData.temperature}°C</span>
          )}
          {botData.room && <span className="flex items-center gap-1">📍 {botData.room}</span>}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-neutral-50">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full py-12 text-center">
            <div className="w-14 h-14 bg-neutral-100 rounded-2xl flex items-center justify-center mb-3">
              <Bot size={26} className="text-neutral-400" />
            </div>
            <p className="text-sm font-medium text-neutral-500">No messages yet</p>
            <p className="text-xs text-neutral-400 mt-1">Send a command to your Dex Bot below</p>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.from !== 'user' && (
              <div className="w-7 h-7 bg-neutral-900 rounded-lg flex items-center justify-center mr-2 flex-shrink-0 mt-0.5">
                <Bot size={13} className="text-white" />
              </div>
            )}
            <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm ${
              msg.from === 'user'
                ? 'bg-primary-600 text-white rounded-br-sm'
                : msg.from === 'system'
                ? 'bg-yellow-50 border border-yellow-200 text-yellow-800'
                : 'bg-white border border-neutral-100 text-neutral-900 rounded-bl-sm'
            }`}>
              {msg.from === 'bot' && (
                <p className="text-xs font-semibold text-neutral-400 mb-0.5">🤖 Dex Bot</p>
              )}
              {msg.from === 'system' && (
                <p className="text-xs font-semibold text-yellow-600 mb-0.5">⚙️ System</p>
              )}
              <p className="text-sm leading-relaxed">{msg.text}</p>
              <p className={`text-xs mt-1 ${msg.from === 'user' ? 'text-primary-200' : 'text-neutral-400'} text-right`}>
                {fmtTime(msg.time)}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Quick commands */}
      <div className="flex gap-2 px-4 py-2 overflow-x-auto border-t border-neutral-100 bg-white">
        {QUICK_CMDS.map(cmd => (
          <button key={cmd} onClick={() => setInput(cmd)}
            className="px-3 py-1.5 text-xs font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 border border-primary-100 rounded-full whitespace-nowrap transition-colors">
            {cmd}
          </button>
        ))}
      </div>

      {/* Input row */}
      <div className="flex items-center gap-2 px-4 py-3 bg-white border-t border-neutral-100">
        <input ref={inputRef} type="text" value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Type a command… (e.g. turn on light)"
          className="flex-1 px-4 py-2.5 text-sm bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-primary-400 focus:bg-white transition-colors"
        />
        <button onClick={handleSend} disabled={!input.trim() || sending}
          className="w-10 h-10 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white rounded-xl flex items-center justify-center transition-colors flex-shrink-0">
          {sending
            ? <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
            : <Send size={16}/>}
        </button>
        <button onClick={handleClear} disabled={clearing || messages.length === 0} title="Clear history"
          className="w-10 h-10 text-neutral-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30 rounded-xl flex items-center justify-center transition-colors flex-shrink-0">
          <Trash2 size={16}/>
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DexBot() {
  const { user, userData } = useAuth();

  const [botIdInput, setBotIdInput]   = useState('');
  const [connectedBot, setConnectedBot] = useState<DexBotType | null>(null);
  const [devices, setDevices]         = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [activeTab, setActiveTab]     = useState<'chat' | 'controls'>('chat');

  const [pageLoading, setPageLoading] = useState(true);
  const [verifying, setVerifying]     = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError]             = useState('');
  const [verifyStep, setVerifyStep]   = useState<0|1|2>(0);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToUserDevices(user.uid, devs => {
      setDevices(devs);
      if (devs.length > 0) setSelectedDevice(p => p || devs[0].deviceId);
    });
    getUserDexBots(user.uid)
      .then(bots => { const a = bots.find(b => b.status === 'connected'); if (a) setConnectedBot(a); })
      .catch(err => console.error('[DexBot]', err))
      .finally(() => setPageLoading(false));
    return unsub;
  }, [user]);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const trimmed = botIdInput.trim();
    if (!trimmed) { setError('Please enter a Bot ID.'); return; }
    setError(''); setVerifying(true); setVerifyStep(1);
    try {
      await connectDexBot(trimmed, user.uid, selectedDevice || '');
      setVerifyStep(2);
      await new Promise(r => setTimeout(r, 500));
      setConnectedBot({ id: trimmed, dexBotId: trimmed, ownerId: user.uid, status: 'connected', linkedDevice: selectedDevice || '' });
      setBotIdInput('');
    } catch (err: unknown) {
      console.error('[DexBot] connect error:', err);
      if (err instanceof Error && err.message === 'BOT_NOT_FOUND')
        setError('Bot ID not found. Check the ID on your Dex Bot device.');
      else setError(err instanceof Error ? `Failed: ${err.message}` : 'Connection failed. Try again.');
    } finally { setVerifying(false); setVerifyStep(0); }
  }

  async function handleDisconnect() {
    if (!connectedBot) return;
    setDisconnecting(true);
    try { await disconnectDexBot(connectedBot.dexBotId); setConnectedBot(null); }
    catch (err) { console.error('[DexBot] disconnect:', err); }
    finally { setDisconnecting(false); }
  }

  if (pageLoading) return <Loader fullPage />;

  const linkedDevice = devices.find(d => d.deviceId === connectedBot?.linkedDevice);
  const performer    = userData?.name || 'User';

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">Dex Bot</h2>
        <p className="text-sm text-neutral-500 mt-0.5">Connect your Dex Bot to chat and control devices.</p>
      </div>

      {/* ── Connection Card ── */}
      <Card>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 bg-neutral-900 rounded-xl flex items-center justify-center flex-shrink-0">
            <Bot size={22} className="text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-neutral-900">Dex Bot Status</p>
            <p className="text-xs text-neutral-400">
              {connectedBot ? `Connected · ${connectedBot.dexBotId}` : 'Not connected'}
            </p>
          </div>
          {connectedBot && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-success-50 text-success-700 px-2.5 py-1 rounded-full border border-success-100">
              <span className="w-1.5 h-1.5 bg-success-500 rounded-full animate-pulse" /> Connected
            </span>
          )}
        </div>

        {!connectedBot ? (
          <form onSubmit={handleConnect} className="space-y-4">
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-500" />{error}
              </div>
            )}
            {verifying && (
              <div className="p-3.5 bg-blue-50 border border-blue-100 rounded-xl space-y-2">
                {[
                  { step: 1, label: 'Verifying Bot ID in Dexbot database…' },
                  { step: 2, label: 'Linking to Home Automation…' },
                ].map(({ step, label }) => (
                  <div key={step} className={`flex items-center gap-2 text-xs font-medium ${verifyStep >= step ? 'text-blue-700' : 'text-blue-300'}`}>
                    {verifyStep === step
                      ? <svg className="animate-spin w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                        </svg>
                      : <CheckCircle2 size={14} className={`flex-shrink-0 ${verifyStep > step ? 'text-blue-600' : 'opacity-30'}`}/>}
                    Step {step} · {label}
                  </div>
                ))}
              </div>
            )}
            <div>
              <label className="form-label">Bot ID</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none"><Bot size={15} className="text-neutral-400"/></div>
                <input type="text" className="form-input pl-9 font-mono tracking-widest"
                  placeholder="e.g. dex_1" value={botIdInput}
                  onChange={e => { setError(''); setBotIdInput(e.target.value); }}
                  disabled={verifying} required autoComplete="off" spellCheck={false}/>
              </div>
              <p className="text-xs text-neutral-400 mt-1.5 flex items-center gap-1">
                <Link2 size={11}/> Enter the exact Bot ID (e.g.&nbsp;<span className="font-mono font-semibold text-neutral-600">dex_1</span>)
              </p>
            </div>
            <div>
              <label className="form-label">Link to Home Device <span className="text-neutral-400 font-normal">(optional)</span></label>
              {devices.length > 0 ? (
                <select className="form-input" value={selectedDevice} onChange={e => setSelectedDevice(e.target.value)} disabled={verifying}>
                  <option value="">— No device —</option>
                  {devices.map(d => <option key={d.id} value={d.deviceId}>{d.name} · {d.room}</option>)}
                </select>
              ) : (
                <div className="mt-1.5 p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-xs text-yellow-700 flex items-start gap-2">
                  <AlertCircle size={13} className="mt-0.5 shrink-0"/> No devices found — you can still connect Dex Bot.
                </div>
              )}
            </div>
            <Button type="submit" loading={verifying} disabled={verifying} className="w-full">
              <Plug size={16}/> {verifying ? 'Connecting…' : 'Connect Dex Bot'}
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="bg-neutral-50 rounded-xl p-4 divide-y divide-neutral-100">
              {[
                { label: 'Bot ID', value: connectedBot.dexBotId, mono: true },
                { label: 'Status', value: 'Connected' },
                { label: 'Linked Device', value: linkedDevice?.name || (connectedBot.linkedDevice || 'None') },
                ...(linkedDevice ? [{ label: 'Room', value: linkedDevice.room, mono: false }] : []),
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between py-2.5 text-sm first:pt-0 last:pb-0">
                  <span className="text-neutral-500">{item.label}</span>
                  <span className={`font-semibold text-neutral-900 ${item.mono ? 'font-mono text-xs tracking-widest' : ''}`}>{item.value}</span>
                </div>
              ))}
            </div>
            <Button variant="danger" size="sm" onClick={handleDisconnect} loading={disconnecting}>
              <X size={14}/> {disconnecting ? 'Disconnecting…' : 'Disconnect Bot'}
            </Button>
          </div>
        )}
      </Card>

      {/* ── Tabs: Chat + Controls ── */}
      {connectedBot && (
        <Card className="overflow-hidden !p-0">
          {/* Tab bar */}
          <div className="flex border-b border-neutral-100">
            {([
              { id: 'chat' as const, icon: <MessageSquare size={15}/>, label: 'Chat' },
              { id: 'controls' as const, icon: <Sliders size={15}/>, label: 'Controls' },
            ]).map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-medium transition-colors
                  ${activeTab === tab.id
                    ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50/40'
                    : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50'}`}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="p-4">
            {activeTab === 'chat' && (
              <ChatPanel botId={connectedBot.dexBotId} senderName={performer}/>
            )}
            {activeTab === 'controls' && (
              linkedDevice
                ? <DeviceControlPanel device={linkedDevice} performer={performer}/>
                : (
                  <div className="flex items-center justify-between gap-3 py-2">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-yellow-50 rounded-xl flex items-center justify-center flex-shrink-0">
                        <AlertCircle size={15} className="text-yellow-500"/>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-neutral-800">No device linked</p>
                        <p className="text-xs text-neutral-400">Disconnect and reconnect with a device selected.</p>
                      </div>
                    </div>
                    <a href="/devices" className="text-xs text-primary-600 font-medium flex items-center gap-1 hover:underline shrink-0">
                      Add Device <ChevronRight size={13}/>
                    </a>
                  </div>
                )
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
