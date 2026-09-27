import { Alert } from 'react-native';
import i18n from '../i18n';

/**
 * A system notice with one acknowledgement button in the app language. Without explicit buttons,
 * React Native labels the button with an English `OK` on both platforms (device review 2026-09-27:
 * a Chinese pairing failure ended in `OK`).
 */
export function showNoticeAlert(title: string, message?: string): void {
  Alert.alert(title, message, [{ text: i18n.t('OK', { ns: 'common' }) }]);
}
