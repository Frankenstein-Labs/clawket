import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AttachmentCapabilities } from '@clawket/agent-protocol';
import type { PastedFile } from '../components/ui/PasteCapableTextInput';
import type { PendingImage } from '../types/chat';
import {
  PASTED_ATTACHMENT_MAX_MIB,
  preparePastedAttachments,
  type PastedAttachmentRejection,
} from './preparePastedAttachments';

type Params = {
  pendingAttachments: readonly PendingImage[];
  setPendingAttachments: Dispatch<SetStateAction<PendingImage[]>>;
  maxAttachments: number;
  capabilities: AttachmentCapabilities | null | undefined;
  isCurrentAttachmentScope?: () => boolean;
};
const alwaysCurrent = () => true;

export type ChatPasteAttachmentBindings = {
  onPasteFiles: (files: readonly PastedFile[]) => Promise<void>;
  onPasteFailed: () => void;
};

export function useChatPasteAttachments({
  pendingAttachments,
  setPendingAttachments,
  maxAttachments,
  capabilities,
  isCurrentAttachmentScope = alwaysCurrent,
}: Params): ChatPasteAttachmentBindings {
  const { t } = useTranslation(['chat', 'common']);
  const pendingRef = useRef(pendingAttachments);
  const pasteQueueRef = useRef({ isCurrentAttachmentScope, promise: Promise.resolve() });
  if (pasteQueueRef.current.isCurrentAttachmentScope !== isCurrentAttachmentScope) {
    pasteQueueRef.current = { isCurrentAttachmentScope, promise: Promise.resolve() };
  }
  pendingRef.current = pendingAttachments;

  const onPasteFailed = useCallback(() => {
    if (!isCurrentAttachmentScope()) return;
    Alert.alert(
      t('Unable to attach file', { ns: 'chat' }),
      t('Please try again later.', { ns: 'common' }),
    );
  }, [isCurrentAttachmentScope, t]);

  const showRejection = useCallback((rejection: PastedAttachmentRejection) => {
    if (rejection === 'limit') {
      Alert.alert(
        t('Attachment limit reached', { ns: 'chat' }),
        t('You can attach up to {{count}} files.', {
          ns: 'chat',
          count: maxAttachments,
        }),
      );
      return;
    }
    if (rejection === 'too_large') {
      Alert.alert(
        t('Message too large to send', { ns: 'chat' }),
        t('Choose a file no larger than {{size}} MB.', {
          ns: 'chat',
          size: PASTED_ATTACHMENT_MAX_MIB,
        }),
      );
      return;
    }
    if (rejection === 'unsupported') {
      Alert.alert(t('Unable to attach file', { ns: 'chat' }));
      return;
    }
    onPasteFailed();
  }, [maxAttachments, onPasteFailed, t]);

  const processPasteFiles = useCallback(async (files: readonly PastedFile[]) => {
    if (!isCurrentAttachmentScope()) return;
    try {
      const result = await preparePastedAttachments({
        files,
        pendingCount: pendingRef.current.length,
        maxAttachments,
        capabilities,
      });
      if (!isCurrentAttachmentScope()) return;
      if (result.accepted.length > 0) {
        const remainingSlots = Math.max(0, maxAttachments - pendingRef.current.length);
        const accepted = result.accepted.slice(0, remainingSlots);
        if (accepted.length > 0) {
          pendingRef.current = [...pendingRef.current, ...accepted];
          setPendingAttachments((previous) => (
            [...previous, ...accepted].slice(0, maxAttachments)
          ));
        }
        if (accepted.length < result.accepted.length && !result.rejection) {
          showRejection('limit');
        }
      }
      if (result.rejection) {
        showRejection(result.rejection);
      }
    } catch {
      onPasteFailed();
    }
  }, [capabilities, isCurrentAttachmentScope, maxAttachments, onPasteFailed, setPendingAttachments, showRejection]);

  const onPasteFiles = useCallback((files: readonly PastedFile[]) => {
    if (!isCurrentAttachmentScope() || files.length === 0) return Promise.resolve();
    const queuedFiles = [...files];
    const queue = pasteQueueRef.current;
    const task = queue.promise.then(() => processPasteFiles(queuedFiles));
    // Keep later pastes moving even if an unexpected task error escapes.
    queue.promise = task.catch(() => undefined);
    return task;
  }, [isCurrentAttachmentScope, processPasteFiles]);

  return { onPasteFiles, onPasteFailed };
}
