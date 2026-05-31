'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db, storage } from '@/lib/firebase';
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  linkWithPopup,
  unlink,
  PhoneAuthProvider,
  RecaptchaVerifier,
  linkWithPhoneNumber,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser,
} from 'firebase/auth';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import {
  collection, query, where, orderBy, getDocs,
  doc, getDoc, updateDoc, deleteDoc,
} from 'firebase/firestore';
import Image from 'next/image';
import Navbar from '@/components/Navbar';

// ─── Theme definitions ────────────────────────────────────────────────────────
const THEMES = [
  {
    id: 'cosmic', name: 'Cosmic', emoji: '🪐',
    vars: { '--bg-primary':'#0a0a0f','--bg-secondary':'#0d0d14','--bg-card':'#111118','--bg-hover':'rgba(139,92,246,0.05)','--border':'rgba(139,92,246,0.15)','--border-subtle':'rgba(255,255,255,0.04)','--text-primary':'#f3f4f6','--text-secondary':'#9ca3af','--text-muted':'#6b7280','--accent-purple':'#8b5cf6','--accent-blue':'#3b82f6','--accent-purple-light':'#a78bfa','--accent-blue-light':'#60a5fa','--gradient':'linear-gradient(135deg,#8b5cf6,#3b82f6)' },
  },
  {
    id: 'midnight', name: 'Midnight', emoji: '🌑',
    vars: { '--bg-primary':'#000000','--bg-secondary':'#0a0a0a','--bg-card':'#111111','--bg-hover':'rgba(255,255,255,0.03)','--border':'rgba(255,255,255,0.1)','--border-subtle':'rgba(255,255,255,0.04)','--text-primary':'#ffffff','--text-secondary':'#a1a1aa','--text-muted':'#71717a','--accent-purple':'#ffffff','--accent-blue':'#e4e4e7','--accent-purple-light':'#f4f4f5','--accent-blue-light':'#d4d4d8','--gradient':'linear-gradient(135deg,#ffffff,#a1a1aa)' },
  },
  {
    id: 'aurora', name: 'Aurora', emoji: '🌌',
    vars: { '--bg-primary':'#030d0a','--bg-secondary':'#051410','--bg-card':'#071a14','--bg-hover':'rgba(16,185,129,0.05)','--border':'rgba(16,185,129,0.2)','--border-subtle':'rgba(255,255,255,0.04)','--text-primary':'#ecfdf5','--text-secondary':'#6ee7b7','--text-muted':'#34d399','--accent-purple':'#10b981','--accent-blue':'#06b6d4','--accent-purple-light':'#34d399','--accent-blue-light':'#67e8f9','--gradient':'linear-gradient(135deg,#10b981,#06b6d4)' },
  },
  {
    id: 'ember', name: 'Ember', emoji: '🔥',
    vars: { '--bg-primary':'#0f0500','--bg-secondary':'#160800','--bg-card':'#1c0a00','--bg-hover':'rgba(234,88,12,0.05)','--border':'rgba(234,88,12,0.2)','--border-subtle':'rgba(255,255,255,0.04)','--text-primary':'#fff7ed','--text-secondary':'#fdba74','--text-muted':'#fb923c','--accent-purple':'#f97316','--accent-blue':'#ef4444','--accent-purple-light':'#fb923c','--accent-blue-light':'#fca5a5','--gradient':'linear-gradient(135deg,#f97316,#ef4444)' },
  },
  {
    id: 'ocean', name: 'Ocean', emoji: '🌊',
    vars: { '--bg-primary':'#00080f','--bg-secondary':'#000d18','--bg-card':'#001122','--bg-hover':'rgba(14,165,233,0.05)','--border':'rgba(14,165,233,0.2)','--border-subtle':'rgba(255,255,255,0.04)','--text-primary':'#f0f9ff','--text-secondary':'#7dd3fc','--text-muted':'#38bdf8','--accent-purple':'#0ea5e9','--accent-blue':'#6366f1','--accent-purple-light':'#38bdf8','--accent-blue-light':'#818cf8','--gradient':'linear-gradient(135deg,#0ea5e9,#6366f1)' },
  },
  {
    id: 'rosegold', name: 'Rose Gold', emoji: '🌹',
    vars: { '--bg-primary':'#0f0608','--bg-secondary':'#160a0d','--bg-card':'#1c0e12','--bg-hover':'rgba(244,63,94,0.05)','--border':'rgba(244,63,94,0.2)','--border-subtle':'rgba(255,255,255,0.04)','--text-primary':'#fff1f2','--text-secondary':'#fda4af','--text-muted':'#fb7185','--accent-purple':'#f43f5e','--accent-blue':'#d4a017','--accent-purple-light':'#fb7185','--accent-blue-light':'#fbbf24','--gradient':'linear-gradient(135deg,#f43f5e,#d4a017)' },
  },
  {
    id: 'neon', name: 'Neon City', emoji: '🌃',
    vars: { '--bg-primary':'#05000f','--bg-secondary':'#0a0018','--bg-card':'#0f0022','--bg-hover':'rgba(217,70,239,0.05)','--border':'rgba(217,70,239,0.2)','--border-subtle':'rgba(255,255,255,0.04)','--text-primary':'#fdf4ff','--text-secondary':'#e879f9','--text-muted':'#c026d3','--accent-purple':'#d946ef','--accent-blue':'#22d3ee','--accent-purple-light':'#e879f9','--accent-blue-light':'#67e8f9','--gradient':'linear-gradient(135deg,#d946ef,#22d3ee)' },
  },
  {
    id: 'forest', name: 'Forest', emoji: '🌿',
    vars: { '--bg-primary':'#010a02','--bg-secondary':'#020f03','--bg-card':'#031505','--bg-hover':'rgba(34,197,94,0.05)','--border':'rgba(34,197,94,0.18)','--border-subtle':'rgba(255,255,255,0.04)','--text-primary':'#f0fdf4','--text-secondary':'#86efac','--text-muted':'#4ade80','--accent-purple':'#22c55e','--accent-blue':'#84cc16','--accent-purple-light':'#4ade80','--accent-blue-light':'#a3e635','--gradient':'linear-gradient(135deg,#22c55e,#84cc16)' },
  },
] as const;

type ThemeId = typeof THEMES[number]['id'];

function applyTheme(id: ThemeId) {
  const theme = THEMES.find(t => t.id === id);
  if (!theme) return;
  const root = document.documentElement;
  Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v));
  localStorage.setItem('altronics-theme', id);
}

export default function Profile() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [newFullName, setNewFullName] = useState('');
  const [newBio, setNewBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'liked'>('posts');

  // ── Profile pic ───────────────────────────────────────────────────────────
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarProgress, setAvatarProgress] = useState<number | null>(null);

  // ── Privacy ───────────────────────────────────────────────────────────────
  const [messageSeen, setMessageSeen] = useState(true);
  const [activeStatus, setActiveStatus] = useState(true);
  const [togglingPrivacy, setTogglingPrivacy] = useState(false);

  // ── Followers/Following modal ─────────────────────────────────────────────
  const [showModal, setShowModal] = useState<'followers' | 'following' | null>(null);
  const [modalUsers, setModalUsers] = useState<any[]>([]);
  const [modalLoading, setModalLoading] = useState(false);

  // ── Theme ─────────────────────────────────────────────────────────────────
  const [currentTheme, setCurrentTheme] = useState<ThemeId>('cosmic');

  // ── Settings sections ─────────────────────────────────────────────────────
  const [openSection, setOpenSection] = useState<string | null>(null);

  // ── Change password ───────────────────────────────────────────────────────
  const [pwEmail, setPwEmail] = useState('');
  const [pwSent, setPwSent] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');

  // ── Link Google ───────────────────────────────────────────────────────────
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const [linkMsg, setLinkMsg] = useState('');

  // ── Link phone ────────────────────────────────────────────────────────────
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneStep, setPhoneStep] = useState<'input' | 'otp' | 'done'>('input');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [confirmResult, setConfirmResult] = useState<any>(null);

  // ── Delete account ────────────────────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const { push } = useRouter();

  // ── Linked providers ──────────────────────────────────────────────────────
  const linkedGoogle = user?.providerData?.some((p: any) => p.providerId === 'google.com');
  const linkedPhone  = user?.providerData?.some((p: any) => p.providerId === 'phone');

  useEffect(() => {
    const saved = localStorage.getItem('altronics-theme') as ThemeId | null;
    if (saved) { setCurrentTheme(saved); applyTheme(saved); }
    const unsubscribe = onAuthStateChanged(auth, async (fu) => {
      if (!fu) { push('/login'); return; }
      setUser(fu);
      setPwEmail(fu.email || '');
      await loadProfile(fu.uid);
      await loadUserPosts(fu.uid);
      setPageLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const loadProfile = async (uid: string) => {
    try {
      const d = await getDoc(doc(db, 'users', uid));
      if (d.exists()) {
        const data = d.data();
        setProfile(data);
        setNewFullName(data.fullName || '');
        setNewBio(data.bio || '');
        setMessageSeen(data.messageSeen !== false);
        setActiveStatus(data.activeStatus !== false);
        if (data.theme) { setCurrentTheme(data.theme); applyTheme(data.theme); }
      }
    } catch (err) { console.error(err); }
  };

  const loadUserPosts = async (uid: string) => {
    try {
      const q = query(collection(db, 'posts'), where('userId', '==', uid), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { fullName: newFullName, bio: newBio });
      await loadProfile(user.uid);
      setEditing(false);
    } catch (err: any) { alert('Failed: ' + err.message); }
    setSaving(false);
  };

  // ── Avatar upload ─────────────────────────────────────────────────────────
  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Select an image.'); return; }
    if (file.size > 5 * 1024 * 1024) { alert('Max 5 MB.'); return; }
    uploadAvatar(file); e.target.value = '';
  };
  const uploadAvatar = (file: File) => {
    if (!user) return;
    setAvatarUploading(true); setAvatarProgress(0);
    const path = `avatars/${user.uid}/profile.${file.name.split('.').pop()}`;
    const task = uploadBytesResumable(storageRef(storage, path), file);
    task.on('state_changed',
      s => setAvatarProgress(Math.round(s.bytesTransferred / s.totalBytes * 100)),
      err => { alert('Upload failed: ' + err.message); setAvatarUploading(false); setAvatarProgress(null); },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        await updateDoc(doc(db, 'users', user.uid), { photoURL: url });
        await loadProfile(user.uid);
        setAvatarUploading(false); setAvatarProgress(null);
      }
    );
  };

  // ── Privacy toggle ────────────────────────────────────────────────────────
  const togglePrivacy = async (field: 'messageSeen' | 'activeStatus', value: boolean) => {
    if (!user) return;
    setTogglingPrivacy(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { [field]: value });
      if (field === 'messageSeen') setMessageSeen(value);
      else setActiveStatus(value);
    } catch (err: any) { alert('Failed: ' + err.message); }
    setTogglingPrivacy(false);
  };

  // ── Theme change ──────────────────────────────────────────────────────────
  const changeTheme = async (id: ThemeId) => {
    setCurrentTheme(id); applyTheme(id);
    if (user) { try { await updateDoc(doc(db, 'users', user.uid), { theme: id }); } catch (_) {} }
  };

  // ── Change password ───────────────────────────────────────────────────────
  const sendPasswordReset = async () => {
    if (!pwEmail.trim()) { setPwError('Enter your email.'); return; }
    setPwLoading(true); setPwError('');
    try {
      await sendPasswordResetEmail(auth, pwEmail.trim());
      setPwSent(true);
    } catch (err: any) { setPwError(err.message); }
    setPwLoading(false);
  };

  // ── Link Google ───────────────────────────────────────────────────────────
  const linkGoogle = async () => {
    setLinkingGoogle(true); setLinkMsg('');
    try {
      const provider = new GoogleAuthProvider();
      await linkWithPopup(auth.currentUser!, provider);
      setLinkMsg('✅ Google account linked!');
      setUser({ ...auth.currentUser });
    } catch (err: any) {
      if (err.code === 'auth/credential-already-in-use') setLinkMsg('⚠️ This Google account is already linked to another user.');
      else if (err.code === 'auth/provider-already-linked') setLinkMsg('ℹ️ Google is already linked to your account.');
      else setLinkMsg('❌ ' + err.message);
    }
    setLinkingGoogle(false);
  };
  const unlinkGoogle = async () => {
    setLinkingGoogle(true); setLinkMsg('');
    try {
      await unlink(auth.currentUser!, 'google.com');
      setLinkMsg('Google account unlinked.');
      setUser({ ...auth.currentUser });
    } catch (err: any) { setLinkMsg('❌ ' + err.message); }
    setLinkingGoogle(false);
  };

  // ── Link phone ────────────────────────────────────────────────────────────
  const sendPhoneLink = async () => {
    if (!phoneNumber.trim()) { setPhoneError('Enter phone number.'); return; }
    setPhoneLoading(true); setPhoneError('');
    try {
      if (!(window as any).__rcv2) {
        (window as any).__rcv2 = new RecaptchaVerifier(auth, 'rcv2-container', { size: 'invisible' });
      }
      const result = await linkWithPhoneNumber(auth.currentUser!, phoneNumber.trim(), (window as any).__rcv2);
      setConfirmResult(result);
      setPhoneStep('otp');
    } catch (err: any) {
      if (err.code === 'auth/invalid-phone-number') setPhoneError('Invalid format. Use +8801XXXXXXXXX');
      else setPhoneError(err.message);
      (window as any).__rcv2 = null;
    }
    setPhoneLoading(false);
  };
  const verifyPhoneLink = async () => {
    if (!phoneOtp.trim()) return;
    setPhoneLoading(true); setPhoneError('');
    try {
      await confirmResult.confirm(phoneOtp.trim());
      setPhoneStep('done');
      setLinkMsg('✅ Phone number linked!');
      setUser({ ...auth.currentUser });
    } catch (err: any) {
      if (err.code === 'auth/invalid-verification-code') setPhoneError('Wrong code.');
      else setPhoneError(err.message);
    }
    setPhoneLoading(false);
  };
  const unlinkPhone = async () => {
    setPhoneLoading(true);
    try {
      await unlink(auth.currentUser!, 'phone');
      setLinkMsg('Phone number unlinked.');
      setUser({ ...auth.currentUser });
      setPhoneStep('input'); setPhoneNumber(''); setPhoneOtp('');
    } catch (err: any) { setPhoneError(err.message); }
    setPhoneLoading(false);
  };

  // ── Delete account ────────────────────────────────────────────────────────
  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') { setDeleteError('Type DELETE to confirm.'); return; }
    setDeleteLoading(true); setDeleteError('');
    try {
      const hasEmail = user?.providerData?.some((p: any) => p.providerId === 'password');
      if (hasEmail) {
        if (!deletePassword) { setDeleteError('Enter your password.'); setDeleteLoading(false); return; }
        const cred = EmailAuthProvider.credential(user.email, deletePassword);
        await reauthenticateWithCredential(auth.currentUser!, cred);
      }
      await deleteDoc(doc(db, 'users', user.uid));
      await deleteUser(auth.currentUser!);
      push('/login');
    } catch (err: any) {
      if (err.code === 'auth/wrong-password') setDeleteError('Wrong password.');
      else if (err.code === 'auth/requires-recent-login') setDeleteError('Please log out and log back in, then try again.');
      else setDeleteError(err.message);
    }
    setDeleteLoading(false);
  };

  // ── Followers/Following modal ─────────────────────────────────────────────
  const openModal = async (type: 'followers' | 'following') => {
    setShowModal(type); setModalLoading(true); setModalUsers([]);
    try {
      const ids: string[] = profile?.[type] || [];
      if (!ids.length) { setModalLoading(false); return; }
      const profiles = await Promise.all(ids.map(async (uid) => {
        const d = await getDoc(doc(db, 'users', uid));
        return d.exists() ? { id: d.id, ...d.data() } : null;
      }));
      setModalUsers(profiles.filter(Boolean));
    } catch (err) { console.error(err); }
    setModalLoading(false);
  };

  // ── Shared styles ─────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px',
    background: 'rgba(139,92,246,0.08)',
    border: '0.5px solid var(--border)',
    borderRadius: 10, color: 'var(--text-primary)', fontSize: 13,
    fontFamily: 'Inter,sans-serif', outline: 'none', boxSizing: 'border-box',
  };

  const sectionCard: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '0.5px solid var(--border)',
    borderRadius: 18,
    marginBottom: 12,
    overflow: 'hidden',
  };

  if (pageLoading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.3)', borderTopColor: '#a78bfa', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
        <p style={{ color: '#6b7280', fontSize: 13 }}>Loading profile...</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const initials = profile?.fullName?.[0]?.toUpperCase() || 'U';
  const currentThemeObj = THEMES.find(t => t.id === currentTheme)!;

  const SectionHeader = ({ id, icon, title, subtitle }: { id: string; icon: string; title: string; subtitle: string }) => (
    <button type="button" onClick={() => setOpenSection(openSection === id ? null : id)}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'Inter,sans-serif' }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(139,92,246,0.1)', border: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{title}</p>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{subtitle}</p>
      </div>
      <span style={{ color: 'var(--text-muted)', fontSize: 18, transition: 'transform 0.2s', transform: openSection === id ? 'rotate(90deg)' : 'none' }}>›</span>
    </button>
  );

  return (
    <>
      <Navbar />
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes modalUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
        .toggle-track{transition:background 0.25s}
        .toggle-thumb{transition:left 0.25s cubic-bezier(0.34,1.56,0.64,1)}
        .avatar-overlay{opacity:0;transition:opacity 0.2s}
        .avatar-wrap:hover .avatar-overlay{opacity:1}
        .theme-card:hover{transform:scale(1.04)}
        .section-body{animation:fadeIn 0.2s ease}
        input[type=text],input[type=email],input[type=password],input[type=tel]{color-scheme:dark}
      `}</style>

      <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', fontFamily: 'Inter,sans-serif', paddingBottom: 120 }}>
        {/* ── Profile Header ── */}
        <div style={{ background: 'linear-gradient(180deg,rgba(139,92,246,0.1) 0%,transparent 100%)', padding: '24px 20px 0' }}>
          <div style={{ maxWidth: 600, margin: '0 auto' }}>

            {/* Avatar + stats row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
              {/* Avatar */}
              <div style={{ position: 'relative', flexShrink: 0 }} className="avatar-wrap">
                <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarSelect} style={{ display: 'none' }} />
                <div style={{ width: 80, height: 80, borderRadius: '50%', overflow: 'hidden', border: '2.5px solid var(--accent-purple)', position: 'relative', cursor: 'pointer' }}
                  onClick={() => !avatarUploading && avatarInputRef.current?.click()}>
                  {profile?.photoURL
                    ? <Image src={profile.photoURL} alt="Profile" fill sizes="80px" style={{ objectFit: 'cover' }} />
                    : <div style={{ width: '100%', height: '100%', background: 'var(--gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 700, color: 'white' }}>{initials}</div>
                  }
                  {avatarUploading && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid rgba(167,139,250,0.3)', borderTopColor: '#a78bfa', animation: 'spin 0.8s linear infinite' }} />
                      {avatarProgress !== null && <span style={{ fontSize: 9, color: '#a78bfa', fontWeight: 700 }}>{avatarProgress}%</span>}
                    </div>
                  )}
                  {!avatarUploading && (
                    <div className="avatar-overlay" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                      <span style={{ fontSize: 16 }}>📷</span>
                      <span style={{ fontSize: 8, color: 'white', fontWeight: 600 }}>Change</span>
                    </div>
                  )}
                </div>
                <div onClick={() => !avatarUploading && avatarInputRef.current?.click()}
                  style={{ position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: '50%', background: 'var(--gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, cursor: 'pointer', border: '2px solid var(--bg-primary)', zIndex: 2 }}>📷</div>
              </div>

              {/* Stats */}
              <div style={{ display: 'flex', gap: 24, flex: 1, justifyContent: 'space-around' }}>
                {[{ num: posts.length, label: 'Posts' },
                  { num: profile?.followers?.length || 0, label: 'Followers', click: () => openModal('followers') },
                  { num: profile?.following?.length || 0, label: 'Following', click: () => openModal('following') }].map(({ num, label, click }) => (
                  <button type="button" key={label} onClick={click} style={{ textAlign: 'center', background: 'none', border: 'none', cursor: click ? 'pointer' : 'default', padding: 0, fontFamily: 'Inter,sans-serif' }}>
                    <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{num}</p>
                    <p style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Name / bio / edit */}
            {editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                <input value={newFullName} onChange={e => setNewFullName(e.target.value)} placeholder="Full Name" style={inputStyle} />
                <input value={newBio} onChange={e => setNewBio(e.target.value)} placeholder="Bio…" style={inputStyle} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={saveProfile} disabled={saving} style={{ flex: 1, padding: 9, borderRadius: 12, background: 'var(--gradient)', border: 'none', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save'}</button>
                  <button type="button" onClick={() => setEditing(false)} style={{ flex: 1, padding: 9, borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{profile?.fullName}</p>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'rgba(139,92,246,0.12)', color: 'var(--accent-purple-light)', fontWeight: 600 }}>{currentThemeObj.emoji} {currentThemeObj.name}</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--accent-purple-light)', marginBottom: 6 }}>@{profile?.username}</p>
                {profile?.bio && <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 12 }}>{profile.bio}</p>}
                <button type="button" onClick={() => setEditing(true)} style={{ width: '100%', padding: 10, borderRadius: 12, border: '1px solid var(--border)', background: 'rgba(139,92,246,0.08)', color: 'var(--accent-purple-light)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                  Edit Profile
                </button>
              </div>
            )}

            {/* ════════════════════════════════════════════════════════════
                SETTINGS ACCORDION
            ════════════════════════════════════════════════════════════ */}
            <div style={{ marginBottom: 12 }}>

              {/* ── 1. APPEARANCE ── */}
              <div style={sectionCard}>
                <SectionHeader id="appearance" icon="🎨" title="Appearance" subtitle={`Theme: ${currentThemeObj.emoji} ${currentThemeObj.name}`} />
                {openSection === 'appearance' && (
                  <div className="section-body" style={{ padding: '0 16px 18px', borderTop: '0.5px solid var(--border-subtle)' }}>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, margin: '14px 0 12px' }}>Choose your vibe</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {THEMES.map(theme => {
                        const active = currentTheme === theme.id;
                        return (
                          <button type="button" key={theme.id} onClick={() => changeTheme(theme.id as ThemeId)} className="theme-card"
                            style={{ padding: '14px 12px', borderRadius: 14, border: active ? `2px solid ${theme.vars['--accent-purple']}` : '1px solid rgba(255,255,255,0.08)', background: theme.vars['--bg-card'], cursor: 'pointer', transition: 'transform 0.2s', textAlign: 'left', fontFamily: 'Inter,sans-serif', position: 'relative', overflow: 'hidden' }}>
                            {/* gradient swatch */}
                            <div style={{ width: '100%', height: 28, borderRadius: 8, background: theme.vars['--gradient'], marginBottom: 8, opacity: 0.85 }} />
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div>
                                <p style={{ fontSize: 12, fontWeight: 700, color: theme.vars['--text-primary'], margin: 0 }}>{theme.emoji} {theme.name}</p>
                              </div>
                              {active && <div style={{ width: 16, height: 16, borderRadius: '50%', background: theme.vars['--accent-purple'], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'white', fontWeight: 900 }}>✓</div>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* ── 2. PRIVACY ── */}
              <div style={sectionCard}>
                <SectionHeader id="privacy" icon="🔒" title="Privacy" subtitle="Control who sees your activity" />
                {openSection === 'privacy' && (
                  <div className="section-body" style={{ borderTop: '0.5px solid var(--border-subtle)' }}>
                    {/* Message Seen */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '0.5px solid var(--border-subtle)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: messageSeen ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.04)', border: `0.5px solid ${messageSeen ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.08)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, transition: 'all 0.25s' }}>✓✓</div>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>Message Seen</p>
                          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{messageSeen ? 'Others see read receipts' : 'Read receipts hidden'}</p>
                        </div>
                      </div>
                      <Toggle value={messageSeen} disabled={togglingPrivacy} onChange={v => togglePrivacy('messageSeen', v)} color="#3b82f6" label="Toggle message seen" />
                    </div>
                    {/* Active Status */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: activeStatus ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)', border: `0.5px solid ${activeStatus ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, transition: 'all 0.25s' }}>🟢</div>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>Active Status</p>
                          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{activeStatus ? 'Others see when you\'re online' : 'You appear offline'}</p>
                        </div>
                      </div>
                      <Toggle value={activeStatus} disabled={togglingPrivacy} onChange={v => togglePrivacy('activeStatus', v)} color="#22c55e" label="Toggle active status" />
                    </div>
                  </div>
                )}
              </div>

              {/* ── 3. CHANGE PASSWORD ── */}
              <div style={sectionCard}>
                <SectionHeader id="password" icon="🔑" title="Change Password" subtitle="Send a reset link to your email" />
                {openSection === 'password' && (
                  <div className="section-body" style={{ padding: '0 16px 18px', borderTop: '0.5px solid var(--border-subtle)' }}>
                    {pwSent ? (
                      <div style={{ padding: '18px 0', textAlign: 'center' }}>
                        <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
                        <p style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Reset link sent!</p>
                        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 14 }}>Check <strong style={{ color: 'var(--accent-purple-light)' }}>{pwEmail}</strong> for the link.</p>
                        <button type="button" onClick={() => setPwSent(false)} style={{ fontSize: 12, color: 'var(--accent-purple-light)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>Send again</button>
                      </div>
                    ) : (
                      <>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '14px 0 10px' }}>We'll send a secure link to reset your password.</p>
                        {pwError && <p style={{ color: '#f87171', fontSize: 12, marginBottom: 10 }}>⚠️ {pwError}</p>}
                        <input value={pwEmail} onChange={e => { setPwEmail(e.target.value); setPwError(''); }} placeholder="your@email.com" type="email" style={{ ...inputStyle, marginBottom: 12 }} />
                        <button type="button" onClick={sendPasswordReset} disabled={pwLoading}
                          style={{ width: '100%', padding: '11px', borderRadius: 12, background: 'var(--gradient)', border: 'none', color: 'white', fontSize: 13, fontWeight: 700, cursor: pwLoading ? 'not-allowed' : 'pointer', opacity: pwLoading ? 0.7 : 1, fontFamily: 'Inter,sans-serif' }}>
                          {pwLoading ? 'Sending…' : '📧 Send Reset Link'}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* ── 4. LINKED ACCOUNTS ── */}
              <div style={sectionCard}>
                <SectionHeader id="linked" icon="🔗" title="Linked Accounts" subtitle={`${linkedGoogle ? 'Google ✓' : ''} ${linkedPhone ? '· Phone ✓' : ''}`.trim() || 'Link Gmail or phone'} />
                {openSection === 'linked' && (
                  <div className="section-body" style={{ borderTop: '0.5px solid var(--border-subtle)' }}>
                    <div id="rcv2-container" />
                    {linkMsg && (
                      <div style={{ margin: '12px 16px 0', padding: '10px 14px', borderRadius: 10, background: linkMsg.startsWith('✅') ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: `0.5px solid ${linkMsg.startsWith('✅') ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`, color: linkMsg.startsWith('✅') ? '#34d399' : '#f87171', fontSize: 12 }}>
                        {linkMsg}
                      </div>
                    )}

                    {/* Google */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '0.5px solid var(--border-subtle)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(234,67,53,0.1)', border: '0.5px solid rgba(234,67,53,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>G</div>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Google</p>
                          <p style={{ fontSize: 11, color: linkedGoogle ? '#34d399' : 'var(--text-muted)', margin: 0 }}>{linkedGoogle ? '✓ Linked' : 'Not linked'}</p>
                        </div>
                      </div>
                      <button type="button" onClick={linkedGoogle ? unlinkGoogle : linkGoogle} disabled={linkingGoogle}
                        style={{ padding: '7px 14px', borderRadius: 20, background: linkedGoogle ? 'rgba(239,68,68,0.1)' : 'var(--gradient)', border: linkedGoogle ? '0.5px solid rgba(239,68,68,0.3)' : 'none', color: linkedGoogle ? '#f87171' : 'white', fontSize: 12, fontWeight: 700, cursor: linkingGoogle ? 'not-allowed' : 'pointer', opacity: linkingGoogle ? 0.6 : 1, fontFamily: 'Inter,sans-serif' }}>
                        {linkingGoogle ? '…' : linkedGoogle ? 'Unlink' : 'Link'}
                      </button>
                    </div>

                    {/* Phone */}
                    <div style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: linkedPhone ? 0 : (phoneStep === 'input' ? 12 : 0) }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(59,130,246,0.1)', border: '0.5px solid rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📱</div>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Phone Number</p>
                            <p style={{ fontSize: 11, color: linkedPhone ? '#34d399' : 'var(--text-muted)', margin: 0 }}>{linkedPhone ? `✓ ${user?.phoneNumber || 'Linked'}` : 'Not linked'}</p>
                          </div>
                        </div>
                        {linkedPhone && (
                          <button type="button" onClick={unlinkPhone} disabled={phoneLoading}
                            style={{ padding: '7px 14px', borderRadius: 20, background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: 12, fontWeight: 700, cursor: phoneLoading ? 'not-allowed' : 'pointer', fontFamily: 'Inter,sans-serif' }}>
                            {phoneLoading ? '…' : 'Unlink'}
                          </button>
                        )}
                      </div>
                      {!linkedPhone && phoneStep === 'input' && (
                        <>
                          {phoneError && <p style={{ color: '#f87171', fontSize: 11, marginBottom: 8 }}>⚠️ {phoneError}</p>}
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input value={phoneNumber} onChange={e => { setPhoneNumber(e.target.value); setPhoneError(''); }} placeholder="+8801XXXXXXXXX" type="tel" style={{ ...inputStyle, flex: 1 }} />
                            <button type="button" onClick={sendPhoneLink} disabled={phoneLoading || !phoneNumber.trim()}
                              style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--gradient)', border: 'none', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: phoneLoading || !phoneNumber.trim() ? 0.6 : 1, fontFamily: 'Inter,sans-serif', flexShrink: 0 }}>
                              {phoneLoading ? '…' : 'Send OTP'}
                            </button>
                          </div>
                          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>Use international format: +8801XXXXXXXXX</p>
                        </>
                      )}
                      {!linkedPhone && phoneStep === 'otp' && (
                        <>
                          {phoneError && <p style={{ color: '#f87171', fontSize: 11, marginBottom: 8 }}>⚠️ {phoneError}</p>}
                          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Code sent to {phoneNumber}</p>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input value={phoneOtp} onChange={e => setPhoneOtp(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="6-digit code" type="text" inputMode="numeric" maxLength={6} style={{ ...inputStyle, flex: 1, textAlign: 'center', letterSpacing: 6, fontSize: 18, fontWeight: 700 }} />
                            <button type="button" onClick={verifyPhoneLink} disabled={phoneLoading || phoneOtp.length < 6}
                              style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--gradient)', border: 'none', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: phoneLoading || phoneOtp.length < 6 ? 0.6 : 1, fontFamily: 'Inter,sans-serif', flexShrink: 0 }}>
                              {phoneLoading ? '…' : 'Verify'}
                            </button>
                          </div>
                          <button type="button" onClick={() => { setPhoneStep('input'); setPhoneOtp(''); setPhoneError(''); }} style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 8, fontFamily: 'Inter,sans-serif' }}>← Change number</button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ── 5. DANGER ZONE ── */}
              <div style={{ ...sectionCard, border: '0.5px solid rgba(239,68,68,0.2)' }}>
                <SectionHeader id="danger" icon="⚠️" title="Danger Zone" subtitle="Permanently delete your account" />
                {openSection === 'danger' && (
                  <div className="section-body" style={{ padding: '14px 18px 18px', borderTop: '0.5px solid rgba(239,68,68,0.1)' }}>
                    <div style={{ background: 'rgba(239,68,68,0.06)', border: '0.5px solid rgba(239,68,68,0.15)', borderRadius: 12, padding: '14px', marginBottom: 16 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#f87171', margin: '0 0 6px' }}>⚠️ This action is permanent</p>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>Deleting your account will remove all your data including posts, followers, and messages. This cannot be undone.</p>
                    </div>
                    <button type="button" onClick={() => setShowDeleteModal(true)}
                      style={{ width: '100%', padding: '12px', borderRadius: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                      🗑️ Delete My Account
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ── Tabs ── */}
            <div style={{ display: 'flex', borderBottom: '0.5px solid rgba(255,255,255,0.06)', marginTop: 4 }}>
              {(['posts', 'liked'] as const).map(tab => (
                <button type="button" key={tab} onClick={() => setActiveTab(tab)}
                  style={{ flex: 1, padding: '12px 0', background: 'none', border: 'none', borderBottom: activeTab === tab ? '2px solid var(--accent-purple)' : '2px solid transparent', color: activeTab === tab ? 'var(--accent-purple-light)' : 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize', transition: 'all 0.2s', fontFamily: 'Inter,sans-serif' }}>
                  {tab === 'posts' ? '⚡ Posts' : '❤️ Liked'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Posts list ── */}
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 16px' }}>
          {posts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <p style={{ fontSize: 32, marginBottom: 12 }}>✨</p>
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No posts yet. Share something!</p>
            </div>
          ) : posts.map(post => (
            <div key={post.id} style={{ padding: '16px 0', borderBottom: '0.5px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
                  {profile?.photoURL
                    ? <Image src={profile.photoURL} alt="Profile" fill sizes="36px" style={{ objectFit: 'cover' }} />
                    : <div style={{ width: '100%', height: '100%', background: 'var(--gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'white' }}>{initials}</div>
                  }
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{profile?.fullName}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>@{profile?.username}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>{post.createdAt?.toDate ? new Date(post.createdAt.toDate()).toLocaleDateString() : 'Just now'}</span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 10 }}>{post.content}</p>
                  <div style={{ display: 'flex', gap: 20 }}>
                    <span style={{ fontSize: 12, color: '#f472b6' }}>❤️ {post.likes?.length || 0}</span>
                    <span style={{ fontSize: 12, color: 'var(--accent-blue-light)' }}>💬 {post.comments?.length || 0}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Delete Account Modal ── */}
      {showDeleteModal && (
        <div role="dialog" aria-modal="true" onClick={e => { if (e.target === e.currentTarget) setShowDeleteModal(false); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ width: '100%', maxWidth: 420, background: '#111118', border: '0.5px solid rgba(239,68,68,0.3)', borderRadius: 24, padding: 28, animation: 'modalUp 0.25s ease' }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 44, marginBottom: 10 }}>💀</div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: '#f87171', margin: '0 0 8px' }}>Delete Account</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>This will permanently erase your account, posts, and all data. There's no going back.</p>
            </div>
            {deleteError && <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, color: '#f87171', fontSize: 13 }}>⚠️ {deleteError}</div>}
            {user?.providerData?.some((p: any) => p.providerId === 'password') && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Confirm Password</label>
                <input type="password" value={deletePassword} onChange={e => { setDeletePassword(e.target.value); setDeleteError(''); }} placeholder="••••••••" style={inputStyle} />
              </div>
            )}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 11, color: '#f87171', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Type DELETE to confirm</label>
              <input type="text" value={deleteConfirmText} onChange={e => { setDeleteConfirmText(e.target.value); setDeleteError(''); }} placeholder="DELETE" style={{ ...inputStyle, borderColor: 'rgba(239,68,68,0.4)', textAlign: 'center', fontWeight: 700, letterSpacing: 2 }} />
            </div>
            <button type="button" onClick={handleDeleteAccount} disabled={deleteLoading || deleteConfirmText !== 'DELETE'}
              style={{ width: '100%', padding: '13px', borderRadius: 14, background: deleteConfirmText === 'DELETE' ? 'rgba(239,68,68,0.9)' : 'rgba(239,68,68,0.3)', border: 'none', color: 'white', fontSize: 14, fontWeight: 700, cursor: deleteConfirmText === 'DELETE' && !deleteLoading ? 'pointer' : 'not-allowed', fontFamily: 'Inter,sans-serif', marginBottom: 10 }}>
              {deleteLoading ? 'Deleting…' : '🗑️ Permanently Delete'}
            </button>
            <button type="button" onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(''); setDeletePassword(''); setDeleteError(''); }}
              style={{ width: '100%', padding: '12px', borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
              Cancel, keep my account
            </button>
          </div>
        </div>
      )}

      {/* ── Followers/Following Modal ── */}
      {showModal && (
        <div role="dialog" aria-modal="true" aria-label={showModal} onClick={() => setShowModal(null)} onKeyDown={e => e.key === 'Escape' && setShowModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 480, background: 'var(--bg-card)', borderRadius: '24px 24px 0 0', border: '0.5px solid var(--border)', maxHeight: '75vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'modalUp 0.25s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '0.5px solid var(--border-subtle)' }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{showModal === 'followers' ? '👥 Followers' : '➡️ Following'}</h2>
              <button type="button" onClick={() => setShowModal(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {modalLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.3)', borderTopColor: '#a78bfa', animation: 'spin 0.8s linear infinite' }} />
                </div>
              ) : modalUsers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
                  <p style={{ fontSize: 32, marginBottom: 8 }}>👤</p>
                  <p style={{ fontSize: 14 }}>No {showModal} yet</p>
                </div>
              ) : modalUsers.map((u: any) => (
                <button type="button" key={u.id} onClick={() => { setShowModal(null); push(`/profile/${u.id}`); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', cursor: 'pointer', borderBottom: '0.5px solid var(--border-subtle)', background: 'transparent', border: 'none', width: '100%', textAlign: 'left', fontFamily: 'Inter,sans-serif' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <div style={{ width: 46, height: 46, borderRadius: '50%', overflow: 'hidden', border: '1.5px solid var(--border)', flexShrink: 0 }}>
                    {u.photoURL
                      ? <Image src={u.photoURL} alt={u.fullName} fill sizes="46px" style={{ objectFit: 'cover' }} />
                      : <div style={{ width: '100%', height: '100%', background: 'var(--gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700, color: 'white' }}>{u.fullName?.[0]?.toUpperCase() || 'U'}</div>
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.fullName}</p>
                    <p style={{ fontSize: 12, color: 'var(--accent-purple-light)', margin: 0 }}>@{u.username}</p>
                  </div>
                  <span style={{ color: 'var(--text-muted)', fontSize: 18 }}>›</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Toggle component ──────────────────────────────────────────────────────────
function Toggle({ value, onChange, disabled, color = '#8b5cf6', label = 'Toggle' }: {
  value: boolean; onChange: (v: boolean) => void; disabled?: boolean; color?: string; label?: string;
}) {
  return (
    <button type="button" onClick={() => !disabled && onChange(!value)} disabled={disabled}
      role="switch" aria-checked={value} aria-label={label}
      style={{ position: 'relative', width: 46, height: 26, borderRadius: 13, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', padding: 0, flexShrink: 0, background: value ? color : 'rgba(255,255,255,0.1)', transition: 'background 0.25s', opacity: disabled ? 0.6 : 1 }}
      className="toggle-track">
      <span className="toggle-thumb"
        style={{ position: 'absolute', top: 3, left: value ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.4)', display: 'block', transition: 'left 0.25s cubic-bezier(0.34,1.56,0.64,1)' }} />
    </button>
  );
}
