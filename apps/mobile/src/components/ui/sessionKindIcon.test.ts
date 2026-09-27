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

import { resolveSessionChannelIcon, resolveSessionKindIcon, resolveSessionTileIcon } from './sessionKindIcon';

jest.mock('lucide-react-native', () => ({
  Bot: 'Bot',
  Clock3: 'Clock3',
  Gamepad2: 'Gamepad2',
  MessageCircle: 'MessageCircle',
  MessageSquare: 'MessageSquare',
  Radio: 'Radio',
  Send: 'Send',
  Slack: 'Slack',
  Terminal: 'Terminal',
  UsersRound: 'UsersRound',
}));

describe('resolveSessionKindIcon', () => {
  it.each([
    ['main', MessageCircle],
    ['channel', Radio],
    ['direct', MessageCircle],
    ['group', UsersRound],
    ['subagent', Bot],
    ['cron', Clock3],
    ['other', MessageCircle],
  ] as const)('maps %s sessions to the canonical icon', (kind, expected) => {
    expect(resolveSessionKindIcon(kind)).toBe(expected);
  });
});

describe('resolveSessionChannelIcon', () => {
  it.each([
    ['Slack', Slack],
    [' discord ', Gamepad2],
    ['telegram', Send],
    ['WhatsApp', MessageCircle],
    ['lark', MessageSquare],
    ['feishu', MessageSquare],
    ['matrix', Radio],
    [null, Radio],
    [undefined, Radio],
  ])('maps channel %p to a monochrome glyph', (channel, expected) => {
    expect(resolveSessionChannelIcon(channel)).toBe(expected);
  });
});

describe('resolveSessionTileIcon', () => {
  it.each([
    // Hermes, Codex, Pi and Claude Code report every extra conversation as direct.
    [{ kind: 'direct' }, MessageCircle],
    [{ kind: 'direct', channel: '' }, MessageCircle],
    [{ kind: 'direct', channel: 'cli' }, MessageCircle],
    [{ kind: 'direct', channel: 'Telegram' }, Send],
    [{ kind: 'group' }, UsersRound],
    [{ kind: 'group', channel: 'telegram' }, UsersRound],
    [{ kind: 'channel', channel: 'slack' }, Slack],
    [{ kind: 'channel', channel: 'ops' }, Radio],
    [{ kind: 'direct', project: { id: 'p' } }, Terminal],
    [{ kind: 'other', project: { id: 'p' } }, Terminal],
    [{ kind: 'other' }, MessageCircle],
    [{ kind: 'cron', project: { id: 'p' } }, Clock3],
    [{ kind: 'subagent' }, Bot],
  ] as const)('picks the conversation glyph for %p', (session, expected) => {
    expect(resolveSessionTileIcon(session)).toBe(expected);
  });
});
