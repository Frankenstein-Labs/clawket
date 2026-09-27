import type { SessionKind } from '@clawket/agent-protocol';
import type { LucideIcon } from 'lucide-react-native';
import {
  Bot,
  Clock3,
  Gamepad2,
  MessageCircle,
  MessageSquare,
  Radio,
  Send,
  Slack,
  Terminal,
  UsersRound,
} from 'lucide-react-native';

/** Only a group has people in it; a direct or other session is one conversation. */
export function resolveSessionKindIcon(kind: SessionKind): LucideIcon {
  if (kind === 'channel') return Radio;
  if (kind === 'subagent') return Bot;
  if (kind === 'cron') return Clock3;
  if (kind === 'group') return UsersRound;
  return MessageCircle;
}

function resolveKnownChannelIcon(channel: string | null | undefined): LucideIcon | null {
  const normalized = channel?.trim().toLowerCase();
  if (normalized === 'slack') return Slack;
  if (normalized === 'discord') return Gamepad2;
  if (normalized === 'telegram') return Send;
  if (normalized === 'whatsapp') return MessageCircle;
  if (normalized === 'feishu' || normalized === 'lark') return MessageSquare;
  return null;
}

/** Monochrome glyph for a channel session tile; unknown platforms fall back to the channel icon. */
export function resolveSessionChannelIcon(channel: string | null | undefined): LucideIcon {
  return resolveKnownChannelIcon(channel) ?? Radio;
}

/**
 * The glyph that stands for a conversation in a Session Panel tile and on a
 * roster conversation badge. Project conversations are Terminal, channels
 * their platform, groups UsersRound. A direct session is one conversation:
 * Hermes, Codex, Pi and Claude Code report every session besides main as
 * direct, so it reads as a speech bubble — never a group (owner feedback
 * 2026-09-27) — unless it arrived through a known messaging platform.
 */
export function resolveSessionTileIcon(session: Readonly<{
  kind: SessionKind;
  channel?: string | null;
  project?: unknown;
}>): LucideIcon {
  if (session.project && (session.kind === 'direct' || session.kind === 'other')) return Terminal;
  if (session.kind === 'channel') return resolveSessionChannelIcon(session.channel);
  if (session.kind === 'direct') return resolveKnownChannelIcon(session.channel) ?? MessageCircle;
  return resolveSessionKindIcon(session.kind);
}
