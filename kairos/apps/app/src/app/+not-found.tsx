import { Redirect } from 'expo-router';

/** Any unknown path (including the address a host page serves us from) starts the app at its root. */
export default function NotFound() {
  return <Redirect href="/" />;
}
