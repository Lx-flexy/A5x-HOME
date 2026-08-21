import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Cpu, MoreVertical, Trash2, Edit2, ChevronRight, Users, FileEdit } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  subscribeToUserDevices,
  subscribeToLastSeen,
  deleteDevice,
  updateDevice,
  Device,
} from '../../services/deviceService';
import { calcIsOnline } from '../../hooks/useDeviceStatus';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Loader from '../../components/ui/Loader';
import Modal from '../../components/ui/Modal';
import Dropdown, { DropdownItem, DropdownDivider } from '../../components/ui/Dropdown';

export default function Devices() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSeenMap, setLastSeenMap] = useState<Record<string, number>>({});
  const [, tick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Device | null>(null);
  const [editModal, setEditModal] = useState<Device | null>(null);
  const [renameModal, setRenameModal] = useState<Device | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  // 1s ticker so status re-evaluates without new RTDB push
  useEffect(() => {
    tickRef.current = setInterval(() => tick(n => n + 1), 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  // Firestore: device list
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToUserDevices(user.uid, devs => {
      setDevices(devs);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  // RTDB: lastSeen per device
  useEffect(() => {
    if (!devices.length) return;
    const unsubscribers = devices.map(dev =>
      subscribeToLastSeen(dev.deviceId, ms => {
        setLastSeenMap(prev => ({ ...prev, [dev.deviceId]: ms }));
      })
    );
    return () => unsubscribers.forEach(u => u());
  }, [devices]);

  const isDeviceOnline = (deviceId: string) => calcIsOnline(lastSeenMap[deviceId] || 0);

  const handleRowClick = (deviceId: string) => {
    // Only navigate if no menu is open
    if (!menuOpen) {
      navigate(`/devices/${deviceId}`);
    }
  };

  const handleMenuToggle = (deviceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(menuOpen === deviceId ? null : deviceId);
  };

  const handleMenuClose = () => {
    setMenuOpen(null);
  };

  const handleEdit = (device: Device) => {
    setEditModal(device);
    setMenuOpen(null);
  };

  const handleRename = (device: Device) => {
    setRenameModal(device);
    setMenuOpen(null);
  };

  const handleManageMembers = (device: Device) => {
    setMenuOpen(null);
    navigate('/members', { state: { deviceId: device.deviceId } });
  };

  const handleDeleteClick = (device: Device) => {
    setDeleteConfirm(device);
    setMenuOpen(null);
  };

  async function handleDelete() {
    if (!deleteConfirm || !user) return;
    setDeleting(true);
    try {
      await deleteDevice(deleteConfirm.id, deleteConfirm.deviceId, user.uid);
      setDeleteConfirm(null);
    } finally {
      setDeleting(false);
    }
  }

  async function handleSaveEdit(formData: { name: string; room: string; location: string; firmware: string }) {
    if (!editModal) return;
    setSaving(true);
    try {
      await updateDevice(editModal.id, formData);
      setEditModal(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveRename(newName: string) {
    if (!renameModal) return;
    setSaving(true);
    try {
      await updateDevice(renameModal.id, { name: newName.trim() });
      setRenameModal(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Devices</h2>
          <p className="text-sm text-neutral-500 mt-0.5">Manage all your smart home controllers</p>
        </div>
        <Link to="/devices/add">
          <Button><Plus size={16} /> Add Device</Button>
        </Link>
      </div>

      <Card padding={false}>
        {loading ? <Loader /> : devices.length === 0 ? (
          <div className="py-16 text-center">
            <Cpu size={40} className="text-neutral-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-neutral-600">No devices added yet</p>
            <p className="text-xs text-neutral-400 mt-1 mb-4">Add your first ESP32 smart home controller.</p>
            <Link to="/devices/add">
              <Button size="sm"><Plus size={14} /> Add First Device</Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200">
                    {['Device Name', 'Device ID', 'Room', 'Location', 'Status', 'Actions'].map(col => (
                      <th key={col} className="text-left py-3 px-5 text-xs font-medium text-neutral-500 uppercase tracking-wide whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {devices.map(device => {
                    const isOnline = isDeviceOnline(device.deviceId);
                    
                    return (
                      <DeviceRow
                        key={device.id}
                        device={device}
                        isOnline={isOnline}
                        isMenuOpen={menuOpen === device.id}
                        onRowClick={() => handleRowClick(device.id)}
                        onMenuToggle={(e) => handleMenuToggle(device.id, e)}
                        onMenuClose={handleMenuClose}
                        onEdit={() => handleEdit(device)}
                        onRename={() => handleRename(device)}
                        onManageMembers={() => handleManageMembers(device)}
                        onDelete={() => handleDeleteClick(device)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-neutral-100">
              <p className="text-xs text-neutral-400">
                {devices.length} device{devices.length !== 1 ? 's' : ''} · {devices.filter(d => isDeviceOnline(d.deviceId)).length} online
              </p>
            </div>
          </>
        )}
      </Card>

      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Remove Device">
        <div className="text-sm text-neutral-600 space-y-3 mb-5">
          <p>
            Remove <strong>{deleteConfirm?.name}</strong>?
          </p>
          <p>
            This will disconnect the device from your Home Automation account. The ESP32 controller will lose connection to your dashboard and cannot be controlled remotely.
          </p>
          <p className="text-neutral-500">
            All device data, activity logs, and analytics will be permanently deleted and cannot be recovered.
          </p>
        </div>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={() => setDeleteConfirm(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete} loading={deleting}>
            Remove Device
          </Button>
        </div>
      </Modal>

      {/* Edit Device Modal */}
      <Modal open={!!editModal} onClose={() => setEditModal(null)} title="Edit Device">
        <EditDeviceForm
          device={editModal}
          onSave={handleSaveEdit}
          onCancel={() => setEditModal(null)}
          loading={saving}
        />
      </Modal>

      {/* Rename Device Modal */}
      <Modal open={!!renameModal} onClose={() => setRenameModal(null)} title="Rename Device">
        <RenameDeviceForm
          device={renameModal}
          onSave={handleSaveRename}
          onCancel={() => setRenameModal(null)}
          loading={saving}
        />
      </Modal>
    </div>
  );
}

// DeviceRow Component - separate component to handle refs properly
interface DeviceRowProps {
  device: Device;
  isOnline: boolean;
  isMenuOpen: boolean;
  onRowClick: () => void;
  onMenuToggle: (e: React.MouseEvent) => void;
  onMenuClose: () => void;
  onEdit: () => void;
  onRename: () => void;
  onManageMembers: () => void;
  onDelete: () => void;
}

function DeviceRow({ 
  device, 
  isOnline, 
  isMenuOpen, 
  onRowClick, 
  onMenuToggle, 
  onMenuClose,
  onEdit, 
  onRename, 
  onManageMembers, 
  onDelete 
}: DeviceRowProps) {
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <tr 
      className="hover:bg-neutral-50 transition-colors cursor-pointer"
      onClick={onRowClick}
    >
      <td className="py-3.5 px-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <Cpu size={15} className="text-primary-600" />
          </div>
          <span className="font-medium text-neutral-900">{device.name}</span>
        </div>
      </td>
      <td className="py-3.5 px-5 text-neutral-500 font-mono text-xs">{device.deviceId}</td>
      <td className="py-3.5 px-5 text-neutral-600">{device.room}</td>
      <td className="py-3.5 px-5 text-neutral-600">{device.location}</td>
      <td className="py-3.5 px-5">
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${isOnline ? 'text-success-600' : 'text-neutral-400'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-success-500 animate-pulse' : 'bg-neutral-300'}`} />
          {isOnline ? 'Online' : 'Offline'}
        </span>
      </td>
      <td className="py-3.5 px-5">
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Link
            to={`/devices/${device.id}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors"
          >
            Manage <ChevronRight size={12} />
          </Link>
          <button
            ref={menuButtonRef}
            onClick={onMenuToggle}
            className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 transition-colors"
          >
            <MoreVertical size={15} />
          </button>
          <Dropdown
            isOpen={isMenuOpen}
            onClose={onMenuClose}
            anchor={menuButtonRef}
          >
            <DropdownItem onClick={onEdit} icon={<Edit2 size={13} />}>
              Edit Device
            </DropdownItem>
            <DropdownItem onClick={onRename} icon={<FileEdit size={13} />}>
              Rename Device
            </DropdownItem>
            <DropdownItem onClick={onManageMembers} icon={<Users size={13} />}>
              Manage Members
            </DropdownItem>
            <DropdownDivider />
            <DropdownItem onClick={onDelete} icon={<Trash2 size={13} />} variant="danger">
              Remove Device
            </DropdownItem>
          </Dropdown>
        </div>
      </td>
    </tr>
  );
}

// Edit Device Form Component
function EditDeviceForm({
  device,
  onSave,
  onCancel,
  loading,
}: {
  device: Device | null;
  onSave: (data: { name: string; room: string; location: string; firmware: string }) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}) {
  const [formData, setFormData] = useState({
    name: '',
    room: '',
    location: '',
    firmware: '',
  });

  // Update form data when device changes
  useEffect(() => {
    if (device) {
      setFormData({
        name: device.name || '',
        room: device.room || '',
        location: device.location || '',
        firmware: device.firmware || '',
      });
    }
  }, [device]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.room.trim()) return;
    onSave(formData);
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (!device) return null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Device Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => handleChange('name', e.target.value)}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          placeholder="Enter device name"
          required
          disabled={loading}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Room <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={formData.room}
          onChange={(e) => handleChange('room', e.target.value)}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          placeholder="Enter room name"
          required
          disabled={loading}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Location
        </label>
        <input
          type="text"
          value={formData.location}
          onChange={(e) => handleChange('location', e.target.value)}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          placeholder="Enter specific location"
          disabled={loading}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Firmware Version
        </label>
        <input
          type="text"
          value={formData.firmware}
          onChange={(e) => handleChange('firmware', e.target.value)}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          placeholder="e.g., v1.2.4"
          disabled={loading}
        />
      </div>

      <div className="flex gap-3 justify-end pt-4">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" loading={loading} disabled={!formData.name.trim() || !formData.room.trim()}>
          Save Changes
        </Button>
      </div>
    </form>
  );
}

// Rename Device Form Component
function RenameDeviceForm({
  device,
  onSave,
  onCancel,
  loading,
}: {
  device: Device | null;
  onSave: (newName: string) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}) {
  const [name, setName] = useState('');

  // Update name when device changes
  useEffect(() => {
    if (device) {
      setName(device.name || '');
    }
  }, [device]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name);
  };

  if (!device) return null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-neutral-600 mb-4">
        Change the display name for <strong>{device.name}</strong>
      </p>

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">
          Device Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          placeholder="Enter new device name"
          required
          disabled={loading}
          autoFocus
        />
      </div>

      <div className="flex gap-3 justify-end pt-4">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" loading={loading} disabled={!name.trim()}>
          Rename Device
        </Button>
      </div>
    </form>
  );
}