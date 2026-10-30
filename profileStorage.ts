import { PageSizePreset } from '../types/pdfTools';

export interface UserProfile {
  displayName: string;
  roleTitle: string;
  email: string;
  bio: string;
  defaultPageSize: PageSizePreset.A4 | PageSizePreset.Letter;
  avatarDataUrl: string | null;
  updatedAt: number;
}

const PROFILE_STORAGE_KEY = 'quickpdf_user_profile_v1';
const AVATAR_OUTPUT_PX = 320;
const MAX_RAW_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MB raw input ceiling

export const DEFAULT_USER_PROFILE: UserProfile = {
  displayName: 'QuickPDF User',
  roleTitle: '',
  email: '',
  bio: '',
  defaultPageSize: PageSizePreset.A4,
  avatarDataUrl: null,
  updatedAt: 0,
};

export function loadUserProfile(): UserProfile {
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_USER_PROFILE };
    }
    const parsed = JSON.parse(raw) as Partial<UserProfile> | null;
    if (!parsed || typeof parsed !== 'object') {
      return { ...DEFAULT_USER_PROFILE };
    }

    const displayName =
      typeof parsed.displayName === 'string' && parsed.displayName.trim().length > 0
        ? parsed.displayName.trim().slice(0, 60)
        : DEFAULT_USER_PROFILE.displayName;

    const roleTitle =
      typeof parsed.roleTitle === 'string' ? parsed.roleTitle.trim().slice(0, 60) : '';

    const email =
      typeof parsed.email === 'string' ? parsed.email.trim().slice(0, 120) : '';

    const bio =
      typeof parsed.bio === 'string' ? parsed.bio.trim().slice(0, 240) : '';

    const defaultPageSize =
      parsed.defaultPageSize === PageSizePreset.Letter
        ? PageSizePreset.Letter
        : PageSizePreset.A4;

    const avatarDataUrl =
      typeof parsed.avatarDataUrl === 'string' &&
      parsed.avatarDataUrl.startsWith('data:image/')
        ? parsed.avatarDataUrl
        : null;

    const updatedAt =
      typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt)
        ? parsed.updatedAt
        : 0;

    return {
      displayName,
      roleTitle,
      email,
      bio,
      defaultPageSize,
      avatarDataUrl,
      updatedAt,
    };
  } catch {
    return { ...DEFAULT_USER_PROFILE };
  }
}

export function saveUserProfile(profile: UserProfile): boolean {
  try {
    const sanitized: UserProfile = {
      displayName: profile.displayName.trim().slice(0, 60) || DEFAULT_USER_PROFILE.displayName,
      roleTitle: profile.roleTitle.trim().slice(0, 60),
      email: profile.email.trim().slice(0, 120),
      bio: profile.bio.trim().slice(0, 240),
      defaultPageSize:
        profile.defaultPageSize === PageSizePreset.Letter
          ? PageSizePreset.Letter
          : PageSizePreset.A4,
      avatarDataUrl:
        profile.avatarDataUrl && profile.avatarDataUrl.startsWith('data:image/')
          ? profile.avatarDataUrl
          : null,
      updatedAt: Date.now(),
    };
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(sanitized));
    return true;
  } catch {
    return false;
  }
}

export function getInitials(displayName: string): string {
  const cleaned = displayName.trim();
  if (!cleaned) return 'QP';
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export async function processProfileImageFile(file: File): Promise<string> {
  if (!file || file.size === 0) {
    throw new Error('The selected image file is empty (0 bytes).');
  }

  if (file.size > MAX_RAW_IMAGE_BYTES) {
    throw new Error('Please choose an image smaller than 25 MB.');
  }

  const lowerName = file.name.toLowerCase();
  const hasValidMime = file.type.startsWith('image/');
  const hasValidExt = /\.(jpe?g|png|webp|gif|bmp)$/i.test(lowerName);

  if (!hasValidMime && !hasValidExt) {
    throw new Error('Please select a valid image file (JPG, PNG, WebP, GIF, or BMP).');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () =>
        reject(
          new Error(
            'Could not decode this image file. Please select a standard JPG, PNG, or WebP picture.'
          )
        );
      element.src = objectUrl;
    });

    const natW = img.naturalWidth || img.width;
    const natH = img.naturalHeight || img.height;

    if (!natW || !natH) {
      throw new Error('The selected image has invalid dimensions.');
    }

    // Center-crop square and resize to 320x320 for crisp Retina header & profile display
    const cropSize = Math.min(natW, natH);
    const sx = Math.floor((natW - cropSize) / 2);
    const sy = Math.floor((natH - cropSize) / 2);

    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_OUTPUT_PX;
    canvas.height = AVATAR_OUTPUT_PX;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Browser canvas context is unavailable.');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // Paint clean white backing in case source PNG/WebP has transparent regions
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, AVATAR_OUTPUT_PX, AVATAR_OUTPUT_PX);
    ctx.drawImage(
      img,
      sx,
      sy,
      cropSize,
      cropSize,
      0,
      0,
      AVATAR_OUTPUT_PX,
      AVATAR_OUTPUT_PX
    );

    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    if (!dataUrl.startsWith('data:image/')) {
      throw new Error('Failed to encode profile picture.');
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
