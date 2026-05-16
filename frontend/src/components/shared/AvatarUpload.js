import React, { useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import Avatar from './Avatar';

export default function AvatarUpload({ size = 80 }) {
  const { user, updateAvatar } = useAuth();
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
    if (file.size > 1024 * 1024) { toast.error('Image must be under 1MB'); return; }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result;
      try {
        await api.put('/auth/avatar', { avatar: base64 });
        updateAvatar(base64);
        toast.success('Profile photo updated!');
      } catch (err) {
        toast.error(err.response?.data?.message || 'Upload failed');
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block', cursor: 'pointer' }}
      onClick={() => fileRef.current?.click()}>
      <Avatar user={user} size={size} />
      <div style={{
        position: 'absolute', bottom: 0, right: 0, width: 24, height: 24,
        background: 'var(--accent)', borderRadius: '50%', display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontSize: 13,
        border: '2px solid var(--bg2)', cursor: 'pointer'
      }}>📷</div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
    </div>
  );
}
