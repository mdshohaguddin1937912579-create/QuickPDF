import { User } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  DEFAULT_USER_PROFILE,
  getInitials,
  UserProfile,
} from '../services/profileStorage';

interface ProfileAvatarProps {
  profile: UserProfile;
  size?: 'xs' | 'sm' | 'lg';
}

export function ProfileAvatar({ profile, size = 'sm' }: ProfileAvatarProps) {
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [profile.avatarDataUrl]);

  const sizeClasses =
    size === 'lg'
      ? 'w-24 h-24 sm:w-28 sm:h-28 text-2xl'
      : size === 'xs'
      ? 'w-5 h-5 text-[9px]'
      : 'w-8 h-8 text-xs';

  const iconClasses =
    size === 'lg' ? 'w-10 h-10' : size === 'xs' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  const showPhoto = Boolean(profile.avatarDataUrl) && !imageError;
  const hasCustomName =
    profile.displayName.trim().length > 0 &&
    profile.displayName.trim() !== DEFAULT_USER_PROFILE.displayName;

  return (
    <div
      className={`${sizeClasses} relative rounded-full overflow-hidden shrink-0 flex items-center justify-center font-bold select-none ${
        showPhoto
          ? 'bg-slate-100 ring-1 ring-slate-200'
          : 'bg-blue-100 text-blue-700 ring-1 ring-blue-200'
      }`}
    >
      {showPhoto && profile.avatarDataUrl ? (
        <img
          src={profile.avatarDataUrl}
          alt={`${profile.displayName || 'User'} profile picture`}
          referrerPolicy="no-referrer"
          onError={() => setImageError(true)}
          className="w-full h-full object-cover"
        />
      ) : hasCustomName ? (
        <span>{getInitials(profile.displayName)}</span>
      ) : (
        <User className={iconClasses} aria-hidden="true" />
      )}
    </div>
  );
}
