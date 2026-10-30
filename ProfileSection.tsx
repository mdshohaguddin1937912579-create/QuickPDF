import {
  AlertCircle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Download,
  Loader2,
  Pencil,
  Trash2,
  Upload,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import {
  processProfileImageFile,
  UserProfile,
} from '../services/profileStorage';
import { PageSizePreset } from '../types/pdfTools';
import { ProfileAvatar } from './ProfileAvatar';

interface ProfileSectionProps {
  profile: UserProfile;
  sessionFilesCount: number;
  onSaveProfile: (nextProfile: UserProfile) => boolean;
  onBackToTools: () => void;
}

export function ProfileSection({
  profile,
  sessionFilesCount,
  onSaveProfile,
  onBackToTools,
}: ProfileSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const [displayName, setDisplayName] = useState(profile.displayName);
  const [roleTitle, setRoleTitle] = useState(profile.roleTitle);
  const [email, setEmail] = useState(profile.email);
  const [bio, setBio] = useState(profile.bio);
  const [defaultPageSize, setDefaultPageSize] = useState<
    PageSizePreset.A4 | PageSizePreset.Letter
  >(profile.defaultPageSize);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isEditing) {
      setDisplayName(profile.displayName);
      setRoleTitle(profile.roleTitle);
      setEmail(profile.email);
      setBio(profile.bio);
      setDefaultPageSize(profile.defaultPageSize);
    }
  }, [profile, isEditing]);

  const triggerFilePicker = () => {
    setErrorMessage(null);
    fileInputRef.current?.click();
  };

  const handleAvatarFileSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setErrorMessage(null);
    setStatusNotice(null);
    setIsUploadingAvatar(true);

    try {
      const hadExistingAvatar = Boolean(profile.avatarDataUrl);
      const dataUrl = await processProfileImageFile(file);
      const updated: UserProfile = {
        ...profile,
        avatarDataUrl: dataUrl,
        updatedAt: Date.now(),
      };
      const saved = onSaveProfile(updated);
      if (!saved) {
        setErrorMessage(
          'Could not save profile picture to browser storage. Please free up local site storage and try again.'
        );
      } else {
        setStatusNotice(
          hadExistingAvatar
            ? 'Profile picture updated and saved on this device.'
            : 'Profile picture uploaded and saved on this device.'
        );
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Unable to load the selected image file.'
      );
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = () => {
    setErrorMessage(null);
    setStatusNotice(null);

    const updated: UserProfile = {
      ...profile,
      avatarDataUrl: null,
      updatedAt: Date.now(),
    };
    const saved = onSaveProfile(updated);
    if (!saved) {
      setErrorMessage('Could not update browser storage.');
    } else {
      setStatusNotice('Profile picture removed.');
    }
  };

  const handleStartEdit = () => {
    setErrorMessage(null);
    setStatusNotice(null);
    setDisplayName(profile.displayName);
    setRoleTitle(profile.roleTitle);
    setEmail(profile.email);
    setBio(profile.bio);
    setDefaultPageSize(profile.defaultPageSize);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setErrorMessage(null);
    setDisplayName(profile.displayName);
    setRoleTitle(profile.roleTitle);
    setEmail(profile.email);
    setBio(profile.bio);
    setDefaultPageSize(profile.defaultPageSize);
    setIsEditing(false);
  };

  const handleSaveDetails = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusNotice(null);

    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setErrorMessage('Please enter a display name for your profile.');
      return;
    }

    const updated: UserProfile = {
      ...profile,
      displayName: trimmedName.slice(0, 60),
      roleTitle: roleTitle.trim().slice(0, 60),
      email: email.trim().slice(0, 120),
      bio: bio.trim().slice(0, 240),
      defaultPageSize,
      updatedAt: Date.now(),
    };

    const saved = onSaveProfile(updated);
    if (!saved) {
      setErrorMessage(
        'Could not save profile changes to local browser storage.'
      );
      return;
    }

    setIsEditing(false);
    setStatusNotice('Profile details saved on this device.');
  };

  const hasPhoto = Boolean(profile.avatarDataUrl);

  return (
    <section
      aria-label="User profile"
      className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10"
    >
      {/* Back link & Header */}
      <div className="mb-6">
        <button
          type="button"
          onClick={onBackToTools}
          className="inline-flex items-center gap-1.5 min-h-[44px] text-sm font-medium text-slate-600 hover:text-blue-700 transition-colors mb-2"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back to All Tools
        </button>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          Your Profile
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Manage your profile picture, display details, and PDF preferences. Saved locally in your browser so your settings remain when you reopen QuickPDF.
        </p>
      </div>

      {/* Feedback Alerts */}
      {errorMessage && (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3 text-sm text-red-800"
        >
          <AlertCircle
            className="w-5 h-5 text-red-600 shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <span>{errorMessage}</span>
        </div>
      )}

      {statusNotice && !errorMessage && (
        <div
          role="status"
          className="mb-5 rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3 flex items-center gap-2.5 text-sm text-blue-900"
        >
          <CheckCircle2
            className="w-4 h-4 text-blue-600 shrink-0"
            aria-hidden="true"
          />
          <span>{statusNotice}</span>
        </div>
      )}

      {/* Single Clean White Surface divided into logical sections */}
      <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-200">
        {/* Section 1: Profile Picture Upload / Change / Remove */}
        <div className="p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            <ProfileAvatar profile={profile} size="lg" />

            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-slate-900 truncate">
                {profile.displayName}
              </h2>
              <p className="text-sm text-slate-600 mt-0.5">
                {profile.roleTitle
                  ? profile.roleTitle
                  : 'Local QuickPDF Workspace'}
              </p>
              <p className="text-xs text-slate-500 mt-1.5">
                {hasPhoto
                  ? 'Custom profile picture active in header · Stored on this device'
                  : 'Upload a JPG, PNG, or WebP picture to personalize your app header'}
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/bmp"
                onChange={handleAvatarFileSelected}
                className="sr-only"
                aria-label="Select profile picture image"
              />

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={triggerFilePicker}
                  disabled={isUploadingAvatar}
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
                >
                  {isUploadingAvatar ? (
                    <>
                      <Loader2
                        className="w-4 h-4 animate-spin"
                        aria-hidden="true"
                      />
                      Processing image...
                    </>
                  ) : hasPhoto ? (
                    <>
                      <Camera className="w-4 h-4" aria-hidden="true" />
                      Change Picture
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" aria-hidden="true" />
                      Upload Picture
                    </>
                  )}
                </button>

                {hasPhoto && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    disabled={isUploadingAvatar}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-red-50 hover:border-red-200 text-slate-700 hover:text-red-700 disabled:opacity-60 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                    Remove Picture
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Profile Details & Edit Option */}
        <div className="p-6 sm:p-8">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Profile Details
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Personalize your name, role, and default document page format.
              </p>
            </div>

            {!isEditing && (
              <button
                type="button"
                onClick={handleStartEdit}
                className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <Pencil className="w-4 h-4 text-blue-600" aria-hidden="true" />
                Edit Profile
              </button>
            )}
          </div>

          {isEditing ? (
            <form onSubmit={handleSaveDetails} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="profile-display-name"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Display Name <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="profile-display-name"
                    type="text"
                    required
                    maxLength={60}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Alex Morgan"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="profile-role-title"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Role / Title
                  </label>
                  <input
                    id="profile-role-title"
                    type="text"
                    maxLength={60}
                    value={roleTitle}
                    onChange={(e) => setRoleTitle(e.target.value)}
                    placeholder="e.g. Project Coordinator"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="profile-email"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Email (saved locally only)
                  </label>
                  <input
                    id="profile-email"
                    type="email"
                    maxLength={120}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="profile-page-size"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Default PDF Page Size
                  </label>
                  <select
                    id="profile-page-size"
                    value={defaultPageSize}
                    onChange={(e) =>
                      setDefaultPageSize(
                        e.target.value === PageSizePreset.Letter
                          ? PageSizePreset.Letter
                          : PageSizePreset.A4
                      )
                    }
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value={PageSizePreset.A4}>
                      A4 (210 × 297 mm)
                    </option>
                    <option value={PageSizePreset.Letter}>
                      US Letter (8.5 × 11 in)
                    </option>
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="profile-bio"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Workspace Note / Bio
                </label>
                <textarea
                  id="profile-bio"
                  rows={2}
                  maxLength={240}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Optional note for your QuickPDF workspace..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
                >
                  Save Profile
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 text-sm">
              <div>
                <dt className="text-xs font-medium text-slate-500">
                  Display Name
                </dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {profile.displayName}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-medium text-slate-500">
                  Role / Title
                </dt>
                <dd
                  className={`mt-1 ${
                    profile.roleTitle
                      ? 'font-medium text-slate-900'
                      : 'text-slate-400'
                  }`}
                >
                  {profile.roleTitle || 'Not set'}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-medium text-slate-500">Email</dt>
                <dd
                  className={`mt-1 break-all ${
                    profile.email
                      ? 'font-medium text-slate-900'
                      : 'text-slate-400'
                  }`}
                >
                  {profile.email || 'Not set'}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-medium text-slate-500">
                  Default PDF Page Size
                </dt>
                <dd className="mt-1 font-medium text-slate-900">
                  {profile.defaultPageSize === PageSizePreset.Letter
                    ? 'US Letter (8.5 × 11 in)'
                    : 'A4 (210 × 297 mm)'}
                </dd>
              </div>

              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-slate-500">
                  Workspace Note / Bio
                </dt>
                <dd
                  className={`mt-1 ${
                    profile.bio ? 'text-slate-800' : 'text-slate-400'
                  }`}
                >
                  {profile.bio || 'Not set'}
                </dd>
              </div>
            </dl>
          )}
        </div>

        {/* Section 3: Project Source Export */}
        <div className="p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Project Source Archive
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Download the complete QuickPDF source code and configuration files as a ZIP archive.
            </p>
          </div>
          <a
            href="/QuickPDF-Project.zip"
            download="QuickPDF-Project.zip"
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-blue-700 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            Download QuickPDF-Project.zip
          </a>
        </div>

        {/* Section 4: Device Storage & Session Info */}
        <div className="px-6 py-4 sm:px-8 bg-slate-50/70 rounded-b-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            Saved privately in local browser storage · Zero account or server upload required
          </span>
          <span className="font-mono tabular-nums text-slate-600 shrink-0">
            Session conversions: {sessionFilesCount}
          </span>
        </div>
      </div>
    </section>
  );
}
