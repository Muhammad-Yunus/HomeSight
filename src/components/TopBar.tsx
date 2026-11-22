import { useState } from 'react';
import {
  Lock,
  LockOpen,
  ChevronDown,
  KeyRound,
  BookOpen,
  LogOut,
  ShieldCheck,
  User,
} from 'lucide-react';
import type { AuthUser, PropertyRecord, SecurityEventRecord } from '../types/homesight';

interface TopBarProps {
  user: AuthUser;
  properties: PropertyRecord[];
  activeProperty: PropertyRecord | null;
  activeEvent: SecurityEventRecord | null;
  activeTab: 'live' | 'events' | 'people';
  autoAlertRemainingSec: number | null;
  onSelectTab: (tab: 'live' | 'events' | 'people') => void;
  onSelectProperty: (id: number) => void;
  onChangeMode: (mode: PropertyRecord['securityMode']) => void;
  onMarkSafe: () => void;
  onAlertCentre: () => void;
  onOpenApiKeys: () => void;
  onLogout: () => void;
  actionLoading: boolean;
}

const MODE_LABELS: Record<PropertyRecord['securityMode'], string> = {
  armed_night: 'Armed, night mode',
  armed_away: 'Armed, away mode',
  disarmed: 'Disarmed',
};

function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${rem.toString().padStart(2, '0')}`;
}

export function TopBar({
  user,
  properties,
  activeProperty,
  activeEvent,
  activeTab,
  autoAlertRemainingSec,
  onSelectTab,
  onSelectProperty,
  onChangeMode,
  onMarkSafe,
  onAlertCentre,
  onOpenApiKeys,
  onLogout,
  actionLoading,
}: TopBarProps) {
  const [propMenuOpen, setPropMenuOpen] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const currentMode = activeProperty?.securityMode ?? 'armed_night';
  const isArmed = currentMode !== 'disarmed';
  const isEventActive = activeEvent?.status === 'active';

  return (
    <header className="w-full border-b border-[#1D1F24] bg-[#0B0C0E] px-4 lg:px-6 py-2.5">
      <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Left Zone: Brand + Property Selector + Armed Mode */}
        <div className="flex items-center gap-3 sm:gap-5 min-w-0">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-[#181A1E] border border-[#2B2E36] flex items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4 text-white"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
              >
                <path d="M5 7h14" />
                <path d="M9 7v10" />
                <path d="M15 7v10" />
              </svg>
            </div>
            <span className="text-[15px] font-semibold tracking-tight text-white whitespace-nowrap">
              Home Sight
            </span>
          </div>

          <div className="h-4 w-px bg-[#22252C] hidden sm:block" />

          {/* Property Selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setPropMenuOpen((v) => !v);
                setModeMenuOpen(false);
                setUserMenuOpen(false);
              }}
              className="flex items-center gap-1.5 text-[13px] font-medium text-[#E5E7EB] hover:text-white transition-colors whitespace-nowrap"
            >
              <span className="truncate max-w-[145px]">
                {activeProperty?.name || '27 Alder Road'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-[#9CA3AF]" />
            </button>

            {propMenuOpen && (
              <div className="absolute left-0 mt-2 w-48 bg-[#15171B] border border-[#272A32] rounded-xl shadow-2xl py-1 z-50">
                {properties.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-[#9CA3AF]">27 Alder Road</div>
                ) : (
                  properties.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        onSelectProperty(p.id);
                        setPropMenuOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-[#1E2128] ${
                        p.id === activeProperty?.id ? 'text-white font-medium' : 'text-[#9CA3AF]'
                      }`}
                    >
                      <span>{p.name}</span>
                      {p.id === activeProperty?.id && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Security Mode Selector */}
          <div className="relative hidden md:block">
            <button
              type="button"
              onClick={() => {
                setModeMenuOpen((v) => !v);
                setPropMenuOpen(false);
                setUserMenuOpen(false);
              }}
              className="flex items-center gap-1.5 text-[13px] text-[#9CA3AF] hover:text-[#E5E7EB] transition-colors whitespace-nowrap"
            >
              {isArmed ? (
                <Lock className="w-3.5 h-3.5 text-[#34D399]" />
              ) : (
                <LockOpen className="w-3.5 h-3.5 text-[#9CA3AF]" />
              )}
              <span>{MODE_LABELS[currentMode]}</span>
            </button>

            {modeMenuOpen && (
              <div className="absolute left-0 mt-2 w-48 bg-[#15171B] border border-[#272A32] rounded-xl shadow-2xl py-1 z-50">
                {(['armed_night', 'armed_away', 'disarmed'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      onChangeMode(mode);
                      setModeMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-[#1E2128] ${
                      currentMode === mode ? 'text-white font-medium' : 'text-[#9CA3AF]'
                    }`}
                  >
                    <span>{MODE_LABELS[mode]}</span>
                    {currentMode === mode && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Center Zone: Segmented Tabs (Live | Events | People) */}
        <nav className="flex items-center p-1 bg-[#14161A] border border-[#22252C] rounded-xl order-3 sm:order-2 w-full sm:w-auto justify-center">
          {(['live', 'events', 'people'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => onSelectTab(tab)}
              className={`px-4 py-1.5 text-[13px] font-medium rounded-lg capitalize transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? 'bg-[#252830] text-white shadow-sm'
                  : 'text-[#9CA3AF] hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>

        {/* Right Zone: Auto-alert Countdown + Mark as safe + Alert monitoring centre + Menu */}
        <div className="flex items-center gap-2.5 sm:gap-3 order-2 sm:order-3 ml-auto sm:ml-0">
          {isEventActive && autoAlertRemainingSec !== null ? (
            <div className="hidden lg:flex items-center gap-1.5 mr-1 whitespace-nowrap">
              <span className="text-[13px] text-[#9CA3AF]">Auto-alert in</span>
              <span className="text-[15px] font-semibold text-[#F25C19] tabular-nums">
                {formatCountdown(autoAlertRemainingSec)}
              </span>
            </div>
          ) : activeEvent?.status === 'marked_safe' ? (
            <div className="hidden lg:flex items-center gap-1.5 mr-1 text-[13px] text-[#34D399] whitespace-nowrap">
              <ShieldCheck className="w-4 h-4" />
              <span>Marked safe</span>
            </div>
          ) : activeEvent?.status === 'alert_sent' ? (
            <div className="hidden lg:flex items-center gap-1.5 mr-1 text-[13px] text-[#F25C19] font-medium whitespace-nowrap">
              <span>Monitoring alerted</span>
            </div>
          ) : null}

          <button
            type="button"
            disabled={!isEventActive || actionLoading}
            onClick={onMarkSafe}
            className="px-3.5 py-1.5 text-[13px] font-medium rounded-lg bg-[#16181C] border border-[#2A2D35] text-[#E5E7EB] hover:bg-[#1E2128] hover:text-white disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            Mark as safe
          </button>

          <button
            type="button"
            disabled={!activeEvent || activeEvent.status === 'alert_sent' || actionLoading}
            onClick={onAlertCentre}
            className="px-3.5 py-1.5 text-[13px] font-semibold rounded-lg bg-[#F25C19] hover:bg-[#E04E0D] text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            Alert monitoring centre
          </button>

          {/* Discreet Operator Menu (Swagger Docs, API Keys, Logout) */}
          <div className="relative">
            <button
              type="button"
              aria-label="Operator settings and API menu"
              onClick={() => {
                setUserMenuOpen((v) => !v);
                setPropMenuOpen(false);
                setModeMenuOpen(false);
              }}
              className="w-8 h-8 rounded-lg bg-[#16181C] border border-[#272A32] hover:border-[#3A3E4A] flex items-center justify-center text-[#9CA3AF] hover:text-white transition-colors"
            >
              <User className="w-4 h-4" />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-[#15171B] border border-[#272A32] rounded-xl shadow-2xl py-1.5 z-50">
                <div className="px-3 py-2 border-b border-[#22252C]">
                  <div className="text-xs font-semibold text-white truncate">{user.name}</div>
                  <div className="text-[11px] text-[#9CA3AF] truncate">{user.email}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    onOpenApiKeys();
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-[#E5E7EB] hover:bg-[#1E2128] flex items-center gap-2"
                >
                  <KeyRound className="w-3.5 h-3.5 text-[#F25C19]" />
                  <span>Ingest API Keys</span>
                </button>
                <a
                  href="/api-docs"
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setUserMenuOpen(false)}
                  className="w-full text-left px-3 py-2 text-xs text-[#E5E7EB] hover:bg-[#1E2128] flex items-center gap-2"
                >
                  <BookOpen className="w-3.5 h-3.5 text-[#9CA3AF]" />
                  <span>Swagger API Docs</span>
                </a>
                <div className="my-1 border-t border-[#22252C]" />
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    onLogout();
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-[#F87171] hover:bg-[#1E2128] flex items-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
