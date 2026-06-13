import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Cpu, MoreVertical, Trash2, Edit2, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  subscribeToUserDevices,
  subscribeToDeviceStatus,
  deleteDevice,
  Device,
} from '../../services/deviceService';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Loader from '../../components/ui/Loader';
import Modal from '../../components/ui/Modal';

export default function Devices() {
  const { user } = useAuth();
  const [devices, setDevices]       = useState<Device[]>([]);
  const [loading, setLoading]       = useState(true);
  const [onlineMap, setOnlineMap]   = useState<Record<string, boolean>>({});
  const [menuOpen, setMenuOpen]     = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Device | null>(null);
  const [deleting, setDeleting]     = useState(false);

  // Subscribe to device list from Firestore
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToUserDevices(user.uid, devs => {
      setDevices(devs);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  // Subscribe to live online/offline status from RTDB for each device
  useEffect(() => {
    if (!devices.length) return;
    const unsubscribers = devices.map(dev =>
      subscribeToDeviceStatus(dev.deviceId, status => {
        setOnlineMap(prev => ({ ...prev, [dev.deviceId]: status === 'online' }));
      })
    );
    return () => unsubscribers.forEach(u => u());
  }, [devices]);

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
                    const isOnline = onlineMap[device.deviceId] || false;
                    return (
                      <tr key={device.id} className="hover:bg-neutral-50 transition-colors">
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
                          <div className="flex items-center gap-2">
                            <Link
                              to={`/devices/${device.id}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors"
                            >
                              Manage <ChevronRight size={12} />
                            </Link>
                            <div className="relative">
                              <button
                                onClick={() => setMenuOpen(menuOpen === device.id ? null : device.id)}
                                className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 transition-colors"
                              >
                                <MoreVertical size={15} />
                              </button>
                              {menuOpen === device.id && (
                                <div className="absolute right-0 top-8 w-40 bg-white border border-neutral-200 rounded-xl shadow-lg z-10 py-1">
                                  <button
                                    className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs text-neutral-700 hover:bg-neutral-50 transition-colors"
                                    onClick={() => setMenuOpen(null)}
                                  >
                                    <Edit2 size={13} /> Edit Device
                                  </button>
                                  <button
                                    className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs text-error-500 hover:bg-error-50 transition-colors"
                                    onClick={() => { setDeleteConfirm(device); setMenuOpen(null); }}
                                  >
                                    <Trash2 size={13} /> Remove Device
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-neutral-100">
              <p className="text-xs text-neutral-400">
                {devices.length} device{devices.length !== 1 ? 's' : ''} · {Object.values(onlineMap).filter(Boolean).length} online
              </p>
            </div>
          </>
        )}
      </Card>

      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Remove Device">
        <p className="text-sm text-neutral-600 mb-5">
          Remove <strong>{deleteConfirm?.name}</strong>? This will delete all device data and cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete} loading={deleting}>Remove</Button>
        </div>
      </Modal>
    </div>
  );
}
