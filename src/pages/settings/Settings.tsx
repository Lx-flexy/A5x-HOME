import { useState } from 'react';
import { User, Shield, Bell, LogOut, Eye, EyeOff, Check, Copy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { logout, updateUserProfile, updateNotificationPreferences } from '../../services/authService';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';

type Section = 'profile' | 'security' | 'notifications';

export default function Settings() {
  const navigate = useNavigate();
  const { user, userData, refreshUserData } = useAuth();
  const [section, setSection] = useState<Section>('profile');
  const [logoutModal, setLogoutModal] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: userData?.name || '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSaved, setPwSaved] = useState(false);
  const [notifications, setNotifications] = useState({
    deviceOnline: userData?.notifications?.deviceOnline ?? true,
    deviceOffline: userData?.notifications?.deviceOffline ?? true,
    memberAdded: userData?.notifications?.memberAdded ?? false,
    activityLog: userData?.notifications?.activityLog ?? true,
  });

  const [copiedUserId, setCopiedUserId] = useState(false);

  function handleCopyUserId() {
    if (!userData?.userId) return;
    navigator.clipboard.writeText(userData.userId);
    setCopiedUserId(true);
    setTimeout(() => setCopiedUserId(false), 2000);
  }

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    try {
      // Save to both Firebase Auth AND Firestore users/{uid}
      await updateUserProfile(user.uid, { name: profileForm.name });
      await refreshUserData();
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !user.email) return;
    setPwError('');
    if (pwForm.newPw !== pwForm.confirm) {
      setPwError('New passwords do not match.');
      return;
    }
    if (pwForm.newPw.length < 8) {
      setPwError('Password must be at least 8 characters.');
      return;
    }
    setSavingPw(true);
    try {
      const cred = EmailAuthProvider.credential(user.email, pwForm.current);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, pwForm.newPw);
      setPwForm({ current: '', newPw: '', confirm: '' });
      setPwSaved(true);
      setTimeout(() => setPwSaved(false), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed';
      setPwError(msg.replace('Firebase: ', '').replace(/\(.*\)/, '').trim());
    } finally {
      setSavingPw(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const sections: { id: Section; icon: React.ReactNode; label: string }[] = [
    { id: 'profile', icon: <User size={16} />, label: 'Profile' },
    { id: 'security', icon: <Shield size={16} />, label: 'Security' },
    { id: 'notifications', icon: <Bell size={16} />, label: 'Notifications' },
  ];

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">Settings</h2>
        <p className="text-sm text-neutral-500 mt-0.5">Manage your account and preferences</p>
      </div>

      <div className="flex gap-5 flex-col sm:flex-row">
        <div className="sm:w-52 flex-shrink-0">
          <Card padding={false}>
            <div className="p-2 space-y-0.5">
              {sections.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={`sidebar-link w-full text-left ${section === s.id ? 'active' : ''}`}
                >
                  {s.icon}
                  {s.label}
                </button>
              ))}
              <button
                onClick={() => setLogoutModal(true)}
                className="sidebar-link w-full text-left text-error-500 hover:bg-error-50 hover:text-error-600"
              >
                <LogOut size={16} />
                Logout
              </button>
            </div>
          </Card>
        </div>

        <div className="flex-1 space-y-5">
          {section === 'profile' && (
            <Card>
              <h3 className="text-sm font-semibold text-neutral-900 mb-5">Profile Information</h3>
              <div className="flex items-center gap-4 mb-6 pb-6 border-b border-neutral-100">
                <div className="w-16 h-16 bg-primary-600 rounded-full flex items-center justify-center">
                  <span className="text-xl font-bold text-white">
                    {(userData?.name || 'U').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-neutral-900">{userData?.name}</p>
                  <p className="text-sm text-neutral-500">{user?.email}</p>
                  <p className="text-xs text-neutral-400 mt-1 font-mono">{userData?.userId}</p>
                </div>
              </div>
              <form onSubmit={handleProfileSave} className="space-y-4">
                <div>
                  <label className="form-label">Full Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={profileForm.name}
                    onChange={e => setProfileForm({ name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="form-label">Email</label>
                  <input type="email" className="form-input bg-neutral-50" value={user?.email || ''} disabled />
                  <p className="text-xs text-neutral-400 mt-1">Email cannot be changed here.</p>
                </div>
                <div>
                  <label className="form-label">User ID</label>
                  <div className="relative">
                    <input type="text" className="form-input bg-neutral-50 font-mono text-xs pr-10" value={userData?.userId || ''} disabled />
                    <button
                      type="button"
                      onClick={handleCopyUserId}
                      title="Copy User ID"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-all"
                      style={{ color: copiedUserId ? '#16a34a' : '#9ca3af' }}
                    >
                      {copiedUserId ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                  {copiedUserId && (
                    <p className="text-xs mt-1" style={{ color: '#16a34a' }}>Copied to clipboard!</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Button type="submit" loading={savingProfile}>Save Changes</Button>
                  {profileSaved && (
                    <span className="flex items-center gap-1.5 text-sm text-success-600">
                      <Check size={15} /> Saved
                    </span>
                  )}
                </div>
              </form>
            </Card>
          )}

          {section === 'security' && (
            <Card>
              <h3 className="text-sm font-semibold text-neutral-900 mb-5">Change Password</h3>
              {pwError && <div className="mb-4 p-3 bg-error-50 border border-red-200 rounded-lg text-sm text-error-600">{pwError}</div>}
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div>
                  <label className="form-label">Current Password</label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      className="form-input pr-10"
                      placeholder="Current password"
                      value={pwForm.current}
                      onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))}
                      required
                    />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="form-label">New Password</label>
                  <input
                    type={showPw ? 'text' : 'password'}
                    className="form-input"
                    placeholder="New password (min 8 chars)"
                    value={pwForm.newPw}
                    onChange={e => setPwForm(p => ({ ...p, newPw: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="form-label">Confirm New Password</label>
                  <input
                    type={showPw ? 'text' : 'password'}
                    className="form-input"
                    placeholder="Confirm new password"
                    value={pwForm.confirm}
                    onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
                    required
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Button type="submit" loading={savingPw}>Update Password</Button>
                  {pwSaved && (
                    <span className="flex items-center gap-1.5 text-sm text-success-600">
                      <Check size={15} /> Updated
                    </span>
                  )}
                </div>
              </form>
            </Card>
          )}

          {section === 'notifications' && (
            <Card>
              <h3 className="text-sm font-semibold text-neutral-900 mb-5">Notification Preferences</h3>
              <div className="space-y-1">
                {([
                  { key: 'deviceOnline', label: 'Device comes online', desc: 'Get notified when a device connects' },
                  { key: 'deviceOffline', label: 'Device goes offline', desc: 'Get notified when a device disconnects' },
                  { key: 'memberAdded', label: 'Member added', desc: 'Get notified when a new member joins' },
                  { key: 'activityLog', label: 'Activity log updates', desc: 'Get notified for device state changes' },
                ] as { key: keyof typeof notifications; label: string; desc: string }[]).map(item => (
                  <div key={item.key} className="flex items-center justify-between py-3.5 border-b border-neutral-100 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-neutral-900">{item.label}</p>
                      <p className="text-xs text-neutral-400 mt-0.5">{item.desc}</p>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={notifications[item.key]}
                        onChange={async e => {
                          const updated = { ...notifications, [item.key]: e.target.checked };
                          setNotifications(updated);
                          if (user) {
                            await updateNotificationPreferences(user.uid, updated).catch(() => {});
                          }
                        }}
                      />
                      <div className="toggle-track">
                        <div className="toggle-thumb" />
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      <Modal open={logoutModal} onClose={() => setLogoutModal(false)} title="Logout">
        <p className="text-sm text-neutral-600 mb-5">Are you sure you want to logout?</p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={() => setLogoutModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleLogout}>Logout</Button>
        </div>
      </Modal>
    </div>
  );
}
