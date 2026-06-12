import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ChevronRight,
  Lightbulb,
  Wind,
  Trash2,
  Monitor,
  Volume2,
  Wifi,
  Clock,
  Cpu,
  Activity,
  Edit2,
  MapPin,
  Trash,
} from 'lucide-react';
import { getDevice, subscribeToDeviceState, updateDeviceState, deleteDevice, logActivity, Device, DeviceState } from '../../services/deviceService';
import { useAuth } from '../../context/AuthContext';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Loader from '../../components/ui/Loader';
import Modal from '../../components/ui/Modal';

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle-switch">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <div className="toggle-track">
        <div className="toggle-thumb" />
      </div>
    </label>
  );
}

export default function DeviceDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userData } = useAuth();
  const [device, setDevice] = useState<Device | null>(null);
  const [state, setState] = useState<DeviceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [oledMsg, setOledMsg] = useState('');
  const [sendingOled, setSendingOled] = useState(false);
  const [beeping, setBeeping] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    getDevice(id).then(dev => {
      setDevice(dev);
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    if (!device) return;
    const unsub = subscribeToDeviceState(device.deviceId, s => setState(s));
    return unsub;
  }, [device]);

  async function handleToggle(key: 'light' | 'fan', value: boolean) {
    if (!device) return;
    await updateDeviceState(device.deviceId, { [key]: value });
    await logActivity(device.deviceId, `${key === 'light' ? 'Light' : 'Fan'} turned ${value ? 'ON' : 'OFF'}`, userData?.name || 'User');
  }

  async function handleDustbin(open: boolean) {
    if (!device) return;
    await updateDeviceState(device.deviceId, { dustbin: open ? 'open' : 'closed' });
    await logActivity(device.deviceId, `Dustbin ${open ? 'opened' : 'closed'}`, userData?.name || 'User');
  }

  async function handleSendOled() {
    if (!device || !oledMsg.trim()) return;
    setSendingOled(true);
    await updateDeviceState(device.deviceId, { oledMessage: oledMsg });
    await logActivity(device.deviceId, `OLED message sent: "${oledMsg}"`, userData?.name || 'User');
    setOledMsg('');
    setSendingOled(false);
  }

  async function handleBuzzerBeep() {
    if (!device) return;
    setBeeping(true);
    await updateDeviceState(device.deviceId, { buzzer: true });
    await logActivity(device.deviceId, 'Buzzer beeped', userData?.name || 'User');
    setTimeout(async () => {
      await updateDeviceState(device.deviceId, { buzzer: false });
      setBeeping(false);
    }, 2000);
  }

  async function handleDelete() {
    if (!device) return;
    setDeleting(true);
    await deleteDevice(device.id);
    navigate('/devices');
  }

  if (loading) return <Loader fullPage />;
  if (!device) return (
    <div className="text-center py-20">
      <p className="text-neutral-500">Device not found.</p>
      <Link to="/devices" className="text-primary-600 text-sm mt-2 block">Back to Devices</Link>
    </div>
  );

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        <Link to="/devices" className="hover:text-neutral-700">Devices</Link>
        <ChevronRight size={14} />
        <span className="text-neutral-900 font-medium">{device.name}</span>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-neutral-900">{device.name}</h2>
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${device.status === 'online' ? 'bg-success-50 text-success-600' : 'bg-neutral-100 text-neutral-500'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${device.status === 'online' ? 'bg-success-500' : 'bg-neutral-400'}`} />
            {device.status === 'online' ? 'Online' : 'Offline'}
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm">
            <Edit2 size={14} /> Edit Device
          </Button>
          <Button variant="danger" size="sm" onClick={() => setDeleteModal(true)}>
            <Trash size={14} /> Remove
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Device ID', value: device.deviceId, icon: <Cpu size={15} className="text-neutral-500" /> },
          { label: 'Room', value: device.room, icon: <MapPin size={15} className="text-neutral-500" /> },
          { label: 'Location', value: device.location, icon: <MapPin size={15} className="text-neutral-500" /> },
          { label: 'Added On', value: device.createdAt ? new Date((device.createdAt as { seconds: number }).seconds * 1000).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '–', icon: <Clock size={15} className="text-neutral-500" /> },
        ].map(item => (
          <Card key={item.label}>
            <div className="flex items-center gap-2 mb-1">{item.icon}<p className="text-xs text-neutral-400">{item.label}</p></div>
            <p className="text-sm font-semibold text-neutral-900">{item.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <h3 className="text-sm font-semibold text-neutral-900 mb-4">Controls</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-neutral-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-yellow-50 rounded-xl flex items-center justify-center">
                  <Lightbulb size={18} className="text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-900">Light</p>
                  <p className="text-xs text-neutral-400">{state?.light ? 'On' : 'Off'}</p>
                </div>
              </div>
              <Toggle
                checked={state?.light || false}
                onChange={v => handleToggle('light', v)}
              />
            </div>

            <div className="flex items-center justify-between py-3 border-b border-neutral-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Wind size={18} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-900">Fan</p>
                  <p className="text-xs text-neutral-400">{state?.fan ? 'On' : 'Off'}</p>
                </div>
              </div>
              <Toggle
                checked={state?.fan || false}
                onChange={v => handleToggle('fan', v)}
              />
            </div>

            <div className="flex items-center justify-between py-3 border-b border-neutral-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-green-50 rounded-xl flex items-center justify-center">
                  <Trash2 size={18} className="text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-900">Dustbin</p>
                  <p className="text-xs text-neutral-400 capitalize">{state?.dustbin || 'Closed'}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleDustbin(true)}
                  disabled={state?.dustbin === 'open'}
                  className="px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-40 transition-colors"
                >
                  Open
                </button>
                <button
                  onClick={() => handleDustbin(false)}
                  disabled={state?.dustbin === 'closed'}
                  className="px-3 py-1.5 text-xs font-medium bg-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-300 disabled:opacity-40 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="py-3 border-b border-neutral-100">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 bg-purple-50 rounded-xl flex items-center justify-center">
                  <Monitor size={18} className="text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-900">OLED Display</p>
                  <p className="text-xs text-neutral-400">Send a message</p>
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="form-input flex-1"
                  placeholder="Type a message..."
                  value={oledMsg}
                  onChange={e => setOledMsg(e.target.value)}
                  maxLength={64}
                />
                <Button size="sm" onClick={handleSendOled} loading={sendingOled} disabled={!oledMsg.trim()}>
                  Send
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-orange-50 rounded-xl flex items-center justify-center">
                  <Volume2 size={18} className="text-orange-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-900">Buzzer</p>
                  <p className="text-xs text-neutral-400">Test beep</p>
                </div>
              </div>
              <Button size="sm" variant="secondary" onClick={handleBuzzerBeep} loading={beeping}>
                Beep
              </Button>
            </div>
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <h3 className="text-sm font-semibold text-neutral-900 mb-4">Device Info</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: <Wifi size={15} className="text-neutral-500" />, label: 'Wi-Fi Signal', value: device.status === 'online' ? 'Strong' : '–' },
                { icon: <Cpu size={15} className="text-neutral-500" />, label: 'Firmware', value: 'v1.2.4' },
                { icon: <Clock size={15} className="text-neutral-500" />, label: 'Last Seen', value: device.status === 'online' ? '2 min ago' : '–' },
                { icon: <Activity size={15} className="text-neutral-500" />, label: 'Uptime', value: device.status === 'online' ? '2d 4h 15m' : '–' },
              ].map(item => (
                <div key={item.label}>
                  <div className="flex items-center gap-1.5 mb-1">
                    {item.icon}
                    <p className="text-xs text-neutral-400">{item.label}</p>
                  </div>
                  <p className="text-sm font-semibold text-neutral-900">{item.value}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-neutral-900 mb-3">Actions</h3>
            <div className="space-y-2">
              {[
                { icon: <Edit2 size={14} className="text-neutral-500" />, label: 'Edit Device' },
                { icon: <MapPin size={14} className="text-neutral-500" />, label: 'Change Room' },
                { icon: <MapPin size={14} className="text-neutral-500" />, label: 'Change Location' },
              ].map(item => (
                <button
                  key={item.label}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50 rounded-lg transition-colors text-left"
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
              <button
                onClick={() => setDeleteModal(true)}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-error-500 hover:bg-error-50 rounded-lg transition-colors text-left"
              >
                <Trash size={14} className="text-error-500" />
                Remove Device
              </button>
            </div>
          </Card>
        </div>
      </div>

      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Remove Device">
        <p className="text-sm text-neutral-600 mb-5">
          Are you sure you want to remove <strong>{device.name}</strong>? This cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={() => setDeleteModal(false)}>Cancel</Button>
          <Button variant="danger" loading={deleting} onClick={handleDelete}>Remove</Button>
        </div>
      </Modal>
    </div>
  );
}
