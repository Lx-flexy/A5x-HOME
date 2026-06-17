import { useEffect, useState } from 'react';
import {
  Bot, Link2, Plug, X, CheckCircle2, AlertCircle,
  Send, Smile, ChevronDown,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  connectDexBot,
  disconnectDexBot,
  getUserDexBots,
  subscribeToDexBot,
  sendBotMessage,
  updateBotEmotion,
  DexBot as DexBotType,
} from '../../services/dexbotService';
import Loader from '../../components/ui/Loader';

// ─── Emotion options ───────────────────────────────────────────────────────
const EMOTIONS = [
  { key: 'happy',    emoji: '😀', label: 'Happy'    },
  { key: 'normal',   emoji: '😐', label: 'Normal'   },
  { key: 'cool',     emoji: '😎', label: 'Cool'     },
  { key: 'sleep',    emoji: '😴', label: 'Sleep'    },
  { key: 'surprise', emoji: '😲', label: 'Surprise' },
  { key: 'angry',    emoji: '😠', label: 'Angry'    },
  { key: 'robot',    emoji: '🤖', label: 'Robot'    },
] as const;
type EmotionKey = typeof EMOTIONS[number]['key'];

// ─── Shared UI primitives ──────────────────────────────────────────────────
function NeoCard({
  children,
  className = '',
  style = {},
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`rounded-[22px] p-5 ${className}`}
      style={{
        background: '#F4F7FB',
        boxShadow:
          '6px 6px 16px rgba(166,180,200,0.45), -6px -6px 16px rgba(255,255,255,0.85)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[10px] font-bold uppercase tracking-widest mb-3"
      style={{ color: '#9ca3af' }}
    >
      {children}
    </p>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between px-4 py-2.5 rounded-2xl mb-2"
      style={{
        background: '#EEF2F7',
        boxShadow:
          'inset 2px 2px 5px rgba(166,180,200,0.4), inset -2px -2px 5px rgba(255,255,255,0.75)',
      }}
    >
      <span className="text-xs font-medium" style={{ color: '#9ca3af' }}>
        {label}
      </span>
      <span
        className={`text-xs font-bold text-neutral-800 ${
          mono ? 'font-mono tracking-widest' : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function NeoInput({
  value,
  onChange,
  onKeyDown,
  placeholder,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  placeholder: string;
  inputRef?: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div
      className="flex-1 flex items-center rounded-2xl px-4"
      style={{
        background: '#EEF2F7',
        height: 44,
        boxShadow:
          'inset 2px 2px 5px rgba(166,180,200,0.45), inset -2px -2px 5px rgba(255,255,255,0.75)',
      }}
    >
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-sm outline-none text-neutral-800 placeholder-neutral-400"
      />
    </div>
  );
}

function NeoButton({
  onClick,
  disabled,
  loading,
  children,
  danger,
  small,
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  danger?: boolean;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`flex items-center justify-center gap-1.5 font-semibold rounded-2xl transition-all disabled:opacity-40 ${
        small ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'
      }`}
      style={
        danger
          ? { background: 'rgba(239,68,68,0.1)', color: '#ef4444' }
          : {
              background: 'linear-gradient(135deg,#2563eb,#3b82f6)',
              color: 'white',
              boxShadow: '3px 3px 8px rgba(37,99,235,0.35)',
            }
      }
    >
      {loading ? (
        <svg
          className="animate-spin w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8H4z"
          />
        </svg>
      ) : null}
      {children}
    </button>
  );
}

// ─── Connect Modal ─────────────────────────────────────────────────────────
function ConnectModal({
  onConnect,
  onClose,
}: {
  onConnect: (botId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [botId, setBotId] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSubmit() {
    if (!botId.trim()) return;
    setConnecting(true);
    setError('');
    try {
      await onConnect(botId.trim());
      setSuccess(true);
      setTimeout(onClose, 1400);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        msg.includes('BOT_NOT_FOUND')
          ? `Bot ID "${botId}" not found. Check the ID and try again.`
          : msg
      );
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <NeoCard className="w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#1f2937,#374151)' }}
            >
              <Bot size={16} className="text-white" />
            </div>
            <h3 className="text-base font-bold text-neutral-800">
              Connect Dex Bot
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-xl"
            style={{ background: '#EEF2F7', color: '#9ca3af' }}
          >
            <X size={14} />
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center py-6 gap-2">
            <CheckCircle2 size={36} style={{ color: '#16a34a' }} />
            <p className="text-sm font-semibold text-neutral-700">
              Bot connected successfully
            </p>
          </div>
        ) : (
          <>
            <SectionLabel>Bot ID</SectionLabel>
            <div className="flex gap-2 mb-3">
              <NeoInput
                value={botId}
                onChange={setBotId}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="Enter your Dex Bot ID…"
              />
            </div>

            {error && (
              <div
                className="flex items-start gap-2 px-3 py-2.5 rounded-xl mb-3 text-xs font-medium"
                style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626' }}
              >
                <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
                {error}
              </div>
            )}

            <NeoButton
              onClick={handleSubmit}
              loading={connecting}
              disabled={!botId.trim()}
            >
              <Plug size={14} />
              {connecting ? 'Connecting…' : 'Connect'}
            </NeoButton>
          </>
        )}
      </NeoCard>
    </div>
  );
}

// ─── Bot Panel ─────────────────────────────────────────────────────────────
function BotPanel({
  bot,
  onDisconnect,
}: {
  bot: DexBotType;
  onDisconnect: () => void;
}) {
  // Message state
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [msgOk, setMsgOk] = useState(false);

  // Emotion state
  const [emotion, setEmotion] = useState<EmotionKey>(
    (bot.currentEmotion as EmotionKey) ?? 'normal'
  );
  const [updating, setUpdating] = useState(false);
  const [emotionOk, setEmotionOk] = useState(false);

  // Disconnecting state
  const [disconnecting, setDisconnecting] = useState(false);

  // Sync emotion from live bot data
  useEffect(() => {
    if (bot.currentEmotion) {
      setEmotion(bot.currentEmotion as EmotionKey);
    }
  }, [bot.currentEmotion]);

  async function handleSendMessage() {
    if (!message.trim() || sending) return;
    setSending(true);
    setMsgOk(false);
    try {
      await sendBotMessage(bot.dexBotId, message.trim());
      setMsgOk(true);
      setMessage('');
      setTimeout(() => setMsgOk(false), 2000);
    } catch (e) {
      console.error('[BotPanel] sendBotMessage error:', e);
    } finally {
      setSending(false);
    }
  }

  async function handleUpdateEmotion() {
    if (updating) return;
    setUpdating(true);
    setEmotionOk(false);
    try {
      await updateBotEmotion(bot.dexBotId, emotion);
      setEmotionOk(true);
      setTimeout(() => setEmotionOk(false), 2000);
    } catch (e) {
      console.error('[BotPanel] updateBotEmotion error:', e);
    } finally {
      setUpdating(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await disconnectDexBot(bot.dexBotId);
      onDisconnect();
    } catch (e) {
      console.error('[BotPanel] disconnect error:', e);
    } finally {
      setDisconnecting(false);
    }
  }

  const lastSeen = bot.updatedAt
    ? new Date(bot.updatedAt.toMillis()).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

  const currentEmotionInfo =
    EMOTIONS.find((e) => e.key === (bot.currentEmotion ?? 'normal')) ?? EMOTIONS[1];

  return (
    <div className="space-y-4">
      {/* ── Status Card ── */}
      <NeoCard>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-[16px] flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg,#1f2937,#374151)',
                boxShadow: '4px 4px 10px rgba(31,41,55,0.3)',
              }}
            >
              <Bot size={22} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-neutral-800">
                {bot.dexBotId}
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    bot.status === 'connected'
                      ? 'bg-green-500 animate-pulse'
                      : 'bg-gray-400'
                  }`}
                />
                <span
                  className="text-xs font-medium"
                  style={{
                    color:
                      bot.status === 'connected' ? '#16a34a' : '#9ca3af',
                  }}
                >
                  {bot.status === 'connected' ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>
          <NeoButton onClick={handleDisconnect} loading={disconnecting} danger small>
            <X size={12} />
            {disconnecting ? 'Disconnecting…' : 'Disconnect'}
          </NeoButton>
        </div>

        <SectionLabel>Status</SectionLabel>
        <InfoRow label="Bot ID" value={bot.dexBotId} mono />
        <InfoRow
          label="Status"
          value={
            <span
              style={{
                color:
                  bot.status === 'connected' ? '#16a34a' : '#9ca3af',
              }}
            >
              {bot.status === 'connected' ? '● Connected' : '○ Disconnected'}
            </span>
          }
        />
        <InfoRow label="Last Seen" value={lastSeen} />
        <InfoRow
          label="Current Emotion"
          value={
            <span>
              {currentEmotionInfo.emoji} {currentEmotionInfo.label}
            </span>
          }
        />
        {bot.currentMessage && (
          <InfoRow label="Last Message" value={bot.currentMessage} />
        )}
      </NeoCard>

      {/* ── Send Message Card ── */}
      <NeoCard>
        <SectionLabel>Send Message</SectionLabel>
        <p className="text-xs mb-3" style={{ color: '#9ca3af' }}>
          Send a text message to the Dex Bot display.
        </p>
        <div className="flex gap-2">
          <NeoInput
            value={message}
            onChange={setMessage}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="Type a message…"
          />
          <button
            onClick={handleSendMessage}
            disabled={!message.trim() || sending}
            className="w-11 h-11 flex items-center justify-center rounded-2xl flex-shrink-0 disabled:opacity-40 transition-all"
            style={{
              background: 'linear-gradient(135deg,#2563eb,#3b82f6)',
              boxShadow: '3px 3px 8px rgba(37,99,235,0.35)',
            }}
          >
            {sending ? (
              <svg
                className="animate-spin w-4 h-4 text-white"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                />
              </svg>
            ) : (
              <Send size={15} className="text-white" />
            )}
          </button>
        </div>
        {msgOk && (
          <div className="flex items-center gap-1.5 mt-2.5 text-xs font-semibold" style={{ color: '#16a34a' }}>
            <CheckCircle2 size={13} />
            Message sent to bot
          </div>
        )}
      </NeoCard>

      {/* ── Change Emotion Card ── */}
      <NeoCard>
        <SectionLabel>Change Emotion</SectionLabel>
        <p className="text-xs mb-3" style={{ color: '#9ca3af' }}>
          Select an emotion to update the bot's facial expression.
        </p>

        {/* Dropdown */}
        <div className="relative mb-3">
          <div
            className="flex items-center justify-between px-4 rounded-2xl cursor-pointer"
            style={{
              background: '#EEF2F7',
              height: 44,
              boxShadow:
                'inset 2px 2px 5px rgba(166,180,200,0.45), inset -2px -2px 5px rgba(255,255,255,0.75)',
            }}
          >
            <select
              value={emotion}
              onChange={(e) => setEmotion(e.target.value as EmotionKey)}
              className="flex-1 bg-transparent text-sm font-semibold outline-none text-neutral-800 appearance-none cursor-pointer"
            >
              {EMOTIONS.map((em) => (
                <option key={em.key} value={em.key}>
                  {em.emoji}  {em.label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} style={{ color: '#9ca3af', pointerEvents: 'none' }} />
          </div>
        </div>

        {/* Emotion pills preview */}
        <div className="flex flex-wrap gap-2 mb-4">
          {EMOTIONS.map((em) => (
            <button
              key={em.key}
              onClick={() => setEmotion(em.key)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-2xl text-xs font-semibold transition-all"
              style={
                emotion === em.key
                  ? {
                      background: 'linear-gradient(135deg,#2563eb,#3b82f6)',
                      color: 'white',
                      boxShadow: '2px 2px 6px rgba(37,99,235,0.3)',
                    }
                  : {
                      background: '#EEF2F7',
                      color: '#6b7280',
                      boxShadow:
                        '2px 2px 5px rgba(166,180,200,0.35), -2px -2px 5px rgba(255,255,255,0.75)',
                    }
              }
            >
              <span>{em.emoji}</span>
              {em.label}
            </button>
          ))}
        </div>

        <NeoButton onClick={handleUpdateEmotion} loading={updating}>
          <Smile size={14} />
          {updating ? 'Updating…' : 'Update Emotion'}
        </NeoButton>

        {emotionOk && (
          <div className="flex items-center gap-1.5 mt-2.5 text-xs font-semibold" style={{ color: '#16a34a' }}>
            <CheckCircle2 size={13} />
            Emotion updated
          </div>
        )}
      </NeoCard>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────
export default function DexBotPage() {
  const { user } = useAuth();

  const [bots, setBots] = useState<DexBotType[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeBot, setActiveBot] = useState<DexBotType | null>(null);
  const [showConnect, setShowConnect] = useState(false);

  // Load bots on mount
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    getUserDexBots(user.uid)
      .then((bs) => {
        if (cancelled) return;
        setBots(bs);
        if (bs.length > 0) setActiveBot(bs[0]);
      })
      .catch((e) => console.error('[DexBotPage] load error:', e))
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [user]);

  // Realtime Firestore listener for the active bot
  useEffect(() => {
    if (!activeBot) return;
    const unsub = subscribeToDexBot(activeBot.dexBotId, (updated) => {
      if (!updated) return;
      setActiveBot(updated);
      setBots((prev) =>
        prev.map((b) => (b.dexBotId === updated.dexBotId ? updated : b))
      );
    });
    return unsub;
  }, [activeBot?.dexBotId]);

  async function handleConnect(botId: string) {
    if (!user) return;
    await connectDexBot(botId, user.uid, '');
    const updated = await getUserDexBots(user.uid);
    setBots(updated);
    const justConnected = updated.find((b) => b.dexBotId === botId) ?? null;
    setActiveBot(justConnected);
    setShowConnect(false);
  }

  function handleDisconnect() {
    setBots((prev) => prev.filter((b) => b.dexBotId !== activeBot?.dexBotId));
    setActiveBot(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ background: '#F4F7FB' }}>
      <div className="max-w-2xl mx-auto">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg,#1f2937,#374151)',
                boxShadow: '4px 4px 10px rgba(31,41,55,0.3)',
              }}
            >
              <Bot size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-neutral-800">Dex Bot</h1>
              <p className="text-xs" style={{ color: '#9ca3af' }}>
                {bots.length} bot{bots.length !== 1 ? 's' : ''} connected
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowConnect(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold text-white transition-all"
            style={{
              background: 'linear-gradient(135deg,#2563eb,#3b82f6)',
              boxShadow: '3px 3px 8px rgba(37,99,235,0.35)',
            }}
          >
            <Link2 size={15} />
            Connect Bot
          </button>
        </div>

        {/* ── Bot selector tabs (if multiple bots) ── */}
        {bots.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4" style={{ scrollbarWidth: 'none' }}>
            {bots.map((bot) => (
              <button
                key={bot.id}
                onClick={() => setActiveBot(bot)}
                className="flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-semibold flex-shrink-0 transition-all"
                style={
                  activeBot?.id === bot.id
                    ? {
                        background: 'linear-gradient(135deg,#1f2937,#374151)',
                        color: 'white',
                        boxShadow: '3px 3px 8px rgba(31,41,55,0.3)',
                      }
                    : {
                        background: '#EEF2F7',
                        color: '#6b7280',
                        boxShadow:
                          '2px 2px 5px rgba(166,180,200,0.35), -2px -2px 5px rgba(255,255,255,0.75)',
                      }
                }
              >
                <Bot size={12} />
                {bot.dexBotId}
              </button>
            ))}
          </div>
        )}

        {/* ── Empty state ── */}
        {bots.length === 0 ? (
          <NeoCard className="text-center py-16">
            <div
              className="w-16 h-16 rounded-[20px] flex items-center justify-center mx-auto mb-4"
              style={{
                background: '#EEF2F7',
                boxShadow:
                  '5px 5px 12px rgba(166,180,200,0.4), -5px -5px 12px rgba(255,255,255,0.85)',
              }}
            >
              <Bot size={28} style={{ color: '#9ca3af' }} />
            </div>
            <h2 className="text-lg font-bold text-neutral-700 mb-2">
              No Bots Connected
            </h2>
            <p className="text-sm mb-6" style={{ color: '#9ca3af' }}>
              Connect your Dex Bot using its Bot ID to get started.
            </p>
            <button
              onClick={() => setShowConnect(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold text-white"
              style={{
                background: 'linear-gradient(135deg,#2563eb,#3b82f6)',
                boxShadow: '3px 3px 8px rgba(37,99,235,0.35)',
              }}
            >
              <Plug size={15} />
              Connect Your First Bot
            </button>
          </NeoCard>
        ) : activeBot ? (
          <BotPanel bot={activeBot} onDisconnect={handleDisconnect} />
        ) : null}
      </div>

      {/* ── Connect Modal ── */}
      {showConnect && (
        <ConnectModal
          onConnect={handleConnect}
          onClose={() => setShowConnect(false)}
        />
      )}
    </div>
  );
}
