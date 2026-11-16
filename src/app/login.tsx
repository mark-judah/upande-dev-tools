import { router } from 'expo-router';
import { LoginFlow } from '@/core/auth/LoginFlow';

/**
 * Sign in. Everything (the saved-sites list, adding a site, credentials, the
 * fingerprint card) lives in LoginFlow so the same flow also runs as a modal
 * from the sidebar's site switcher, where a session already exists and the
 * auth gate would bounce this route.
 */
export default function Login() {
  return <LoginFlow mode="screen" onDone={() => router.replace('/')} />;
}
