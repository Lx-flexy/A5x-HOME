import { useEffect, useState } from 'react';
import { Plus, UserCheck, Crown, MoreVertical, Trash2, Shield, Search, Ban, UserX, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { subscribeToUserDevices, Device } from '../../services/deviceService';
import {
  subscribeToDeviceMembers,
  addMember,
  removeMember,
  updateMemberRole,
  findUserByA5xId,
  Member,
  blockMember,
  unblockMember,
  restrictMember,
} from '../../services/memberService';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import Loader from '../../components/ui/Loader';

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const colors = [
    'bg-blue-100 text-blue-700',
    'bg-purple-100 text-purple-700',
    'bg-green-100 text-green-700',
    'bg-orange-100 text-orange-700',
    'bg-pink-100 text-pink-700',
  ];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div className={`w-10 h-10 md:w-9 md:h-9 ${color} rounded-full flex items-center justify-center text-sm md:text-xs font-semibold flex-shrink-0`}>
      {initials}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  if (role === 'owner') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium bg-primary-50 text-primary-700 px-2.5 py-1 rounded-full">
        <Crown size={11} />Owner
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium bg-neutral-100 text-neutral-600 px-2.5 py-1 rounded-full">
      <Shield size={11} />Member
    </span>
  );
}

function StatusBadge({ status }: { status?: string }) {
  if (status === 'blocked') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium bg-red-50 text-red-700 px-2.5 py-1 rounded-full">
        <Ban size={11} />Blocked
      </span>
    );
  }
  if (status === 'restricted') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium bg-orange-50 text-orange-700 px-2.5 py-1 rounded-full">
        <ShieldAlert size={11} />Restricted
      </span>
    );
  }
  return null; // Active status - no badge needed
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

  // Form state
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<'owner' | 'member'>('member');
  const [lookupResult, setLookupResult] = useState<{ uid: string; name: string; email: string } | null>(null);
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  // Subscribe to devices
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToUserDevices(user.uid, devs => {
      setDevices(devs);
      if (devs.length > 0 && !selectedDevice) setSelectedDevice(devs[0]);
      setLoadingDevices(false);
    });
    return unsub;
  }, [user]);

  // Subscribe to members of selected device (real-time)
  useEffect(() => {
    if (!selectedDevice) return;
    setLoadingMembers(true);
    const unsub = subscribeToDeviceMembers(selectedDevice.deviceId, m => {
      setMembers(m);
      setLoadingMembers(false);
    });
    return unsub;
  }, [selectedDevice]);

  // Look up user by A5X ID before adding
  async function handleLookup() {
    if (!userId.trim()) return;
    setLooking(true);
    setLookupError('');
    setLookupResult(null);
    const found = await findUserByA5xId(userId.trim().toUpperCase());
    if (!found) {
      setLookupError('No user found with this A5X ID.');
    } else {
      setLookupResult(found);
    }
    setLooking(false);
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDevice || !lookupResult) return;
    if (members.length >= 5) {
      setAddError('Maximum 5 members per device.');
      return;
    }
    setAddError('');
    setAdding(true);
    try {
      await addMember({
        deviceId: selectedDevice.deviceId,
        userId: userId.trim().toUpperCase(),
        uid: lookupResult.uid,
        name: lookupResult.name,
        email: lookupResult.email,
        role,
      });
      setAddModal(false);
      resetForm();
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Failed to add member.');
    } finally {
      setAdding(false);
    }
  }

  function resetForm() {
    setUserId('');
    setRole('member');
    setLookupResult(null);
    setLookupError('');
    setAddError('');
  }

  async function handleRemove(member: Member) {
    await removeMember(member.id);
    setMenuOpen(null);
  }

  async function handleRoleChange(member: Member, newRole: 'owner' | 'member') {
    await updateMemberRole(member.id, newRole);
    setMenuOpen(null);
  }

  async function handleBlock(member: Member) {
    await blockMember(member.id);
    setMenuOpen(null);
  }

  async function handleUnblock(member: Member) {
    await unblockMember(member.id);
    setMenuOpen(null);
  }

  async function handleRestrict(member: Member) {
    await restrictMember(member.id);
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Members</h2>
          <p className="text-sm text-neutral-500 mt-0.5">Manage people who have access to your devices</p>
        </div>
        <Button 
          onClick={() => { resetForm(); setAddModal(true); }} 
          disabled={!selectedDevice}
          className="w-full sm:w-auto min-h-[44px]"
        >
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
            <div className="flex gap-2 flex-wrap overflow-x-auto pb-2 -mx-1 px-1">
              {devices.map(dev => (
                <button
                  key={dev.id}
                  onClick={() => setSelectedDevice(dev)}
                  className={`px-3.5 py-2 text-sm font-medium rounded-lg border transition-colors flex-shrink-0 min-h-[40px] ${
                    selectedDevice?.id === dev.id
                      ? 'bg-primary-50 border-primary-200 text-primary-700'
                      : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                  }`}
                  style={{ touchAction: 'manipulation' }}
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
                <p className="text-xs text-neutral-400 mt-1">Add members using their A5X User ID</p>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-200">
                        {['Name', 'Email', 'User ID', 'Role', 'Status', 'Joined On', 'Actions'].map(col => (
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
                          <td className="py-4 px-5 text-xs text-neutral-500">{member.email}</td>
                          <td className="py-4 px-5 text-xs text-neutral-500 font-mono">{member.userId}</td>
                          <td className="py-4 px-5"><RoleBadge role={member.role} /></td>
                          <td className="py-4 px-5"><StatusBadge status={member.status} /></td>
                          <td className="py-4 px-5 text-neutral-500 text-xs">{formatDate(member.joinedAt)}</td>
                          <td className="py-4 px-5">
                            <div className="relative">
                              <button
                                onClick={() => setMenuOpen(menuOpen === member.id ? null : member.id)}
                                className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-400 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                                style={{ touchAction: 'manipulation' }}
                              >
                                <MoreVertical size={15} />
                              </button>
                              {menuOpen === member.id && (
                                <div className="absolute right-0 top-8 w-44 bg-white border border-neutral-200 rounded-xl shadow-lg z-10 py-1">
                                  <button
                                    className="flex items-center gap-2.5 w-full px-4 py-3 text-sm text-neutral-700 hover:bg-neutral-50 min-h-[44px]"
                                    onClick={() => handleRoleChange(member, member.role === 'owner' ? 'member' : 'owner')}
                                    style={{ touchAction: 'manipulation' }}
                                  >
                                    <Crown size={13} />
                                    {member.role === 'owner' ? 'Make Member' : 'Make Owner'}
                                  </button>
                                  
                                  {member.status === 'blocked' ? (
                                    <button
                                      className="flex items-center gap-2.5 w-full px-4 py-3 text-sm text-green-600 hover:bg-green-50 min-h-[44px]"
                                      onClick={() => handleUnblock(member)}
                                      style={{ touchAction: 'manipulation' }}
                                    >
                                      <UserCheck size={13} /> Unblock
                                    </button>
                                  ) : (
                                    <button
                                      className="flex items-center gap-2.5 w-full px-4 py-3 text-sm text-orange-600 hover:bg-orange-50 min-h-[44px]"
                                      onClick={() => handleBlock(member)}
                                      style={{ touchAction: 'manipulation' }}
                                    >
                                      <Ban size={13} /> Block
                                    </button>
                                  )}
                                  
                                  {member.status === 'restricted' ? (
                                    <button
                                      className="flex items-center gap-2.5 w-full px-4 py-3 text-sm text-green-600 hover:bg-green-50 min-h-[44px]"
                                      onClick={() => handleUnblock(member)}
                                      style={{ touchAction: 'manipulation' }}
                                    >
                                      <UserCheck size={13} /> Remove Restriction
                                    </button>
                                  ) : member.status !== 'blocked' && (
                                    <button
                                      className="flex items-center gap-2.5 w-full px-4 py-3 text-sm text-yellow-600 hover:bg-yellow-50 min-h-[44px]"
                                      onClick={() => handleRestrict(member)}
                                      style={{ touchAction: 'manipulation' }}
                                    >
                                      <ShieldAlert size={13} /> Restrict
                                    </button>
                                  )}
                                  
                                  <button
                                    className="flex items-center gap-2.5 w-full px-4 py-3 text-sm text-error-500 hover:bg-error-50 min-h-[44px]"
                                    onClick={() => handleRemove(member)}
                                    style={{ touchAction: 'manipulation' }}
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
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden divide-y divide-neutral-100">
                  {members.map(member => (
                    <div key={member.id} className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <Avatar name={member.name} />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-neutral-900 text-sm truncate">{member.name}</p>
                            {member.userId === userData?.userId && (
                              <p className="text-xs text-neutral-400">(You)</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <RoleBadge role={member.role} />
                          <StatusBadge status={member.status} />
                          <div className="relative">
                            <button
                              onClick={() => setMenuOpen(menuOpen === member.id ? null : member.id)}
                              className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-400 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                              style={{ touchAction: 'manipulation' }}
                            >
                              <MoreVertical size={16} />
                            </button>
                            {menuOpen === member.id && (
                              <div className="absolute right-0 top-12 w-48 bg-white border border-neutral-200 rounded-xl shadow-lg z-10 py-1">
                                <button
                                  className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-neutral-700 hover:bg-neutral-50 min-h-[48px]"
                                  onClick={() => handleRoleChange(member, member.role === 'owner' ? 'member' : 'owner')}
                                  style={{ touchAction: 'manipulation' }}
                                >
                                  <Crown size={16} />
                                  {member.role === 'owner' ? 'Make Member' : 'Make Owner'}
                                </button>
                                
                                {member.status === 'blocked' ? (
                                  <button
                                    className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-green-600 hover:bg-green-50 min-h-[48px]"
                                    onClick={() => handleUnblock(member)}
                                    style={{ touchAction: 'manipulation' }}
                                  >
                                    <UserCheck size={16} /> Unblock Member
                                  </button>
                                ) : (
                                  <button
                                    className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-orange-600 hover:bg-orange-50 min-h-[48px]"
                                    onClick={() => handleBlock(member)}
                                    style={{ touchAction: 'manipulation' }}
                                  >
                                    <Ban size={16} /> Block Member
                                  </button>
                                )}
                                
                                {member.status === 'restricted' ? (
                                  <button
                                    className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-green-600 hover:bg-green-50 min-h-[48px]"
                                    onClick={() => handleUnblock(member)}
                                    style={{ touchAction: 'manipulation' }}
                                  >
                                    <UserCheck size={16} /> Remove Restriction
                                  </button>
                                ) : member.status !== 'blocked' && (
                                  <button
                                    className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-yellow-600 hover:bg-yellow-50 min-h-[48px]"
                                    onClick={() => handleRestrict(member)}
                                    style={{ touchAction: 'manipulation' }}
                                  >
                                    <ShieldAlert size={16} /> Restrict Member
                                  </button>
                                )}
                                
                                <button
                                  className="flex items-center gap-3 w-full px-4 py-3.5 text-sm text-error-500 hover:bg-error-50 min-h-[48px]"
                                  onClick={() => handleRemove(member)}
                                  style={{ touchAction: 'manipulation' }}
                                >
                                  <Trash2 size={16} /> Remove Member
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                          <span className="text-neutral-400 text-xs">Email:</span>
                          <span className="text-neutral-600 break-words">{member.email}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                          <span className="text-neutral-400 text-xs">User ID:</span>
                          <span className="text-neutral-600 font-mono text-xs break-all">{member.userId}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                          <span className="text-neutral-400 text-xs">Joined:</span>
                          <span className="text-neutral-600 text-xs">{formatDate(member.joinedAt)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="px-4 md:px-5 py-3 border-t border-neutral-100">
                  <p className="text-xs text-neutral-400">{members.length} / 5 members</p>
                </div>
              </>
            )}
          </Card>
        </>
      )}

      {/* Add Member Modal */}
      <Modal open={addModal} onClose={() => { setAddModal(false); resetForm(); }} title="Add Member">
        <form onSubmit={handleAddMember} className="space-y-5">
          {addError && (
            <div className="p-3 bg-error-50 border border-red-200 rounded-lg text-sm text-error-600">{addError}</div>
          )}

          <div>
            <label className="form-label">A5X User ID</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                className="form-input font-mono uppercase flex-1 min-h-[44px]"
                placeholder="A5X-U-XXXXXX"
                value={userId}
                onChange={e => { setUserId(e.target.value.toUpperCase()); setLookupResult(null); setLookupError(''); }}
                required
                style={{ touchAction: 'manipulation' }}
              />
              <Button 
                type="button" 
                variant="secondary" 
                loading={looking} 
                onClick={handleLookup}
                className="w-full sm:w-auto min-h-[44px]"
              >
                <Search size={15} />
                <span className="sm:hidden ml-2">Search User</span>
              </Button>
            </div>
            {lookupError && <p className="text-sm text-error-500 mt-2">{lookupError}</p>}
          </div>

          {lookupResult && (
            <div className="p-4 bg-success-50 border border-green-200 rounded-lg">
              <p className="text-sm font-medium text-success-700">User found</p>
              <p className="text-sm text-neutral-600 mt-1 break-words">{lookupResult.name} · {lookupResult.email}</p>
            </div>
          )}

          <div>
            <label className="form-label">Role</label>
            <select
              className="form-input w-full min-h-[44px]"
              value={role}
              onChange={e => setRole(e.target.value as 'owner' | 'member')}
              style={{ touchAction: 'manipulation' }}
            >
              <option value="member">Member</option>
              <option value="owner">Owner</option>
            </select>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-end pt-4">
            <Button 
              variant="secondary" 
              type="button" 
              onClick={() => { setAddModal(false); resetForm(); }}
              className="w-full sm:w-auto min-h-[44px] order-2 sm:order-1"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              loading={adding} 
              disabled={!lookupResult}
              className="w-full sm:w-auto min-h-[44px] order-1 sm:order-2"
            >
              {adding ? 'Adding Member...' : 'Add Member'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
