import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, Lightbulb, Wind, Monitor, Volume2, Bolt } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { addDevice, logActivity } from '../../services/deviceService';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';

const STEPS = ['Device ID', 'Room', 'Location', 'Review', 'Complete'];

const ROOMS = ['Living Room', 'Bedroom', 'Kitchen', 'Office'];

// Actual ESP32 firmware v1 channels
const COMPONENTS = [
  { key: 'light1',   label: 'Light 1',        icon: <Lightbulb size={16} className="text-yellow-600" />, bg: 'bg-yellow-50' },
  { key: 'light2',   label: 'Light 2',        icon: <Lightbulb size={16} className="text-yellow-600" />, bg: 'bg-yellow-50' },
  { key: 'light3',   label: 'Light 3',        icon: <Lightbulb size={16} className="text-yellow-600" />, bg: 'bg-yellow-50' },
  { key: 'fan1',     label: 'Fan 1',          icon: <Wind size={16} className="text-blue-600" />,        bg: 'bg-blue-50'   },
  { key: 'fan2',     label: 'Fan 2',          icon: <Wind size={16} className="text-blue-600" />,        bg: 'bg-blue-50'   },
  { key: 'custom1',  label: 'Custom Device',  icon: <Bolt size={16} className="text-purple-600" />,      bg: 'bg-purple-50' },
  { key: 'oled',     label: 'OLED Display',   icon: <Monitor size={16} className="text-slate-600" />,    bg: 'bg-slate-50'  },
  { key: 'buzzer',   label: 'Buzzer',         icon: <Volume2 size={16} className="text-orange-600" />,   bg: 'bg-orange-50' },
];

export default function AddDevice() {
  const navigate = useNavigate();
  const { user, userData } = useAuth();
  const [step, setStep] = useState(0);
  const [deviceId, setDeviceId] = useState('');
  const [room, setRoom] = useState('');
  const [customRoom, setCustomRoom] = useState('');
  const [location, setLocation] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedRoom = room === 'custom' ? customRoom : room;

  function handleDeviceIdStep(e: React.FormEvent) {
    e.preventDefault();
    if (!deviceId.trim()) {
      setError('Please enter a Device ID');
      return;
    }
    setError('');
    setStep(1);
  }

  function handleRoomStep(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRoom.trim()) {
      setError('Please select or enter a room');
      return;
    }
    setError('');
    setStep(2);
  }

  function handleLocationStep(e: React.FormEvent) {
    e.preventDefault();
    if (!location.trim()) {
      setError('Please enter a location');
      return;
    }
    if (!deviceName.trim()) {
      setError('Please enter a device name');
      return;
    }
    setError('');
    setStep(3);
  }

  async function handleSubmit() {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      await addDevice({
        deviceId: deviceId.toUpperCase(),
        ownerId: user.uid,
        name: deviceName,
        room: selectedRoom,
        location,
        firmware: 'v1.2.4',
        dexBotId: '',
        createdAt: null,
      });
      await logActivity(deviceId.toUpperCase(), `Device "${deviceName}" added`, userData?.name || 'Unknown');
      setStep(4);
    } catch {
      setError('Failed to add device. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">Add Device</h2>
        <p className="text-sm text-neutral-500 mt-0.5">Connect a new ESP32 smart home device</p>
      </div>

      <div className="flex items-center gap-0">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 transition-colors ${
                  i < step
                    ? 'bg-primary-600 text-white'
                    : i === step
                    ? 'bg-primary-600 text-white ring-4 ring-primary-100'
                    : 'bg-neutral-200 text-neutral-500'
                }`}
              >
                {i < step ? <Check size={13} /> : i + 1}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${i === step ? 'text-primary-600' : i < step ? 'text-neutral-600' : 'text-neutral-400'}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-px mx-3 ${i < step ? 'bg-primary-600' : 'bg-neutral-200'}`} />
            )}
          </div>
        ))}
      </div>

      <Card>
        {error && (
          <div className="mb-4 p-3 bg-error-50 border border-red-200 rounded-lg text-sm text-error-600">
            {error}
          </div>
        )}

        {step === 0 && (
          <form onSubmit={handleDeviceIdStep} className="space-y-5">
            <div>
              <h3 className="text-base font-semibold text-neutral-900 mb-1">Enter your device ID</h3>
              <p className="text-sm text-neutral-500">Find the device ID on your ESP32 device or OLED screen.</p>
            </div>
            <div>
              <label className="form-label">Device ID</label>
              <input
                type="text"
                className="form-input"
                placeholder="Enter device ID (e.g. A5X-HA-2647)"
                value={deviceId}
                onChange={e => setDeviceId(e.target.value.toUpperCase())}
              />
              <p className="text-xs text-neutral-400 mt-1.5">Format: A5X-HA-XXXX</p>
            </div>
            <div className="flex justify-end">
              <Button type="submit">
                Next <ChevronRight size={15} />
              </Button>
            </div>
          </form>
        )}

        {step === 1 && (
          <form onSubmit={handleRoomStep} className="space-y-5">
            <div>
              <h3 className="text-base font-semibold text-neutral-900 mb-1">Select Room</h3>
              <p className="text-sm text-neutral-500">Choose which room this device is located in.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {ROOMS.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRoom(r)}
                  className={`p-4 text-sm font-medium rounded-xl border-2 text-left transition-all ${
                    room === r
                      ? 'border-primary-600 bg-primary-50 text-primary-700'
                      : 'border-neutral-200 text-neutral-700 hover:border-neutral-300'
                  }`}
                >
                  {r}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setRoom('custom')}
                className={`p-4 text-sm font-medium rounded-xl border-2 text-left transition-all ${
                  room === 'custom'
                    ? 'border-primary-600 bg-primary-50 text-primary-700'
                    : 'border-neutral-200 text-neutral-700 hover:border-neutral-300'
                }`}
              >
                + Custom Room
              </button>
            </div>
            {room === 'custom' && (
              <input
                type="text"
                className="form-input"
                placeholder="Enter custom room name"
                value={customRoom}
                onChange={e => setCustomRoom(e.target.value)}
                autoFocus
              />
            )}
            <div className="flex justify-between">
              <Button variant="secondary" type="button" onClick={() => setStep(0)}>Back</Button>
              <Button type="submit">Next <ChevronRight size={15} /></Button>
            </div>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleLocationStep} className="space-y-5">
            <div>
              <h3 className="text-base font-semibold text-neutral-900 mb-1">Assign Location & Name</h3>
              <p className="text-sm text-neutral-500">Specify where in the room the device is placed.</p>
            </div>
            <div>
              <label className="form-label">Device Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Living Room Controller"
                value={deviceName}
                onChange={e => setDeviceName(e.target.value)}
              />
            </div>
            <div>
              <label className="form-label">Location / Area</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. TV Area, Main Wall, Window Side"
                value={location}
                onChange={e => setLocation(e.target.value)}
              />
            </div>
            <div className="flex justify-between">
              <Button variant="secondary" type="button" onClick={() => setStep(1)}>Back</Button>
              <Button type="submit">Next <ChevronRight size={15} /></Button>
            </div>
          </form>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-semibold text-neutral-900 mb-1">Review & Confirm</h3>
              <p className="text-sm text-neutral-500">Please confirm your device details before adding.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-neutral-50 rounded-xl p-4 space-y-3">
                {[
                  { label: 'Device ID', value: deviceId.toUpperCase() },
                  { label: 'Device Name', value: deviceName },
                  { label: 'Room', value: selectedRoom },
                  { label: 'Location', value: location },
                ].map(item => (
                  <div key={item.label}>
                    <p className="text-xs text-neutral-400">{item.label}</p>
                    <p className="text-sm font-medium text-neutral-900 mt-0.5">{item.value}</p>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-xs font-medium text-neutral-500 mb-3">Detected Components</p>
                <div className="space-y-2">
                  {COMPONENTS.map(comp => (
                    <div key={comp.key} className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 ${comp.bg} rounded-lg flex items-center justify-center`}>
                        {comp.icon}
                      </div>
                      <span className="text-sm text-neutral-700">{comp.label}</span>
                      <div className="ml-auto w-4 h-4 bg-success-500 rounded-full flex items-center justify-center">
                        <Check size={10} className="text-white" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={handleSubmit} loading={loading}>Add Device</Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="text-center py-8 space-y-4">
            <div className="w-16 h-16 bg-success-50 rounded-full flex items-center justify-center mx-auto">
              <Check size={28} className="text-success-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-neutral-900">Device Added Successfully!</h3>
              <p className="text-sm text-neutral-500 mt-1">
                <span className="font-medium">{deviceName}</span> has been added to your home.
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <Button variant="secondary" onClick={() => navigate('/devices')}>
                View All Devices
              </Button>
              <Button onClick={() => {
                setStep(0);
                setDeviceId('');
                setRoom('');
                setCustomRoom('');
                setLocation('');
                setDeviceName('');
              }}>
                Add Another
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
