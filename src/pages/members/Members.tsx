import { useEffect, useState } from 'react';
import { Plus, UserCheck, Crown, MoreVertical, Trash2, Shield } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { subscribeToUserDevices, Device } from '../../services/deviceService';
import { getDeviceMembers, addMember, removeMember, updateMemberRole, Member } from '../../services/memberService';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import Loader from '../../components/ui/Loader';

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const colors = ['bg-blue-100 text-blue-700', 'bg-purple-100 text-purple-700', 'bg-green-100 text-green-700', 'bg-orange-100 text-orange-700', 'bg-pink-100 text-pink-700'];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div className={`w-9 h-9 ${color} rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0`}>
      {initials}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  if (role === 'owner') {
    return <span className="inline-flex items-center gap-1 text-xs font-medium bg-primary-50 text-primary-700 px-2.5 py-1 rounded-full"><Crown size={11} />Owner</span>;
  }
  return <span className="inline-flex items-center gap-1 text-xs font-medium bg-neutral-100 text-neutral-600 px-2.5 py-1 rounded-full"><Shield size={11} />Member</span>;
}

export default function Members() {
  const { user, userData } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', userId: '', role: 'member' as 'owner' | 'member' });
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToUserDevices(user.uid, devs => {
      setDevices(devs);
      if (devs.length > 0 && !selectedDevice) setSelectedDevice(devs[0]);
      setLoadingDevices(false);
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!selectedDevice) return;
    setLoadingMembers(true);
    getDeviceMembers(selectedDevice.deviceId).then(m => {
      setMembers(m);
      setLoadingMembers(false);
    });
  }, [selectedDevice]);

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDevice) return;
    if (members.length >= 5) {
      setError('Maximum 5 members per device.');
      return;
    }
    setError('');
    setAdding(true);
    try {
      await addMember({
        deviceId: selectedDevice.deviceId,
        userId: form.userId,
        name: form.name,
        role: form.role,
      });
      const updated = await getDeviceMembers(selectedDevice.deviceId);
      setMembers(updated);
      setAddModal(false);
      setForm({ name: '', userId: '', role: 'member' });
    } catch {
      setError('Failed to add member.');
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(member: Member) {
    await removeMember(member.id);
    setMembers(prev => prev.filter(m => m.id !== member.id));
    setMenuOpen(null);
  }

  async function handleRoleChange(member: Member, role: 'owner' | 'member') {
    await updateMemberRole(member.id, role);
    setMembers(prev => prev.map(m => m.id === member.id ? { ...m, role } : m));
    setMenuOpen(null);
  }

  function formatDate(ts: unknown) {
    if (!ts) return '–';
    const secs = (ts as { seconds: number })?.seconds;
    if (!secs) return '–';
    return new Date(secs * 1000).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Members</h2>
          <p className="text-sm text-neutral-500 mt-0.5">Manage people who have access to this device</p>
        </div>
        <Button onClick={() => setAddModal(true)} disabled={!selectedDevice}>
          <Plus size={16} /> Add Member
        </Button>
      </div>

      {loadingDevices ? (
        <Loader />
      ) : devices.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <UserCheck size={36} className="text-neutral-300 mx-auto mb-3" />
            <p className="text-sm text-neutral-500">No devices found. Add a device first.</p>
          </div>
        </Card>
      ) : (
        <>
          {devices.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {devices.map(dev => (
                <button
                  key={dev.id}
                  onClick={() => setSelectedDevice(dev)}
                  className={`px-3.5 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                    selectedDevice?.id === dev.id
                      ? 'bg-primary-50 border-primary-200 text-primary-700'
                      : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  {dev.name}
                </button>
              ))}
            </div>
          )}

          <Card padding={false}>
            {loadingMembers ? (
              <Loader />
            ) : members.length === 0 ? (
              <div className="py-12 text-center">
                <UserCheck size={36} className="text-neutral-300 mx-auto mb-3" />
                <p className="text-sm text-neutral-500">No members yet</p>
                <p className="text-xs text-neutral-400 mt-1">Add members to share device access</p>
              </div>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200">
                      {['Name', 'User ID', 'Role', 'Joined On', 'Actions'].map(col => (
                        <th key={col} className="text-left py-3 px-5 text-xs font-medium text-neutral-500 uppercase tracking-wide">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {members.map(member => (
                      <tr key={member.id} className="hover:bg-neutral-50 transition-colors">
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-3">
                            <Avatar name={member.name} />
                            <div>
                              <p className="font-medium text-neutral-900">{member.name}</p>
                              {member.userId === userData?.userId && (
                                <p className="text-xs text-neutral-400">(You)</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-5 text-xs text-neutral-500 font-mono">{member.userId}</td>
                        <td className="py-4 px-5"><RoleBadge role={member.role} /></td>
                        <td className="py-4 px-5 text-neutral-500 text-xs">{formatDate(member.joinedAt)}</td>
                        <td className="py-4 px-5">
                          <div className="relative">
                            <button
                              onClick={() => setMenuOpen(menuOpen === member.id ? null : member.id)}
                              className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 transition-colors"
                            >
                              <MoreVertical size={15} />
                            </button>
                            {menuOpen === member.id && (
                              <div className="absolute right-0 top-8 w-44 bg-white border border-neutral-200 rounded-xl shadow-lg z-10 py-1">
                                <button
                                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs text-neutral-700 hover:bg-neutral-50"
                                  onClick={() => handleRoleChange(member, member.role === 'owner' ? 'member' : 'owner')}
                                >
                                  <Crown size={13} />
                                  {member.role === 'owner' ? 'Make Member' : 'Make Owner'}
                                </button>
                                <button
                                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs text-error-500 hover:bg-error-50"
                                  onClick={() => handleRemove(member)}
                                >
                                  <Trash2 size={13} /> Remove
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-5 py-3 border-t border-neutral-100">
                  <p className="text-xs text-neutral-400">{members.length} / 5 members</p>
                </div>
              </>
            )}
          </Card>
        </>
      )}

      <Modal open={addModal} onClose={() => { setAddModal(false); setError(''); }} title="Add Member">
        <form onSubmit={handleAddMember} className="space-y-4">
          {error && <div className="p-3 bg-error-50 border border-red-200 rounded-lg text-sm text-error-600">{error}</div>}
          <div>
            <label className="form-label">Name</label>
            <input type="text" className="form-input" placeholder="Member name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
          </div>
          <div>
            <label className="form-label">User ID</label>
            <input type="text" className="form-input" placeholder="e.g. A5X-U-XXXXXX" value={form.userId} onChange={e => setForm(p => ({ ...p, userId: e.target.value.toUpperCase() }))} required />
          </div>
          <div>
            <label className="form-label">Role</label>
            <select className="form-input" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value as 'owner' | 'member' }))}>
              <option value="member">Member</option>
              <option value="owner">Owner</option>
            </select>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => setAddModal(false)}>Cancel</Button>
            <Button type="submit" loading={adding}>Add Member</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
