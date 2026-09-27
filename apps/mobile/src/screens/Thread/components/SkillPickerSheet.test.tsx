import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { AgentAdapter, SkillStatusReport } from '@clawket/agent-protocol';
import { SkillPickerSheet } from './SkillPickerSheet';

let mockAfterClose: (() => void) | undefined;
jest.mock('react-native', () => {
  const R = require('react'); const host = (name: string) => ({ children, ...props }: any) => R.createElement(name, props, children);
  return { Platform: { OS: 'ios' }, View: host('View'), Text: host('Text'), StyleSheet: { create: (v: unknown) => v } };
});
jest.mock('../../../theme', () => ({ useAppTheme: () => ({ theme: { colors: { inkSecondary: '#555' } } }) }));
jest.mock('@gorhom/bottom-sheet', () => ({ BottomSheetScrollView: ({ children }: any) => children }));
jest.mock('lucide-react-native', () => ({ SlidersHorizontal: () => null }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../../../components/ui/Sheet', () => ({ Sheet: ({ children, onAfterClose }: any) => { mockAfterClose = onAfterClose; return children; } }));
jest.mock('../../../components/ui/SheetHeaderButton', () => ({ SheetHeaderButton: () => null }));
jest.mock('../../../components/ui/SearchInput', () => ({ SearchInput: () => null }));
jest.mock('../../../components/ui/Banner', () => ({ Banner: () => null }));
jest.mock('../../../components/ui/ListSkeleton', () => ({ ListSkeleton: (props: any) => require('react').createElement('ListSkeleton', props) }));
jest.mock('../../../components/ui/SettingsGroup', () => ({ SettingsDivider: () => null, SettingsRow: (props: any) => require('react').createElement('Pressable', props) }));
const report = (name: string): SkillStatusReport => ({ workspaceDir: name, managedSkillsDir: '', skills: [{ name, skillKey: name, invocation: `$${name}`, eligible: true, disabled: false, blockedByAllowlist: false }] } as SkillStatusReport);

it('shows list-shaped placeholders until the first answer instead of flashing an empty state', async () => {
  let resolve!: (value: SkillStatusReport) => void;
  const status = jest.fn(() => new Promise<SkillStatusReport>(done => { resolve = done; }));
  const adapter = { connection: { id: 'qa' }, management: { skills: { status } } } as unknown as AgentAdapter;
  const view = render(<SkillPickerSheet visible adapter={adapter} agentId="main" online onClose={jest.fn()} onSelect={jest.fn()} onManage={jest.fn()} />);
  expect(view.getByTestId('skill-picker-loading')).toBeTruthy();
  expect(view.queryByText('No available skills')).toBeNull();
  await act(async () => resolve({ workspaceDir: '', managedSkillsDir: '', skills: [] } as unknown as SkillStatusReport));
  expect(view.queryByTestId('skill-picker-loading')).toBeNull();
  expect(view.getByText('No available skills')).toBeTruthy();
});

it('fences late skill results and closed-sheet selection when the chat changes', async () => {
  let resolveFirst!: (value: SkillStatusReport) => void;
  const status = jest.fn().mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; })).mockResolvedValue(report('second-project'));
  const adapter = { connection: { id: 'qa' }, management: { skills: { status } } } as unknown as AgentAdapter;
  const onSelect = jest.fn(); const props = { visible: true, adapter, agentId: 'codex', online: true, onClose: jest.fn(), onSelect, onManage: jest.fn() };
  const view = render(<SkillPickerSheet {...props} sessionKey="one" />);
  expect(status).toHaveBeenLastCalledWith('codex', { sessionKey: 'one' });
  view.rerender(<SkillPickerSheet {...props} sessionKey="two" />);
  await waitFor(() => expect(view.getByTestId('use-skill-second-project')).toBeTruthy());
  await act(async () => resolveFirst(report('old-project')));
  expect(view.queryByTestId('use-skill-old-project')).toBeNull();
  fireEvent.press(view.getByTestId('use-skill-second-project'));
  view.rerender(<SkillPickerSheet {...props} visible={false} sessionKey="three" />);
  act(() => mockAfterClose?.());
  expect(onSelect).not.toHaveBeenCalled();
});
