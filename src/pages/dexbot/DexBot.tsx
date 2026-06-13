import { useEffect, useState } from 'react';
import { Bot, Plug, X, Lightbulb, Wind, BarChart2, Zap } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { connectDexBot, disconnectDexBot, getUserDexBots, DexBot as DexBotType } from '../../services/dexbotService';
import { subscribeToUserDevices, setOutput, Device } from '../../services/deviceService';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Loader from '../../components/ui/Loader';

const SUGGESTED_COMMANDS = [
  { label: 'Turn on Light 1',  icon: <Lightbulb size={14} className="text-yellow-600" />, bg: 'bg-yellow-50' },
  { label: 'Turn off Light 1', icon: <Lightbulb size={14} className="text-neutral-500" />, bg: 'bg-neutral-100' },
  { label: 'Turn on Fan 1',    icon: <Wind size={14} className="text-blue-600" />,   bg: 'bg-blue-50' },
  { label: 'Turn off Fan 1',   icon: <Wind size={14} className="text-blue-600" />,   bg: 'bg-blue-50' },
  { label: 'Turn on Fan 2',    icon: <Wind size={14} className="text-sky-600" />,    bg: 'bg-sky-50' },
  { label: 'Show energy usage',icon: <BarChart2 size={14} className="text-primary-600" />, bg: 'bg-primary-50' },
];

export default function DexBot() {
  const { user, userData } = useAuth();
  const [botIdInput, setBotIdInput] = useState('');
  const [connectedBot, setConnectedBot] = useState<DexBotType | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState('');
  const [cmdFeedback, setCmdFeedback] = useState('');

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToUserDevices(user.uid, devs => {
      setDevices(devs);
      if (devs.length > 0 && !selectedDevice) setSelectedDevice(devs[0].deviceId);
    });

    getUserDexBots(user.uid).then(bots => {
      const connected = bots.find(b => b.status === 'connected');
      if (connected) setConnectedBot(connected);
      setLoading(false);
    });

    return unsub;
  }, [user]);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !selectedDevice) return;
    setError('');
    if (!botIdInput.startsWith('DEX-')) {
      setError('Bot ID must start with DEX-');
      return;
    }
    setConnecting(true);
    try {
      await connectDexBot(botIdInput.toUpperCase(), user.uid, selectedDevice);
      setConnectedBot({ id: botIdInput, dexBotId: botIdInput.toUpperCase(), ownerId: user.uid, status: 'connected', linkedDevice: selectedDevice });
      setBotIdInput('');
    } catch {
      setError('Failed to connect bot. Please try again.');
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!connectedBot) return;
    setDisconnecting(true);
    await disconnectDexBot(connectedBot.dexBotId);
    setConnectedBot(null);
    setDisconnecting(false);
  }

  async function handleCommand(cmd: string) {
    setCmdFeedback(`Executing: "${cmd}"...`);
    const lower = cmd.toLowerCase();
    const device = devices.find(d => connectedBot ? d.deviceId === connectedBot.linkedDevice : true);
    if (!device) { setCmdFeedback('No device linked.'); return; }
    const who = userData?.name || 'Bot';

    if (lower.includes('turn on') && lower.includes('light 1')) {
      await setOutput(device.deviceId, 'light1', true, who, 'Light 1 ON via Dex Bot');
      setCmdFeedback('Light 1 turned ON');
    } else if (lower.includes('turn off') && lower.includes('light 1')) {
      await setOutput(device.deviceId, 'light1', false, who, 'Light 1 OFF via Dex Bot');
      setCmdFeedback('Light 1 turned OFF');
    } else if (lower.includes('turn on') && lower.includes('fan 1')) {
      await setOutput(device.deviceId, 'fan1', true, who, 'Fan 1 ON via Dex Bot');
      setCmdFeedback('Fan 1 turned ON');
    } else if (lower.includes('turn off') && lower.includes('fan 1')) {
      await setOutput(device.deviceId, 'fan1', false, who, 'Fan 1 OFF via Dex Bot');
      setCmdFeedback('Fan 1 turned OFF');
    } else if (lower.includes('turn on') && lower.includes('fan 2')) {
      await setOutput(device.deviceId, 'fan2', true, who, 'Fan 2 ON via Dex Bot');
      setCmdFeedback('Fan 2 turned ON');
    } else if (lower.includes('turn off') && lower.includes('fan 2')) {
      await setOutput(device.deviceId, 'fan2', false, who, 'Fan 2 OFF via Dex Bot');
      setCmdFeedback('Fan 2 turned OFF');
    } else if (lower.includes('energy')) {
      setCmdFeedback('Check Analytics page for energy usage');
    } else {
      setCmdFeedback(`Command received: "${cmd}"`);
    }
    setTimeout(() => setCmdFeedback(''), 3000);
  }

  if (loading) return <Loader fullPage />;

  const linkedDevice = devices.find(d => d.deviceId === connectedBot?.linkedDevice);

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">Dex Bot</h2>
        <p className="text-sm text-neutral-500 mt-0.5">Connect your Dex Bot to control devices using voice or chat.</p>
      </div>

      <Card>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-neutral-900 rounded-xl flex items-center justify-center">
            <Bot size={20} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-900">Dex Bot Status</p>
            <p className="text-xs text-neutral-400">Intelligent home automation assistant</p>
          </div>
          {connectedBot && (
            <div className="ml-auto">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-success-50 text-success-600 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 bg-success-500 rounded-full" />
                Connected
              </span>
            </div>
          )}
        </div>

        {!connectedBot ? (
          <form onSubmit={handleConnect} className="space-y-4">
            {error && <div className="p-3 bg-error-50 border border-red-200 rounded-lg text-sm text-error-600">{error}</div>}
            <div>
              <label className="form-label">Bot ID</label>
              <input
                type="text"
                className="form-input"
                placeholder="Enter Bot ID (e.g. DEX-1234)"
                value={botIdInput}
                onChange={e => setBotIdInput(e.target.value.toUpperCase())}
                required
              />
              <p className="text-xs text-neutral-400 mt-1.5">Format: DEX-XXXX</p>
            </div>
            {devices.length > 0 && (
              <div>
                <label className="form-label">Link to Device</label>
                <select
                  className="form-input"
                  value={selectedDevice}
                  onChange={e => setSelectedDevice(e.target.value)}
                >
                  {devices.map(d => (
                    <option key={d.id} value={d.deviceId}>{d.name}</option>
                  ))}
                </select>
              </div>
            )}
            <Button type="submit" loading={connecting}>
              <Plug size={16} /> Connect Bot
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="bg-neutral-50 rounded-xl p-4 space-y-3">
              {[
                { label: 'Bot ID', value: connectedBot.dexBotId },
                { label: 'Status', value: 'Connected' },
                { label: 'Linked Device', value: linkedDevice?.name || connectedBot.linkedDevice },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between text-sm">
                  <span className="text-neutral-500">{item.label}</span>
                  <span className="font-medium text-neutral-900">{item.value}</span>
                </div>
              ))}
            </div>
            <Button variant="danger" size="sm" onClick={handleDisconnect} loading={disconnecting}>
              <X size={14} /> Disconnect
            </Button>
          </div>
        )}
      </Card>

      {connectedBot && (
        <>
          {linkedDevice && (
            <Card>
              <h3 className="text-sm font-semibold text-neutral-900 mb-3">Linked Device</h3>
              <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-xl">
                <div className="w-9 h-9 bg-primary-50 rounded-xl flex items-center justify-center">
                  <Zap size={16} className="text-primary-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-neutral-900">{linkedDevice.name}</p>
                  <p className="text-xs text-neutral-400">{linkedDevice.deviceId} · {linkedDevice.room} · {linkedDevice.location}</p>
                </div>
                <span className={`text-xs font-medium ${linkedDevice.status === 'online' ? 'text-success-600' : 'text-neutral-400'}`}>
                  {linkedDevice.status === 'online' ? 'Online' : 'Offline'}
                </span>
              </div>
            </Card>
          )}

          <Card>
            <h3 className="text-sm font-semibold text-neutral-900 mb-3">Quick Commands</h3>
            {cmdFeedback && (
              <div className="mb-3 p-2.5 bg-primary-50 border border-primary-100 rounded-lg text-xs font-medium text-primary-700">
                {cmdFeedback}
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {SUGGESTED_COMMANDS.map(cmd => (
                <button
                  key={cmd.label}
                  onClick={() => handleCommand(cmd.label)}
                  className="flex items-center gap-2.5 px-3.5 py-3 text-xs font-medium text-neutral-700 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-xl text-left transition-colors"
                >
                  <div className={`w-6 h-6 ${cmd.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                    {cmd.icon}
                  </div>
                  {cmd.label}
                </button>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
